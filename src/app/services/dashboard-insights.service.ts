import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ActivityListItem } from '@model/gamification-dashboard.model';
import {
  DASHBOARD_INSIGHTS_DUE_SOON_DAYS,
  DASHBOARD_INSIGHTS_WEEKDAY_LABELS,
  DashboardInsightsQuery,
  DashboardInsightsRankedItem,
  DashboardInsightsSnapshot,
  DashboardInsightsWeekdayStat
} from '@model/dashboard-insights.model';
import { Game4uUserActionModel, Game4uUserActionStatus, isGame4uDataEnabled } from '@model/game4u-api.model';
import {
  mapGame4uActionsToActivityList,
  parseGame4uDtPrazoToLocalDayStartMs,
  resolveGame4uFinishedPrazoStatus
} from '@services/game4u-game-mapper';
import { ActionLogService } from '@services/action-log.service';
import { Game4uApiService } from '@services/game4u-api.service';

const INSIGHTS_OPEN_STATUSES: Game4uUserActionStatus[] = ['PENDING', 'DOING'];
const INSIGHTS_FINISHED_STATUSES: Game4uUserActionStatus[] = ['DONE', 'DELIVERED', 'PAID'];

/** Snapshot a partir de user-actions já carregadas (2 pedidos por equipa: abertas + finalizadas). */
export function buildDashboardInsightsSnapshotFromUserActions(
  actions: Game4uUserActionModel[],
  month: Date
): DashboardInsightsSnapshot {
  const pendingRaw = (actions || []).filter(a => INSIGHTS_OPEN_STATUSES.includes(a.status));
  const finishedRaw = (actions || []).filter(a => INSIGHTS_FINISHED_STATUSES.includes(a.status));
  return computeDashboardInsightsFromActivityLists(
    mapGame4uActionsToActivityList(pendingRaw, month, { monthFilter: 'none' }),
    mapGame4uActionsToActivityList(finishedRaw, month, { monthFilter: 'none' })
  );
}

function deliveryDistinctKey(item: ActivityListItem): string {
  const title = (item.delivery_title || '').trim();
  const client = (item.cnpj || '').trim();
  if (title && client) {
    return `${title}|${client}`;
  }
  return title || client || item.id;
}

function localDayStartMsFromTimestamp(ms: number): number | null {
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function addDaysToDayStartMs(dayStartMs: number, days: number): number {
  const d = new Date(dayStartMs);
  d.setDate(d.getDate() + days);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/**
 * Agrega insights a partir de listas de tarefas (pendentes + finalizadas).
 * Função pura — reutilizável quando o backend passar a devolver listas ou totais pré-agregados.
 */
export function computeDashboardInsightsFromActivityLists(
  pending: ActivityListItem[],
  finished: ActivityListItem[],
  dueSoonDays = DASHBOARD_INSIGHTS_DUE_SOON_DAYS
): DashboardInsightsSnapshot {
  const todayStart = localDayStartMsFromTimestamp(Date.now()) ?? 0;
  const dueSoonEnd = addDaysToDayStartMs(todayStart, dueSoonDays);

  let overduePendingTasks = 0;
  let dueSoonTasks = 0;
  let fineRiskTasks = 0;
  const fineRiskDeliveryKeys = new Set<string>();

  for (const item of pending) {
    const prazoMs = parseGame4uDtPrazoToLocalDayStartMs(item.dt_prazo);
    if (prazoMs != null) {
      if (prazoMs < todayStart) {
        overduePendingTasks++;
      } else if (prazoMs >= todayStart && prazoMs <= dueSoonEnd) {
        dueSoonTasks++;
      }
    }
    if (item.risco_multa === true) {
      fineRiskTasks++;
      fineRiskDeliveryKeys.add(deliveryDistinctKey(item));
    }
  }

  let onTimeFinishedTasks = 0;
  let lateFinishedTasks = 0;
  const activityCounts = new Map<string, DashboardInsightsRankedItem>();
  const weekdayCounts = new Array(7).fill(0);

  for (const item of finished) {
    const status = resolveGame4uFinishedPrazoStatus(item.dt_prazo, item.created);
    if (status === 'on_time') {
      onTimeFinishedTasks++;
    } else if (status === 'late') {
      lateFinishedTasks++;
    }

    const title = (item.title || 'Sem título').trim();
    const existing = activityCounts.get(title);
    if (existing) {
      existing.count++;
    } else {
      activityCounts.set(title, { key: title, label: title, count: 1 });
    }

    const finishedDay = localDayStartMsFromTimestamp(item.created);
    if (finishedDay != null) {
      weekdayCounts[new Date(finishedDay).getDay()]++;
    }
  }

  const topActivities = [...activityCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const weekdayDistribution: DashboardInsightsWeekdayStat[] = DASHBOARD_INSIGHTS_WEEKDAY_LABELS.map(
    (w, index) => ({
      index,
      label: w.label,
      shortLabel: w.shortLabel,
      count: weekdayCounts[index] ?? 0
    })
  );
  const mostProductiveWeekday =
    weekdayDistribution.reduce<DashboardInsightsWeekdayStat | null>((best, row) => {
      if (row.count <= 0) {
        return best;
      }
      if (!best || row.count > best.count) {
        return row;
      }
      return best;
    }, null);

  return {
    source: 'client',
    computedAt: new Date().toISOString(),
    dueSoonDays,
    pendingTasks: pending.length,
    finishedTasks: finished.length,
    overduePendingTasks,
    dueSoonTasks,
    fineRiskTasks,
    fineRiskDeliveries: fineRiskDeliveryKeys.size,
    onTimeFinishedTasks,
    lateFinishedTasks,
    topActivity: topActivities[0] ?? null,
    topActivities,
    mostProductiveWeekday,
    weekdayDistribution
  };
}

/** Combina snapshots de várias equipas (soma contagens; rankings reordenados). */
export function mergeDashboardInsightsSnapshots(
  snapshots: Array<DashboardInsightsSnapshot | null | undefined>
): DashboardInsightsSnapshot | null {
  const valid = snapshots.filter((s): s is DashboardInsightsSnapshot => s != null);
  if (valid.length === 0) {
    return null;
  }
  if (valid.length === 1) {
    return valid[0]!;
  }

  const activityCounts = new Map<string, DashboardInsightsRankedItem>();
  const weekdayCounts = new Array(7).fill(0);
  let overduePendingTasks = 0;
  let dueSoonTasks = 0;
  let fineRiskTasks = 0;
  let fineRiskDeliveries = 0;
  let onTimeFinishedTasks = 0;
  let lateFinishedTasks = 0;
  let pendingTasks = 0;
  let finishedTasks = 0;
  const dueSoonDays = valid[0]!.dueSoonDays;

  for (const snap of valid) {
    overduePendingTasks += snap.overduePendingTasks;
    dueSoonTasks += snap.dueSoonTasks;
    fineRiskTasks += snap.fineRiskTasks;
    fineRiskDeliveries += snap.fineRiskDeliveries;
    onTimeFinishedTasks += snap.onTimeFinishedTasks;
    lateFinishedTasks += snap.lateFinishedTasks;
    pendingTasks += snap.pendingTasks;
    finishedTasks += snap.finishedTasks;

    for (const act of snap.topActivities) {
      const cur = activityCounts.get(act.key);
      if (cur) {
        cur.count += act.count;
      } else {
        activityCounts.set(act.key, { ...act });
      }
    }

    for (const day of snap.weekdayDistribution) {
      weekdayCounts[day.index] = (weekdayCounts[day.index] ?? 0) + day.count;
    }
  }

  const topActivities = [...activityCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const weekdayDistribution: DashboardInsightsWeekdayStat[] = DASHBOARD_INSIGHTS_WEEKDAY_LABELS.map(
    (w, index) => ({
      index,
      label: w.label,
      shortLabel: w.shortLabel,
      count: weekdayCounts[index] ?? 0
    })
  );
  const mostProductiveWeekday =
    weekdayDistribution.reduce<DashboardInsightsWeekdayStat | null>((best, row) => {
      if (row.count <= 0) {
        return best;
      }
      if (!best || row.count > best.count) {
        return row;
      }
      return best;
    }, null);

  return {
    source: 'client',
    computedAt: new Date().toISOString(),
    dueSoonDays,
    pendingTasks,
    finishedTasks,
    overduePendingTasks,
    dueSoonTasks,
    fineRiskTasks,
    fineRiskDeliveries,
    onTimeFinishedTasks,
    lateFinishedTasks,
    topActivity: topActivities[0] ?? null,
    topActivities,
    mostProductiveWeekday,
    weekdayDistribution
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardInsightsService {
  constructor(
    private readonly actionLog: ActionLogService,
    private readonly game4u: Game4uApiService
  ) {}

  /**
   * Insights do mês via agregação client-side de `/game/reports/user-actions`.
   * Substituível por `GET /game/reports/dashboard/insights` quando disponível no backend.
   */
  getDashboardInsights(q: DashboardInsightsQuery, playerIdForApi: string): Observable<DashboardInsightsSnapshot | null> {
    if (!isGame4uDataEnabled() || !this.game4u.isConfigured() || !q.month) {
      return of(null);
    }

    const teamId = (q.team_id ?? '').trim() || undefined;
    const pid = (playerIdForApi ?? '').trim();
    const useTeamOnly = !!teamId && !pid;

    return this.actionLog
      .getTeamUserActionsForInsightsMonth(useTeamOnly ? teamId : undefined, q.month, useTeamOnly ? undefined : pid)
      .pipe(
        map(actions => buildDashboardInsightsSnapshotFromUserActions(actions, q.month!)),
        catchError(err => {
          console.error('[DashboardInsights] Failed to load insights:', err);
          return of(null);
        })
      );
  }

  /**
   * Insights agregando várias equipas (2 pedidos user-actions por `team_id`: abertas + finalizadas).
   */
  getDashboardInsightsForTeams(
    teamIds: string[],
    q: Omit<DashboardInsightsQuery, 'team_id'>,
    playerIdForApi: string
  ): Observable<DashboardInsightsSnapshot | null> {
    const ids = [...new Set(teamIds.map(id => id.trim()).filter(id => id.length > 0))];
    if (ids.length === 0) {
      return of(null);
    }
    if (ids.length === 1) {
      return this.getDashboardInsights({ ...q, team_id: ids[0] }, playerIdForApi);
    }
    return forkJoin(
      ids.map(team_id => this.getDashboardInsights({ ...q, team_id }, playerIdForApi))
    ).pipe(
      map(snapshots => mergeDashboardInsightsSnapshots(snapshots)),
      catchError(err => {
        console.error('[DashboardInsights] Failed to load multi-team insights:', err);
        return of(null);
      })
    );
  }
}
