/**
 * @file InvoiceForm.jsx
 * @description نموذج الفاتورة — Phase 2.5 (دعم overrideReason).
 *
 * ⚠️ إضافة Phase 2.5:
 * - جمع overrideReason من السطور التي تحتوي على تجاوزات.
 * - تمريره إلى createInvoice / finalize.
 * - عرض تنبيه إذا احتوت الفاتورة على أي تجاوز.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Package, AlertCircle, Loader2, Percent, DollarSign,
  ShoppingCart, FileEdit, CheckCircle2, X, Shield, Lock,
} from 'lucide-react';

import * as customersAPI from '../../api/customersAPI.js';
import * as usersAPI from '../../api/usersAPI.js';
import * as warehousesAPI from '../../api/warehousesAPI.js';
import * as itemsAPI from '../../api/itemsAPI.js';
import * as stocksAPI from '../../api/stocksAPI.js';

import { useInvoices } from '../../hooks/useInvoices.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';

import Button from '../UI/Button.jsx';
import Input from '../UI/Input.jsx';
import InvoiceItemsTable from './InvoiceItemsTable.jsx';
import FefoSelectorModal from './FefoSelectorModal.jsx';

import { formatCurrency } from '../../utils/formatters.js';
import { PAYMENT_TYPE_LABELS_AR } from '../../utils/constants.js';

function Section({ title, icon: Icon, children, description }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-200">
        {Icon && <Icon size={18} className="text-primary-700" />}
        <h3 className="font-bold text-neutral-900">{title}</h3>
        {description && <span className="text-xs text-neutral-500">— {description}</span>}
      </div>
      {children}
    </div>
  );
}

function Select({ label, value, onChange, options, required, disabled }) {
  return (
    <div>
      {label && (
        <label className="block mb-1.5 text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-danger-600 mr-1">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 ${disabled ? 'bg-neutral-100 cursor-not-allowed' : ''}`}
      >
        <option value="">— اختر —</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function InvoiceForm({ mode = 'create', initialDraft = null, onSuccess, onCancel }) {
  const toast = useToast();
  const { isAdmin, isAccountant } = useAuth();
  const { createInvoice, createDraft, updateDraft, finalize } = useInvoices();

  const canOverridePrice = isAdmin || isAccountant;

  const [customers, setCustomers] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [pharmacy, setPharmacy] = useState(initialDraft?.pharmacy?.id || initialDraft?.pharmacy?._id || '');
  const [salesRep, setSalesRep] = useState(initialDraft?.salesRep?.id || initialDraft?.salesRep?._id || '');
  const [warehouse, setWarehouse] = useState(initialDraft?.warehouse?.id || initialDraft?.warehouse?._id || '');
  const [invoiceDate, setInvoiceDate] = useState(
    initialDraft?.invoiceDate ? new Date(initialDraft.invoiceDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [items, setItems] = useState(() => {
    if (initialDraft?.items) {
      return initialDraft.items.map((it) => ({
        item: it.item, itemName: it.item?.tradeName || '—',
        batch: it.batch, expiry: it.expiry, quantity: it.quantity,
        unit: it.unit, unitPrice: it.unitPrice, unitCost: it.unitCost || 0, total: it.total,
        overrideReason: it.overrideReason || '',
      }));
    }
    return [];
  });

  const [discountType, setDiscountType] = useState(initialDraft?.discount?.type || '');
  const [discountValue, setDiscountValue] = useState(initialDraft?.discount?.value ? String(initialDraft.discount.value) : '');
  const [taxRate, setTaxRate] = useState(initialDraft?.taxRate != null ? String(initialDraft.taxRate) : '0');

  const [paymentType, setPaymentType] = useState(initialDraft?.paymentType || 'cash');
  const [dueDate, setDueDate] = useState(initialDraft?.dueDate ? new Date(initialDraft.dueDate).toISOString().slice(0, 10) : '');
  const [totalInstallments, setTotalInstallments] = useState(initialDraft?.totalInstallments != null ? String(initialDraft.totalInstallments) : '2');
  const [paidAmount, setPaidAmount] = useState(initialDraft?.paidAmount != null ? String(initialDraft.paidAmount) : '0');
  const [paymentMethod, setPaymentMethod] = useState(initialDraft?.paymentMethod || 'cash');
  const [notes, setNotes] = useState(initialDraft?.notes || '');

  // ✅ Phase 2.5: سبب التجاوز العام للفاتورة
  const [overrideReason, setOverrideReason] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [debouncedItemSearch, setDebouncedItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const [showItemResults, setShowItemResults] = useState(false);

  const [selectedItemForFefo, setSelectedItemForFefo] = useState(null);
  const [isFefoOpen, setIsFefoOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // ═══════════════════════════════════════════════
  // تحميل الخيارات
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const [c, r, w] = await Promise.all([
          customersAPI.listCustomers({ limit: 100, isActive: true }),
          usersAPI.listSalesReps(),
          warehousesAPI.listWarehouses({ limit: 100, isActive: true }),
        ]);
        setCustomers(c.items || []);
        setSalesReps(r || []);
        const whs = w.items || [];
        setWarehouses(whs);
        if (!warehouse && mode === 'create') {
          const dw = whs.find((x) => x.isDefault);
          if (dw) setWarehouse(dw.id);
        }
      } catch {
        toast.error('فشل تحميل البيانات الأساسية.');
      } finally {
        setLoadingOptions(false);
      }
    };
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════
  // البحث عن الأصناف
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const t = setTimeout(() => setDebouncedItemSearch(itemSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [itemSearch]);

  useEffect(() => {
    const search = async () => {
      setSearchingItems(true);
      try {
        const params = { isActive: true, limit: 30 };
        if (debouncedItemSearch.length >= 2) params.search = debouncedItemSearch;
        const r = await itemsAPI.listItems(params);
        setItemResults(r.items || []);
        setShowItemResults(true);
      } catch {
        setItemResults([]);
      } finally {
        setSearchingItems(false);
      }
    };
    search();
  }, [debouncedItemSearch]);

  // ═══════════════════════════════════════════════
  // الحسابات
  // ═══════════════════════════════════════════════
  const subtotal = useMemo(() => items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0), [items]);

  const discountAmount = useMemo(() => {
    if (!discountType || !discountValue) return 0;
    const v = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') return Math.round((subtotal * v) / 100 * 100) / 100;
    if (discountType === 'fixed') return v;
    return 0;
  }, [discountType, discountValue, subtotal]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = useMemo(() => Math.round((taxableAmount * (parseFloat(taxRate) || 0)) / 100 * 100) / 100, [taxableAmount, taxRate]);
  const total = useMemo(() => Math.round((taxableAmount + taxAmount) * 100) / 100, [taxableAmount, taxAmount]);

  const finalPaidAmount = paymentType === 'cash' ? total : parseFloat(paidAmount) || 0;
  const remainingAmount = Math.max(0, total - finalPaidAmount);

  // ✅ Phase 2.5: فحص هل يوجد تجاوزات في السطور
  const hasOverriddenItems = useMemo(
    () => items.some((it) => it.overrideReason && it.overrideReason.trim().length > 0),
    [items]
  );

  // ═══════════════════════════════════════════════
  // اختيار صنف → FEFO
  // ═══════════════════════════════════════════════
  const handlePickItem = (item) => {
    if (!warehouse) { toast.error('يجب اختيار المخزن أولاً.'); return; }
    setSelectedItemForFefo(item);
    setIsFefoOpen(true);
    setShowItemResults(false);
    setItemSearch('');
    setItemResults([]);
  };

  const addItemRow = ({ item, batch, expiry, quantity, unitPrice, overrideReason: rowReason }) => {
    setItems((prev) => [...prev, {
      item, itemName: item.tradeName, batch, expiry, quantity,
      unit: item.units?.base?.name || item.supportedUnits?.[0] || '',
      unitPrice, unitCost: 0,
      total: Math.round(quantity * unitPrice * 100) / 100,
      overrideReason: rowReason || '',
    }]);
  };

  const handleFefoSelect = async ({ batch, expiry, quantity, unitPrice, overrideReason: rowReason }) => {
    const item = selectedItemForFefo;
    if (batch) {
      addItemRow({ item, batch, expiry, quantity, unitPrice, overrideReason: rowReason });
    } else {
      try {
        const r = await stocksAPI.selectFEFO({ item: item.id, warehouse, quantity });
        const sels = r.selections || [];
        if (sels.length === 0) { toast.error('لا توجد دفعات.'); return; }
        sels.forEach((sel) => addItemRow({
          item, batch: sel.batch, expiry: sel.expiry,
          quantity: sel.quantity, unitPrice,
          overrideReason: rowReason,
        }));
        if (sels.length > 1) toast.success(`تم التقسيم على ${sels.length} دفعات.`);
      } catch (err) {
        toast.error(err?.error?.message || err?.message || 'فشل FEFO.');
        return;
      }
    }
    setIsFefoOpen(false);
    setSelectedItemForFefo(null);
  };

  // ═══════════════════════════════════════════════
  // التحقق والحفظ
  // ═══════════════════════════════════════════════
  const validateBase = () => {
    if (!pharmacy) return 'الصيدلية مطلوبة';
    if (!salesRep) return 'المندوب مطلوب';
    if (!warehouse) return 'المخزن مطلوب';
    if (items.length === 0) return 'يجب إضافة بند واحد على الأقل';
    if (items.some((i) => !i.batch)) return 'يجب اختيار دفعة لكل بند';
    return null;
  };

  const validatePayment = () => {
    if (paymentType !== 'cash' && !dueDate) return 'تاريخ الاستحقاق مطلوب';
    if (paymentType === 'installments') {
      const n = parseInt(totalInstallments, 10);
      if (!Number.isInteger(n) || n < 2) return 'عدد الأقساط يجب أن يكون 2 على الأقل';
    }
    if (finalPaidAmount > total + 0.01) return 'المبلغ المدفوع أكبر من الإجمالي';
    return null;
  };

  /**
   * ✅ Phase 2.5: جمع overrideReason من السطور.
   * - إذا كانت كل السطور لها نفس السبب → نستخدمه.
   * - إذا اختلفت → نستخدم سبب الفاتورة العامة (أو أول سبب).
   */
  const collectOverrideReason = () => {
    if (overrideReason.trim()) return overrideReason.trim();

    const reasons = items
      .filter((it) => it.overrideReason && it.overrideReason.trim())
      .map((it) => it.overrideReason.trim());

    if (reasons.length === 0) return undefined;
    // نستخدم أول سبب (المستخدم قد يكتب سبباً عاماً)
    return reasons[0];
  };

  const buildBasePayload = () => ({
    pharmacy,
    salesRep,
    warehouse,
    invoiceDate: new Date(invoiceDate).toISOString(),
    items: items.map((i) => ({
      item: i.item.id || i.item._id,
      batch: i.batch,
      expiry: i.expiry || undefined,
      quantity: i.quantity,
      unit: i.unit || '',
      unitPrice: i.unitPrice,
      total: i.total,
      unitCost: i.unitCost || 0,
    })),
    // ✅ Phase 2.5: الحقول المالية المطلوبة لـ createInvoiceSchema
    subtotal,
    taxAmount,
    total,
    discount: discountType
      ? {
          type: discountType,
          value: parseFloat(discountValue) || 0,
          computedAmount: discountAmount,
          freeItems: [],
        }
      : undefined,
    taxRate: parseFloat(taxRate) || 0,
    notes: notes || undefined,
  });

  const buildPaymentPayload = () => ({
    paymentType,
    dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    totalInstallments: paymentType === 'installments' ? parseInt(totalInstallments, 10) : 0,
    paidAmount: finalPaidAmount,
    paymentMethod: finalPaidAmount > 0 ? paymentMethod : '',
    notes: notes || undefined,
    overrideReason: collectOverrideReason(),
  });

  const handleSaveDraft = async () => {
    const err = validateBase();
    if (err) { toast.error(err); return; }

    setIsSubmitting(true);
    const payload = buildBasePayload();
    const result = mode === 'editDraft'
      ? await updateDraft(initialDraft.id, payload)
      : await createDraft(payload);
    setIsSubmitting(false);

    if (result.success) {
      toast.success(mode === 'editDraft' ? 'تم تحديث المسودة.' : 'تم حفظ المسودة.');
      onSuccess?.(result.data);
    } else {
      toast.error(result.error);
    }
  };

  const handleFinalize = async () => {
    const baseErr = validateBase();
    if (baseErr) { toast.error(baseErr); return; }
    const payErr = validatePayment();
    if (payErr) { toast.error(payErr); return; }

    if (hasOverriddenItems && !collectOverrideReason()) {
      toast.error('هذه الفاتورة تتضمن تجاوزاً سعرياً. يجب إدخال سبب التجاوز.');
      return;
    }

    setIsSubmitting(true);
    const base = buildBasePayload();
    const payment = buildPaymentPayload();

    let result;
    if (mode === 'editDraft') {
      const upd = await updateDraft(initialDraft.id, base);
      if (!upd.success) { setIsSubmitting(false); toast.error(upd.error); return; }
      result = await finalize(initialDraft.id, payment);
    } else {
      result = await createInvoice({ ...base, ...payment });
    }

    setIsSubmitting(false);
    if (result.success) {
      toast.success(mode === 'editDraft' ? 'تم اعتماد الفاتورة.' : 'تم إنشاء الفاتورة.');
      onSuccess?.(result.data);
    } else {
      toast.error(result.error);
    }
  };

  // ═══════════════════════════════════════════════
  // العرض
  // ═══════════════════════════════════════════════
  if (loadingOptions) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-700" />
        <span className="mr-3 text-neutral-600">جاري تحميل البيانات...</span>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      {/* البيانات الأساسية */}
      <Section title="البيانات الأساسية" icon={ShoppingCart}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select label="الصيدلية" required value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.phone})` }))}
            disabled={mode === 'editDraft'} />
          <Select label="المندوب" required value={salesRep}
            onChange={(e) => setSalesRep(e.target.value)}
            options={salesReps.map((r) => ({ value: r.id, label: r.name }))} />
          <Select label="المخزن" required value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            options={warehouses.map((w) => ({
              value: w.id, label: `${w.name}${w.isDefault ? ' (افتراضي)' : ''}`,
            }))} />
          <Input label="تاريخ الفاتورة" type="date" value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>
        {mode === 'editDraft' && (
          <div className="mt-3 bg-info-50 border border-info-200 rounded-md p-2 text-xs text-info-800 flex items-start gap-2">
            <FileEdit size={14} className="flex-shrink-0 mt-0.5" />
            <span>أنت في وضع <strong>تعديل المسودة</strong> — يمكنك تغيير البنود والمبالغ بحرية.</span>
          </div>
        )}
      </Section>

      {/* البنود */}
      <Section title="البنود" icon={Package} description={`${items.length} بند`}>
        <div className="relative mb-3">
          <Input
            placeholder="ابحث عن صنف... (كل الأصناف معروضة أدناه)"
            icon={Search}
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            onFocus={() => setShowItemResults(true)}
          />
          {searchingItems && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg p-3 text-center text-sm text-neutral-500 z-20">
              <Loader2 size={16} className="inline animate-spin mr-2" />جاري التحميل...
            </div>
          )}
          {showItemResults && !searchingItems && itemResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-20">
              {itemResults.map((item) => (
                <button key={item.id} type="button" onClick={() => handlePickItem(item)}
                  className="w-full text-right px-4 py-2 hover:bg-primary-50 border-b border-neutral-100 last:border-b-0">
                  <p className="font-medium text-neutral-900">{item.tradeName}</p>
                  <p className="text-xs text-neutral-500">{item.scientificName} · {item.category}</p>
                </button>
              ))}
            </div>
          )}
          {showItemResults && !searchingItems && itemResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg p-3 text-center text-sm text-neutral-500 z-20">
              <AlertCircle size={16} className="inline mr-1 text-warning-600" />
              {debouncedItemSearch ? 'لا توجد أصناف مطابقة' : 'لا توجد أصناف نشطة'}
            </div>
          )}
        </div>

        <InvoiceItemsTable
          items={items}
          onChange={setItems}
          emptyMessage="اختر صنفاً من القائمة أعلاه لإضافته."
        />

        {/* ✅ تحذير التجاوز العام */}
        {hasOverriddenItems && (
          <div className="mt-3 bg-warning-50 border-2 border-warning-300 rounded-md p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Shield size={18} className="text-warning-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-warning-900">
                <p className="font-bold">⚠️ بعض البنود بأسعار أقل من الحد الموصى به</p>
                <p className="text-xs mt-1">
                  سيُنبَّه الأدمن بعد حفظ الفاتورة.
                  {!canOverridePrice && ' لا تملك صلاحية التجاوز.'}
                </p>
              </div>
            </div>
            {canOverridePrice ? (
              <div>
                <label className="block text-xs font-medium text-warning-900 mb-1">
                  سبب التجاوز العام *
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-warning-300 text-sm focus:outline-none focus:ring-2 focus:ring-warning-200 bg-white"
                  rows={2}
                  placeholder="مثال: عميل دائم — خصم خاص، عرض ترويجي، ..."
                  maxLength={500}
                />
              </div>
            ) : (
              <div className="bg-danger-50 border border-danger-200 rounded p-2 text-xs text-danger-800 flex items-start gap-2">
                <Lock size={14} className="flex-shrink-0 mt-0.5" />
                <span>لا تملك صلاحية حفظ فاتورة بأسعار أقل من الحد. عدّل الأسعار أو اطلب من المدير/المحاسب.</span>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* الملخص المالي والدفع */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="الملخص المالي" icon={DollarSign}>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">المجموع الفرعي</span>
              <span className="numeric font-medium">{formatCurrency(subtotal, false)}</span>
            </div>
            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">الخصم</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={discountType}
                  onChange={(e) => { setDiscountType(e.target.value); if (!e.target.value) setDiscountValue(''); }}
                  className="px-2 py-1.5 rounded-md border border-neutral-300 text-sm">
                  <option value="">لا يوجد</option>
                  <option value="percentage">نسبة %</option>
                  <option value="fixed">مبلغ ثابت</option>
                </select>
                <input type="number" value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  disabled={!discountType} min="0" step="0.01"
                  className="px-2 py-1.5 rounded-md border border-neutral-300 text-sm numeric disabled:bg-neutral-100"
                  placeholder={discountType === 'percentage' ? '0%' : '0.00'} />
              </div>
              {discountAmount > 0 && (
                <p className="text-xs text-danger-700 mt-1 text-left numeric">- {formatCurrency(discountAmount)}</p>
              )}
            </div>
            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">الضريبة %</label>
              <input type="number" value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                min="0" max="100" step="0.01"
                className="w-full px-2 py-1.5 rounded-md border border-neutral-300 text-sm numeric" />
              {taxAmount > 0 && (
                <p className="text-xs text-neutral-600 mt-1 text-left numeric">+ {formatCurrency(taxAmount)}</p>
              )}
            </div>
            <div className="border-t border-neutral-200 pt-3 flex justify-between items-center">
              <span className="font-bold text-neutral-900">الإجمالي</span>
              <span className="text-xl font-bold numeric text-primary-800">{formatCurrency(total)}</span>
            </div>
          </div>
        </Section>

        <Section title="الدفع (للحفظ والاعتماد)" icon={Percent}>
          <div className="space-y-3">
            <Select label="نوع الدفع" required value={paymentType}
              onChange={(e) => {
                setPaymentType(e.target.value);
                if (e.target.value === 'cash') { setPaidAmount('0'); setDueDate(''); }
              }}
              options={Object.entries(PAYMENT_TYPE_LABELS_AR).map(([k, l]) => ({ value: k, label: l }))} />
            {paymentType !== 'cash' && (
              <Input label="تاريخ الاستحقاق" type="date" value={dueDate}
                onChange={(e) => setDueDate(e.target.value)} required />
            )}
            {paymentType === 'installments' && (
              <Input label="عدد الأقساط" type="number" min="2" max="60"
                value={totalInstallments} onChange={(e) => setTotalInstallments(e.target.value)} />
            )}
            <Input
              label={paymentType === 'cash' ? 'المبلغ المدفوع (كامل)' : 'دفعة مقدمة (اختياري)'}
              type="number"
              value={paymentType === 'cash' ? total.toFixed(2) : paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              disabled={paymentType === 'cash'}
              min="0" max={total} step="0.01"
            />
            {finalPaidAmount > 0 && (
              <Select label="طريقة الدفع" value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={[
                  { value: 'cash', label: 'نقدي' },
                  { value: 'bank', label: 'تحويل بنكي' },
                  { value: 'check', label: 'شيك' },
                ]} />
            )}
            {remainingAmount > 0 && (
              <div className="bg-warning-50 border border-warning-200 rounded p-2 text-xs text-warning-800 flex items-start gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>سيُسجَّل <strong className="numeric">{formatCurrency(remainingAmount)}</strong> على رصيد الصيدلية.</span>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* الملاحظات */}
      <Section title="ملاحظات" icon={X}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm"
          rows={2} placeholder="ملاحظات إدارية (اختياري)..." maxLength={1000} />
      </Section>

      {/* الأزرار */}
      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-neutral-200">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>إلغاء</Button>
        <Button type="button" variant="outline" icon={FileEdit}
          onClick={handleSaveDraft} disabled={isSubmitting}>
          {mode === 'editDraft' ? 'حفظ التعديلات' : 'حفظ كمسودة'}
        </Button>
        <Button type="button" variant="primary" icon={CheckCircle2}
          onClick={handleFinalize} loading={isSubmitting}
          disabled={hasOverriddenItems && !canOverridePrice}>
          {mode === 'editDraft' ? 'اعتماد ودفع' : 'حفظ واعتماد'} ({formatCurrency(total)})
        </Button>
      </div>

      {/* Fefo Modal */}
      {selectedItemForFefo && (
        <FefoSelectorModal
          isOpen={isFefoOpen}
          onClose={() => { setIsFefoOpen(false); setSelectedItemForFefo(null); }}
          onSelect={handleFefoSelect}
          item={selectedItemForFefo}
          warehouseId={warehouse}
          initialQuantity={1}
        />
      )}
    </form>
  );
}

export default InvoiceForm;