/**
 * @file Role.js
 * @description
 * نموذج الأدوار والصلاحيات (RBAC) — Phase 2.5.
 *
 * ⚠️ إضافة Phase 2.5:
 * - `invoices.override_price_limit`: صلاحية تجاوز حدود السعر (للمدير + المحاسب).
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * قائمة الصلاحيات المعتمدة في النظام.
 * @readonly
 */
export const PERMISSIONS = Object.freeze([
  // المستخدمون والأدوار
  'users.read', 'users.create', 'users.update', 'users.delete',

  // الإعدادات
  'settings.read', 'settings.update',

  // سجل التدقيق
  'audit.read',

  // المخازن
  'warehouses.read', 'warehouses.create', 'warehouses.update', 'warehouses.delete',

  // الأصناف والتصنيفات
  'items.read', 'items.create', 'items.update', 'items.delete',
  'categories.read', 'categories.create', 'categories.update', 'categories.delete',

  // المخزون
  'stock.read', 'stock.create', 'stock.update', 'stock.delete',

  // العملاء (الصيدليات)
  'customers.read', 'customers.create', 'customers.update', 'customers.delete',

  // الموردون
  'suppliers.read', 'suppliers.create', 'suppliers.update', 'suppliers.delete',

  // المشتريات
  'purchases.read', 'purchases.create', 'purchases.update', 'purchases.delete',

  // الفواتير
  'invoices.read', 'invoices.create', 'invoices.update', 'invoices.delete', 'invoices.cancel',
  // ✅ Phase 2.5: تجاوز حدود السعر (خفض السعر تحت الحد الموصى به)
  'invoices.override_price_limit',

  // إيصالات التسليم
  'delivery_notes.read', 'delivery_notes.create', 'delivery_notes.update', 'delivery_notes.delete',

  // المرتجعات
  'returns.read', 'returns.create', 'returns.approve', 'returns.reject',

  // المالية (الخزينة والبنك)
  'cash.read', 'cash.create', 'cash.update', 'cash.delete',
  'bank.read', 'bank.create', 'bank.update', 'bank.delete',

  // الشيكات
  'checks.read', 'checks.create', 'checks.update', 'checks.delete',
  'checks.collect', 'checks.bounce',

  // المندوبون
  'sales_reps.read', 'sales_reps.create', 'sales_reps.update', 'sales_reps.delete',

  // معاملات المندوبين
  'sales_rep_transactions.read', 'sales_rep_transactions.create',
  'sales_rep_transactions.approve', 'sales_rep_transactions.pay',

  // العمولات
  'commissions.read', 'commissions.create', 'commissions.update', 'commissions.delete',

  // القيود المحاسبية
  'accounting.read', 'accounting.create',

  // التقارير
  'reports.read', 'reports.export',

  // النسخ الاحتياطي
  'backup.read', 'backup.create',
]);

/**
 * الأدوار النظامية الخمسة.
 *
 * ⚠️ Phase 2.5:
 * - admin: كل الصلاحيات (يشمل override_price_limit ضمناً)
 * - accountant: + override_price_limit (يمكنه تجاوز حد السعر بسبب)
 * - sales_rep: لا يملكها (لا يمكنه البيع أقل من الحد الموصى به)
 * - storekeeper: لا يملكها
 * - pharmacy: لا يملكها
 */
export const SYSTEM_ROLES = Object.freeze({
  admin: {
    name: 'admin',
    label: 'مدير',
    description: 'مدير النظام — كل الصلاحيات',
    permissions: [...PERMISSIONS],
  },
  storekeeper: {
    name: 'storekeeper',
    label: 'أمين مخزن',
    description: 'إدارة المخزون فقط',
    permissions: [
      'warehouses.read', 'warehouses.create', 'warehouses.update',
      'items.read', 'items.create', 'items.update',
      'categories.read', 'categories.create', 'categories.update',
      'stock.read', 'stock.create', 'stock.update', 'stock.delete',
      'purchases.read', 'purchases.create', 'purchases.update',
      'returns.read', 'returns.create',
      'suppliers.read', 'suppliers.create', 'suppliers.update',
      'reports.read', 'reports.export',
    ],
  },
  accountant: {
    name: 'accountant',
    label: 'محاسب',
    description: 'الشؤون المالية فقط + تجاوز أسعار بموافقة',
    permissions: [
      'customers.read', 'customers.update',
      'suppliers.read',
      'invoices.read', 'invoices.update',
      'invoices.override_price_limit', // ✅ Phase 2.5: تجاوز السعر
      'delivery_notes.read',
      'returns.read', 'returns.approve', 'returns.reject',
      'cash.read', 'cash.create', 'cash.update',
      'bank.read', 'bank.create', 'bank.update',
      'checks.read', 'checks.create', 'checks.update', 'checks.collect', 'checks.bounce',
      'sales_rep_transactions.read', 'sales_rep_transactions.approve', 'sales_rep_transactions.pay',
      'commissions.read',
      'accounting.read', 'accounting.create',
      'reports.read', 'reports.export',
      'audit.read',
    ],
  },
  sales_rep: {
    name: 'sales_rep',
    label: 'مندوب',
    description: 'مندوب مبيعات — صيدلياته فقط',
    permissions: [
      'customers.read',
      'items.read',
      'stock.read',
      'invoices.read', 'invoices.create',
      'delivery_notes.read', 'delivery_notes.create', 'delivery_notes.update',
      'returns.read', 'returns.create',
      'sales_rep_transactions.read', 'sales_rep_transactions.create',
      'commissions.read',
      'reports.read',
    ],
  },
  pharmacy: {
    name: 'pharmacy',
    label: 'صيدلية',
    description: 'حساب صيدلية — عرض فقط',
    permissions: [
      'invoices.read',
      'delivery_notes.read',
      'returns.read', 'returns.create',
      'reports.read',
    ],
  },
});

/**
 * Schema الدور.
 */
const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم الدور مطلوب.'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    label: {
      type: String,
      required: [true, 'الاسم العربي للدور مطلوب.'],
      trim: true,
    },
    description: { type: String, trim: true, default: '' },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((p) => PERMISSIONS.includes(p)),
        message: 'صلاحية غير معروفة.',
      },
    },
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

roleSchema.index({ isActive: 1, isSystem: 1 });

roleSchema.methods.hasPermission = function hasPermission(permission) {
  return Array.isArray(this.permissions) && this.permissions.includes(permission);
};

roleSchema.methods.hasAnyPermission = function hasAnyPermission(permissions) {
  if (!Array.isArray(this.permissions) || this.permissions.length === 0) return false;
  return permissions.some((p) => this.permissions.includes(p));
};

roleSchema.methods.hasAllPermissions = function hasAllPermissions(permissions) {
  if (!Array.isArray(this.permissions) || this.permissions.length === 0) return false;
  return permissions.every((p) => this.permissions.includes(p));
};

export const Role = mongoose.model('Role', roleSchema);

export default Role;