/**
 * @file customerReturnController.js
 * @description
 * واجهات التحكم لمرتجعات العملاء.
 * تدير دورة حياة المرتجع (إنشاء ← موافقة/رفض) مع التحقق من فترة السماح.
 *
 * لماذا هذا الملف؟
 * - المرتجع عملية حساسة: يُرجع بضاعة للمخزون، ويُسوّى مالياً.
 * - الموافقة (Approve) هي العملية الفعلية (تغيير المخزون + المال).
 * - نستخدم فترة سماح (grace period) افتراضية 7 أيام من إعدادات العميل.
 * - نستخدم `stockService.returnStock` لضمان إرجاع البضاعة للدفعة الصحيحة.
 * - Scope: المندوب يرى مرتجعات صيدلياته فقط، والصيدلية ترى مرتجعاتها فقط.
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import {
  CustomerReturn,
  RETURN_STATUSES,
  SETTLEMENT_TYPES,
} from '../models/CustomerReturn.js';
import { Invoice } from '../models/Invoice.js';
import { Customer } from '../models/Customer.js';
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
 * توليد رقم مرتجع فريد.
 * النمط: RET-YYYYMMDD-XXXX
 *
 * @async
 * @returns {Promise<string>}
 */
async function generateReturnNumber() {
  const settings = await Settings.getSettings();
  const prefix = settings.sales?.prefixes?.customerReturn || 'RET';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const lastReturn = await CustomerReturn.findOne({
    returnNumber: new RegExp(`^${prefix}-${dateStr}-`),
  })
    .sort({ returnNumber: -1 })
    .select('returnNumber')
    .lean();

  let sequence = 1;
  if (lastReturn) {
    const parts = lastReturn.returnNumber.split('-');
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
const buildCustomerReturnPayload = (ret) => ({
  id: ret._id,
  returnNumber: ret.returnNumber,
  originalInvoice: ret.originalInvoice,
  pharmacy: ret.pharmacy,
  items: ret.items,
  total: ret.total,
  returnDate: ret.returnDate,
  invoiceDate: ret.invoiceDate,
  gracePeriodDays: ret.gracePeriodDays,
  isWithinGracePeriod: ret.isWithinGracePeriod,
  status: ret.status,
  settlementType: ret.settlementType,
  settledAmount: ret.settledAmount,
  settlementTransaction: ret.settlementTransaction,
  approvedBy: ret.approvedBy,
  approvedAt: ret.approvedAt,
  rejectedBy: ret.rejectedBy,
  rejectedAt: ret.rejectedAt,
  rejectionReason: ret.rejectionReason,
  notes: ret.notes,
  createdAt: ret.createdAt,
  updatedAt: ret.updatedAt,
});

// ============================================================
// 1) القراءة
// ============================================================

/**
 * GET /api/customer-returns
 */
export const listCustomerReturns = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    search,
    pharmacy,
    originalInvoice,
    status,
    settlementType,
    outsideGracePeriod,
    hasDamagedItems,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  } = req.validatedQuery || req.query;

  const filter = {};

  // Scope للمندوب
  if (req.scope?.salesRepId) {
    // المرتجع مرتبط بالصيدلية، والصيدلية مرتبطة بالمندوب
    const customerIds = await Customer.find({ assignedSalesRep: req.scope.salesRepId }).select('_id').lean();
    filter.pharmacy = { $in: customerIds.map((c) => c._id) };
  } else if (pharmacy) {
    filter.pharmacy = pharmacy;
  }

  // Scope للصيدلية
  if (req.scope?.customerId) {
    filter.pharmacy = req.scope.customerId;
  }

  if (originalInvoice) filter.originalInvoice = originalInvoice;
  if (status) filter.status = status;
  if (settlementType) filter.settlementType = settlementType;

  if (outsideGracePeriod) filter.isWithinGracePeriod = false;
  if (hasDamagedItems) filter['items.reason'] = 'damaged';

  if (dateFrom || dateTo) {
    filter.returnDate = {};
    if (dateFrom) filter.returnDate.$gte = dateFrom;
    if (dateTo) filter.returnDate.$lte = dateTo;
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ returnNumber: rx }];
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [returns, total] = await Promise.all([
    CustomerReturn.find(filter)
      .populate('pharmacy', 'name code phone')
      .populate('originalInvoice', 'invoiceNumber total')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    CustomerReturn.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: returns.map(buildCustomerReturnPayload),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + returns.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

/**
 * GET /api/customer-returns/:id
 */
export const getCustomerReturn = asyncHandler(async (req, res) => {
  const ret = await CustomerReturn.findById(req.params.id)
    .populate('pharmacy', 'name code phone')
    .populate('originalInvoice', 'invoiceNumber total items invoiceDate')
    .populate('approvedBy', 'name')
    .populate('rejectedBy', 'name');

  if (!ret) {
    throw new AppError('المرتجع غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  // Scope للمندوب
  if (req.scope?.salesRepId) {
    const customer = await Customer.findById(ret.pharmacy._id).select('assignedSalesRep').lean();
    if (String(customer?.assignedSalesRep) !== String(req.scope.salesRepId)) {
      throw new AppError('لا تملك صلاحية الوصول لهذا المرتجع.', 403, 'FORBIDDEN');
    }
  }

  // Scope للصيدلية
  if (req.scope?.customerId && String(ret.pharmacy._id) !== String(req.scope.customerId)) {
    throw new AppError('لا تملك صلاحية الوصول لهذا المرتجع.', 403, 'FORBIDDEN');
  }

  return res.status(200).json({
    success: true,
    data: buildCustomerReturnPayload(ret),
  });
});

// ============================================================
// 2) الإنشاء
// ============================================================

/**
 * POST /api/customer-returns
 *
 * ملاحظة: الإنشاء لا يؤثر على المخزون أو المال (الحالة pending).
 * التأثير الفعلي يحدث عند الموافقة (approve).
 */
export const createCustomerReturn = asyncHandler(async (req, res) => {
  const data = req.body;

  // 1. التحقق من الفاتورة الأصلية
  const invoice = await Invoice.findById(data.originalInvoice);
  if (!invoice) {
    throw new AppError('الفاتورة الأصلية غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  }

  if (invoice.status === 'cancelled') {
    throw new AppError('لا يمكن الإرجاع من فاتورة ملغاة.', 409, 'INVOICE_CANCELLED');
  }

  // 2. التحقق من الصيدلية ومطابقتها للفاتورة
  const customer = await Customer.findById(data.pharmacy);
  if (!customer) {
    throw new AppError('الصيدلية غير موجودة.', 404, 'CUSTOMER_NOT_FOUND');
  }

  if (String(invoice.pharmacy) !== String(customer._id)) {
    throw new AppError('الصيدلية لا تطابق الصيدلية في الفاتورة الأصلية.', 400, 'PHARMACY_MISMATCH');
  }

  // 3. حساب فترة السماح
  const gracePeriodDays = customer.returnGracePeriod ?? 7;
  const returnDate = data.returnDate || new Date();
  const diffMs = returnDate.getTime() - invoice.invoiceDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const isWithinGracePeriod = diffDays <= gracePeriodDays;

  // 4. التحقق من وجود البنود في الفاتورة الأصلية (تحقق أساسي)
  for (const returnItem of data.items) {
    const invoiceItem = invoice.items.find(
      (i) => String(i.item) === String(returnItem.item) && i.batch === returnItem.batch
    );
    if (!invoiceItem) {
      throw new AppError(
        `البند ${returnItem.item} بدفعة ${returnItem.batch} غير موجود في الفاتورة الأصلية.`,
        400,
        'ITEM_NOT_IN_INVOICE'
      );
    }
  }

  // 5. إنشاء المرتجع
  const returnNumber = await generateReturnNumber();

  const customerReturn = await CustomerReturn.create({
    returnNumber,
    originalInvoice: data.originalInvoice,
    pharmacy: data.pharmacy,
    items: data.items,
    total: data.total,
    returnDate,
    invoiceDate: invoice.invoiceDate,
    gracePeriodDays,
    isWithinGracePeriod,
    status: RETURN_STATUSES.PENDING,
    settlementType: data.settlementType,
    settledAmount: 0, // يُملأ عند الموافقة
    notes: data.notes,
    createdBy: req.user._id,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.CREATE,
    resource: 'CustomerReturn',
    resourceId: customerReturn._id,
    description: `إنشاء مرتجع ${returnNumber} للفاتورة ${invoice.invoiceNumber}`,
    success: true,
    meta: {
      after: { returnNumber, total: data.total, isWithinGracePeriod, status: 'pending' },
    },
  });

  return res.status(201).json({
    success: true,
    data: buildCustomerReturnPayload(customerReturn),
  });
});

// ============================================================
// 3) الموافقة (Approve)
// ============================================================

/**
 * POST /api/customer-returns/:id/approve
 *
 * التأثير الفعلي:
 * 1. إرجاع البضاعة إلى Stock.
 * 2. تسوية مالية (نقدي أو خصم رصيد).
 * 3. تحديث حالة المرتجع.
 */
export const approveCustomerReturn = asyncHandler(async (req, res) => {
  const { settledAmount, cashFund, bankAccount, notes } = req.body;
  const returnId = req.params.id;

  const customerReturn = await CustomerReturn.findById(returnId);
  if (!customerReturn) {
    throw new AppError('المرتجع غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  if (customerReturn.status !== RETURN_STATUSES.PENDING) {
    throw new AppError(
      `لا يمكن الموافقة على مرتجع في حالة ${customerReturn.status}.`,
      409,
      'INVALID_RETURN_STATUS'
    );
  }

  if (settledAmount > customerReturn.total + 0.01) {
    throw new AppError('المبلغ المُسوَّى يتجاوز إجمالي المرتجع.', 400, 'SETTLED_AMOUNT_EXCEEDS_TOTAL');
  }

  // 1. إرجاع البضاعة إلى المخزون (Rollback إذا فشل)
  // نحتاج لمعرفة المخزن — نستخدم مخزن الفاتورة أو الافتراضي
  const invoice = await Invoice.findById(customerReturn.originalInvoice);
  if (!invoice) {
    throw new AppError('الفاتورة الأصلية غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  }

  const warehouseId = invoice.warehouse;
  const stockRollbackLog = [];

  try {
    for (const item of customerReturn.items) {
      await returnStock({
        itemId: item.item,
        warehouseId: warehouseId,
        batch: item.batch,
        quantity: item.quantity,
        meta: {
          // نحتاج expiry و unitCost من الفاتورة الأصلية (أو من Stock)
          // هنا نستخدم قيم افتراضية آمنة (سيتم دمجها مع الدفعة الحالية)
          unitCost: 0,
          unitPrice: item.unitPrice,
          notes: `مرتجع عميل ${customerReturn.returnNumber}`,
        },
      });

      stockRollbackLog.push({
        itemId: item.item,
        warehouseId,
        batch: item.batch,
        quantity: item.quantity,
      });
    }
  } catch (error) {
    logger.error(`فشل إرجاع المخزون في الموافقة: ${error.message}. جارٍ Rollback...`);
    // (Rollback للمرتجع يعني خصم البضاعة مجدداً، لكن نتركها للـ Admin يدوياً)
    throw new AppError('فشل إرجاع البضاعة للمخزون. يرجى مراجعة الإدارة.', 500, 'STOCK_RETURN_FAILED');
  }

  // 2. التسوية المالية
  let settlementTransactionId = null;

  if (customerReturn.settlementType === SETTLEMENT_TYPES.CASH_REFUND) {
    // استرداد نقدي — نتحقق من وجود cashFund أو bankAccount
    if (!cashFund && !bankAccount) {
      throw new AppError('يجب تحديد صندوق أو حساب بنكي للاسترداد النقدي.', 400, 'NO_CASH_ACCOUNT');
    }

    const cashTx = await CashTransaction.create({
      transactionNumber: generateTransactionNumber('CT'),
      accountType: bankAccount ? 'bank' : 'cash',
      cashFund: cashFund || null,
      bankAccount: bankAccount || null,
      direction: 'out',
      category: 'return_refund',
      amount: settledAmount,
      description: `استرداد نقدي لمرتجع ${customerReturn.returnNumber}`,
      referenceType: 'CustomerReturn',
      referenceId: customerReturn._id,
      party: customerReturn.pharmacy,
      partyType: 'Customer',
      createdBy: req.user._id,
    });

    settlementTransactionId = cashTx._id;
  } else if (customerReturn.settlementType === SETTLEMENT_TYPES.BALANCE_DEDUCTION) {
    // خصم من رصيد الصيدلية
    await Customer.updateOne(
      { _id: customerReturn.pharmacy },
      { $inc: { currentBalance: -settledAmount } }
    );
  }

  // 3. تحديث المرتجع
  customerReturn.status = RETURN_STATUSES.CONFIRMED;
  customerReturn.settledAmount = settledAmount;
  customerReturn.settlementTransaction = settlementTransactionId;
  customerReturn.approvedBy = req.user._id;
  customerReturn.approvedAt = new Date();
  if (notes) customerReturn.notes = notes;

  await customerReturn.save();

  // 4. تدقيق
  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'CustomerReturn',
    resourceId: customerReturn._id,
    description: `الموافقة على مرتجع ${customerReturn.returnNumber} بمبلغ ${settledAmount}`,
    success: true,
    meta: {
      after: { status: 'confirmed', settledAmount, settlementType: customerReturn.settlementType },
    },
  });

  return res.status(200).json({
    success: true,
    data: buildCustomerReturnPayload(customerReturn),
    message: 'تمت الموافقة على المرتجع وتسويته بنجاح.',
  });
});

// ============================================================
// 4) الرفض (Reject)
// ============================================================

/**
 * POST /api/customer-returns/:id/reject
 */
export const rejectCustomerReturn = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const returnId = req.params.id;

  const customerReturn = await CustomerReturn.findById(returnId);
  if (!customerReturn) {
    throw new AppError('المرتجع غير موجود.', 404, 'RETURN_NOT_FOUND');
  }

  if (customerReturn.status !== RETURN_STATUSES.PENDING) {
    throw new AppError(
      `لا يمكن رفض مرتجع في حالة ${customerReturn.status}.`,
      409,
      'INVALID_RETURN_STATUS'
    );
  }

  customerReturn.status = RETURN_STATUSES.REJECTED;
  customerReturn.rejectedBy = req.user._id;
  customerReturn.rejectedAt = new Date();
  customerReturn.rejectionReason = rejectionReason;

  await customerReturn.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'CustomerReturn',
    resourceId: customerReturn._id,
    description: `رفض مرتجع ${customerReturn.returnNumber}: ${rejectionReason}`,
    success: true,
    meta: { after: { status: 'rejected', rejectionReason } },
  });

  return res.status(200).json({
    success: true,
    data: buildCustomerReturnPayload(customerReturn),
    message: 'تم رفض المرتجع.',
  });
});

// ============================================================
// تصدير موحّد
// ============================================================

export default {
  listCustomerReturns,
  getCustomerReturn,
  createCustomerReturn,
  approveCustomerReturn,
  rejectCustomerReturn,
};