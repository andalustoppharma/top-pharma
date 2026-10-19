/**
 * @file seed.js
 * @description
 * سكربت التهيئة الأساسي — Phase 2.5.
 *
 * ⚠️ إضافة Phase 2.5:
 * - Settings: سياسات التسعير الافتراضية (10% margin، 15% discount، إلخ).
 * - Roles: صلاحية `invoices.override_price_limit` للمحاسب.
 */

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

import { User, USER_ROLES } from '../models/User.js';
import { Role, SYSTEM_ROLES } from '../models/Role.js';
import { Category, SYSTEM_CATEGORIES } from '../models/Category.js';
import { Warehouse, WAREHOUSE_TYPES } from '../models/Warehouse.js';
import { Settings } from '../models/Settings.js';
import { hashPassword } from '../utils/password.js';

// ============================================================
// Main
// ============================================================

async function seedRoles() {
  logger.info('🔐 تهيئة الأدوار...');
  let created = 0;
  let updated = 0;

  for (const roleData of Object.values(SYSTEM_ROLES)) {
    const existing = await Role.findOne({ name: roleData.name });
    if (existing) {
      existing.permissions = roleData.permissions;
      existing.label = roleData.label;
      existing.description = roleData.description;
      existing.isSystem = true;
      await existing.save();
      updated++;
    } else {
      await Role.create({ ...roleData, isSystem: true, isActive: true });
      created++;
    }
  }

  logger.info(`   ✅ ${created} جديد، ${updated} مُحدَّث.`);
}

async function seedAdmin() {
  logger.info('👤 تهيئة حساب المدير...');

  const adminEmail = 'admin@pharma-system.local';
  const existing = await User.findOne({ email: adminEmail });

  if (existing) {
    logger.info('   ℹ️  حساب المدير موجود بالفعل.');
    return;
  }

  const rawPassword = 'Admin@123456';
  await User.create({
    name: 'مدير النظام',
    email: adminEmail,
    password: await hashPassword(rawPassword),
    role: USER_ROLES.ADMIN,
    isActive: true,
    mustChangePassword: false,
    notes: 'حساب مُنشأ بواسطة Seed',
  });

  logger.info(`   ✅ تم إنشاء admin / ${rawPassword}`);
}

async function seedCategories() {
  logger.info('📁 تهيئة التصنيفات النظامية...');

  const ops = SYSTEM_CATEGORIES.map((cat, idx) =>
    Category.updateOne(
      { name: cat.name },
      {
        $setOnInsert: { name: cat.name, isSystem: true, isActive: true },
        $set: { label: cat.label, description: cat.description },
        $setOnInsert2: { order: idx },
      },
      { upsert: true }
    )
  );
  await Promise.all(ops);
  logger.info(`   ✅ ${SYSTEM_CATEGORIES.length} تصنيف نظامي.`);
}

async function seedWarehouse() {
  logger.info('🏪 تهيئة المخزن الرئيسي...');

  const existing = await Warehouse.findOne({ type: WAREHOUSE_TYPES.MAIN, isActive: true });
  if (existing) {
    logger.info('   ℹ️  المخزن الرئيسي موجود بالفعل.');
    return;
  }

  await Warehouse.create({
    name: 'المخزن الرئيسي',
    code: 'WH-MAIN',
    type: WAREHOUSE_TYPES.MAIN,
    isActive: true,
    isDefault: true,
    city: 'الخرطوم',
    address: 'الخرطوم - السودان',
    notes: 'المخزن الرئيسي للشركة',
  });

  logger.info('   ✅ تم إنشاء المخزن الرئيسي WH-MAIN.');
}

async function seedSettings() {
  logger.info('⚙️  تهيئة الإعدادات...');

  const existing = await Settings.findOne({ key: 'system' });
  if (existing) {
    // ✅ Phase 2.5: نُحدّث فقط الحقول الجديدة (إن كانت مفقودة)
    let updated = false;

    if (existing.sales.minMarginPercent === undefined) {
      existing.sales.minMarginPercent = 10;
      updated = true;
    }
    if (existing.sales.maxDiscountPercent === undefined) {
      existing.sales.maxDiscountPercent = 15;
      updated = true;
    }
    if (existing.sales.allowPriceOverrides === undefined) {
      existing.sales.allowPriceOverrides = true;
      updated = true;
    }
    if (existing.sales.nearExpiryThresholdDays === undefined) {
      existing.sales.nearExpiryThresholdDays = 30;
      updated = true;
    }
    if (existing.sales.nearExpiryMaxDiscountPercent === undefined) {
      existing.sales.nearExpiryMaxDiscountPercent = 30;
      updated = true;
    }

    if (updated) {
      await existing.save();
      logger.info('   ✅ تم إضافة سياسات التسعير لـ Settings الموجود.');
    } else {
      logger.info('   ℹ️  الإعدادات موجودة بالفعل (كاملة).');
    }
    return;
  }

  // إنشاء جديد
  await Settings.create({
    key: 'system',
    company: {
      name: 'TOP PHARMA MEDICAL COMPANY',
      nameEn: 'TOP PHARMA MEDICAL COMPANY',
      phone: '+249 123 456 789',
      email: 'info@toppharma.sd',
      address: 'الخرطوم - السودان',
      taxNumber: '',
      registrationNumber: '',
    },
    currency: { code: 'SDG', symbol: 'ج.س', decimals: 2 },
    locale: {
      language: 'ar',
      direction: 'rtl',
      calendar: 'gregorian',
      numerals: 'latin',
      timezone: 'Africa/Khartoum',
    },
    sales: {
      prefixes: {
        invoice: 'INV',
        deliveryNote: 'DN',
        customerReturn: 'RET',
        purchaseReceipt: 'PR',
        supplierReturn: 'SRET',
        cashTransaction: 'CT',
        salesRepTransaction: 'SRT',
        check: 'CHK',
      },
      defaultTaxRate: 0,
      returnGracePeriodDays: 7,
      defaultPaymentTerms: 30,
      allowNegativeStock: false,
      // ✅ Phase 2.5
      minMarginPercent: 10,
      maxDiscountPercent: 15,
      allowPriceOverrides: true,
      nearExpiryThresholdDays: 30,
      nearExpiryMaxDiscountPercent: 30,
    },
    inventory: {
      issuePolicy: 'FEFO',
      expiryWarningDays: 90,
      reorderWarningEnabled: true,
    },
    finance: {
      checkReminderDays: 3,
      invoiceReminderDays: 3,
      remindersEnabled: true,
    },
    security: {
      sessionHours: 8,
      idleTimeoutMinutes: 30,
      maxFailedLogins: 5,
      lockDurationMinutes: 15,
      passwordMinLength: 8,
    },
    audit: { retentionDays: 365 },
    print: {
      showLogoWatermark: true,
      watermarkOpacity: 0.08,
      invoiceHeader: '',
      invoiceFooter: 'شكراً لتعاملكم معنا',
    },
  });

  logger.info('   ✅ تم إنشاء الإعدادات الكاملة (مع سياسات التسعير).');
}

// ============================================================
// Main
// ============================================================

async function main() {
  logger.info('═══════════════════════════════════════════════');
  logger.info('🌱 Pharma System — Seed (Phase 2.5)');
  logger.info('═══════════════════════════════════════════════');

  await connectDatabase();

  try {
    await seedRoles();
    await seedAdmin();
    await seedCategories();
    await seedWarehouse();
    await seedSettings();

    logger.info('');
    logger.info('═══════════════════════════════════════════════');
    logger.info('🎉 اكتمل Seed بنجاح!');
    logger.info('═══════════════════════════════════════════════');
    logger.info('');
    logger.info('📋 بيانات الدخول:');
    logger.info('   البريد: admin@pharma-system.local');
    logger.info('   كلمة المرور: Admin@123456');
    logger.info('');
    logger.info('⚙️  سياسات التسعير:');
    logger.info('   minMarginPercent = 10%');
    logger.info('   maxDiscountPercent = 15%');
    logger.info('   allowPriceOverrides = true');
    logger.info('   nearExpiryThresholdDays = 30');
    logger.info('   nearExpiryMaxDiscountPercent = 30%');
    logger.info('');
    logger.info('📌 التالي: npm run seed:test (للمستخدمين)');
    logger.info('         npm run seed:invoices (لبيانات تجريبية)');
    logger.info('');
  } catch (error) {
    logger.error(`❌ فشل Seed: ${error.message}`);
    logger.error(error.stack || '');
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then(() => { logger.info('👋 انتهى.'); process.exit(0); })
  .catch(() => process.exit(1));