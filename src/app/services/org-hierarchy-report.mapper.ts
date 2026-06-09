import {
  OrgHierarchyFinishedByDow,
  OrgHierarchyNode,
  OrgHierarchyNodeType,
  OrgMetricsWindow
} from '@model/game4u-api.model';

export type OrgHierarchyRankingSortBy = 'balance_score' | 'points_delivered';

export interface OrgHierarchyWeekdayStat {
  dow: number;
  label: string;
  shortLabel: string;
  finishedCount: number;
  pointsTotal: number;
}

const NODE_TYPE_LABELS: Record<OrgHierarchyNodeType, string> = {
  organization: 'Organização',
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

export function sortOrgHierarchyChildren(
  nodes: OrgHierarchyNode[] | undefined,
  sortBy: OrgHierarchyRankingSortBy = 'balance_score'
): OrgHierarchyNode[] {
  if (!nodes?.length) {
    return [];
  }
  const copy = [...nodes];
  copy.sort((a, b) => {
    if (sortBy === 'balance_score') {
      const scoreA = a.balance_score ?? -Infinity;
      const scoreB = b.balance_score ?? -Infinity;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
    }
    const ptsA = a.mtd?.points_delivered ?? 0;
    const ptsB = b.mtd?.points_delivered ?? 0;
    return ptsB - ptsA;
  });
  return copy;
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

export function formatOrgHierarchyComparePct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
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

export interface OrgClientClassificationTier {
  level: number;
  label: string;
  icon: string;
  count: number;
}

/** Classificação portal: 1=Stone … 5=Diamante (`clients_classificacao_*` no MTD). */
export const ORG_CLIENT_CLASSIFICATION_LABELS: Record<number, string> = {
  1: 'Stone',
  2: 'Bronze',
  3: 'Prata',
  4: 'Ouro',
  5: 'Diamante'
};

export const ORG_CLIENT_CLASSIFICATION_ICONS: Record<number, string> = {
  1: 'ri-shield-line',
  2: 'ri-medal-line',
  3: 'ri-award-line',
  4: 'ri-trophy-line',
  5: 'ri-vip-diamond-fill'
};

export function mapClientClassificationTiers(
  mtd: OrgMetricsWindow | undefined | null
): OrgClientClassificationTier[] {
  return ([1, 2, 3, 4, 5] as const).map(level => ({
    level,
    label: ORG_CLIENT_CLASSIFICATION_LABELS[level],
    icon: ORG_CLIENT_CLASSIFICATION_ICONS[level],
    count: readClientClassificationCount(mtd, level)
  }));
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
