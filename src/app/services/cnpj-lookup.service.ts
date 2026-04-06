import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
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
      return of(new Map<number, CnpjEntry>());
    }
    // Create headers with Basic Auth
    const headers = new HttpHeaders({
      'Authorization': `Basic ${this.basicToken}`,
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
      return of(new Map<string, string>());
    }
    // Extract all empids from the CNPJ list
    const empidMap = new Map<number, string[]>(); // empid → original CNPJs
    const cnpjToEmpid = new Map<string, number>(); // CNPJ → empid

    cnpjList.forEach(cnpj => {
      const empid = this.extractEmpid(cnpj);
      if (empid !== null) {
        cnpjToEmpid.set(cnpj, empid);
        if (!empidMap.has(empid)) {
          empidMap.set(empid, []);
        }
        empidMap.get(empid)!.push(cnpj);
      }
    });

    const uniqueEmpids = Array.from(empidMap.keys());
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
        cnpjList.forEach(cnpj => {
          const empid = cnpjToEmpid.get(cnpj);
          
          if (empid !== undefined) {
            const entry = cnpjMap.get(empid);
            if (entry) {
              result.set(cnpj, entry.empresa);
            } else {
              result.set(cnpj, cnpj); // Fallback to original
            }
          } else {
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
  }
}
