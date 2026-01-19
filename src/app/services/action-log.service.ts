import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { ActivityMetrics, MacroMetrics } from '@model/gamification-dashboard.model';
import dayjs from 'dayjs';

export interface ActionLogEntry {
  _id: string;
  actionId: string; // Action type identifier (e.g., 'acessorias', 'desbloquear')
  userId: string; // User's email
  time: number; // Timestamp when action was logged (milliseconds)
  attributes?: {
    delivery_title?: string; // Macro title
    delivery_id?: number; // Macro ID (number)
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
}

export interface MacroListItem {
  deliveryId: string;
  title: string; // delivery_title
  actionCount: number;
  isFinalized: boolean;
}

export interface ClienteListItem {
  cnpj: string;
  actions: ClienteActionItem[];
}

export interface ClienteActionItem {
  id: string;
  title: string; // attributes.acao
  player: string;
  created: number;
}

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class ActionLogService {
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes
  private actionLogCache = new Map<string, CacheEntry<ActionLogEntry[]>>();
  private metricsCache = new Map<string, CacheEntry<{ activity: ActivityMetrics; macro: MacroMetrics }>>();

  constructor(private funifierApi: FunifierApiService) {}

  /**
   * Get action log entries for a player for the current month
   * Uses userId field to match the user's email
   * Note: action_log uses 'time' field for timestamp, not 'created'
   */
  getPlayerActionLogForMonth(playerId: string, month?: Date): Observable<ActionLogEntry[]> {
    const targetMonth = month || new Date();
    const startOfMonth = dayjs(targetMonth).startOf('month').valueOf();
    const endOfMonth = dayjs(targetMonth).endOf('month').valueOf();
    
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.actionLogCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Aggregate query to get action log for this player in the current month
    // Uses userId field and time field (not player/created)
    const aggregateBody = [
      { 
        $match: { 
          userId: playerId,
          time: { $gte: startOfMonth, $lte: endOfMonth }
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
   */
  getAtividadesFinalizadas(playerId: string, month?: Date): Observable<number> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => actions.length)
    );
  }

  /**
   * Alias for getAtividadesFinalizadas for backward compatibility
   */
  getCompletedTasksCount(playerId: string): Observable<number> {
    return this.getAtividadesFinalizadas(playerId);
  }

  /**
   * Get points from achievements for the month
   * Queries achievement collection for type=0 entries
   */
  getPontosForMonth(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const startOfMonth = dayjs(targetMonth).startOf('month').valueOf();
    const endOfMonth = dayjs(targetMonth).endOf('month').valueOf();

    const aggregateBody = [
      {
        $match: {
          player: playerId,
          type: 0, // type 0 = points
          created: { $gte: startOfMonth, $lte: endOfMonth }
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

    return this.funifierApi.post<any[]>(
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
      })
    );
  }

  /**
   * Get unique CNPJs count from user's action_log
   */
  getUniqueClientesCount(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const startOfMonth = dayjs(targetMonth).startOf('month').valueOf();
    const endOfMonth = dayjs(targetMonth).endOf('month').valueOf();

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startOfMonth, $lte: endOfMonth }
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

    return this.funifierApi.post<{ total: number }[]>(
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
      })
    );
  }

  /**
   * Get macro metrics for a player
   * A Macro is identified by unique attributes.delivery_id (number) in action_log
   * Macro is Finalizada if there's a "desbloquear" action with attributes.delivery = delivery_id
   * Otherwise it's Pendente/Incompleta
   */
  getMacroMetrics(playerId: string, month?: Date): Observable<MacroMetrics> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
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
        console.error('Error calculating macro metrics:', error);
        return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
      })
    );
  }

  /**
   * Get activity and macro metrics for a player
   * This provides data for "Meu Progresso" section
   * - Atividades: Finalizadas (count of action_log entries), Pontos (from achievement)
   * - Macros: Finalizadas, Pendentes/Incompletas (based on desbloquear action)
   */
  getProgressMetrics(playerId: string, month?: Date): Observable<{ activity: ActivityMetrics; macro: MacroMetrics }> {
    const cacheKey = `metrics_${playerId}_${dayjs(month || new Date()).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.metricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = forkJoin({
      finalizadas: this.getAtividadesFinalizadas(playerId, month),
      pontos: this.getPontosForMonth(playerId, month),
      macro: this.getMacroMetrics(playerId, month)
    }).pipe(
      map(({ finalizadas, pontos, macro }) => ({
        activity: {
          pendentes: 0, // Not used anymore
          emExecucao: 0, // Not used anymore
          finalizadas,
          pontos
        },
        macro
      })),
      catchError(error => {
        console.error('Error calculating progress metrics:', error);
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          macro: { pendentes: 0, incompletas: 0, finalizadas: 0 }
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
      map(actions => actions.map(a => ({
        id: a._id,
        title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
        points: a.points || 0,
        created: a.time || 0
      }))),
      catchError(error => {
        console.error('Error fetching activity list:', error);
        return of([]);
      })
    );
  }

  /**
   * Get list of macros for modal display
   * Groups by attributes.delivery_id (number), shows attributes.delivery_title and action count
   * Note: delivery_id is a number in attributes, not a string
   */
  getMacroList(playerId: string, month?: Date): Observable<MacroListItem[]> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Group actions by attributes.delivery_id (number)
        const deliveryMap = new Map<number, { title: string; count: number }>();
        
        userActions.forEach(action => {
          const deliveryId = action.attributes?.delivery_id;
          if (deliveryId != null) {
            const existing = deliveryMap.get(deliveryId);
            if (existing) {
              existing.count++;
            } else {
              deliveryMap.set(deliveryId, {
                title: action.attributes?.delivery_title || `Macro ${deliveryId}`,
                count: 1
              });
            }
          }
        });

        const deliveryIds = [...deliveryMap.keys()];
        
        console.log('📊 Macro list - unique delivery_ids:', deliveryIds);

        if (deliveryIds.length === 0) {
          return of([]);
        }

        // Check which macros are finalized (have desbloquear action with matching attributes.delivery)
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

        console.log('📊 Macro finalization query:', JSON.stringify(aggregateBody));

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
                isFinalized: finalizedIds.has(deliveryId)
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
                isFinalized: false
              };
            }));
          })
        );
      }),
      catchError(error => {
        console.error('Error fetching macro list:', error);
        return of([]);
      })
    );
  }

  /**
   * Get list of unique CNPJs from player's action_log
   * Uses userId field and time field (not player/created)
   */
  getPlayerCnpjList(playerId: string, month?: Date): Observable<string[]> {
    const targetMonth = month || new Date();
    const startOfMonth = dayjs(targetMonth).startOf('month').valueOf();
    const endOfMonth = dayjs(targetMonth).endOf('month').valueOf();

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startOfMonth, $lte: endOfMonth },
          'attributes.cnpj': { $ne: null }
        }
      },
      {
        $group: {
          _id: '$attributes.cnpj'
        }
      }
    ];

    console.log('📊 Player CNPJs query:', JSON.stringify(aggregateBody));

    return this.funifierApi.post<{ _id: string }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Player CNPJs response:', response);
        return response.map(r => r._id).filter(cnpj => cnpj != null);
      }),
      catchError(error => {
        console.error('Error fetching player CNPJs:', error);
        return of([]);
      })
    );
  }

  /**
   * Get all actions for a specific CNPJ (by all players)
   * Uses time field for timestamp (not created)
   */
  getActionsByCnpj(cnpj: string, month?: Date): Observable<ClienteActionItem[]> {
    const targetMonth = month || new Date();
    const startOfMonth = dayjs(targetMonth).startOf('month').valueOf();
    const endOfMonth = dayjs(targetMonth).endOf('month').valueOf();

    const aggregateBody = [
      {
        $match: {
          'attributes.cnpj': cnpj,
          time: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      { $sort: { time: -1 } },
      { $limit: 100 }
    ];

    console.log('📊 Actions by CNPJ query:', JSON.stringify(aggregateBody));

    return this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        console.log('📊 Actions by CNPJ response:', actions);
        return actions.map(a => ({
          id: a._id,
          title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
          player: a.userId || '',
          created: a.time || 0
        }));
      }),
      catchError(error => {
        console.error('Error fetching actions by CNPJ:', error);
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
   * Clear all caches
   */
  clearCache(): void {
    this.actionLogCache.clear();
    this.metricsCache.clear();
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
