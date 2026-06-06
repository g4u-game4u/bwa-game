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
/** Público-alvo das recomendações contextuais entre alertas e produtividade. */
export type DashboardInsightsAudience = 'player' | 'supervisor' | 'gerente' | 'diretor' | 'c_level';

export type DashboardInsightPresetTone = 'urgent' | 'warning' | 'success' | 'info';

/** Foco ao abrir a lista de entregas a partir de um card de alerta nos insights. */
export type DashboardInsightsAlertFocus = 'fine-risk' | 'overdue-pending' | 'due-soon';

export interface DashboardInsightPreset {
  tone: DashboardInsightPresetTone;
  title: string;
  message: string;
}

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
  /** Entregas com atraso justificado (`extra.status_api` com «justif»); fora de no prazo / fora do prazo. */
  justifiedTasks: number;
  topActivity: DashboardInsightsRankedItem | null;
  topActivities: DashboardInsightsRankedItem[];
  mostProductiveWeekday: DashboardInsightsWeekdayStat | null;
  weekdayDistribution: DashboardInsightsWeekdayStat[];
}

export const DASHBOARD_INSIGHTS_DUE_SOON_DAYS = 3;

/** Mascote Game4U nas recomendações de insights (fallback se `mascot_img_url` não estiver configurado). */
export const GAME4U_INSIGHTS_MASCOT_URL =
  'https://zarptqqopvuwognexpon.supabase.co/storage/v1/object/public/public_assets/mascots/robot_head.png';

export const DASHBOARD_INSIGHTS_WEEKDAY_LABELS: readonly { label: string; shortLabel: string }[] = [
  { label: 'Domingo', shortLabel: 'Dom' },
  { label: 'Segunda-feira', shortLabel: 'Seg' },
  { label: 'Terça-feira', shortLabel: 'Ter' },
  { label: 'Quarta-feira', shortLabel: 'Qua' },
  { label: 'Quinta-feira', shortLabel: 'Qui' },
  { label: 'Sexta-feira', shortLabel: 'Sex' },
  { label: 'Sábado', shortLabel: 'Sáb' }
];
