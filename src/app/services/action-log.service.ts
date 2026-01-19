import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { ActivityMetrics, MacroMetrics } from '@model/gamification-dashboard.model';
import dayjs from 'dayjs';

interface ActionLogEntry {
  _id: string;
  player?: string;
  userId?: string;
  action?: string;
  action_title?: string;
  status?: string;
  points?: number;
  created?: number;
  updated?: number;
  extra?: Record<string, any>;
  attributes?: {
    delivery?: string;
    cnpj?: string;
    [key: string]: any;
  };
  delivery_id?: string;
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
   * Uses player field to match the user's email
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
    const aggregateBody = [
      { 
        $match: { 
          player: playerId,
          created: { $gte: startOfMonth, $lte: endOfMonth }
        } 
      },
      { $sort: { created: -1 } }
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
          player: playerId,
          created: { $gte: startOfMonth, $lte: endOfMonth }
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

    return this.funifierApi.post<any[]>(
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
   * A Macro is identified by unique delivery_id in action_log
   * Macro is Finalizada if there's a "desbloquear" action with attributes.delivery = delivery_id
   * Otherwise it's Pendente/Incompleta
   */
  getMacroMetrics(playerId: string, month?: Date): Observable<MacroMetrics> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Get unique delivery_ids from user's actions
        const deliveryIds = [...new Set(
          userActions
            .map(a => a.delivery_id || a.attributes?.delivery)
            .filter(id => id != null && id !== '')
        )];

        console.log('📊 Unique delivery_ids found:', deliveryIds);

        if (deliveryIds.length === 0) {
          return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
        }

        // Query action_log for "desbloquear" actions with matching delivery_ids
        const aggregateBody = [
          {
            $match: {
              action: 'desbloquear',
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

        return this.funifierApi.post<any[]>(
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
