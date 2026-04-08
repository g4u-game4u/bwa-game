/**
 * Mirrors public.companies in Supabase (see companies_rows.json sample).
 */
export interface CompanyResponsavel {
  nome: string;
  email: string;
  departamento: string;
}

export interface SupabaseCompanyRow {
  id: number;
  cnpj: string;
  /** Opcional: ID Funifier / EmpID na API de gamificação quando o CNPJ não bate com o hook. */
  emp_id?: string | null;
  razao_social: string;
  fantasia: string;
  status: string;
  client_type_id: number | null;
  synced_at: string;
  created_at: string;
  /** JSON string in some exports; jsonb/array when read from Supabase */
  responsaveis: string | CompanyResponsavel[] | null;
}
