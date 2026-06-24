import type {
  OrgHierarchyCompare,
  OrgHierarchyKpiDetailKey,
  OrgHierarchyNode,
  OrgMetricsMonthlyPoint,
  OrgMetricsWindow,
  OrganizationHierarchyReportParams
} from '@model/game4u-api.model';
import {
  formatOrgHierarchyComparePct,
  formatHighlightMtdMetricValue,
  getOrgHierarchyCompareTone
} from './org-hierarchy-report.mapper';

export interface OrgKpiDrilldownCompareContext {
  mtd: OrgMetricsWindow;
  prev_mtd: OrgMetricsWindow;
  prev_full: OrgMetricsWindow;
  compare: OrgHierarchyCompare;
  mtd_monthly_series?: OrgMetricsMonthlyPoint[];
}

export interface OrgKpiCompareSnapshot {
  key: string;
  label: string;
  windowLabel: string;
  value: number | null;
  valueLabel: string;
  isCurrent?: boolean;
}

export interface OrgKpiCompareDelta {
  key: string;
  label: string;
  delta: number | null;
  deltaLabel: string;
  deltaPct: number | null;
  deltaPctLabel: string;
  tone: 'positive' | 'negative' | 'neutral';
  hint: string;
}

export interface OrgKpiMonthlyHistoryRow {
  cacheMonth: string;
  monthLabel: string;
  mtdValue: number | null;
  mtdValueLabel: string;
  fullValue: number | null;
  fullValueLabel: string;
}

/** @deprecated Prefer {@link OrgKpiMonthlyHistoryRow}. */
export type OrgKpiMonthlyMtdRow = OrgKpiMonthlyHistoryRow;

export interface OrgKpiComparePanel {
  currentSnapshot: OrgKpiCompareSnapshot;
  prevMtdSnapshot: OrgKpiCompareSnapshot;
  prevFullSnapshot: OrgKpiCompareSnapshot;
  vsPrevMtd: OrgKpiCompareDelta;
  vsPrevFull: OrgKpiCompareDelta;
  assessmentLabel: string;
  assessmentTone: 'positive' | 'negative' | 'neutral';
  monthlyHistory: OrgKpiMonthlyHistoryRow[];
}

const HIGHER_IS_BETTER_KPIS = new Set<OrgHierarchyKpiDetailKey>([
  'on_time_pct',
  'clients_served',
  'finished',
  'points_delivered',
  'clients_acessorias_risco_de_churn',
  'clients_acessorias_onboarding',
  'clients_acessorias_g4'
]);

export function buildOrgKpiDrilldownCompareContext(
  node: OrgHierarchyNode
): OrgKpiDrilldownCompareContext | null {
  if (!node?.mtd) {
    return null;
  }
  return {
    mtd: node.mtd,
    prev_mtd: node.prev_mtd ?? {},
    prev_full: node.prev_full ?? {},
    compare: node.compare ?? {},
    mtd_monthly_series: normalizeOrgMetricsMonthlySeries(node.mtd_monthly_series)
  };
}

function pickMonthlyPointNumber(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function pickMonthlyPointString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

/** Normaliza pontos de `mtd_monthly_series` (snake/camel + aliases legados). */
export function normalizeOrgMetricsMonthlyPoint(raw: unknown): OrgMetricsMonthlyPoint | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const cache_month = pickMonthlyPointString(o, ['cache_month', 'cacheMonth']);
  if (!cache_month) {
    return null;
  }

  return {
    cache_month,
    mtd_finished: pickMonthlyPointNumber(o, ['mtd_finished', 'mtdFinished', 'finished']) ?? 0,
    mtd_points_delivered:
      pickMonthlyPointNumber(o, ['mtd_points_delivered', 'mtdPointsDelivered', 'points_delivered']) ?? 0,
    mtd_goal_points: pickMonthlyPointNumber(o, ['mtd_goal_points', 'mtdGoalPoints', 'goal_points']) ?? 0,
    mtd_expected_points_to_date: pickMonthlyPointNumber(o, [
      'mtd_expected_points_to_date',
      'mtdExpectedPointsToDate',
      'expected_points_to_date'
    ]),
    mtd_goal_deliveries: pickMonthlyPointNumber(o, ['mtd_goal_deliveries', 'mtdGoalDeliveries', 'goal_deliveries']),
    mtd_expected_deliveries_to_date: pickMonthlyPointNumber(o, [
      'mtd_expected_deliveries_to_date',
      'mtdExpectedDeliveriesToDate',
      'expected_deliveries_to_date'
    ]),
    mtd_pending_open: pickMonthlyPointNumber(o, ['mtd_pending_open', 'mtdPendingOpen', 'pending_open']) ?? 0,
    mtd_multa_risk: pickMonthlyPointNumber(o, ['mtd_multa_risk', 'mtdMultaRisk', 'multa_risk']) ?? 0,
    mtd_multa_incurred: pickMonthlyPointNumber(o, ['mtd_multa_incurred', 'mtdMultaIncurred', 'multa_incurred']) ?? 0,
    mtd_on_time_pct: pickMonthlyPointNumber(o, ['mtd_on_time_pct', 'mtdOnTimePct', 'on_time_pct']) ?? 0,
    mtd_clients_served: pickMonthlyPointNumber(o, ['mtd_clients_served', 'mtdClientsServed', 'clients_served']) ?? 0,
    full_finished: pickMonthlyPointNumber(o, ['full_finished', 'fullFinished']),
    full_points_delivered: pickMonthlyPointNumber(o, ['full_points_delivered', 'fullPointsDelivered']),
    full_on_time_pct: pickMonthlyPointNumber(o, ['full_on_time_pct', 'fullOnTimePct']),
    full_clients_served: pickMonthlyPointNumber(o, ['full_clients_served', 'fullClientsServed']),
    full_pending_open: pickMonthlyPointNumber(o, ['full_pending_open', 'fullPendingOpen']),
    full_multa_risk: pickMonthlyPointNumber(o, ['full_multa_risk', 'fullMultaRisk']),
    full_multa_incurred: pickMonthlyPointNumber(o, ['full_multa_incurred', 'fullMultaIncurred'])
  };
}

export function normalizeOrgMetricsMonthlySeries(
  raw: OrgMetricsMonthlyPoint[] | undefined | null
): OrgMetricsMonthlyPoint[] | undefined {
  if (!raw?.length) {
    return undefined;
  }
  const normalized = raw
    .map(point => normalizeOrgMetricsMonthlyPoint(point))
    .filter((point): point is OrgMetricsMonthlyPoint => point != null);
  return normalized.length ? normalized : undefined;
}

function monthKeyFromCacheMonth(cacheMonth: string | undefined | null): string {
  return (cacheMonth ?? '').trim().slice(0, 7);
}

function isClosedHistoryMonth(pointMonth: string, refCacheMonth: string | null | undefined): boolean {
  const refKey = monthKeyFromCacheMonth(refCacheMonth);
  const pointKey = monthKeyFromCacheMonth(pointMonth);
  if (!refKey || !pointKey) {
    return false;
  }
  return pointKey < refKey;
}

export function getOrgMetricsKpiValue(
  window: OrgMetricsWindow | undefined | null,
  kpi: OrgHierarchyKpiDetailKey
): number | null {
  if (!window) {
    return null;
  }
  const raw = window[kpi as keyof OrgMetricsWindow];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null;
  }
  return raw;
}

function kpiFormat(kpi: OrgHierarchyKpiDetailKey): 'pct' | 'number' {
  return kpi === 'on_time_pct' ? 'pct' : 'number';
}

export function formatOrgKpiCompareValue(
  kpi: OrgHierarchyKpiDetailKey,
  value: number | null | undefined
): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return formatHighlightMtdMetricValue(value, kpiFormat(kpi));
}

function formatReportDate(value: string | undefined | null): string {
  if (!value) {
    return '—';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleDateString('pt-BR');
}

function formatMonthLabel(value: string | undefined | null): string {
  if (!value) {
    return '—';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value.slice(0, 7);
  }
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function windowLabel(
  params: OrganizationHierarchyReportParams | null | undefined,
  kind: 'mtd' | 'prev_mtd' | 'prev_full'
): string {
  if (!params) {
    return kind === 'prev_full' ? 'Mês anterior (fechado)' : 'Janela MTD';
  }
  if (kind === 'mtd') {
    return `${formatReportDate(params.mtd_start)} – ${formatReportDate(params.mtd_end)}`;
  }
  if (kind === 'prev_mtd') {
    return `${formatReportDate(params.prev_mtd_start)} – ${formatReportDate(params.prev_mtd_end)}`;
  }
  return `Mês fechado · ${formatMonthLabel(params.prev_month)}`;
}

function computeDelta(current: number | null, previous: number | null): {
  delta: number | null;
  deltaPct: number | null;
} {
  if (current == null || previous == null) {
    return { delta: null, deltaPct: null };
  }
  const delta = current - previous;
  const deltaPct = previous !== 0 ? (delta / previous) * 100 : null;
  return { delta, deltaPct };
}

function formatDeltaAbs(kpi: OrgHierarchyKpiDetailKey, delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) {
    return '—';
  }
  const sign = delta > 0 ? '+' : '';
  if (kpi === 'on_time_pct') {
    return `${sign}${delta.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
  }
  return `${sign}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function deltaTone(
  kpi: OrgHierarchyKpiDetailKey,
  delta: number | null,
  deltaPct: number | null
): 'positive' | 'negative' | 'neutral' {
  const pct = deltaPct ?? (delta != null && delta !== 0 ? delta : null);
  const tone = getOrgHierarchyCompareTone(pct);
  if (!HIGHER_IS_BETTER_KPIS.has(kpi)) {
    if (tone === 'positive') {
      return 'negative';
    }
    if (tone === 'negative') {
      return 'positive';
    }
  }
  return tone;
}

function pickCompareRecordDelta(
  compare: OrgHierarchyCompare,
  recordKey: 'prev_mtd' | 'prev_full',
  kpi: OrgHierarchyKpiDetailKey
): number | null {
  const record = compare[recordKey];
  if (!record) {
    return null;
  }
  const raw = record[kpi];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null;
  }
  return raw;
}

function buildDelta(
  kpi: OrgHierarchyKpiDetailKey,
  current: number | null,
  previous: number | null,
  compare: OrgHierarchyCompare,
  recordKey: 'prev_mtd' | 'prev_full',
  label: string,
  previousLabel: string
): OrgKpiCompareDelta {
  const recordDelta = pickCompareRecordDelta(compare, recordKey, kpi);
  const { delta: computedDelta, deltaPct: computedPct } = computeDelta(current, previous);
  const delta = recordDelta ?? computedDelta;
  const deltaPct =
    recordKey === 'prev_mtd' && kpi === 'points_delivered' && compare.vs_prev_mtd_points_pct != null
      ? compare.vs_prev_mtd_points_pct
      : recordKey === 'prev_full' && kpi === 'points_delivered' && compare.vs_prev_full_points_pct != null
        ? compare.vs_prev_full_points_pct
        : computedPct;

  const tone = deltaTone(kpi, delta, deltaPct);
  let hint = 'Sem variação em relação ao período anterior';
  if (delta != null && delta !== 0) {
    hint =
      tone === 'positive'
        ? `Melhor que ${previousLabel.toLowerCase()}`
        : tone === 'negative'
          ? `Pior que ${previousLabel.toLowerCase()}`
          : `Em linha com ${previousLabel.toLowerCase()}`;
  }

  return {
    key: recordKey,
    label,
    delta,
    deltaLabel: formatDeltaAbs(kpi, delta),
    deltaPct,
    deltaPctLabel: formatOrgHierarchyComparePct(deltaPct),
    tone,
    hint
  };
}

function kpiToMonthlySeriesField(
  kpi: OrgHierarchyKpiDetailKey
): keyof OrgMetricsMonthlyPoint | null {
  switch (kpi) {
    case 'points_delivered':
      return 'mtd_points_delivered';
    case 'finished':
      return 'mtd_finished';
    case 'on_time_pct':
      return 'mtd_on_time_pct';
    case 'clients_served':
      return 'mtd_clients_served';
    case 'pending_open':
      return 'mtd_pending_open';
    case 'multa_risk':
      return 'mtd_multa_risk';
    case 'multa_incurred':
      return 'mtd_multa_incurred';
    default:
      return null;
  }
}

function kpiToMonthlySeriesFullField(
  kpi: OrgHierarchyKpiDetailKey
): keyof OrgMetricsMonthlyPoint | null {
  switch (kpi) {
    case 'points_delivered':
      return 'full_points_delivered';
    case 'finished':
      return 'full_finished';
    case 'on_time_pct':
      return 'full_on_time_pct';
    case 'clients_served':
      return 'full_clients_served';
    case 'pending_open':
      return 'full_pending_open';
    case 'multa_risk':
      return 'full_multa_risk';
    case 'multa_incurred':
      return 'full_multa_incurred';
    default:
      return null;
  }
}

function readMonthlyPointNumber(
  point: OrgMetricsMonthlyPoint,
  field: keyof OrgMetricsMonthlyPoint | null
): number | null {
  if (!field) {
    return null;
  }
  const raw = point[field];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function buildMonthlyHistory(
  kpi: OrgHierarchyKpiDetailKey,
  series: OrgMetricsMonthlyPoint[] | undefined,
  refCacheMonth?: string | null
): OrgKpiMonthlyHistoryRow[] {
  const mtdField = kpiToMonthlySeriesField(kpi);
  const fullField = kpiToMonthlySeriesFullField(kpi);
  if (!mtdField || !series?.length) {
    return [];
  }
  return [...series]
    .sort((a, b) => String(a.cache_month).localeCompare(String(b.cache_month)))
    .map(point => {
      let mtdValue = readMonthlyPointNumber(point, mtdField);
      let fullValue = readMonthlyPointNumber(point, fullField);

      // Meses fechados: quando a API só envia um total em mtd_*, exibir em "Mês fechado".
      if (fullValue == null && mtdValue != null && isClosedHistoryMonth(point.cache_month, refCacheMonth)) {
        fullValue = mtdValue;
        mtdValue = null;
      }

      return {
        cacheMonth: monthKeyFromCacheMonth(point.cache_month),
        monthLabel: formatMonthLabel(point.cache_month),
        mtdValue,
        mtdValueLabel: formatOrgKpiCompareValue(kpi, mtdValue),
        fullValue,
        fullValueLabel: formatOrgKpiCompareValue(kpi, fullValue)
      };
    });
}

export function buildOrgKpiMonthlyHistoryChartDatasets(
  kpi: OrgHierarchyKpiDetailKey,
  history: OrgKpiMonthlyHistoryRow[]
): {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    borderWidth: number;
  }>;
  showLegend: boolean;
} {
  const labels = history.map(row => row.monthLabel);
  const hasFull = history.some(row => row.fullValue != null);
  const datasets = [
    {
      label: 'MTD (mesmo recorte)',
      data: history.map(row => row.mtdValue ?? 0),
      borderColor: 'rgba(59, 130, 246, 1)',
      backgroundColor: 'rgba(59, 130, 246, 0.35)',
      borderWidth: 1
    }
  ];

  if (hasFull) {
    datasets.push({
      label: 'Mês fechado',
      data: history.map(row => row.fullValue ?? 0),
      borderColor: 'rgba(148, 163, 184, 0.95)',
      backgroundColor: 'rgba(148, 163, 184, 0.35)',
      borderWidth: 1
    });
  }

  return { labels, datasets, showLegend: hasFull };
}

function buildMonthlyHistoryFromKpiDetail(
  kpi: OrgHierarchyKpiDetailKey,
  history: Array<{ month_label: string; value: number | null; full_value?: number | null; cache_month?: string }> | undefined,
  refCacheMonth?: string | null
): OrgKpiMonthlyHistoryRow[] {
  if (!history?.length) {
    return [];
  }
  return history.map(item => {
    const cacheMonth =
      monthKeyFromCacheMonth(item.cache_month) || monthKeyFromCacheMonth(item.month_label);
    let mtdValue = typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : null;
    let fullValue =
      typeof item.full_value === 'number' && Number.isFinite(item.full_value) ? item.full_value : null;

    if (fullValue == null && mtdValue != null && isClosedHistoryMonth(cacheMonth, refCacheMonth)) {
      fullValue = mtdValue;
      mtdValue = null;
    }

    return {
      cacheMonth,
      monthLabel: item.month_label,
      mtdValue,
      mtdValueLabel: formatOrgKpiCompareValue(kpi, mtdValue),
      fullValue,
      fullValueLabel: formatOrgKpiCompareValue(kpi, fullValue)
    };
  });
}

function mergeOrgKpiMonthlyHistoryRows(
  kpi: OrgHierarchyKpiDetailKey,
  fromSeries: OrgKpiMonthlyHistoryRow[],
  fromDetail: OrgKpiMonthlyHistoryRow[]
): OrgKpiMonthlyHistoryRow[] {
  if (!fromDetail.length) {
    return fromSeries;
  }
  if (!fromSeries.length) {
    return fromDetail;
  }

  const detailByMonth = new Map(fromDetail.map(row => [row.cacheMonth, row]));
  const seriesByMonth = new Map(fromSeries.map(row => [row.cacheMonth, row]));
  const monthKeys = [...new Set([...fromSeries, ...fromDetail].map(row => row.cacheMonth))]
    .filter(Boolean)
    .sort();

  return monthKeys.map(cacheMonth => {
    const series = seriesByMonth.get(cacheMonth);
    const detail = detailByMonth.get(cacheMonth);
    if (!series) {
      return detail!;
    }
    if (!detail) {
      return series;
    }

    const mtdValue = series.mtdValue ?? detail.mtdValue;
    const fullValue = detail.fullValue ?? series.fullValue;

    return {
      cacheMonth,
      monthLabel: series.monthLabel || detail.monthLabel,
      mtdValue,
      mtdValueLabel: formatOrgKpiCompareValue(kpi, mtdValue),
      fullValue,
      fullValueLabel: formatOrgKpiCompareValue(kpi, fullValue)
    };
  });
}

export function resolveOrgKpiMonthlyHistoryForChart(
  kpi: OrgHierarchyKpiDetailKey,
  context: OrgKpiDrilldownCompareContext | null | undefined,
  kpiDetailHistory: Array<{
    month_label: string;
    value: number | null;
    full_value?: number | null;
    cache_month?: string;
  }> | undefined,
  params?: OrganizationHierarchyReportParams | null | undefined
): OrgKpiMonthlyHistoryRow[] {
  const refCacheMonth = params?.cache_month ?? null;
  const fromSeries = buildMonthlyHistory(kpi, context?.mtd_monthly_series, refCacheMonth);
  const fromDetail = buildMonthlyHistoryFromKpiDetail(kpi, kpiDetailHistory, refCacheMonth);
  return mergeOrgKpiMonthlyHistoryRows(kpi, fromSeries, fromDetail);
}

export function buildOrgKpiComparePanel(
  kpi: OrgHierarchyKpiDetailKey,
  context: OrgKpiDrilldownCompareContext | null | undefined,
  params: OrganizationHierarchyReportParams | null | undefined
): OrgKpiComparePanel | null {
  if (!context?.mtd) {
    return null;
  }

  const currentValue = getOrgMetricsKpiValue(context.mtd, kpi);
  const prevMtdValue = getOrgMetricsKpiValue(context.prev_mtd, kpi);
  const prevFullValue = getOrgMetricsKpiValue(context.prev_full, kpi);

  const currentSnapshot: OrgKpiCompareSnapshot = {
    key: 'current_mtd',
    label: 'MTD atual',
    windowLabel: windowLabel(params, 'mtd'),
    value: currentValue,
    valueLabel: formatOrgKpiCompareValue(kpi, currentValue),
    isCurrent: true
  };

  const prevMtdSnapshot: OrgKpiCompareSnapshot = {
    key: 'prev_mtd',
    label: 'MTD mês anterior',
    windowLabel: windowLabel(params, 'prev_mtd'),
    value: prevMtdValue,
    valueLabel: formatOrgKpiCompareValue(kpi, prevMtdValue)
  };

  const prevFullSnapshot: OrgKpiCompareSnapshot = {
    key: 'prev_full',
    label: 'Mês anterior (fechado)',
    windowLabel: windowLabel(params, 'prev_full'),
    value: prevFullValue,
    valueLabel: formatOrgKpiCompareValue(kpi, prevFullValue)
  };

  const vsPrevMtd = buildDelta(
    kpi,
    currentValue,
    prevMtdValue,
    context.compare,
    'prev_mtd',
    'vs MTD anterior',
    'MTD mês anterior'
  );

  const vsPrevFull = buildDelta(
    kpi,
    currentValue,
    prevFullValue,
    context.compare,
    'prev_full',
    'vs mês fechado',
    'mês anterior fechado'
  );

  let assessmentLabel = 'Comparativo indisponível para este KPI';
  let assessmentTone: 'positive' | 'negative' | 'neutral' = 'neutral';

  if (vsPrevMtd.deltaPct != null) {
    assessmentLabel = `${vsPrevMtd.deltaPctLabel} vs mesmo MTD do mês anterior`;
    assessmentTone = vsPrevMtd.tone;
    if (kpi === 'on_time_pct' && currentValue != null) {
      assessmentLabel += currentValue >= 90 ? ' · acima da meta de 90%' : ' · abaixo da meta de 90%';
    }
  } else if (currentValue != null) {
    assessmentLabel = `Valor atual: ${formatOrgKpiCompareValue(kpi, currentValue)}`;
  }

  return {
    currentSnapshot,
    prevMtdSnapshot,
    prevFullSnapshot,
    vsPrevMtd,
    vsPrevFull,
    assessmentLabel,
    assessmentTone,
    monthlyHistory: buildMonthlyHistory(kpi, context.mtd_monthly_series, params?.cache_month)
  };
}

const ORG_KPI_WINDOW_COMPARE_KEYS = new Set<OrgHierarchyKpiDetailKey>([
  'on_time_pct',
  'clients_served',
  'finished',
  'points_delivered',
  'pending_open',
  'near_due',
  'overdue_pending',
  'overdue_pending_justified',
  'overdue_pending_unjustified',
  'multa_risk',
  'multa_incurred',
  'clients_acessorias_risco_de_churn',
  'clients_acessorias_onboarding',
  'clients_acessorias_g4'
]);

export function supportsOrgKpiWindowCompare(kpi: OrgHierarchyKpiDetailKey): boolean {
  return ORG_KPI_WINDOW_COMPARE_KEYS.has(kpi);
}
