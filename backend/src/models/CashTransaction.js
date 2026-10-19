/**
 * @file CashTransaction.js
 * @description
 * حركة نقدية في الصندوق أو البنك — سجل غير قابل للتعديل بعد التأكيد.
 *
 * لماذا هذا الملف؟
 * - كل دخول/خروج نقدي يُوثَّق هنا مع balanceBefore/balanceAfter للتدقيق.
 * - نحتفظ بـ referenceType/referenceId لربط الحركة بمصدرها (فاتورة، مرتجع، راتب...).
 * - لا نحذف الحركة؛ نُسجّل حركة عكسية عند الحاجة.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع الحسابات.
 * @readonly
 * @enum {string}
 */
export const CASH_ACCOUNT_TYPES = Object.freeze({
  CASH: 'cash',
  BANK: 'bank',
});

/**
 * اتجاه الحركة.
 * @readonly
 * @enum {string}
 */
export const CASH_DIRECTIONS = Object.freeze({
  IN: 'in',
  OUT: 'out',
});

/**
 * تصنيفات الحركة.
 * @readonly
 * @enum {string}
 */
export const CASH_CATEGORIES = Object.freeze({
  CUSTOMER_PAYMENT: 'customer_payment',
  SUPPLIER_PAYMENT: 'supplier_payment',
  SALE_CASH: 'sale_cash',
  RETURN_REFUND: 'return_refund',
  EXPENSE: 'expense',
  SALARY: 'salary',
  SALES_REP_ADVANCE: 'sales_rep_advance',
  SALES_REP_SETTLEMENT: 'sales_rep_settlement',
  CHECK_COLLECTION: 'check_collection',
  CHECK_PAYMENT: 'check_payment',
  CAPITAL: 'capital',
  TRANSFER: 'transfer',
  OTHER: 'other',
});

/**
 * Schema الحركة النقدية.
 */
const cashTransactionSchema = new Schema(
  {
    /**
     * رقم الحركة الفريد.
     */
    transactionNumber: {
      type: String,
      required: [true, 'رقم الحركة مطلوب.'],
      unique: true,
      trim: true,
      index: true,
    },

    /**
     * نوع الحساب (نقدي/بنكي).
     */
    accountType: {
      type: String,
      enum: Object.values(CASH_ACCOUNT_TYPES),
      required: true,
      index: true,
    },

    /**
     * الصندوق (عند accountType='cash').
     */
    cashFund: {
      type: Schema.Types.ObjectId,
      ref: 'CashFund',
      default: null,
      index: true,
    },

    /**
     * الحساب البنكي (عند accountType='bank').
     */
    bankAccount: {
      type: Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
      index: true,
    },

    /**
     * الاتجاه (دخول/خروج).
     */
    direction: {
      type: String,
      enum: Object.values(CASH_DIRECTIONS),
      required: true,
      index: true,
    },

    /**
     * التصنيف.
     */
    category: {
      type: String,
      enum: Object.values(CASH_CATEGORIES),
      default: CASH_CATEGORIES.OTHER,
      index: true,
    },

    /**
     * المبلغ.
     */
    amount: {
      type: Number,
      required: [true, 'المبلغ مطلوب.'],
      min: [0.0001, 'المبلغ يجب أن يكون أكبر من صفر.'],
    },

    /**
     * الرصيد قبل.
     */
    balanceBefore: {
      type: Number,
      default: 0,
    },

    /**
     * الرصيد بعد.
     */
    balanceAfter: {
      type: Number,
      default: 0,
    },

    /**
     * نوع المرجع (Invoice, CustomerReturn, Salary...).
     */
    referenceType: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },

    /**
     * مُعرّف المرجع.
     */
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    /**
     * وصف مختصر.
     */
    description: {
      type: String,
      trim: true,
      required: [true, 'الوصف مطلوب.'],
      maxlength: [500, 'الوصف طويل جداً.'],
    },

    /**
     * تاريخ الحركة.
     */
    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * الطرف الآخر (صيدلية/مورّد/مندوب).
     */
    party: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    /**
     * نوع الطرف.
     */
    partyType: {
      type: String,
      enum: ['Customer', 'Supplier', 'User', null],
      default: null,
    },

    /**
     * رقم مرجعي خارجي (رقم شيك، رقم حوالة...).
     */
    externalReference: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * هل الحركة مُلغاة؟
     * لا نحذف، نُلغي فقط.
     */
    isCancelled: {
      type: Boolean,
      default: false,
      index: true,
    },

    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, trim: true, default: '' },

    /**
     * من أنشأ الحركة؟
     */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * فهارس التقارير.
 */
cashTransactionSchema.index({ cashFund: 1, transactionDate: -1 });
cashTransactionSchema.index({ bankAccount: 1, transactionDate: -1 });
cashTransactionSchema.index({ category: 1, transactionDate: -1 });
cashTransactionSchema.index({ referenceType: 1, referenceId: 1 });

export const CashTransaction = model('CashTransaction', cashTransactionSchema);

export default CashTransaction;