/**
 * AppProviders.jsx
 *
 * تجميع كل الـ Providers في مكان واحد.
 * الترتيب مهم: من الخارج للداخل.
 */

import { ToastProvider } from './ToastContext.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { CategoriesProvider } from './CategoriesContext.jsx';
import { WarehousesProvider } from './WarehousesContext.jsx';
import { ItemsProvider } from './ItemsContext.jsx';
import { SuppliersProvider } from './SuppliersContext.jsx';
import { CustomersProvider } from './CustomersContext.jsx';
import { StockProvider } from './StockContext.jsx';
import { InvoicesProvider } from './InvoicesContext.jsx';
import { DeliveryNotesProvider } from './DeliveryNotesContext.jsx';
import { CustomerReturnsProvider } from './CustomerReturnsContext.jsx';
// ─── Phase 3 ───
import { CashFundsProvider } from './CashFundsContext.jsx';
import { BankAccountsProvider } from './BankAccountsContext.jsx';
import { ChecksProvider } from './ChecksContext.jsx';

export const AppProviders = ({ children }) => {
  return (
    <ToastProvider>
      <AuthProvider>
        <CategoriesProvider>
          <WarehousesProvider>
            <ItemsProvider>
              <SuppliersProvider>
                <CustomersProvider>
                  <StockProvider>
                    <InvoicesProvider>
                      <DeliveryNotesProvider>
                        <CustomerReturnsProvider>
                          {/* ── Phase 3 Providers ── */}
                          <CashFundsProvider>
                            <BankAccountsProvider>
                              <ChecksProvider>
                                {children}
                              </ChecksProvider>
                            </BankAccountsProvider>
                          </CashFundsProvider>
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
};

export default AppProviders;