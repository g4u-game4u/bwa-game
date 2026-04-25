import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap, timeout, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { PlayerMapper } from './player-mapper.service';
import { PlayerStatus, PointWallet, SeasonProgress } from '@model/gamification-dashboard.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { isGame4uDataEnabled } from '@model/game4u-api.model';
import { Game4uApiService } from './game4u-api.service';
import { mapGame4uStatsToPointWallet } from './game4u-game-mapper';
import { SessaoProvider } from '@providers/sessao/sessao.provider';

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
    private mapper: PlayerMapper,
    private http: HttpClient,
    private game4uApi: Game4uApiService,
    private sessao: SessaoProvider
  ) {}

  /** Mesma condição que `getPlayerPoints` quando usa `/game/stats` (evita sobrescrever com action_log legado). */
  usesGame4uWalletFromStats(): boolean {
    return isGame4uDataEnabled() && this.game4uApi.isConfigured();
  }

  private resolvePlayerEmail(playerId: string): string {
    const id = (playerId || '').trim();
    if (!id || id === 'me') {
      return (this.sessao.usuario?.email || '').trim();
    }
    return id;
  }

  /**
   * Perfil do jogador sem GET …/status:
   * - `me` (ou vazio): mesmo fluxo que {@link getCurrentPlayerData} (`/auth/user`).
   * - outro id: `GET /v3/player/{id}` (documentação Funifier: perfil sem sufixo `/status`).
   */
  getRawPlayerData(playerId: string, forceRefresh: boolean = false): Observable<any> {
    const pid = (playerId || '').trim();
    if (!pid || pid === 'me') {
      return this.getCurrentPlayerData(forceRefresh);
    }

    const cacheKey = `profile_${pid}`;
    const cached = this.cachedRawData.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      console.log('📊 Using cached Observable for profile:', pid);
      return cached.data$;
    }

    const pathId = encodeURIComponent(pid);
    const endpoint = `/v3/player/${pathId}`;
    console.log('📊 Fetching fresh player profile (no /status):', endpoint);

    const request$ = this.funifierApi.get<any>(endpoint).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap(response => {
        console.log('📊 Raw player profile received:', response);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION }),
      catchError(error => {
        console.error('📊 Error fetching player profile:', error);
        this.cachedRawData.delete(cacheKey);
        return throwError(() => error);
      })
    );

    this.cachedRawData.set(cacheKey, {
      data$: request$,
      timestamp: now
    });

    return request$;
  }

  /**
   * Get current player data using the faster player/me endpoint
   * Evita GET …/player/…/status; expõe extra/goals a partir do perfil em `/auth/user`.
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
    const request$ = this.http.get<any>(`${environment.backend_url_base}/auth/user`).pipe(
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
   * Get player points (Game4U: `/game/stats` com `start`/`end` alinhados ao mês do painel).
   * @param month Primeiro dia do mês visível no seletor (ou `undefined` = toda a temporada).
   */
  getPlayerPoints(playerId: string, month?: Date): Observable<PointWallet> {
    if (isGame4uDataEnabled() && this.game4uApi.isConfigured()) {
      const email = this.resolvePlayerEmail(playerId);
      if (!email) {
        return throwError(() => new Error('No user email for Game4U wallet'));
      }
      const range = this.game4uApi.toQueryRange(month);
      return this.game4uApi.getGameStats({ user: email, ...range }).pipe(
        map(stats => {
          const points = mapGame4uStatsToPointWallet(stats);
          console.log('📊 Mapped point wallet (Game4U):', points);
          return points;
        }),
        catchError(error => {
          console.error('Error mapping point wallet (Game4U):', error);
          return throwError(() => error);
        })
      );
    }

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
   * Shell de progresso da temporada (metas/clientes/tarefas vêm de outros serviços no painel).
   * Não dispara GET …/status nem perfil só para isto.
   */
  getSeasonProgress(_playerId: string, seasonDates: { start: Date; end: Date }): Observable<SeasonProgress> {
    const progress = this.mapper.toSeasonProgress({}, seasonDates);
    console.log('📊 Season progress shell (no status request):', progress);
    return of(progress);
  }

  /**
   * Fetch player company associations from player_company__c collection.
   * Aggregates by type (cnpj_resp, cnpj) and returns arrays of CNPJ/empid strings.
   * 
   * @param playerId - Player email/ID
   * @returns Observable of map: type → cnpj[] (e.g. { cnpj_resp: ["1586", "57.443.329/0001-44"], cnpj: ["1864"] })
   */
  private getPlayerCompanyData(playerId: string): Observable<Map<string, string[]>> {
    const cacheKey = `player_company_${playerId}`;
    const cached = this.cachedRawData.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data$;
    }

    const aggregateBody = [
      { $match: { playerId } },
      { $group: { _id: '$type', cnpjs: { $push: '$cnpj' } } }
    ];

    const request$: Observable<Map<string, string[]>> = this.funifierApi.post<any[]>(
      '/v3/database/player_company__c/aggregate?strict=true',
      aggregateBody
    ).pipe(
      timeout(this.REQUEST_TIMEOUT),
      map(response => {
        const result = new Map<string, string[]>();
        if (Array.isArray(response)) {
          response.forEach(item => {
            if (item._id && Array.isArray(item.cnpjs)) {
              result.set(item._id, item.cnpjs.filter((c: any) => typeof c === 'string' && c.trim().length > 0));
            }
          });
        }
        console.log('📊 Player company data from player_company__c:', Array.from(result.entries()));
        return result;
      }),
      catchError(error => {
        console.error('📊 Error fetching player_company__c:', error);
        return of(new Map<string, string[]>());
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.cachedRawData.set(cacheKey, { data$: request$, timestamp: now });
    return request$;
  }

  /**
   * Get player's cnpj list (participação) from player_company__c where type = "cnpj"
   */
  getPlayerCnpj(playerId: string): Observable<string[]> {
    return this.getPlayerCompanyData(playerId).pipe(
      map(data => data.get('cnpj') || []),
      tap(cnpjs => console.log('📊 Player cnpj (participação):', cnpjs))
    );
  }

  /**
   * Get player's cnpj_resp list (carteira) from player_company__c where type = "cnpj_resp"
   */
  getPlayerCnpjResp(playerId: string): Observable<string[]> {
    return this.getPlayerCompanyData(playerId).pipe(
      map(data => data.get('cnpj_resp') || []),
      tap(cnpjs => console.log('📊 Player cnpj_resp:', cnpjs))
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
    const pid = (playerId || '').trim();
    this.cachedRawData.delete('me');
    this.cachedRawData.delete(`profile_${pid}`);
    this.cachedRawData.delete(`status_${pid}`);
    this.cachedRawData.delete(pid);
  }
}
