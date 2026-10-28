/**
 * @file Sidebar.jsx
 * @description
 * القائمة الجانبية للتطبيق — Phase 4 (التقارير الكاملة).
 */

import { useState, useContext } from 'react';
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
  Wallet,
  Coins,
  Landmark,
  FileCheck,
  ScrollText,
  BarChart3,
  TrendingUp,
} from 'lucide-react';

import { useAuth } from '../../hooks/useAuth.js';
import ChecksContext from '../../context/ChecksContext.jsx';

// ═══════════════════════════════════════════════
// مكونات فرعية
// ═══════════════════════════════════════════════

function SidebarLink({ to, icon: Icon, label, end = false, badge = 0 }) {
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
      <span className="truncate flex-1">{label}</span>
      {badge > 0 && (
        <span className="bg-danger-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

function SidebarGroup({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  isActiveGroup,
}) {
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
// المكون الرئيسي
// ═══════════════════════════════════════════════

function Sidebar() {
  const {
    userRole,
    isAdmin,
    isStorekeeper,
    isAccountant,
    isSalesRep,
    isPharmacy,
  } = useAuth();
  const location = useLocation();

  const checksCtx = useContext(ChecksContext);
  const pendingChecksCount = checksCtx
    ? (checksCtx.overdue?.length || 0) + (checksCtx.upcoming?.length || 0)
    : 0;

  const canViewDashboard = true;
  const canViewInventory = isAdmin || isStorekeeper || isAccountant;
  const canViewSales = isAdmin || isAccountant || isSalesRep;
  const canViewPurchases = isAdmin || isStorekeeper || isAccountant;
  const canViewFinance = isAdmin || isAccountant;
  const canViewReports = isAdmin || isAccountant;
  const canViewMyPharmacies = isSalesRep;
  const canViewMyInvoices = isPharmacy;

  return (
    <aside className="w-64 bg-white border-l border-neutral-200 h-screen flex flex-col sticky top-0">
      <div className="h-16 flex items-center justify-center border-b border-neutral-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-primary-800">TOP PHARMA</h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
        {canViewDashboard && (
          <SidebarLink to="/" icon={LayoutDashboard} label="لوحة التحكم" end />
        )}

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

        {canViewSales && (
          <SidebarGroup
            title="المبيعات"
            icon={ShoppingCart}
            isActiveGroup={
              location.pathname.startsWith('/sales') &&
              !location.pathname.includes('purchase') &&
              !location.pathname.includes('supplier-returns')
            }
          >
            <SidebarLink to="/sales/invoices" icon={FileText} label="الفواتير" />
            <SidebarLink to="/sales/delivery-notes" icon={Truck} label="إيصالات التسليم" />
            <SidebarLink to="/sales/customer-returns" icon={Undo2} label="مرتجعات العملاء" />
          </SidebarGroup>
        )}

        {canViewPurchases && (
          <SidebarGroup
            title="المشتريات"
            icon={Receipt}
            isActiveGroup={
              location.pathname.includes('purchase-receipts') ||
              location.pathname.includes('supplier-returns')
            }
          >
            <SidebarLink to="/sales/purchase-receipts" icon={Receipt} label="إيصالات الاستلام" />
            <SidebarLink to="/sales/supplier-returns" icon={ArrowLeftRight} label="مرتجعات الموردين" />
          </SidebarGroup>
        )}

        {canViewFinance && (
          <SidebarGroup
            title="المالية"
            icon={Wallet}
            isActiveGroup={location.pathname.startsWith('/finance')}
          >
            <SidebarLink to="/finance" icon={Wallet} label="نظرة عامة" end />
            <SidebarLink to="/finance/cash-funds" icon={Coins} label="الصناديق النقدية" />
            <SidebarLink to="/finance/bank-accounts" icon={Landmark} label="الحساب البنكي" />
            <SidebarLink
              to="/finance/checks"
              icon={FileCheck}
              label="الشيكات"
              badge={pendingChecksCount}
            />
            <SidebarLink to="/finance/cash-transactions" icon={Receipt} label="الحركات النقدية" />
            <SidebarLink to="/finance/accounting-entries" icon={ScrollText} label="القيود المحاسبية" />
          </SidebarGroup>
        )}

        {canViewReports && (
          <SidebarGroup
            title="التقارير"
            icon={BarChart3}
            isActiveGroup={location.pathname.startsWith('/reports')}
          >
            <SidebarLink to="/reports" icon={BarChart3} label="مركز التقارير" end />
            <SidebarLink to="/reports/finance" icon={Wallet} label="التقارير المالية" />
            <SidebarLink to="/reports/sales" icon={TrendingUp} label="تقارير المبيعات" />
            <SidebarLink to="/reports/customers" icon={Users} label="تقارير العملاء" />
            <SidebarLink to="/reports/suppliers" icon={Truck} label="تقارير الموردين" />
            <SidebarLink to="/reports/inventory" icon={Package} label="تقارير المخزون" />
          </SidebarGroup>
        )}

        {canViewMyPharmacies && (
          <SidebarLink to="/inventory/customers" icon={Store} label="صيدلياتي" />
        )}

        {canViewMyInvoices && (
          <SidebarLink to="/sales/invoices" icon={FileText} label="فواتيري" />
        )}
      </nav>

      <div className="p-4 border-t border-neutral-200 flex-shrink-0 text-sm text-neutral-600">
        <p className="font-bold text-neutral-900">
          {userRole === 'sales_rep'
            ? 'المندوب'
            : userRole === 'pharmacy'
              ? 'الصيدلية'
              : userRole === 'accountant'
                ? 'المحاسب'
                : userRole === 'storekeeper'
                  ? 'أمين المخزن'
                  : userRole === 'admin'
                    ? 'المدير'
                    : 'المستخدم'}
        </p>
        <p className="text-xs mt-1">نظام Pharma</p>
      </div>
    </aside>
  );
}

export default Sidebar;