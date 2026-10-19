/**
 * @file AccountingEntry.js
 * @description
 * قيد محاسبي مبسّط (مدين/دائن) لكل عملية مالية.
 *
 * لماذا هذا الملف؟
 * - متطلب: "النظام المالي المبسط (3 تقارير + شامل)".
 * - لا نُطبّق دفتر يومية كامل (متطلب صريح: لا دفتر يومية كامل).
 * - كل عملية مالية تُولّد قيداً بسيطاً (حساب مدين + حساب دائن + مبلغ).
 * - أنواع ثابتة (SALE_CASH, PURCHASE, ...) لتسهيل التقارير الشاملة.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع القيود المحاسبية.
 * @readonly
 * @enum {string}
 */
export const ACCOUNTING_ENTRY_TYPES = Object.freeze({
  SALE_CASH: 'SALE_CASH',
  SALE_CREDIT: 'SALE_CREDIT',
  SALE_RETURN: 'SALE_RETURN',
  PURCHASE: 'PURCHASE',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT',
  CASH_IN: 'CASH_IN',
  CASH_OUT: 'CASH_OUT',
  EXPENSE: 'EXPENSE',
  SALARY: 'SALARY',
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
});

/**
 * Schema طرف القيد (مدين/دائن).
 */
const entrySideSchema = new Schema(
  {
    account: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/**
 * Schema القيد المحاسبي.
 */
const accountingEntrySchema = new Schema(
  {
    /**
     * نوع القيد.
     */
    type: {
      type: String,
      enum: Object.values(ACCOUNTING_ENTRY_TYPES),
      required: [true, 'نوع القيد مطلوب.'],
      index: true,
    },

    /**
     * نوع المرجع.
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
     * الطرف المدين.
     */
    debit: {
      type: entrySideSchema,
      required: true,
    },

    /**
     * الطرف الدائن.
     */
    credit: {
      type: entrySideSchema,
      required: true,
    },

    /**
     * المبلغ الإجمالي للقيد (يساوي debit.amount = credit.amount).
     */
    amount: {
      type: Number,
      required: true,
      min: [0.0001, 'المبلغ يجب أن يكون أكبر من صفر.'],
    },

    /**
     * وصف القيد.
     */
    description: {
      type: String,
      trim: true,
      required: [true, 'الوصف مطلوب.'],
      maxlength: [500, 'الوصف طويل جداً.'],
    },

    /**
     * تاريخ القيد.
     */
    entryDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * من أنشأ القيد؟
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
accountingEntrySchema.index({ type: 1, entryDate: -1 });
accountingEntrySchema.index({ referenceType: 1, referenceId: 1 });
accountingEntrySchema.index({ entryDate: -1 });

/**
 * قبل الحفظ: نتحقق أن debit = credit = amount.
 */
accountingEntrySchema.pre('save', function preSave(next) {
  if (
    this.debit &&
    this.credit &&
    this.debit.amount !== this.credit.amount
  ) {
    return next(
      new Error('القيد المحاسبي غير متوازن: مدين ≠ دائن.')
    );
  }
  if (this.debit && !this.amount) {
    this.amount = this.debit.amount;
  }
  return next();
});

export const AccountingEntry = model('AccountingEntry', accountingEntrySchema);

export default AccountingEntry;