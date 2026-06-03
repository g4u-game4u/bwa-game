/** Escopo da consulta de insights (espelha futuro `GET /game/reports/dashboard/insights`). */
export interface DashboardInsightsQuery {
  month: Date;
  /** E-mail do jogador; omitir em visão consolidada de equipa. */
  email?: string;
  team_id?: string;
  isManagement?: boolean;
}

export interface DashboardInsightsRankedItem {
  key: string;
  label: string;
  count: number;
}

export interface DashboardInsightsWeekdayStat {
  /** 0 = domingo … 6 = sábado */
  index: number;
  label: string;
  shortLabel: string;
  count: number;
}

/**
 * Snapshot de insights do painel.
 * Hoje calculado no cliente a partir de `/game/reports/user-actions`;
 * no futuro o backend pode devolver o mesmo shape em `GET …/dashboard/insights`.
 */
export interface DashboardInsightsSnapshot {
  source: 'client' | 'server';
  computedAt: string;
  /** Quantos dias à frente contam como «próximo do vencimento». */
  dueSoonDays: number;
  pendingTasks: number;
  finishedTasks: number;
  overduePendingTasks: number;
  dueSoonTasks: number;
  fineRiskTasks: number;
  fineRiskDeliveries: number;
  onTimeFinishedTasks: number;
  lateFinishedTasks: number;
  topActivity: DashboardInsightsRankedItem | null;
  topActivities: DashboardInsightsRankedItem[];
  mostProductiveWeekday: DashboardInsightsWeekdayStat | null;
  weekdayDistribution: DashboardInsightsWeekdayStat[];
}

export const DASHBOARD_INSIGHTS_DUE_SOON_DAYS = 3;

export const DASHBOARD_INSIGHTS_WEEKDAY_LABELS: readonly { label: string; shortLabel: string }[] = [
  { label: 'Domingo', shortLabel: 'Dom' },
  { label: 'Segunda-feira', shortLabel: 'Seg' },
  { label: 'Terça-feira', shortLabel: 'Ter' },
  { label: 'Quarta-feira', shortLabel: 'Qua' },
  { label: 'Quinta-feira', shortLabel: 'Qui' },
  { label: 'Sexta-feira', shortLabel: 'Sex' },
  { label: 'Sábado', shortLabel: 'Sáb' }
];
