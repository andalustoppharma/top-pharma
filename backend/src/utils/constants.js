/**
 * @file constants.js
 * @description
 * الثوابت المشتركة في التطبيق — Phase 0 + 1 + 2 + 2.5 + 3.
 *
 * لماذا هذا الملف؟
 * - نُوحّد قيم enum/status في مكان واحد (بلا magic strings).
 * - يُستخدم في Controllers/Services/Jobs.
 * - يمنع أخطاء الكتابة (typos) في status/action/etc.
 *
 * المبادئ:
 *  - كل ثابت مجمّد (Object.freeze) — لا تعديل.
 *  - القيم تتوافق مع enum في النماذج.
 */

/* ─────────────────────────────────────────────────────────────
 * 1) سجل التدقيق (Audit Log)
 * ─────────────────────────────────────────────────────────────
 * action: نوع العملية (يُستخدم في logAuditEvent).
 */
export const AUDIT_ACTIONS = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL',
  FINALIZE: 'FINALIZE',
  PAYMENT: 'PAYMENT',
  TRANSFER: 'TRANSFER',
  ADJUST: 'ADJUST',
  REVERSE: 'REVERSE',
  EXPORT: 'EXPORT',
  IMPORT: 'IMPORT',
});

/* ─────────────────────────────────────────────────────────────
 * 2) أكواد الأدوار (Role Codes)
 * ─────────────────────────────────────────────────────────────
 */
export const ROLE_CODES = Object.freeze({
  ADMIN: 'admin',
  STOREKEEPER: 'storekeeper',
  ACCOUNTANT: 'accountant',
  SALES_REP: 'sales_rep',
  PHARMACY: 'pharmacy',
});

/* ─────────────────────────────────────────────────────────────
 * 3) حالات الفاتورة (Invoice Status)
 * ─────────────────────────────────────────────────────────────
 */
export const INVOICE_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
});

/* ─────────────────────────────────────────────────────────────
 * 4) حالات الشيك (Check Status) — النسخة المبسطة (4 حالات)
 * ─────────────────────────────────────────────────────────────
 * pending → (settle) → paid
 *         → (cancel) → cancelled
 * paid    → (bounce) → bounced
 */
export const CHECK_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  BOUNCED: 'bounced',
  CANCELLED: 'cancelled',
});

export const CHECK_TYPES = Object.freeze({
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
});

/* ─────────────────────────────────────────────────────────────
 * 5) أنواع الدفع (Payment Types)
 * ─────────────────────────────────────────────────────────────
 */
export const PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENTS: 'installments',
});

/* ─────────────────────────────────────────────────────────────
 * 6) طرق الدفع (Payment Methods)
 * ─────────────────────────────────────────────────────────────
 */
export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
  CHECK: 'check',
});

/* ─────────────────────────────────────────────────────────────
 * 7) الحركات النقدية (Cash Transactions)
 * ─────────────────────────────────────────────────────────────
 */
export const CASH_TRANSACTION_DIRECTIONS = Object.freeze({
  IN: 'in',
  OUT: 'out',
});

export const CASH_TRANSACTION_METHODS = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
  CHECK: 'check',
});

export const CASH_TRANSACTION_REFERENCES = Object.freeze({
  MANUAL: 'manual',
  INVOICE: 'invoice',
  DELIVERY_NOTE: 'delivery_note',
  CUSTOMER_RETURN: 'customer_return',
  PURCHASE: 'purchase',
  SUPPLIER_RETURN: 'supplier_return',
  CHECK: 'check',
  TRANSFER: 'transfer',
  EXPENSE: 'expense',
});

/* ─────────────────────────────────────────────────────────────
 * 8) حالات مرتجع العميل (Customer Return)
 * ─────────────────────────────────────────────────────────────
 */
export const CUSTOMER_RETURN_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const CUSTOMER_RETURN_SETTLEMENT = Object.freeze({
  CASH_REFUND: 'cash_refund',
  BALANCE_DEDUCTION: 'balance_deduction',
});

/* ─────────────────────────────────────────────────────────────
 * 9) حالات مرتجع المورد (Supplier Return)
 * ─────────────────────────────────────────────────────────────
 */
export const SUPPLIER_RETURN_STATUS = Object.freeze({
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

export const SUPPLIER_RETURN_SETTLEMENT = Object.freeze({
  CREDIT_NOTE: 'credit_note',
  REPLACEMENT: 'replacement',
  CASH_REFUND: 'cash_refund',
});

/* ─────────────────────────────────────────────────────────────
 * 10) حالات إيصال الاستلام (Purchase Receipt)
 * ─────────────────────────────────────────────────────────────
 */
export const PURCHASE_RECEIPT_STATUS = Object.freeze({
  DRAFT: 'draft',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
});

/* ─────────────────────────────────────────────────────────────
 * 11) حالات إيصال التسليم (Delivery Note)
 * ─────────────────────────────────────────────────────────────
 */
export const DELIVERY_NOTE_STATUS = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

/* ─────────────────────────────────────────────────────────────
 * 12) أنواع القيود المحاسبية (Accounting Entry Types)
 * ─────────────────────────────────────────────────────────────
 */
export const ACCOUNTING_ENTRY_TYPES = Object.freeze({
  SALE_CASH: 'SALE_CASH',
  SALE_CREDIT: 'SALE_CREDIT',
  SALE_RETURN: 'SALE_RETURN',
  CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
  PURCHASE: 'PURCHASE',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  CHECK_RECEIVED: 'CHECK_RECEIVED',
  CHECK_COLLECTED: 'CHECK_COLLECTED',
  CHECK_BOUNCED: 'CHECK_BOUNCED',
  CHECK_ISSUED: 'CHECK_ISSUED',
  CHECK_PAID: 'CHECK_PAID',
  CASH_TRANSFER: 'CASH_TRANSFER',
  CASH_DEPOSIT: 'CASH_DEPOSIT',
  CASH_WITHDRAWAL: 'CASH_WITHDRAWAL',
  EXPENSE: 'EXPENSE',
  OPENING: 'OPENING',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
});

/* ─────────────────────────────────────────────────────────────
 * 13) أنواع الإشعارات (Notification Types)
 * ─────────────────────────────────────────────────────────────
 */
export const NOTIFICATION_TYPES = Object.freeze({
  EXPIRY_SOON: 'expiry_soon',
  LOW_STOCK: 'low_stock',
  INVOICE_DUE: 'invoice_due',
  CHECK_DUE_SOON: 'check_due_soon',
  CHECK_DUE_TODAY: 'check_due_today',
  CHECK_OVERDUE: 'check_overdue',
  PRICE_OVERRIDE: 'price_override',
});

/* ─────────────────────────────────────────────────────────────
 * 14) أنواع الدفعات (Stock Batch)
 * ─────────────────────────────────────────────────────────────
 */
export const WAREHOUSE_TYPES = Object.freeze({
  MAIN: 'main',
  BRANCH: 'branch',
});

/* ─────────────────────────────────────────────────────────────
 * 15) ثوابت مالية
 * ─────────────────────────────────────────────────────────────
 */
export const CURRENCY = 'SDG';
export const ROUNDING_TOLERANCE = 0.01;

/* ─────────────────────────────────────────────────────────────
 * 16) التصدير الافتراضي (للتوافق إن استُخدم `import constants from ...`)
 * ─────────────────────────────────────────────────────────────
 */
export default {
  AUDIT_ACTIONS,
  ROLE_CODES,
  INVOICE_STATUS,
  CHECK_STATUS,
  CHECK_TYPES,
  PAYMENT_TYPES,
  PAYMENT_METHODS,
  CASH_TRANSACTION_DIRECTIONS,
  CASH_TRANSACTION_METHODS,
  CASH_TRANSACTION_REFERENCES,
  CUSTOMER_RETURN_STATUS,
  CUSTOMER_RETURN_SETTLEMENT,
  SUPPLIER_RETURN_STATUS,
  SUPPLIER_RETURN_SETTLEMENT,
  PURCHASE_RECEIPT_STATUS,
  DELIVERY_NOTE_STATUS,
  ACCOUNTING_ENTRY_TYPES,
  NOTIFICATION_TYPES,
  WAREHOUSE_TYPES,
  CURRENCY,
  ROUNDING_TOLERANCE,
};