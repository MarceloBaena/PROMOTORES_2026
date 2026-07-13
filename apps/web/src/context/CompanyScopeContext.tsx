import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { apiJson } from "../lib/api";
import { activeCompaniesOnly, companyLabel, type CompanyOption } from "../lib/company-options";
import {
  clearStoredCompanyScopeId,
  getStoredCompanyScopeId,
  isGlobalAdminUser,
  saveStoredCompanyScopeId
} from "../lib/company-scope";

interface CompanyScopeContextValue {
  initialized: boolean;
  isGlobalAdmin: boolean;
  companies: CompanyOption[];
  selectedCompanyId: string;
  selectedCompany: CompanyOption | null;
  companyScopeLabel: string;
  scopeKey: string;
  setSelectedCompanyId: (companyId: string) => void;
}

const CompanyScopeContext = createContext<CompanyScopeContextValue | null>(null);

export function CompanyScopeProvider({ children }: { children: ReactNode }) {
  const { user, initialized: authInitialized } = useAuth();
  const isGlobalAdmin = isGlobalAdminUser(user);
  const [initialized, setInitialized] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState("");

  useEffect(() => {
    if (!authInitialized) {
      return;
    }

    if (!user) {
      clearStoredCompanyScopeId();
      setCompanies([]);
      setSelectedCompanyIdState("");
      setInitialized(true);
      return;
    }

    if (!isGlobalAdmin) {
      const scopedCompany = user.company
        ? [{ id: user.company.id, code: user.company.code, name: user.company.name, status: "ACTIVE" }]
        : [];

      clearStoredCompanyScopeId();
      setCompanies(scopedCompany);
      setSelectedCompanyIdState(user.companyId ?? "");
      setInitialized(true);
      return;
    }

    setInitialized(false);

    apiJson<{ data: CompanyOption[] }>("/companies")
      .then((response) => {
        const activeCompanies = activeCompaniesOnly(response.data);
        const storedCompanyId = getStoredCompanyScopeId();
        const nextCompanyId = storedCompanyId && activeCompanies.some((company) => company.id === storedCompanyId)
          ? storedCompanyId
          : "";

        if (storedCompanyId && !nextCompanyId) {
          clearStoredCompanyScopeId();
        }

        setCompanies(activeCompanies);
        setSelectedCompanyIdState(nextCompanyId);
      })
      .finally(() => setInitialized(true));
  }, [authInitialized, isGlobalAdmin, user]);

  const value = useMemo<CompanyScopeContextValue>(() => {
    const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
    const companyScopeLabel = isGlobalAdmin
      ? (selectedCompany ? companyLabel(selectedCompany) : "Todas as empresas")
      : user?.company
        ? companyLabel(user.company)
        : "Empresa nao vinculada";

    return {
      initialized,
      isGlobalAdmin,
      companies,
      selectedCompanyId,
      selectedCompany,
      companyScopeLabel,
      scopeKey: isGlobalAdmin ? (selectedCompanyId || "__all__") : (user?.companyId ?? "__company__"),
      setSelectedCompanyId: (companyId: string) => {
        setSelectedCompanyIdState(companyId);
        saveStoredCompanyScopeId(companyId);
      }
    };
  }, [companies, initialized, isGlobalAdmin, selectedCompanyId, user]);

  return <CompanyScopeContext.Provider value={value}>{children}</CompanyScopeContext.Provider>;
}

export function useCompanyScope() {
  const context = useContext(CompanyScopeContext);

  if (!context) {
    throw new Error("useCompanyScope must be used inside CompanyScopeProvider.");
  }

  return context;
}
