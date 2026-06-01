/** Papel de sessão JWT / BWA: líder de célula (visão consolidada da sub-equipe). */
export const LIDER_CELULA_ROLE = 'LIDER_CELULA';

function normalizeRoleToken(role: string): string {
  return role.trim().toUpperCase().replace(/-/g, '_');
}

function matchesLiderCelulaToken(token: string): boolean {
  return token === LIDER_CELULA_ROLE || token.includes(LIDER_CELULA_ROLE);
}

/**
 * Indica se o utilizador tem o papel `LIDER_CELULA` (ou variante `LIDER-CELULA`).
 * Aceita tokens com prefixo (ex.: role JWT composto).
 */
export function hasLiderCelulaRole(roles: string[] | undefined | null): boolean {
  if (!roles?.length) {
    return false;
  }
  return roles
    .filter((r): r is string => !!r && typeof r === 'string')
    .map(normalizeRoleToken)
    .some(matchesLiderCelulaToken);
}
