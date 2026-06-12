export interface CompanyOption {
  id: string;
  code?: number;
  name?: string;
}

export function companyLabel(company?: CompanyOption | null) {
  if (!company) {
    return "-";
  }

  const code = Number(company.code);
  const formattedCode = Number.isFinite(code) && code > 0 ? `EMP-${String(code).padStart(3, "0")}` : "EMP";
  return `${formattedCode} - ${company.name ?? "Empresa sem nome"}`;
}

export function toCompanyOptions(companies: CompanyOption[]) {
  return companies.map((company) => ({
    value: company.id,
    label: companyLabel(company)
  }));
}
