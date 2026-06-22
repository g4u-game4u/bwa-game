import { OrgHierarchyNode } from '@model/game4u-api.model';

export interface OrgPaceMetricCard {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
}

export interface OrgPaceGoalComparison {
  currentPace: number;
  requiredPace: number;
  currentPaceLabel: string;
  requiredPaceLabel: string;
  currentBarPct: number;
  requiredBarPct: number;
  paceRatioPct: number;
  paceRatioLabel: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
  statusLabel: string;
  statusHint: string;
  paceGapPerDay: number;
  paceGapPerDayLabel: string;
}

export function hasOrgPaceMetrics(node: OrgHierarchyNode | null | undefined): boolean {
  const mtd = node?.mtd;
  if (!mtd) {
    return false;
  }
  const goal = mtd.goal_points;
  const hasGoal = goal != null && Number.isFinite(goal) && goal > 0;
  const hasPace =
    mtd.pace_points_per_day != null &&
    mtd.required_pace_points_per_day != null &&
    Number.isFinite(mtd.pace_points_per_day) &&
    Number.isFinite(mtd.required_pace_points_per_day);
  return hasGoal && hasPace;
}

export function formatOrgPaceNumber(value: number | undefined | null, fractionDigits = 0): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
}

export function formatOrgPacePct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function orgPaceComparisonTone(
  ratioPct: number | null | undefined
): 'positive' | 'negative' | 'warning' | 'neutral' {
  if (ratioPct == null || !Number.isFinite(ratioPct)) {
    return 'neutral';
  }
  if (ratioPct >= 100) {
    return 'positive';
  }
  if (ratioPct >= 85) {
    return 'neutral';
  }
  if (ratioPct >= 60) {
    return 'warning';
  }
  return 'negative';
}

export function buildOrgPaceGoalComparison(
  node: OrgHierarchyNode | null | undefined
): OrgPaceGoalComparison | null {
  const mtd = node?.mtd;
  const current = mtd?.pace_points_per_day;
  const required = mtd?.required_pace_points_per_day;
  if (
    current == null ||
    required == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(required) ||
    required <= 0
  ) {
    return null;
  }

  const paceRatioPct = (current / required) * 100;
  const maxPace = Math.max(current, required, 1);
  const paceGapPerDay = current - required;
  const tone = orgPaceComparisonTone(paceRatioPct);

  let statusLabel: string;
  let statusHint: string;
  if (paceRatioPct >= 100) {
    statusLabel = 'No ritmo para bater a meta de pontos';
    const surplus = formatOrgPaceNumber(Math.abs(paceGapPerDay), 1);
    statusHint = `Ritmo atual supera o necessário em ${surplus} pts/dia`;
  } else {
    statusLabel = 'Abaixo do ritmo necessário para a meta';
    const deficit = formatOrgPaceNumber(Math.abs(paceGapPerDay), 1);
    statusHint = `Faltam ${deficit} pts/dia para alcançar o ritmo exigido até o fim do mês`;
  }

  const paceGapSign = paceGapPerDay >= 0 ? '+' : '';
  return {
    currentPace: current,
    requiredPace: required,
    currentPaceLabel: formatOrgPaceNumber(current, 1),
    requiredPaceLabel: formatOrgPaceNumber(required, 1),
    currentBarPct: (current / maxPace) * 100,
    requiredBarPct: (required / maxPace) * 100,
    paceRatioPct,
    paceRatioLabel: formatOrgPacePct(paceRatioPct),
    tone,
    statusLabel,
    statusHint,
    paceGapPerDay,
    paceGapPerDayLabel: `${paceGapSign}${formatOrgPaceNumber(paceGapPerDay, 1)} pts/dia`
  };
}

export function buildOrgPaceSupportingCards(
  node: OrgHierarchyNode | null | undefined
): OrgPaceMetricCard[] {
  if (!node?.mtd) {
    return [];
  }
  const mtd = node.mtd;
  const cards: OrgPaceMetricCard[] = [];

  if (mtd.goal_points != null) {
    cards.push({
      key: 'goal_points',
      label: 'Meta do mês',
      value: formatOrgPaceNumber(mtd.goal_points)
    });
  }

  if (mtd.points_delivered != null) {
    const goalPct =
      mtd.goal_points != null && mtd.goal_points > 0
        ? (mtd.points_delivered / mtd.goal_points) * 100
        : null;
    cards.push({
      key: 'points_delivered',
      label: 'Realizado (MTD)',
      value: formatOrgPaceNumber(mtd.points_delivered),
      hint: goalPct != null ? `${formatOrgPacePct(goalPct)} da meta do mês` : undefined,
      tone:
        goalPct != null
          ? goalPct >= 100
            ? 'positive'
            : goalPct >= 70
              ? 'neutral'
              : 'warning'
          : undefined
    });
  }

  if (mtd.projected_points_month_end != null && mtd.goal_points != null) {
    const projectedGap = mtd.projected_points_month_end - mtd.goal_points;
    cards.push({
      key: 'projected_points',
      label: 'Projeção fim do mês',
      value: formatOrgPaceNumber(mtd.projected_points_month_end),
      hint:
        projectedGap >= 0
          ? `Acima da meta em ${formatOrgPaceNumber(projectedGap)} pts`
          : `Abaixo da meta em ${formatOrgPaceNumber(Math.abs(projectedGap))} pts`,
      tone: projectedGap >= 0 ? 'positive' : 'warning'
    });
  }

  if (mtd.goal_points != null && mtd.points_delivered != null) {
    const remaining = mtd.goal_points - mtd.points_delivered;
    if (remaining > 0) {
      cards.push({
        key: 'points_remaining',
        label: 'Pontos restantes',
        value: formatOrgPaceNumber(remaining),
        hint:
          node.days_remaining_in_month != null
            ? `Em ${node.days_remaining_in_month} dias úteis/calendário restantes`
            : undefined,
        tone: 'warning'
      });
    }
  }

  return cards;
}

/** @deprecated Prefer {@link buildOrgPaceGoalComparison} */
export function buildOrgPaceMetricCards(node: OrgHierarchyNode | null | undefined): OrgPaceMetricCard[] {
  return buildOrgPaceSupportingCards(node);
}

export function orgPaceCalendarLabel(node: OrgHierarchyNode | null | undefined): string | null {
  const elapsed = node?.mtd_elapsed_days;
  const total = node?.month_day_count;
  const remaining = node?.days_remaining_in_month;
  if (elapsed == null || total == null) {
    return null;
  }
  const base = `Dia ${elapsed} de ${total} úteis/calendário MTD`;
  if (remaining != null) {
    return `${base} · ${remaining} dias restantes`;
  }
  return base;
}
