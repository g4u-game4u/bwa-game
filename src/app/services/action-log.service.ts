import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { ActivityMetrics, ProcessMetrics } from '@model/gamification-dashboard.model';

export interface ActionLogEntry {
  _id: string;
  actionId: string; // Action type identifier (e.g., 'acessorias', 'desbloquear')
  userId: string; // User's email
  time: number | { $date: string }; // Timestamp when action was logged (can be number or { $date: "ISO string" })
  attributes?: {
    delivery_title?: string; // Process title
    delivery_id?: number; // Process ID (number)
    delivery?: number; // Used in desbloquear action to reference delivery_id
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

export interface ActivityListItem {
  id: string;
  title: string; // attributes.acao
  points: number;
  created: number;
  player?: string; // userId (email do executor)
  status?: 'finalizado' | 'pendente' | 'dispensado'; // Status da atividade
  cnpj?: string; // CNPJ da empresa associada à atividade
}

export interface ProcessListItem {
  deliveryId: string;
  title: string; // delivery_title
  actionCount: number;
  isFinalized: boolean;
  cnpj?: string; // CNPJ da empresa associada ao processo
}

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
 * - When month is undefined (Toda temporada), returns full season range (01/01/2026 to 30/04/2026)
 * - When a specific month is selected, returns only that month's range
 * - Minimum date is always 01/01/2026
 */
function getRelativeDateExpression(month: Date | undefined, position: 'start' | 'end'): { $date: string } | number {
  // Season dates
  const seasonStartDate = new Date('2026-01-01T00:00:00.000Z');
  const seasonEndDate = new Date('2026-04-30T23:59:59.999Z');
  
  // If month is undefined, return full season range
  if (!month) {
    if (position === 'start') {
      return { $date: seasonStartDate.toISOString() };
    } else {
      return { $date: seasonEndDate.toISOString() };
    }
  }
  
  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();
  
  // Calculate the start or end of the selected month
  if (position === 'start') {
    const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0);
    // Ensure we don't go before season start
    if (monthStart < seasonStartDate) {
      return { $date: seasonStartDate.toISOString() };
    }
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
  // Season dates
  const seasonStartDate = new Date('2026-01-01T00:00:00.000Z');
  const seasonEndDate = new Date('2026-04-30T23:59:59.999Z');
  
  // If month is undefined, return full season range
  if (!month) {
    if (position === 'start') {
      return seasonStartDate.getTime();
    } else {
      return seasonEndDate.getTime();
    }
  }

  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();

  if (position === 'start') {
    const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0);
    return monthStart < seasonStartDate ? seasonStartDate.getTime() : monthStart.getTime();
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
 * If month is undefined, returns all entries within the season (01/01/2026 to 30/04/2026).
 * If month is specified, returns only entries from that month.
 * 
 * @param entries - Array of entries with a 'time' field
 * @param month - Target month to filter by (undefined = entire season)
 * @returns Filtered array of entries
 */
function filterByMonth<T extends { time?: number | { $date: string } }>(entries: T[], month: Date | undefined): T[] {
  const seasonStartMs = new Date('2026-01-01T00:00:00.000Z').getTime();
  const seasonEndMs = new Date('2026-04-30T23:59:59.999Z').getTime();
  
  if (!month) {
    // Filter by entire season
    return entries.filter(entry => {
      const timestamp = extractTimestamp(entry.time);
      return timestamp >= seasonStartMs && timestamp <= seasonEndMs;
    });
  }
  
  // Filter by specific month
  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();
  const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0).getTime();
  const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999).getTime();
  
  return entries.filter(entry => {
    const timestamp = extractTimestamp(entry.time);
    return timestamp >= monthStart && timestamp <= monthEnd;
  });
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

  constructor(private funifierApi: FunifierApiService) {}

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

    return this.funifierApi.post<ActionLogEntry[]>(
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
  getCompletedTasksCount(playerId: string): Observable<number> {
    return this.getAtividadesFinalizadas(playerId);
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

    return this.funifierApi.post<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]>(
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
   * Get points from achievements based on delivery_ids from action_log
   * 
   * Flow:
   * 1. Get action_log entries for the player (filtered by month on frontend)
   * 2. Extract unique delivery_ids from attributes.delivery_id
   * 3. Query achievement collection with those delivery_ids using extra.delivery
   * 4. Sum the total field
   * 
   * Achievement query format:
   * [
   *   { $match: { type: 0, "extra.delivery": { $in: [delivery_ids...] } } },
   *   { $group: { _id: null, total_sum: { $sum: "$total" } } }
   * ]
   */
  getPontosForMonth(playerId: string, month?: Date): Observable<number> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(actions => {
        // Filter by month on frontend
        const filtered = filterByMonth(actions, month);
        
        // Extract unique delivery_ids from action_log
        const deliveryIds = [...new Set(
          filtered
            .map(a => a.attributes?.delivery_id)
            .filter((id): id is number => id != null && typeof id === 'number')
        )];
        
        console.log('📊 Delivery IDs for points query:', deliveryIds.length, 'unique IDs');
        
        if (deliveryIds.length === 0) {
          console.log('📊 No delivery IDs found, returning 0 points');
          return of(0);
        }
        
        // Query achievement collection with delivery_ids
        const aggregateBody = [
          {
            $match: {
              type: 0, // type 0 = points
              'extra.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: null,
              total_sum: { $sum: '$total' }
            }
          }
        ];
        
        return this.funifierApi.post<{ _id: null; total_sum: number }[]>(
          '/v3/database/achievement/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(response => {
            const total = response?.[0]?.total_sum || 0;
            console.log('📊 Achievement points from delivery_ids:', total);
            return total;
          }),
          catchError(error => {
            console.error('Error fetching achievement points:', error);
            return of(0);
          })
        );
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

        return this.funifierApi.post<{ _id: number }[]>(
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
   * All data is fetched without time filtering, then filtered by month on frontend
   */
  getProgressMetrics(playerId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
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
   */
  getActivityList(playerId: string, month?: Date): Observable<ActivityListItem[]> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
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
            points: a.points || 0,
            created: extractTimestamp(a.time as number | { $date: string } | undefined),
            player: a.userId || '',
            status,
            cnpj: a.attributes?.cnpj || undefined
          };
        });
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

        return this.funifierApi.post<{ _id: number }[]>(
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
   * Get list of unique CNPJs from player's action_log WITH action count
   * Returns CNPJ, action count, and unique process count (delivery_id) for each CNPJ
   * Uses userId field and time field with Funifier relative dates
   * Cached with shareReplay to avoid duplicate requests
   */
  getPlayerCnpjListWithCount(playerId: string, month?: Date): Observable<{ cnpj: string; actionCount: number }[]> {
      // Cache key without month - we fetch ALL data
      const cacheKey = `${playerId}_all_cnpj_list_count`;
      const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
      if (cached) {
        return cached;
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

    const request$ = this.funifierApi.post<{ _id: string; cnpj: string; time?: number | { $date: string } }[]>(
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
   * Get all actions for a specific CNPJ (by all players)
   * NO time filtering in aggregate - filtering done on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getActionsByCnpj(cnpj: string, month?: Date): Observable<ClienteActionItem[]> {
    const monthKey = this.getMonthCacheKey(month);
    const cacheKey = `${cnpj}_actions_by_cnpj_${monthKey}`;
    const cached = this.getCachedData(this.actionsByCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    // NO time filtering - fetch ALL actions for this CNPJ
    const aggregateBody = [
      {
        $match: {
          'attributes.cnpj': cnpj
        }
      },
      { $sort: { time: -1 } },
      { $limit: 1000 } // Increased limit since we're fetching all data
    ];

    console.log('📊 Actions by CNPJ query (ALL data, no time filter):', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        console.log('📊 Actions by CNPJ response (ALL):', actions?.length || 0, 'entries');
        
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
          // Default to pendente if status is unknown
          else {
            status = 'pendente';
          }
          
          return {
            id: a._id,
            title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
            player: a.userId || '',
            created: extractTimestamp(a.time as number | { $date: string } | undefined),
            status,
            cnpj: a.attributes?.cnpj || undefined
          };
        });
      }),
      catchError(error => {
        console.error('Error fetching actions by CNPJ:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionsByCnpjCache, cacheKey, request$);
    return request$;
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
          this.getActionsByCnpj(cnpj, month).pipe(
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

    const request$ = this.funifierApi.post<ActionLogEntry[]>(
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
            points: a.points || 0,
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

    const request$ = this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', activityAggregateBody).pipe(
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
        
        return this.funifierApi.post<{ _id: number }[]>('/v3/database/action_log/aggregate?strict=true', desbloqueadosBody).pipe(
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

    const request$ = this.funifierApi.post<{ _id: string; cnpj: string; time?: number | { $date: string } }[]>(
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
