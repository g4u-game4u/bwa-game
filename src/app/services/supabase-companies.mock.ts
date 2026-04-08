import { SupabaseCompanyRow, CompanyResponsavel } from '@model/supabase-company.model';

const R1: CompanyResponsavel[] = [
  { nome: 'Maria Larissa', email: 'maria.larissa@bwa.global', departamento: 'Admissão' },
  { nome: 'Douglas Elisio', email: 'douglas.elisio@bwa.global', departamento: 'Contábil' },
  { nome: 'Demo User', email: 'demo@bwa.global', departamento: 'QA' }
];

const R2: CompanyResponsavel[] = [
  { nome: 'Gestor Alpha', email: 'gestor.alpha@bwa.global', departamento: 'Gestão' },
  { nome: 'Colaborador Beta', email: 'colaborador.beta@bwa.global', departamento: 'Fiscal' }
];

const R3: CompanyResponsavel[] = [
  { nome: 'Supervisor Gamma', email: 'supervisor.gamma@bwa.global', departamento: 'Supervisão Fiscal' }
];

/**
 * Temporary mock — same shape as Supabase `companies`.
 * When `environment.supabaseMockFeedAllUsers` is true, every user sees all rows (dev UX).
 * Otherwise rows are filtered by `responsaveis[].email`.
 */
export const SUPABASE_COMPANIES_MOCK: SupabaseCompanyRow[] = [
  {
    id: 254,
    cnpj: '58.236.109/0001-02',
    razao_social: 'LSMK INVESTIMENTOS E PARTICIPACOES LTDA',
    fantasia: 'LSMK INVESTIMENTOS',
    status: 'Ativa',
    client_type_id: null,
    synced_at: '2026-04-08T11:03:52.898Z',
    created_at: '2026-03-09T18:36:28.058Z',
    responsaveis: R1
  },
  {
    id: 255,
    cnpj: '12.345.678/0001-90',
    razao_social: 'EMPRESA MOCK DOIS LTDA',
    fantasia: 'Mock Dois',
    status: 'Ativa',
    client_type_id: 1,
    synced_at: '2026-04-08T11:03:52.898Z',
    created_at: '2026-03-10T10:00:00.000Z',
    responsaveis: R2
  },
  {
    id: 256,
    cnpj: '98.765.432/0001-10',
    razao_social: 'EMPRESA MOCK TRÊS LTDA',
    fantasia: 'Mock Três',
    status: 'Inativa',
    client_type_id: null,
    synced_at: '2026-04-08T11:03:52.898Z',
    created_at: '2026-03-11T14:30:00.000Z',
    responsaveis: R3
  },
  {
    id: 257,
    cnpj: '11.222.333/0001-44',
    razao_social: 'EMPRESA COMPARTILHADA LTDA',
    fantasia: 'Compartilhada',
    status: 'Ativa',
    client_type_id: null,
    synced_at: '2026-04-08T11:03:52.898Z',
    created_at: '2026-03-12T09:15:00.000Z',
    responsaveis: [
      { nome: 'Gestor Alpha', email: 'gestor.alpha@bwa.global', departamento: 'Gestão' },
      { nome: 'Maria Larissa', email: 'maria.larissa@bwa.global', departamento: 'Admissão' }
    ]
  }
];
