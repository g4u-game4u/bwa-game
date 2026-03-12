﻿﻿﻿import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { ActivityMetrics, ProcessMetrics } from '@model/gamification-dashboard.model';
import dayjs from 'dayjs';

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
  cnpj?: string; // CNPJ da empresa associada Ã  atividade
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
 * Helper to generate Funifier date expressions using ISO format
 * 
 * NOTE: Funifier's relative date shortcuts (-0M-, -0M+, etc.) were found to be
 * unreliable in aggregate queries. Using ISO date strings instead for consistency.
 * 
 * @param month - Target month (if undefined, uses current month)
 * @param position - 'start' for beginning of month, 'end' for end of month
 * @returns Funifier date expression with ISO string like { $date: "2026-03-01T00:00:00.000Z" }
 */
function getRelativeDateExpression(month: Date | undefined, position: 'start' | 'end'): { $date: string } {
  const targetMonth = month || new Date();
  
  const year = targetMonth.getFullYear();
  const monthNum = targetMonth.getMonth();
  
  let date: Date;
  if (position === 'start') {
    // Start of month: first day at 00:00:00.000 UTC
    date = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0));
  } else {
    // End of month: last day at 23:59:59.999 UTC
    // Get first day of next month, then subtract 1ms
    date = new Date(Date.UTC(year, monthNum + 1, 1, 0, 0, 0, 0));
    date = new Date(date.getTime() - 1);
  }
  
  return { $date: date.toISOString() };
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
  private cnpjListWithCountCache = new Map<string, CacheEntry<{ cnpj: string; actionCount: number; processCount: number }[]>>();
  private activitiesByDayCache = new Map<string, CacheEntry<{ day: number; count: number }[]>>();
  private activitiesByProcessCache = new Map<string, CacheEntry<ActivityListItem[]>>();
  private processListCache = new Map<string, CacheEntry<ProcessListItem[]>>();
  private processFinalizationCache = new Map<string, CacheEntry<Set<number>>>();
  private actionsByCnpjCache = new Map<string, CacheEntry<ClienteActionItem[]>>();
  private processMetricsCache = new Map<string, CacheEntry<ProcessMetrics>>();
  private pontosForMonthCache = new Map<string, CacheEntry<number>>();
  private monthlyPointsBreakdownCache = new Map<string, CacheEntry<{ bloqueados: number; desbloqueados: number }>>();
  // Cache for all action log entries (no date filter)
  private allActionLogCache = new Map<string, CacheEntry<ActionLogEntry[]>>();

  constructor(private funifierApi: FunifierApiService) {}

  /**
   * Get ALL action log entries for a player (no date filter)
   * Uses pagination with Range header to fetch all entries
   * Results are cached and filtered by month on the frontend
   */
  getAllPlayerActionLog(playerId: string): Observable<ActionLogEntry[]> {
    const cacheKey = `all_${playerId}`;
    const cached = this.getCachedData(this.allActionLogCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Aggregate query to get ALL action log for this player (no date filter)
    const aggregateBody = [
      { 
        $match: { 
          userId: playerId
        } 
      },
      { $sort: { time: -1 } }
    ];

    const request$ = this.fetchAllActionLogPaginated(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody,
      100, // batch size
      0,   // start index
      []   // accumulated results
    ).pipe(
      map(response => {
        return response;
      }),
      catchError(() => {
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.allActionLogCache, cacheKey, request$);
    return request$;
  }

  /**
   * Fetch all action log entries with pagination using Range header
   * Recursively fetches batches until all data is retrieved
   */
  private fetchAllActionLogPaginated(
    endpoint: string,
    aggregateBody: any[],
    batchSize: number,
    startIndex: number = 0,
    accumulatedResults: ActionLogEntry[] = []
  ): Observable<ActionLogEntry[]> {
    // Set Range header: "items=startIndex-batchSize"
    const rangeHeader = `items=${startIndex}-${batchSize}`;

    return this.funifierApi.post<ActionLogEntry[]>(
      endpoint,
      aggregateBody,
      { headers: { 'Range': rangeHeader } }
    ).pipe(
      switchMap(response => {
        // Handle response format
        let batchResults: ActionLogEntry[] = [];
        if (response && Array.isArray(response)) {
          batchResults = response;
        }

        // Accumulate results
        const allResults = [...accumulatedResults, ...batchResults];

        // If we got a full batch, there might be more data - recursively fetch
        if (batchResults.length === batchSize) {
          const nextIndex = startIndex + batchSize;
          // Recursively fetch next batch
          return this.fetchAllActionLogPaginated(endpoint, aggregateBody, batchSize, nextIndex, allResults);
        } else {
          // Last batch (partial or empty), return all accumulated results
          return of(allResults);
        }
      }),
      catchError(() => {
        // Return accumulated results so far on error
        return of(accumulatedResults);
      })
    );
  }

  /**
   * Filter action log entries by month on the frontend
   * @param entries - All action log entries
   * @param month - Target month to filter by
   * @returns Filtered entries for the specified month
   */
  private filterEntriesByMonth(entries: ActionLogEntry[], month?: Date): ActionLogEntry[] {
    const targetMonth = month || new Date();
    const year = targetMonth.getFullYear();
    const monthNum = targetMonth.getMonth();

    // Calculate month boundaries
    const startOfMonth = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0)).getTime();
    const endOfMonth = new Date(Date.UTC(year, monthNum + 1, 1, 0, 0, 0, 0)).getTime() - 1;

    return entries.filter(entry => {
      const timestamp = extractTimestamp(entry.time as number | { $date: string } | undefined);
      return timestamp >= startOfMonth && timestamp <= endOfMonth;
    });
  }

  /**
   * Get action log entries for a player for a specific month
   * Fetches ALL entries and filters by month on the frontend
   * This approach avoids Funifier aggregate date filtering issues
   */
  getPlayerActionLogForMonth(playerId: string, month?: Date): Observable<ActionLogEntry[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.actionLogCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch ALL entries and filter by month on frontend
    const request$ = this.getAllPlayerActionLog(playerId).pipe(
      map(allEntries => {
        const filtered = this.filterEntriesByMonth(allEntries, month);
        return filtered;
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionLogCache, cacheKey, request$);
    return request$;
  }


  /**
   * Get count of activities finalizadas (entries in action_log for the month)
   * Uses frontend filtering for reliable month filtering
   */
  getAtividadesFinalizadas(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `count_${playerId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.activityCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use frontend filtering approach - fetch all and filter by month
    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        return actions.length;
      }),
      catchError(() => {
        return of(0);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    // Store in cache
    this.setCachedData(this.activityCountCache, cacheKey, request$);
    return request$;
  }


  /**
   * Alias for getAtividadesFinalizadas for backward compatibility
   * NOTE: For season progress, this returns ALL-TIME count (no date filter)
   * to show total tasks completed during the entire season
   */
  getCompletedTasksCount(playerId: string): Observable<number> {
    const cacheKey = `count_all_${playerId}`;
    const cached = this.getCachedData(this.activityCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use frontend approach - fetch all entries and count them
    const request$ = this.getAllPlayerActionLog(playerId).pipe(
      map(actions => {
        return actions.length;
      }),
      catchError(() => {
        return of(0);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );
    
    // Store in cache
    this.setCachedData(this.activityCountCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get monthly points breakdown (blocked and unlocked)
   * Queries achievement collection for type=0 entries, separated by item field
   * Uses Funifier's relative date expressions
   * Cached with shareReplay to avoid duplicate requests
   */
  getMonthlyPointsBreakdown(playerId: string, month?: Date): Observable<{ bloqueados: number; desbloqueados: number }> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_points_breakdown`;
    const cached = this.getCachedData(this.monthlyPointsBreakdownCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          player: playerId,
          type: 0, // type 0 = points
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$item',
          total: { $sum: '$total' }
        }
      }
    ];

    const request$ = this.funifierApi.post<{ _id: string; total: number }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        let bloqueados = 0;
        let desbloqueados = 0;

        if (Array.isArray(response)) {
          response.forEach(item => {
            if (item._id === 'locked_points' || item._id === 'bloqueados') {
              bloqueados = item.total || 0;
            } else if (item._id === 'points' || item._id === 'unlocked_points' || item._id === 'desbloqueados') {
              desbloqueados = item.total || 0;
            }
          });
        }

        return { bloqueados, desbloqueados };
      }),
      catchError(() => {
        return of({ bloqueados: 0, desbloqueados: 0 });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.monthlyPointsBreakdownCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get points from achievements for the month
   * Queries achievement collection for type=0 entries
   * Uses Funifier's relative date expressions
   * Note: achievement collection uses 'time' field for timestamp
   * Cached with shareReplay to avoid duplicate requests
   */
  getPontosForMonth(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_pontos`;
    const cached = this.getCachedData(this.pontosForMonthCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          player: playerId,
          type: 0, // type 0 = points
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      }
    ];

    const request$ = this.funifierApi.post<{ _id: null; total: number }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        if (Array.isArray(response) && response.length > 0) {
          return response[0].total || 0;
        }
        return 0;
      }),
      catchError(() => {
        return of(0);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.pontosForMonthCache, cacheKey, request$);
    return request$;
  }

    /**
   * Get unique CNPJs count from user's action_log
   * 
   * OPTIMIZED: Uses the existing getAllPlayerActionLog data and filters client-side
   * instead of making a separate aggregate request with date filters.
   * 
   * Cached with shareReplay to avoid duplicate requests
   */
  getUniqueClientesCount(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_unique_cnpjs`;
    const cached = this.getCachedData(this.uniqueClientesCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use existing getAllPlayerActionLog and filter by month client-side
    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Get unique CNPJs
        const uniqueCnpjs = new Set<string>();
        
        actions.forEach(action => {
          const cnpj = action.attributes?.cnpj;
          if (cnpj) {
            uniqueCnpjs.add(cnpj);
          }
        });

        return uniqueCnpjs.size;
      }),
      catchError(() => {
        return of(0);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.uniqueClientesCache, cacheKey, request$);
    return request$;
  }


  /**
   * Get process metrics for a player
   * A Process is identified by unique attributes.delivery_id (number) in action_log
   * Process is Finalizado if there's a "desbloquear" action with attributes.delivery = delivery_id
   * Otherwise it's Pendente/Incompleto
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessMetrics(playerId: string, month?: Date): Observable<ProcessMetrics> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_process_metrics`;
    const cached = this.getCachedData(this.processMetricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Get unique delivery_ids from user's actions (attributes.delivery_id is a number)
        const deliveryIds = [...new Set(
          userActions
            .map(a => a.attributes?.delivery_id)
            .filter((id): id is number => id != null)
        )];

        if (deliveryIds.length === 0) {
          return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
        }

        // Query action_log for "desbloquear" actions with matching delivery_ids
        // Note: actionId field contains the action type, attributes.delivery matches delivery_id
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

        return this.funifierApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const desbloqueadosIds = new Set(desbloqueados.map(d => d._id));
            
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
          catchError(() => {
            return of({ pendentes: deliveryIds.length, incompletas: 0, finalizadas: 0 });
          })
        );
      }),
      catchError(() => {
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
   */
  getProgressMetrics(playerId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    const cacheKey = `metrics_${playerId}_${dayjs(month || new Date()).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.metricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = forkJoin({
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
      catchError(() => {
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.metricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get list of activities for modal display
   * Returns list with attributes.acao as title
   */
  getActivityList(playerId: string, month?: Date): Observable<ActivityListItem[]> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => actions.map(a => {
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
          title: a.attributes?.acao || a.action_title || a.actionId || 'AÃ§Ã£o sem tÃ­tulo',
          points: a.points || 0,
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          player: a.userId || '',
          status,
          cnpj: a.attributes?.cnpj || undefined
        };
      })),
      catchError(() => {
        return of([]);
      })
    );
  }

  /**
   * Get list of processes for modal display
   * Groups by attributes.delivery_id (number), shows attributes.delivery_title and action count
   * Note: delivery_id is a number in attributes, not a string
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessList(playerId: string, month?: Date): Observable<ProcessListItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_process_list`;
    const cached = this.getCachedData(this.processListCache, cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Group actions by attributes.delivery_id (number)
        const deliveryMap = new Map<number, { title: string; count: number; cnpj?: string }>();
        
        userActions.forEach(action => {
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
        
        if (deliveryIds.length === 0) {
          return of([]);
        }

        // Check cache for finalization status first
        const finalizationCacheKey = `${dayjs(targetMonth).format('YYYY-MM')}_finalized_${deliveryIds.sort((a, b) => a - b).join(',')}`;
        const cachedFinalized = this.getCachedData(this.processFinalizationCache, finalizationCacheKey);
        
        if (cachedFinalized) {
          return cachedFinalized.pipe(
            map(finalizedIds => {
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
            })
          );
        }

        // Check which processes are finalized (have desbloquear action with matching attributes.delivery)
        // Note: attributes.delivery in desbloquear action matches delivery_id
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

        const finalizationRequest$ = this.funifierApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const finalizedIds = new Set(desbloqueados.map(d => d._id));
            return finalizedIds;
          }),
          catchError(() => {
            // If desbloquear query fails, return empty set (all not finalized)
            return of(new Set<number>());
          }),
          shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
        );

        // Cache finalization status
        this.setCachedData(this.processFinalizationCache, finalizationCacheKey, finalizationRequest$);

        return finalizationRequest$.pipe(
          map(finalizedIds => {
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
          })
        );
      }),
      catchError(() => {
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.processListCache, cacheKey, request$);
    return request$;
  }


  /**
   * Get list of unique CNPJs from player's action_log WITH action count
   * Returns CNPJ and action count for each CNPJ
   * 
   * OPTIMIZED: Uses the existing getAllPlayerActionLog data and filters client-side
   * instead of making a separate aggregate request with date filters.
   * 
   * Cached with shareReplay to avoid duplicate requests
   */
  getPlayerCnpjListWithCount(playerId: string, month?: Date): Observable<{ cnpj: string; actionCount: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_cnpj_list_count`;
    const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use existing getAllPlayerActionLog and filter by month client-side
    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Group by CNPJ and count
        const cnpjCounts = new Map<string, number>();
        
        actions.forEach(action => {
          const cnpj = action.attributes?.cnpj;
          if (cnpj) {
            cnpjCounts.set(cnpj, (cnpjCounts.get(cnpj) || 0) + 1);
          }
        });

        const result = Array.from(cnpjCounts.entries()).map(([cnpj, count]) => ({
          cnpj,
          actionCount: count
        }));

        return result;
      }),
      catchError(() => {
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
   * Get all actions for a specific CNPJ (by all players)
   * 
   * NOTE: Funifier's $date extended JSON format doesn't work reliably in aggregate queries.
   * We fetch ALL actions for the CNPJ and filter by month on the frontend.
   * Uses Funifier pagination (default limit 100, we use higher limit to get all data).
   * 
   * Cached with shareReplay to avoid duplicate requests
   */
  getActionsByCnpj(cnpj: string, month?: Date): Observable<ClienteActionItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${cnpj}_${dayjs(targetMonth).format('YYYY-MM')}_actions_by_cnpj`;
    const cached = this.getCachedData(this.actionsByCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Calculate month boundaries for frontend filtering
    const year = targetMonth.getFullYear();
    const monthNum = targetMonth.getMonth();
    const monthStart = new Date(year, monthNum, 1, 0, 0, 0, 0).getTime();
    const monthEnd = new Date(year, monthNum + 1, 0, 23, 59, 59, 999).getTime();

    // Fetch ALL actions for this CNPJ without date filter
    // Funifier's $date format doesn't work reliably in aggregate queries
    // We'll filter by month on the frontend
    const aggregateBody = [
      {
        $match: {
          'attributes.cnpj': cnpj
        }
      },
      { $sort: { time: -1 } },
      { $limit: 1000 } // High limit to get all data (Funifier default is 100)
    ];

    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        // Filter by month on frontend
        const filteredActions = (actions || []).filter(a => {
          const timestamp = extractTimestamp(a.time as number | { $date: string } | undefined);
          return timestamp >= monthStart && timestamp <= monthEnd;
        });

        return filteredActions.map(a => {
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
      catchError(() => {
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
      catchError(() => {
        return of([]);
      })
    );
  }

    /**
   * Get activities for a specific process (delivery_id)
   * Returns list of activities for the given delivery_id
   * 
   * OPTIMIZED: Uses the existing getAllPlayerActionLog data and filters client-side
   * instead of making a separate aggregate request with date filters.
   * 
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByProcess(deliveryId: number, playerId: string, month?: Date): Observable<ActivityListItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${deliveryId}_${dayjs(targetMonth).format('YYYY-MM')}_activities_by_process`;
    const cached = this.getCachedData(this.activitiesByProcessCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use existing getAllPlayerActionLog and filter by month and delivery_id client-side
    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Filter by delivery_id
        const filtered = actions.filter(a => a.attributes?.delivery_id === deliveryId);
        
        // Sort by time descending
        filtered.sort((a, b) => {
          const timeA = extractTimestamp(a.time as number | { $date: string } | undefined);
          const timeB = extractTimestamp(b.time as number | { $date: string } | undefined);
          return timeB - timeA;
        });

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
      catchError(() => {
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
   * 
   * OPTIMIZED: Uses the existing getAllPlayerActionLog data and filters client-side
   * instead of making a separate aggregate request with date filters.
   * 
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByDay(playerId: string, month?: Date): Observable<{ day: number; count: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_activities_by_day`;
    const cached = this.getCachedData(this.activitiesByDayCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use existing getAllPlayerActionLog and filter by month client-side
    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Group by day of month
        const dayCounts = new Map<number, number>();
        
        actions.forEach(action => {
          const timestamp = extractTimestamp(action.time as number | { $date: string } | undefined);
          if (timestamp > 0) {
            const date = new Date(timestamp);
            const day = date.getDate();
            dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
          }
        });

        const result = Array.from(dayCounts.entries())
          .map(([day, count]) => ({ day, count }))
          .sort((a, b) => a.day - b.day);

        return result;
      }),
      catchError(() => {
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
  clearCache(): void {
    this.actionLogCache.clear();
    this.allActionLogCache.clear();
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
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering
   * @returns Observable of aggregated metrics for the team
   */
  getTeamProgressMetrics(teamId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    const targetMonth = month || new Date();
    const cacheKey = `team_metrics_${teamId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.teamMetricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

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
          'playerData.teams': teamId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $count: 'total'
      }
    ];

    // Query for process metrics (desbloquear actions = finalized processes)
    const processAggregateBody = [
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
          time: { $gte: startDate, $lte: endDate },
          actionId: 'desbloquear'
        }
      },
      {
        $group: {
          _id: '$attributes.delivery'
        }
      },
      {
        $count: 'finalizados'
      }
    ];

    // Query for unique processes (delivery_id) to calculate incomplete
    const uniqueProcessesBody = [
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
          time: { $gte: startDate, $lte: endDate },
          'attributes.delivery_id': { $ne: null }
        }
      },
      {
        $group: {
          _id: '$attributes.delivery_id'
        }
      },
      {
        $count: 'total'
      }
    ];

    const request$ = forkJoin([
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', activityAggregateBody),
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', processAggregateBody),
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', uniqueProcessesBody)
    ]).pipe(
      map(([activityResult, processResult, uniqueProcessResult]) => {
        const finalizadas = activityResult[0]?.total || 0;
        const processosFinalizados = processResult[0]?.finalizados || 0;
        const totalProcessos = uniqueProcessResult[0]?.total || 0;
        const processosIncompletos = Math.max(0, totalProcessos - processosFinalizados);

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
      catchError(() => {
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
   *
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering
   * @returns Observable of CNPJ list with action counts
   */
  getTeamCnpjListWithCount(teamId: string, month?: Date): Observable<{ cnpj: string; actionCount: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `team_cnpj_${teamId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.teamCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

    // Single aggregate query to get action count per CNPJ for the team
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
          time: { $gte: startDate, $lte: endDate },
          'attributes.cnpj': { $ne: null }
        }
      },
      {
        $group: {
          _id: '$attributes.cnpj',
          count: { $sum: 1 }
        }
      }
    ];

    const request$ = this.funifierApi.post<{ _id: string; count: number }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      actionCountBody
    ).pipe(
      map(actionResponse => {
        const result = actionResponse
          .filter(r => r._id != null)
          .map(r => ({
            cnpj: r._id,
            actionCount: r.count
          }));

        return result;
      }),
      catchError(() => {
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamCnpjCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get monthly points breakdown (bloqueados and desbloqueados) for all team members.
   * Uses aggregate query on achievement collection with player lookup.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering
   * @returns Observable of points breakdown
   */
  getTeamMonthlyPointsBreakdown(teamId: string, month?: Date): Observable<{ bloqueados: number; desbloqueados: number }> {
    const targetMonth = month || new Date();
    const cacheKey = `team_points_breakdown_${teamId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.teamPointsBreakdownCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

    // Query for bloqueados (locked points) - actions that are NOT desbloquear
    const bloqueadosBody = [
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
          time: { $gte: startDate, $lte: endDate },
          actionId: { $ne: 'desbloquear' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$points', 0] } }
        }
      }
    ];

    // Query for desbloqueados (unlocked points) - desbloquear actions
    const desbloqueadosBody = [
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
          time: { $gte: startDate, $lte: endDate },
          actionId: 'desbloquear'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$points', 0] } }
        }
      }
    ];

    const request$ = forkJoin([
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', bloqueadosBody),
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', desbloqueadosBody)
    ]).pipe(
      map(([bloqueadosResult, desbloqueadosResult]) => {
        const bloqueados = Math.floor(bloqueadosResult[0]?.total || 0);
        const desbloqueados = Math.floor(desbloqueadosResult[0]?.total || 0);

        return { bloqueados, desbloqueados };
      }),
      catchError(() => {
        return of({ bloqueados: 0, desbloqueados: 0 });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamPointsBreakdownCache, cacheKey, request$);
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
