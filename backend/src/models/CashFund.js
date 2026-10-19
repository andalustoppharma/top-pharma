/**
 * @file CashFund.js
 * @description
 * نموذج الصندوق النقدي (الخزينة النقدية).
 *
 * لماذا هذا الملف؟
 * - نُوفّر صناديق نقدية متعددة (رئيسي + فرعي) لدعم التوسّع.
 * - كل صندوق له رصيد حالي يُحدَّث من CashTransaction.
 * - لا نحذف صندوقاً فيه حركة؛ نُعطّله فقط.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Schema الصندوق النقدي.
 */
const cashFundSchema = new Schema(
  {
    /**
     * اسم الصندوق (مثال: الصندوق الرئيسي).
     */
    name: {
      type: String,
      required: [true, 'اسم الصندوق مطلوب.'],
      trim: true,
      minlength: [2, 'الاسم قصير جداً.'],
      maxlength: [100, 'الاسم طويل جداً.'],
    },

    /**
     * كود فريد.
     */
    code: {
      type: String,
      required: [true, 'كود الصندوق مطلوب.'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    /**
     * الرصيد الحالي.
     */
    currentBalance: {
      type: Number,
      default: 0,
    },

    /**
     * الرصيد الافتتاحي (للرجوع إليه).
     */
    openingBalance: {
      type: Number,
      default: 0,
    },

    /**
     * المخزن/الفرع المرتبط (اختياري).
     */
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
    },

    /**
     * أمين الصندوق (اختياري).
     */
    custodian: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /**
     * هل هو الصندوق الافتراضي؟
     */
    isDefault: {
      type: Boolean,
      default: false,
    },

    /**
     * حالة الصندوق.
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * ملاحظات.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'الملاحظات طويلة جداً.'],
    },

    /**
     * من أنشأ الصندوق؟
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
 * فهرس الصندوق الافتراضي الفريد.
 */
cashFundSchema.index(
  { isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
    name: 'unique_default_cash_fund',
  }
);

/**
 * فهرس القوائم.
 */
cashFundSchema.index({ isActive: 1, name: 1 });

/**
 * هل الصندوق يسمح بالرصيد السالب؟
 * @returns {boolean}
 */
cashFundSchema.methods.allowsNegative = function allowsNegative() {
  return false;
};

export const CashFund = model('CashFund', cashFundSchema);

export default CashFund;