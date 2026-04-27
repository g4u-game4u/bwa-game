import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { BackendApiService } from './backend-api.service';
import {
  ActivityListItem,
  ActivityMetrics,
  ProcessListItem,
  ProcessMetrics
} from '@model/gamification-dashboard.model';
import { PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG } from '@app/constants/pontos-por-atividade-action-log';
import { isGame4uDataEnabled } from '@model/game4u-api.model';
import { Game4uApiService } from './game4u-api.service';
import type { Game4uUserActionStatus, Game4uUserScopedQuery } from '@model/game4u-api.model';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import {
  computeMonthlyPointsFromGame4uActions,
  filterGame4uActionsByCompetenceMonth,
  filterGame4uActionsByMonth,
  getGame4uParticipationRowKey,
  getGame4uActionStatsDone,
  getGame4uMonthlyPointsCircularFromActionStats,
  readGame4uDeliveryStatsTotal,
  mapGame4uActionsToActivityList,
  mapGame4uActionsToProcessList,
  mapGame4uActionsToProcessMetrics,
  mapGame4uStatsToActivityMetrics,
  mapGame4uStatsToPointWallet,
  mergeGame4uDeliveryParticipation,
  isGame4uUserActionFinalizedStatus
} from './game4u-game-mapper';

export interface ActionLogEntry {
  _id: string;
  actionId: string; // Action type identifier (e.g., 'acessorias', 'desbloquear')
  userId: string; // User's email
  time: number | { $date: string }; // Timestamp when action was logged (can be number or { $date: "ISO string" })
  attributes?: {
    delivery_title?: string; // Process title
    delivery_id?: number; // Process ID (number)
    delivery?: number; // Used in desbloquear action to reference delivery_id
    deal?: string | number; // ID da empresa no CRM (carteira por time usa este campo no aggregate)
    acao?: string; // Action title to display
    cnpj?: string; // Client CNPJ
    integration_id?: number;
    [key: string]: unknown;
  };
  extra?: {
    processed?: boolean;
    processed_at?: number;
    [key: string]: unknown;
  };
  // Legacy fields (may not exist in all entries)
  action?: string;
  action_title?: string;
  status?: string;
  points?: number;
  player?: string; // Deprecated: use userId
  created?: number; // Deprecated: use time
  updated?: number;
  delivery_id?: string; // Deprecated: use attributes.delivery_id
  delivery_title?: string; // Deprecated: use attributes.delivery_title
}

export type { ActivityListItem, ProcessListItem } from '@model/gamification-dashboard.model';

export interface ClienteListItem {
  cnpj: string;
  actions: ClienteActionItem[];
}

export interface ClienteActionItem {
  id: string;
  title: string; // attributes.acao
  player: string; // userId (email do executor)
  created: number; // timestamp
  status?: 'finalizado' | 'pendente' | 'dispensado'; // Status da tarefa
  /** Processo (delivery_title) quando vem do action_log */
  processTitle?: string;
}

/** Opções para alinhar o aggregate ao mesmo critério da carteira (cnpj vs deal, escopo jogador/time). */
export interface GetActionsByCompanyKeyOptions {
  userId?: string;
  teamId?: string;
}

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

/**
 * Helper to extract timestamp from Funifier's time field
 * Funifier may return time as a number or as { $date: "ISO string" }
 */
function extractTimestamp(time: number | { $date: string } | undefined): number {
  if (!time) return 0;
  if (typeof time === 'number') return time;
  if (typeof time === 'object' && '$date' in time) {
    const date = new Date(time.$date);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

/** Valores para $in em attributes.cnpj e attributes.deal (Funifier pode gravar string ou número). */
function buildCompanyIdentifierVariants(raw: string): (string | number)[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];
  const out = new Set<string | number>();
  out.add(trimmed);
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && !Number.isNaN(asNum)) {
    out.add(asNum);
    out.add(String(asNum));
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits && digits !== trimmed) {
    out.add(digits);
    const dn = Number(digits);
    if (Number.isFinite(dn)) {
      out.add(dn);
    }
  }
  return [...out];
}

/** Cruza linha da carteira (CNPJ/deal) com attributes.cnpj / attributes.deal do action_log (string ou número). */
function actionLogEntryMatchesCompanyKey(entry: ActionLogEntry, companyKey: string): boolean {
  const variants = buildCompanyIdentifierVariants(companyKey);
  if (variants.length === 0) {
    return false;
  }

  const attrCnpj = entry.attributes?.cnpj;
  const attrDeal = entry.attributes?.deal;
  const candidates: unknown[] = [attrCnpj, attrDeal].filter(x => x != null && x !== '');

  for (const cand of candidates) {
    const asStr = String(cand).trim();
    const asNum = Number(asStr);
    for (const v of variants) {
      if (v === cand) {
        return true;
      }
      if (String(v) === asStr) {
        return true;
      }
      if (typeof v === 'number' && Number.isFinite(asNum) && !Number.isNaN(asNum) && v === asNum) {
        return true;
      }
    }
    const digitsCand = asStr.replace(/\D/g, '');
    if (digitsCand) {
      for (const v of variants) {
        const vs = String(v).replace(/\D/g, '');
        if (vs && digitsCand === vs) {
          return true;
        }
      }
    }
  }
  return false;
}

function mapGame4uStatusToClienteTaskStatus(
  status: string | undefined
): 'finalizado' | 'pendente' | 'dispensado' | undefined {
  const u = String(status ?? '').toUpperCase();
  if (u === 'DONE' || u === 'DELIVERED' || u === 'PAID') {
    return 'finalizado';
  }
  if (u === 'PENDING' || u === 'DOING') {
    return 'pendente';
  }
  if (u === 'CANCELLED' || u === 'LOST') {
    return 'dispensado';
  }
  return undefined;
}

/**
 * Helper to generate Funifier date expressions (relative or absolute)
 * Funifier supports: -0d-, -0d+, -1d-, -0M-, -0M+, -0y-, etc.
 * - `-0M-` = start of current month
 * - `-0M+` = end of current month
 * - `-1M-` = start of previous month
 * - `-1M+` = end of previous month
 * 
 * Also supports absolute dates: { $date: "2026-01-01T00:00:00.000Z" }
 * 
 * Logic:
 * - When month is undefined (Toda temporada), returns no date boundary (all data)
 * - When a specific month is selected, returns only that month's range
 */
function getRelativeDateExpression(month: Date | undefined, position: 'start' | 'end'): { $date: string } | number {
  // If month is undefined (Toda temporada), return extreme boundaries (effectively no filter)
  if (!month) {
    if (position === 'start') {
      return { $date: new Date('2000-01-01T00:00:00.000Z').toISOString() };
    } else {
      return { $date: new Date('2099-12-31T23:59:59.999Z').toISOString() };
    }
  }
  
  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();
  
  // Calculate the start or end of the selected month
  if (position === 'start') {
    const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0);
    return { $date: monthStart.toISOString() };
  } else {
    // End of the selected month
    const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999);
    return { $date: monthEnd.toISOString() };
  }
}

/**
 * Helper to get epoch milliseconds for a date position.
 * Used alongside getRelativeDateExpression to build $or queries
 * that match both { $date: "..." } and raw epoch number formats.
 */
function getEpochMs(month: Date | undefined, position: 'start' | 'end'): number {
  // If month is undefined (Toda temporada), return extreme boundaries (effectively no filter)
  if (!month) {
    if (position === 'start') {
      return 0;
    } else {
      return new Date('2099-12-31T23:59:59.999Z').getTime();
    }
  }

  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();

  if (position === 'start') {
    const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0);
    return monthStart.getTime();
  } else {
    const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999);
    return monthEnd.getTime();
  }
}

/**
 * Build a $match condition for the time field that handles both formats:
 * - { $date: "ISO string" } (BSON Date objects from Funifier)
 * - number (epoch milliseconds)
 * Uses $or to match documents regardless of which format their time field uses.
 * 
 * NOTE: This function is kept for reference but NO LONGER USED in aggregate queries.
 * Time filtering is now done on the frontend using filterByMonth().
 */
function buildTimeMatch(month: Date | undefined): Record<string, unknown> {
  const startDate = getRelativeDateExpression(month, 'start');
  const endDate = getRelativeDateExpression(month, 'end');
  const startMs = getEpochMs(month, 'start');
  const endMs = getEpochMs(month, 'end');

  return {
    $or: [
      { time: { $gte: startDate, $lte: endDate } },
      { time: { $gte: startMs, $lte: endMs } }
    ]
  };
}

/**
 * Filter an array of action log entries by month on the frontend.
 * If month is undefined (Toda temporada), returns ALL entries with no date filter.
 * If month is specified, returns only entries from that month.
 * 
 * @param entries - Array of entries with a 'time' field
 * @param month - Target month to filter by (undefined = all data, no filter)
 * @returns Filtered array of entries
 */
function filterByMonth<T extends { time?: number | { $date: string } }>(entries: T[], month: Date | undefined): T[] {
  if (!month) {
    console.warn('📊 filterByMonth: no month filter, returning all', entries.length, 'entries');
    return entries;
  }
  
  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();
  const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0).getTime();
  const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999).getTime();
  
  const filtered = entries.filter(entry => {
    const timestamp = extractTimestamp(entry.time);
    return timestamp >= monthStart && timestamp <= monthEnd;
  });
  
  console.warn('📊 filterByMonth:', targetYear, '-', targetMonthNum + 1, '→', filtered.length, '/', entries.length, 'entries');
  return filtered;
}

/**
 * Filter achievement entries by month on the frontend.
 * Achievement entries use 'time' field for timestamp.
 * 
 * @param entries - Array of achievement entries with a 'time' field
 * @param month - Target month to filter by (undefined = entire season)
 * @returns Filtered array of entries
 */
function filterAchievementsByMonth<T extends { time?: number | { $date: string } }>(entries: T[], month: Date | undefined): T[] {
  return filterByMonth(entries, month);
}

@Injectable({
  providedIn: 'root'
})
export class ActionLogService {
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

  /**
   * Pontos exibidos no painel e modais: calculados no frontend — 3 por cada
   * registro de action_log no período (cada registro = uma tarefa/entrega logada).
   */
  private actionLogCache = new Map<string, CacheEntry<ActionLogEntry[]>>();
  private metricsCache = new Map<string, CacheEntry<{ activity: ActivityMetrics; processo: ProcessMetrics }>>();
  private activityCountCache = new Map<string, CacheEntry<number>>(); // Cache for activity counts
  private uniqueClientesCache = new Map<string, CacheEntry<number>>();
  private cnpjListWithCountCache = new Map<string, CacheEntry<{ cnpj: string; actionCount: number }[]>>();
  private activitiesByDayCache = new Map<string, CacheEntry<{ day: number; count: number }[]>>();
  private activitiesByProcessCache = new Map<string, CacheEntry<ActivityListItem[]>>();
  private processListCache = new Map<string, CacheEntry<ProcessListItem[]>>();
  private processFinalizationCache = new Map<string, CacheEntry<Set<number>>>();
  private actionsByCnpjCache = new Map<string, CacheEntry<ClienteActionItem[]>>();
  private processMetricsCache = new Map<string, CacheEntry<ProcessMetrics>>();
  private pontosForMonthCache = new Map<string, CacheEntry<number>>();
  private monthlyPointsBreakdownCache = new Map<string, CacheEntry<{ bloqueados: number; desbloqueados: number }>>();

  constructor(
    private backendApi: BackendApiService,
    private game4u: Game4uApiService,
    private sessao: SessaoProvider
  ) {}

  private resolveGame4uUserEmail(playerId: string): string {
    const id = (playerId || '').trim();
    if (!id || id === 'me') {
      return (this.sessao.usuario?.email || '').trim();
    }
    return id;
  }

  private game4uUserQuery(playerId: string, month?: Date): Game4uUserScopedQuery | null {
    const user = this.resolveGame4uUserEmail(playerId);
    if (!user) {
      return null;
    }
    return { user, ...this.game4u.toQueryRange(month) };
  }

  /**
   * Intervalo de `/game/actions` alinhado ao **mês do painel** (mesmo critério que {@link Game4uApiService.toQueryRange}
   * e `/game/stats`). O filtro por competência em `delivery_id` continua em
   * {@link filterGame4uActionsByCompetenceMonth} sobre a resposta.
   */
  private game4uUserQueryActionsForCompetenceMonth(playerId: string, month: Date): Game4uUserScopedQuery | null {
    const user = this.resolveGame4uUserEmail(playerId);
    if (!user) {
      return null;
    }
    return { user, ...this.game4u.toQueryRange(month) };
  }

  private getMonthCacheKey(month?: Date): string {
    if (!month) {
      return 'season';
    }
    return `${month.getFullYear()}-${month.getMonth()}`;
  }

  private readonly PAGE_SIZE = 100; // Funifier pagination limit

  /**
   * Get ALL action log entries for a player (no time filtering in aggregate)
   * Time filtering is done on the frontend based on selected month
   * Uses userId field to match the user's email
   * Note: action_log uses 'time' field for timestamp, not 'created'
   * 
   * IMPORTANT: Uses pagination to handle players with 100+ action logs
   * Funifier limits to 100 items per request by default
   */
  getPlayerActionLogForMonth(playerId: string, month?: Date): Observable<ActionLogEntry[]> {
    // Cache key without month - we fetch ALL data and filter on frontend
    const cacheKey = `${playerId}_all_actions`;
    const cached = this.getCachedData(this.actionLogCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch all action logs using pagination
    const request$ = this.fetchAllActionLogsPaginated(playerId).pipe(
      map(response => {
        console.log('📊 Action log loaded (ALL):', response?.length || 0, 'entries');
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error('Error fetching action log:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionLogCache, cacheKey, request$);
    return request$;
  }

  /**
   * Fetch all action logs for a player using Range header pagination
   * Funifier Range header format: items={{offset}}-{{count}}
   * Example: items=0-100, items=100-100, items=200-100
   * Keeps fetching until we get less than PAGE_SIZE items
   */
  private fetchAllActionLogsPaginated(playerId: string): Observable<ActionLogEntry[]> {
    return this.fetchActionLogPage(playerId, 0).pipe(
      switchMap(firstPage => {
        // If first page has less than PAGE_SIZE, we have all data
        if (firstPage.length < this.PAGE_SIZE) {
          console.log('📊 All action logs fetched in single page:', firstPage.length);
          return of(firstPage);
        }

        // Need to fetch more pages
        return this.fetchRemainingPages(playerId, firstPage);
      }),
      catchError(error => {
        console.error('Error fetching action logs:', error);
        return of([]);
      })
    );
  }

  /**
   * Recursively fetch remaining pages until we get less than PAGE_SIZE
   */
  private fetchRemainingPages(playerId: string, accumulatedLogs: ActionLogEntry[], pageIndex: number = 1): Observable<ActionLogEntry[]> {
    return this.fetchActionLogPage(playerId, pageIndex).pipe(
      switchMap(page => {
        const allLogs = [...accumulatedLogs, ...page];
        
        // If this page has less than PAGE_SIZE, we're done
        if (page.length < this.PAGE_SIZE) {
          console.log('📊 All action logs fetched:', allLogs.length, 'total entries');
          // Sort by time descending
          allLogs.sort((a, b) => extractTimestamp(b.time) - extractTimestamp(a.time));
          return of(allLogs);
        }

        // Fetch next page
        return this.fetchRemainingPages(playerId, allLogs, pageIndex + 1);
      })
    );
  }

  /**
   * Fetch a single page of action logs using Range header
   * Funifier Range format: items={{offset}}-{{count}}
   */
  private fetchActionLogPage(playerId: string, pageIndex: number): Observable<ActionLogEntry[]> {
    const offset = pageIndex * this.PAGE_SIZE;
    
    const aggregateBody = [
      { $match: { userId: playerId } },
      { $sort: { time: -1 } }
    ];

    console.log(`📊 Fetching action log page ${pageIndex} (Range: items=${offset}-${this.PAGE_SIZE})`);

    return this.backendApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody,
      { headers: { 'Range': `items=${offset}-${this.PAGE_SIZE}` } }
    ).pipe(
      map(response => {
        console.log(`📊 Page ${pageIndex} loaded:`, response?.length || 0, 'entries');
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error(`Error fetching action log page ${pageIndex}:`, error);
        return of([]);
      })
    );
  }

  /**
   * Get count of activities finalizadas
   * Now uses getPlayerActionLogForMonth (which fetches ALL data) and filters on frontend
   */
  getAtividadesFinalizadas(playerId: string, month?: Date): Observable<number> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of(0);
      }
      return this.game4u.getGameStats(q).pipe(
        map(s => {
          if (s.action_stats != null) {
            return getGame4uActionStatsDone(s).count;
          }
          return Math.floor(Number(s.total_actions) || 0);
        }),
        catchError(error => {
          console.error('Error fetching Game4U activity count:', error);
          return of(0);
        })
      );
    }

    // Use the main action log method and filter by month on frontend
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        console.log('📊 Activity count (filtered on frontend):', filtered.length);
        return filtered.length;
      }),
      catchError(error => {
        console.error('Error fetching activity count:', error);
        return of(0);
      })
    );
  }

  /**
   * Alias for getAtividadesFinalizadas for backward compatibility
   */
  getCompletedTasksCount(playerId: string, month?: Date): Observable<number> {
    return this.getAtividadesFinalizadas(playerId, month);
  }

  /**
   * Dados do card “Progresso da temporada”: uma chamada `/game/stats` no Game4U;
   * fora disso, só contagem de tarefas (Funifier).
   */
  getSeasonProgressSidebarDetails(
    playerId: string,
    month?: Date
  ): Observable<{ tarefasFinalizadas: number; deliveryStatsTotal?: number }> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of({ tarefasFinalizadas: 0 });
      }
      return this.game4u.getGameStats(q).pipe(
        map(s => {
          const tarefasFinalizadas =
            s.action_stats != null
              ? getGame4uActionStatsDone(s).count
              : Math.floor(Number(s.total_actions) || 0);
          const dt = readGame4uDeliveryStatsTotal(s);
          return dt === null
            ? { tarefasFinalizadas }
            : { tarefasFinalizadas, deliveryStatsTotal: dt };
        }),
        catchError(error => {
          console.error('Error fetching season sidebar stats (Game4U):', error);
          return of({ tarefasFinalizadas: 0 });
        })
      );
    }
    return this.getCompletedTasksCount(playerId, month).pipe(
      map(tarefasFinalizadas => ({ tarefasFinalizadas }))
    );
  }

  /**
   * Todas as user-actions Game4U com o mesmo `delivery_id` (intervalo alinhado ao mês do painel ou temporada).
   */
  getGame4uUserActionsForDeliveryId(
    playerId: string,
    deliveryId: string,
    month?: Date
  ): Observable<ClienteActionItem[]> {
    const id = (deliveryId || '').trim();
    if (!id || !(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return of([]);
    }
    const qActions =
      month != null
        ? this.game4uUserQueryActionsForCompetenceMonth(playerId, month)
        : this.game4uUserQuery(playerId, month);
    if (!qActions) {
      return of([]);
    }
    return this.game4u.getGameActions(qActions).pipe(
      map(actions => {
        const scoped =
          month != null
            ? filterGame4uActionsByCompetenceMonth(actions, month)
            : filterGame4uActionsByMonth(actions, month);
        const rows = scoped.filter(a => String(a.delivery_id ?? '').trim() === id);
        rows.sort((a, b) => {
          const ta = Date.parse(String(a.created_at));
          const tb = Date.parse(String(b.created_at));
          return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
        });
        return rows.map(a => ({
          id: a.id,
          title:
            (typeof a.action_title === 'string' && a.action_title.trim()) || 'Ação',
          player: String(a.user_email ?? ''),
          created: Date.parse(String(a.created_at)) || 0,
          processTitle:
            (typeof a.delivery_title === 'string' && a.delivery_title.trim()) || undefined,
          status: mapGame4uStatusToClienteTaskStatus(a.status)
        }));
      }),
      catchError(error => {
        console.error('Error fetching Game4U actions by delivery_id:', error);
        return of([]);
      })
    );
  }

  /**
   * Get ALL achievements for a player (no time filtering in aggregate)
   * Time filtering is done on the frontend based on selected month
   * Cached with shareReplay to avoid duplicate requests
   * Uses pagination with Range header to handle 100+ achievements
   */
  private getAllAchievements(playerId: string): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    const cacheKey = `${playerId}_all_achievements`;
    const cached = this.getCachedData(this.pontosForMonthCache as any, cacheKey);
    if (cached) {
      return cached as any;
    }

    const request$ = this.fetchAllAchievementsPaginated(playerId).pipe(
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.pontosForMonthCache as any, cacheKey, request$ as any);
    return request$;
  }

  /**
   * Fetch all achievements for a player using Range header pagination
   * Funifier Range header format: items={{offset}}-{{count}}
   */
  private fetchAllAchievementsPaginated(playerId: string): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    return this.fetchAchievementPage(playerId, 0).pipe(
      switchMap(firstPage => {
        if (firstPage.length < this.PAGE_SIZE) {
          console.log('📊 All achievements fetched in single page:', firstPage.length);
          return of(firstPage);
        }
        return this.fetchRemainingAchievementPages(playerId, firstPage);
      }),
      catchError(error => {
        console.error('Error fetching achievements:', error);
        return of([]);
      })
    );
  }

  /**
   * Recursively fetch remaining achievement pages
   */
  private fetchRemainingAchievementPages(
    playerId: string, 
    accumulatedAchievements: { _id: string; item: string; total: number; time?: number | { $date: string } }[], 
    pageIndex: number = 1
  ): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    return this.fetchAchievementPage(playerId, pageIndex).pipe(
      switchMap(page => {
        const allAchievements = [...accumulatedAchievements, ...page];
        
        if (page.length < this.PAGE_SIZE) {
          console.log('📊 All achievements fetched:', allAchievements.length, 'total entries');
          return of(allAchievements);
        }

        return this.fetchRemainingAchievementPages(playerId, allAchievements, pageIndex + 1);
      })
    );
  }

  /**
   * Fetch a single page of achievements using Range header
   */
  private fetchAchievementPage(playerId: string, pageIndex: number): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    const offset = pageIndex * this.PAGE_SIZE;
    
    const aggregateBody = [
      {
        $match: {
          player: playerId,
          type: 0 // type 0 = points
        }
      },
      {
        $project: {
          item: 1,
          total: 1,
          time: 1
        }
      }
    ];

    console.log(`📊 Fetching achievement page ${pageIndex} (Range: items=${offset}-${this.PAGE_SIZE})`);

    return this.backendApi.post<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody,
      { headers: { 'Range': `items=${offset}-${this.PAGE_SIZE}` } }
    ).pipe(
      map(response => {
        console.log(`📊 Achievement page ${pageIndex} loaded:`, response?.length || 0, 'entries');
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error(`Error fetching achievement page ${pageIndex}:`, error);
        return of([]);
      })
    );
  }

  /**
   * Get monthly points breakdown (blocked and unlocked)
   * Fetches ALL achievements and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getMonthlyPointsBreakdown(playerId: string, month?: Date): Observable<{ bloqueados: number; desbloqueados: number }> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of({ bloqueados: 0, desbloqueados: 0 });
      }
      return this.game4u.getGameStats(q).pipe(
        map(stats => {
          const w = mapGame4uStatsToPointWallet(stats);
          return { bloqueados: w.bloqueados, desbloqueados: w.desbloqueados };
        }),
        catchError(error => {
          console.error('Error in getMonthlyPointsBreakdown (Game4U):', error);
          return of({ bloqueados: 0, desbloqueados: 0 });
        })
      );
    }

    return this.getAllAchievements(playerId).pipe(
      map(achievements => {
        // Filter by month on frontend
        const filtered = filterAchievementsByMonth(achievements, month);
        
        let bloqueados = 0;
        let desbloqueados = 0;

        filtered.forEach(item => {
          if (item.item === 'locked_points' || item.item === 'bloqueados') {
            bloqueados += item.total || 0;
          } else if (item.item === 'points' || item.item === 'unlocked_points' || item.item === 'desbloqueados') {
            desbloqueados += item.total || 0;
          }
        });

        console.log('📊 Monthly points breakdown (filtered on frontend):', { bloqueados, desbloqueados });
        return { bloqueados, desbloqueados };
      }),
      catchError(error => {
        console.error('Error fetching monthly points breakdown:', error);
        return of({ bloqueados: 0, desbloqueados: 0 });
      })
    );
  }

  /**
   * Pontos do período: calculados no frontend como
   * `atividades no action_log (mês/temporada) × PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG`.
   * Não consulta mais achievement/delivery_ids no Funifier.
   */
  getPontosForMonth(playerId: string, month?: Date): Observable<number> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of(0);
      }
      return this.game4u.getGameStats(q).pipe(
        map(s =>
          s.action_stats != null
            ? getGame4uActionStatsDone(s).totalPoints
            : mapGame4uStatsToActivityMetrics(s).pontos
        ),
        catchError(error => {
          console.error('Error in getPontosForMonth (Game4U):', error);
          return of(0);
        })
      );
    }

    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        const total = filtered.length * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG;
        console.log(
          '📊 Pontos (frontend):',
          filtered.length,
          'tarefas ×',
          PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG,
          '=',
          total
        );
        return total;
      }),
      catchError(error => {
        console.error('Error in getPontosForMonth:', error);
        return of(0);
      })
    );
  }

  /**
   * Get unique CNPJs count from user's action_log
   * Fetches ALL action logs and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getUniqueClientesCount(playerId: string, month?: Date): Observable<number> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      return this.getPlayerCnpjListWithCount(playerId, month).pipe(
        map(rows => rows.length),
        catchError(error => {
          console.error('Error counting unique clientes (Game4U):', error);
          return of(0);
        })
      );
    }

    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Filter by month on frontend
        const filtered = filterByMonth(actions, month);
        
        // Count unique CNPJs
        const uniqueCnpjs = new Set(
          filtered
            .map(a => a.attributes?.cnpj)
            .filter((cnpj): cnpj is string => cnpj != null)
        );
        
        console.log('📊 Unique CNPJs count (filtered on frontend):', uniqueCnpjs.size);
        return uniqueCnpjs.size;
      }),
      catchError(error => {
        console.error('Error counting unique CNPJs:', error);
        return of(0);
      })
    );
  }

  /**
   * Get process metrics for a player
   * A Process is identified by unique attributes.delivery_id (number) in action_log
   * Process is Finalizado if there's a "desbloquear" action with attributes.delivery = delivery_id
   * Otherwise it's Pendente/Incompleto
   * Fetches ALL data and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessMetrics(playerId: string, month?: Date): Observable<ProcessMetrics> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
      }
      return this.game4u.getGameActions(q).pipe(
        map(actions =>
          mapGame4uActionsToProcessMetrics(filterGame4uActionsByMonth(actions, month))
        ),
        catchError(error => {
          console.error('Error calculating process metrics (Game4U):', error);
          return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
        })
      );
    }

    const cacheKey = `${playerId}_all_process_metrics`;
    const cached = this.getCachedData(this.processMetricsCache, cacheKey);
    if (cached) {
      // If we have cached data, filter by month on frontend
      return cached.pipe(
        map((metrics: ProcessMetrics) => metrics) // Return as-is, filtering happens in getProgressMetrics
      );
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Filter by month on frontend
        const filtered = filterByMonth(userActions, month);
        
        // Get unique delivery_ids from user's actions (attributes.delivery_id is a number)
        const deliveryIds = [...new Set(
          filtered
            .map(a => a.attributes?.delivery_id)
            .filter((id): id is number => id != null)
        )];

        console.log('📊 Unique delivery_ids found (filtered on frontend):', deliveryIds);

        if (deliveryIds.length === 0) {
          return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
        }

        // Query action_log for "desbloquear" actions with matching delivery_ids
        // Note: actionId field contains the action type, attributes.delivery matches delivery_id
        // NO time filtering here - we check if ANY desbloquear exists for these delivery_ids
        const aggregateBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];

        console.log('📊 Desbloquear query (no time filter):', JSON.stringify(aggregateBody));

        return this.backendApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const desbloqueadosIds = new Set(desbloqueados.map(d => d._id));
            
            console.log('📊 Desbloqueados delivery_ids:', [...desbloqueadosIds]);

            // Count finalizadas (have desbloquear action)
            const finalizadas = deliveryIds.filter(id => desbloqueadosIds.has(id)).length;
            
            // Count pendentes/incompletas (don't have desbloquear action)
            const pendentesIncompletas = deliveryIds.length - finalizadas;

            return {
              pendentes: pendentesIncompletas,
              incompletas: 0, // Combined with pendentes
              finalizadas
            };
          }),
          catchError(error => {
            console.error('Error fetching desbloquear actions:', error);
            return of({ pendentes: deliveryIds.length, incompletas: 0, finalizadas: 0 });
          })
        );
      }),
      catchError(error => {
        console.error('Error calculating process metrics:', error);
        return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.processMetricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get activity and process metrics for a player
   * This provides data for "Meu Progresso" section
   * - Atividades: Finalizadas (count of action_log entries), Pontos (from achievement)
   * - Processos: Finalizados, Pendentes/Incompletos (based on desbloquear action)
   * Funifier: dados amplos e filtro por mês no cliente.
   * Game4U com mês selecionado: pontos e processos usam competência em `delivery_id` (`{id}-{YYYY-MM-DD}`), não só `created_at`.
   */
  getProgressMetrics(playerId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const qStats = this.game4uUserQuery(playerId, month);
      const qActions =
        month != null ? this.game4uUserQueryActionsForCompetenceMonth(playerId, month) : qStats;
      if (!qStats || !qActions) {
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }
      return forkJoin({
        stats: this.game4u.getGameStats(qStats),
        actions: this.game4u.getGameActions(qActions)
      }).pipe(
        map(({ stats, actions }) => {
          if (month != null) {
            const byCompetence = filterGame4uActionsByCompetenceMonth(actions, month);
            const processo = mapGame4uActionsToProcessMetrics(byCompetence);
            const circular = getGame4uMonthlyPointsCircularFromActionStats(stats);
            if (circular) {
              return {
                activity: {
                  pendentes: 0,
                  emExecucao: 0,
                  finalizadas: circular.finalizadas,
                  pontos: circular.pontosDone,
                  pontosDone: circular.pontosDone,
                  pontosTodosStatus: circular.pontosTodosStatus
                },
                processo
              };
            }
            const pts = computeMonthlyPointsFromGame4uActions(byCompetence);
            return {
              activity: {
                pendentes: 0,
                emExecucao: 0,
                finalizadas: pts.finalizadas,
                pontos: pts.pontos,
                pontosDone: pts.pontosDone,
                pontosTodosStatus: pts.pontosTodosStatus
              },
              processo
            };
          }
          const scoped = filterGame4uActionsByMonth(actions, month);
          const done = getGame4uActionStatsDone(stats);
          const finalizadas =
            stats.action_stats != null
              ? done.count
              : Math.floor(Number(stats.total_actions) || scoped.length);
          const pontos =
            stats.action_stats != null
              ? done.totalPoints
              : mapGame4uStatsToActivityMetrics(stats).pontos;
          const processo = mapGame4uActionsToProcessMetrics(scoped);
          const fromStats = mapGame4uStatsToActivityMetrics(stats);
          return {
            activity: {
              pendentes: 0,
              emExecucao: 0,
              finalizadas,
              pontos,
              pontosDone: fromStats.pontosDone,
              pontosTodosStatus: fromStats.pontosTodosStatus
            },
            processo
          };
        }),
        catchError(error => {
          console.error('Error calculating progress metrics (Game4U):', error);
          return of({
            activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
            processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
          });
        })
      );
    }

    // Cache key without month - we fetch ALL data
    const cacheKey = `metrics_${playerId}_all`;
    
    // Note: We don't cache the final result because month filtering happens here
    // The underlying methods (getAtividadesFinalizadas, getPontosForMonth, getProcessMetrics) 
    // already cache their raw data

    return forkJoin({
      finalizadas: this.getAtividadesFinalizadas(playerId, month),
      pontos: this.getPontosForMonth(playerId, month),
      processo: this.getProcessMetrics(playerId, month)
    }).pipe(
      map(({ finalizadas, pontos, processo }) => ({
        activity: {
          pendentes: 0, // Not used anymore
          emExecucao: 0, // Not used anymore
          finalizadas,
          pontos
        },
        processo
      })),
      catchError(error => {
        console.error('Error calculating progress metrics:', error);
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      })
    );
  }

  /**
   * Get list of activities for modal display
   * Returns list with attributes.acao as title
   * Fetches ALL data and filters by month on frontend
   * @param game4uActionStatus When set (ex.: `DONE` para “Tarefas finalizadas”), repassa para `GET /game/actions`.
   */
  getActivityList(
    playerId: string,
    month?: Date,
    game4uActionStatus?: Game4uUserActionStatus
  ): Observable<ActivityListItem[]> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const baseQ = this.game4uUserQuery(playerId, month);
      if (!baseQ) {
        return of([]);
      }
      const q = game4uActionStatus ? { ...baseQ, status: game4uActionStatus } : baseQ;
      return this.game4u.getGameActions(q).pipe(
        map(actions => mapGame4uActionsToActivityList(actions, month)),
        catchError(error => {
          console.error('Error fetching activity list (Game4U):', error);
          return of([]);
        })
      );
    }

    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        
        return filtered.map(a => ({
          id: a._id,
          title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
          delivery_title: a.attributes?.delivery_title || undefined,
          points: PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG,
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          player: a.userId || '',
          cnpj: a.attributes?.cnpj || undefined
        }));
      }),
      catchError(error => {
        console.error('Error fetching activity list:', error);
        return of([]);
      })
    );
  }

  /**
   * Get list of processes for modal display
   * Groups by attributes.delivery_id (number), shows attributes.delivery_title and action count
   * Note: delivery_id is a number in attributes, not a string
   * Fetches ALL data and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessList(playerId: string, month?: Date): Observable<ProcessListItem[]> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of([]);
      }
      return this.game4u.getGameActions(q).pipe(
        map(actions => mapGame4uActionsToProcessList(actions, month)),
        catchError(error => {
          console.error('Error fetching process list (Game4U):', error);
          return of([]);
        })
      );
    }

    // Cache key without month - we fetch ALL data
    const cacheKey = `${playerId}_all_process_list`;
    const cached = this.getCachedData(this.processListCache, cacheKey);
    if (cached) {
      // Filter cached data by month on frontend
      return cached.pipe(
        map((processes: ProcessListItem[]) => processes) // Return as-is, data already filtered in request
      );
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Filter by month on frontend
        const filtered = filterByMonth(userActions, month);
        
        // Group actions by attributes.delivery_id (number)
        const deliveryMap = new Map<number, { title: string; count: number; cnpj?: string }>();
        
        filtered.forEach(action => {
          const deliveryId = action.attributes?.delivery_id;
          if (deliveryId != null) {
            const existing = deliveryMap.get(deliveryId);
            if (existing) {
              existing.count++;
              // Update CNPJ if not set yet and this action has one
              if (!existing.cnpj && action.attributes?.cnpj) {
                existing.cnpj = action.attributes.cnpj;
              }
            } else {
              deliveryMap.set(deliveryId, {
                title: action.attributes?.delivery_title || `Processo ${deliveryId}`,
                count: 1,
                cnpj: action.attributes?.cnpj
              });
            }
          }
        });

        const deliveryIds = [...deliveryMap.keys()];
        
        console.log('📊 Process list - unique delivery_ids (filtered on frontend):', deliveryIds);

        if (deliveryIds.length === 0) {
          return of([]);
        }

        // Check which processes are finalized (have desbloquear action with matching attributes.delivery)
        // NO time filtering here - we check if ANY desbloquear exists
        const aggregateBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];

        console.log('📊 Process finalization query (no time filter):', JSON.stringify(aggregateBody));

        return this.backendApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const finalizedIds = new Set(desbloqueados.map(d => d._id));
            console.log('📊 Finalized delivery_ids:', [...finalizedIds]);
            
            return deliveryIds.map(deliveryId => {
              const info = deliveryMap.get(deliveryId)!;
              return {
                deliveryId: String(deliveryId),
                title: info.title,
                actionCount: info.count,
                isFinalized: finalizedIds.has(deliveryId),
                cnpj: info.cnpj
              };
            });
          }),
          catchError(() => {
            // If desbloquear query fails, return all as not finalized
            return of(deliveryIds.map(deliveryId => {
              const info = deliveryMap.get(deliveryId)!;
              return {
                deliveryId: String(deliveryId),
                title: info.title,
                actionCount: info.count,
                isFinalized: false,
                cnpj: info.cnpj
              };
            }));
          })
        );
      }),
      catchError(error => {
        console.error('Error fetching process list:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.processListCache, cacheKey, request$);
    return request$;
  }

  /**
   * Lista de clientes (CNPJ) com contagem de ações no período.
   * Funifier: action_log filtrado por mês no cliente (`time`).
   * Game4U com mês: user-actions na competência (`delivery_id` ou `created_at`), **só status final**
   * (`DONE` / `DELIVERED` / `PAID`), agrupadas por `integration_id` ou, em falta, `client_id` ou `delivery_id`.
   * Temporada: entregas (`/game/deliveries`).
   */
  getPlayerCnpjListWithCount(
    playerId: string,
    month?: Date
  ): Observable<{ cnpj: string; actionCount: number; delivery_title?: string; deliveryId?: string }[]> {
      // Month must be part of the key: the inner map closes over `month` when the cached observable is built.
      const monthKey = this.getMonthCacheKey(month);
      const cacheKey = `${playerId}_cnpj_list_count_${monthKey}`;
      const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
      if (cached) {
        return cached;
      }

      if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
        if (month != null) {
          const qActions = this.game4uUserQueryActionsForCompetenceMonth(playerId, month);
          if (!qActions) {
            return of([]);
          }
          const request$ = this.game4u.getGameActions(qActions).pipe(
            map(actions => {
              const scoped = filterGame4uActionsByCompetenceMonth(actions, month);
              const byCnpj = new Map<
                string,
                { actionCount: number; delivery_title?: string; delivery_id?: string }
              >();
              for (const a of scoped) {
                if (!isGame4uUserActionFinalizedStatus(a.status)) {
                  continue;
                }
                const cnpj = getGame4uParticipationRowKey(a);
                if (!cnpj) {
                  continue;
                }
                const cur = byCnpj.get(cnpj) || { actionCount: 0 };
                cur.actionCount += 1;
                const did =
                  a.delivery_id != null && String(a.delivery_id).trim() !== ''
                    ? String(a.delivery_id).trim()
                    : '';
                if (did && !cur.delivery_id) {
                  cur.delivery_id = did;
                }
                const dt =
                  typeof a.delivery_title === 'string' ? a.delivery_title.trim() : '';
                if (dt && !cur.delivery_title) {
                  cur.delivery_title = dt;
                }
                byCnpj.set(cnpj, cur);
              }
              return [...byCnpj.entries()].map(([cnpj, v]) => {
                const row: {
                  cnpj: string;
                  actionCount: number;
                  delivery_title?: string;
                  deliveryId?: string;
                } = {
                  cnpj,
                  actionCount: v.actionCount
                };
                if (v.delivery_title) {
                  row.delivery_title = v.delivery_title;
                }
                if (v.delivery_id) {
                  row.deliveryId = v.delivery_id;
                }
                return row;
              });
            }),
            catchError(error => {
              console.error('Error fetching player CNPJs (Game4U actions / competence):', error);
              return of([]);
            }),
            shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
          );
          this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
          return request$;
        }

        const q = this.game4uUserQuery(playerId, month);
        if (!q) {
          return of([]);
        }
        const request$ = forkJoin({
          delivered: this.game4u.getGameDeliveries({ ...q, status: 'DELIVERED' }),
          incomplete: this.game4u.getGameDeliveries({ ...q, status: 'INCOMPLETE' }),
          pending: this.game4u.getGameDeliveries({ ...q, status: 'PENDING' })
        }).pipe(
          map(({ delivered, incomplete, pending }) =>
            mergeGame4uDeliveryParticipation(delivered, incomplete, pending)
          ),
          catchError(error => {
            console.error('Error fetching player deliveries (Game4U):', error);
            return of([]);
          }),
          shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
        );
        this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
        return request$;
      }

      // NO time filtering - fetch ALL action logs and filter on frontend
      const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
        map(actions => {
          // Filter by month on frontend
          const filtered = filterByMonth(actions, month);
          
          // Group by CNPJ and count
          const cnpjMap = new Map<string, number>();
          filtered.forEach(action => {
            const cnpj = action.attributes?.cnpj;
            if (cnpj) {
              cnpjMap.set(cnpj, (cnpjMap.get(cnpj) || 0) + 1);
            }
          });
          
          const result = Array.from(cnpjMap.entries()).map(([cnpj, count]) => ({
            cnpj,
            actionCount: count
          }));
          
          console.log('📊 Player CNPJs with count (filtered on frontend):', result.length, 'unique CNPJs');
          return result;
        }),
        catchError(error => {
          console.error('Error fetching player CNPJs with count:', error);
          return of([]);
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
      );

      this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
      return request$;
    }


  /**
   * Get list of unique CNPJs from player's action_log
   * Uses userId field and time field with Funifier relative dates
   */
  getPlayerCnpjList(playerId: string, month?: Date): Observable<string[]> {
    return this.getPlayerCnpjListWithCount(playerId, month).pipe(
      map(items => items.map(i => i.cnpj))
    );
  }

  /**
   * Get list of unique CNPJs from player's action_log WITHOUT filtering by executor,
   * aggregated across ALL users (matches modal-company-carteira-detail behavior).
   *
   * IMPORTANT: this method is intended for "carteira list" counters; it counts
   * all actions (independent of status) for the given CNPJ ids.
   * 
   * NO time filtering in aggregate - filtering done on frontend
   */
  getCnpjListWithCountForAllExecutors(
    cnpjList: string[],
    month?: Date
  ): Observable<{ cnpj: string; actionCount: number }[]> {
    const normalized = Array.from(new Set((cnpjList || []).filter(Boolean))).map(String);
    const monthKey = this.getMonthCacheKey(month);
    const cacheKey = `all_global_cnpj_list_count_${monthKey}_${normalized.sort().join(',')}`;

    const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    if (normalized.length === 0) {
      return of([]);
    }

    // NO time filtering - fetch ALL actions for these CNPJs
    const actionCountBody = [
      {
        $match: {
          'attributes.cnpj': { $in: normalized }
        }
      },
      {
        $project: {
          cnpj: '$attributes.cnpj',
          time: 1
        }
      }
    ];

    const request$ = this.backendApi.post<{ _id: string; cnpj: string; time?: number | { $date: string } }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      actionCountBody
    ).pipe(
      map(actionResponse => {
        // Filter by month on frontend
        const filtered = filterByMonth(actionResponse as any, month);
        
        // Group by CNPJ and count
        const cnpjMap = new Map<string, number>();
        filtered.forEach((action: any) => {
          const cnpj = action.cnpj;
          if (cnpj) {
            cnpjMap.set(cnpj, (cnpjMap.get(cnpj) || 0) + 1);
          }
        });
        
        return Array.from(cnpjMap.entries()).map(([cnpj, count]) => ({
          cnpj,
          actionCount: count
        }));
      }),
      catchError(error => {
        console.error('Error fetching global CNPJ counts:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    // Cache using existing cache map.
    this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
    return request$;
  }

  /**
   * Tarefas da empresa cruzadas com POST `action_log/aggregate?strict=true`.
   * O identificador da linha da carteira pode ser `attributes.cnpj` ou `attributes.deal` (ex.: aggregate da equipa).
   * Filtro de mês no cliente (filterByMonth), como nas outras leituras de action_log.
   */
  getActionsByCnpj(
    companyKey: string,
    month?: Date,
    options?: GetActionsByCompanyKeyOptions
  ): Observable<ClienteActionItem[]> {
    const monthKey = this.getMonthCacheKey(month);
    const optUser = options?.userId?.trim() || '';
    const optTeam = options?.teamId?.trim() || '';
    const cacheKey = `${companyKey}_actions_company_${monthKey}_u_${optUser || 'all'}_t_${optTeam || 'all'}`;
    const cached = this.getCachedData(this.actionsByCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    const variants = buildCompanyIdentifierVariants(companyKey);
    if (variants.length === 0) {
      return of([]);
    }

    const companyOr = {
      $or: [
        { 'attributes.cnpj': { $in: variants } },
        { 'attributes.deal': { $in: variants } }
      ]
    };

    let aggregateBody: object[];
    if (optUser) {
      aggregateBody = [
        { $match: { $and: [companyOr, { userId: optUser }] } },
        { $sort: { time: -1 } },
        { $limit: 1000 }
      ];
    } else if (optTeam) {
      aggregateBody = [
        {
          $lookup: {
            from: 'player',
            localField: 'userId',
            foreignField: '_id',
            as: 'playerData'
          }
        },
        { $unwind: '$playerData' },
        {
          $match: {
            $and: [{ 'playerData.teams': optTeam }, companyOr]
          }
        },
        { $sort: { time: -1 } },
        { $limit: 1000 }
      ];
    } else {
      aggregateBody = [{ $match: companyOr }, { $sort: { time: -1 } }, { $limit: 1000 }];
    }

    console.log('📊 Actions by company key (action_log aggregate):', JSON.stringify(aggregateBody));

    const request$ = this.backendApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        console.log('📊 Actions by company key response:', actions?.length || 0, 'entries');

        const filtered = filterByMonth(actions, month);

        return filtered.map(a => ({
          id: a._id,
          title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
          player: a.userId || '',
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          processTitle: a.attributes?.delivery_title || undefined
        }));
      }),
      catchError(error => {
        console.error('Error fetching actions by company key:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionsByCnpjCache, cacheKey, request$);
    return request$;
  }

  /**
   * Tarefas do colaborador para um cliente (CNPJ/deal), usando o mesmo conjunto de dados do painel:
   * `getPlayerActionLogForMonth` → mesmo aggregate paginado `{ $match: { userId } }, { $sort: { time: -1 } }` do carregamento inicial.
   * Filtra no cliente por `attributes.cnpj` / `attributes.deal` alinhado à lista de participação.
   */
  getUserActionsForCompanyUsingPlayerActionLog(
    playerId: string,
    companyKey: string,
    month?: Date
  ): Observable<ClienteActionItem[]> {
    return this.getPlayerActionLogForMonth(playerId).pipe(
      map(actions => {
        const matched = actions.filter(a => actionLogEntryMatchesCompanyKey(a, companyKey));
        const filtered = filterByMonth(matched, month);
        filtered.sort((a, b) => extractTimestamp(b.time) - extractTimestamp(a.time));
        return filtered.map(a => ({
          id: a._id,
          title:
            a.attributes?.delivery_title ||
            a.attributes?.acao ||
            a.action_title ||
            a.actionId ||
            'Ação sem título',
          player: a.userId || '',
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          processTitle: a.attributes?.delivery_title || undefined
        }));
      }),
      catchError(error => {
        console.error('Error in getUserActionsForCompanyUsingPlayerActionLog:', error);
        return of([]);
      })
    );
  }

  /**
   * Get cliente list with actions for carteira section
   */
  getCarteiraClientes(playerId: string, month?: Date): Observable<ClienteListItem[]> {
    return this.getPlayerCnpjList(playerId, month).pipe(
      switchMap(cnpjs => {
        if (cnpjs.length === 0) {
          return of([]);
        }

        // Fetch actions for each CNPJ
        const requests = cnpjs.map(cnpj =>
          this.getActionsByCnpj(cnpj, month, { userId: playerId }).pipe(
            map(actions => ({ cnpj, actions }))
          )
        );

        return forkJoin(requests);
      }),
      catchError(error => {
        console.error('Error fetching carteira clientes:', error);
        return of([]);
      })
    );
  }

  /**
   * Get activities for a specific process (delivery_id)
   * Returns list of activities for the given delivery_id
   * NO time filtering in aggregate - filtering done on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByProcess(deliveryId: number, playerId: string, month?: Date): Observable<ActivityListItem[]> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `${playerId}_${deliveryId}_all_activities_by_process`;
    const cached = this.getCachedData(this.activitiesByProcessCache, cacheKey);
    if (cached) {
      return cached;
    }

    // NO time filtering - fetch ALL activities for this process
    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          'attributes.delivery_id': deliveryId
        }
      },
      { $sort: { time: -1 } }
    ];

    console.log('📊 Activities by process query (ALL data, no time filter):', JSON.stringify(aggregateBody));

    const request$ = this.backendApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        console.log('📊 Activities by process response (ALL):', actions?.length || 0, 'entries');
        
        // Filter by month on frontend
        const filtered = filterByMonth(actions, month);
        
        return filtered.map(a => {
          // Determine status based on action data
          let status: 'finalizado' | 'pendente' | 'dispensado' | undefined;
          
          // Check if action is dismissed (highest priority)
          if (a.extra?.['dismissed'] === true || a.attributes?.['dismissed'] === true || a.status === 'CANCELLED') {
            status = 'dispensado';
          }
          // Check if action is completed/finalized
          else if (a.extra?.processed === true || 
                   a.status === 'DONE' || 
                   a.status === 'DELIVERED' ||
                   a.actionId === 'desbloquear') {
            status = 'finalizado';
          }
          // Check if action is pending or in progress
          else if (a.status === 'PENDING' || 
                   a.status === 'DOING' || 
                   a.status === 'INCOMPLETE' ||
                   !a.status) {
            status = 'pendente';
          }

          return {
            id: a._id,
            title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
            delivery_title: a.attributes?.delivery_title || undefined,
            points: PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG,
            created: extractTimestamp(a.time as number | { $date: string } | undefined),
            player: a.userId || '',
            status,
            cnpj: a.attributes?.cnpj || undefined
          };
        });
      }),
      catchError(error => {
        console.error('Error fetching activities by process:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.activitiesByProcessCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get activities count grouped by day of the month
   * Returns an array with count for each day of the month
   * NO time filtering in aggregate - filtering done on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByDay(playerId: string, month?: Date): Observable<{ day: number; count: number }[]> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `${playerId}_all_activities_by_day`;
    const cached = this.getCachedData(this.activitiesByDayCache, cacheKey);
    if (cached) {
      // Filter cached data by month on frontend
      return cached;
    }

    // Fetch ALL action logs and group by day on frontend
    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Filter by month on frontend
        const filtered = filterByMonth(actions, month);
        
        // Group by day
        const dayMap = new Map<number, number>();
        filtered.forEach(action => {
          const timestamp = extractTimestamp(action.time);
          if (timestamp > 0) {
            const day = new Date(timestamp).getDate();
            dayMap.set(day, (dayMap.get(day) || 0) + 1);
          }
        });
        
        const result = Array.from(dayMap.entries())
          .map(([day, count]) => ({ day, count }))
          .sort((a, b) => a.day - b.day);
        
        console.log('📊 Activities by day (filtered on frontend):', result);
        return result;
      }),
      catchError(error => {
        console.error('Error fetching activities by day:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.activitiesByDayCache, cacheKey, request$);
    return request$;
  }

  /**
   * Clear all caches
   */
  /**
   * Get unique deals from action_log (attributes.deals) for a player.
   * Fetches ALL data and filters by month on frontend.
   */
  getUniqueDeals(playerId: string, month?: Date): Observable<string[]> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        const dealsSet = new Set<string>();
        filtered.forEach(action => {
          const deals = (action.attributes as any)?.deals;
          if (typeof deals === 'string' && deals.trim()) {
            dealsSet.add(deals.trim());
          } else if (Array.isArray(deals)) {
            deals.forEach((d: string) => {
              if (typeof d === 'string' && d.trim()) {
                dealsSet.add(d.trim());
              }
            });
          }
        });
        console.log('📊 Unique deals (filtered on frontend):', dealsSet.size);
        return Array.from(dealsSet);
      }),
      catchError(error => {
        console.error('Error fetching unique deals:', error);
        return of([]);
      })
    );
  }

  clearCache(): void {
    this.actionLogCache.clear();
    this.metricsCache.clear();
    this.activityCountCache.clear();
    this.uniqueClientesCache.clear();
    this.cnpjListWithCountCache.clear();
    this.activitiesByDayCache.clear();
    this.activitiesByProcessCache.clear();
    this.processListCache.clear();
    this.processFinalizationCache.clear();
    this.actionsByCnpjCache.clear();
    this.processMetricsCache.clear();
    this.pontosForMonthCache.clear();
    this.monthlyPointsBreakdownCache.clear();
    this.teamMetricsCache.clear();
    this.teamCnpjCache.clear();
    this.teamPointsBreakdownCache.clear();
  }

  // ============================================
  // TEAM AGGREGATE METHODS (OPTIMIZED)
  // These methods use $lookup to fetch data for all team members in a single query
  // ============================================

  private teamMetricsCache = new Map<string, CacheEntry<any>>();
  private teamCnpjCache = new Map<string, CacheEntry<any>>();
  private teamPointsBreakdownCache = new Map<string, CacheEntry<any>>();

  /**
   * Get progress metrics for all team members in a single aggregate query.
   * Uses $lookup to join player data and filter by team.
   * NO time filtering in aggregate - filtering done on frontend
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering (done on frontend)
   * @returns Observable of aggregated metrics for the team
   */
  getTeamProgressMetrics(teamId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `team_metrics_${teamId}_all`;
    const cached = this.getCachedData(this.teamMetricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    // NO time filtering - fetch ALL data for the team
    // Single aggregate query to get all action counts for the team
    const activityAggregateBody = [
      {
        $lookup: {
          from: 'player',
          localField: 'userId',
          foreignField: '_id',
          as: 'playerData'
        }
      },
      {
        $unwind: '$playerData'
      },
      {
        $match: {
          'playerData.teams': teamId
        }
      },
      {
        $project: {
          time: 1,
          actionId: 1,
          'attributes.delivery': 1,
          'attributes.delivery_id': 1
        }
      }
    ];

    console.log('📊 Team progress metrics query (ALL data, no time filter) for team:', teamId);

    const request$ = this.backendApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', activityAggregateBody).pipe(
      switchMap(allActions => {
        // Filter by month on frontend
        const filtered = filterByMonth(allActions, month);
        const finalizadas = filtered.length;
        
        // Get unique delivery_ids
        const deliveryIds = [...new Set(
          filtered
            .map(a => a.attributes?.delivery_id)
            .filter((id): id is number => id != null)
        )];
        
        if (deliveryIds.length === 0) {
          return of({
            activity: { pendentes: 0, emExecucao: 0, finalizadas, pontos: 0 },
            processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
          });
        }
        
        // Query for desbloquear actions (no time filter)
        const desbloqueadosBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];
        
        return this.backendApi.post<{ _id: number }[]>('/v3/database/action_log/aggregate?strict=true', desbloqueadosBody).pipe(
          map(desbloqueados => {
            const desbloqueadosIds = new Set(desbloqueados.map(d => d._id));
            const processosFinalizados = deliveryIds.filter(id => desbloqueadosIds.has(id)).length;
            const processosIncompletos = deliveryIds.length - processosFinalizados;

            console.log('✅ Team progress metrics loaded (filtered on frontend):', {
              finalizadas,
              processosFinalizados,
              totalProcessos: deliveryIds.length,
              processosIncompletos
            });

            return {
              activity: {
                pendentes: 0,
                emExecucao: 0,
                finalizadas,
                pontos: 0 // Points are loaded separately
              },
              processo: {
                pendentes: 0,
                incompletas: processosIncompletos,
                finalizadas: processosFinalizados
              }
            };
          }),
          catchError(() => of({
            activity: { pendentes: 0, emExecucao: 0, finalizadas, pontos: 0 },
            processo: { pendentes: 0, incompletas: deliveryIds.length, finalizadas: 0 }
          }))
        );
      }),
      catchError(error => {
        console.error('Error fetching team progress metrics:', error);
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamMetricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get CNPJ list with action counts for all team members in a single aggregate query.
   * Uses $lookup to join player data and filter by team.
   * NO time filtering in aggregate - filtering done on frontend
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering (done on frontend)
   * @returns Observable of CNPJ list with action and process counts
   */
  getTeamCnpjListWithCount(teamId: string, month?: Date): Observable<{ cnpj: string; actionCount: number; processCount: number }[]> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `team_cnpj_${teamId}_all`;
    const cached = this.getCachedData(this.teamCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    // NO time filtering - fetch ALL data for the team
    const actionCountBody = [
      {
        $lookup: {
          from: 'player',
          localField: 'userId',
          foreignField: '_id',
          as: 'playerData'
        }
      },
      {
        $unwind: '$playerData'
      },
      {
        $match: {
          'playerData.teams': teamId,
          'attributes.cnpj': { $ne: null }
        }
      },
      {
        $project: {
          cnpj: '$attributes.cnpj',
          time: 1
        }
      }
    ];
    
    console.log('📊 Team CNPJ list query (ALL data, no time filter) for team:', teamId);

    const request$ = this.backendApi.post<{ _id: string; cnpj: string; time?: number | { $date: string } }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      actionCountBody
    ).pipe(
      map(actionResponse => {
        // Filter by month on frontend
        const filtered = filterByMonth(actionResponse as any, month);
        
        // Group by CNPJ and count
        const cnpjMap = new Map<string, number>();
        filtered.forEach((action: any) => {
          const cnpj = action.cnpj;
          if (cnpj) {
            cnpjMap.set(cnpj, (cnpjMap.get(cnpj) || 0) + 1);
          }
        });
        
        const result = Array.from(cnpjMap.entries()).map(([cnpj, count]) => ({
          cnpj,
          actionCount: count,
          processCount: 0
        }));

        console.log('✅ Team CNPJ list loaded (filtered on frontend):', result.length, 'unique CNPJs');
        return result;
      }),
      catchError(error => {
        console.error('Error fetching team CNPJ list:', error);
        return of([] as { cnpj: string; actionCount: number; processCount: number }[]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamCnpjCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get cached data if valid
   */
  private getCachedData<T>(cache: Map<string, CacheEntry<T>>, key: string): Observable<T> | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_DURATION) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached data
   */
  private setCachedData<T>(cache: Map<string, CacheEntry<T>>, key: string, data: Observable<T>): void {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
