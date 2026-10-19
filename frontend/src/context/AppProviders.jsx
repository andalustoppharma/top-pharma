/**
 * @file AppProviders.jsx
 * @description تجميع كل Providers التطبيق في شجرة واحدة.
 *
 * لماذا هذا الملف؟
 * - نقطة واحدة لتغليف التطبيق بكل الـ Contexts.
 * - يضمن الترتيب الصحيح للـ Providers (التبعيات).
 * - يسهّل إضافة Contexts جديدة مستقبلاً (Phase 3: CashProvider, ChecksProvider...).
 *
 * ترتيب الـ Providers:
 * 1. ToastProvider (لا يعتمد على شيء — يجب أن يكون أولاً لإتاحة الإشعارات).
 * 2. AuthProvider (يعتمد على Toast).
 * 3. Core Providers (Categories, Warehouses, Items, Suppliers).
 * 4. CustomersProvider (يعتمد على Auth + Suppliers).
 * 5. StockProvider (يعتمد على Items + Warehouses).
 * 6. Phase 2 Providers (Invoices, DeliveryNotes, CustomerReturns) — تعتمد على Stock + Customers.
 */

import { AuthProvider } from './AuthContext.jsx';
import { CategoriesProvider } from './CategoriesContext.jsx';
import { CustomersProvider } from './CustomersContext.jsx';
import { ItemsProvider } from './ItemsContext.jsx';
import { StockProvider } from './StockContext.jsx';
import { SuppliersProvider } from './SuppliersContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { WarehousesProvider } from './WarehousesContext.jsx';

// Phase 2 Providers
import { InvoicesProvider } from './InvoicesContext.jsx';
import { DeliveryNotesProvider } from './DeliveryNotesContext.jsx';
import { CustomerReturnsProvider } from './CustomerReturnsContext.jsx';

/**
 * شجرة الـ Providers الكاملة.
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @returns {JSX.Element}
 */
export function AppProviders({ children }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <CategoriesProvider>
          <WarehousesProvider>
            <ItemsProvider>
              <SuppliersProvider>
                <CustomersProvider>
                  <StockProvider>
                    {/* ── Phase 2 Providers ── */}
                    <InvoicesProvider>
                      <DeliveryNotesProvider>
                        <CustomerReturnsProvider>
                          {children}
                        </CustomerReturnsProvider>
                      </DeliveryNotesProvider>
                    </InvoicesProvider>
                  </StockProvider>
                </CustomersProvider>
              </SuppliersProvider>
            </ItemsProvider>
          </WarehousesProvider>
        </CategoriesProvider>
      </AuthProvider>
    </ToastProvider>
  );
}