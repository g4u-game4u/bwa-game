import { Injectable } from '@angular/core';
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
 * - When February 2026 is selected (current month), start date includes January (01/01/2026)
 * - When January 2026 is selected, returns only January (01/01/2026 to 31/01/2026)
 * - Minimum date is always 01/01/2026
 */
function getRelativeDateExpression(month: Date | undefined, position: 'start' | 'end'): { $date: string } | number {
  const targetMonth = month || new Date();
  const targetMonthNum = targetMonth.getMonth();
  const targetYear = targetMonth.getFullYear();
  
  // Season start date: 01/01/2026
  const seasonStartDate = new Date('2026-01-01T00:00:00.000Z');
  
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

  constructor(private funifierApi: FunifierApiService) {}

  /**
   * Get action log entries for a player for the current month
   * Uses userId field to match the user's email
   * Uses Funifier's relative date expressions for time filtering
   * Note: action_log uses 'time' field for timestamp, not 'created'
   */
  getPlayerActionLogForMonth(playerId: string, month?: Date): Observable<ActionLogEntry[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.actionLogCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax for time filtering
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    // Aggregate query to get action log for this player in the target month
    // Uses userId field and time field with Funifier $date expressions
    const aggregateBody = [
      { 
        $match: { 
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        } 
      },
      { $sort: { time: -1 } }
    ];

    console.log('📊 Action log query for month:', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Action log loaded for month:', response);
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
   * Get count of activities finalizadas (entries in action_log for the month)
   * Uses $count aggregation for better performance and to avoid MongoDB default limit
   */
  getAtividadesFinalizadas(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `count_${playerId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.activityCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax for time filtering
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    // Use $count aggregation to get total count without returning all documents
    // This avoids MongoDB default limit of 100 documents
    const aggregateBody = [
      { 
        $match: { 
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        } 
      },
      {
        $count: 'total'
      }
    ];

    console.log('📊 Activity count query for month:', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<{ total: number }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Activity count response:', response);
        // $count returns array with single object: [{ total: number }]
        if (Array.isArray(response) && response.length > 0 && response[0]?.total !== undefined) {
          return response[0].total;
        }
        return 0;
      }),
      catchError(error => {
        console.error('Error fetching activity count:', error);
        // Fallback to old method if $count doesn't work
        return this.getPlayerActionLogForMonth(playerId, month).pipe(
          map(actions => actions.length)
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );
    
    // Store in cache
    this.setCachedData(this.activityCountCache, cacheKey, request$);
    return request$;
  }

  /**
   * Alias for getAtividadesFinalizadas for backward compatibility
   */
  getCompletedTasksCount(playerId: string): Observable<number> {
    return this.getAtividadesFinalizadas(playerId);
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

    console.log('📊 Monthly points breakdown query:', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<{ _id: string; total: number }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Monthly points breakdown response:', response);
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
      catchError(error => {
        console.error('Error fetching monthly points breakdown:', error);
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

    console.log('📊 Achievement points query:', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<{ _id: null; total: number }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Achievement points response:', response);
        if (Array.isArray(response) && response.length > 0) {
          return response[0].total || 0;
        }
        return 0;
      }),
      catchError(error => {
        console.error('Error fetching achievement points:', error);
        return of(0);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.pontosForMonthCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get unique CNPJs count from user's action_log
   * Uses Funifier's relative date expressions
   * Cached with shareReplay to avoid duplicate requests
   */
  getUniqueClientesCount(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_unique_cnpjs`;
    const cached = this.getCachedData(this.uniqueClientesCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$attributes.cnpj'
        }
      },
      {
        $match: {
          _id: { $ne: null }
        }
      },
      {
        $count: 'total'
      }
    ];

    console.log('📊 Unique CNPJs query:', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<{ total: number }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Unique CNPJs response:', response);
        if (Array.isArray(response) && response.length > 0) {
          return response[0].total || 0;
        }
        return 0;
      }),
      catchError(error => {
        console.error('Error counting unique CNPJs:', error);
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

        console.log('📊 Unique delivery_ids found:', deliveryIds);

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

        console.log('📊 Desbloquear query:', JSON.stringify(aggregateBody));

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
      catchError(error => {
        console.error('Error calculating progress metrics:', error);
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
          title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
          points: a.points || 0,
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          player: a.userId || '',
          status
        };
      })),
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
        
        console.log('📊 Process list - unique delivery_ids:', deliveryIds);

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

        console.log('📊 Process finalization query:', JSON.stringify(aggregateBody));

        const finalizationRequest$ = this.funifierApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const finalizedIds = new Set(desbloqueados.map(d => d._id));
            console.log('📊 Finalized delivery_ids:', [...finalizedIds]);
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
   * Get list of unique CNPJs from player's action_log WITH action count and process count
   * Returns CNPJ, action count, and unique process count (delivery_id) for each CNPJ
   * Uses userId field and time field with Funifier relative dates
   * Cached with shareReplay to avoid duplicate requests
   */
  getPlayerCnpjListWithCount(playerId: string, month?: Date): Observable<{ cnpj: string; actionCount: number; processCount: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_cnpj_list_count`;
    const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    // First query: get action count per CNPJ
    const actionCountBody = [
      {
        $match: {
          userId: playerId,
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

    // Second query: get unique process count (delivery_id) per CNPJ
    const processCountBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate },
          'attributes.cnpj': { $ne: null },
          'attributes.delivery_id': { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            cnpj: '$attributes.cnpj',
            delivery_id: '$attributes.delivery_id'
          }
        }
      },
      {
        $group: {
          _id: '$_id.cnpj',
          processCount: { $sum: 1 }
        }
      }
    ];

    console.log('📊 Player CNPJs with count query:', JSON.stringify(actionCountBody));
    console.log('📊 Player CNPJs process count query:', JSON.stringify(processCountBody));

    const request$ = forkJoin([
      this.funifierApi.post<{ _id: string; count: number }[]>(
        '/v3/database/action_log/aggregate?strict=true',
        actionCountBody
      ),
      this.funifierApi.post<{ _id: string; processCount: number }[]>(
        '/v3/database/action_log/aggregate?strict=true',
        processCountBody
      )
    ]).pipe(
      map(([actionResponse, processResponse]) => {
        console.log('📊 Player CNPJs with count response:', actionResponse);
        console.log('📊 Player CNPJs process count response:', processResponse);
        
        // Create a map of CNPJ to process count
        const processCountMap = new Map<string, number>();
        processResponse
          .filter(r => r._id != null)
          .forEach(r => processCountMap.set(r._id, r.processCount));
        
        // Combine action count with process count
        return actionResponse
          .filter(r => r._id != null)
          .map(r => ({
            cnpj: r._id,
            actionCount: r.count,
            processCount: processCountMap.get(r._id) || 0
          }));
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
   * Get all actions for a specific CNPJ (by all players)
   * Uses time field with Funifier relative dates
   * Cached with shareReplay to avoid duplicate requests
   */
  getActionsByCnpj(cnpj: string, month?: Date): Observable<ClienteActionItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${cnpj}_${dayjs(targetMonth).format('YYYY-MM')}_actions_by_cnpj`;
    const cached = this.getCachedData(this.actionsByCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          'attributes.cnpj': cnpj,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      { $sort: { time: -1 } },
      { $limit: 100 }
    ];

    console.log('📊 Actions by CNPJ query:', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        console.log('📊 Actions by CNPJ response:', actions);
        return actions.map(a => {
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
            status
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
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByProcess(deliveryId: number, playerId: string, month?: Date): Observable<ActivityListItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${deliveryId}_${dayjs(targetMonth).format('YYYY-MM')}_activities_by_process`;
    const cached = this.getCachedData(this.activitiesByProcessCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          'attributes.delivery_id': deliveryId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      { $sort: { time: -1 } }
    ];

    console.log('📊 Activities by process query:', JSON.stringify(aggregateBody));

    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        console.log('📊 Activities by process response:', actions);
        return actions.map(a => {
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
            status
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
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByDay(playerId: string, month?: Date): Observable<{ day: number; count: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_activities_by_day`;
    const cached = this.getCachedData(this.activitiesByDayCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $addFields: {
          timeAsDate: {
            $cond: {
              if: { $eq: [{ $type: '$time' }, 'number'] },
              then: { $toDate: '$time' },
              else: {
                $cond: {
                  if: { $eq: [{ $type: '$time' }, 'object'] },
                  then: { $toDate: '$time.$date' },
                  else: { $toDate: '$time' }
                }
              }
            }
          }
        }
      },
      {
        $project: {
          day: { $dayOfMonth: '$timeAsDate' }
        }
      },
      {
        $group: {
          _id: '$day',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    console.log('📊 Activities by day query:', JSON.stringify(aggregateBody, null, 2));

    const request$ = this.funifierApi.post<{ _id: number; count: number }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Activities by day response:', response);
        const result = response.map(r => ({ day: r._id, count: r.count }));
        console.log('📊 Activities by day mapped result:', result);
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
