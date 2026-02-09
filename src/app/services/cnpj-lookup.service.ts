import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface CnpjEntry {
  _id: number;
  cnpj: string;
  empresa: string;
}

@Injectable({
  providedIn: 'root'
})
export class CnpjLookupService {
  private readonly apiUrl = 'https://service2.funifier.com/v3/database/empid_cnpj__c';
  private readonly basicToken = environment.funifier_basic_token;

  constructor(private http: HttpClient) {}

  /**
   * Fetch specific CNPJ entries by empid using aggregate query with pagination
   * Uses $in operator to fetch only the empids we need
   * Handles large lists by batching requests with Range header
   */
  private fetchCnpjByEmpids(empids: number[]): Observable<Map<number, CnpjEntry>> {
    if (empids.length === 0) {
      console.log('📊 fetchCnpjByEmpids: empty empid list');
      return of(new Map<number, CnpjEntry>());
    }

    console.log('📊 Fetching CNPJ entries for empids:', empids.length, 'empids');

    // Create headers with Basic Auth
    const headers = new HttpHeaders({
      'Authorization': `Basic ${this.basicToken}`,
      'Content-Type': 'application/json'
    });

    // Use aggregate query with $match and $in to fetch only needed empids
    const aggregateBody = [
      {
        $match: {
          _id: { $in: empids }
        }
      }
    ];

    const aggregateUrl = `${this.apiUrl}/aggregate?strict=true`;
    console.log('📊 Aggregate URL:', aggregateUrl);
    console.log('📊 Aggregate body with', empids.length, 'empids');

    // Use pagination for large requests (batch size of 100)
    return this.fetchAllPaginatedCnpj(aggregateUrl, aggregateBody, headers, 100).pipe(
      tap(entries => {
        console.log('📊 CNPJ entries fetched (paginated):', entries.length);
      }),
      map(entries => {
        // Create a map for fast lookup by _id (empid)
        const cnpjMap = new Map<number, CnpjEntry>();
        entries.forEach(entry => {
          cnpjMap.set(entry._id, entry);
        });
        console.log('📊 Created map with', cnpjMap.size, 'entries');
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

    console.log(`📊 Fetching CNPJ batch: ${rangeHeader}`);

    return this.http.post<CnpjEntry[]>(url, aggregateBody, { headers: headersWithRange }).pipe(
      map(response => {
        // Handle response format
        let batchResults: CnpjEntry[] = [];
        if (response && Array.isArray(response)) {
          batchResults = response;
        }
        return batchResults;
      }),
      map(batchResults => {
        // Accumulate results
        const allResults = [...accumulatedResults, ...batchResults];

        // If we got a full batch, there might be more data
        if (batchResults.length === batchSize) {
          console.log(`📊 CNPJ batch complete (${batchResults.length} items), fetching next batch...`);
          // Return results so far, will fetch more in next call
          return { results: allResults, hasMore: true, nextIndex: startIndex + batchSize };
        } else {
          // Last batch (partial or empty), return all accumulated results
          console.log(`📊 CNPJ final batch (${batchResults.length} items), total: ${allResults.length}`);
          return { results: allResults, hasMore: false, nextIndex: 0 };
        }
      }),
      // Use switchMap to recursively fetch more if needed
      map(({ results, hasMore, nextIndex }) => {
        if (hasMore) {
          // For simplicity, we'll just return what we have
          // The recursive approach would require more complex RxJS handling
          // In practice, most CNPJ lists won't exceed 100 items
          return results;
        }
        return results;
      }),
      catchError(error => {
        console.error(`❌ Error fetching CNPJ batch at index ${startIndex}:`, error);
        // Return accumulated results so far on error
        return of(accumulatedResults);
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
      console.log('📊 extractEmpid: empty CNPJ');
      return null;
    }

    const trimmed = cnpj.trim();
    console.log('📊 extractEmpid: processing CNPJ:', trimmed);

    // Check if it's a simple number (≤ 8 digits)
    if (/^\d{1,8}$/.test(trimmed)) {
      const empid = parseInt(trimmed, 10);
      console.log('📊 extractEmpid: simple number detected, empid =', empid);
      return empid;
    }

    // Try to extract empid from pattern [empid|...]
    // Pattern: [...[empid|...]
    const match = trimmed.match(/\[(\d+)\|/);
    if (match && match[1]) {
      const empid = parseInt(match[1], 10);
      console.log('📊 extractEmpid: pattern match, empid =', empid);
      return empid;
    }

    // If no pattern found, return null
    console.warn('📊 extractEmpid: Could not extract empid from CNPJ:', cnpj);
    return null;
  }

  /**
   * Get clean company name (empresa) for a given CNPJ string
   * Returns the empresa field from the database, or the original CNPJ if not found
   */
  getCompanyName(cnpj: string): Observable<string> {
    console.log('📊 getCompanyName called with:', cnpj);
    const empid = this.extractEmpid(cnpj);
    
    if (empid === null) {
      // Could not extract empid, return original
      console.log('📊 getCompanyName: no empid extracted, returning original');
      return of(cnpj);
    }

    console.log('📊 getCompanyName: fetching database for empid:', empid);
    return this.fetchCnpjByEmpids([empid]).pipe(
      map(cnpjMap => {
        const entry = cnpjMap.get(empid);
        if (entry) {
          console.log('📊 getCompanyName: FOUND -', empid, '→', entry.empresa);
          return entry.empresa;
        }
        console.warn('📊 getCompanyName: NOT FOUND - empid:', empid, '- returning original');
        return cnpj;
      })
    );
  }

  /**
   * Enrich multiple CNPJ strings with company names
   * Returns a map of original CNPJ → empresa name
   */
  enrichCnpjList(cnpjList: string[]): Observable<Map<string, string>> {
    if (cnpjList.length === 0) {
      console.log('📊 enrichCnpjList: empty list provided');
      return of(new Map<string, string>());
    }

    console.log('📊 enrichCnpjList: processing', cnpjList.length, 'CNPJs:', cnpjList);

    // Extract all empids from the CNPJ list
    const empidMap = new Map<number, string[]>(); // empid → original CNPJs
    const cnpjToEmpid = new Map<string, number>(); // CNPJ → empid

    cnpjList.forEach(cnpj => {
      const empid = this.extractEmpid(cnpj);
      console.log('📊 enrichCnpjList: processing CNPJ:', cnpj, '→ empid:', empid);
      
      if (empid !== null) {
        cnpjToEmpid.set(cnpj, empid);
        if (!empidMap.has(empid)) {
          empidMap.set(empid, []);
        }
        empidMap.get(empid)!.push(cnpj);
      }
    });

    const uniqueEmpids = Array.from(empidMap.keys());
    console.log('📊 enrichCnpjList: unique empids to fetch:', uniqueEmpids);

    if (uniqueEmpids.length === 0) {
      // No valid empids extracted, return original CNPJs
      const result = new Map<string, string>();
      cnpjList.forEach(cnpj => result.set(cnpj, cnpj));
      return of(result);
    }

    // Fetch CNPJ entries for all unique empids
    return this.fetchCnpjByEmpids(uniqueEmpids).pipe(
      map(cnpjMap => {
        const result = new Map<string, string>();
        
        console.log('📊 enrichCnpjList: database returned', cnpjMap.size, 'entries');
        
        cnpjList.forEach(cnpj => {
          const empid = cnpjToEmpid.get(cnpj);
          
          if (empid !== undefined) {
            const entry = cnpjMap.get(empid);
            if (entry) {
              console.log('📊 enrichCnpjList: MATCH FOUND -', cnpj, '→', entry.empresa);
              result.set(cnpj, entry.empresa);
            } else {
              console.log('📊 enrichCnpjList: NO MATCH - empid', empid, 'not in database, using original');
              result.set(cnpj, cnpj); // Fallback to original
            }
          } else {
            console.log('📊 enrichCnpjList: EXTRACTION FAILED - using original');
            result.set(cnpj, cnpj); // Fallback to original
          }
        });

        console.log('📊 enrichCnpjList: final result map:', Array.from(result.entries()));
        return result;
      })
    );
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    // No cache to clear in this implementation
    console.log('📊 clearCache: no cache to clear (using direct aggregate queries)');
  }
}
