import {
  CriticalClientItem,
  CriticalClientRiskTier,
  CriticalClientsSummary,
  CriticalClientIssueKind,
  CriticalClientIssueFilter,
  OrganizationHierarchyDeliveriesResponse,
  OrganizationHierarchyDeliveriesDiretoriaRow,
  OrganizationHierarchyDeliveryRow
} from '@model/game4u-api.model';
import { downloadXlsxWorkbook, slugifyExportFilenamePart } from '@utils/spreadsheet-export';

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
  return summary?.top_clients ?? summary?.clients?.slice(0, 15) ?? [];
}

export function getCriticalClientsFullList(
  summary: CriticalClientsSummary | null | undefined
): CriticalClientItem[] {
  if (summary?.clients?.length) {
    return summary.clients;
  }
  return summary?.top_clients ?? [];
}

export function criticalClientsHasFullList(summary: CriticalClientsSummary | null | undefined): boolean {
  const fullCount = summary?.clients?.length ?? 0;
  const topCount = summary?.top_clients?.length ?? 0;
  return fullCount > topCount;
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

/** Contagem MTD esperada no drill-down com `all_scoring_events=true`. */
export function getCriticalClientExpectedDeliveryCount(
  client: CriticalClientItem,
  issue: CriticalClientIssueFilter
): number {
  switch (issue) {
    case 'overdue':
      return client.mtd_overdue_unjustified ?? 0;
    case 'late_finish':
      return client.mtd_late_finish ?? 0;
    default:
      return (client.mtd_overdue_unjustified ?? 0) + (client.mtd_late_finish ?? 0);
  }
}

export function mapCriticalClientForExport(client: CriticalClientItem): Record<string, string | number> {
  return {
    Cliente: client.company_label,
    'Chave cliente': client.company_serve_key,
    Score: Math.round(client.risk_score ?? 0),
    Risco: getCriticalClientTierLabel(client.risk_tier),
    'Atraso s/ just. (MTD)': client.mtd_overdue_unjustified ?? 0,
    'Entrega tardia (MTD)': client.mtd_late_finish ?? 0,
    'Meses c/ problemas': client.consecutive_issue_months ?? 0,
    G4: client.is_acessorias_g4 ? 'Sim' : 'Não',
    Onboarding: client.is_acessorias_onboarding ? 'Sim' : 'Não',
    'Risco churn': client.is_acessorias_risco_de_churn ? 'Sim' : 'Não'
  };
}

export function mapCriticalClientsSummaryForExport(
  chips: CriticalClientKpiChip[]
): Record<string, string | number>[] {
  return chips.map(chip => ({
    Indicador: chip.label,
    Valor: chip.value
  }));
}

export function buildCriticalClientsListExportFilename(options: {
  month: Date;
  scopeLabel?: string | null;
}): string {
  const monthLabel = `${options.month.getFullYear()}-${String(options.month.getMonth() + 1).padStart(2, '0')}`;
  const scopeSlug = slugifyExportFilenamePart(options.scopeLabel);
  return `relatorio-organizacional-clientes-criticos-${monthLabel}-${scopeSlug}.xlsx`;
}

export function downloadCriticalClientsExcel(options: {
  filename: string;
  chips: CriticalClientKpiChip[];
  clients: CriticalClientItem[];
}): void {
  downloadXlsxWorkbook(options.filename, [
    { name: 'Resumo', rows: mapCriticalClientsSummaryForExport(options.chips) },
    { name: 'Clientes', rows: options.clients.map(mapCriticalClientForExport) }
  ]);
}

export interface CriticalClientDeliveriesViewOptions {
  issue: CriticalClientIssueFilter;
  allScoringEvents: boolean;
}

function deliveryIssuePriority(issueKind: CriticalClientIssueKind | null | undefined): number {
  if (issueKind === 'overdue') {
    return 2;
  }
  if (issueKind === 'late_finish') {
    return 1;
  }
  return 0;
}

function dedupeDeliveriesByDeliveryId(
  deliveries: OrganizationHierarchyDeliveryRow[]
): OrganizationHierarchyDeliveryRow[] {
  const byId = new Map<string, OrganizationHierarchyDeliveryRow>();
  for (const delivery of deliveries) {
    const key = delivery.delivery_id || delivery.user_action_id || '';
    if (!key) {
      continue;
    }
    const existing = byId.get(key);
    if (!existing || deliveryIssuePriority(delivery.issue_kind) > deliveryIssuePriority(existing.issue_kind)) {
      byId.set(key, delivery);
    }
  }
  return Array.from(byId.values());
}

function filterDeliveriesForView(
  deliveries: OrganizationHierarchyDeliveryRow[],
  issue: CriticalClientIssueFilter,
  allScoringEvents: boolean
): OrganizationHierarchyDeliveryRow[] {
  let rows = deliveries;
  if (issue !== 'all') {
    rows = rows.filter(d => d.issue_kind === issue);
  }
  if (!allScoringEvents) {
    rows = dedupeDeliveriesByDeliveryId(rows);
  }
  return rows;
}

function mapCriticalClientDeliveriesTree(
  source: OrganizationHierarchyDeliveriesResponse,
  mapDeliveries: (deliveries: OrganizationHierarchyDeliveryRow[]) => OrganizationHierarchyDeliveryRow[]
): OrganizationHierarchyDeliveriesDiretoriaRow[] {
  return (source.diretorias ?? [])
    .map(dir => {
      const gerencias = (dir.gerencias ?? [])
        .map(ger => {
          const supervisoes = (ger.supervisoes ?? [])
            .map(sup => {
              const deliveries = mapDeliveries(sup.deliveries ?? []);
              if (deliveries.length === 0) {
                return null;
              }
              return {
                ...sup,
                deliveries,
                delivery_count: deliveries.length
              };
            })
            .filter((sup): sup is NonNullable<typeof sup> => sup != null);
          if (supervisoes.length === 0) {
            return null;
          }
          const delivery_count = supervisoes.reduce((sum, sup) => sum + sup.delivery_count, 0);
          return { ...ger, supervisoes, delivery_count };
        })
        .filter((ger): ger is NonNullable<typeof ger> => ger != null);
      if (gerencias.length === 0) {
        return null;
      }
      const delivery_count = gerencias.reduce((sum, ger) => sum + ger.delivery_count, 0);
      return { ...dir, gerencias, delivery_count };
    })
    .filter((dir): dir is OrganizationHierarchyDeliveriesDiretoriaRow => dir != null);
}

/** Aplica filtro de problema e modo resumido/detalhe KPI em memória (após fetch robusto). */
export function buildCriticalClientDeliveriesView(
  source: OrganizationHierarchyDeliveriesResponse | null | undefined,
  options: CriticalClientDeliveriesViewOptions
): OrganizationHierarchyDeliveriesResponse | null {
  if (!source) {
    return null;
  }
  const diretorias = mapCriticalClientDeliveriesTree(source, deliveries =>
    filterDeliveriesForView(deliveries, options.issue, options.allScoringEvents)
  );
  const total_deliveries = diretorias.reduce((sum, dir) => sum + dir.delivery_count, 0);
  return {
    ...source,
    total_deliveries,
    diretorias
  };
}

export function countCriticalClientDeliveriesInView(
  source: OrganizationHierarchyDeliveriesResponse | null | undefined,
  options: CriticalClientDeliveriesViewOptions
): number {
  return buildCriticalClientDeliveriesView(source, options)?.total_deliveries ?? 0;
}

export function countCriticalClientDeliveriesByIssue(
  source: OrganizationHierarchyDeliveriesResponse | null | undefined,
  issue: CriticalClientIssueFilter,
  allScoringEvents: boolean
): number {
  return countCriticalClientDeliveriesInView(source, { issue, allScoringEvents });
}
