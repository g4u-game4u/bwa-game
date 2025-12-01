import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, shareReplay, tap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { PlayerMapper } from './player-mapper.service';
import { PlayerStatus, PointWallet, SeasonProgress } from '@model/gamification-dashboard.model';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private playerStatusCache = new Map<string, CacheEntry<PlayerStatus>>();
  private pointsCache = new Map<string, CacheEntry<PointWallet>>();
  private progressCache = new Map<string, CacheEntry<SeasonProgress>>();

  // Fallback cached data for offline scenarios
  private lastKnownPlayerStatus: PlayerStatus | null = null;
  private lastKnownPoints: PointWallet | null = null;
  private lastKnownProgress: SeasonProgress | null = null;

  constructor(
    private funifierApi: FunifierApiService,
    private mapper: PlayerMapper
  ) {}

  /**
   * Get player status with caching
   */
  getPlayerStatus(playerId: string): Observable<PlayerStatus> {
    const cached = this.getCachedData(this.playerStatusCache, playerId);
    if (cached) {
      return cached;
    }

    const request$ = this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      map(response => this.mapper.toPlayerStatus(response)),
      tap(status => {
        this.lastKnownPlayerStatus = status;
      }),
      catchError(error => {
        console.error('Error fetching player status:', error);
        
        // Fallback to cached data if available
        if (this.lastKnownPlayerStatus) {
          console.warn('Using cached player status due to error');
          return of(this.lastKnownPlayerStatus);
        }
        
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.playerStatusCache, playerId, request$);
    return request$;
  }

  /**
   * Get player points with caching
   */
  getPlayerPoints(playerId: string): Observable<PointWallet> {
    const cached = this.getCachedData(this.pointsCache, playerId);
    if (cached) {
      return cached;
    }

    const request$ = this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      map(response => this.mapper.toPointWallet(response)),
      tap(points => {
        this.lastKnownPoints = points;
      }),
      catchError(error => {
        console.error('Error fetching player points:', error);
        
        // Fallback to cached data if available
        if (this.lastKnownPoints) {
          console.warn('Using cached player points due to error');
          return of(this.lastKnownPoints);
        }
        
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.pointsCache, playerId, request$);
    return request$;
  }

  /**
   * Get season progress with caching
   * Data comes from player status endpoint
   */
  getSeasonProgress(playerId: string, seasonDates: { start: Date; end: Date }): Observable<SeasonProgress> {
    const cacheKey = `${playerId}_${seasonDates.start.getTime()}_${seasonDates.end.getTime()}`;
    const cached = this.getCachedData(this.progressCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use player status endpoint - progress data is in the same response
    const request$ = this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      map(response => this.mapper.toSeasonProgress(response, seasonDates)),
      tap(progress => {
        this.lastKnownProgress = progress;
      }),
      catchError(error => {
        console.error('Error fetching season progress:', error);
        
        // Fallback to cached data if available
        if (this.lastKnownProgress) {
          console.warn('Using cached season progress due to error');
          return of(this.lastKnownProgress);
        }
        
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.progressCache, cacheKey, request$);
    return request$;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.playerStatusCache.clear();
    this.pointsCache.clear();
    this.progressCache.clear();
  }

  /**
   * Clear cache for specific player
   */
  clearPlayerCache(playerId: string): void {
    this.playerStatusCache.delete(playerId);
    this.pointsCache.delete(playerId);
    
    // Clear progress cache entries for this player
    const progressKeys = Array.from(this.progressCache.keys()).filter(key => key.startsWith(playerId));
    progressKeys.forEach(key => this.progressCache.delete(key));
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
