import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap, timeout, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { PlayerMapper } from './player-mapper.service';
import { PlayerStatus, PointWallet, SeasonProgress } from '@model/gamification-dashboard.model';

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
  
  // Cache the raw response Observable with shareReplay
  private cachedRawData: Map<string, CacheEntry> = new Map();

  constructor(
    private funifierApi: FunifierApiService,
    private mapper: PlayerMapper
  ) {}

  /**
   * Get raw player data - fetches fresh or returns cached Observable
   * Uses shareReplay to ensure only one HTTP request is made per player
   */
  getRawPlayerData(playerId: string, forceRefresh: boolean = false): Observable<any> {
    const cached = this.cachedRawData.get(playerId);
    const now = Date.now();
    
    // Return cached Observable if valid and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      console.log('📊 Using cached Observable for:', playerId);
      return cached.data$;
    }

    console.log('📊 Fetching fresh player data for:', playerId);
    
    // Create new Observable with shareReplay to share the request
    const request$ = this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap(response => {
        console.log('📊 Raw player data received:', response);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION }),
      catchError(error => {
        console.error('📊 Error fetching player data:', error);
        // Remove from cache on error
        this.cachedRawData.delete(playerId);
        return throwError(() => error);
      })
    );

    // Cache the Observable
    this.cachedRawData.set(playerId, {
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
        console.log('📊 Mapped player status:', status);
        return status;
      }),
      catchError(error => {
        console.error('Error mapping player status:', error);
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
        console.log('📊 Mapped point wallet:', points);
        return points;
      }),
      catchError(error => {
        console.error('Error mapping point wallet:', error);
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
        console.log('📊 Mapped season progress:', progress);
        return progress;
      }),
      catchError(error => {
        console.error('Error mapping season progress:', error);
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
