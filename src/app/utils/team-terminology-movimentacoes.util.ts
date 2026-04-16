import { displayNameForGame4uTeamId } from './game4u-user-id.util';

/** Id numérico Game4U do time Financeiro (alinhado ao painel de gestão). */
export const GAME4U_FINANCE_TEAM_ID = '6';

function normalizeTeamText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokensIncludeCs(normalized: string): boolean {
  return normalized.split(/[^a-z0-9]+/).filter(Boolean).includes('cs');
}

function isCsTeamLabel(normalized: string): boolean {
  if (!normalized) {
    return false;
  }
  if (normalized === 'cs') {
    return true;
  }
  if (normalized.startsWith('cs ') || normalized.startsWith('cs-') || normalized.startsWith('cs -')) {
    return true;
  }
  if (normalized.includes('customer success')) {
    return true;
  }
  return tokensIncludeCs(normalized);
}

/**
 * Times em que a UI deve falar em **movimentações** em vez de tarefas/atividades
 * (nomes oficiais na API: "CS", "Financeiro"; id numérico do financeiro = {@link GAME4U_FINANCE_TEAM_ID}).
 */
export function usesMovimentacoesTerminology(
  teamId?: string | null | undefined,
  teamDisplayName?: string | null | undefined
): boolean {
  const id = String(teamId ?? '').trim();
  const fromId = displayNameForGame4uTeamId(id);
  const rawName = String(teamDisplayName ?? '').trim();
  const nCombined = normalizeTeamText(`${fromId} ${rawName}`.trim());
  const nName = normalizeTeamText(rawName);

  if (id === GAME4U_FINANCE_TEAM_ID) {
    return true;
  }
  if (nCombined.includes('financeiro') || nName.includes('financeiro')) {
    return true;
  }
  return isCsTeamLabel(nCombined) || isCsTeamLabel(nName);
}
