import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { CompanyMapper } from './company-mapper.service';
import { Company, CompanyDetails, Process } from '@model/gamification-dashboard.model';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class CompanyService {
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  private companiesCache = new Map<string, CacheEntry<Company[]>>();
  private companyDetailsCache = new Map<string, CacheEntry<CompanyDetails>>();

  constructor(
    private funifierApi: FunifierApiService,
    private mapper: CompanyMapper
  ) {}

  /**
   * Get companies with optional filtering
   * Companies come from cnpj_performance__c collection filtered by player ID
   */
  getCompanies(playerId: string, filter?: { search?: string; minHealth?: number }): Observable<Company[]> {
    const cacheKey = `${playerId}_${JSON.stringify(filter || {})}`;
    const cached = this.getCachedData(this.companiesCache, cacheKey);
    if (cached) {
      return cached;
    }

    // First get the player's email/ID to filter companies
    const request$ = this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      map(response => {
        // Get player email to use as filter
        const playerEmail = response._id || response.email || '';
        return playerEmail;
      }),
      catchError(error => {
        console.error('Error fetching player status:', error);
        return of(''); // Return empty string to continue with unfiltered query
      }),
      // Now fetch companies from cnpj_performance__c
      map(playerEmail => {
        return playerEmail;
      })
    );

    // Query cnpj_performance__c collection
    const companiesRequest$ = this.funifierApi.post<any[]>(
      `/v3/database/cnpj_performance__c/aggregate?strict=true`,
      [
        { $sort: { name: 1 } }, // Sort by name
        { $limit: 100 } // Limit results
      ]
    ).pipe(
      map(response => {
        console.log('📊 Companies from cnpj_performance__c:', response);
        
        if (!response || !Array.isArray(response)) {
          console.warn('No companies found in cnpj_performance__c');
          return [];
        }
        
        // Map each company from the database
        let companies = response.map((companyData: any) => this.mapper.toCompany(companyData));
        
        // Apply filters
        if (filter) {
          if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            companies = companies.filter(c => 
              c.name.toLowerCase().includes(searchLower) ||
              c.cnpj.includes(filter.search!)
            );
          }
          
          if (filter.minHealth !== undefined) {
            companies = companies.filter(c => c.healthScore >= filter.minHealth!);
          }
        }
        
        return companies;
      }),
      catchError(error => {
        console.error('Error fetching companies from cnpj_performance__c:', error);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.companiesCache, cacheKey, companiesRequest$);
    return companiesRequest$;
  }

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

    const request$ = this.funifierApi.post<any[]>(
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
              p.tasks.some(t => t.status === 'completed')
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
    this.companiesCache.clear();
    this.companyDetailsCache.clear();
  }

  /**
   * Clear cache for specific company
   */
  clearCompanyCache(companyId: string): void {
    this.companyDetailsCache.delete(companyId);
    
    // Clear companies cache entries that might include this company
    this.companiesCache.clear();
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
