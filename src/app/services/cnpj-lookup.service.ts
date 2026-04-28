import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { joinApiPath } from '../../environments/backend-url';

export interface CnpjEntry {
  _id: number;
  cnpj: string;
  empresa: string;
  status?: string; // e.g. "Ativa", "Inativa"
}

/**
 * Enriched company info returned by enrichCnpjListFull
 */
export interface CnpjEnrichedInfo {
  empresa: string;
  status?: string; // "Ativa", "Inativa", etc.
  cnpj?: string; // Actual CNPJ number from empid_cnpj__c
}

@Injectable({
  providedIn: 'root'
})
export class CnpjLookupService {
  private readonly apiUrl = joinApiPath(
    (environment.backend_url_base || '').trim().replace(/\/+$/, ''),
    '/database/empid_cnpj__c'
  );

  constructor(private http: HttpClient) {}

  /**
   * Fetch specific CNPJ entries by empid using aggregate query with pagination
   * Uses $in operator to fetch only the empids we need
   * Handles large lists by batching requests with Range header
   */
  private fetchCnpjByEmpids(empids: number[]): Observable<Map<number, CnpjEntry>> {
    if (empids.length === 0) {
      return of(new Map<number, CnpjEntry>());
    }


    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    // Use aggregate query with $match and $in to fetch only needed empids
    // Funifier API requires _id values to be strings, not numbers
    const empidStrings = empids.map(id => String(id));
    const aggregateBody = [
      {
        $match: {
          _id: { $in: empidStrings }
        }
      }
    ];

    const aggregateUrl = `${this.apiUrl}/aggregate?strict=true`;

    // Use pagination for large requests (batch size of 100)
    return this.fetchAllPaginatedCnpj(aggregateUrl, aggregateBody, headers, 100).pipe(
      tap(entries => {
      }),
      map(entries => {
        // Create a map for fast lookup by _id (empid)
        // API may return _id as string or number, so normalize to number for consistent lookup
        const cnpjMap = new Map<number, CnpjEntry>();
        entries.forEach(entry => {
          const numericId = typeof entry._id === 'string' ? parseInt(entry._id, 10) : entry._id;
          cnpjMap.set(numericId, { ...entry, _id: numericId });
        });
        return cnpjMap;
      }),
      catchError(error => {
        console.error('❌ Error fetching CNPJ entries:', error);
        console.error('❌ Error status:', error.status);
        console.error('❌ Error message:', error.message);
        return of(new Map<number, CnpjEntry>());
      })
    );
  }

  /**
   * Fetch all CNPJ entries using pagination with Range header
   * Recursively fetches batches until all data is retrieved
   */
  private fetchAllPaginatedCnpj(
    url: string,
    aggregateBody: any[],
    headers: HttpHeaders,
    batchSize: number,
    startIndex: number = 0,
    accumulatedResults: CnpjEntry[] = []
  ): Observable<CnpjEntry[]> {
    // Set Range header: "items=startIndex-batchSize"
    const rangeHeader = `items=${startIndex}-${batchSize}`;
    const headersWithRange = headers.set('Range', rangeHeader);

    if (url.toLowerCase().includes('/aggregate')) {
      console.warn('[CnpjLookup] POST aggregate Funifier desativado; sem enriquecimento empid→CNPJ.');
      return of(accumulatedResults.length ? accumulatedResults : []);
    }

    return this.http.post<CnpjEntry[]>(url, aggregateBody, { headers: headersWithRange }).pipe(
      switchMap(response => {
        // Handle response format
        let batchResults: CnpjEntry[] = [];
        if (response && Array.isArray(response)) {
          batchResults = response;
        }

        // Accumulate results
        const allResults = [...accumulatedResults, ...batchResults];

        // If we got a full batch, there might be more data - recursively fetch
        if (batchResults.length === batchSize) {
          const nextIndex = startIndex + batchSize;
          // Recursively fetch next batch
          return this.fetchAllPaginatedCnpj(url, aggregateBody, headers, batchSize, nextIndex, allResults);
        } else {
          // Last batch (partial or empty), return all accumulated results
          return of(allResults);
        }
      }),
      catchError(error => {
        console.error(`❌ Error fetching CNPJ batch at index ${startIndex}:`, error);
        // Return accumulated results so far on error
        return of(accumulatedResults);
      })
    );
  }

  /**
   * Check if a string is a full CNPJ (14 digits with formatting like 57.443.329/0001-44)
   */
  isFullCnpj(value: string): boolean {
    if (!value) return false;
    // Full CNPJ has dots, slashes, dashes — e.g. "57.443.329/0001-44"
    return /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(value.trim());
  }

  /**
   * Fetch CNPJ entries from empid_cnpj__c by matching the cnpj field (for full CNPJs)
   * Returns a map of full CNPJ string → CnpjEntry
   */
  private fetchCnpjByFullCnpj(fullCnpjs: string[]): Observable<Map<string, CnpjEntry>> {
    if (fullCnpjs.length === 0) {
      return of(new Map<string, CnpjEntry>());
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const aggregateBody = [
      { $match: { cnpj: { $in: fullCnpjs } } }
    ];

    const aggregateUrl = `${this.apiUrl}/aggregate?strict=true`;

    return this.fetchAllPaginatedCnpj(aggregateUrl, aggregateBody, headers, 100).pipe(
      map(entries => {
        const cnpjMap = new Map<string, CnpjEntry>();
        entries.forEach(entry => {
          if (entry.cnpj) {
            cnpjMap.set(entry.cnpj, entry);
          }
        });
        return cnpjMap;
      }),
      catchError(error => {
        console.error('❌ Error fetching CNPJ entries by full CNPJ:', error);
        return of(new Map<string, CnpjEntry>());
      })
    );
  }

  /**
   * Extract empid from CNPJ string
   * 
   * Logic:
   * - If cnpj ≤ 8 digits → it's the empid directly
   * - If cnpj > 8 digits → extract empid from pattern [empid|...]
   *   The empid is between [ and | (left 10 chars before |)
   * 
   * Examples:
   * - "1748" → empid = 1748
   * - "10380" → empid = 10380
   * - "INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]" → empid = 10010
   * - "SOME COMPANY NAME [12345|9999-99]" → empid = 12345
   */
  extractEmpid(cnpj: string): number | null {
    if (!cnpj) {
      return null;
    }

    const trimmed = cnpj.trim();

    // Check if it's a simple number (≤ 8 digits)
    if (/^\d{1,8}$/.test(trimmed)) {
      const empid = parseInt(trimmed, 10);
      return empid;
    }

    // Try to extract empid from pattern [empid|...]
    // Pattern: [...[empid|...]
    const match = trimmed.match(/\[(\d+)\|/);
    if (match && match[1]) {
      const empid = parseInt(match[1], 10);
      return empid;
    }

    // If no pattern found, return null
    return null;
  }

  /**
   * Get clean company name (empresa) for a given CNPJ string
   * Returns the empresa field from the database, or the original CNPJ if not found
   */
  getCompanyName(cnpj: string): Observable<string> {
    const empid = this.extractEmpid(cnpj);
    
    if (empid === null) {
      // Could not extract empid, return original
      return of(cnpj);
    }

    return this.fetchCnpjByEmpids([empid]).pipe(
      map(cnpjMap => {
        const entry = cnpjMap.get(empid);
        if (entry) {
          return entry.empresa;
        }
        return cnpj;
      })
    );
  }

  /**
   * Enrich multiple CNPJ strings with company names
   * Returns a map of original CNPJ → empresa name
   * Handles both empid-based (≤8 digits) and full CNPJ (XX.XXX.XXX/XXXX-XX) lookups
   */
  enrichCnpjList(cnpjList: string[]): Observable<Map<string, string>> {
    return this.enrichCnpjListFull(cnpjList).pipe(
      map(fullMap => {
        const result = new Map<string, string>();
        fullMap.forEach((info, key) => result.set(key, info.empresa));
        return result;
      })
    );
  }

  /**
   * Enrich multiple CNPJ strings with company names AND status
   * Returns a map of original CNPJ → { empresa, status }
   * Handles both empid-based (≤8 digits) and full CNPJ (XX.XXX.XXX/XXXX-XX) lookups
   */
  enrichCnpjListFull(cnpjList: string[]): Observable<Map<string, CnpjEnrichedInfo>> {
    if (cnpjList.length === 0) {
      return of(new Map<string, CnpjEnrichedInfo>());
    }

    // Separate into empid-based and full CNPJ-based
    const empidMap = new Map<number, string[]>(); // empid → original CNPJs
    const cnpjToEmpid = new Map<string, number>(); // CNPJ → empid
    const fullCnpjList: string[] = []; // Full CNPJs to look up by cnpj field

    cnpjList.forEach(cnpj => {
      if (this.isFullCnpj(cnpj)) {
        fullCnpjList.push(cnpj);
      } else {
        const empid = this.extractEmpid(cnpj);
        if (empid !== null) {
          cnpjToEmpid.set(cnpj, empid);
          if (!empidMap.has(empid)) {
            empidMap.set(empid, []);
          }
          empidMap.get(empid)!.push(cnpj);
        }
      }
    });

    const uniqueEmpids = Array.from(empidMap.keys());

    // Fetch both in parallel
    const empidFetch$ = uniqueEmpids.length > 0
      ? this.fetchCnpjByEmpids(uniqueEmpids)
      : of(new Map<number, CnpjEntry>());

    const fullCnpjFetch$ = fullCnpjList.length > 0
      ? this.fetchCnpjByFullCnpj(fullCnpjList)
      : of(new Map<string, CnpjEntry>());

    return forkJoin({ empidResults: empidFetch$, fullCnpjResults: fullCnpjFetch$ }).pipe(
      map(({ empidResults, fullCnpjResults }) => {
        const result = new Map<string, CnpjEnrichedInfo>();


        // Process empid-based lookups
        cnpjList.forEach(cnpj => {
          if (this.isFullCnpj(cnpj)) {
            // Full CNPJ lookup
            const entry = fullCnpjResults.get(cnpj);
            if (entry) {
              result.set(cnpj, { empresa: entry.empresa, status: entry.status, cnpj: entry.cnpj });
            } else {
              result.set(cnpj, { empresa: cnpj });
            }
          } else {
            const empid = cnpjToEmpid.get(cnpj);
            if (empid !== undefined) {
              const entry = empidResults.get(empid);
              if (entry) {
                result.set(cnpj, { empresa: entry.empresa, status: entry.status, cnpj: entry.cnpj });
              } else {
                result.set(cnpj, { empresa: cnpj });
              }
            } else {
              result.set(cnpj, { empresa: cnpj });
            }
          }
        });

        return result;
      })
    );
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  /**
   * Get full CnpjEntry data for a list of empids.
   * Returns a Map of empid string → CnpjEntry with _id, cnpj, empresa, status.
   */
  getFullEntries(cnpjList: string[]): Observable<Map<string, CnpjEntry>> {
    if (cnpjList.length === 0) {
      return of(new Map<string, CnpjEntry>());
    }

    const empids: number[] = [];
    const empidToOriginal = new Map<number, string>();

    cnpjList.forEach(cnpj => {
      const empid = this.extractEmpid(cnpj);
      if (empid !== null) {
        empids.push(empid);
        empidToOriginal.set(empid, cnpj);
      }
    });

    if (empids.length === 0) {
      return of(new Map<string, CnpjEntry>());
    }

    return this.fetchCnpjByEmpids([...new Set(empids)]).pipe(
      map(cnpjMap => {
        const result = new Map<string, CnpjEntry>();
        cnpjList.forEach(cnpj => {
          const empid = this.extractEmpid(cnpj);
          if (empid !== null && cnpjMap.has(empid)) {
            result.set(cnpj, cnpjMap.get(empid)!);
          }
        });
        return result;
      })
    );
  }

  clearCache(): void {
    // No cache to clear in this implementation
  }
}
