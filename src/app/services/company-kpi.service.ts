import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { KPIData } from '@model/gamification-dashboard.model';

/**
 * Interface for CNPJ KPI data from cnpj__c collection
 */
export interface CnpjKpiData {
  _id: string;
  entrega: number;
  CNPJ?: string;
  'Classificação do Cliente'?: string;
}

/**
 * Interface for company display data with KPI information
 */
export interface CompanyDisplay {
  cnpj: string; // empid from cnpj_resp
  cnpjId?: string; // Extracted ID for KPI lookup (same as cnpj for cnpj_resp)
  cnpjNumber?: string; // Actual CNPJ number from empid_cnpj__c (e.g. "00.063.263/0009-05")
  name?: string; // Company name from empid_cnpj__c
  status?: string; // Company status from empid_cnpj__c (e.g. "Ativa", "Inativa")
  actionCount: number; // Number of actions for this company
  processCount: number; // Number of unique processes (delivery_id) for this company
  entrega?: number; // Entregas no Prazo % from cnpj__c
  classificacao?: string; // Classificação do Cliente from cnpj__c (Ouro, Prata, Diamante)
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

    const stringIds = cnpjIds.map(id => String(id));
    const aggregateBody = [
      { $match: { _id: { $in: stringIds } } }
    ];

    console.log('📊 Fetching KPI data for CNPJ IDs:', cnpjIds.length, 'IDs');

    const request$ = this.fetchAllPaginatedKpi(aggregateBody, 100).pipe(
      map(entries => {
        const kpiMap = new Map<string, CnpjKpiData>();
        entries.forEach(item => {
          if (item._id) {
            kpiMap.set(String(item._id), item);
          }
        });
        console.log('📊 KPI data map created with', kpiMap.size, 'entries');
        return kpiMap;
      }),
      catchError(error => {
        console.error('📊 Error fetching KPI data:', error);
        return of(new Map<string, CnpjKpiData>());
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.kpiCache, cacheKey, request$);
    return request$;
  }

  /**
   * Paginated fetch for cnpj__c aggregate.
   * Uses Range header: items=startIndex-batchSize
   * Recursively fetches until a partial batch is returned.
   */
  private fetchAllPaginatedKpi(
    aggregateBody: any[],
    batchSize: number,
    startIndex: number = 0,
    accumulated: CnpjKpiData[] = []
  ): Observable<CnpjKpiData[]> {
    const rangeHeader = `items=${startIndex}-${batchSize}`;
    console.warn(`📊 KPI batch: ${rangeHeader} (accumulated: ${accumulated.length})`);

    return this.funifierApi.post<CnpjKpiData[]>(
      '/v3/database/cnpj__c/aggregate?strict=true',
      aggregateBody,
      { headers: { 'Range': rangeHeader } }
    ).pipe(
      switchMap(response => {
        const batch = Array.isArray(response) ? response : [];
        const all = [...accumulated, ...batch];

        if (batch.length === batchSize) {
          // Full batch — there might be more
          return this.fetchAllPaginatedKpi(aggregateBody, batchSize, startIndex + batchSize, all);
        }
        // Partial or empty — done
        console.log(`📊 KPI final batch (${batch.length} items), total: ${all.length}`);
        return of(all);
      }),
      catchError(error => {
        console.error(`❌ Error fetching KPI batch at index ${startIndex}:`, error);
        return of(accumulated);
      })
    );
  }

  /**
   * Enrich a list of empids (from cnpj_resp) with KPI data from cnpj__c
   * and names from empid_cnpj__c.
   * 
   * @param empids - Array of empid strings from player.extra.cnpj_resp
   * @returns Observable of enriched CompanyDisplay array
   */
  /**
   * Check if a value is a full CNPJ (14 digits with formatting like 57.443.329/0001-44)
   */
  private isFullCnpj(value: string): boolean {
    if (!value) return false;
    return /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(value.trim());
  }

  /**
   * Fetch KPI data from cnpj__c by the CNPJ field (for full CNPJ numbers)
   * instead of by _id (for empids)
   */
  private getKpiDataByCnpjField(fullCnpjs: string[]): Observable<Map<string, CnpjKpiData>> {
    if (!fullCnpjs || fullCnpjs.length === 0) {
      return of(new Map());
    }

    const aggregateBody = [
      { $match: { CNPJ: { $in: fullCnpjs } } }
    ];

    console.warn('📊 Fetching KPI data by CNPJ field for', fullCnpjs.length, 'full CNPJs');

    return this.fetchAllPaginatedKpi(aggregateBody, 100).pipe(
      map(entries => {
        const kpiMap = new Map<string, CnpjKpiData>();
        entries.forEach(item => {
          if (item.CNPJ) {
            kpiMap.set(item.CNPJ, item);
          }
        });
        console.warn('📊 KPI data by CNPJ field: map created with', kpiMap.size, 'entries');
        return kpiMap;
      }),
      catchError(error => {
        console.error('📊 Error fetching KPI data by CNPJ field:', error);
        return of(new Map<string, CnpjKpiData>());
      })
    );
  }

  enrichFromCnpjResp(empids: string[]): Observable<CompanyDisplay[]> {
    if (!empids || empids.length === 0) {
      return of([]);
    }

    // Separate empids into short (lookup by _id) and full CNPJ (lookup by CNPJ field)
    const shortIds: string[] = [];
    const fullCnpjs: string[] = [];
    empids.forEach(id => {
      if (this.isFullCnpj(id)) {
        fullCnpjs.push(id);
      } else {
        shortIds.push(id);
      }
    });

    console.warn('📊 enrichFromCnpjResp: shortIds:', shortIds.length, 'fullCnpjs:', fullCnpjs.length);

    // Fetch both in parallel
    const shortFetch$ = shortIds.length > 0 ? this.getKpiData(shortIds) : of(new Map<string, CnpjKpiData>());
    const fullFetch$ = fullCnpjs.length > 0 ? this.getKpiDataByCnpjField(fullCnpjs) : of(new Map<string, CnpjKpiData>());

    return forkJoin({ shortMap: shortFetch$, fullMap: fullFetch$ }).pipe(
      map(({ shortMap, fullMap }) => {
        console.warn('📊 enrichFromCnpjResp: shortMap size:', shortMap.size, 'fullMap size:', fullMap.size);
        return empids.map(empid => {
          // Try short ID lookup first, then full CNPJ lookup
          const kpiData = this.isFullCnpj(empid) ? fullMap.get(empid) : shortMap.get(empid);
          if (!kpiData) {
            console.warn('📊 enrichFromCnpjResp: NO KPI for', empid);
          }
          const result: CompanyDisplay = {
            cnpj: empid,
            cnpjId: empid,
            actionCount: 0,
            processCount: 0,
            entrega: kpiData?.entrega,
            classificacao: kpiData?.['Classificação do Cliente'],
          };

          if (kpiData) {
            result.deliveryKpi = this.mapToKpiData(kpiData);
          }

          return result;
        });
      }),
      catchError(error => {
        console.error('📊 Error enriching cnpj_resp with KPIs:', error);
        return of(empids.map(empid => ({
          cnpj: empid,
          cnpjId: empid,
          actionCount: 0,
          processCount: 0,
        } as CompanyDisplay)));
      })
    );
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
    companies: { cnpj: string; actionCount: number; processCount?: number }[]
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
        actionCount: c.actionCount,
        processCount: c.processCount || 0
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
            actionCount: company.actionCount,
            processCount: company.processCount || 0
          };

          // Add KPI data if available
          if (company.cnpjId && kpiMap.has(company.cnpjId)) {
            const kpiData = kpiMap.get(company.cnpjId)!;
            result.deliveryKpi = this.mapToKpiData(kpiData);
            result.entrega = kpiData.entrega;
            result.classificacao = kpiData['Classificação do Cliente'];
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
          actionCount: c.actionCount,
          processCount: c.processCount || 0
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
    const target = 90; // Target matches the circular KPI progress (90%)
    const percentage = Math.min((current / target) * 100, 100);

    return {
      id: 'delivery',
      label: 'Entregas no Prazo', // Full label instead of just "Entregas"
      current,
      target,
      unit: '%',
      percentage,
      color: this.getKpiColor(current, target)
    };
  }

  /**
   * Determine KPI color based on completion percentage
   * 
   * If current is below target, always return red.
   * Otherwise, use percentage-based color logic.
   * 
   * @param current - Current value
   * @param target - Target value
   * @returns Color indicator (red, yellow, or green)
   */
  private getKpiColor(current: number, target: number): 'red' | 'yellow' | 'green' {
    if (target === 0) {
      return 'red';
    }

    // If current is below target, always show red
    if (current < target) {
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
