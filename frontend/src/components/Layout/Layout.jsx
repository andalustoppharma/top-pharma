/**
 * @file Layout.jsx
 * @description
 * الغلاف الرئيسي للتطبيق (Shell) — يربط Sidebar + Header + Outlet.
 *
 * لماذا هذا الملف؟
 * - يوفر تخطيطاً موحّداً لكل الصفحات المحمية (Dashboard, Inventory, Sales).
 * - يدعم RTL بالكامل (Sidebar على اليمين).
 * - يدعم الأجهزة الصغيرة (drawer + overlay).
 * - يحتوي على Header يعرض بيانات المستخدم وإجراءات الحساب.
 * - يُغلِف كل الصفحات بـ Outlet (React Router).
 * - يحتوي على ToastContainer (عام — يمكن نقله إلى App.jsx لاحقاً).
 */

import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  LogOut,
  User,
  Bell,
  X,
} from 'lucide-react';

import Sidebar from './Sidebar.jsx';
import Button from '../UI/Button.jsx';
import ToastContainer from '../UI/ToastContainer.jsx';
import Loading from '../UI/Loading.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';

// ═══════════════════════════════════════════════
// 1. Header (الترويسة العلوية)
// ═══════════════════════════════════════════════

/**
 * ترويسة التطبيق العلوية.
 *
 * @param {Object} props
 * @param {Function} props.onMenuClick - يفتح Sidebar على mobile.
 * @returns {JSX.Element}
 */
function Header({ onMenuClick }) {
  const { user, userName, userRoleAr, logout } = useAuth();
  const { isAdmin, isAccountant } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    if (!isUserMenuOpen) return undefined;
    const handleClick = () => setIsUserMenuOpen(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isUserMenuOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      toast.success('تم تسجيل الخروج.');
      navigate('/login', { replace: true });
    } catch {
      toast.error('فشل تسجيل الخروج.');
      setIsLoggingOut(false);
    }
  };

  // الأحرف الأولى من الاسم (Avatar)
  const initials = userName
    ? userName
        .split(' ')
        .map((w) => w.charAt(0))
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '؟';

  return (
    <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0 sticky top-0 z-20">
      {/* ─── اليسار: زر القائمة ─── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="فتح القائمة"
        >
          <Menu size={20} />
        </button>
        <div className="hidden sm:block">
          <p className="text-xs text-neutral-500">مرحباً بك في</p>
          <p className="text-sm font-bold text-neutral-900">نظام Pharma</p>
        </div>
      </div>

      {/* ─── اليمين: الإجراءات ─── */}
      <div className="flex items-center gap-2">
        {/* الإشعارات (placeholder) */}
        <button
          type="button"
          className="p-2 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors relative"
          aria-label="الإشعارات"
          title="الإشعارات (Phase 5)"
          disabled
        >
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full opacity-0" />
        </button>

        {/* قائمة المستخدم */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsUserMenuOpen((prev) => !prev);
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-800 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-neutral-900 leading-tight">
                {userName || user?.email || 'مستخدم'}
              </p>
              <p className="text-xs text-neutral-500 leading-tight">
                {userRoleAr || user?.role}
              </p>
            </div>
          </button>

          {isUserMenuOpen && (
            <div
              className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-30"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-2 border-b border-neutral-100">
                <p className="text-sm font-bold text-neutral-900 truncate">
                  {userName || '—'}
                </p>
                <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
                <p className="text-xs text-primary-700 mt-1 font-medium">
                  {userRoleAr}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  navigate('/settings');
                }}
                className="w-full text-right px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
              >
                <User size={16} />
                حسابي
              </button>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full text-right px-4 py-2 text-sm text-danger-700 hover:bg-danger-50 flex items-center gap-2 disabled:opacity-50"
              >
                <LogOut size={16} />
                {isLoggingOut ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════
// 2. Layout (الغلاف الرئيسي)
// ═══════════════════════════════════════════════

/**
 * الغلاف الرئيسي.
 * @returns {JSX.Element}
 */
function Layout() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();

  // إغلاق drawer عند تغيير المسار
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // منع تمرير الخلفية عند فتح drawer على mobile
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [isMobileOpen]);

  return (
    <div className="min-h-screen bg-neutral-50 flex" dir="rtl">
      {/* ─── Overlay (mobile فقط) ─── */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ─── Sidebar (drawer على mobile، ثابت على desktop) ─── */}
      <aside
        className={`
          fixed top-0 right-0 z-40 h-screen w-64
          transition-transform duration-300 ease-in-out
          lg:static lg:translate-x-0 lg:z-0
          ${isMobileOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        aria-label="القائمة الجانبية"
      >
        {/* زر إغلاق (mobile فقط) */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden absolute top-3 left-3 p-1.5 rounded-md bg-white shadow-md text-neutral-700 hover:bg-neutral-100 z-50"
          aria-label="إغلاق القائمة"
        >
          <X size={18} />
        </button>
        <Sidebar />
      </aside>

      {/* ─── المحتوى الرئيسي ─── */}
      <div className="flex-1 flex flex-col min-w-0 lg:h-screen lg:overflow-hidden">
        <Header onMenuClick={() => setIsMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ─── الإشعارات (Toast) ─── */}
      <ToastContainer />
    </div>
  );
}

export default Layout;