/**
 * @file Sidebar.jsx
 * @description
 * القائمة الجانبية للتطبيق (Navigation Sidebar).
 *
 * لماذا هذا الملف؟
 * - تُوفّر التنقل بين أقسام التطبيق (Dashboard, Inventory, Sales).
 * - تطبق الصلاحيات (RBAC): كل دور يرى ما يخصه فقط.
 * - تدعم التوسيع/الطي (Collapsible groups) لتوفير المساحة.
 * - تُبرز المسار النشط (Active Link) باستخدام `NavLink`.
 * - تدعم RTL بالكامل.
 */

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  Truck,
  Undo2,
  Users,
  Building2,
  Store,
  ChevronDown,
  ChevronLeft,
  Boxes,
  Tags,
  ClipboardList,
  Receipt,
  ArrowLeftRight,
} from 'lucide-react';

import { useAuth } from '../../hooks/useAuth.js';

// ═══════════════════════════════════════════════
// 1. مكونات فرعية للتنقل
// ═══════════════════════════════════════════════

/**
 * رابط تنقل بسيط.
 */
function SidebarLink({ to, icon: Icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary-800 text-white'
            : 'text-neutral-700 hover:bg-neutral-100'
        }`
      }
    >
      {Icon && <Icon size={18} className="flex-shrink-0" />}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

/**
 * مجموعة تنقل قابلة للتوسيع (مثل المخزون / المبيعات).
 */
function SidebarGroup({ title, icon: Icon, children, defaultOpen = false, isActiveGroup }) {
  const [isOpen, setIsOpen] = useState(defaultOpen || isActiveGroup);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
          isActiveGroup
            ? 'bg-primary-50 text-primary-800'
            : 'text-neutral-700 hover:bg-neutral-100'
        }`}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon size={18} className="flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        {isOpen ? (
          <ChevronDown size={16} className="flex-shrink-0" />
        ) : (
          <ChevronLeft size={16} className="flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="pr-8 space-y-1 mt-1 border-r-2 border-neutral-200 mr-6">
          {children}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// 2. المكون الرئيسي
// ═══════════════════════════════════════════════

/**
 * القائمة الجانبية الرئيسية.
 * @returns {JSX.Element}
 */
function Sidebar() {
  const { userRole, isAdmin, isStorekeeper, isAccountant, isSalesRep, isPharmacy } = useAuth();
  const location = useLocation();

  // ─────────────────────────────────────────────
  // تحديد الصلاحيات لعرض الأقسام
  // ─────────────────────────────────────────────
  
  // لوحة التحكم: للجميع
  const canViewDashboard = true;

  // المخزون: للمدير، أمين المخزن، المحاسب (وليس للمندوب أو الصيدلية)
  const canViewInventory = isAdmin || isStorekeeper || isAccountant;

  // المبيعات: للمدير، المحاسب، المندوب
  const canViewSales = isAdmin || isAccountant || isSalesRep;

  // المشتريات ومرتجعات الموردين: للمدير، أمين المخزن، المحاسب
  const canViewPurchases = isAdmin || isStorekeeper || isAccountant;

  // صيدلياتي (خاص بالمندوب): عرض فقط للصيدليات
  const canViewMyPharmacies = isSalesRep;

  // فواتيري (خاص بالصيدلية)
  const canViewMyInvoices = isPharmacy;

  return (
    <aside className="w-64 bg-white border-l border-neutral-200 h-screen flex flex-col sticky top-0">
      {/* ─── الترويسة (Logo) ─── */}
      <div className="h-16 flex items-center justify-center border-b border-neutral-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-primary-800">TOP PHARMA</h1>
      </div>

      {/* ─── القائمة (Scrollable) ─── */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
        
        {/* 1. لوحة التحكم */}
        {canViewDashboard && (
          <SidebarLink to="/" icon={LayoutDashboard} label="لوحة التحكم" end />
        )}

        {/* 2. المخزون (Phase 1) */}
        {canViewInventory && (
          <SidebarGroup
            title="المخزون"
            icon={Package}
            isActiveGroup={location.pathname.startsWith('/inventory')}
          >
            <SidebarLink to="/inventory/categories" icon={Tags} label="التصنيفات" />
            <SidebarLink to="/inventory/warehouses" icon={Building2} label="المخازن" />
            <SidebarLink to="/inventory/items" icon={Boxes} label="الأصناف" />
            <SidebarLink to="/inventory/suppliers" icon={Users} label="الموردون" />
            <SidebarLink to="/inventory/customers" icon={Store} label="الصيدليات" />
            <SidebarLink to="/inventory/stock" icon={ClipboardList} label="المخزون" />
          </SidebarGroup>
        )}

        {/* 3. المبيعات (Phase 2) */}
        {canViewSales && (
          <SidebarGroup
            title="المبيعات"
            icon={ShoppingCart}
            isActiveGroup={location.pathname.startsWith('/sales') && !location.pathname.includes('purchase') && !location.pathname.includes('supplier-returns')}
          >
            <SidebarLink to="/sales/invoices" icon={FileText} label="الفواتير" />
            <SidebarLink to="/sales/delivery-notes" icon={Truck} label="إيصالات التسليم" />
            <SidebarLink to="/sales/customer-returns" icon={Undo2} label="مرتجعات العملاء" />
          </SidebarGroup>
        )}

        {/* 4. المشتريات ومرتجعات الموردين */}
        {canViewPurchases && (
          <SidebarGroup
            title="المشتريات"
            icon={Receipt}
            isActiveGroup={location.pathname.includes('purchase-receipts') || location.pathname.includes('supplier-returns')}
          >
            <SidebarLink to="/sales/purchase-receipts" icon={Receipt} label="إيصالات الاستلام" />
            <SidebarLink to="/sales/supplier-returns" icon={ArrowLeftRight} label="مرتجعات الموردين" />
          </SidebarGroup>
        )}

        {/* 5. صيدلياتي (خاص بالمندوب) */}
        {canViewMyPharmacies && (
          <SidebarLink to="/inventory/customers" icon={Store} label="صيدلياتي" />
        )}

        {/* 6. فواتيري (خاص بالصيدلية) */}
        {canViewMyInvoices && (
          <SidebarLink to="/sales/invoices" icon={FileText} label="فواتيري" />
        )}
      </nav>

      {/* ─── الفوتر (بيانات المستخدم) ─── */}
      <div className="p-4 border-t border-neutral-200 flex-shrink-0 text-sm text-neutral-600">
        <p className="font-bold text-neutral-900">{userRole === 'sales_rep' ? 'المندوب' : userRole === 'pharmacy' ? 'الصيدلية' : 'المستخدم'}</p>
        <p className="text-xs mt-1">نظام Pharma</p>
      </div>
    </aside>
  );
}

export default Sidebar;