/**
 * @file test-jobs.js
 * @description
 * سكربت اختبار يدوي لكل Jobs (بدون انتظار Cron).
 *
 * لماذا هذا الملف؟
 * - يسمح بتشغيل Jobs فوراً في التطوير والاختبار.
 * - يُظهر عدد الإشعارات والإيميلات المُنشأة.
 * - لا يُعدّل الجدولة — فقط يُشغّل المهام.
 *
 * التشغيل:
 *   cd backend && npm run test-jobs
 *
 * أو لتشغيل Job واحد:
 *   node src/scripts/test-jobs.js expiry
 *   node src/scripts/test-jobs.js reorder
 *   node src/scripts/test-jobs.js invoices
 */

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

import { runExpiryAlert } from '../jobs/expiryAlert.js';
import { runReorderAlert } from '../jobs/reorderAlert.js';
import { runInvoiceDueAlert } from '../jobs/invoiceDueAlert.js';

const JOBS = {
  expiry: { name: 'expiryAlert', fn: runExpiryAlert, icon: '🔔' },
  reorder: { name: 'reorderAlert', fn: runReorderAlert, icon: '📦' },
  invoices: { name: 'invoiceDueAlert', fn: runInvoiceDueAlert, icon: '💰' },
};

async function main() {
  const jobKey = process.argv[2];
  const jobsToRun = jobKey ? [jobKey] : Object.keys(JOBS);

  // التحقق من صحة الاسم
  if (jobKey && !JOBS[jobKey]) {
    logger.error(`❌ Job غير معروف: ${jobKey}`);
    logger.info(`المتاح: ${Object.keys(JOBS).join(', ')}`);
    process.exit(1);
  }

  logger.info('═══════════════════════════════════════════════');
  logger.info('🧪 اختبار Jobs — البدء');
  logger.info('═══════════════════════════════════════════════');

  await connectDatabase();

  const results = [];

  try {
    for (const key of jobsToRun) {
      const job = JOBS[key];
      logger.info(`\n${job.icon} تشغيل [${job.name}]...`);
      const startTime = Date.now();
      try {
        const result = await job.fn();
        const duration = Date.now() - startTime;
        results.push({ name: job.name, success: true, result, duration });
        logger.info(`✅ [${job.name}] اكتمل في ${duration}ms`);
      } catch (error) {
        const duration = Date.now() - startTime;
        results.push({ name: job.name, success: false, error: error.message, duration });
        logger.error(`❌ [${job.name}] فشل في ${duration}ms: ${error.message}`);
      }
    }

    // ═══════════════════════════════════════════════
    // الملخص
    // ═══════════════════════════════════════════════
    logger.info('\n═══════════════════════════════════════════════');
    logger.info('📊 ملخص الاختبار');
    logger.info('═══════════════════════════════════════════════');

    for (const r of results) {
      if (r.success) {
        logger.info(`✅ ${r.name} (${r.duration}ms)`);
        if (r.result && typeof r.result === 'object') {
          for (const [k, v] of Object.entries(r.result)) {
            logger.info(`   • ${k}: ${v}`);
          }
        }
      } else {
        logger.error(`❌ ${r.name}: ${r.error}`);
      }
    }

    const failed = results.filter((r) => !r.success).length;
    if (failed === 0) {
      logger.info('\n🎉 كل Jobs نجحت!');
      process.exit(0);
    } else {
      logger.warn(`\n⚠️  ${failed} من ${results.length} فشلت.`);
      process.exit(1);
    }
  } catch (error) {
    logger.error(`💥 خطأ غير متوقع: ${error.message}`);
    logger.error(error.stack || '');
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

main();