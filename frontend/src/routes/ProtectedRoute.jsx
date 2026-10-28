/**
 * @file ProtectedRoute.jsx
 * @description
 * مكوّن حماية المسارات (Route Guard) — Phase 2.5.
 *
 * لماذا هذا الملف؟
 * - يمنع الوصول للمسارات المحمية بدون تسجيل دخول.
 * - يعيد التوجيه إلى /login مع حفظ المسار الأصلي.
 * - يدعم فحص الأدوار (requiredRoles).
 * - ينتظر انتهاء التحميل الأولي قبل اتخاذ القرار.
 * - يستخدم useAuth (يقرأ من localStorage بشكل متزامن).
 *
 * ⚠️ يدعم وضعين:
 *  1. Layout Route:  <Route element={<ProtectedRoute />}> ... </Route>
 *     → يستخدم <Outlet /> لعرض المحتوى.
 *  2. Wrapper:       <ProtectedRoute><Dashboard /></ProtectedRoute>
 *     → يستخدم children مباشرة.
 *
 * الاستخدام:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/" element={<Dashboard />} />
 *   </Route>
 *
 *   <ProtectedRoute requiredRoles={['admin']}>
 *     <SettingsPage />
 *   </ProtectedRoute>
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';
import Loading from '../components/UI/Loading.jsx';

// ═══════════════════════════════════════════════
// 1. مكوّن حماية المسارات (ProtectedRoute)
// ═══════════════════════════════════════════════
function ProtectedRoute({ children, requiredRoles, redirectTo = '/login' }) {
  const { isAuthenticated, loading, userRole } = useAuth();
  const location = useLocation();

  // ─── 1. أثناء التحميل الأولي ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loading size="lg" text="جاري التحقق من الجلسة..." />
      </div>
    );
  }

  // ─── 2. غير مسجل → إعادة توجيه ───
  if (!isAuthenticated) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // ─── 3. فحص الأدوار (إن مُرِّر requiredRoles) ───
  if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
    if (!requiredRoles.includes(userRole)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
          <div className="bg-white rounded-lg border border-neutral-200 p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-danger-50 text-danger-700 flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">
              لا تملك الصلاحية
            </h2>
            <p className="text-sm text-neutral-600 mb-6">
              هذه الصفحة مخصّصة لـ: {requiredRoles.join(', ')}.
              دورك الحالي: <strong>{userRole || 'غير معروف'}</strong>.
            </p>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-4 py-2 rounded-md bg-primary-800 text-white text-sm font-medium hover:bg-primary-900 transition-colors"
            >
              العودة للصفحة السابقة
            </button>
          </div>
        </div>
      );
    }
  }

  // ─── 4. ✅ الحل: دعم كلا الوضعين ───
  // إذا مُرِّر children (Wrapper) → ارجعه
  // إذا لم يُمرَّر (Layout Route) → استخدم <Outlet />
  return children || <Outlet />;
}

// ═══════════════════════════════════════════════
// 2. حرس المسار العام (PublicRoute)
// ═══════════════════════════════════════════════
export function PublicRoute({ children, redirectTo = '/' }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return children || <Outlet />;
}

// ═══════════════════════════════════════════════
// 3. تصدير موحّد
// ═══════════════════════════════════════════════
export default ProtectedRoute;