import { Injectable } from '@angular/core';
import { Observable, throwError, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { KPIMapper } from './kpi-mapper.service';
import { KPIData } from '@model/gamification-dashboard.model';

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
    private mapper: KPIMapper
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
        console.log('📊 Metric targets loaded:', response);
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error('Error fetching metric targets:', error);
        // Return default KPI structure if database call fails
        return of([
          { _id: 'nps', name: 'NPS', label: 'NPS', target: 10, order: 0 },
          { _id: 'multas', name: 'Multas', label: 'Multas', target: 10, order: 1 },
          { _id: 'eficiencia', name: 'Eficiência', label: 'Eficiência', target: 10, order: 2 },
          { _id: 'extra', name: 'Extra', label: 'Extra', target: 10, order: 3 },
          { _id: 'prazo', name: 'Prazo', label: 'Prazo', target: 10, order: 4 }
        ]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    return this.metricTargetsCache;
  }

  /**
   * Get player KPIs by combining:
   * 1. Default KPI labels (NPS, Multas, Eficiência, Extra, Prazo)
   * 2. Current values from player status extra.kpi (values in order, separated by ; or ,)
   */
  getPlayerKPIs(playerId: string): Observable<KPIData[]> {
    const cached = this.getCachedData(this.playerKPICache, playerId);
    if (cached) {
      return cached;
    }

    // Default KPI structure - used when metric_targets__c is not available
    const defaultTargets: MetricTarget[] = [
      { _id: 'nps', name: 'NPS', label: 'NPS', target: 10, order: 0 },
      { _id: 'multas', name: 'Multas', label: 'Multas', target: 10, order: 1 },
      { _id: 'eficiencia', name: 'Eficiência', label: 'Eficiência', target: 10, order: 2 },
      { _id: 'extra', name: 'Extra', label: 'Extra', target: 10, order: 3 },
      { _id: 'prazo', name: 'Prazo', label: 'Prazo', target: 10, order: 4 }
    ];

    // Just fetch player status - don't wait for metric_targets database
    const request$ = this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      map(playerStatus => {
        const kpiString = playerStatus.extra?.kpi || '';
        
        // Parse KPI values from string (e.g., "9.3; 8; 10; 9; 8")
        const kpiValues = this.parseKpiValues(kpiString);
        
        console.log('📊 KPI string:', kpiString);
        console.log('📊 KPI values:', kpiValues);
        
        // Combine default targets with current values
        return defaultTargets.map((target, index) => ({
          id: target._id || `kpi-${index}`,
          label: target.label || target.name || `KPI ${index + 1}`,
          current: kpiValues[index] || 0,
          target: target.target || 10,
          unit: target.unit || ''
        }));
      }),
      catchError(error => {
        console.error('Error fetching player KPIs:', error);
        // Return empty array instead of throwing - don't block the UI
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.playerKPICache, playerId, request$);
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
   * Determine KPI color based on completion percentage
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
