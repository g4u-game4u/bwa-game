import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap, timeout, shareReplay } from 'rxjs/operators';
import { PlayerMapper } from './player-mapper.service';
import { PlayerStatus, PointWallet, SeasonProgress } from '@model/gamification-dashboard.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { joinApiPath } from '../../environments/backend-url';
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

  /** Evita 2× GET /auth/user quando vários consumidores chamam antes do cache ser escrito. */
  private inFlightCurrentPlayer$: Observable<any> | null = null;

  constructor(
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
    let out: string;
    if (!id || id === 'me') {
      out = (this.sessao.usuario?.email || '').trim();
    } else {
      out = id;
    }
    /** Game4U compara `user` ao email do token (sou frequentemente em minúsculas). */
    return out.includes('@') ? out.toLowerCase() : out;
  }

  /** `true` quando `playerId` é o utilizador autenticado (email, `_id` ou `me`). */
  private isCurrentSessionPlayerId(playerId: string): boolean {
    const pid = (playerId || '').trim();
    if (!pid || pid === 'me') {
      return true;
    }
    const u = this.sessao.usuario as { _id?: string; email?: string } | null | undefined;
    const id = (u?._id || '').trim();
    const email = (u?.email || '').trim();
    if (id && pid === id) {
      return true;
    }
    if (email && pid.toLowerCase() === email.toLowerCase()) {
      return true;
    }
    return false;
  }

  /**
   * Perfil bruto do jogador:
   * - utilizador da sessão (`me`, vazio, ou email/`_id` da sessão): {@link getCurrentPlayerData} (`GET /auth/user`), alinhado ao painel de gamificação e ao `KPIService`.
   * - outro id: `GET …/player/{id}` na API base (só se o backend expuser a rota; p.ex. visão de outro jogador).
   */
  getRawPlayerData(playerId: string, forceRefresh: boolean = false): Observable<any> {
    const pid = (playerId || '').trim();
    if (!pid || pid === 'me' || this.isCurrentSessionPlayerId(pid)) {
      return this.getCurrentPlayerData(forceRefresh);
    }

    const cacheKey = `profile_${pid}`;
    const cached = this.cachedRawData.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data$;
    }

    const pathId = encodeURIComponent(pid);
    const base = (environment.backend_url_base || '').trim().replace(/\/+$/, '');
    const url = joinApiPath(base, `player/${pathId}`);

    const request$ = this.http.get<any>(url).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap(response => {
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

    if (forceRefresh) {
      this.cachedRawData.delete(cacheKey);
      this.inFlightCurrentPlayer$ = null;
    }

    // Return cached Observable if valid and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data$;
    }

    if (!forceRefresh && this.inFlightCurrentPlayer$) {
      return this.inFlightCurrentPlayer$;
    }

    // Use player/me endpoint (faster than player/me/status)
    const request$ = this.http.get<any>(`${environment.backend_url_base}/auth/user`).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap({
        next: () => {
          this.inFlightCurrentPlayer$ = null;
        }
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION }),
      catchError(error => {
        console.error('❌ Error fetching player/me:', error);
        this.cachedRawData.delete(cacheKey);
        this.inFlightCurrentPlayer$ = null;
        return throwError(() => error);
      })
    );

    this.inFlightCurrentPlayer$ = request$;
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
        console.error('Error mapping player status:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get player points (Game4U: `/game/stats` com `start`/`end` alinhados ao mês do painel).
   * @param month Primeiro dia do mês visível no seletor (ou `undefined` = toda a temporada).
   */
  getPlayerPoints(
    playerId: string,
    month?: Date,
    teamId?: string | number | null
  ): Observable<PointWallet> {
    if (isGame4uDataEnabled() && this.game4uApi.isConfigured()) {
      const email = this.resolvePlayerEmail(playerId);
      if (!email) {
        return throwError(() => new Error('No user email for Game4U wallet'));
      }
      const range = this.game4uApi.toQueryRange(month);
      const tid =
        teamId == null
          ? undefined
          : String(teamId).trim() !== ''
            ? String(teamId).trim()
            : undefined;
      const q = tid ? { user: email, ...range, team_id: tid } : { user: email, ...range };
      return this.game4uApi.getGameStats(q).pipe(
        map(stats => {
          const points = mapGame4uStatsToPointWallet(stats);
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
    return of(progress);
  }

  /**
   * Associações jogador–empresa (`player_company__c`).
   * O aggregate via API legada está desativado no cliente; devolve mapa vazio até haver endpoint substituto.
   */
  private getPlayerCompanyData(_playerId: string): Observable<Map<string, string[]>> {
    return of(new Map<string, string[]>());
  }

  /**
   * Get player's cnpj list (participação) from player_company__c where type = "cnpj"
   */
  getPlayerCnpj(playerId: string): Observable<string[]> {
    return this.getPlayerCompanyData(playerId).pipe(
      map(data => data.get('cnpj') || []),
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
    this.inFlightCurrentPlayer$ = null;
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
