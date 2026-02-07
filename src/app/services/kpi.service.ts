import { Injectable } from '@angular/core';
import { Observable, throwError, of } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { KPIMapper } from './kpi-mapper.service';
import { KPIData } from '@model/gamification-dashboard.model';
import { ActionLogService } from './action-log.service';
import { PlayerService } from './player.service';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

interface MetricTarget {
  _id: string;
  name: string;
  label: string;
  target: number;
  unit?: string;
  order?: number;
}

@Injectable({
  providedIn: 'root'
})
export class KPIService {
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes
  private playerKPICache = new Map<string, CacheEntry<KPIData[]>>();
  private companyKPICache = new Map<string, CacheEntry<KPIData[]>>();
  private metricTargetsCache: Observable<MetricTarget[]> | null = null;

  constructor(
    private funifierApi: FunifierApiService,
    private mapper: KPIMapper,
    private playerService: PlayerService
  ) {}

  /**
   * Get metric targets from database (uses Basic Auth)
   * This defines the KPI names, order, and target values
   */
  getMetricTargets(): Observable<MetricTarget[]> {
    if (this.metricTargetsCache) {
      return this.metricTargetsCache;
    }

    // Query metric_targets__c database
    const aggregateBody = [
      { $sort: { order: 1 } } // Sort by order field
    ];

    this.metricTargetsCache = this.funifierApi.post<MetricTarget[]>(
      '/v3/database/metric_targets__c/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 Metric targets loaded from database:', response);
        if (Array.isArray(response) && response.length > 0) {
          return response;
        }
        console.warn('📊 No metric targets found in database, returning empty array');
        return [];
      }),
      catchError(error => {
        console.error('📊 Error fetching metric targets from database:', error);
        // Return empty array - no hardcoded fallback
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    return this.metricTargetsCache;
  }

  /**
   * Get player KPIs from player's extra info:
   * 1. Clientes na Carteira - count from action_log filtered by selected month
   * 2. Porcentagem de Entregas no Prazo - value from extra.entrega (only for current month)
   * 
   * @param playerId - Player ID
   * @param selectedMonth - Selected month for filtering (optional, defaults to current month)
   * @param actionLogService - ActionLogService instance (passed to avoid circular dependency)
   */
  getPlayerKPIs(playerId: string, selectedMonth?: Date, actionLogService?: any): Observable<KPIData[]> {
    // Create cache key that includes month to avoid cache conflicts
    const monthKey = selectedMonth ? `_${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}` : '_current';
    const cacheKey = `${playerId}${monthKey}`;
    const cached = this.getCachedData(this.playerKPICache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use PlayerService to get raw player data (shared cache)
    const request$: Observable<KPIData[]> = this.playerService.getRawPlayerData(playerId).pipe(
      switchMap((playerStatus): Observable<KPIData[]> => {
        console.log('📊 Player status received:', playerStatus);
        
        const kpis: KPIData[] = [];
        const now = new Date();
        const isCurrentMonth = !selectedMonth || 
          (selectedMonth.getFullYear() === now.getFullYear() && 
           selectedMonth.getMonth() === now.getMonth());

        // Clientes na Carteira - count from action_log filtered by selected month
        if (actionLogService && selectedMonth) {
          // Use action_log to count companies for the selected month
          return actionLogService.getPlayerCnpjListWithCount(playerId, selectedMonth).pipe(
            map((cnpjList: { cnpj: string; actionCount: number }[]) => {
              const companyCount = Array.isArray(cnpjList) ? cnpjList.length : 0;
              
              // Always add Clientes na Carteira KPI, even if count is 0
              kpis.push({
                id: 'numero-empresas',
                label: 'Clientes na Carteira',
                current: companyCount,
                target: 10,
                superTarget: 15,
                unit: 'clientes',
                color: this.getKPIColorByGoals(companyCount, 10, 15),
                percentage: Math.min((companyCount / 15) * 100, 100)
              });

              // Porcentagem de Entregas no Prazo - only for current month
              if (isCurrentMonth && playerStatus.extra?.entrega) {
                const deliveryPercentage = parseFloat(playerStatus.extra.entrega);
                
                kpis.push({
                  id: 'entregas-prazo',
                  label: 'Entregas no Prazo',
                  current: deliveryPercentage,
                  target: 80,
                  superTarget: 90,
                  unit: '%',
                  color: this.getKPIColorByGoals(deliveryPercentage, 80, 90),
                  percentage: Math.min(deliveryPercentage / 90 * 100, 100)
                });
              }

              console.log('📊 Generated KPIs:', kpis, `(${kpis.length} KPIs)`, isCurrentMonth ? '(current month)' : '(previous month)');
              return kpis;
            }),
            catchError(error => {
              console.error('📊 Error loading companies from action_log:', error);
              // Return at least the empresas KPI with 0 count on error
               const errorKpis: KPIData[] = [{
                 id: 'numero-empresas',
                 label: 'Clientes na Carteira',
                current: 0,
                target: 10,
                superTarget: 15,
                unit: 'clientes',
                color: 'red' as const,
                percentage: 0
              }];
              
              // Add entregas KPI only for current month if available
              if (isCurrentMonth && playerStatus.extra?.entrega) {
                const deliveryPercentage = parseFloat(playerStatus.extra.entrega);
                errorKpis.push({
                  id: 'entregas-prazo',
                  label: 'Entregas no Prazo',
                  current: deliveryPercentage,
                  target: 80,
                  superTarget: 90,
                  unit: '%',
                  color: this.getKPIColorByGoals(deliveryPercentage, 80, 90),
                  percentage: Math.min(deliveryPercentage / 90 * 100, 100)
                });
              }
              
              return of(errorKpis);
            })
          );
        } else {
          // Fallback: use extra.cnpj if actionLogService not available
                 // Always add Clientes na Carteira KPI, even if count is 0
                 const companyCount = playerStatus.extra?.cnpj 
                   ? playerStatus.extra.cnpj.split(',').filter((item: string) => item.trim()).length 
                   : 0;
                 
                 kpis.push({
                   id: 'numero-empresas',
                   label: 'Clientes na Carteira',
            current: companyCount,
            target: 10,
            superTarget: 15,
            unit: 'empresas',
            color: this.getKPIColorByGoals(companyCount, 10, 15),
            percentage: Math.min((companyCount / 15) * 100, 100)
          });

          // Porcentagem de Entregas no Prazo - only for current month
          if (isCurrentMonth && playerStatus.extra?.entrega) {
            const deliveryPercentage = parseFloat(playerStatus.extra.entrega);
            
            kpis.push({
              id: 'entregas-prazo',
              label: 'Entregas no Prazo',
              current: deliveryPercentage,
              target: 80,
              superTarget: 90,
              unit: '%',
              color: this.getKPIColorByGoals(deliveryPercentage, 80, 90),
              percentage: Math.min(deliveryPercentage / 90 * 100, 100)
            });
          }

          console.log('📊 Generated KPIs (fallback):', kpis, `(${kpis.length} KPIs)`, isCurrentMonth ? '(current month)' : '(previous month)');
          return of(kpis);
        }
      }),
      catchError(error => {
        console.error('📊 Error fetching player KPIs:', error);
        // Return empty array instead of throwing - don't block the UI
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.playerKPICache, cacheKey, request$);
    return request$;
  }

  /**
   * Parse KPI values from string (separated by ; or ,)
   */
  private parseKpiValues(kpiString: string): number[] {
    if (!kpiString || typeof kpiString !== 'string') return [];
    
    return kpiString.split(/[;,]/)
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => parseFloat(v) || 0);
  }

  /**
   * Get company KPIs from cnpj_performance__c database
   * companyId is the CNPJ
   */
  getCompanyKPIs(companyId: string): Observable<KPIData[]> {
    const cached = this.getCachedData(this.companyKPICache, companyId);
    if (cached) {
      return cached;
    }

    // Query the custom database with aggregate
    const aggregateBody = [
      { $match: { _id: companyId } },
      { $limit: 1 }
    ];

    const request$ = this.funifierApi.post<any[]>(
      `/v3/database/cnpj_performance__c/aggregate?strict=true`,
      aggregateBody
    ).pipe(
      map(response => {
        // Response is an array, get first item
        const companyData = response && response.length > 0 ? response[0] : null;
        
        if (!companyData) {
          console.warn(`Company KPI data not found for CNPJ ${companyId}`);
          return [];
        }
        
        // Extract KPIs from company data (nps, multas, eficiencia, extra, prazo)
        return this.mapper.toKPIDataArray(companyData);
      }),
      catchError(error => {
        console.error('Error fetching company KPIs:', error);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.companyKPICache, companyId, request$);
    return request$;
  }

  /**
   * Calculate KPI progress percentage
   */
  calculateKPIProgress(current: number, target: number): number {
    if (target === 0) {
      return 0;
    }
    return Math.round((current / target) * 100);
  }

  /**
   * Determine KPI color based on goal and super goal thresholds
   * Below goal: red, Above goal: yellow, Above super goal: green
   */
  getKPIColorByGoals(current: number, goal: number, superGoal: number): 'red' | 'yellow' | 'green' {
    if (current >= superGoal) {
      return 'green';
    } else if (current >= goal) {
      return 'yellow';
    } else {
      return 'red';
    }
  }

  /**
   * Determine KPI color based on completion percentage (legacy method)
   */
  getKPIColor(current: number, target: number): 'red' | 'yellow' | 'green' {
    const percentage = this.calculateKPIProgress(current, target);
    
    if (percentage >= 80) {
      return 'green';
    } else if (percentage >= 50) {
      return 'yellow';
    }
    
    return 'red';
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.playerKPICache.clear();
    this.companyKPICache.clear();
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
