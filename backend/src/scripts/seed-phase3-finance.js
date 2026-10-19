/**
 * @file seed-phase3-finance.js
 * @description
 * زرع بيانات Phase 3 (المالية) — **دفاعي**.
 *
 * ⚠️ لماذا دفاعي؟
 * - النماذج (CashFund, BankAccount, AccountingEntry) قد لا تكون موجودة في بعض النسخ.
 * - هذا السكربت يحاول استيرادها؛ إن فشل — يُسجّل تحذيراً ويكمل دون توقف.
 * - آمن للتشغيل حتى لو لم تكن Phase 3 مطبَّقة.
 *
 * يُنشئ (إن توفرت النماذج):
 *   - CashFund افتراضي (رصيد افتتاحي 0)
 *   - BankAccount واحد
 *   - بعض الحركات النقدية التجريبية
 *   - شيكات (pending / collected / bounced)
 *
 * التشغيل:
 *   cd backend && npm run seed:finance
 */

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { User, USER_ROLES } from '../models/User.js';

// ─── محاولة استيراد نماذج Phase 3 (قد تفشل) ───
let CashFund, BankAccount, Check, CashTransaction;
let phase3Available = true;

try {
  ({ CashFund } = await import('../models/CashFund.js'));
  ({ BankAccount } = await import('../models/BankAccount.js'));
  ({ Check } = await import('../models/Check.js'));
  ({ CashTransaction } = await import('../models/CashTransaction.js'));
} catch (err) {
  phase3Available = false;
  logger.warn(`⚠️  Phase 3 models غير متوفرة: ${err.message}`);
}

async function main() {
  logger.info('═══════════════════════════════════════════════');
  logger.info('🌱 Pharma System — Phase 3 Finance Seed');
  logger.info('═══════════════════════════════════════════════');

  if (!phase3Available) {
    logger.warn('');
    logger.warn('⚠️  Phase 3 (CashFund / BankAccount / CashTransaction) غير مطبَّقة في الكود الحالي.');
    logger.warn('   هذا السكربت سيتخطى الزرع بأمان.');
    logger.warn('   لتفعيل Phase 3: أضف النماذج + server.js routes ثم أعد تشغيل.');
    logger.warn('');
    process.exit(0);
  }

  await connectDatabase();

  try {
    const admin = await User.findOne({ role: USER_ROLES.ADMIN, isActive: true });
    if (!admin) throw new Error('❌ لا يوجد admin. شغّل: npm run seed');

    // ─── CashFund افتراضي ───
    let defaultFund = await CashFund.findOne({ isDefault: true });
    if (!defaultFund) {
      defaultFund = await CashFund.create({
        name: 'الصندوق الرئيسي',
        code: 'CF-MAIN',
        description: 'الصندوق الافتراضي للشركة',
        openingBalance: 0,
        balance: 0,
        isDefault: true,
        isActive: true,
        createdBy: admin._id,
      });
      logger.info('   ✅ CashFund افتراضي.');
    } else {
      logger.info('   ℹ️  CashFund افتراضي موجود.');
    }

    // ─── BankAccount واحد ───
    let bankAccount = await BankAccount.findOne({ isActive: true });
    if (!bankAccount) {
      bankAccount = await BankAccount.create({
        bankName: 'بنك الخرطوم',
        accountNumber: '1234567890',
        accountName: 'TOP PHARMA MEDICAL COMPANY',
        branch: 'الفرع الرئيسي',
        currency: 'SDG',
        openingBalance: 0,
        balance: 0,
        isActive: true,
        createdBy: admin._id,
      });
      logger.info('   ✅ BankAccount رئيسي.');
    } else {
      logger.info('   ℹ️  BankAccount موجود.');
    }

    // ─── شيكات تجريبية ───
    const existingChecks = await Check.countDocuments();
    if (existingChecks === 0) {
      const baseDate = new Date();
      const addDays = (n) => new Date(baseDate.getTime() + n * 24 * 60 * 60 * 1000);

      await Check.create([
        {
          checkNumber: 'CHK-IN-001',
          type: 'incoming',
          amount: 5000,
          bankName: 'بنك فيصل',
          issueDate: addDays(-5),
          dueDate: addDays(10),
          drawerName: 'صيدلية النور',
          status: 'pending',
          createdBy: admin._id,
        },
        {
          checkNumber: 'CHK-IN-002',
          type: 'incoming',
          amount: 3500,
          bankName: 'بنك الخرطوم',
          issueDate: addDays(-10),
          dueDate: addDays(3),
          drawerName: 'صيدلية الشفاء',
          status: 'pending',
          createdBy: admin._id,
        },
        {
          checkNumber: 'CHK-OUT-001',
          type: 'outgoing',
          amount: 8000,
          bankName: 'بنك أم درمان',
          issueDate: addDays(-20),
          dueDate: addDays(-2),
          drawerName: 'شركة الجزيرة للأدوية',
          status: 'pending',
          createdBy: admin._id,
        },
      ]);
      logger.info('   ✅ 3 شيكات تجريبية.');
    } else {
      logger.info(`   ℹ️  ${existingChecks} شيك موجود بالفعل.`);
    }

    logger.info('');
    logger.info('🎉 اكتمل Phase 3 Finance Seed (بشكل دفاعي).');
    logger.info('');
  } catch (error) {
    logger.error(`❌ فشل: ${error.message}`);
    logger.error(error.stack || '');
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));