/**
 * @file StockContext.jsx
 * @description Context API لإدارة حالة المخزون (الدفعات).
 */

import { createContext, useCallback, useMemo, useState } from 'react';

import * as stocksAPI from '../api/stocksAPI.js';

export const StockContext = createContext(null);

const INITIAL_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
});

export function StockProvider({ children }) {
  const [stocks, setStocks] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ✅ مؤشرات سريعة للواجهة (لا تُحمَّل تلقائياً — عند الحاجة فقط)
  const [expiringSoon, setExpiringSoon] = useState({ count: 0, thresholdDays: 0, items: [] });
  const [belowReorder, setBelowReorder] = useState({ count: 0, items: [] });

  // ═══════════════════════════════════════════════
  // 1. القراءة
  // ═══════════════════════════════════════════════
  const fetchStocks = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const result = await stocksAPI.listStocks(params);
      setStocks(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل المخزون.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExpiringSoon = useCallback(async () => {
    try {
      const data = await stocksAPI.getExpiringSoon();
      setExpiringSoon(data);
      return { success: true, data };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تحميل التنبيهات.';
      return { success: false, error: message };
    }
  }, []);

  const fetchBelowReorder = useCallback(async () => {
    try {
      const data = await stocksAPI.getBelowReorder();
      setBelowReorder(data);
      return { success: true, data };
    } catch (err) {
      const message = err?.error?.message || err?.message || 'فشل تحميل الأصناف.';
      return { success: false, error: message };
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 2. الإنشاء
  // ═══════════════════════════════════════════════
  const createStock = useCallback(async (payload) => {
    setLoading(true);
    setError(null);

    try {
      const created = await stocksAPI.createStock(payload);
      // نُعيد الجلب بدل الإضافة المحلية (لأن الكمية قد تُدمج مع دفعة موجودة).
      return { success: true, data: created, needsRefresh: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل استلام الدفعة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 3. التعديل
  // ═══════════════════════════════════════════════
  const updateStock = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);

    try {
      const updated = await stocksAPI.updateStock(id, payload);
      setStocks((prev) => prev.map((s) => (s.id === id ? updated : s)));
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تعديل الدفعة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 4. الحذف
  // ═══════════════════════════════════════════════
  const deleteStock = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      await stocksAPI.deleteStock(id);
      setStocks((prev) => prev.filter((s) => s.id !== id));
      return { success: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل حذف الدفعة.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 5. القيمة المُصدَّرة
  // ═══════════════════════════════════════════════
  const value = useMemo(
    () => ({
      stocks,
      pagination,
      loading,
      error,
      expiringSoon,
      belowReorder,
      fetchStocks,
      fetchExpiringSoon,
      fetchBelowReorder,
      createStock,
      updateStock,
      deleteStock,
      resetError: () => setError(null),
    }),
    [
      stocks,
      pagination,
      loading,
      error,
      expiringSoon,
      belowReorder,
      fetchStocks,
      fetchExpiringSoon,
      fetchBelowReorder,
      createStock,
      updateStock,
      deleteStock,
    ]
  );

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}