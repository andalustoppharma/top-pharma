/**
 * @file CategoriesContext.jsx
 * @description Context API لإدارة حالة التصنيفات.
 *
 * لماذا هذا الملف؟
 * - مصدر واحد لبيانات التصنيفات في كل التطبيق.
 * - يمنع الاستعلامات المتكررة (cache في الذاكرة).
 * - يوفّر دوال CRUD موحّدة تُستخدم من أي مكوّن.
 * - يتبع نمط AuthContext.jsx (useCallback + useMemo).
 */

import { createContext, useCallback, useMemo, useState } from 'react';

import * as categoriesAPI from '../api/categoriesAPI.js';

// ═══════════════════════════════════════════════
// 1. إنشاء Context
// ═══════════════════════════════════════════════
export const CategoriesContext = createContext(null);

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

// ═══════════════════════════════════════════════
// 3. Provider
// ═══════════════════════════════════════════════
export function CategoriesProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState(INITIAL_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ═══════════════════════════════════════════════
  // 4. القراءة
  // ═══════════════════════════════════════════════
  const fetchCategories = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const result = await categoriesAPI.listCategories(params);
      setCategories(result.items || []);
      setPagination(result.pagination || INITIAL_PAGINATION);
      return { success: true, data: result };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تحميل التصنيفات.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 5. الإنشاء
  // ═══════════════════════════════════════════════
  const createCategory = useCallback(async (payload) => {
    setLoading(true);
    setError(null);

    try {
      const created = await categoriesAPI.createCategory(payload);
      setCategories((prev) => [...prev, created]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      return { success: true, data: created };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل إنشاء التصنيف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 6. التعديل
  // ═══════════════════════════════════════════════
  const updateCategory = useCallback(async (id, payload) => {
    setLoading(true);
    setError(null);

    try {
      const updated = await categoriesAPI.updateCategory(id, payload);
      setCategories((prev) =>
        prev.map((cat) => (cat.id === id ? updated : cat))
      );
      return { success: true, data: updated };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل تعديل التصنيف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 7. الحذف
  // ═══════════════════════════════════════════════
  const deleteCategory = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      await categoriesAPI.deleteCategory(id);
      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === id ? { ...cat, isActive: false } : cat
        )
      );
      return { success: true };
    } catch (err) {
      const message =
        err?.error?.message || err?.message || 'فشل حذف التصنيف.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════
  // 8. القيمة المُصدَّرة
  // ═══════════════════════════════════════════════
  const value = useMemo(
    () => ({
      categories,
      pagination,
      loading,
      error,
      fetchCategories,
      createCategory,
      updateCategory,
      deleteCategory,
      resetError: () => setError(null),
    }),
    [
      categories,
      pagination,
      loading,
      error,
      fetchCategories,
      createCategory,
      updateCategory,
      deleteCategory,
    ]
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}