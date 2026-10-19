/**
 * @file constants.js
 * @description الثوابت العامة للتطبيق
 *
 * لماذا هذا الملف:
 * - مكان واحد للثوابت.
 * - يمنع التكرار.
 * - يسهّل الصيانة.
 */

// ═══════════════════════════════════════════════
// 1. مفاتيح التخزين (localStorage)
// ═══════════════════════════════════════════════
export const STORAGE_KEYS = Object.freeze({
  ACCESS_TOKEN: 'pharma_access_token',
  REFRESH_TOKEN: 'pharma_refresh_token',
  USER: 'pharma_user',
  THEME: 'pharma_theme',
  SIDEBAR_COLLAPSED: 'pharma_sidebar_collapsed',
});

// ═══════════════════════════════════════════════
// 2. الأدوار (Roles)
// ═══════════════════════════════════════════════
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  STOREKEEPER: 'storekeeper',
  ACCOUNTANT: 'accountant',
  SALES_REP: 'sales_rep',
  PHARMACY: 'pharmacy',
});

export const ROLE_LABELS_AR = Object.freeze({
  admin: 'مدير',
  storekeeper: 'أمين مخزن',
  accountant: 'محاسب',
  sales_rep: 'مندوب',
  pharmacy: 'صيدلية',
});

// ═══════════════════════════════════════════════
// 3. المسارات (Routes)
// ═══════════════════════════════════════════════
export const ROUTES = Object.freeze({
  LOGIN: '/login',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/',
  NOT_FOUND: '*',
});

// ═══════════════════════════════════════════════
// 4. حالات الفواتير
// ═══════════════════════════════════════════════
export const INVOICE_STATUSES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
});

export const INVOICE_STATUS_LABELS_AR = Object.freeze({
  pending: 'معلّقة',
  paid: 'مدفوعة',
  partial: 'مدفوعة جزئياً',
  overdue: 'متأخرة',
  cancelled: 'ملغاة',
});

// ═══════════════════════════════════════════════
// 5. حالات إيصال التسليم
// ═══════════════════════════════════════════════
export const DELIVERY_STATUSES = Object.freeze({
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
});

export const DELIVERY_STATUS_LABELS_AR = Object.freeze({
  pending: 'معلّق',
  in_transit: 'قيد التوصيل',
  delivered: 'تم التسليم',
  returned: 'مُرتجع',
});

// ═══════════════════════════════════════════════
// 6. أنواع الدفع
// ═══════════════════════════════════════════════
export const PAYMENT_TYPES = Object.freeze({
  CASH: 'cash',
  CREDIT: 'credit',
  INSTALLMENTS: 'installments',
});

export const PAYMENT_TYPE_LABELS_AR = Object.freeze({
  cash: 'نقدي',
  credit: 'آجل',
  installments: 'أقساط',
});

// ═══════════════════════════════════════════════
// 7. أنواع الشيكات
// ═══════════════════════════════════════════════
export const CHECK_TYPES = Object.freeze({
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
});

export const CHECK_STATUSES = Object.freeze({
  PENDING: 'pending',
  COLLECTED: 'collected',
  BOUNCED: 'bounced',
  CANCELLED: 'cancelled',
});

export const CHECK_STATUS_LABELS_AR = Object.freeze({
  pending: 'معلّق',
  collected: 'تم التحصيل',
  bounced: 'مرتجع',
  cancelled: 'ملغى',
});

// ═══════════════════════════════════════════════
// 8. أسباب المرتجعات
// ═══════════════════════════════════════════════
export const RETURN_REASONS = Object.freeze({
  DAMAGED: 'damaged',
  NEAR_EXPIRY: 'near_expiry',
  WRONG_ORDER: 'wrong_order',
  OTHER: 'other',
});

export const RETURN_REASON_LABELS_AR = Object.freeze({
  damaged: 'تالف',
  near_expiry: 'قريب الانتهاء',
  wrong_order: 'خطأ في الطلب',
  other: 'أخرى',
});

// ═══════════════════════════════════════════════
// 9. تصنيفات الأصناف
// ═══════════════════════════════════════════════
export const ITEM_CATEGORIES = Object.freeze({
  MEDICINE: 'medicine',
  COSMETICS: 'cosmetics',
  SUPPLEMENTS: 'supplements',
  MEDICAL_SUPPLIES: 'medical_supplies',
  OTHER: 'other',
});

export const ITEM_CATEGORY_LABELS_AR = Object.freeze({
  medicine: 'أدوية',
  cosmetics: 'مستحضرات تجميل',
  supplements: 'مكملات غذائية',
  medical_supplies: 'مستلزمات طبية',
  other: 'أخرى',
});

// ═══════════════════════════════════════════════
// 10. وحدات القياس
// ═══════════════════════════════════════════════
export const UNIT_TYPES = Object.freeze({
  TABLET: 'قرص',
  CAPSULE: 'كبسولة',
  STRIP: 'شريط',
  BOX: 'علبة',
  VIAL: 'زجاجة',
  AMPOULE: 'أمبولة',
  PACKET: 'كيس',
  CARTON: 'كرتونة',
  INHALER: 'بخاخ',
  DROP: 'قطارة',
  SUPPOSITORY: 'تحاميل',
  CREAM: 'مرهم',
  SYRUP: 'شراب',
});

// ═══════════════════════════════════════════════
// 11. حدود Pagination
// ═══════════════════════════════════════════════
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  LIMIT_OPTIONS: [10, 20, 50, 100],
  MAX_LIMIT: 100,
});

// ═══════════════════════════════════════════════
// 12. العملة والتاريخ
// ═══════════════════════════════════════════════
export const CURRENCY = Object.freeze({
  CODE: 'SDG',
  SYMBOL: 'SDG',
  LOCALE: 'en-US', // أرقام إنجليزية
  DECIMALS: 2,
});

export const DATE_FORMAT = Object.freeze({
  SHORT: 'yyyy-MM-dd',
  LONG: 'yyyy-MM-dd HH:mm',
  DISPLAY: 'dd/MM/yyyy',
  DISPLAY_LONG: 'dd/MM/yyyy HH:mm',
  LOCALE: 'en-GB', // ميلادي
});

// ═══════════════════════════════════════════════
// 13. حدود التحقق
// ═══════════════════════════════════════════════
export const VALIDATION = Object.freeze({
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  NAME_MIN: 2,
  NAME_MAX: 100,
  EMAIL_MAX: 255,
  PHONE_MIN: 7,
  PHONE_MAX: 20,
});

// ═══════════════════════════════════════════════
// 14. رسائل عامة
// ═══════════════════════════════════════════════
export const MESSAGES = Object.freeze({
  LOADING: 'جاري التحميل...',
  SAVING: 'جاري الحفظ...',
  DELETING: 'جاري الحذف...',
  SUCCESS: 'تمت العملية بنجاح',
  ERROR: 'حدث خطأ. حاول مرة أخرى.',
  NETWORK_ERROR: 'تعذّر الاتصال بالخادم',
  UNAUTHORIZED: 'غير مصرح لك بالوصول',
  NOT_FOUND: 'العنصر غير موجود',
  CONFIRM_DELETE: 'هل أنت متأكد من الحذف؟',
});

// ═══════════════════════════════════════════════
// 15. تصدير افتراضي (للاستخدام الجماعي)
// ═══════════════════════════════════════════════
export default {
  STORAGE_KEYS,
  ROLES,
  ROLE_LABELS_AR,
  ROUTES,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS_AR,
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS_AR,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS_AR,
  CHECK_TYPES,
  CHECK_STATUSES,
  CHECK_STATUS_LABELS_AR,
  RETURN_REASONS,
  RETURN_REASON_LABELS_AR,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS_AR,
  UNIT_TYPES,
  PAGINATION,
  CURRENCY,
  DATE_FORMAT,
  VALIDATION,
  MESSAGES,
};