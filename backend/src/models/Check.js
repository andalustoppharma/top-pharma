/**
 * @file Check.js
 * @description
 * نموذج الشيك (واردة/صادرة) — محلية، مع دعم الشيكات المؤجلة.
 *
 * لماذا هذا الملف؟
 * - متطلب صريح: "الشيكات محلية (تسجيل فقط) + المؤجلة مدعومة".
 * - لا ربط بنكي حقيقي (متطلب صريح) — تسجيل فقط.
 * - نخزّن drawerName (اسم الساحب)، وتاريخ الإصدار والاستحقاق.
 * - نُوفّر تنبيهات قبل/عند/بعد الاستحقاق.
 * - لا نحذف شيكاً محصَّلاً؛ نُغيّر حالته فقط.
 */

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * أنواع الشيكات.
 * @readonly
 * @enum {string}
 */
export const CHECK_TYPES = Object.freeze({
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
});

/**
 * حالات الشيك.
 * @readonly
 * @enum {string}
 */
export const CHECK_STATUSES = Object.freeze({
  PENDING: 'pending',
  COLLECTED: 'collected',
  BOUNCED: 'bounced',
  CANCELLED: 'cancelled',
});

/**
 * Schema التذكيرات.
 */
const checkRemindersSchema = new Schema(
  {
    beforeDue: { type: Boolean, default: false },
    onDue: { type: Boolean, default: false },
    afterDue: { type: Boolean, default: false },
    lastReminderAt: { type: Date, default: null },
  },
  { _id: false }
);

/**
 * Schema الشيك.
 */
const checkSchema = new Schema(
  {
    /**
     * رقم الشيك الفريد.
     */
    checkNumber: {
      type: String,
      required: [true, 'رقم الشيك مطلوب.'],
      unique: true,
      trim: true,
      index: true,
    },

    /**
     * نوع الشيك (وارد/صادر).
     */
    type: {
      type: String,
      enum: Object.values(CHECK_TYPES),
      required: [true, 'نوع الشيك مطلوب.'],
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
     * اسم البنك.
     */
    bankName: {
      type: String,
      required: [true, 'اسم البنك مطلوب.'],
      trim: true,
      maxlength: [150, 'اسم البنك طويل جداً.'],
    },

    /**
     * رقم الحساب (اختياري).
     */
    accountNumber: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * تاريخ الإصدار.
     */
    issueDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * تاريخ الاستحقاق.
     */
    dueDate: {
      type: Date,
      required: [true, 'تاريخ الاستحقاق مطلوب.'],
      index: true,
    },

    /**
     * اسم الساحب.
     */
    drawerName: {
      type: String,
      trim: true,
      required: [true, 'اسم الساحب مطلوب.'],
      maxlength: [200, 'الاسم طويل جداً.'],
    },

    /**
     * اسم المستفيد.
     */
    beneficiaryName: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * الصيدلية (للشيكات الواردة).
     */
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },

    /**
     * المورّد (للشيكات الصادرة).
     */
    supplier: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
      index: true,
    },

    /**
     * الفاتورة المرتبطة (اختياري).
     */
    invoice: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },

    /**
     * الحالة.
     */
    status: {
      type: String,
      enum: Object.values(CHECK_STATUSES),
      default: CHECK_STATUSES.PENDING,
      index: true,
    },

    /**
     * تذكيرات.
     */
    reminders: {
      type: checkRemindersSchema,
      default: () => ({}),
    },

    /**
     * وقت التحصيل.
     */
    collectedAt: { type: Date, default: null },

    /**
     * من حصّل الشيك؟
     */
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /**
     * وقت الارتداد.
     */
    bouncedAt: { type: Date, default: null },

    /**
     * سبب الارتداد.
     */
    bouncedReason: { type: String, trim: true, default: '' },

    /**
     * وقت الإلغاء.
     */
    cancelledAt: { type: Date, default: null },

    /**
     * سبب الإلغاء.
     */
    cancelReason: { type: String, trim: true, default: '' },

    /**
     * هل هو شيك مؤجّل؟
     * يُحسب آلياً إذا كان dueDate > issueDate.
     */
    isPostDated: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * صورة الشيك (اختياري، base64).
     */
    image: {
      type: String,
      default: '',
    },

    /**
     * ملاحظات.
     */
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'الملاحظات طويلة جداً.'],
    },

    /**
     * من أنشأ الشيك؟
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
checkSchema.index({ type: 1, status: 1, dueDate: 1 });
checkSchema.index({ customer: 1, status: 1 });
checkSchema.index({ supplier: 1, status: 1 });

/**
 * قبل الحفظ: احسب isPostDated.
 */
checkSchema.pre('save', function preSave(next) {
  if (this.issueDate && this.dueDate) {
    this.isPostDated = this.dueDate.getTime() > this.issueDate.getTime();
  }
  next();
});

/**
 * هل الشيك مستحق اليوم؟
 * @returns {boolean}
 */
checkSchema.methods.isDueToday = function isDueToday() {
  if (!this.dueDate) {
    return false;
  }
  const today = new Date();
  return (
    this.dueDate.getFullYear() === today.getFullYear() &&
    this.dueDate.getMonth() === today.getMonth() &&
    this.dueDate.getDate() === today.getDate()
  );
};

/**
 * هل الشيك متأخر؟
 * @returns {boolean}
 */
checkSchema.methods.isOverdue = function isOverdue() {
  if (!this.dueDate) {
    return false;
  }
  return (
    this.status === CHECK_STATUSES.PENDING && this.dueDate.getTime() < Date.now()
  );
};

export const Check = model('Check', checkSchema);

export default Check;