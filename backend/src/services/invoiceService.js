/**
 * @file invoiceService.js
 * @description
 * منطق الفواتير المركّب — Phase 2.5.
 *
 * ⚠️ التغييرات الحاسمة في Phase 2.5:
 * 1. إصلاح Bug: إذا الفاتورة مرتبطة بـ DeliveryNote → لا تخصم Stock (مخصوم مسبقاً).
 * 2. دمج priceValidationService: التحقق من الأسعار قبل الحفظ.
 * 3. overrideReason: إلزامي عند التجاوز (مع صلاحية).
 * 4. تنبيه الأدمن: بعد حفظ فاتورة بتجاوز (عبر Notification).
 */

import mongoose from 'mongoose';

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Customer } from '../models/Customer.js';
import { Invoice, INVOICE_STATUSES } from '../models/Invoice.js';
import { DeliveryNote } from '../models/DeliveryNote.js';
import { Commission } from '../models/Commission.js';
import { SalesRepTransaction } from '../models/SalesRepTransaction.js';
import { CashTransaction } from '../models/CashTransaction.js';
import { Warehouse } from '../models/Warehouse.js';
import { Settings } from '../models/Settings.js';
import { Stock } from '../models/Stock.js';
import { Notification, NOTIFICATION_TYPES, NOTIFICATION_LEVELS } from '../models/Notification.js';
import { User, USER_ROLES } from '../models/User.js';

import { issueStock, returnStock } from './stockService.js';
import { validateInvoicePrices } from './priceValidationService.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

async function generateInvoiceNumber() {
  const settings = await Settings.getSettings();
  const prefix = settings.sales?.prefixes?.invoice || 'INV';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const lastInvoice = await Invoice.findOne({ invoiceNumber: new RegExp(`^${prefix}-${dateStr}-`) })
    .sort({ invoiceNumber: -1 }).select('invoiceNumber').lean();
  let sequence = 1;
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split('-');
    sequence = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}-${dateStr}-${String(sequence).padStart(4, '0')}`;
}

function generateTransactionNumber(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function calculateTotals(items, discount, taxRate) {
  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
  let discountAmount = 0;
  if (discount?.type === 'percentage') discountAmount = (subtotal * (discount.value || 0)) / 100;
  else if (discount?.type === 'fixed') discountAmount = discount.value || 0;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxableAmount * (taxRate || 0)) / 100;
  const total = taxableAmount + taxAmount;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

async function calculateCommission(salesRepId, salesAmount) {
  const commissionConfig = await Commission.findOne({ salesRep: salesRepId, isActive: true }).lean();
  if (!commissionConfig) return { rate: 0, amount: 0 };
  let amount = 0;
  const rate = commissionConfig.baseRate || 0;
  if (commissionConfig.baseCommission === 'percentage') amount = (salesAmount * rate) / 100;
  else if (commissionConfig.baseCommission === 'fixed') amount = rate;
  if (commissionConfig.tiers?.length > 0) {
    const tier = commissionConfig.tiers.find((t) => salesAmount >= t.minSales && salesAmount <= t.maxSales);
    if (tier) amount += (salesAmount * tier.bonusRate) / 100;
  }
  return { rate, amount: Math.round(amount * 100) / 100 };
}

async function ensureCustomerUsable(pharmacyId) {
  const customer = await Customer.findById(pharmacyId);
  if (!customer) throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  if (!customer.isActive) throw new AppError('الصيدلية معطّلة.', 403, 'CUSTOMER_INACTIVE');
  if (customer.isBlocked) throw new AppError(`الصيدلية محظورة. السبب: ${customer.blockReason || 'غير محدد'}`, 403, 'CUSTOMER_BLOCKED');
  return customer;
}

async function ensureWarehouseActive(warehouseId) {
  const warehouse = await Warehouse.findOne({ _id: warehouseId, isActive: true });
  if (!warehouse) throw new AppError('المخزن غير موجود أو معطّل.', 400, 'WAREHOUSE_NOT_FOUND');
  return warehouse;
}

/**
 * ✅ Phase 2.5: إشعار الأدمن (فقط) عند تجاوز أسعار.
 * - لا يُنشأ إذا لم يوجد override.
 * - يُرسَل لكل admin نشط.
 * - بعد حفظ الفاتورة (لأنها تحتاج _id).
 */
async function notifyAdminAboutPriceOverride({ invoice, overrideResults, overrideReason, req }) {
  if (!overrideResults || overrideResults.length === 0) return;

  try {
    const admins = await User.find({ role: USER_ROLES.ADMIN, isActive: true })
      .select('_id email name')
      .lean();

    if (admins.length === 0) return;

    const overriddenItems = overrideResults.filter((r) => r.status === 'WARN_OVERRIDE');
    if (overriddenItems.length === 0) return;

    const itemSummary = overriddenItems
      .map((r) => `• ${r.batch} — السعر ${r.unitPrice} (الحد الموصى به ${r.limits?.recommendedMin || '—'})`)
      .join('\n');

    const title = `⚠️ تجاوز أسعار في فاتورة ${invoice.invoiceNumber}`;
    const message = `${req.user.name} (${req.user.role}) خفّض أسعار ${overriddenItems.length} بند بمبلغ ${invoice.total} SDG.\nالسبب: ${overrideReason}\n${itemSummary}`;

    for (const admin of admins) {
      // eslint-disable-next-line no-await-in-loop
      await Notification.create({
        recipient: admin._id,
        type: NOTIFICATION_TYPES.SYSTEM,
        level: NOTIFICATION_LEVELS.WARNING,
        title,
        message,
        link: `/sales/invoices/${invoice._id}`,
        reference: { type: 'Invoice', id: invoice._id },
        meta: {
          invoiceNumber: invoice.invoiceNumber,
          overrideReason,
          overriddenItems: overriddenItems.map((r) => ({
            batch: r.batch,
            unitPrice: r.unitPrice,
            recommendedMin: r.limits?.recommendedMin,
          })),
          actor: { id: req.user._id, name: req.user.name, role: req.user.role },
        },
      });
    }

    logger.info(
      `[priceOverride] أُرسِل تنبيه لـ ${admins.length} أدمن بخصوص فاتورة ${invoice.invoiceNumber}`
    );
  } catch (error) {
    // لا نُفشل الفاتورة بسبب خطأ في الإشعار
    logger.error(`فشل إرسال تنبيه تجاوز السعر: ${error.message}`);
  }
}

// ============================================================
// 1) إنشاء فاتورة نهائية (مُصلح Bug + تقييد سعر)
// ============================================================

export async function createInvoice({ data, req }) {
  const {
    pharmacy: pharmacyId, salesRep: salesRepId, deliveryNote: deliveryNoteId,
    warehouse: warehouseId, items, discount, taxRate, paymentType, dueDate,
    totalInstallments, paidAmount, paymentMethod, invoiceDate, notes,
    overrideReason,
  } = data;

  // ═══════════════════════════════════════════════
  // 1. التحقق من الصيدلية
  // ═══════════════════════════════════════════════
  const customer = await ensureCustomerUsable(pharmacyId);

  if (paymentType !== 'cash' && customer.wouldExceedCredit(data.total)) {
    throw new AppError(
      `تجاوز حد الائتمان. الرصيد: ${customer.currentBalance}، الحد: ${customer.creditLimit}`,
      400,
      'CREDIT_LIMIT_EXCEEDED'
    );
  }

  // ═══════════════════════════════════════════════
  // 2. تحديد المخزن
  // ═══════════════════════════════════════════════
  let finalWarehouseId = warehouseId;
  if (!finalWarehouseId) {
    const defaultWarehouse = await Warehouse.findOne({ isDefault: true, isActive: true });
    if (!defaultWarehouse) throw new AppError('لا يوجد مخزن افتراضي.', 400, 'NO_WAREHOUSE');
    finalWarehouseId = defaultWarehouse._id;
  }

  // ═══════════════════════════════════════════════
  // 3. ✅ التحقق من الأسعار (Phase 2.5)
  // ═══════════════════════════════════════════════
  const priceCheck = await validateInvoicePrices({
    items: items.map((it) => ({ item: it.item, batch: it.batch, unitPrice: it.unitPrice, quantity: it.quantity })),
    warehouseId: finalWarehouseId,
    req,
  });

  // رفض أي سطر BLOCKED
  const blockedItems = priceCheck.results.filter((r) => r.status === 'BLOCKED');
  if (blockedItems.length > 0) {
    const details = blockedItems.map((r) => `• ${r.batch}: ${r.message}`).join('\n');
    throw new AppError(
      `أسعار غير صالحة:\n${details}`,
      400,
      'INVALID_SALE_PRICE'
    );
  }

  // إذا تجاوز → نحتاج overrideReason
  const hasOverride = priceCheck.needsOverride;
  if (hasOverride && (!overrideReason || overrideReason.trim().length < 5)) {
    throw new AppError(
      'هذه الفاتورة تتضمن أسعاراً أقل من الحد الموصى به. يجب تحديد سبب التجاوز (5 أحرف على الأقل).',
      400,
      'OVERRIDE_REASON_REQUIRED'
    );
  }

  // ═══════════════════════════════════════════════
  // 4. ✅ فحص DeliveryNote (Phase 2.5 — إصلاح Bug)
  // ═══════════════════════════════════════════════
  let linkedDeliveryNote = null;
  if (deliveryNoteId) {
    linkedDeliveryNote = await DeliveryNote.findById(deliveryNoteId);
    if (!linkedDeliveryNote) {
      throw new AppError('إيصال التسليم المرتبط غير موجود.', 404, 'DELIVERY_NOTE_NOT_FOUND');
    }
    if (String(linkedDeliveryNote.pharmacy) !== String(pharmacyId)) {
      throw new AppError('إيصال التسليم لا يخص هذه الصيدلية.', 400, 'DELIVERY_NOTE_PHARMACY_MISMATCH');
    }
    if (linkedDeliveryNote.status !== 'delivered') {
      throw new AppError('لا يمكن إصدار فاتورة لإيصال لم يُسلَّم بعد.', 400, 'DELIVERY_NOTE_NOT_DELIVERED');
    }
  }

  // ═══════════════════════════════════════════════
  // 5. خصم المخزون (Rollback)
  // ⚠️ Phase 2.5: إذا مرتبط بإيصال → لا نخصم (مخصوم مسبقاً)
  // ═══════════════════════════════════════════════
  const issuedStockLog = [];
  const invoiceItems = [];

  if (linkedDeliveryNote) {
    // ✅ لا خصم من Stock — البضاعة خرجت في إيصال التسليم
    // نتحقق فقط أن الإيصال يحتوي على الأصناف المطلوبة
    for (const line of items) {
      const dnItem = linkedDeliveryNote.items.find(
        (di) => String(di.item) === String(line.item) && di.batch === line.batch
      );
      if (!dnItem) {
        throw new AppError(
          `البند ${line.batch} غير موجود في إيصال التسليم ${linkedDeliveryNote.deliveryNumber}.`,
          400,
          'ITEM_NOT_IN_DELIVERY_NOTE'
        );
      }
      if (line.quantity > dnItem.quantity + 0.01) {
        throw new AppError(
          `كمية البند ${line.batch} (${line.quantity}) تتجاوز كمية الإيصال (${dnItem.quantity}).`,
          400,
          'QUANTITY_EXCEEDS_DELIVERY_NOTE'
        );
      }
      invoiceItems.push({
        ...line,
        unitCost: dnItem.unitPrice ? 0 : 0, // لا نعرف تكلفة البضاعة هنا (موجودة في Stock)
      });
    }
    logger.info(`[createInvoice] لا خصم من Stock — الفاتورة مرتبطة بإيصال ${linkedDeliveryNote.deliveryNumber}.`);
  } else {
    // ✅ بيع مباشر — خصم Stock (كما كان)
    try {
      for (const line of items) {
        if (line.batch) {
          const stock = await Stock.findOne({
            item: line.item, batch: line.batch, warehouse: finalWarehouseId,
            quantity: { $gte: line.quantity }, isQuarantined: false,
          });

          if (!stock) {
            throw new AppError(`الدفعة ${line.batch} غير متوفرة أو الكمية غير كافية.`, 400, 'INSUFFICIENT_STOCK');
          }

          stock.quantity -= line.quantity;
          stock.lastIssuedAt = new Date();
          await stock.save();

          issuedStockLog.push({ itemId: line.item, warehouseId: finalWarehouseId, batch: line.batch, quantity: line.quantity });
          invoiceItems.push({ ...line, unitCost: stock.unitCost || 0 });
        } else {
          const issuedBatches = await issueStock({ itemId: line.item, warehouseId: finalWarehouseId, quantity: line.quantity });
          for (const batch of issuedBatches) {
            issuedStockLog.push({ itemId: line.item, warehouseId: finalWarehouseId, batch: batch.batch, quantity: batch.quantity });
            invoiceItems.push({
              item: line.item, batch: batch.batch, expiry: batch.expiry, quantity: batch.quantity,
              unit: line.unit || '', unitPrice: line.unitPrice,
              total: Math.round(batch.quantity * line.unitPrice * 100) / 100,
              unitCost: batch.unitCost || 0,
            });
          }
        }
      }
    } catch (error) {
      logger.error(`فشل صرف المخزون: ${error.message}. Rollback...`);
      for (const log of issuedStockLog) {
        try { await returnStock({ itemId: log.itemId, warehouseId: log.warehouseId, batch: log.batch, quantity: log.quantity }); }
        catch (rbErr) { logger.error(`فشل Rollback للدفعة ${log.batch}: ${rbErr.message}`); }
      }
      throw error;
    }
  }

  // ═══════════════════════════════════════════════
  // 6. الحسابات والعمولة
  // ═══════════════════════════════════════════════
  const totals = calculateTotals(invoiceItems, discount, taxRate);
  const commissionData = await calculateCommission(salesRepId, totals.total);
  const invoiceNumber = await generateInvoiceNumber();

  // ═══════════════════════════════════════════════
  // 7. إنشاء الفاتورة
  // ═══════════════════════════════════════════════
  const invoice = await Invoice.create({
    invoiceNumber,
    deliveryNote: deliveryNoteId || null,
    pharmacy: pharmacyId,
    salesRep: salesRepId,
    warehouse: finalWarehouseId,
    invoiceDate: invoiceDate || new Date(),
    items: invoiceItems,
    subtotal: totals.subtotal,
    discount: {
      type: discount?.type || null, value: discount?.value || 0,
      reason: discount?.reason || '', computedAmount: totals.discountAmount,
      freeItems: discount?.freeItems || [],
    },
    taxRate: taxRate || 0, taxAmount: totals.taxAmount, total: totals.total,
    paymentType, dueDate, totalInstallments: totalInstallments || 0,
    paidAmount, remainingAmount: Math.max(0, totals.total - paidAmount),
    paymentMethod: paymentMethod || '',
    status: INVOICE_STATUSES.PENDING,
    commission: { rate: commissionData.rate, amount: commissionData.amount, isPaid: false },
    notes,
    createdBy: req.user._id,
    finalizedBy: req.user._id,
    finalizedAt: new Date(),
  });

  // ═══════════════════════════════════════════════
  // 8. رصيد الصيدلية
  // ═══════════════════════════════════════════════
  const creditAmount = totals.total - paidAmount;
  if (creditAmount > 0) {
    await Customer.updateOne({ _id: pharmacyId }, { $inc: { currentBalance: creditAmount } });
  }

  // ═══════════════════════════════════════════════
  // 9. عمولة المندوب
  // ═══════════════════════════════════════════════
  if (commissionData.amount > 0) {
    const commissionTx = await SalesRepTransaction.create({
      transactionNumber: generateTransactionNumber('SRT'),
      salesRep: salesRepId, type: 'commission', direction: 'credit',
      amount: commissionData.amount,
      description: `عمولة فاتورة ${invoiceNumber}`,
      referenceType: 'Invoice', referenceId: invoice._id,
      status: 'approved', createdBy: req.user._id,
    });
    invoice.commission.transactionId = commissionTx._id;
    await invoice.save();
  }

  // ═══════════════════════════════════════════════
  // 10. حركة نقدية
  // ═══════════════════════════════════════════════
  if (paidAmount > 0) {
    await CashTransaction.create({
      transactionNumber: generateTransactionNumber('CT'),
      accountType: 'cash', direction: 'in', category: 'sale_cash',
      amount: paidAmount,
      description: `دفعة أولى للفاتورة ${invoiceNumber}`,
      referenceType: 'Invoice', referenceId: invoice._id,
      party: pharmacyId, partyType: 'Customer',
      createdBy: req.user._id,
    });
  }

  // ═══════════════════════════════════════════════
  // 11. Audit Log
  // ═══════════════════════════════════════════════
  await logAuditEvent({
    req,
    action: hasOverride ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
    resource: 'Invoice',
    resourceId: invoice._id,
    description: hasOverride
      ? `إنشاء فاتورة ${invoiceNumber} (بتجاوز سعري): ${overrideReason}`
      : `إنشاء فاتورة ${invoiceNumber} للصيدلية ${customer.name}`,
    success: true,
    meta: {
      after: { invoiceNumber, total: totals.total, paidAmount, status: invoice.status },
      override: hasOverride
        ? { reason: overrideReason, items: priceCheck.results.filter((r) => r.status === 'WARN_OVERRIDE') }
        : undefined,
    },
  });

  // ═══════════════════════════════════════════════
  // 12. ✅ تنبيه الأدمن (Phase 2.5)
  // ═══════════════════════════════════════════════
  if (hasOverride) {
    await notifyAdminAboutPriceOverride({
      invoice, overrideResults: priceCheck.results,
      overrideReason, req,
    });
  }

  return invoice;
}

// ============================================================
// 2) إنشاء مسودة
// ============================================================

export async function createDraftInvoice({ data, req }) {
  const {
    pharmacy: pharmacyId, salesRep: salesRepId, deliveryNote,
    warehouse: warehouseId, items, discount, taxRate, invoiceDate, notes,
  } = data;

  await ensureCustomerUsable(pharmacyId);
  await ensureWarehouseActive(warehouseId);

  // ⚠️ المسودة لا تُحقّق السعر (فقط عند الاعتماد)
  const totals = calculateTotals(items, discount, taxRate);
  const invoiceNumber = await generateInvoiceNumber();

  const invoice = await Invoice.create({
    invoiceNumber,
    deliveryNote: deliveryNote || null,
    pharmacy: pharmacyId, salesRep: salesRepId, warehouse: warehouseId,
    invoiceDate: invoiceDate || new Date(),
    items,
    subtotal: totals.subtotal,
    discount: {
      type: discount?.type || null, value: discount?.value || 0,
      reason: discount?.reason || '', computedAmount: totals.discountAmount,
      freeItems: discount?.freeItems || [],
    },
    taxRate: taxRate || 0, taxAmount: totals.taxAmount, total: totals.total,
    paidAmount: 0, remainingAmount: totals.total,
    status: INVOICE_STATUSES.DRAFT,
    commission: { rate: 0, amount: 0, isPaid: false },
    notes, createdBy: req.user._id,
  });

  await logAuditEvent({
    req, action: AUDIT_ACTIONS.CREATE, resource: 'Invoice', resourceId: invoice._id,
    description: `إنشاء مسودة فاتورة ${invoiceNumber}`,
    success: true,
    meta: { after: { invoiceNumber, total: totals.total, status: 'draft' } },
  });

  return invoice;
}

// ============================================================
// 3) تعديل مسودة
// ============================================================

export async function updateDraftInvoice({ invoiceId, data, req }) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status !== INVOICE_STATUSES.DRAFT) {
    throw new AppError('لا يمكن تعديل فاتورة غير مسودة.', 409, 'NOT_A_DRAFT');
  }
  if (data.warehouse) await ensureWarehouseActive(data.warehouse);

  const before = { items: invoice.items, total: invoice.total };

  if (data.salesRep !== undefined) invoice.salesRep = data.salesRep;
  if (data.deliveryNote !== undefined) invoice.deliveryNote = data.deliveryNote;
  if (data.warehouse !== undefined) invoice.warehouse = data.warehouse;
  if (data.invoiceDate !== undefined) invoice.invoiceDate = data.invoiceDate;
  if (data.notes !== undefined) invoice.notes = data.notes;

  if (data.items || data.discount !== undefined || data.taxRate !== undefined) {
    const newItems = data.items || invoice.items;
    const newDiscount = data.discount !== undefined ? data.discount : invoice.discount;
    const newTaxRate = data.taxRate !== undefined ? data.taxRate : invoice.taxRate;
    const totals = calculateTotals(newItems, newDiscount, newTaxRate);
    invoice.items = newItems;
    invoice.subtotal = totals.subtotal;
    invoice.discount = {
      type: newDiscount?.type || null, value: newDiscount?.value || 0,
      reason: newDiscount?.reason || '', computedAmount: totals.discountAmount,
      freeItems: newDiscount?.freeItems || [],
    };
    invoice.taxRate = newTaxRate;
    invoice.taxAmount = totals.taxAmount;
    invoice.total = totals.total;
    invoice.remainingAmount = totals.total;
  }

  await invoice.save();

  await logAuditEvent({
    req, action: AUDIT_ACTIONS.UPDATE, resource: 'Invoice', resourceId: invoice._id,
    description: `تعديل مسودة الفاتورة ${invoice.invoiceNumber}`,
    success: true,
    meta: { before, after: { total: invoice.total } },
  });

  return invoice;
}

// ============================================================
// 4) اعتماد مسودة (مُصلح Bug + تقييد سعر)
// ============================================================

export async function finalizeInvoice({ invoiceId, data, req }) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status !== INVOICE_STATUSES.DRAFT) {
    throw new AppError('الفاتورة ليست مسودة.', 409, 'NOT_A_DRAFT');
  }
  if (!invoice.warehouse) throw new AppError('المسودة بدون مخزن.', 400, 'NO_WAREHOUSE');

  const { paymentType, dueDate, totalInstallments, paidAmount, paymentMethod, notes, overrideReason } = data;

  // 1. التحقق من الائتمان
  const customer = await ensureCustomerUsable(invoice.pharmacy);
  const creditAmount = invoice.total - (paidAmount || 0);
  if (paymentType !== 'cash' && customer.wouldExceedCredit(creditAmount)) {
    throw new AppError(
      `تجاوز حد الائتمان. الرصيد: ${customer.currentBalance}، الحد: ${customer.creditLimit}`,
      400,
      'CREDIT_LIMIT_EXCEEDED'
    );
  }

  // 2. ✅ التحقق من الأسعار (Phase 2.5)
  const priceCheck = await validateInvoicePrices({
    items: invoice.items.map((it) => ({ item: it.item, batch: it.batch, unitPrice: it.unitPrice, quantity: it.quantity })),
    warehouseId: invoice.warehouse,
    req,
  });

  const blockedItems = priceCheck.results.filter((r) => r.status === 'BLOCKED');
  if (blockedItems.length > 0) {
    const details = blockedItems.map((r) => `• ${r.batch}: ${r.message}`).join('\n');
    throw new AppError(`أسعار غير صالحة:\n${details}`, 400, 'INVALID_SALE_PRICE');
  }

  const hasOverride = priceCheck.needsOverride;
  if (hasOverride && (!overrideReason || overrideReason.trim().length < 5)) {
    throw new AppError(
      'هذه الفاتورة تتضمن أسعاراً أقل من الحد الموصى به. يجب تحديد سبب التجاوز.',
      400,
      'OVERRIDE_REASON_REQUIRED'
    );
  }

  // 3. ✅ فحص DeliveryNote
  let linkedDeliveryNote = null;
  if (invoice.deliveryNote) {
    linkedDeliveryNote = await DeliveryNote.findById(invoice.deliveryNote);
  }

  // 4. خصم Stock (Rollback) — فقط إن لم يكن مرتبطاً بإيصال
  const issuedStockLog = [];

  if (linkedDeliveryNote) {
    // ✅ لا خصم (مخصوم في الإيصال)
    logger.info(`[finalize] لا خصم Stock — الفاتورة مرتبطة بإيصال ${linkedDeliveryNote.deliveryNumber}.`);
  } else {
    try {
      for (const item of invoice.items) {
        const result = await Stock.updateOne(
          { item: item.item, batch: item.batch, warehouse: invoice.warehouse, quantity: { $gte: item.quantity }, isQuarantined: false },
          { $inc: { quantity: -item.quantity }, $set: { lastIssuedAt: new Date() } }
        );
        if (result.modifiedCount !== 1) {
          throw new AppError(`الدفعة ${item.batch} غير متوفرة أو الكمية غير كافية.`, 400, 'INSUFFICIENT_STOCK');
        }
        issuedStockLog.push({ itemId: item.item, batch: item.batch, warehouseId: invoice.warehouse, quantity: item.quantity });
      }
    } catch (error) {
      for (const log of issuedStockLog) {
        try { await Stock.updateOne({ item: log.itemId, batch: log.batch, warehouse: log.warehouseId }, { $inc: { quantity: log.quantity } }); }
        catch (rbErr) { logger.error(`Rollback: ${rbErr.message}`); }
      }
      throw error;
    }
  }

  // 5. العمولة
  const commissionData = await calculateCommission(invoice.salesRep, invoice.total);

  // 6. تحديث الفاتورة
  invoice.paymentType = paymentType;
  invoice.dueDate = dueDate || null;
  invoice.totalInstallments = totalInstallments || 0;
  invoice.paidAmount = paidAmount || 0;
  invoice.remainingAmount = Math.max(0, invoice.total - (paidAmount || 0));
  invoice.paymentMethod = paymentMethod || '';
  invoice.commission = { rate: commissionData.rate, amount: commissionData.amount, isPaid: false };
  invoice.status = INVOICE_STATUSES.PENDING;
  invoice.finalizedBy = req.user._id;
  invoice.finalizedAt = new Date();
  if (notes) invoice.notes = notes;
  await invoice.save();

  // 7. رصيد + عمولة
  if (creditAmount > 0) {
    await Customer.updateOne({ _id: invoice.pharmacy }, { $inc: { currentBalance: creditAmount } });
  }
  if (commissionData.amount > 0) {
    const commissionTx = await SalesRepTransaction.create({
      transactionNumber: generateTransactionNumber('SRT'),
      salesRep: invoice.salesRep, type: 'commission', direction: 'credit',
      amount: commissionData.amount,
      description: `عمولة فاتورة ${invoice.invoiceNumber}`,
      referenceType: 'Invoice', referenceId: invoice._id,
      status: 'approved', createdBy: req.user._id,
    });
    invoice.commission.transactionId = commissionTx._id;
    await invoice.save();
  }

  // 8. CashTransaction
  if (paidAmount > 0) {
    await CashTransaction.create({
      transactionNumber: generateTransactionNumber('CT'),
      accountType: 'cash', direction: 'in', category: 'sale_cash',
      amount: paidAmount,
      description: `دفعة على اعتماد الفاتورة ${invoice.invoiceNumber}`,
      referenceType: 'Invoice', referenceId: invoice._id,
      party: invoice.pharmacy, partyType: 'Customer',
      createdBy: req.user._id,
    });
  }

  // 9. Audit
  await logAuditEvent({
    req,
    action: hasOverride ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice', resourceId: invoice._id,
    description: hasOverride
      ? `اعتماد مسودة ${invoice.invoiceNumber} (بتجاوز سعري): ${overrideReason}`
      : `اعتماد مسودة الفاتورة ${invoice.invoiceNumber}`,
    success: true,
    meta: { after: { status: invoice.status, total: invoice.total } },
  });

  // 10. تنبيه الأدمن
  if (hasOverride) {
    await notifyAdminAboutPriceOverride({
      invoice, overrideResults: priceCheck.results,
      overrideReason, req,
    });
  }

  return invoice;
}

// ============================================================
// 5) إلغاء (لم يتغير)
// ============================================================

export async function cancelInvoice({ invoiceId, cancelReason, req }) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status === INVOICE_STATUSES.CANCELLED) {
    throw new AppError('الفاتورة ملغاة بالفعل.', 409, 'INVOICE_ALREADY_CANCELLED');
  }

  // مسودة → إلغاء بسيط
  if (invoice.status === INVOICE_STATUSES.DRAFT) {
    invoice.status = INVOICE_STATUSES.CANCELLED;
    invoice.cancelledAt = new Date();
    invoice.cancelledBy = req.user._id;
    invoice.cancelReason = cancelReason;
    await invoice.save();
    await logAuditEvent({ req, action: AUDIT_ACTIONS.DELETE, resource: 'Invoice', resourceId: invoice._id, description: `إلغاء مسودة ${invoice.invoiceNumber}: ${cancelReason}`, success: true });
    return invoice;
  }

  if (invoice.paidAmount > 0) {
    throw new AppError('لا يمكن إلغاء فاتورة عليها دفعات.', 409, 'INVOICE_HAS_PAYMENTS');
  }

  // ⚠️ Phase 2.5: إذا مرتبطة بـ DeliveryNote → لا نُرجع Stock (البضاعة خرجت بالفعل)
  if (!invoice.deliveryNote) {
    const warehouseId = invoice.warehouse || (await Warehouse.findOne({ isDefault: true }))._id;
    for (const item of invoice.items) {
      await returnStock({
        itemId: item.item, warehouseId, batch: item.batch, quantity: item.quantity,
        meta: { expiry: item.expiry, unitCost: item.unitCost, unitPrice: item.unitPrice, notes: `إرجاع - إلغاء ${invoice.invoiceNumber}` },
      });
    }
  } else {
    logger.info(`[cancelInvoice] لا إرجاع Stock — الفاتورة مرتبطة بإيصال.`);
  }

  const creditAmount = invoice.total - invoice.paidAmount;
  if (creditAmount > 0) {
    await Customer.updateOne({ _id: invoice.pharmacy }, { $inc: { currentBalance: -creditAmount } });
  }

  await SalesRepTransaction.updateOne(
    { referenceType: 'Invoice', referenceId: invoice._id, type: 'commission' },
    { status: 'cancelled', cancelReason: 'إلغاء الفاتورة' }
  );

  invoice.status = INVOICE_STATUSES.CANCELLED;
  invoice.cancelledAt = new Date();
  invoice.cancelledBy = req.user._id;
  invoice.cancelReason = cancelReason;
  await invoice.save();

  await logAuditEvent({ req, action: AUDIT_ACTIONS.DELETE, resource: 'Invoice', resourceId: invoice._id, description: `إلغاء ${invoice.invoiceNumber}: ${cancelReason}`, success: true });
  return invoice;
}

// ============================================================
// 6) تسجيل دفعة
// ============================================================

export async function registerPayment({ invoiceId, paymentData, req }) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new AppError('الفاتورة غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  if (invoice.status === INVOICE_STATUSES.DRAFT) throw new AppError('لا يمكن دفع مسودة.', 409, 'INVOICE_IS_DRAFT');
  if (invoice.status === INVOICE_STATUSES.CANCELLED) throw new AppError('لا يمكن دفع فاتورة ملغاة.', 409, 'INVOICE_CANCELLED');
  if (invoice.remainingAmount <= 0) throw new AppError('الفاتورة مدفوعة بالكامل.', 409, 'INVOICE_ALREADY_PAID');

  const { amount, paymentMethod } = paymentData;
  if (amount > invoice.remainingAmount + 0.01) {
    throw new AppError(`المبلغ يتجاوز المتبقي (${invoice.remainingAmount}).`, 400, 'AMOUNT_EXCEEDS_REMAINING');
  }

  await CashTransaction.create({
    transactionNumber: generateTransactionNumber('CT'),
    accountType: paymentMethod === 'bank' ? 'bank' : 'cash',
    direction: 'in', category: 'customer_payment', amount,
    description: `دفعة على الفاتورة ${invoice.invoiceNumber}`,
    referenceType: 'Invoice', referenceId: invoice._id,
    party: invoice.pharmacy, partyType: 'Customer',
    createdBy: req.user._id,
  });

  invoice.registerPayment(amount);
  await invoice.save();

  await Customer.updateOne({ _id: invoice.pharmacy }, { $inc: { currentBalance: -amount } });

  await logAuditEvent({ req, action: AUDIT_ACTIONS.UPDATE, resource: 'Invoice', resourceId: invoice._id, description: `تسجيل دفعة ${amount} على ${invoice.invoiceNumber}`, success: true });

  return invoice;
}

export default {
  createInvoice, createDraftInvoice, updateDraftInvoice,
  finalizeInvoice, cancelInvoice, registerPayment,
};