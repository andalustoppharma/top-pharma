/**
 * @file purchaseReceiptController.js
 * @description
 * واجهات التحكم لإيصالات استلام البضاعة من الموردين (المشتريات).
 * يدير دورة حياة الإيصال (مسودة ← مؤكد) مع تعديل المخزون والمالية.
 *
 * لماذا هذا الملف؟
 * - إيصال الاستلام هو المستند الوحيد الذي يُدخل بضاعة جديدة للمخزون.
 * - التأثير الفعلي يحدث عند "تأكيد الاستلام" (confirm):
 *     1. إضافة الكميات لـ Stock.
 *     2. تحديث رصيد المورد (currentBalance).
 *     3. إنشاء حركة نقدية للدفعة الأولى.
 * - يستخدم `stockService.returnStock` كـ "إضافة ذكية" (Upsert)
 *   لتفادي تكرار منطق إضافة الدفعات.
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import {
  PurchaseReceipt,
  PURCHASE_STATUSES,
} from '../models/PurchaseReceipt.js';
import { Supplier } from '../models/Supplier.js';
import { CashTransaction } from '../models/CashTransaction.js';
import { Settings } from '../models/Settings.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { returnStock } from '../services/stockService.js';
import { logger } from '../utils/logger.js';

// ============================================================
// Helpers
// ============================================================

/**
 * توليد رقم إيصال استلام فريد.
 * النمط: PR-YYYYMMDD-XXXX
 *
 * @async
 * @returns {Promise<string>}
 */
async function generateReceiptNumber() {
  const settings = await Settings.getSettings();
  const prefix = settings.sales?.prefixes?.purchaseReceipt || 'PR';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const lastReceipt = await PurchaseReceipt.findOne({
    receiptNumber: new RegExp(`^${prefix}-${dateStr}-`),
  })
    .sort({ receiptNumber: -1 })
    .select('receiptNumber')
    .lean();

  let sequence = 1;
  if (lastReceipt) {
    const parts = lastReceipt.receiptNumber.split('-');
    sequence = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(4, '0')}`;
}

/**
 * توليد رقم حركة مالية.
 */
function generateTransactionNumber(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * بناء استجابة موحّدة.
 */
const buildReceiptPayload = (receipt) => ({
  id: receipt._id,
  receiptNumber: receipt.receiptNumber,
  supplier: receipt.supplier,
  warehouse: receipt.warehouse,
  supplierInvoiceNumber: receipt.supplierInvoiceNumber,
  receiptDate: receipt.receiptDate,
  items: receipt.items,
  subtotal: receipt.subtotal,
  discount: receipt.discount,
  taxRate: receipt.taxRate,
  taxAmount: receipt.taxAmount,
  total: receipt.total,
  paymentType: receipt.paymentType,
  initialPayment: receipt.initialPayment,
  paidAmount: receipt.paidAmount,
  remainingAmount: receipt.remainingAmount,
  dueDate: receipt.dueDate,
  status: receipt.status,
  receivedAt: receipt.receivedAt,
  receivedBy: receipt.receivedBy,
  notes: receipt.notes,
  createdAt: receipt.createdAt,
  updatedAt: receipt.updatedAt,
});

// ============================================================
// 1) القراءة
// ============================================================

/**
 * GET /api/purchase-receipts
 */
export const listPurchaseReceipts = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    search,
    supplier,
    warehouse,
    status,
    paymentType,
    notReceived,
    hasRemaining,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  } = req.validatedQuery || req.query;

  const filter = {};

  if (supplier) filter.supplier = supplier;
  if (warehouse) filter.warehouse = warehouse;
  if (status) filter.status = status;
  if (paymentType) filter.paymentType = paymentType;

  if (notReceived) {
    filter.status = PURCHASE_STATUSES.DRAFT;
  }

  if (hasRemaining) {
    filter.remainingAmount = { $gt: 0 };
  }

  if (dateFrom || dateTo) {
    filter.receiptDate = {};
    if (dateFrom) filter.receiptDate.$gte = dateFrom;
    if (dateTo) filter.receiptDate.$lte = dateTo;
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ receiptNumber: rx }, { supplierInvoiceNumber: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [receipts, total] = await Promise.all([
    PurchaseReceipt.find(filter)
      .populate('supplier', 'name code')
      .populate('warehouse', 'name code')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    PurchaseReceipt.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: receipts.map(buildReceiptPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + receipts.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/purchase-receipts/:id
 */
export const getPurchaseReceipt = asyncHandler(async (req, res) => {
  const receipt = await PurchaseReceipt.findById(req.params.id)
    .populate('supplier', 'name code currentBalance')
    .populate('warehouse', 'name code')
    .populate('receivedBy', 'name')
    .populate('items.item', 'tradeName scientificName');

  if (!receipt) {
    throw new AppError('إيصال الاستلام غير موجود.', 404, 'RECEIPT_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: buildReceiptPayload(receipt),
  });
});

// ============================================================
// 2) الإنشاء
// ============================================================

/**
 * POST /api/purchase-receipts
 *
 * ملاحظة: الإنشاء يُنشئ مسودة (draft) فقط.
 * التأثير الفعلي على المخزون والمالية يحدث في `confirm`.
 */
export const createPurchaseReceipt = asyncHandler(async (req, res) => {
  const data = req.body;

  // 1. التحقق من المورد
  const supplier = await Supplier.findById(data.supplier);
  if (!supplier) {
    throw new AppError('المورّد غير موجود.', 404, 'SUPPLIER_NOT_FOUND');
  }
  if (!supplier.isActive) {
    throw new AppError('المورّد معطّل.', 403, 'SUPPLIER_INACTIVE');
  }

  // 2. إنشاء الإيصال
  const receiptNumber = await generateReceiptNumber();

  const receipt = await PurchaseReceipt.create({
    receiptNumber,
    supplier: data.supplier,
    warehouse: data.warehouse,
    supplierInvoiceNumber: data.supplierInvoiceNumber,
    receiptDate: data.receiptDate || new Date(),
    items: data.items,
    subtotal: data.subtotal,
    discount: data.discount,
    taxRate: data.taxRate,
    taxAmount: data.taxAmount,
    total: data.total,
    paymentType: data.paymentType,
    initialPayment: data.initialPayment || { amount: 0, method: 'cash' },
    paidAmount: data.paidAmount,
    remainingAmount: data.remainingAmount,
    dueDate: data.dueDate,
    status: PURCHASE_STATUSES.DRAFT,
    notes: data.notes,
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'PurchaseReceipt',
    resourceId: receipt._id,
    description: `إنشاء مسودة إيصال استلام ${receiptNumber} من ${supplier.name}`,
    success: true,
    meta: { after: { receiptNumber, total: data.total, status: 'draft' } },
  });

  return res.status(201).json({
    success: true,
    data: buildReceiptPayload(receipt),
  });
});

// ============================================================
// 3) التعديل (مسودة فقط)
// ============================================================

/**
 * PATCH /api/purchase-receipts/:id
 */
export const updatePurchaseReceipt = asyncHandler(async (req, res) => {
  const receipt = await PurchaseReceipt.findById(req.params.id);

  if (!receipt) {
    throw new AppError('إيصال الاستلام غير موجود.', 404, 'RECEIPT_NOT_FOUND');
  }

  if (receipt.status !== PURCHASE_STATUSES.DRAFT) {
    throw new AppError('لا يمكن تعديل إيصال بعد تأكيده.', 409, 'RECEIPT_LOCKED');
  }

  const before = {
    items: receipt.items,
    total: receipt.total,
    paymentType: receipt.paymentType,
    notes: receipt.notes,
  };

  const allowedFields = [
    'items', 'subtotal', 'discount', 'taxRate', 'taxAmount', 'total',
    'paymentType', 'initialPayment', 'paidAmount', 'remainingAmount',
    'dueDate', 'notes',
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      receipt[field] = req.body[field];
    }
  }

  await receipt.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'PurchaseReceipt',
    resourceId: receipt._id,
    description: `تعديل إيصال الاستلام ${receipt.receiptNumber}`,
    success: true,
    meta: { before, after: { items: receipt.items, total: receipt.total } },
  });

  return res.status(200).json({
    success: true,
    data: buildReceiptPayload(receipt),
  });
});

// ============================================================
// 4) تأكيد الاستلام (Confirm)
// ============================================================

/**
 * POST /api/purchase-receipts/:id/confirm
 *
 * التأثير الفعلي:
 * 1. إضافة البضاعة لـ Stock (عبر returnStock كـ Upsert).
 * 2. تحديث رصيد المورد (إن آجل).
 * 3. إنشاء حركة نقدية للدفعة الأولى (إن وُجدت).
 */
export const confirmPurchaseReceipt = asyncHandler(async (req, res) => {
  const receipt = await PurchaseReceipt.findById(req.params.id);

  if (!receipt) {
    throw new AppError('إيصال الاستلام غير موجود.', 404, 'RECEIPT_NOT_FOUND');
  }

  if (receipt.status !== PURCHASE_STATUSES.DRAFT) {
    throw new AppError('الإيصال مؤكد بالفعل أو ملغى.', 409, 'INVALID_STATUS');
  }

  // 1. إضافة البضاعة للمخزون (Rollback عند الفشل)
  const addedStockLog = [];

  try {
    for (const item of receipt.items) {
      // نستخدم returnStock لأنها تدعم Upsert (إضافة كمية أو إنشاء دفعة جديدة)
      await returnStock({
        itemId: item.item,
        warehouseId: receipt.warehouse,
        batch: item.batch,
        quantity: item.quantity,
        meta: {
          expiry: item.expiry,
          unitCost: item.unitCost,
          unitPrice: item.unitPrice,
          notes: `استلام مشتريات ${receipt.receiptNumber}`,
        },
      });

      addedStockLog.push({
        itemId: item.item,
        warehouseId: receipt.warehouse,
        batch: item.batch,
        quantity: item.quantity,
      });
    }
  } catch (error) {
    logger.error(`فشل إضافة البضاعة للمخزون: ${error.message}. جارٍ Rollback...`);
    // في حال فشل بند، نحاول خصم ما أُضيف
    for (const log of addedStockLog) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { default: Stock } = await import('../models/Stock.js');
        await Stock.updateOne(
          { item: log.itemId, batch: log.batch, warehouse: log.warehouseId },
          { $inc: { quantity: -log.quantity } }
        );
      } catch (rbErr) {
        logger.error(`فشل Rollback للدفعة ${log.batch}: ${rbErr.message}`);
      }
    }
    throw new AppError('فشل تأكيد الاستلام. يرجى مراجعة البيانات.', 500, 'CONFIRM_FAILED');
  }

  // 2. تحديث رصيد المورد (إن كان هناك متبقٍ)
  if (receipt.remainingAmount > 0) {
    await Supplier.updateOne(
      { _id: receipt.supplier },
      { $inc: { currentBalance: receipt.remainingAmount } }
    );
  }

  // 3. إنشاء حركة نقدية (إن وُجدت دفعة أولى)
  if (receipt.paidAmount > 0) {
    await CashTransaction.create({
      transactionNumber: generateTransactionNumber('CT'),
      accountType: receipt.initialPayment?.method === 'bank' ? 'bank' : 'cash',
      direction: 'out',
      category: 'supplier_payment',
      amount: receipt.paidAmount,
      description: `دفعة أولى لإيصال استلام ${receipt.receiptNumber}`,
      referenceType: 'PurchaseReceipt',
      referenceId: receipt._id,
      party: receipt.supplier,
      partyType: 'Supplier',
      createdBy: req.user._id,
    });
  }

  // 4. تحديث حالة الإيصال
  receipt.status = PURCHASE_STATUSES.RECEIVED;
  receipt.receivedAt = new Date();
  receipt.receivedBy = req.user._id;
  if (req.body.notes) receipt.notes = req.body.notes;

  await receipt.save();

  // 5. تدقيق
  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'PurchaseReceipt',
    resourceId: receipt._id,
    description: `تأكيد استلام إيصال ${receipt.receiptNumber}`,
    success: true,
    meta: { after: { status: 'received', receivedAt: receipt.receivedAt } },
  });

  return res.status(200).json({
    success: true,
    data: buildReceiptPayload(receipt),
    message: 'تم تأكيد الاستلام وإضافة البضاعة للمخزون.',
  });
});

// ============================================================
// 5) الإلغاء (Cancel Draft)
// ============================================================

/**
 * POST /api/purchase-receipts/:id/cancel
 */
export const cancelPurchaseReceipt = asyncHandler(async (req, res) => {
  const { cancelReason } = req.body;
  const receipt = await PurchaseReceipt.findById(req.params.id);

  if (!receipt) {
    throw new AppError('إيصال الاستلام غير موجود.', 404, 'RECEIPT_NOT_FOUND');
  }

  if (receipt.status !== PURCHASE_STATUSES.DRAFT) {
    throw new AppError('لا يمكن إلغاء إيصال مؤكد. يمكنك استخدام "مرتجع مورد".', 409, 'INVALID_STATUS');
  }

  receipt.status = PURCHASE_STATUSES.CANCELLED;
  receipt.notes = `${receipt.notes || ''}\n[ملغى]: ${cancelReason}`.trim();

  await receipt.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.DELETE,
    resource: 'PurchaseReceipt',
    resourceId: receipt._id,
    description: `إلغاء مسودة إيصال الاستلام ${receipt.receiptNumber}: ${cancelReason}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: buildReceiptPayload(receipt),
    message: 'تم إلغاء إيصال الاستلام.',
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listPurchaseReceipts,
  getPurchaseReceipt,
  createPurchaseReceipt,
  updatePurchaseReceipt,
  confirmPurchaseReceipt,
  cancelPurchaseReceipt,
};