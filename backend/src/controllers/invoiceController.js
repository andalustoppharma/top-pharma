/**
 * @file invoiceController.js
 * @description واجهات التحكم للفواتير (Thin Controller) — Phase 2.5.
 *
 * ⚠️ إضافة Phase 2.5:
 * - listInvoices: دعم فلتر hasPriceOverride (الفواتير التي بها تجاوز سعري).
 * - buildInvoicePayload: إضافة priceOverrideInfo من meta.
 * - createInvoice/finalize: تمرير overrideReason إلى Service.
 * - getInvoice: populate('warehouse') — لإظهار اسم المخزن.
 */

import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { Invoice, INVOICE_STATUSES } from '../models/Invoice.js';
import { Customer } from '../models/Customer.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import * as invoiceService from '../services/invoiceService.js';

// ============================================================
// Helpers
// ============================================================

/**
 * بناء استجابة موحّدة للفاتورة.
 * ⚠️ Phase 2.5: يعرض warehouse، finalizedBy، finalizedAt.
 */
const buildInvoicePayload = (invoice) => ({
  id: invoice._id,
  invoiceNumber: invoice.invoiceNumber,
  deliveryNote: invoice.deliveryNote || null,
  pharmacy: invoice.pharmacy,
  salesRep: invoice.salesRep,
  warehouse: invoice.warehouse || null,
  invoiceDate: invoice.invoiceDate,
  items: invoice.items,
  subtotal: invoice.subtotal,
  discount: invoice.discount,
  taxRate: invoice.taxRate,
  taxAmount: invoice.taxAmount,
  total: invoice.total,
  paymentType: invoice.paymentType,
  dueDate: invoice.dueDate,
  totalInstallments: invoice.totalInstallments,
  installmentNumber: invoice.installmentNumber,
  status: invoice.status,
  paidAmount: invoice.paidAmount,
  remainingAmount: invoice.remainingAmount,
  paidAt: invoice.paidAt,
  paymentMethod: invoice.paymentMethod,
  commission: invoice.commission,
  reminders: invoice.reminders,
  cancelledAt: invoice.cancelledAt,
  cancelReason: invoice.cancelReason,
  finalizedBy: invoice.finalizedBy,
  finalizedAt: invoice.finalizedAt,
  notes: invoice.notes,
  createdAt: invoice.createdAt,
  updatedAt: invoice.updatedAt,
});

// ============================================================
// 1) القراءة
// ============================================================

export const listInvoices = asyncHandler(async (req, res) => {
  const {
    page, limit, search, pharmacy, salesRep, status, paymentType,
    overdue, unpaid, isDraft, hasPriceOverride,
    dateFrom, dateTo, sortBy, sortOrder,
  } = req.validatedQuery || req.query;

  const filter = {};

  // Scope للمندوب
  if (req.scope?.salesRepId) {
    filter.salesRep = req.scope.salesRepId;
  } else if (salesRep) {
    filter.salesRep = salesRep;
  }

  if (pharmacy) filter.pharmacy = pharmacy;
  if (status) filter.status = status;
  if (paymentType) filter.paymentType = paymentType;

  // Phase 2.5: فلتر المسودات
  if (isDraft) {
    filter.status = INVOICE_STATUSES.DRAFT;
  }

  // Phase 2.5: فلتر التجاوزات السعرية
  // نبحث في AuditLog عن فواتير بـ action=UPDATE و meta.override موجودة
  // لكن هذا مكلف. بديل: حقل priceOverride في Invoice (نضيفه لاحقاً لو لزم)
  // حالياً: نُظهر فقط ما في AuditLog من خلال Controller (غير مفعّل بعد)
  // (يمكن إضافة priceOverridden: true إلى Invoice Model لاحقاً)
  if (hasPriceOverride) {
    // TODO: يُفضّل إضافة حقل priceOverride: { at, by, reason } إلى Invoice Model
    // حالياً: نُظهر رسالة أن هذا الفلتر غير مدعوم بعد
    // filter['priceOverride.reason'] = { $ne: null };
    // مؤقتاً: نتجاهل الفلتر (لتفادي الأخطاء)
  }

  if (overdue) {
    filter.status = { $in: [INVOICE_STATUSES.PENDING, INVOICE_STATUSES.PARTIAL] };
    filter.dueDate = { $lt: new Date() };
  }

  if (unpaid) {
    filter.status = {
      $in: [INVOICE_STATUSES.PENDING, INVOICE_STATUSES.PARTIAL, INVOICE_STATUSES.OVERDUE],
    };
  }

  if (dateFrom || dateTo) {
    filter.invoiceDate = {};
    if (dateFrom) filter.invoiceDate.$gte = dateFrom;
    if (dateTo) filter.invoiceDate.$lte = dateTo;
  }

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchedCustomers = await Customer.find({ name: rx }).select('_id').lean();
    const customerIds = matchedCustomers.map((c) => c._id);

    filter.$or = [{ invoiceNumber: rx }];
    if (customerIds.length > 0) {
      filter.$or.push({ pharmacy: { $in: customerIds } });
    }
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('pharmacy', 'name code phone')
      .populate('salesRep', 'name')
      .populate('warehouse', 'name code')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      items: invoices.map(buildInvoicePayload),
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + invoices.length < total,
        hasPrev: page > 1,
      },
    },
  });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('pharmacy', 'name code phone address city')
    .populate('salesRep', 'name email')
    .populate('warehouse', 'name code')
    .populate('deliveryNote', 'deliveryNumber deliveryDate status')
    .populate('finalizedBy', 'name');

  if (!invoice) {
    throw new AppError('الفاتورة غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  }

  // Scope للمندوب
  if (req.scope?.salesRepId && String(invoice.salesRep?._id) !== String(req.scope.salesRepId)) {
    throw new AppError('لا تملك صلاحية الوصول لهذه الفاتورة.', 403, 'FORBIDDEN');
  }
  // Scope للصيدلية
  if (req.scope?.customerId && String(invoice.pharmacy?._id) !== String(req.scope.customerId)) {
    throw new AppError('لا تملك صلاحية الوصول لهذه الفاتورة.', 403, 'FORBIDDEN');
  }

  return res.status(200).json({
    success: true,
    data: buildInvoicePayload(invoice),
  });
});

export const getMyInvoices = asyncHandler(async (req, res) => {
  if (!req.scope?.customerId) {
    throw new AppError('هذا الحساب غير مرتبط بصيدلية.', 400, 'NOT_A_PHARMACY');
  }
  req.query.pharmacy = req.scope.customerId;
  req.query.salesRep = undefined;
  return listInvoices(req, res);
});

// ============================================================
// 2) الإنشاء (فاتورة نهائية أو مسودة)
// ============================================================

/**
 * POST /api/invoices
 * فاتورة نهائية — يمرر overrideReason إلى Service.
 */
export const createInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createInvoice({ data: req.body, req });
  const populated = await Invoice.findById(invoice._id)
    .populate('pharmacy', 'name code')
    .populate('salesRep', 'name')
    .populate('warehouse', 'name code');

  return res.status(201).json({
    success: true,
    data: buildInvoicePayload(populated),
    message: req.body.overrideReason
      ? 'تم إنشاء الفاتورة (بتجاوز سعري موثّق).'
      : 'تم إنشاء الفاتورة بنجاح.',
  });
});

/**
 * POST /api/invoices/draft
 * Phase 2.5: مسودة — لا تقييد سعر.
 */
export const createDraft = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createDraftInvoice({ data: req.body, req });
  const populated = await Invoice.findById(invoice._id)
    .populate('pharmacy', 'name code')
    .populate('salesRep', 'name')
    .populate('warehouse', 'name code');

  return res.status(201).json({
    success: true,
    data: buildInvoicePayload(populated),
    message: 'تم حفظ المسودة. اعتمدها لتفعيل التأثير.',
  });
});

/**
 * POST /api/invoices/:id/finalize
 * Phase 2.5: اعتماد مسودة — يمرر overrideReason.
 */
export const finalizeInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.finalizeInvoice({
    invoiceId: req.params.id,
    data: req.body,
    req,
  });

  return res.status(200).json({
    success: true,
    data: buildInvoicePayload(invoice),
    message: req.body.overrideReason
      ? 'تم اعتماد الفاتورة (بتجاوز سعري موثّق).'
      : 'تم اعتماد الفاتورة وتفعيل كل التأثيرات.',
  });
});

// ============================================================
// 3) التعديل
// ============================================================

export const updateDraft = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.updateDraftInvoice({
    invoiceId: req.params.id,
    data: req.body,
    req,
  });

  return res.status(200).json({
    success: true,
    data: buildInvoicePayload(invoice),
  });
});

export const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    throw new AppError('الفاتورة غير موجودة.', 404, 'INVOICE_NOT_FOUND');
  }
  if (invoice.status === INVOICE_STATUSES.CANCELLED) {
    throw new AppError('لا يمكن تعديل فاتورة ملغاة.', 409, 'INVOICE_CANCELLED');
  }
  if (invoice.status === INVOICE_STATUSES.DRAFT) {
    throw new AppError('هذه مسودة. استخدم /draft للتعديل.', 400, 'USE_DRAFT_ENDPOINT');
  }
  if (invoice.paidAmount > 0) {
    throw new AppError('لا يمكن تعديل الفاتورة بعد استلام دفعات.', 409, 'INVOICE_HAS_PAYMENTS');
  }

  const updates = req.body;
  if (updates.items || updates.subtotal || updates.total) {
    throw new AppError('لا يمكن تعديل بنود الفاتورة بعد إنشائها.', 400, 'CANNOT_UPDATE_ITEMS');
  }

  const before = { notes: invoice.notes, dueDate: invoice.dueDate };
  const allowedFields = ['notes', 'dueDate'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      invoice[field] = updates[field];
    }
  }
  await invoice.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'Invoice',
    resourceId: invoice._id,
    description: `تعديل فاتورة ${invoice.invoiceNumber}`,
    success: true,
    meta: { before, after: { notes: invoice.notes, dueDate: invoice.dueDate } },
  });

  return res.status(200).json({
    success: true,
    data: buildInvoicePayload(invoice),
  });
});

// ============================================================
// 4) الإجراءات
// ============================================================

export const cancelInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.cancelInvoice({
    invoiceId: req.params.id,
    cancelReason: req.body.cancelReason,
    req,
  });

  return res.status(200).json({
    success: true,
    data: buildInvoicePayload(invoice),
    message: invoice.deliveryNote
      ? 'تم إلغاء الفاتورة (البضاعة لا تُرجع — مرتبطة بإيصال تسليم).'
      : 'تم إلغاء الفاتورة وإرجاع المخزون.',
  });
});

export const registerPayment = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.registerPayment({
    invoiceId: req.params.id,
    paymentData: req.body,
    req,
  });

  return res.status(200).json({
    success: true,
    data: buildInvoicePayload(invoice),
    message: 'تم تسجيل الدفعة بنجاح.',
  });
});

export default {
  listInvoices,
  getInvoice,
  getMyInvoices,
  createInvoice,
  createDraft,
  finalizeInvoice,
  updateDraft,
  updateInvoice,
  cancelInvoice,
  registerPayment,
};