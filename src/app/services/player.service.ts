import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map, catchError, tap, timeout, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { PlayerMapper } from './player-mapper.service';
import { PlayerStatus, PointWallet, SeasonProgress } from '@model/gamification-dashboard.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface CacheEntry {
  data$: Observable<any>;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  private readonly REQUEST_TIMEOUT = 15000; // 15 seconds timeout
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes cache
  private readonly funifierBaseUrl = environment.funifier_base_url || 'https://service2.funifier.com/v3/';
  
  // Cache the raw response Observable with shareReplay
  private cachedRawData: Map<string, CacheEntry> = new Map();

  constructor(
    private funifierApi: FunifierApiService,
    private mapper: PlayerMapper,
    private http: HttpClient
  ) {}

  /**
   * Get raw player data - fetches fresh or returns cached Observable
   * Uses shareReplay to ensure only one HTTP request is made per player
   * IMPORTANT: This method uses player/{id}/status endpoint which includes points data
   * For fast data (cnpj_resp, entrega, goals), use getCurrentPlayerData() instead
   */
  getRawPlayerData(playerId: string, forceRefresh: boolean = false): Observable<any> {
    // For 'me', use player/me/status to get full status including points
    const endpoint = playerId === 'me' ? '/v3/player/me/status' : `/v3/player/${playerId}/status`;
    const cacheKey = `status_${playerId}`;
    
    const cached = this.cachedRawData.get(cacheKey);
    const now = Date.now();
    
    // Return cached Observable if valid and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data$;
    }

    // Create new Observable with shareReplay to share the request
    const request$ = this.funifierApi.get<any>(endpoint).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap(response => {
        console.log(`📊 Player status response (${playerId}):`, response);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION }),
      catchError(error => {
        console.error(`❌ Error fetching player status (${playerId}):`, error);
        // Remove from cache on error
        this.cachedRawData.delete(cacheKey);
        return throwError(() => error);
      })
    );

    // Cache the Observable
    this.cachedRawData.set(cacheKey, {
      data$: request$,
      timestamp: now
    });

    return request$;
  }

  /**
   * Get current player data using the faster player/me endpoint
   * This is faster than player/{id}/status and returns cnpj_resp, entrega, goals
   * Uses Bearer token from session (added by AuthInterceptor)
   */
  getCurrentPlayerData(forceRefresh: boolean = false): Observable<any> {
    const cacheKey = 'me';
    const cached = this.cachedRawData.get(cacheKey);
    const now = Date.now();
    
    // Return cached Observable if valid and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data$;
    }

    // Use player/me endpoint (faster than player/me/status)
    const request$ = this.http.get<any>(`${this.funifierBaseUrl}player/me`).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap(response => {
        console.log('📊 Player/me response:', response);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION }),
      catchError(error => {
        console.error('❌ Error fetching player/me:', error);
        // Remove from cache on error
        this.cachedRawData.delete(cacheKey);
        return throwError(() => error);
      })
    );

    // Cache the Observable
    this.cachedRawData.set(cacheKey, {
      data$: request$,
      timestamp: now
    });

    return request$;
  }

  /**
   * Get raw player data - fetches fresh or returns cached (backward compatibility)
   * @deprecated Use getRawPlayerData instead
   */
  private fetchPlayerData(playerId: string): Observable<any> {
    return this.getRawPlayerData(playerId);
  }

  /**
   * Get player status
   */
  getPlayerStatus(playerId: string): Observable<PlayerStatus> {
    return this.fetchPlayerData(playerId).pipe(
      map(response => {
        const status = this.mapper.toPlayerStatus(response);
        return status;
      }),
      catchError(error => {
                return throwError(() => error);
      })
    );
  }

  /**
   * Get player points
   */
  getPlayerPoints(playerId: string): Observable<PointWallet> {
    return this.fetchPlayerData(playerId).pipe(
      map(response => {
        const points = this.mapper.toPointWallet(response);
        return points;
      }),
      catchError(error => {
                return throwError(() => error);
      })
    );
  }

  /**
   * Get season progress
   */
  getSeasonProgress(playerId: string, seasonDates: { start: Date; end: Date }): Observable<SeasonProgress> {
    return this.fetchPlayerData(playerId).pipe(
      map(response => {
        const progress = this.mapper.toSeasonProgress(response, seasonDates);
        return progress;
      }),
      catchError(error => {
                return throwError(() => error);
      })
    );
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cachedRawData.clear();
  }

  /**
   * Clear cache for specific player
   */
  clearPlayerCache(playerId: string): void {
    this.cachedRawData.delete(playerId);
  }
}

