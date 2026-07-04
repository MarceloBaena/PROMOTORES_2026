export interface CompanyOption {
  id: string;
  code?: number;
  name?: string;
  status?: string | null;
}

export function companyLabel(company?: CompanyOption | null) {
  if (!company) {
    return "-";
  }

  const code = Number(company.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `EMP-${String(code).padStart(3, "0")}` : "EMP";
  return `${formattedCode} - ${company.name ?? "Empresa sem nome"}`;
}

export function activeCompaniesOnly(companies: CompanyOption[]) {
  return companies.filter((company) => String(company.status ?? "ACTIVE") === "ACTIVE");
}

export function toCompanyOptions(companies: CompanyOption[], onlyActive = true) {
  const source = onlyActive ? activeCompaniesOnly(companies) : companies;

  return source.map((company) => ({
    value: company.id,
    label: companyLabel(company)
  }));
}
