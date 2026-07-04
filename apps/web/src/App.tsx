import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { PromotersPage, SupervisorsPage } from "./pages/PeoplePages";
import { CompaniesPage } from "./pages/CompaniesPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientActivitiesPage } from "./pages/ClientActivitiesPage";
import { ProductCategoriesPage } from "./pages/ProductCategoriesPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { ClientImportPage } from "./pages/ClientImportPage";
import { RoutingPage } from "./pages/RoutingPage";
import { VisitsPage } from "./pages/VisitsPage";
import { LiveMapPage } from "./pages/LiveMapPage";
import { AuditPage } from "./pages/AuditPage";
import { ReportsPage } from "./pages/ReportsPage";

function ProtectedApp() {
  const { user, initialized } = useAuth();

  if (!initialized) {
    return <div className="grid min-h-screen place-items-center bg-field text-sm font-semibold text-stone-600">Carregando...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/empresas" element={<CompaniesPage />} />
        <Route path="/atividades" element={<ClientActivitiesPage />} />
        <Route path="/categorias-produtos" element={<ProductCategoriesPage />} />
        <Route path="/promotores" element={<PromotersPage />} />
        <Route path="/supervisores" element={<SupervisorsPage />} />
        <Route path="/clientes" element={<ClientsPage />} />
        <Route path="/fornecedores" element={<SuppliersPage />} />
        <Route path="/importacao" element={<ClientImportPage />} />
        <Route path="/roteirizacao" element={<RoutingPage />} />
        <Route path="/visitas" element={<VisitsPage />} />
        <Route path="/mapa" element={<LiveMapPage />} />
        <Route path="/auditoria" element={<AuditPage />} />
        <Route path="/relatorios" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ProtectedApp />
      </BrowserRouter>
    </AuthProvider>
  );
}
