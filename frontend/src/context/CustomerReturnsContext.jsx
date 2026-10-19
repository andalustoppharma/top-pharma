/**
 * @file CustomerReturnsContext.jsx
 * @description Context API لإدارة حالة مرتجعات العملاء (Customer Returns).
 *
 * لماذا هذا الملف؟
 * - مصدر واحد لبيانات المرتجعات في التطبيق.
 * - يمنع الاستعلامات المتكررة (cache في الذاكرة).
 * - يوفّر دوال CRUD + الإجراءات الخاصة (approve, reject).
 * - يحتفظ بإحصاءات سريعة (stats) لحالات: معلقة، مقبولة، مرفوضة.
 * - يتبع نمط InvoicesContext.jsx (useCallback + useMemo).
 */

import { createContext, useCallback, useMemo, useState } from 'react';

import * as customerReturnsAPI from '../api/customerReturnsAPI.js';

// ═══════════════════════════════════════════════
// 1. إنشاء Context
// ═══════════════════════════════════════════════
export const CustomerReturnsContext = createContext(null);

// ═══════════════════════════════════════════════
// 2. الحالة الابتدائية
// ═══════════════════════════════════════════════
const INITIAL_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
});

const INITIAL_STATS = Object.freeze({
  total: 0,
  pending: 0,
  confirmed: 0,
  rejected: 0,
});

// ═══════════════════════════════════════════════
// 3. Provider
// ═══════════════════════════════════════════════
export function CustomerReturnsProvider({ children }) {
  const [customerReturns, setCustomerReturns] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // إحصاءات سريعة للواجهة
  const [stats, setStats] = useState(INITIAL_STATS);

  // ═══════════════════════════════════════════════
  // 4. القراءة
  // ═══════════════════════════════════════════════
  const fetchCustomerReturns = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const result = await customerReturnsAPI.listCustomerReturns(params);
      setCustomerReturns(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);

      // تحديث الإحصاءات تلقائياً إذا كانت النتيجة هي القائمة الكاملة (بدون فلتر)
      if (!params.status && !params.settlementType && !params.outsideGracePeriod) {
        setStats((prev) => ({ ...prev, total: result.pagination?.total || 0 }));
      }

      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل المرتجعات.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * جلب إحصاءات سريعة (المعلقة، المقبولة، المرفوضة، الإجمالي).
   * نستخدم limit: 1 لأننا نحتاج `pagination.total` فقط.
   */
  const fetchStats = useCallback(async () => {
    try {
      const [totalRes, pendingRes, confirmedRes, rejectedRes] = await Promise.all([
        customerReturnsAPI.listCustomerReturns({ limit: 1 }),
        customerReturnsAPI.listCustomerReturns({ status: 'pending', limit: 1 }),
        customerReturnsAPI.listCustomerReturns({ status: 'confirmed', limit: 1 }),
        customerReturnsAPI.listCustomerReturns({ status: 'rejected', limit: 1 }),
      ]);

      setStats({
        total: totalRes.pagination?.total || 0,
        pending: pendingRes.pagination?.total || 0,
        confirmed: confirmedRes.pagination?.total || 0,
        rejected: rejectedRes.pagination?.total || 0,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message };
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 5. الإنشاء
  // ═══════════════════════════════════════════════
  const createCustomerReturn = useCallback(async (payload) => {
    setLoading(true);
    setError(null);

    try {
      const created = await customerReturnsAPI.createCustomerReturn(payload);
      setCustomerReturns((prev) => [created, ...prev]);
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        pending: prev.pending + 1,
      }));
      return { success: true, data: created };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إنشاء المرتجع.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 6. الإجراءات الخاصة
  // ═══════════════════════════════════════════════

  /**
   * الموافقة على المرتجع (يُعيد المخزون ويُسوّي مالياً).
   */
  const approveCustomerReturn = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);

    try {
      const updated = await customerReturnsAPI.approveCustomerReturn(id, payload);
      setCustomerReturns((prev) => prev.map((ret) => (ret.id === id ? updated : ret)));
      
      // تحديث الإحصاءات محلياً (pending--, confirmed++)
      setStats((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        confirmed: prev.confirmed + 1,
      }));

      return { success: true, data: updated, needsRefresh: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل الموافقة على المرتجع.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * رفض المرتجع (لا يُعيد المخزون).
   */
  const rejectCustomerReturn = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);

    try {
      const updated = await customerReturnsAPI.rejectCustomerReturn(id, payload);
      setCustomerReturns((prev) => prev.map((ret) => (ret.id === id ? updated : ret)));

      // تحديث الإحصاءات محلياً (pending--, rejected++)
      setStats((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        rejected: prev.rejected + 1,
      }));

      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل رفض المرتجع.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 7. القيمة المُصدَّرة
  // ═══════════════════════════════════════════════
  const value = useMemo(
    () => ({
      customerReturns,
      pagination,
      loading,
      error,
      stats, // { total, pending, confirmed, rejected }
      fetchCustomerReturns,
      fetchStats,
      createCustomerReturn,
      approveCustomerReturn,
      rejectCustomerReturn,
      resetError: () => setError(null),
    }),
    [
      customerReturns,
      pagination,
      loading,
      error,
      stats,
      fetchCustomerReturns,
      fetchStats,
      createCustomerReturn,
      approveCustomerReturn,
      rejectCustomerReturn,
    ]
  );

  return (
    <CustomerReturnsContext.Provider value={value}>
      {children}
    </CustomerReturnsContext.Provider>
  );
}