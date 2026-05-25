/** Papéis que usam `GET /game/reports/management/dashboard/cached/*` (ver manager-dashboard-cached-frontend.md). */
export type ManagementDashboardCachedRole = 'GERENTE' | 'DIRETOR' | 'C_LEVEL';

/** Prioridade decrescente: C_LEVEL > DIRETOR > GERENTE. */
const MANAGEMENT_DASHBOARD_CACHED_ROLES: readonly ManagementDashboardCachedRole[] = [
  'C_LEVEL',
  'DIRETOR',
  'GERENTE'
];

const MANAGEMENT_ROLE_LABELS: Record<ManagementDashboardCachedRole, string> = {
  GERENTE: 'Painel do Gerente',
  DIRETOR: 'Painel do Diretor',
  C_LEVEL: 'Painel do C-Level'
};

function normalizeManagementRoleToken(role: string): string {
  return role.trim().toUpperCase().replace(/-/g, '_');
}

function matchesRole(token: string, tier: ManagementDashboardCachedRole): boolean {
  return token === tier || token.includes(tier);
}

/**
 * Indica se o utilizador deve consumir o cache de gestão agregada (GERENTE / DIRETOR / C_LEVEL).
 * Aceita `C-LEVEL` e variantes com prefixo (ex.: role JWT completo).
 */
export function hasManagementDashboardCachedRole(roles: string[] | undefined | null): boolean {
  return detectManagementDashboardCachedRole(roles) != null;
}

/**
 * Detecta o papel de gestão mais relevante no JWT (C_LEVEL > DIRETOR > GERENTE).
 * Retorna `null` quando o utilizador não tem nenhum desses papéis.
 */
export function detectManagementDashboardCachedRole(
  roles: string[] | undefined | null
): ManagementDashboardCachedRole | null {
  if (!roles?.length) {
    return null;
  }
  const tokens = roles
    .filter((r): r is string => !!r && typeof r === 'string')
    .map(normalizeManagementRoleToken);
  for (const tier of MANAGEMENT_DASHBOARD_CACHED_ROLES) {
    if (tokens.some(t => matchesRole(t, tier))) {
      return tier;
    }
  }
  return null;
}

/** Rótulo apresentado no seletor para o «Painel do Gerente / Diretor / C-Level». */
export function getManagementDashboardCachedRoleLabel(
  role: ManagementDashboardCachedRole
): string {
  return MANAGEMENT_ROLE_LABELS[role];
}
