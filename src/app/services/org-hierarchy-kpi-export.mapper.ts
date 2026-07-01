import type {
  CriticalClientIssueFilter,
  OrganizationHierarchyDeliveriesDiretoriaRow,
  OrganizationHierarchyDeliveryRow,
  OrganizationHierarchyKpiDetailResponse,
  OrgHierarchyDeliveriesDrilldownKey,
  OrgHierarchyKpiDetailKey
} from '@model/game4u-api.model';
import { slugifyExportFilenamePart } from '@utils/spreadsheet-export';
import {
  getOrgHierarchyDeliveryActionTitle,
  getOrgHierarchyDeliveryCompanyLabel
} from './org-hierarchy-report.mapper';
import { formatCriticalClientIssueKindLabel } from './org-hierarchy-critical-clients.mapper';

export interface OrgHierarchyDeliveriesExportOptions {
  includeDelayColumn: boolean;
  includeFinishedColumn: boolean;
  includePointsColumn: boolean;
  includeStatusColumns?: boolean;
  includeDelayWithFinished?: boolean;
  includeIssueKindColumn?: boolean;
  /** Coluna CNPJ — somente em exportações Excel. */
  includeCnpj?: boolean;
  /** Coluna user_action_id — drill-down cliente crítico com all_scoring_events. */
  includeUserActionId?: boolean;
}

const DELIVERIES_DRILLDOWN_SLUGS: Record<OrgHierarchyDeliveriesDrilldownKey, string> = {
  multa_risk: 'risco-multa',
  multa_incurred: 'multas-incorridas',
  near_due: 'proximas-do-vencimento',
  overdue_pending: 'pendentes-atrasados',
  overdue_pending_justified: 'atraso-justificado',
  overdue_pending_unjustified: 'atraso-sem-justificativa',
  critical_client: 'cliente-critico'
};

function formatExportIsoDate(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleDateString('pt-BR');
}

export function flattenOrgHierarchyDeliveriesForExport(
  diretorias: OrganizationHierarchyDeliveriesDiretoriaRow[],
  options: OrgHierarchyDeliveriesExportOptions
): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];

  for (const dir of diretorias) {
    for (const ger of dir.gerencias ?? []) {
      for (const sup of ger.supervisoes ?? []) {
        for (const delivery of sup.deliveries ?? []) {
          rows.push(mapDeliveryRowForExport(delivery, dir.label, ger.label, sup.label, options));
        }
      }
    }
  }

  return rows;
}

function mapDeliveryRowForExport(
  delivery: OrganizationHierarchyDeliveryRow,
  diretoriaLabel: string,
  gerenciaLabel: string,
  supervisorLabel: string,
  options: OrgHierarchyDeliveriesExportOptions
): Record<string, string | number> {
  const row: Record<string, string | number> = {
    Diretoria: diretoriaLabel,
    Gerência: gerenciaLabel,
    Supervisão: supervisorLabel,
    Cliente: getOrgHierarchyDeliveryCompanyLabel(delivery),
    Tarefa: getOrgHierarchyDeliveryActionTitle(delivery),
    Prazo: formatExportIsoDate(delivery.dt_prazo),
    Colaborador: delivery.player_name ?? delivery.player_email ?? '',
    'E-mail colaborador': delivery.player_email ?? '',
    Time: delivery.team_name ?? delivery.team_id ?? ''
  };

  if (options.includeCnpj) {
    row['CNPJ'] = delivery.company_cnpj_digits ?? delivery.company_serve_key ?? '';
  }

  if (options.includeIssueKindColumn) {
    row['Tipo de problema'] = formatCriticalClientIssueKindLabel(delivery.issue_kind);
  }
  if (options.includeUserActionId) {
    row['ID ação'] = delivery.user_action_id ?? '';
  }
  if (options.includeDelayColumn || options.includeDelayWithFinished) {
    row['Atraso legal'] = formatExportIsoDate(delivery.dt_atraso);
  }
  if (options.includeFinishedColumn) {
    row['Conclusão'] = formatExportIsoDate(delivery.finished_at);
  }
  if (options.includePointsColumn) {
    row['Pontos'] = delivery.points ?? '';
  }
  if (options.includeStatusColumns !== false) {
    if (delivery.status) {
      row['Status'] = delivery.status;
    }
    if (delivery.status_calc) {
      row['Status calc'] = delivery.status_calc;
    }
  }
  if (delivery.is_justificada != null) {
    row['Justificada'] = delivery.is_justificada ? 'Sim' : 'Não';
  }

  return row;
}

export function mapOrgHierarchyKpiHistoryForExport(
  kpiDetail: OrganizationHierarchyKpiDetailResponse,
  formatValue: (value: number | null) => string
): Record<string, string | number>[] {
  const valueHeader = kpiDetail.kpi_label?.trim() || kpiDetail.kpi;
  return (kpiDetail.history ?? []).map(item => ({
    Mês: item.month_label,
    'Início MTD': item.mtd_start,
    'Fim MTD': item.mtd_end,
    [valueHeader]: formatValue(item.value)
  }));
}

function buildMonthSlug(month: Date): string {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
}

function buildIssueFilterSuffix(issue?: CriticalClientIssueFilter): string {
  if (!issue || issue === 'all') {
    return '';
  }
  return issue === 'overdue' ? '-atraso-pendente' : '-entrega-tardia';
}

export interface OrgHierarchyDeliveriesExportFilenameOptions {
  drilldown: OrgHierarchyDeliveriesDrilldownKey;
  month: Date;
  scopeLabel?: string | null;
  format: 'csv' | 'xlsx';
  filtered?: boolean;
  clientLabel?: string | null;
  issue?: CriticalClientIssueFilter;
}

/** Nome de arquivo PT-BR para exportação de entregas do relatório organizacional. */
export function buildOrgHierarchyDeliveriesExportFilename(
  options: OrgHierarchyDeliveriesExportFilenameOptions
): string {
  const monthLabel = buildMonthSlug(options.month);
  const scopeSlug = slugifyExportFilenamePart(options.scopeLabel);
  const filterSuffix = options.filtered ? '-filtrado' : '';
  const extension = options.format === 'csv' ? '.csv' : '.xlsx';

  if (options.drilldown === 'critical_client') {
    const clientSlug = slugifyExportFilenamePart(options.clientLabel);
    const issueSuffix = buildIssueFilterSuffix(options.issue);
    return `relatorio-organizacional-cliente-critico-${clientSlug}-${monthLabel}-${scopeSlug}${issueSuffix}${filterSuffix}${extension}`;
  }

  const subjectSlug = DELIVERIES_DRILLDOWN_SLUGS[options.drilldown];
  return `relatorio-organizacional-entregas-${subjectSlug}-${monthLabel}-${scopeSlug}${filterSuffix}${extension}`;
}

/** Nome de arquivo PT-BR para exportação agregada de entregas de clientes críticos. */
export function buildOrgHierarchyCriticalClientsDeliveriesExportFilename(options: {
  month: Date;
  scopeLabel?: string | null;
  format?: 'csv' | 'xlsx';
  issue?: CriticalClientIssueFilter;
}): string {
  const monthLabel = buildMonthSlug(options.month);
  const scopeSlug = slugifyExportFilenamePart(options.scopeLabel);
  const issueSuffix = buildIssueFilterSuffix(options.issue);
  const extension = (options.format ?? 'xlsx') === 'csv' ? '.csv' : '.xlsx';
  return `relatorio-organizacional-entregas-clientes-criticos-${monthLabel}-${scopeSlug}${issueSuffix}${extension}`;
}

/** @deprecated Prefer {@link buildOrgHierarchyDeliveriesExportFilename}. */
export function buildOrgHierarchyKpiExportFilename(options: {
  kpi: OrgHierarchyKpiDetailKey;
  month: Date;
  nodeLabel?: string | null;
  format: 'csv' | 'xlsx';
  filtered?: boolean;
}): string {
  return buildOrgHierarchyDeliveriesExportFilename({
    drilldown: options.kpi as OrgHierarchyDeliveriesDrilldownKey,
    month: options.month,
    scopeLabel: options.nodeLabel,
    format: options.format,
    filtered: options.filtered
  });
}
