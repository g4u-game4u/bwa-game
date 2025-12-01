import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { ActivityMetrics, MacroMetrics } from '@model/gamification-dashboard.model';

interface ActionLogEntry {
  _id: string;
  player: string;
  action: string;
  action_title?: string;
  status?: string;
  points?: number;
  created?: number;
  updated?: number;
  extra?: Record<string, any>;
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
   * Get action log entries for a player
   * Uses Basic Auth for database access
   */
  getPlayerActionLog(playerId: string): Observable<ActionLogEntry[]> {
    const cached = this.getCachedData(this.actionLogCache, playerId);
    if (cached) {
      return cached;
    }

    // Aggregate query to get action log for this player
    const aggregateBody = [
      { $match: { player: playerId } },
      { $sort: { created: -1 } },
      { $limit: 100 } // Limit to last 100 actions
    ];

    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Action log loaded:', response);
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error('Error fetching action log:', error);
        return of([]); // Return empty array on error
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionLogCache, playerId, request$);
    return request$;
  }

  /**
   * Get count of completed tasks (tarefas finalizadas) for a player
   */
  getCompletedTasksCount(playerId: string): Observable<number> {
    return this.getPlayerActionLog(playerId).pipe(
      map(actions => {
        // Count actions that are completed
        return actions.filter(a => 
          a.status === 'completed' || 
          a.status === 'finalizado' ||
          a.status === 'done'
        ).length;
      })
    );
  }

  /**
   * Get activity and macro metrics for a player
   * This provides data for "Meu Progresso" section
   */
  getProgressMetrics(playerId: string): Observable<{ activity: ActivityMetrics; macro: MacroMetrics }> {
    const cached = this.getCachedData(this.metricsCache, playerId);
    if (cached) {
      return cached;
    }

    const request$ = this.getPlayerActionLog(playerId).pipe(
      map(actions => {
        // Calculate activity metrics
        const pendentes = actions.filter(a => 
          a.status === 'pending' || a.status === 'pendente'
        ).length;
        
        const emExecucao = actions.filter(a => 
          a.status === 'in_progress' || a.status === 'em_execucao' || a.status === 'in-progress'
        ).length;
        
        const finalizadas = actions.filter(a => 
          a.status === 'completed' || a.status === 'finalizado' || a.status === 'done'
        ).length;
        
        const pontos = actions.reduce((sum, a) => sum + (a.points || 0), 0);

        // Calculate macro metrics (group by action type or category)
        const macroActions = actions.filter(a => a.extra?.['isMacro'] || a.action?.includes('macro'));
        const macroPendentes = macroActions.filter(a => 
          a.status === 'pending' || a.status === 'pendente'
        ).length;
        const macroIncompletas = macroActions.filter(a => 
          a.status === 'in_progress' || a.status === 'em_execucao'
        ).length;
        const macroFinalizadas = macroActions.filter(a => 
          a.status === 'completed' || a.status === 'finalizado'
        ).length;

        return {
          activity: {
            pendentes,
            emExecucao,
            finalizadas,
            pontos
          },
          macro: {
            pendentes: macroPendentes,
            incompletas: macroIncompletas,
            finalizadas: macroFinalizadas
          }
        };
      }),
      catchError(error => {
        console.error('Error calculating progress metrics:', error);
        // Return default metrics on error
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          macro: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.metricsCache, playerId, request$);
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
