/**
 * @file AuthContext.jsx
 * @description Context API لحالة المصادقة
 *
 * ✅ الحلول المُطبَّقة:
 * 1. قراءة متزامنة من localStorage عند التحميل (لا شاشة فارغة)
 * 2. عدم مسح الجلسة عند أخطاء الشبكة (فقط عند 401)
 * 3. دعم بنية name/role كـ strings
 * 4. تحديث البيانات في الخلفية (بلا حجب)
 * 5. خروج تلقائي بعد خمول 30 دقيقة
 */

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  login as loginAPI,
  logout as logoutAPI,
  getCurrentUser,
} from '../api/authAPI.js';
import { ROLE_LABELS_AR, STORAGE_KEYS } from '../utils/constants.js';

// ═══════════════════════════════════════════════
// 1. إنشاء Context
// ═══════════════════════════════════════════════
export const AuthContext = createContext(null);

// ═══════════════════════════════════════════════
// 2. دوال مساعدة (Synchronous)
// ═══════════════════════════════════════════════

/**
 * قراءة المستخدم من localStorage بشكل آمن
 * @returns {Object|null}
 */
function readUserFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    // ✅ التحقق من صحة البيانات
    if (parsed && parsed.email) {
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn('فشل قراءة المستخدم من localStorage:', e);
    return null;
  }
}

/**
 * قراءة توكن الوصول من localStorage
 * @returns {string|null}
 */
function readTokenFromStorage() {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════
// 3. الإعدادات
// ═══════════════════════════════════════════════
const IDLE_TIMEOUT_MINUTES = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT) || 30;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

// ═══════════════════════════════════════════════
// 4. Provider
// ═══════════════════════════════════════════════
export function AuthProvider({ children }) {
  // ✅ قراءة متزامنة (Lazy Initializer) — تعمل مرة واحدة عند التحميل
  const [user, setUser] = useState(() => readUserFromStorage());
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = readTokenFromStorage();
    const storedUser = readUserFromStorage();
    return Boolean(token && storedUser);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const idleTimerRef = useRef(null);

  // ═══════════════════════════════════════════════
  // 5. مؤقت الخمول
  // ═══════════════════════════════════════════════
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();

    if (!isAuthenticated) {
      return;
    }

    idleTimerRef.current = setTimeout(() => {
      // ✅ نخرج المستخدم
      try {
        logoutAPI();
      } catch {
        // نتجاهل
      }
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      setUser(null);
      setIsAuthenticated(false);
    }, IDLE_TIMEOUT_MS);
  }, [isAuthenticated, clearIdleTimer]);

  // ═══════════════════════════════════════════════
  // 6. دوال الجلسة
  // ═══════════════════════════════════════════════
  const persistSession = useCallback((userData, accessToken, refreshToken) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));

    setUser(userData);
    setIsAuthenticated(true);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);

    setUser(null);
    setIsAuthenticated(false);
    setError(null);
    clearIdleTimer();
  }, [clearIdleTimer]);

  // ═══════════════════════════════════════════════
  // 7. تسجيل الدخول
  // ═══════════════════════════════════════════════
  const login = useCallback(
    async (email, password) => {
      setLoading(true);
      setError(null);

      try {
        const data = await loginAPI({ email, password });
        persistSession(data.user, data.accessToken, data.refreshToken);
        return { success: true, user: data.user };
      } catch (err) {
        const message = err?.message || 'فشل تسجيل الدخول';
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [persistSession]
  );

  // ═══════════════════════════════════════════════
  // 8. تسجيل الخروج
  // ═══════════════════════════════════════════════
  const logout = useCallback(async () => {
    try {
      await logoutAPI();
    } catch {
      // ⚠️ نتجاهل الخطأ
    } finally {
      clearSession();
    }
  }, [clearSession]);

  // ═══════════════════════════════════════════════
  // 9. تحديث بيانات المستخدم (في الخلفية)
  // ═══════════════════════════════════════════════
  const refreshUserData = useCallback(async () => {
    const token = readTokenFromStorage();

    if (!token) {
      // ✅ لا يوجد توكن → امسح أي بيانات متبقية
      clearSession();
      return;
    }

    try {
      const userData = await getCurrentUser();

      if (userData && userData.email) {
        // ✅ تحديث البيانات
        setUser(userData);
        setIsAuthenticated(true);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
      }
    } catch (err) {
      // ⚠️ مهم: لا نمسح الجلسة عند أخطاء الشبكة
      // فقط عند 401 (توكن غير صالح)
      const errorCode = err?.error?.code || err?.code;
      const status = err?.status || err?.response?.status;

      if (
        status === 401 ||
        errorCode === 'TOKEN_INVALID' ||
        errorCode === 'TOKEN_EXPIRED' ||
        errorCode === 'UNAUTHORIZED'
      ) {
        clearSession();
      }
      // وإلا → نُبقي المستخدم مسجّلاً بالبيانات المخزّنة
    }
  }, [clearSession]);

  // ═══════════════════════════════════════════════
  // 10. Effects
  // ═══════════════════════════════════════════════

  // ✅ عند التحميل: تحديث البيانات في الخلفية (بلا حجب)
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshUserData();
    }, 100);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ مراقبة النشاط (للخروج التلقائي)
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    const handleActivity = () => {
      resetIdleTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    resetIdleTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearIdleTimer();
    };
  }, [isAuthenticated, resetIdleTimer, clearIdleTimer]);

  // ═══════════════════════════════════════════════
  // 11. القيمة المُصدَّرة
  // ═══════════════════════════════════════════════
  const value = useMemo(() => {
    // ✅ التعامل مع بنية name/role كـ strings
    const userName =
      typeof user?.name === 'string' ? user.name : user?.name?.ar || null;

    const userRole =
      typeof user?.role === 'string' ? user.role : user?.role?.name || null;

    const userRoleAr = ROLE_LABELS_AR[userRole] || userRole;

    return {
      // ✅ الحالة
      user,
      loading,
      error,
      isAuthenticated,

      // ✅ الدوال
      login,
      logout,
      fetchCurrentUser: refreshUserData,

      // ✅ البيانات المُشتقّة
      userName,
      userRole,
      userRoleAr,

      // ✅ مساعدات
      hasRole: (roleName) => userRole === roleName,
      isAdmin: userRole === 'admin',
      isStorekeeper: userRole === 'storekeeper',
      isAccountant: userRole === 'accountant',
      isSalesRep: userRole === 'sales_rep',
      isPharmacy: userRole === 'pharmacy',
    };
  }, [user, loading, error, isAuthenticated, login, logout, refreshUserData]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}