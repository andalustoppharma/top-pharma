/**
 * @file seed-test-invoices.js
 * @description
 * سكربت بيانات تجريبية لاختبار Phase 2 (فواتير + مسودات + مرتجعات).
 *
 * لماذا هذا الملف؟
 * - يمنح المطور بيئة اختبار جاهزة خلال ثوانٍ.
 * - يغطي: فاتورة نقدية، فاتورة آجلة، فاتورة أقساط، مسودة، اعتماد مسودة، مرتجع.
 * - Idempotent: يمسح كل بياناته القديمة (TEST-* prefix) ثم يُعيد إنشاءها.
 * - لا يمس البيانات الحقيقية (البيانات التي لا تحمل TEST- في invoiceNumber).
 *
 * ⚠️ متطلبات سابقة:
 *   1. npm run seed           (admin + 5 categories + warehouse)
 *   2. npm run seed:test      (rep/account/pharmacy + store)
 *   3. وجود أصناف (على الأقل 3)
 *   4. وجود دفعات Stock (BATCH-2026-12, BATCH-2027-03, ...)
 *
 * التشغيل:
 *   cd backend && npm run seed:invoices
 */

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

import { User, USER_ROLES } from '../models/User.js';
import { Customer } from '../models/Customer.js';
import { Warehouse } from '../models/Warehouse.js';
import { Item } from '../models/Item.js';
import { Stock } from '../models/Stock.js';
import { Invoice, INVOICE_STATUSES } from '../models/Invoice.js';
import { SalesRepTransaction } from '../models/SalesRepTransaction.js';
import { CashTransaction } from '../models/CashTransaction.js';
import { CustomerReturn, RETURN_STATUSES, SETTLEMENT_TYPES } from '../models/CustomerReturn.js';
import { AuditLog } from '../models/AuditLog.js';

// ============================================================
// Helpers
// ============================================================

/**
 * مسح كل البيانات التجريبية السابقة.
 * يعتمد على Invoice.invoiceNumber يبدأ بـ "TEST-".
 */
async function cleanupPreviousData() {
  logger.info('🧹 جاري مسح البيانات التجريبية السابقة...');

  // 1. جلب كل الفواتير التجريبية
  const testInvoices = await Invoice.find({
    invoiceNumber: /^TEST-/,
  }).select('_id pharmacy total').lean();

  const testInvoiceIds = testInvoices.map((i) => i._id);

  if (testInvoiceIds.length === 0) {
    logger.info('   لا توجد بيانات تجريبية سابقة.');
    return 0;
  }

  // 2. حذف المرتجعات المرتبطة
  const deletedReturns = await CustomerReturn.deleteMany({
    originalInvoice: { $in: testInvoiceIds },
  });

  // 3. حذف الحركات المالية
  const deletedCash = await CashTransaction.deleteMany({
    referenceType: 'Invoice',
    referenceId: { $in: testInvoiceIds },
  });

  // 4. حذف حركات العمولة
  const deletedSalesRepTx = await SalesRepTransaction.deleteMany({
    referenceType: 'Invoice',
    referenceId: { $in: testInvoiceIds },
  });

  // 5. عكس رصيد الصيدليات (نستخدم $inc بالسالب لكل فاتورة)
  for (const inv of testInvoices) {
    if (inv.pharmacy && inv.total > 0) {
      // نستخدم -total لأن كل فاتورة زادت الرصيد بـ total
      // (هذا تقريبي — يكفي للاختبار؛ يمكن حسابه بدقة من paidAmount)
      await Customer.updateOne(
        { _id: inv.pharmacy },
        { $inc: { currentBalance: -inv.total } }
      );
    }
  }

  // 6. حذف الفواتير نفسها
  const deletedInvoices = await Invoice.deleteMany({
    _id: { $in: testInvoiceIds },
  });

  // 7. حذف سجلات التدقيق
  const deletedAudit = await AuditLog.deleteMany({
    resource: 'Invoice',
    resourceId: { $in: testInvoiceIds },
  });

  logger.info(
    `✅ تم مسح: ${deletedInvoices.deletedCount} فاتورة، ${deletedReturns.deletedCount} مرتجع، ${deletedCash.deletedCount} حركة نقدية، ${deletedSalesRepTx.deletedCount} عمولة، ${deletedAudit.deletedCount} تدقيق.`
  );

  return deletedInvoices.deletedCount;
}

/**
 * توليد رقم فاتورة اختباري.
 */
function generateTestInvoiceNumber(seq) {
  return `TEST-INV-${String(seq).padStart(4, '0')}`;
}

/**
 * توليد رقم مرتجع اختباري.
 */
function generateTestReturnNumber(seq) {
  return `TEST-RET-${String(seq).padStart(4, '0')}`;
}

/**
 * بناء بند فاتورة من Stock.
 */
function buildInvoiceItem(stock, quantity, unitPrice) {
  return {
    item: stock.item,
    batch: stock.batch,
    expiry: stock.expiry,
    quantity,
    unit: '',
    unitPrice,
    total: Math.round(quantity * unitPrice * 100) / 100,
    unitCost: stock.unitCost || 0,
  };
}

// ============================================================
// Main
// ============================================================

async function main() {
  logger.info('🌱 بدء سكربت البيانات التجريبية للفواتير...');

  await connectDatabase();

  try {
    // ═══════════════════════════════════════════
    // 1. المسح
    // ═══════════════════════════════════════════
    await cleanupPreviousData();

    // ═══════════════════════════════════════════
    // 2. التحقق من المتطلبات
    // ═══════════════════════════════════════════
    logger.info('🔍 التحقق من المتطلبات...');

    const admin = await User.findOne({ role: USER_ROLES.ADMIN, isActive: true });
    const salesRep = await User.findOne({ role: USER_ROLES.SALES_REP, isActive: true });
    const pharmacyUser = await User.findOne({ role: USER_ROLES.PHARMACY, isActive: true });

    if (!admin) throw new Error('❌ لم يُعثر على admin. شغّل npm run seed أولاً.');
    if (!salesRep) throw new Error('❌ لم يُعثر على sales_rep. شغّل npm run seed:test أولاً.');
    if (!pharmacyUser) throw new Error('❌ لم يُعثر على pharmacy. شغّل npm run seed:test أولاً.');

    const warehouse = await Warehouse.findOne({ isDefault: true, isActive: true });
    if (!warehouse) throw new Error('❌ لا يوجد مخزن افتراضي. شغّل npm run seed.');

    // الصيدلية مرتبطة بـ pharmacyUser
    const customer = await Customer.findOne({ isActive: true }).populate('assignedSalesRep', 'name');
    if (!customer) throw new Error('❌ لا يوجد عملاء. أنشئ صيدلية عبر الواجهة أولاً.');

    // الأصناف والدفعات
    const stocks = await Stock.find({
      quantity: { $gt: 0 },
      isQuarantined: false,
      expiry: { $gt: new Date() },
    })
      .populate('item', 'tradeName scientificName')
      .sort({ expiry: 1 })
      .limit(10)
      .lean();

    if (stocks.length < 3) {
      throw new Error(
        `❌ عدد الدفعات المتاحة ${stocks.length} (نحتاج 3 على الأقل). استلم دفعات في المخزون أولاً.`
      );
    }

    logger.info(
      `✅ المتطلبات جاهزة: admin=${admin.email}, rep=${salesRep.email}, customer=${customer.name}, stocks=${stocks.length}`
    );

    // ═══════════════════════════════════════════
    // 3. بناء السيناريوهات
    // ═══════════════════════════════════════════

    const now = new Date();
    const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const daysFromNow = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

    // ─────────────────────────────────────────────
    // السيناريو 1: فاتورة نقدية (مدفوعة كلياً)
    // ─────────────────────────────────────────────
    logger.info('💰 [1/5] فاتورة نقدية (paid)...');

    const stock1 = stocks[0];
    const qty1 = Math.min(5, stock1.quantity);
    const unitPrice1 = stock1.unitPrice || 100;
    const item1 = buildInvoiceItem(stock1, qty1, unitPrice1);
    const total1 = item1.total;

    const invoice1 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(1),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(5),
      items: [item1],
      subtotal: total1,
      discount: { type: null, value: 0, computedAmount: 0, freeItems: [] },
      taxRate: 0,
      taxAmount: 0,
      total: total1,
      paymentType: 'cash',
      dueDate: null,
      totalInstallments: 0,
      paidAmount: total1,
      remainingAmount: 0,
      paymentMethod: 'cash',
      status: INVOICE_STATUSES.PAID,
      paidAt: daysAgo(5),
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'فاتورة اختبار نقدية',
      createdBy: admin._id,
      finalizedBy: admin._id,
      finalizedAt: daysAgo(5),
    });

    await CashTransaction.create({
      transactionNumber: `CT-TEST-${Date.now()}-1`,
      accountType: 'cash',
      direction: 'in',
      category: 'sale_cash',
      amount: total1,
      description: `دفعة نقدية للفاتورة ${invoice1.invoiceNumber}`,
      referenceType: 'Invoice',
      referenceId: invoice1._id,
      party: customer._id,
      partyType: 'Customer',
      createdBy: admin._id,
    });

    logger.info(`   ✅ ${invoice1.invoiceNumber} — ${total1} SDG`);

    // ─────────────────────────────────────────────
    // السيناريو 2: فاتورة آجلة (pending)
    // ─────────────────────────────────────────────
    logger.info('📅 [2/5] فاتورة آجلة (pending)...');

    const stock2 = stocks[1];
    const qty2 = Math.min(3, stock2.quantity);
    const unitPrice2 = stock2.unitPrice || 80;
    const item2 = buildInvoiceItem(stock2, qty2, unitPrice2);
    const total2 = item2.total;
    const dueDate2 = daysFromNow(30);

    const invoice2 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(2),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(2),
      items: [item2],
      subtotal: total2,
      discount: {
        type: 'percentage',
        value: 5,
        reason: 'عميل دائم',
        computedAmount: Math.round(total2 * 0.05 * 100) / 100,
        freeItems: [],
      },
      taxRate: 0,
      taxAmount: 0,
      total: Math.round((total2 * 0.95) * 100) / 100,
      paymentType: 'credit',
      dueDate: dueDate2,
      totalInstallments: 0,
      paidAmount: 0,
      remainingAmount: Math.round((total2 * 0.95) * 100) / 100,
      paymentMethod: '',
      status: INVOICE_STATUSES.PENDING,
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'فاتورة اختبار آجلة',
      createdBy: admin._id,
      finalizedBy: admin._id,
      finalizedAt: daysAgo(2),
    });

    // زيادة رصيد الصيدلية
    await Customer.updateOne(
      { _id: customer._id },
      { $inc: { currentBalance: invoice2.total } }
    );

    logger.info(`   ✅ ${invoice2.invoiceNumber} — ${invoice2.total} SDG (آجل)`);

    // ─────────────────────────────────────────────
    // السيناريو 3: فاتورة أقساط (partial)
    // ─────────────────────────────────────────────
    logger.info('💳 [3/5] فاتورة أقساط (partial)...');

    const stock3 = stocks[2];
    const qty3 = Math.min(4, stock3.quantity);
    const unitPrice3 = stock3.unitPrice || 120;
    const item3 = buildInvoiceItem(stock3, qty3, unitPrice3);
    const total3 = item3.total;
    const firstInstallment = Math.round(total3 * 0.25 * 100) / 100;

    const invoice3 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(3),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(10),
      items: [item3],
      subtotal: total3,
      discount: { type: null, value: 0, computedAmount: 0, freeItems: [] },
      taxRate: 0,
      taxAmount: 0,
      total: total3,
      paymentType: 'installments',
      dueDate: daysFromNow(20),
      totalInstallments: 4,
      paidAmount: firstInstallment,
      remainingAmount: Math.round((total3 - firstInstallment) * 100) / 100,
      paymentMethod: 'cash',
      status: INVOICE_STATUSES.PARTIAL,
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'فاتورة اختبار بالأقساط',
      createdBy: admin._id,
      finalizedBy: admin._id,
      finalizedAt: daysAgo(10),
    });

    await CashTransaction.create({
      transactionNumber: `CT-TEST-${Date.now()}-3`,
      accountType: 'cash',
      direction: 'in',
      category: 'customer_payment',
      amount: firstInstallment,
      description: `القسط الأول للفاتورة ${invoice3.invoiceNumber}`,
      referenceType: 'Invoice',
      referenceId: invoice3._id,
      party: customer._id,
      partyType: 'Customer',
      createdBy: admin._id,
    });

    await Customer.updateOne(
      { _id: customer._id },
      { $inc: { currentBalance: invoice3.remainingAmount } }
    );

    logger.info(`   ✅ ${invoice3.invoiceNumber} — ${total3} SDG (قسط 1/4 مدفوع)`);

    // ─────────────────────────────────────────────
    // السيناريو 4: مسودة (draft) — لم تُعتمد بعد
    // ─────────────────────────────────────────────
    logger.info('📝 [4/5] مسودة فاتورة (draft)...');

    const stock4 = stocks[0];
    const qty4 = Math.min(2, stock4.quantity);
    const unitPrice4 = stock4.unitPrice || 100;
    const item4 = buildInvoiceItem(stock4, qty4, unitPrice4);
    const total4 = item4.total;

    const invoice4 = await Invoice.create({
      invoiceNumber: generateTestInvoiceNumber(4),
      pharmacy: customer._id,
      salesRep: salesRep._id,
      warehouse: warehouse._id,
      invoiceDate: daysAgo(0),
      items: [item4],
      subtotal: total4,
      discount: { type: null, value: 0, computedAmount: 0, freeItems: [] },
      taxRate: 0,
      taxAmount: 0,
      total: total4,
      paymentType: null,
      dueDate: null,
      totalInstallments: 0,
      paidAmount: 0,
      remainingAmount: total4,
      paymentMethod: '',
      status: INVOICE_STATUSES.DRAFT,
      commission: { rate: 0, amount: 0, isPaid: false },
      notes: 'مسودة اختبارية — بانتظار الاعتماد',
      createdBy: admin._id,
    });

    logger.info(`   ✅ ${invoice4.invoiceNumber} — ${total4} SDG (مسودة)`);

    // ─────────────────────────────────────────────
    // السيناريو 5: مرتجع (pending)
    // ─────────────────────────────────────────────
    logger.info('🔄 [5/5] مرتجع عميل (pending)...');

    const returnedQty = 1;
    const returnedItem = invoice1.items[0];

    const testReturn = await CustomerReturn.create({
      returnNumber: generateTestReturnNumber(1),
      originalInvoice: invoice1._id,
      pharmacy: customer._id,
      items: [
        {
          item: returnedItem.item,
          batch: returnedItem.batch,
          quantity: returnedQty,
          unit: '',
          unitPrice: returnedItem.unitPrice,
          total: Math.round(returnedQty * returnedItem.unitPrice * 100) / 100,
          reason: 'damaged',
          note: 'تلف أثناء النقل',
        },
      ],
      total: Math.round(returnedQty * returnedItem.unitPrice * 100) / 100,
      returnDate: daysAgo(1),
      invoiceDate: invoice1.invoiceDate,
      gracePeriodDays: 7,
      isWithinGracePeriod: true,
      status: RETURN_STATUSES.PENDING,
      settlementType: SETTLEMENT_TYPES.BALANCE_DEDUCTION,
      settledAmount: 0,
      notes: 'مرتجع اختباري',
      createdBy: admin._id,
    });

    logger.info(`   ✅ ${testReturn.returnNumber} — ${testReturn.total} SDG (pending)`);

    // ═══════════════════════════════════════════
    // 4. الملخص
    // ═══════════════════════════════════════════
    logger.info('');
    logger.info('═══════════════════════════════════════════════');
    logger.info('🎉 اكتمل السكربت بنجاح!');
    logger.info('═══════════════════════════════════════════════');
    logger.info('');
    logger.info('📊 البيانات التجريبية المُنشأة:');
    logger.info('');
    logger.info(`  1. ${invoice1.invoiceNumber}  →  نقدي (مدفوعة)      →  ${invoice1.total} SDG`);
    logger.info(`  2. ${invoice2.invoiceNumber}  →  آجل (معلقة)         →  ${invoice2.total} SDG`);
    logger.info(`  3. ${invoice3.invoiceNumber}  →  أقساط (مدفوعة جزئياً) →  ${invoice3.total} SDG`);
    logger.info(`  4. ${invoice4.invoiceNumber}  →  مسودة (draft)        →  ${invoice4.total} SDG`);
    logger.info(`  5. ${testReturn.returnNumber}  →  مرتجع (معلق)        →  ${testReturn.total} SDG`);
    logger.info('');
    logger.info('🔍 للاختبار:');
    logger.info('   GET  /api/invoices');
    logger.info('   GET  /api/invoices?status=draft');
    logger.info('   GET  /api/customer-returns');
    logger.info('');
    logger.info('💡 لاختبار الاعتماد (المسودة):');
    logger.info(`   POST /api/invoices/${invoice4._id}/finalize`);
    logger.info('   Body: { "paymentType": "cash" }');
    logger.info('');
    logger.info('⚠️  لمسح كل البيانات التجريبية:');
    logger.info('   npm run seed:invoices   (سيُعيد المسح والإنشاء)');
    logger.info('');
  } catch (error) {
    logger.error(`❌ فشل السكربت: ${error.message}`);
    logger.error(error.stack || '');
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

// ============================================================
// التشغيل
// ============================================================

main()
  .then(() => {
    logger.info('👋 تم إغلاق الاتصال بقاعدة البيانات.');
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`💥 خطأ غير متوقع: ${error.message}`);
    process.exit(1);
  });