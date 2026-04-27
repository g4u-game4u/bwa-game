import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { BackendApiService } from './backend-api.service';
import { CompanyMapper } from './company-mapper.service';
import { CompanyDetails, Process } from '@model/gamification-dashboard.model';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  private companyDetailsCache = new Map<string, CacheEntry<CompanyDetails>>();

  constructor(
    private backendApi: BackendApiService,
    private mapper: CompanyMapper
  ) {}

  /**
   * Get company details from cnpj_performance__c database
   * companyId is the CNPJ
   */
  getCompanyDetails(companyId: string): Observable<CompanyDetails> {
    const cached = this.getCachedData(this.companyDetailsCache, companyId);
    if (cached) {
      return cached;
    }

    // Query the custom database with aggregate
    const aggregateBody = [
      { $match: { _id: companyId } },
      { $limit: 1 }
    ];

    const request$ = this.backendApi.post<any[]>(
      `/v3/database/cnpj_performance__c/aggregate?strict=true`,
      aggregateBody
    ).pipe(
      map(response => {
        // Response is an array, get first item
        const companyData = response && response.length > 0 ? response[0] : null;

        if (!companyData) {
          throw new Error(`Company with CNPJ ${companyId} not found`);
        }

        return this.mapper.toCompanyDetails(companyData);
      }),
      catchError(error => {
        console.error('Error fetching company details:', error);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.companyDetailsCache, companyId, request$);
    return request$;
  }

  /**
   * Get company processes with tab filtering
   */
  getCompanyProcesses(
    companyId: string,
    filter: 'macros-incompletas' | 'atividades-finalizadas' | 'macros-finalizadas'
  ): Observable<Process[]> {
    return this.getCompanyDetails(companyId).pipe(
      map(details => {
        switch (filter) {
          case 'macros-incompletas':
            return details.processes.filter(p =>
              p.status === 'pending' || p.status === 'in-progress'
            );

          case 'atividades-finalizadas':
            // Return processes with completed tasks
            return details.processes.filter(p =>
              p.tasks?.some(t => t.status === 'completed') ?? false
            );

          case 'macros-finalizadas':
            return details.processes.filter(p => p.status === 'completed');

          default:
            return details.processes;
        }
      }),
      catchError(error => {
        console.error('Error fetching company processes:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.companyDetailsCache.clear();
  }

  /**
   * Clear cache for specific company
   */
  clearCompanyCache(companyId: string): void {
    this.companyDetailsCache.delete(companyId);
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
