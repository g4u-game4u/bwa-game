import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { KPIData } from '@model/gamification-dashboard.model';

/**
 * Interface for CNPJ KPI data from cnpj__c collection
 */
export interface CnpjKpiData {
  _id: string;
  entrega: number;
}

/**
 * Interface for company display data with KPI information
 */
export interface CompanyDisplay {
  cnpj: string; // Full CNPJ string from action_log
  cnpjId?: string; // Extracted ID for KPI lookup
  actionCount: number; // Number of actions for this company
  deliveryKpi?: KPIData; // Delivery KPI from cnpj__c
}

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

/**
 * Service to handle CNPJ ID extraction and KPI data fetching from Funifier API
 * 
 * This service:
 * - Extracts CNPJ IDs from action_log CNPJ strings (format: "NAME l CODE [ID|SUFFIX]")
 * - Fetches KPI data from cnpj__c collection
 * - Enriches company display data with delivery KPI information
 * - Caches KPI data to minimize API calls
 */
@Injectable({
  providedIn: 'root'
})
export class CompanyKpiService {
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  private kpiCache = new Map<string, CacheEntry<Map<string, CnpjKpiData>>>();

  constructor(private funifierApi: FunifierApiService) {}

  /**
   * Extract CNPJ ID from full CNPJ string
   * 
   * Format: "COMPANY NAME l CODE [ID|SUFFIX]"
   * Returns: ID between [ and |
   * 
   * Example:
   * Input: "RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]"
   * Output: "2000"
   * 
   * @param cnpjString - Full CNPJ string from action_log
   * @returns Extracted CNPJ ID or null if format is invalid
   */
  extractCnpjId(cnpjString: string): string | null {
    if (!cnpjString || typeof cnpjString !== 'string') {
      return null;
    }

    // Find text between [ and |
    const match = cnpjString.match(/\[([^\|]+)\|/);
    return match ? match[1].trim() : null;
  }

  /**
   * Fetch KPI data for multiple CNPJ IDs from cnpj__c collection
   * 
   * Uses Funifier aggregate API with $match and $in operator for batch fetching.
   * Results are cached for 10 minutes to minimize API calls.
   * 
   * @param cnpjIds - Array of CNPJ IDs to fetch KPI data for
   * @returns Observable of Map from CNPJ ID to KPI data
   */
  getKpiData(cnpjIds: string[]): Observable<Map<string, CnpjKpiData>> {
    if (!cnpjIds || cnpjIds.length === 0) {
      return of(new Map());
    }

    // Create cache key from sorted IDs
    const cacheKey = [...cnpjIds].sort().join(',');
    const cached = this.getCachedData(this.kpiCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Query cnpj__c collection with aggregate
    const aggregateBody = [
      { $match: { _id: { $in: cnpjIds } } }
    ];

    console.log('📊 Fetching KPI data for CNPJ IDs:', cnpjIds);

    const request$ = this.funifierApi.post<CnpjKpiData[]>(
      '/v3/database/cnpj__c/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        console.log('📊 KPI data response:', response);
        
        // Convert array to Map for easy lookup
        const kpiMap = new Map<string, CnpjKpiData>();
        if (Array.isArray(response)) {
          response.forEach(item => {
            if (item._id) {
              kpiMap.set(item._id, item);
            }
          });
        }
        
        return kpiMap;
      }),
      catchError(error => {
        console.error('📊 Error fetching KPI data:', error);
        // Return empty map on error - don't break the UI
        return of(new Map<string, CnpjKpiData>());
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.kpiCache, cacheKey, request$);
    return request$;
  }

  /**
   * Enrich company display items with KPI data
   * 
   * Takes action_log CNPJ data (CNPJ string + action count) and adds deliveryKpi property
   * by extracting CNPJ IDs and fetching KPI data from cnpj__c collection.
   * 
   * Companies with invalid CNPJ format or missing KPI data will not have deliveryKpi property.
   * 
   * @param companies - Array of companies with CNPJ string and action count
   * @returns Observable of enriched company display data with KPI information
   */
  enrichCompaniesWithKpis(
    companies: { cnpj: string; actionCount: number }[]
  ): Observable<CompanyDisplay[]> {
    if (!companies || companies.length === 0) {
      return of([]);
    }

    // Extract CNPJ IDs from all companies
    const companiesWithIds = companies.map(company => ({
      ...company,
      cnpjId: this.extractCnpjId(company.cnpj)
    }));

    // Get unique valid CNPJ IDs
    const validCnpjIds = [...new Set(
      companiesWithIds
        .map(c => c.cnpjId)
        .filter((id): id is string => id !== null)
    )];

    console.log('📊 Extracted CNPJ IDs:', validCnpjIds);

    if (validCnpjIds.length === 0) {
      // No valid IDs, return companies without KPI data
      return of(companiesWithIds.map(c => ({
        cnpj: c.cnpj,
        cnpjId: c.cnpjId || undefined,
        actionCount: c.actionCount
      })));
    }

    // Fetch KPI data for all valid IDs
    return this.getKpiData(validCnpjIds).pipe(
      map(kpiMap => {
        // Enrich each company with KPI data if available
        return companiesWithIds.map(company => {
          const result: CompanyDisplay = {
            cnpj: company.cnpj,
            cnpjId: company.cnpjId || undefined,
            actionCount: company.actionCount
          };

          // Add KPI data if available
          if (company.cnpjId && kpiMap.has(company.cnpjId)) {
            const kpiData = kpiMap.get(company.cnpjId)!;
            result.deliveryKpi = this.mapToKpiData(kpiData);
          }

          return result;
        });
      }),
      catchError(error => {
        console.error('📊 Error enriching companies with KPIs:', error);
        // Return companies without KPI data on error
        return of(companiesWithIds.map(c => ({
          cnpj: c.cnpj,
          cnpjId: c.cnpjId || undefined,
          actionCount: c.actionCount
        })));
      })
    );
  }

  /**
   * Map CNPJ KPI data to KPIData format
   * 
   * @param cnpjKpi - Raw KPI data from cnpj__c collection
   * @returns Formatted KPI data for display
   */
  private mapToKpiData(cnpjKpi: CnpjKpiData): KPIData {
    const current = cnpjKpi.entrega || 0;
    const target = 100; // Default target, could be configurable
    const percentage = Math.min((current / target) * 100, 100);

    return {
      id: 'delivery',
      label: 'Entregas',
      current,
      target,
      unit: 'entregas',
      percentage,
      color: this.getKpiColor(current, target)
    };
  }

  /**
   * Determine KPI color based on completion percentage
   * 
   * @param current - Current value
   * @param target - Target value
   * @returns Color indicator (red, yellow, or green)
   */
  private getKpiColor(current: number, target: number): 'red' | 'yellow' | 'green' {
    if (target === 0) {
      return 'red';
    }

    const percentage = (current / target) * 100;

    if (percentage >= 80) {
      return 'green';
    } else if (percentage >= 50) {
      return 'yellow';
    }

    return 'red';
  }

  /**
   * Clear KPI cache
   * 
   * Useful for forcing a refresh of KPI data
   */
  clearCache(): void {
    this.kpiCache.clear();
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
