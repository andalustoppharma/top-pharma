/**
 * @file seed-all.js
 * @description
 * منسّق Seed شامل — يشغّل كل سكربتات الزرع بالترتيب الصحيح.
 *
 * لماذا هذا الملف؟
 * - أمر واحد لبيئة اختبار كاملة من الصفر.
 * - يفشل بسرعة إن فشلت خطوة (fail-fast) — لا نصف قاعدة بيانات.
 * - يوفر دقائق من التشغيل اليدوي المتسلسل.
 *
 * الترتيب:
 *   1. seed.js              (roles, admin, categories, warehouse, settings)
 *   2. seed-test-users.js   (4 users)
 *   3. seed-master-data.js  (suppliers, items, customers, stock, commissions)
 *   4. seed-phase3-finance.js (دفاعي — قد يتخطى)
 *   5. seed-test-invoices.js (فواتير + مرتجعات)
 *   6. test-jobs.js         (اختبار Jobs — اختياري، لا يفشل عند الخطأ)
 *
 * التشغيل:
 *   cd backend && npm run seed:all
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STEPS = [
  { name: 'seed.js (أساسيات)', script: 'seed.js', critical: true },
  { name: 'seed-test-users.js (مستخدمون)', script: 'seed-test-users.js', critical: true },
  { name: 'seed-master-data.js (بيانات رئيسية)', script: 'seed-master-data.js', critical: true },
  { name: 'seed-phase3-finance.js (مالية — دفاعي)', script: 'seed-phase3-finance.js', critical: false },
  { name: 'seed-test-invoices.js (فواتير)', script: 'seed-test-invoices.js', critical: false },
  { name: 'test-jobs.js (اختبار)', script: 'test-jobs.js', critical: false },
];

/**
 * تشغيل سكربت Node كعملية فرعية.
 */
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(__dirname, scriptName);
    const child = spawn('node', [scriptPath], { stdio: 'inherit', env: process.env });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`سكربت ${scriptName} خرج برمز ${code}`));
    });

    child.on('error', reject);
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  🌱 Pharma System — Seed ALL (شامل)          ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    console.log(`\n▶ [${i + 1}/${STEPS.length}] ${step.name}...\n`);

    try {
      await runScript(step.script);
      results.push({ ...step, ok: true });
      console.log(`✅ [${i + 1}/${STEPS.length}] ${step.name} — نجح\n`);
    } catch (error) {
      results.push({ ...step, ok: false, error: error.message });
      console.error(`❌ [${i + 1}/${STEPS.length}] ${step.name} — فشل: ${error.message}\n`);

      if (step.critical) {
        console.error('🛑 خطوة حرجة فشلت — التوقف.\n');
        process.exit(1);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  📊 الملخص                                   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '⚠️ '} ${r.name}`);
  }

  console.log(`\n⏱️  الإجمالي: ${elapsed}s\n`);
  console.log('🎉 Seed شامل اكتمل!\n');
}

main().catch((err) => {
  console.error(`\n💥 خطأ غير متوقع: ${err.message}`);
  process.exit(1);
});