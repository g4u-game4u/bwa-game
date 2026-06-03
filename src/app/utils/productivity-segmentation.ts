import { ManagementDashboardCachedRole } from './management-dashboard-role';
import { UserProfile } from './user-profile';

/** Granularidade dos gráficos na aba «Análise de Produtividade». */
export type ProductivitySegmentationMode = 'gerencias' | 'supervisoes' | 'jogadores' | 'celula';

export interface ProductivitySegmentationContext {
  isManagementOverview: boolean;
  managementRole: ManagementDashboardCachedRole | null;
  userProfile: UserProfile;
  isLiderCelula: boolean;
  isSupervisor: boolean;
  sessionIsGerente: boolean;
}

/**
 * Define como agrupar séries de `/daily-finished-stats`:
 * - C_LEVEL / DIRETOR no painel agregado → gerências (gestores GERENTE abaixo);
 * - GERENTE no painel agregado → supervisões (times do escopo);
 * - SUPERVISOR → jogadores do time;
 * - LIDER_CELULA → jogadores da célula;
 * - drill-down em time concreto → jogadores (exceto líder de célula).
 */
export function resolveProductivitySegmentationMode(
  ctx: ProductivitySegmentationContext
): ProductivitySegmentationMode {
  if (ctx.isLiderCelula) {
    return 'celula';
  }
  if (ctx.isSupervisor) {
    return 'jogadores';
  }
  if (ctx.isManagementOverview) {
    if (ctx.managementRole === 'GERENTE' || ctx.sessionIsGerente) {
      return 'supervisoes';
    }
    if (
      ctx.managementRole === 'DIRETOR' ||
      ctx.managementRole === 'C_LEVEL' ||
      ctx.userProfile === UserProfile.DIRETOR
    ) {
      return 'gerencias';
    }
  }
  return 'jogadores';
}

export interface TeamDailyStatsSlice {
  day: string;
  email?: string;
  tasksCount: number;
  pointsSum: number;
}

/** Soma linhas normalizadas por dia (consolidado da equipa ou de várias equipas). */
export function aggregateDailyFinishedStatsByDay(
  rows: TeamDailyStatsSlice[]
): Map<string, { tasks: number; points: number }> {
  const byDay = new Map<string, { tasks: number; points: number }>();
  for (const r of rows) {
    const day = String(r.day ?? '').trim();
    if (!day) {
      continue;
    }
    const cnt = Math.floor(Number(r.tasksCount) || 0);
    const pts = Math.floor(Number(r.pointsSum) || 0);
    const cur = byDay.get(day) ?? { tasks: 0, points: 0 };
    cur.tasks += cnt;
    cur.points += pts;
    byDay.set(day, cur);
  }
  return byDay;
}

/** Agrupa linhas por e-mail (jogador). */
export function aggregateDailyFinishedStatsByEmail(
  rows: TeamDailyStatsSlice[]
): Map<string, Map<string, { tasks: number; points: number }>> {
  const byEmail = new Map<string, Map<string, { tasks: number; points: number }>>();
  for (const r of rows) {
    const day = String(r.day ?? '').trim();
    const email = String(r.email ?? '').trim();
    if (!day || !email) {
      continue;
    }
    const cnt = Math.floor(Number(r.tasksCount) || 0);
    const pts = Math.floor(Number(r.pointsSum) || 0);
    if (!byEmail.has(email)) {
      byEmail.set(email, new Map());
    }
    const dayMap = byEmail.get(email)!;
    const cur = dayMap.get(day) ?? { tasks: 0, points: 0 };
    cur.tasks += cnt;
    cur.points += pts;
    dayMap.set(day, cur);
  }
  return byEmail;
}

/** Rótulo legível para uma gerência (gestor GERENTE). */
export function formatGerenciaGroupLabel(userEmail: string | null | undefined): string {
  const email = (userEmail ?? '').trim();
  if (!email) {
    return 'Gerência';
  }
  const local = email.split('@')[0] ?? email;
  const words = local.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'Gerência';
  }
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** Converte agregado diário em mapas usados pelos gráficos. */
export function dailyMapsFromDayAggregate(
  byDay: Map<string, { tasks: number; points: number }>
): { activitiesMap: Map<string, number>; pointsMap: Map<string, number> } {
  const activitiesMap = new Map<string, number>();
  const pointsMap = new Map<string, number>();
  for (const [day, v] of byDay) {
    activitiesMap.set(day, v.tasks);
    pointsMap.set(day, v.points);
  }
  return { activitiesMap, pointsMap };
}
