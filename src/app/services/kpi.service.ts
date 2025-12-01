import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { KPIMapper } from './kpi-mapper.service';
import { KPIData } from '@model/gamification-dashboard.model';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class KPIService {
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes
  private playerKPICache = new Map<string, CacheEntry<KPIData[]>>();
  private companyKPICache = new Map<string, CacheEntry<KPIData[]>>();

  constructor(
    private funifierApi: FunifierApiService,
    private mapper: KPIMapper
  ) {}

  /**
   * Get player KPIs from player status extra.kpi
   * KPIs are calculated as average of player's companies KPIs
   */
  getPlayerKPIs(playerId: string): Observable<KPIData[]> {
    const cached = this.getCachedData(this.playerKPICache, playerId);
    if (cached) {
      return cached;
    }

    const request$ = this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      map(response => {
        const kpiData = response.extra?.kpi;
        
        // Handle case where KPI data is not present
        if (!kpiData) {
          console.warn('KPI data not available in player status');
          return [];
        }
        
        // Convert KPI object to array format
        return this.mapper.toKPIDataArray(kpiData);
      }),
      catchError(error => {
        console.error('Error fetching player KPIs:', error);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.playerKPICache, playerId, request$);
    return request$;
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
