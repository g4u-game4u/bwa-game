import {
  OrgHierarchyAccessByDow,
  OrgHierarchyFinishedByDow,
  OrgHierarchyHighlightItem,
  OrgHierarchyKpiDetailKey,
  OrgHierarchyNode,
  OrgHierarchyNodeType,
  OrgHierarchyOperationalDeliveriesDrilldownKey,
  OrganizationHierarchyDeliveryRow,
  OrgMetricsWindow
} from '@model/game4u-api.model';
import { normalizeOrgHierarchyNodeType } from './org-hierarchy-segmentation.mapper';

export type OrgHierarchyRankingSortBy = 'on_time_pct' | 'points_per_collaborator';

export type OrgRankingColumnKey = keyof OrgMetricsWindow | 'points_per_collaborator';

export interface OrgRankingColumn {
  key: OrgRankingColumnKey;
  label: string;
  format: OrgHighlightMtdFormat;
  title?: string;
}

/** KPIs operacionais com lista hierárquica de entregas (`/deliveries?drilldown=…`). */
export const ORG_HIERARCHY_DELIVERIES_DRILLDOWN_KPIS = new Set<OrgHierarchyKpiDetailKey>([
  'multa_risk',
  'multa_incurred',
  'near_due',
  'overdue_pending',
  'overdue_pending_justified',
  'overdue_pending_unjustified'
]);

export function isOrgHierarchyDeliveriesDrilldownKpi(
  kpi: OrgHierarchyKpiDetailKey
): kpi is OrgHierarchyOperationalDeliveriesDrilldownKey {
  return ORG_HIERARCHY_DELIVERIES_DRILLDOWN_KPIS.has(kpi);
}

export function getOrgHierarchyDeliveryTitle(
  delivery: Pick<
    OrganizationHierarchyDeliveryRow,
    'delivery_title' | 'action_name' | 'action_title' | 'delivery_id'
  >
): string {
  const title =
    delivery.delivery_title?.trim() ||
    delivery.action_title?.trim() ||
    delivery.action_name?.trim();
  return title || delivery.delivery_id?.trim() || '—';
}

export function getOrgHierarchyDeliveryCompanyLabel(
  delivery: Pick<
    OrganizationHierarchyDeliveryRow,
    'delivery_title' | 'client_name' | 'client_key'
  >
): string {
  return (
    delivery.delivery_title?.trim() ||
    delivery.client_name?.trim() ||
    delivery.client_key?.trim() ||
    '—'
  );
}

export function getOrgHierarchyDeliveryActionTitle(
  delivery: Pick<OrganizationHierarchyDeliveryRow, 'action_title' | 'action_name'>
): string {
  return delivery.action_title?.trim() || delivery.action_name?.trim() || '—';
}

export function getOrgHierarchyDeliveryClientLabel(
  delivery: Pick<OrganizationHierarchyDeliveryRow, 'client_name' | 'client_key'>
): string {
  return delivery.client_name?.trim() || delivery.client_key?.trim() || '—';
}

export function getOrgHierarchyDeliveryCnpjLabel(
  delivery: Pick<OrganizationHierarchyDeliveryRow, 'company_cnpj_digits' | 'company_serve_key' | 'client_key'>
): string {
  return (
    delivery.company_cnpj_digits?.trim() ||
    delivery.company_serve_key?.trim() ||
    delivery.client_key?.trim() ||
    '—'
  );
}

export interface OrgOnTimePctSegment {
  key: string;
  label: string;
  value: number | null;
}

/** Meta fixa de % no prazo usada no painel organizacional. */
export const ORG_ON_TIME_PCT_GOAL = 90;

export function shouldOmitOrgHierarchyModalScope(scope: string | null | undefined): boolean {
  const normalized = scope?.trim().toLowerCase();
  return !normalized || normalized === 'escopo' || normalized === 'bwa';
}

export function formatOrgHierarchyDrilldownModalTitle(
  kpiLabel: string,
  scope?: string | null
): string {
  if (shouldOmitOrgHierarchyModalScope(scope)) {
    return kpiLabel;
  }
  return `${kpiLabel} (${scope!.trim()})`;
}

/** Percentual de entregas no prazo em relação à meta (90%). */
export function computeOrgOnTimeGoalPct(mtd: OrgMetricsWindow | undefined | null): number | null {
  const onTime = mtd?.on_time_pct;
  if (onTime == null || !Number.isFinite(onTime)) {
    return null;
  }
  return (onTime / ORG_ON_TIME_PCT_GOAL) * 100;
}

/** Segmentos de % no prazo MTD (geral + tags Acessórias). */
export function buildOrgOnTimePctSegments(mtd: OrgMetricsWindow | undefined | null): OrgOnTimePctSegment[] {
  if (!mtd) {
    return [];
  }
  return [
    { key: 'general', label: 'Geral', value: mtd.on_time_pct ?? null },
    { key: 'g4', label: 'G4', value: mtd.on_time_pct_acessorias_g4 ?? null },
    {
      key: 'churn',
      label: 'Risco churn',
      value: mtd.on_time_pct_acessorias_risco_de_churn ?? null
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      value: mtd.on_time_pct_acessorias_onboarding ?? null
    }
  ].filter(segment => segment.value != null && Number.isFinite(segment.value));
}

export function formatOrgOnTimePctSegment(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function orgOnTimePctGaugeWidth(value: number | null): number {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

/** Aba de visualização dos destaques / atenção no relatório organizacional. */
export type OrgHierarchyHighlightViewTab = 'player' | 'supervisao' | 'gerencia';

/** Aba principal do painel de relatório organizacional. */
export type OrgHierarchyReportPanelTab = 'operations' | 'access' | 'simulation';

export type OrgHierarchyTreeViewMode = 'table' | 'flowchart';

export type OrgPipelineSegmentTone = 'info' | 'warning' | 'destructive' | 'muted';

export interface OrgPipelineSegment {
  key: string;
  label: string;
  value: number;
  tone: OrgPipelineSegmentTone;
  kpi: OrgHierarchyKpiDetailKey;
  emphasis?: boolean;
  tooltip?: string;
}

/** Colunas essenciais do ranking de diretorias (demais ficam atrás de "Ver detalhes"). */
export const ORG_RANKING_ESSENTIAL_COLUMNS: readonly OrgRankingColumn[] = [
  { key: 'finished', label: 'Entregas', format: 'number' },
  { key: 'on_time_pct', label: '% Prazo', format: 'pct', title: 'Percentual de entregas no prazo' },
  { key: 'points_delivered', label: 'Pontos', format: 'number', title: 'Pontos entregues' },
  {
    key: 'points_per_collaborator',
    label: 'Pts/colab.',
    format: 'number',
    title: 'Pontos entregues MTD ÷ colaboradores do nó'
  },
  { key: 'goal_points', label: 'Meta', format: 'number', title: 'Meta de pontos do mês cheio' }
];

/** Colunas detalhadas do ranking (toggle "Ver detalhes"). */
export const ORG_RANKING_DETAIL_COLUMNS: readonly OrgHighlightMtdColumn[] = [
  { key: 'clients_served', label: 'Clientes', format: 'number', title: 'Clientes atendidos' },
  { key: 'clients_onboarding', label: 'Onboarding', format: 'number' },
  { key: 'clients_acessorias_g4', label: 'G4', format: 'number', title: 'Clientes Acessórias G4' },
  { key: 'clients_acessorias_risco_de_churn', label: 'Churn', format: 'number', title: 'Clientes Acessórias com risco de churn' },
  { key: 'pending_open', label: 'Pendentes', format: 'number' },
  { key: 'multa_risk', label: 'Risco multa', format: 'number' },
  { key: 'multa_incurred', label: 'Multa incorr.', format: 'number', title: 'Multas incorridas (concluídas após dt_atraso)' },
  { key: 'overdue_pending_unjustified', label: 'Atraso s/ just.', format: 'number', title: 'Atraso sem justificativa' }
];

/** Colunas compactas da árvore hierárquica (toggle "Mostrar todas as métricas"). */
export const ORG_TREE_COMPACT_COLUMNS: readonly OrgHighlightMtdColumn[] = [
  { key: 'clients_served', label: 'Clientes', format: 'number', title: 'Clientes atendidos' },
  { key: 'clients_onboarding', label: 'Onboarding', format: 'number' },
  { key: 'on_time_pct', label: '% Prazo', format: 'pct', title: 'Percentual de entregas no prazo' },
  { key: 'pending_open', label: 'Pendentes', format: 'number' }
];

export function mapOrgPipelineSegments(mtd: OrgMetricsWindow | undefined | null): OrgPipelineSegment[] {
  if (!mtd) {
    return [];
  }
  return [
    {
      key: 'pending_open',
      label: 'Pendentes em aberto',
      value: mtd.pending_open ?? 0,
      tone: 'info',
      kpi: 'pending_open'
    },
    {
      key: 'near_due',
      label: 'Próx. vencimento',
      value: mtd.near_due ?? 0,
      tone: 'warning',
      kpi: 'near_due'
    },
    {
      key: 'overdue_pending_justified',
      label: 'Atraso justificado',
      value: mtd.overdue_pending_justified ?? 0,
      tone: 'muted',
      kpi: 'overdue_pending_justified'
    },
    {
      key: 'overdue_pending_unjustified',
      label: 'Atraso s/ justificativa',
      value: mtd.overdue_pending_unjustified ?? 0,
      tone: 'destructive',
      kpi: 'overdue_pending_unjustified'
    },
    {
      key: 'multa_risk',
      label: 'Risco de multa',
      value: mtd.multa_risk ?? 0,
      tone: 'destructive',
      kpi: 'multa_risk',
      emphasis: (mtd.multa_risk ?? 0) > 0,
      tooltip: 'Pendente + EntMulta na janela técnico→legal'
    },
    {
      key: 'multa_incurred',
      label: 'Multas incorridas',
      value: mtd.multa_incurred ?? 0,
      tone: 'destructive',
      kpi: 'multa_incurred',
      emphasis: (mtd.multa_incurred ?? 0) > 0,
      tooltip: 'Concluída MTD com EntMulta após dt_atraso (exceto justificada)'
    }
  ];
}

export interface OrgOperationalRiskAlert {
  key: string;
  label: string;
  value: number;
  kpi: OrgHierarchyKpiDetailKey;
  severity: 'critical' | 'warning';
  description: string;
}

export function buildOrgOperationalRiskAlerts(mtd: OrgMetricsWindow | undefined | null): OrgOperationalRiskAlert[] {
  if (!mtd) {
    return [];
  }
  const alerts: OrgOperationalRiskAlert[] = [];
  const multaIncurred = mtd.multa_incurred ?? 0;
  const multaRisk = mtd.multa_risk ?? 0;

  if (multaIncurred > 0) {
    alerts.push({
      key: 'multa_incurred',
      label: 'Multas incorridas',
      value: multaIncurred,
      kpi: 'multa_incurred',
      severity: 'critical',
      description: 'Entregas concluídas após dt_atraso com regra de multa'
    });
  }
  if (multaRisk > 0) {
    alerts.push({
      key: 'multa_risk',
      label: 'Risco de multa',
      value: multaRisk,
      kpi: 'multa_risk',
      severity: 'critical',
      description: 'Pendentes na janela entre prazo técnico e legal'
    });
  }
  return alerts;
}

const ORG_PIPELINE_LEGEND_EXCLUDED_KEYS = new Set(['multa_risk', 'multa_incurred']);

export function filterOrgPipelineLegendSegments(
  segments: readonly OrgPipelineSegment[]
): OrgPipelineSegment[] {
  return segments.filter(seg => !ORG_PIPELINE_LEGEND_EXCLUDED_KEYS.has(seg.key));
}

export function orgPipelineSegmentsTotal(segments: readonly OrgPipelineSegment[]): number {
  return segments.reduce((sum, seg) => sum + seg.value, 0);
}

export function orgPipelineSegmentWidthPct(
  value: number,
  segments: readonly OrgPipelineSegment[]
): number {
  const total = orgPipelineSegmentsTotal(segments);
  if (total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

export function computeFinishedVsOpenPct(mtd: OrgMetricsWindow | undefined | null): number | null {
  if (!mtd) {
    return null;
  }
  const finished = mtd.finished ?? 0;
  const pending = mtd.pending_open ?? 0;
  const total = finished + pending;
  if (total <= 0) {
    return null;
  }
  return (finished / total) * 100;
}

const HIGHLIGHT_VIEW_TAB_NODE_TYPES: readonly OrgHierarchyHighlightViewTab[] = [
  'player',
  'supervisao',
  'gerencia'
];

export interface OrgHierarchyWeekdayStat {
  dow: number;
  label: string;
  shortLabel: string;
  finishedCount: number;
  pointsTotal: number;
}

export interface OrgHierarchyAccessWeekdayStat {
  dow: number;
  label: string;
  shortLabel: string;
  accessDays: number;
  accessSessions: number;
}

const NODE_TYPE_LABELS: Record<OrgHierarchyNodeType, string> = {
  organization: 'Organização',
  c_level: 'C-Level',
  segmentacao: 'Segmentação',
  diretoria: 'Diretoria',
  gerencia: 'Gerência',
  supervisao: 'Supervisão',
  player: 'Colaborador'
};

const ISO_DOW_LABELS: readonly { label: string; shortLabel: string }[] = [
  { label: 'Segunda-feira', shortLabel: 'Seg' },
  { label: 'Terça-feira', shortLabel: 'Ter' },
  { label: 'Quarta-feira', shortLabel: 'Qua' },
  { label: 'Quinta-feira', shortLabel: 'Qui' },
  { label: 'Sexta-feira', shortLabel: 'Sex' },
  { label: 'Sábado', shortLabel: 'Sáb' },
  { label: 'Domingo', shortLabel: 'Dom' }
];

export function getOrgHierarchyNodeTypeLabel(nodeType: OrgHierarchyNodeType): string {
  return NODE_TYPE_LABELS[nodeType] ?? nodeType;
}

export function getOrgHierarchyScopeTitle(root: OrgHierarchyNode): string {
  const typeLabel = getOrgHierarchyNodeTypeLabel(root.node_type);
  return `${typeLabel}: ${root.label}`;
}

export function computeOrgPointsPerCollaborator(node: OrgHierarchyNode): number | null {
  const points = node.mtd?.points_delivered;
  const count = node.players_count;
  if (
    points == null ||
    count == null ||
    !Number.isFinite(points) ||
    !Number.isFinite(count) ||
    count <= 0
  ) {
    return null;
  }
  return points / count;
}

export function formatOrgPointsPerCollaborator(node: OrgHierarchyNode): string {
  const value = computeOrgPointsPerCollaborator(node);
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function rankingSortValue(
  node: OrgHierarchyNode,
  sortBy: OrgHierarchyRankingSortBy
): number {
  if (sortBy === 'on_time_pct') {
    return node.mtd?.on_time_pct ?? -Infinity;
  }
  return computeOrgPointsPerCollaborator(node) ?? -Infinity;
}

export function sortOrgHierarchyChildren(
  nodes: OrgHierarchyNode[] | undefined,
  sortBy: OrgHierarchyRankingSortBy = 'on_time_pct'
): OrgHierarchyNode[] {
  if (!nodes?.length) {
    return [];
  }
  const copy = [...nodes];
  copy.sort((a, b) => {
    const primaryB = rankingSortValue(b, sortBy);
    const primaryA = rankingSortValue(a, sortBy);
    if (primaryB !== primaryA) {
      return primaryB - primaryA;
    }
    const ptsB = b.mtd?.points_delivered ?? 0;
    const ptsA = a.mtd?.points_delivered ?? 0;
    if (ptsB !== ptsA) {
      return ptsB - ptsA;
    }
    return (a.label ?? '').localeCompare(b.label ?? '', 'pt-BR');
  });
  return copy;
}

export function formatOrgRankingCell(node: OrgHierarchyNode, column: OrgRankingColumn): string {
  if (column.key === 'points_per_collaborator') {
    return formatOrgPointsPerCollaborator(node);
  }
  const value = node.mtd?.[column.key] as number | undefined | null;
  return formatHighlightMtdMetricValue(value, column.format);
}

export function mapFinishedByDowToWeekdayStats(
  rows: OrgHierarchyFinishedByDow[] | undefined
): OrgHierarchyWeekdayStat[] {
  const byDow = new Map<number, OrgHierarchyFinishedByDow>();
  for (const row of rows ?? []) {
    if (row.dow >= 1 && row.dow <= 7) {
      byDow.set(row.dow, row);
    }
  }
  return ISO_DOW_LABELS.map((labels, index) => {
    const dow = index + 1;
    const row = byDow.get(dow);
    return {
      dow,
      label: labels.label,
      shortLabel: labels.shortLabel,
      finishedCount: row?.finished_count ?? 0,
      pointsTotal: row?.points_total ?? 0
    };
  });
}

export function mapAccessByDowToWeekdayStats(
  rows: OrgHierarchyAccessByDow[] | undefined
): OrgHierarchyAccessWeekdayStat[] {
  const byDow = new Map<number, OrgHierarchyAccessByDow>();
  for (const row of rows ?? []) {
    if (row.dow >= 1 && row.dow <= 7) {
      byDow.set(row.dow, row);
    }
  }
  return ISO_DOW_LABELS.map((labels, index) => {
    const dow = index + 1;
    const row = byDow.get(dow);
    return {
      dow,
      label: labels.label,
      shortLabel: labels.shortLabel,
      accessDays: row?.access_days ?? 0,
      accessSessions: row?.access_sessions ?? 0
    };
  });
}

export function formatOrgHierarchyComparePct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  const n = Math.trunc(value);
  return `${sign}${n.toString()}%`;
}

export function getOrgHierarchyCompareTone(
  value: number | undefined | null
): 'positive' | 'negative' | 'neutral' {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return 'neutral';
  }
  return value > 0 ? 'positive' : 'negative';
}

export function formatBrl(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  }).format(value);
}

export function formatOrgHierarchySharePct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
}

export function weekdayBarHeight(count: number, max: number): string {
  if (count <= 0 || max <= 0) {
    return '0%';
  }
  const pct = Math.round((count / max) * 100);
  return `${Math.max(pct, 8)}%`;
}

export function weekdayMaxFinishedCount(stats: OrgHierarchyWeekdayStat[]): number {
  return Math.max(1, ...stats.map(s => s.finishedCount));
}

export function weekdayMaxAccessDays(stats: OrgHierarchyAccessWeekdayStat[]): number {
  return Math.max(1, ...stats.map(s => s.accessDays));
}

export function weekdayMaxAccessSessions(stats: OrgHierarchyAccessWeekdayStat[]): number {
  return Math.max(1, ...stats.map(s => s.accessSessions));
}

export interface OrgHierarchyPlayerAccessRow {
  nodeId: string;
  label: string;
  accessDays: number;
  accessSessions: number;
  currentStreak?: number;
  lastAccessDate?: string | null;
  accessedToday?: boolean;
}

/** Colaboradores com métricas MTD de acesso (dias e sessões totais). */
export function mapPlayerAccessRows(
  root: OrgHierarchyNode | null | undefined
): OrgHierarchyPlayerAccessRow[] {
  return collectOrgHierarchyNodesByType(root, 'player')
    .filter(player => player.access?.mtd != null)
    .map(player => ({
      nodeId: player.node_id,
      label: (player.label ?? player.node_id).trim() || player.node_id,
      accessDays: player.access?.mtd?.access_days ?? 0,
      accessSessions: player.access?.mtd?.access_sessions ?? 0,
      currentStreak: player.access?.current_streak,
      lastAccessDate: player.access?.last_access_date,
      accessedToday: player.access?.accessed_today
    }))
    .sort(
      (a, b) =>
        b.accessSessions - a.accessSessions ||
        b.accessDays - a.accessDays ||
        a.label.localeCompare(b.label, 'pt-BR')
    );
}

export function avgAccessSessionsPerActiveUser(
  accessSessions: number | undefined | null,
  activeUsers: number | undefined | null
): number | null {
  if (accessSessions == null || activeUsers == null || activeUsers <= 0) {
    return null;
  }
  return Math.round((accessSessions / activeUsers) * 10) / 10;
}

export interface OrgClientClassificationTier {
  level: number;
  label: string;
  icon: string;
  count: number;
  kpi: OrgHierarchyKpiDetailKey;
}

/** Classificação portal: 1=Stone … 5=Diamante; 0=sem classificação no portal. */
export const ORG_CLIENT_CLASSIFICATION_LABELS: Record<number, string> = {
  0: 'Sem classificação',
  1: 'Stone',
  2: 'Bronze',
  3: 'Prata',
  4: 'Ouro',
  5: 'Diamante'
};

export const ORG_CLIENT_CLASSIFICATION_ICONS: Record<number, string> = {
  0: 'ri-question-line',
  1: 'ri-shield-line',
  2: 'ri-medal-line',
  3: 'ri-award-line',
  4: 'ri-trophy-line',
  5: 'ri-vip-diamond-fill'
};

export function mapClientClassificationTiers(
  mtd: OrgMetricsWindow | undefined | null
): OrgClientClassificationTier[] {
  const tiers: OrgClientClassificationTier[] = ([1, 2, 3, 4, 5] as const).map(level => ({
    level,
    label: ORG_CLIENT_CLASSIFICATION_LABELS[level],
    icon: ORG_CLIENT_CLASSIFICATION_ICONS[level],
    count: readClientClassificationCount(mtd, level),
    kpi: `clients_classificacao_${level}` as OrgHierarchyKpiDetailKey
  }));

  const semClassificacao = readClientSemClassificacaoCount(mtd);
  if (semClassificacao > 0) {
    tiers.push({
      level: 0,
      label: ORG_CLIENT_CLASSIFICATION_LABELS[0],
      icon: ORG_CLIENT_CLASSIFICATION_ICONS[0],
      count: semClassificacao,
      kpi: 'clients_sem_classificacao'
    });
  }

  return tiers;
}

function readClientSemClassificacaoCount(mtd: OrgMetricsWindow | undefined | null): number {
  const raw = mtd?.clients_sem_classificacao;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function readClientClassificationCount(
  mtd: OrgMetricsWindow | undefined | null,
  level: number
): number {
  const key = `clients_classificacao_${level}` as keyof OrgMetricsWindow;
  const raw = mtd?.[key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function clientClassificationTotal(tiers: OrgClientClassificationTier[]): number {
  return tiers.reduce((sum, tier) => sum + tier.count, 0);
}

export function clientClassificationMaxCount(tiers: OrgClientClassificationTier[]): number {
  return Math.max(1, ...tiers.map(t => t.count));
}

export function clientClassificationBarHeight(count: number, max: number): string {
  if (count <= 0 || max <= 0) {
    return '0%';
  }
  const pct = Math.round((count / max) * 100);
  return `${Math.max(pct, 8)}%`;
}

function readHighlightTextField(
  item: OrgHierarchyHighlightItem,
  keys: readonly string[]
): string {
  for (const key of keys) {
    const raw = item[key];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
}

function highlightMatchesNode(item: OrgHierarchyHighlightItem, node: OrgHierarchyNode): boolean {
  const targetId = String(item.node_id ?? '').trim().toLowerCase();
  const targetLabel = String(item.label ?? '').trim().toLowerCase();
  const nodeId = String(node.node_id ?? '').trim().toLowerCase();
  const nodeLabel = String(node.label ?? '').trim().toLowerCase();

  if (targetId && nodeId && (nodeId === targetId || nodeId.includes(targetId) || targetId.includes(nodeId))) {
    return true;
  }
  return !!(targetLabel && nodeLabel && nodeLabel === targetLabel);
}

function isOrgHierarchyNodeType(node: OrgHierarchyNode, type: OrgHierarchyNodeType): boolean {
  return normalizeOrgHierarchyNodeType(node.node_type) === type;
}

function resolveHighlightContextFromTree(
  item: OrgHierarchyHighlightItem,
  root?: OrgHierarchyNode | null
): { teamLabel: string; gerenciaLabel: string; diretoriaLabel: string } | null {
  if (!root) {
    return null;
  }

  let context: { teamLabel: string; gerenciaLabel: string; diretoriaLabel: string } | null = null;

  const walk = (
    node: OrgHierarchyNode,
    diretoria?: OrgHierarchyNode,
    gerencia?: OrgHierarchyNode,
    supervisao?: OrgHierarchyNode
  ): boolean => {
    const normalizedType = normalizeOrgHierarchyNodeType(node.node_type);
    const currentDiretoria = normalizedType === 'diretoria' ? node : diretoria;
    const currentGerencia = normalizedType === 'gerencia' ? node : gerencia;
    const currentSupervisao = normalizedType === 'supervisao' ? node : supervisao;

    if (
      (normalizedType === 'player' ||
        normalizedType === 'supervisao' ||
        normalizedType === 'gerencia' ||
        normalizedType === 'diretoria') &&
      highlightMatchesNode(item, node)
    ) {
      context = {
        teamLabel: currentSupervisao?.label?.trim() ?? '',
        gerenciaLabel: currentGerencia?.label?.trim() ?? '',
        diretoriaLabel: currentDiretoria?.label?.trim() ?? ''
      };
      return true;
    }

    for (const child of node.children ?? []) {
      if (walk(child, currentDiretoria, currentGerencia, currentSupervisao)) {
        return true;
      }
    }
    return false;
  };

  walk(root);
  return context;
}

function findHighlightNodeInTree(
  item: OrgHierarchyHighlightItem,
  root?: OrgHierarchyNode | null
): OrgHierarchyNode | null {
  if (!root) {
    return null;
  }

  let found: OrgHierarchyNode | null = null;

  const walk = (node: OrgHierarchyNode): boolean => {
    const normalizedType = normalizeOrgHierarchyNodeType(node.node_type);
    if (
      (normalizedType === 'player' ||
        normalizedType === 'supervisao' ||
        normalizedType === 'gerencia' ||
        normalizedType === 'diretoria') &&
      highlightMatchesNode(item, node)
    ) {
      found = node;
      return true;
    }
    for (const child of node.children ?? []) {
      if (walk(child)) {
        return true;
      }
    }
    return false;
  };

  walk(root);
  return found;
}

/** Infere o nível hierárquico de um destaque quando `node_type` não vem na API. */
export function inferHighlightNodeType(
  item: OrgHierarchyHighlightItem,
  root?: OrgHierarchyNode | null
): OrgHierarchyHighlightViewTab {
  const explicitRaw = String(item.node_type ?? '').trim().toLowerCase();
  const explicit = normalizeHighlightNodeType(explicitRaw);
  if (explicit && HIGHLIGHT_VIEW_TAB_NODE_TYPES.includes(explicit)) {
    return explicit;
  }

  const matched = findHighlightNodeInTree(item, root);
  if (matched) {
    const normalized = normalizeOrgHierarchyNodeType(matched.node_type);
    if (normalized === 'supervisao' || normalized === 'gerencia' || normalized === 'player') {
      return normalized;
    }
  }

  return 'player';
}

function normalizeHighlightNodeType(
  raw: string
): OrgHierarchyHighlightViewTab | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) {
    return null;
  }

  // Backend pode usar sinônimos nos destaques/atenção.
  // Mantemos o mapeamento aqui (sem depender de outros mappers) para habilitar as abas corretamente.
  if (v === 'player' || v === 'jogador' || v === 'colaborador') {
    return 'player';
  }
  if (v === 'supervisao' || v === 'supervisor' || v === 'team' || v === 'time') {
    return 'supervisao';
  }
  if (v === 'gerencia' || v === 'gerente' || v === 'manager') {
    return 'gerencia';
  }

  return null;
}

export interface DerivedOrgHierarchyHighlights {
  destaque: OrgHierarchyHighlightItem[];
  atencao: OrgHierarchyHighlightItem[];
}

const derivedHighlightsCache = new WeakMap<
  OrgHierarchyNode,
  Partial<Record<OrgHierarchyHighlightViewTab, DerivedOrgHierarchyHighlights>>
>();

function readMtdNumber(node: OrgHierarchyNode, key: keyof OrgMetricsWindow): number {
  const raw = node.mtd?.[key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export type OrgHighlightMtdFormat = 'number' | 'pct';

export interface OrgHighlightMtdColumn {
  key: keyof OrgMetricsWindow;
  label: string;
  format: OrgHighlightMtdFormat;
  title?: string;
}

export interface OrgGlobalMtdMetric {
  key: keyof OrgMetricsWindow;
  label: string;
  format: OrgHighlightMtdFormat;
  title?: string;
  kpi?: OrgHierarchyKpiDetailKey;
}

/** Indicadores MTD globais (raiz da organização) — espelha o objeto `root.mtd` da API. */
export const ORG_GLOBAL_MTD_METRICS: readonly OrgGlobalMtdMetric[] = [
  { key: 'clients_served', label: 'Clientes atendidos', format: 'number', kpi: 'clients_served' },
  { key: 'finished', label: 'Entregas concluídas', format: 'number', kpi: 'finished' },
  { key: 'goal_points', label: 'Meta de pontos', format: 'number', title: 'Meta do mês cheio' },
  { key: 'on_time_pct', label: '% no prazo', format: 'pct', kpi: 'on_time_pct' },
  { key: 'pending_open', label: 'Pendentes em aberto', format: 'number', kpi: 'pending_open' },
  { key: 'near_due', label: 'Próximas do vencimento', format: 'number', kpi: 'near_due' },
  {
    key: 'overdue_pending',
    label: 'Pendentes em atraso (total)',
    format: 'number',
    kpi: 'overdue_pending'
  },
  {
    key: 'overdue_pending_justified',
    label: 'Atraso justificado',
    format: 'number',
    kpi: 'overdue_pending_justified',
    title: 'Pendentes vencidas com atraso justificado'
  },
  {
    key: 'overdue_pending_unjustified',
    label: 'Atraso sem justificativa',
    format: 'number',
    kpi: 'overdue_pending_unjustified',
    title: 'Pendentes vencidas sem justificativa'
  },
  { key: 'multa_risk', label: 'Risco de multa', format: 'number', kpi: 'multa_risk' },
  {
    key: 'multa_incurred',
    label: 'Multas incorridas',
    format: 'number',
    kpi: 'multa_incurred',
    title: 'Entregas concluídas no MTD com regra de multa'
  },
  {
    key: 'multa_and_near_due',
    label: 'Multa + próx. vencimento',
    format: 'number',
    title: 'Interseção de risco de multa e proximidade de vencimento'
  }
];

export function formatOrgGlobalMtdValue(
  mtd: OrgMetricsWindow | undefined | null,
  metric: OrgGlobalMtdMetric
): string {
  return formatHighlightMtdMetricValue(mtd?.[metric.key] as number | undefined | null, metric.format);
}

/** Colunas MTD exibidas nas tabelas de destaques e atenção. */
export const ORG_HIGHLIGHT_MTD_COLUMNS: readonly OrgHighlightMtdColumn[] = [
  { key: 'on_time_pct', label: '% prazo', format: 'pct', title: 'Percentual de entregas no prazo' },
  { key: 'finished', label: 'Entregas', format: 'number' },
  { key: 'clients_served', label: 'Clientes', format: 'number', title: 'Clientes atendidos' },
  { key: 'clients_onboarding', label: 'Onboarding', format: 'number' },
  { key: 'clients_acessorias_g4', label: 'Acess. G4', format: 'number', title: 'Clientes Acessórias G4' },
  { key: 'clients_acessorias_onboarding', label: 'Acess. onboard.', format: 'number', title: 'Clientes Acessórias em onboarding' },
  { key: 'clients_acessorias_risco_de_churn', label: 'Acess. churn', format: 'number', title: 'Clientes Acessórias com risco de churn' },
  { key: 'points_delivered', label: 'Pontos', format: 'number', title: 'Pontos entregues' },
  { key: 'goal_points', label: 'Meta', format: 'number', title: 'Meta de pontos' },
  { key: 'pending_open', label: 'Pendentes', format: 'number' },
  { key: 'multa_risk', label: 'Multa risco', format: 'number' },
  { key: 'multa_incurred', label: 'Multa incorr.', format: 'number', title: 'Multas incorridas (concluídas)' },
  { key: 'near_due', label: 'Próx. venc.', format: 'number', title: 'Próximo do vencimento' },
  { key: 'multa_and_near_due', label: 'Multa+prox.', format: 'number', title: 'Multa e próximo do vencimento' },
  { key: 'overdue_pending', label: 'Atrasados', format: 'number' },
  { key: 'overdue_pending_justified', label: 'Atraso just.', format: 'number', title: 'Atraso justificado' },
  { key: 'overdue_pending_unjustified', label: 'Atraso s/ just.', format: 'number', title: 'Atraso sem justificativa' }
];

export function getHighlightMtdMetricValue(
  item: OrgHierarchyHighlightItem,
  key: keyof OrgMetricsWindow
): number | null {
  const fromMtd = item.mtd?.[key];
  if (typeof fromMtd === 'number' && Number.isFinite(fromMtd)) {
    return fromMtd;
  }
  const top = item[key];
  if (typeof top === 'number' && Number.isFinite(top)) {
    return top;
  }
  return null;
}

export function formatHighlightMtdMetricValue(
  value: number | undefined | null,
  format: OrgHighlightMtdFormat
): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  if (format === 'pct') {
    return `${Math.trunc(value).toString()}%`;
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function formatHighlightMtdCell(
  item: OrgHierarchyHighlightItem,
  column: OrgHighlightMtdColumn
): string {
  return formatHighlightMtdMetricValue(getHighlightMtdMetricValue(item, column.key), column.format);
}

function mapNodeToHighlightItem(
  tab: OrgHierarchyHighlightViewTab,
  node: OrgHierarchyNode,
  onTimePct: number,
  finished: number,
  clients: number
): OrgHierarchyHighlightItem {
  return {
    node_type: tab,
    node_id: node.node_id,
    label: node.label,
    metric: 'on_time_pct',
    value: onTimePct,
    finished,
    clients_served: clients,
    mtd: { ...(node.mtd ?? {}) }
  };
}

function collectNodesByType(
  root: OrgHierarchyNode,
  tab: OrgHierarchyHighlightViewTab
): OrgHierarchyNode[] {
  return collectOrgHierarchyNodesByType(root, tab);
}

/** Localiza um nó na árvore pelo `node_id`. */
export function findOrgHierarchyNodeById(
  root: OrgHierarchyNode | null | undefined,
  nodeId: string | null | undefined
): OrgHierarchyNode | null {
  if (!root || !nodeId) {
    return null;
  }
  if (root.node_id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findOrgHierarchyNodeById(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/** Coleta todos os nós de um tipo na árvore hierárquica. */
export function collectOrgHierarchyNodesByType(
  root: OrgHierarchyNode | null | undefined,
  nodeType: OrgHierarchyNodeType
): OrgHierarchyNode[] {
  if (!root) {
    return [];
  }
  const out: OrgHierarchyNode[] = [];
  const walk = (node: OrgHierarchyNode): void => {
    if (isOrgHierarchyNodeType(node, nodeType)) {
      out.push(node);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(root);
  return out;
}

export function formatOrgHierarchyNodeMtdCell(
  node: OrgHierarchyNode,
  column: OrgHighlightMtdColumn
): string {
  const value = node.mtd?.[column.key] as number | undefined | null;
  return formatHighlightMtdMetricValue(value, column.format);
}

/** Percentual de pontos entregues em relação à meta MTD (0–∞). */
export function computeOrgPointsGoalPct(mtd: OrgMetricsWindow | undefined | null): number | null {
  const points = mtd?.points_delivered;
  const goal = mtd?.goal_points;
  if (
    points == null ||
    goal == null ||
    !Number.isFinite(points) ||
    !Number.isFinite(goal) ||
    goal <= 0
  ) {
    return null;
  }
  return (points / goal) * 100;
}

/** Percentual de entregas concluídas em relação à meta do mês cheio (0–∞). */
export function computeOrgDeliveriesGoalPct(mtd: OrgMetricsWindow | undefined | null): number | null {
  const finished = mtd?.finished;
  const goal = mtd?.goal_deliveries;
  if (
    finished == null ||
    goal == null ||
    !Number.isFinite(finished) ||
    !Number.isFinite(goal) ||
    goal <= 0
  ) {
    return null;
  }
  return (finished / goal) * 100;
}

export function formatOrgPointsGoalPct(mtd: OrgMetricsWindow | undefined | null): string | null {
  const pct = computeOrgPointsGoalPct(mtd);
  if (pct == null) {
    return null;
  }
  return `${Math.round(pct)}%`;
}

export function getOrgPointsGoalTone(
  pct: number | null | undefined
): 'positive' | 'negative' | 'neutral' {
  if (pct == null || !Number.isFinite(pct)) {
    return 'neutral';
  }
  if (pct >= 100) {
    return 'positive';
  }
  if (pct < 70) {
    return 'negative';
  }
  return 'neutral';
}

/** Rótulo curto da área (segmentação) para exibição no ranking de diretorias. */
export function formatOrgHierarchyAreaShortLabel(label: string): string {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!normalized) {
    return '—';
  }
  if (/departamento\s*pessoal/.test(normalized) || /^dp\b/.test(normalized) || normalized === 'pessoal') {
    return 'Pessoal';
  }
  if (/contabil/.test(normalized)) {
    return 'Contábil';
  }
  if (/legaliza/.test(normalized)) {
    return 'Legalização';
  }
  if (/simples\s*nacional/.test(normalized)) {
    return 'Simples Nacional';
  }
  if (/fiscal/.test(normalized)) {
    return 'Fiscal';
  }
  return label.trim();
}

export type OrgHierarchyAreaKey = 'pessoal' | 'fiscal' | 'contabil' | 'legalizacao' | 'simples_nacional';

/** Resolve a chave da área a partir do rótulo (curto ou completo). */
export function resolveOrgHierarchyAreaKey(label: string): OrgHierarchyAreaKey | null {
  const short = formatOrgHierarchyAreaShortLabel(label);
  switch (short) {
    case 'Pessoal':
      return 'pessoal';
    case 'Fiscal':
      return 'fiscal';
    case 'Contábil':
      return 'contabil';
    case 'Legalização':
      return 'legalizacao';
    case 'Simples Nacional':
      return 'simples_nacional';
    default:
      return null;
  }
}

/** Classe CSS para colorir o rótulo da área. */
export function getOrgHierarchyAreaLabelClass(label: string): string | null {
  const key = resolveOrgHierarchyAreaKey(label);
  if (!key) {
    return null;
  }
  return `org-area-label--${key.replace(/_/g, '-')}`;
}

export function resolveDirectorateAreaLabel(
  root: OrgHierarchyNode | null | undefined,
  diretoria: OrgHierarchyNode
): string | null {
  if (!root) {
    return null;
  }

  let areaLabel: string | null = null;

  const walk = (node: OrgHierarchyNode, segmentacao?: OrgHierarchyNode): boolean => {
    const normalizedType = normalizeOrgHierarchyNodeType(node.node_type);
    const currentSegmentacao = normalizedType === 'segmentacao' ? node : segmentacao;

    if (node.node_id === diretoria.node_id && normalizedType === 'diretoria') {
      areaLabel = currentSegmentacao?.label?.trim() ?? null;
      return true;
    }

    for (const child of node.children ?? []) {
      if (walk(child, currentSegmentacao)) {
        return true;
      }
    }
    return false;
  };

  walk(root);
  return areaLabel ? formatOrgHierarchyAreaShortLabel(areaLabel) : null;
}

export function getDirectorateRankingLabel(
  root: OrgHierarchyNode | null | undefined,
  diretoria: OrgHierarchyNode
): string {
  const name = (diretoria.label ?? '').trim() || '—';
  const area = resolveDirectorateAreaLabel(root, diretoria);
  return area ? `${area} > ${name}` : name;
}

function computeHighlightScore(
  node: OrgHierarchyNode,
  maxFinished: number,
  maxClients: number
): number {
  const finished = readMtdNumber(node, 'finished');
  const clients = readMtdNumber(node, 'clients_served');
  const onTimePct = readMtdNumber(node, 'on_time_pct');

  const onTimeNorm = Math.max(0, Math.min(1, onTimePct / 100));
  const finishedNorm = maxFinished > 0 ? Math.max(0, Math.min(1, finished / maxFinished)) : 0;
  const clientsNorm = maxClients > 0 ? Math.max(0, Math.min(1, clients / maxClients)) : 0;

  return onTimeNorm * 0.55 + finishedNorm * 0.25 + clientsNorm * 0.2;
}

function deriveHighlightsForTab(
  root: OrgHierarchyNode,
  tab: OrgHierarchyHighlightViewTab
): DerivedOrgHierarchyHighlights {
  const nodes = collectNodesByType(root, tab).filter(n => (n.label ?? '').trim().length > 0);
  if (!nodes.length) {
    return { destaque: [], atencao: [] };
  }

  const maxFinished = Math.max(1, ...nodes.map(n => readMtdNumber(n, 'finished')));
  const maxClients = Math.max(1, ...nodes.map(n => readMtdNumber(n, 'clients_served')));

  // Regras mínimas para evitar listas dominadas por amostras pequenas
  const minFinished = tab === 'gerencia' ? 5 : 3;

  const scored = nodes.map(node => ({
    node,
    finished: readMtdNumber(node, 'finished'),
    clients: readMtdNumber(node, 'clients_served'),
    onTimePct: readMtdNumber(node, 'on_time_pct'),
    score: computeHighlightScore(node, maxFinished, maxClients)
  }));

  const eligible = scored.filter(row => row.finished >= minFinished);
  if (!eligible.length) {
    return { destaque: [], atencao: [] };
  }

  const destaqueRows = [...eligible].sort((a, b) => b.score - a.score).slice(0, 10);
  const destaqueIds = new Set(destaqueRows.map(r => r.node.node_id));
  const destaque = destaqueRows.map(row =>
    mapNodeToHighlightItem(tab, row.node, row.onTimePct, row.finished, row.clients)
  );

  // Atenção é o "fundo do ranking" por prazo, mas sem repetir quem já está em destaque.
  const atencao = [...eligible]
    .filter(row => !destaqueIds.has(row.node.node_id))
    .sort((a, b) => a.onTimePct - b.onTimePct || b.finished - a.finished)
    .slice(0, 10)
    .map(row => mapNodeToHighlightItem(tab, row.node, row.onTimePct, row.finished, row.clients));

  return { destaque, atencao };
}

export function getDerivedHighlightsForTab(
  root: OrgHierarchyNode | null | undefined,
  tab: OrgHierarchyHighlightViewTab
): DerivedOrgHierarchyHighlights {
  if (!root) {
    return { destaque: [], atencao: [] };
  }
  const cached = derivedHighlightsCache.get(root) ?? {};
  const hit = cached[tab];
  if (hit) {
    return hit;
  }
  const computed = deriveHighlightsForTab(root, tab);
  cached[tab] = computed;
  derivedHighlightsCache.set(root, cached);
  return computed;
}

export function filterHighlightsByViewTab(
  items: OrgHierarchyHighlightItem[] | undefined,
  tab: OrgHierarchyHighlightViewTab,
  root?: OrgHierarchyNode | null
): OrgHierarchyHighlightItem[] {
  return (items ?? []).filter(item => inferHighlightNodeType(item, root) === tab);
}

export function countHighlightsByViewTab(
  destaque: OrgHierarchyHighlightItem[] | undefined,
  atencao: OrgHierarchyHighlightItem[] | undefined,
  tab: OrgHierarchyHighlightViewTab,
  root?: OrgHierarchyNode | null
): number {
  return (
    filterHighlightsByViewTab(destaque, tab, root).length +
    filterHighlightsByViewTab(atencao, tab, root).length
  );
}

export function highlightsViewTabHasItems(
  destaque: OrgHierarchyHighlightItem[] | undefined,
  atencao: OrgHierarchyHighlightItem[] | undefined,
  tab: OrgHierarchyHighlightViewTab,
  root?: OrgHierarchyNode | null
): boolean {
  return countHighlightsByViewTab(destaque, atencao, tab, root) > 0;
}

/** Indica se existem nós do nível na árvore (habilita a aba mesmo sem destaques derivados). */
export function highlightViewTabHasNodes(
  root: OrgHierarchyNode | null | undefined,
  tab: OrgHierarchyHighlightViewTab
): boolean {
  return collectOrgHierarchyNodesByType(root, tab).some(n => (n.label ?? '').trim().length > 0);
}

/** Time do jogador (supervisão) em destaques/atenção. */
export function getHighlightTeamLabel(
  item: OrgHierarchyHighlightItem,
  root?: OrgHierarchyNode | null
): string {
  const direct = readHighlightTextField(item, [
    'team_name',
    'team_label',
    'supervisao_label',
    'supervisao_name',
    'time'
  ]);
  if (direct) {
    return direct;
  }
  return resolveHighlightContextFromTree(item, root)?.teamLabel || '—';
}

/** Gerência do jogador em destaques/atenção. */
export function getHighlightGerenciaLabel(
  item: OrgHierarchyHighlightItem,
  root?: OrgHierarchyNode | null
): string {
  const direct = readHighlightTextField(item, [
    'gerencia_label',
    'gerencia_name',
    'gerente_name',
    'gerencia'
  ]);
  if (direct) {
    return direct;
  }
  return resolveHighlightContextFromTree(item, root)?.gerenciaLabel || '—';
}

/** Diretoria do destaque em nível de gerência. */
export function getHighlightDiretoriaLabel(
  item: OrgHierarchyHighlightItem,
  root?: OrgHierarchyNode | null
): string {
  const direct = readHighlightTextField(item, [
    'diretoria_label',
    'diretoria_name',
    'diretor_name',
    'diretoria'
  ]);
  if (direct) {
    return direct;
  }
  return resolveHighlightContextFromTree(item, root)?.diretoriaLabel || '—';
}

export function highlightHasContext(
  item: OrgHierarchyHighlightItem,
  root?: OrgHierarchyNode | null
): boolean {
  return getHighlightTeamLabel(item, root) !== '—' || getHighlightGerenciaLabel(item, root) !== '—';
}

export function highlightHasContextForViewTab(
  item: OrgHierarchyHighlightItem,
  tab: OrgHierarchyHighlightViewTab,
  root?: OrgHierarchyNode | null
): boolean {
  switch (tab) {
    case 'supervisao':
      return getHighlightGerenciaLabel(item, root) !== '—';
    case 'gerencia':
      return getHighlightDiretoriaLabel(item, root) !== '—';
    default:
      return highlightHasContext(item, root);
  }
}
