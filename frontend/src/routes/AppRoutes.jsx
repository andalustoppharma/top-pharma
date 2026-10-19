/**
 * @file AppRoutes.jsx
 * @description
 * تعريف مسارات التطبيق — Phase 2.5.
 *
 * ⚠️ التسميات: متوافقة مع الملفات الموجودة في المشروع
 *    (بدون لاحقة "Page" — مثل Login.jsx، Dashboard.jsx، إلخ)
 *
 * لماذا هذا الملف؟
 * - نقطة واحدة لتعريف كل مسارات التطبيق.
 * - يطبق الحماية (ProtectedRoute) على المسارات المحمية.
 * - يطبق PublicRoute على /login، /forgot-password، /reset-password.
 * - يستخدم التحميل الكسول (Lazy Loading).
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from '../components/Layout/Layout.jsx';
import Loading from '../components/UI/Loading.jsx';
import ProtectedRoute, { PublicRoute } from './ProtectedRoute.jsx';

// ═══════════════════════════════════════════════
// 1. التحميل الكسول — تسميات المستخدم (بدون Page)
// ═══════════════════════════════════════════════

// Auth
const Login = lazy(() => import('../pages/Login.jsx'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('../pages/ResetPassword.jsx'));
const NotFound = lazy(() => import('../pages/NotFound.jsx'));

// Dashboard
const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));

// Inventory (Phase 1)
const Inventory = lazy(() => import('../pages/Inventory.jsx'));
const Categories = lazy(() => import('../pages/Categories.jsx'));
const Warehouses = lazy(() => import('../pages/Warehouses.jsx'));
const Items = lazy(() => import('../pages/Items.jsx'));
const Suppliers = lazy(() => import('../pages/Suppliers.jsx'));
const Customers = lazy(() => import('../pages/Customers.jsx'));
const Stock = lazy(() => import('../pages/Stock.jsx'));

// Sales (Phase 2)
const Sales = lazy(() => import('../pages/Sales.jsx'));
const Invoices = lazy(() => import('../pages/Invoices.jsx'));
const InvoiceDetail = lazy(() => import('../pages/InvoiceDetail.jsx'));
const DeliveryNotes = lazy(() => import('../pages/DeliveryNotes.jsx'));
const CustomerReturns = lazy(() => import('../pages/CustomerReturns.jsx'));
const PurchaseReceipts = lazy(() => import('../pages/PurchaseReceipts.jsx'));
const SupplierReturns = lazy(() => import('../pages/SupplierReturns.jsx'));

// ═══════════════════════════════════════════════
// 2. غلاف التحميل
// ═══════════════════════════════════════════════

const SuspenseFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-neutral-50">
    <Loading size="lg" text="جاري تحميل الصفحة..." />
  </div>
);

// ═══════════════════════════════════════════════
// 3. المسارات
// ═══════════════════════════════════════════════

function AppRoutes() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <Routes>
        {/* ─── مسارات عامة (PublicRoute) ─── */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <PublicRoute>
              <ResetPassword />
            </PublicRoute>
          }
        />

        {/* ─── مسارات محمية (ProtectedRoute) ─── */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* لوحة التحكم */}
          <Route index element={<Dashboard />} />

          {/* ─── Phase 1: المخزون ─── */}
          <Route path="inventory" element={<Inventory />} />
          <Route path="inventory/categories" element={<Categories />} />
          <Route path="inventory/warehouses" element={<Warehouses />} />
          <Route path="inventory/items" element={<Items />} />
          <Route path="inventory/suppliers" element={<Suppliers />} />
          <Route path="inventory/customers" element={<Customers />} />
          <Route path="inventory/stock" element={<Stock />} />

          {/* ─── Phase 2: المبيعات ─── */}
          <Route path="sales" element={<Sales />} />
          <Route path="sales/invoices" element={<Invoices />} />
          <Route path="sales/invoices/:id" element={<InvoiceDetail />} />
          <Route path="sales/delivery-notes" element={<DeliveryNotes />} />
          <Route path="sales/customer-returns" element={<CustomerReturns />} />
          <Route path="sales/purchase-receipts" element={<PurchaseReceipts />} />
          <Route path="sales/supplier-returns" element={<SupplierReturns />} />
        </Route>

        {/* ─── مسارات غير موجودة ─── */}
        <Route path="/not-found" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/not-found" replace />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;