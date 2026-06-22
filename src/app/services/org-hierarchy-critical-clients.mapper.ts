import { CriticalClientItem, CriticalClientRiskTier, CriticalClientsSummary, CriticalClientIssueKind, CriticalClientIssueFilter } from '@model/game4u-api.model';

export interface CriticalClientKpiChip {
  key: string;
  label: string;
  value: number;
  tone: 'critical' | 'warning' | 'info' | 'muted';
}

export function hasCriticalClients(summary: CriticalClientsSummary | null | undefined): boolean {
  return (summary?.count ?? 0) > 0;
}

export function getCriticalClientsTopList(
  summary: CriticalClientsSummary | null | undefined
): CriticalClientItem[] {
  return summary?.top_clients ?? [];
}

export function buildCriticalClientKpiChips(
  summary: CriticalClientsSummary | null | undefined
): CriticalClientKpiChip[] {
  if (!summary?.count) {
    return [];
  }
  return [
    { key: 'count', label: 'Clientes críticos', value: summary.count, tone: 'info' as const },
    { key: 'with_overdue', label: 'Com atraso (MTD)', value: summary.with_overdue, tone: 'critical' as const },
    { key: 'high_risk', label: 'Alto risco (≥50)', value: summary.high_risk, tone: 'warning' as const },
    {
      key: 'consecutive_2plus',
      label: '2+ meses c/ problemas',
      value: summary.consecutive_2plus,
      tone: 'warning' as const
    },
    {
      key: 'with_late_finish',
      label: 'Entrega tardia',
      value: summary.with_late_finish,
      tone: 'muted' as const
    }
  ].filter(chip => chip.value > 0 || chip.key === 'count');
}

export function getCriticalClientTierLabel(tier: CriticalClientRiskTier): string {
  switch (tier) {
    case 'critical':
      return 'Crítico';
    case 'high':
      return 'Alto';
    case 'medium':
      return 'Médio';
    default:
      return 'Baixo';
  }
}

export function getCriticalClientTierClass(tier: CriticalClientRiskTier): string {
  return `critical-tier--${tier}`;
}

export function getCriticalClientTagLabels(client: CriticalClientItem): string[] {
  const tags: string[] = [];
  if (client.is_acessorias_risco_de_churn) {
    tags.push('#RISCODECHURN');
  }
  if (client.is_acessorias_onboarding) {
    tags.push('#ONBOARDING');
  }
  if (client.is_acessorias_g4) {
    tags.push('#G4');
  }
  return tags;
}

export function formatCriticalClientRiskScore(score: number | undefined | null): string {
  if (score == null || !Number.isFinite(score)) {
    return '—';
  }
  return Math.round(score).toLocaleString('pt-BR');
}

export function criticalClientHasOperationalIssues(client: CriticalClientItem): boolean {
  return (client.mtd_overdue_unjustified ?? 0) > 0 || (client.mtd_late_finish ?? 0) > 0;
}

export function formatCriticalClientIssueKindLabel(
  issueKind: CriticalClientIssueKind | null | undefined
): string {
  switch (issueKind) {
    case 'overdue':
      return 'Atraso pendente';
    case 'late_finish':
      return 'Entrega tardia';
    default:
      return '';
  }
}

export function getCriticalClientIssueFilterLabel(issue: CriticalClientIssueFilter): string {
  switch (issue) {
    case 'overdue':
      return 'Atraso pendente';
    case 'late_finish':
      return 'Entrega tardia';
    default:
      return 'Todos os problemas';
  }
}
