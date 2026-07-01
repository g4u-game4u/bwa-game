import type { OrgHierarchyNodeType } from '@model/game4u-api.model';

/** Papéis que usam `GET /game/reports/management/dashboard/cached/*` (ver manager-dashboard-cached-frontend.md). */
export type ManagementDashboardCachedRole = 'GERENTE' | 'DIRETOR' | 'C_LEVEL';

/** Prioridade decrescente: C_LEVEL > DIRETOR > GERENTE. */
export const MANAGEMENT_DASHBOARD_CACHED_ROLES: readonly ManagementDashboardCachedRole[] = [
  'C_LEVEL',
  'DIRETOR',
  'GERENTE'
];

/** Id sintético do seletor / `team_id` na API para o painel agregado de gestão. */
export const MANAGEMENT_OVERVIEW_TEAM_ID = '__management_overview__';

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

/** Substantivo para o seletor de gestor (ADMIN): «Gerente», «Diretor», «C-Level». */
export function getManagementPreviewRoleNounLabel(
  role: ManagementDashboardCachedRole | null | undefined
): string {
  if (role === 'GERENTE') {
    return 'Gerente';
  }
  if (role === 'DIRETOR') {
    return 'Diretor';
  }
  if (role === 'C_LEVEL') {
    return 'C-Level';
  }
  return 'Gestor';
}

function isManagementDashboardCachedRole(
  value: string
): value is ManagementDashboardCachedRole {
  return (MANAGEMENT_DASHBOARD_CACHED_ROLES as readonly string[]).includes(value);
}

/** Id do seletor para ADMIN pré-visualizar um painel de gestão (`__management_overview__:GERENTE`, etc.). */
export function buildManagementOverviewTeamId(role: ManagementDashboardCachedRole): string {
  return `${MANAGEMENT_OVERVIEW_TEAM_ID}:${role}`;
}

/** Indica entrada sintética do «Painel do Gerente / Diretor / C-Level» no seletor de times. */
export function isManagementOverviewTeamId(teamId: string | null | undefined): boolean {
  const t = (teamId ?? '').trim();
  return t === MANAGEMENT_OVERVIEW_TEAM_ID || t.startsWith(`${MANAGEMENT_OVERVIEW_TEAM_ID}:`);
}

/**
 * Extrai o papel de gestão de um id sintético do seletor.
 * Para `__management_overview__` sem sufixo, usa o JWT (gestor real).
 */
export function resolveManagementRoleFromOverviewTeamId(
  teamId: string | null | undefined,
  jwtRoles?: string[] | null
): ManagementDashboardCachedRole | null {
  const t = (teamId ?? '').trim();
  if (t.startsWith(`${MANAGEMENT_OVERVIEW_TEAM_ID}:`)) {
    const role = t.slice(MANAGEMENT_OVERVIEW_TEAM_ID.length + 1);
    return isManagementDashboardCachedRole(role) ? role : null;
  }
  if (t === MANAGEMENT_OVERVIEW_TEAM_ID) {
    return detectManagementDashboardCachedRole(jwtRoles);
  }
  return null;
}

/** `team_id` enviado à API Game4U (sempre `__management_overview__`; o papel vai em `role` quando ADMIN). */
export function toManagementOverviewApiTeamId(teamId: string | null | undefined): string {
  return isManagementOverviewTeamId(teamId) ? MANAGEMENT_OVERVIEW_TEAM_ID : (teamId ?? '').trim();
}

/** Compara `user_role` da API com o papel do painel (tolera `C-LEVEL`, prefixos, etc.). */
export function managerMatchesDashboardCachedRole(
  managerRole: unknown,
  expected: ManagementDashboardCachedRole
): boolean {
  const token = normalizeManagementRoleToken(String(managerRole ?? ''));
  if (!token) {
    return false;
  }
  return matchesRole(token, expected);
}

/** `user_id` preferencial; fallback para e-mail quando a API só devolve `user_email`. */
export function parseManagementManagerUserId(manager: unknown): string {
  if (manager == null || typeof manager !== 'object') {
    return '';
  }
  const record = manager as Record<string, unknown>;
  const userId = String(record['user_id'] ?? record['userId'] ?? '').trim();
  if (userId) {
    return userId;
  }
  return String(record['user_email'] ?? record['userEmail'] ?? '').trim();
}

/** Nível do relatório organizacional correspondente ao painel de gestão. */
export function managementRoleToOrgHierarchyNodeType(
  role: ManagementDashboardCachedRole | null | undefined
): Extract<OrgHierarchyNodeType, 'gerencia' | 'diretoria' | 'c_level'> | null {
  if (role === 'GERENTE') {
    return 'gerencia';
  }
  if (role === 'DIRETOR') {
    return 'diretoria';
  }
  if (role === 'C_LEVEL') {
    return 'c_level';
  }
  return null;
}

/** Extrai o identificador do gestor de `node_id` (`email` ou `{area}|{user_id}`). */
export function extractOrgHierarchyNodeUserId(nodeId: string | null | undefined): string {
  const raw = (nodeId ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.includes('|')) {
    return raw.split('|').pop()!.trim();
  }
  return raw;
}
