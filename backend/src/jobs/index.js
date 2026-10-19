/**
 * @file index.js
 * @description مُنظِّم Jobs — يبدأ/يوقف كل مهام Cron.
 *
 * لماذا هذا الملف؟
 * - نقطة واحدة لبدء/إيقاف كل Jobs من server.js.
 * - يسهّل التوسّع: في Phase 2 أضفنا تنبيه الفواتير (invoiceDueAlert).
 * - يضمن إيقاف جميع المهام بشكل آمن عند إغلاق السيرفر.
 */

import { startExpiryAlertJob } from './expiryAlert.js';
import { startReorderAlertJob } from './reorderAlert.js';
import { startInvoiceDueAlertJob } from './invoiceDueAlert.js';
import { logger } from '../utils/logger.js';

/** @type {Array<import('node-cron').ScheduledTask>} */
const scheduledTasks = [];

/**
 * بدء كل مهام Jobs.
 * @returns {void}
 */
export function startAllJobs() {
  logger.info('⏰ بدء جدولة Jobs...');

  // Phase 1: تنبيهات المخزون
  scheduledTasks.push(startExpiryAlertJob());
  scheduledTasks.push(startReorderAlertJob());

  // Phase 2: تنبيهات الفواتير
  scheduledTasks.push(startInvoiceDueAlertJob());

  logger.info(`⏰ تم جدولة ${scheduledTasks.length} مهمة.`);
}

/**
 * إيقاف كل المهام (يُستدعى عند إغلاق السيرفر).
 * @returns {void}
 */
export function stopAllJobs() {
  scheduledTasks.forEach((task) => {
    try {
      task.stop();
    } catch (error) {
      logger.warn(`فشل إيقاف مهمة Cron: ${error.message}`);
    }
  });
  scheduledTasks.length = 0;
  logger.info('⏰ تم إيقاف كل المهام.');
}

export default {
  startAllJobs,
  stopAllJobs,
};