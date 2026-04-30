import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  Game4uDeliveryModel,
  Game4uUserActionModel,
  Game4uUserActionStatsResponse,
  Game4uUserActionStatus,
  Game4uDeliveryStatus,
  Game4uTeamScopedQuery,
  Game4uUserScopedQuery,
  Game4uReportsFinishedSummary,
  Game4uGoalMonthSummaryResponse,
  Game4uReportsFinishedQuery,
  Game4uReportsActionsByDeliveryQuery,
  Game4uReportsGoalMonthQuery
} from '@model/game4u-api.model';
import { Game4uSupabaseFallbackService } from './game4u-supabase-fallback.service';
import { SeasonDatesService } from './season-dates.service';

export type { Game4uDateRangeQuery, Game4uTeamScopedQuery, Game4uUserScopedQuery } from '@model/game4u-api.model';

@Injectable({
  providedIn: 'root'
})
export class Game4uApiService {
  private readonly baseUrl: string;
  private readonly statsDedupCache = new Map<string, Observable<Game4uUserActionStatsResponse>>();
  private readonly actionsDedupCache = new Map<string, Observable<Game4uUserActionModel[]>>();
  private readonly teamStatsDedupCache = new Map<string, Observable<Game4uUserActionStatsResponse>>();
  private readonly teamActionsDedupCache = new Map<string, Observable<Game4uUserActionModel[]>>();
  private readonly reportsFinishedSummaryCache = new Map<string, Observable<Game4uReportsFinishedSummary>>();
  private readonly reportsFinishedDeliveriesCache = new Map<string, Observable<string[]>>();
  private readonly reportsActionsByDeliveryCache = new Map<string, Observable<Game4uUserActionModel[]>>();
  private readonly reportsGoalMonthCache = new Map<string, Observable<Game4uGoalMonthSummaryResponse>>();

  constructor(
    private http: HttpClient,
    private supabaseFallback: Game4uSupabaseFallbackService,
    private seasonDates: SeasonDatesService
  ) {
    this.baseUrl = (environment.backend_url_base || '').trim().replace(/\/$/, '');
    void this.seasonDates.getSeasonDates().catch(() => undefined);
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  /**
   * Supabase só quando **não** há `backend_url_base` (API `/game/*` indisponível).
   * Com API configurada, nunca encaminhar falhas HTTP para o PostgREST — evita tráfego duplicado
   * e 406 acidentais quando o bundle tem `SUPABASE_URL` mas o fallback de jogo não é o desejado.
   */
  private useSupabaseStandalone(): boolean {
    return (
      !this.isConfigured() &&
      environment.useGame4uSupabaseFallback === true &&
      this.supabaseFallback.isAvailable()
    );
  }

  private shareGame4u<T>(source: Observable<T>): Observable<T> {
    return source.pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  /** Uma instância HTTP partilhada por `(user, start, end[, status])` — vários invocadores em paralelo → 1× rede. */
  private shareGame4uDedupe<T>(
    key: string,
    cache: Map<string, Observable<T>>,
    factory: () => Observable<T>
  ): Observable<T> {
    const existing = cache.get(key);
    if (existing) {
      return existing;
    }
    const shared = factory().pipe(
      tap({
        error: () => cache.delete(key)
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    cache.set(key, shared);
    return shared;
  }

  private statsRequestKey(q: Game4uUserScopedQuery): string {
    return `stats|${q.user}|${q.start}|${q.end}`;
  }

  private actionsRequestKey(q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }): string {
    return `actions|${q.user}|${q.start}|${q.end}|${q.status ?? ''}`;
  }

  private teamStatsRequestKey(q: Game4uTeamScopedQuery): string {
    return `team-stats|${q.team}|${q.start}|${q.end}`;
  }

  private teamActionsRequestKey(q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }): string {
    return `team-actions|${q.team}|${q.start}|${q.end}|${q.status ?? ''}`;
  }

  /** Limpa dedupe de stats/actions (user e team) — ex.: troca de mês / campanha. */
  clearStatsActionsDedupeCache(): void {
    this.statsDedupCache.clear();
    this.actionsDedupCache.clear();
    this.teamStatsDedupCache.clear();
    this.teamActionsDedupCache.clear();
    this.reportsFinishedSummaryCache.clear();
    this.reportsFinishedDeliveriesCache.clear();
    this.reportsActionsByDeliveryCache.clear();
    this.reportsGoalMonthCache.clear();
  }

  /** GET `/game/*` com partilha entre várias subscrições (evita N× a mesma chamada). */
  private httpOrSupabase<T>(http$: Observable<T>, _supabase$: Observable<T>, _label: string): Observable<T> {
    return this.shareGame4u(http$);
  }

  /** Intervalo ISO para o mês calendário ou temporada ampla quando `month` é undefined. */
  toQueryRange(month?: Date): { start: string; end: string } {
    const campaign = this.seasonDates.getCachedSeasonBounds();
    if (!month) {
      if (campaign) {
        return {
          start: campaign.start.toISOString(),
          end: campaign.end.toISOString()
        };
      }
      return {
        start: new Date('2000-01-01T00:00:00.000Z').toISOString(),
        end: new Date('2099-12-31T23:59:59.999Z').toISOString()
      };
    }
    const y = month.getFullYear();
    const m = month.getMonth();
    const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
    if (!campaign) {
      return { start: monthStart.toISOString(), end: monthEnd.toISOString() };
    }
    const startMs = Math.max(monthStart.getTime(), campaign.start.getTime());
    const endMs = Math.min(monthEnd.getTime(), campaign.end.getTime());
    const start = new Date(startMs);
    const end = new Date(endMs);
    if (start.getTime() > end.getTime()) {
      return { start: end.toISOString(), end: end.toISOString() };
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }

  /**
   * Intervalo «amplo» para `/game/actions` com competência em `delivery_id`: do **início da campanha**
   * até o **fim do mês do painel** (cortado pelo fim da campanha). Substitui 1/jan … fim do mês.
   */
  toCampaignStartThroughMonthEnd(month: Date): { start: string; end: string } {
    const campaign = this.seasonDates.getCachedSeasonBounds();
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
    if (!campaign) {
      const y = month.getFullYear();
      const jan1 = new Date(y, 0, 1, 0, 0, 0, 0);
      return this.toIsoRange(jan1, monthEnd);
    }
    const end = new Date(Math.min(monthEnd.getTime(), campaign.end.getTime()));
    return this.toIsoRange(campaign.start, end);
  }

  toIsoRange(start: Date, end: Date): { start: string; end: string } {
    return { start: start.toISOString(), end: end.toISOString() };
  }

  /**
   * Intervalo `dt_prazo_*` para `/game/reports/goal/month/summary` (fim = primeiro dia do mês seguinte, como no doc).
   */
  toDtPrazoMonthRange(month: Date): { start: string; end: string } {
    const y = month.getFullYear();
    const m = month.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const start = `${y}-${pad(m + 1)}-01`;
    const next = new Date(y, m + 1, 1);
    const end = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`;
    return { start, end };
  }

  private reportsFinishedSummaryKey(q: Game4uReportsFinishedQuery): string {
    const st = (q.status ?? []).join(',');
    return `rpt-sum|${q.email}|${q.finished_at_start}|${q.finished_at_end}|${st}`;
  }

  private reportsFinishedDeliveriesKey(q: Game4uReportsFinishedQuery): string {
    const st = (q.status ?? []).join(',');
    return `rpt-del|${q.email}|${q.finished_at_start}|${q.finished_at_end}|${st}`;
  }

  private reportsActionsByDeliveryKey(q: Game4uReportsActionsByDeliveryQuery): string {
    const st = (q.status ?? []).join(',');
    return `rpt-act|${q.email}|${q.finished_at_start}|${q.finished_at_end}|${q.delivery_title}|${q.offset ?? 0}|${q.limit ?? 500}|${st}`;
  }

  private reportsGoalMonthKey(q: Game4uReportsGoalMonthQuery): string {
    return `rpt-goal|${q.email}|${q.dt_prazo_start}|${q.dt_prazo_end}`;
  }

  private appendReportParams(
    base: HttpParams,
    q: Game4uReportsFinishedQuery
  ): HttpParams {
    let p = base
      .set('email', q.email)
      .set('finished_at_start', q.finished_at_start)
      .set('finished_at_end', q.finished_at_end);
    for (const s of q.status ?? []) {
      p = p.append('status', s);
    }
    return p;
  }

  /**
   * `GET /game/reports/finished/summary`
   */
  getGameReportsFinishedSummary(q: Game4uReportsFinishedQuery): Observable<Game4uReportsFinishedSummary> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/finished/summary: defina backend_url_base.')
      );
    }
    const key = this.reportsFinishedSummaryKey(q);
    return this.shareGame4uDedupe(key, this.reportsFinishedSummaryCache, () => {
      const params = this.appendReportParams(new HttpParams(), q);
      return this.http.get<Game4uReportsFinishedSummary>(`${this.baseUrl}/game/reports/finished/summary`, {
        headers: this.headers(),
        params
      });
    });
  }

  /**
   * `GET /game/reports/finished/deliveries` — lista ordenada de `delivery_title`.
   */
  getGameReportsFinishedDeliveries(q: Game4uReportsFinishedQuery): Observable<string[]> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/finished/deliveries: defina backend_url_base.')
      );
    }
    const key = this.reportsFinishedDeliveriesKey(q);
    return this.shareGame4uDedupe(key, this.reportsFinishedDeliveriesCache, () => {
      const params = this.appendReportParams(new HttpParams(), q);
      return this.http.get<string[]>(`${this.baseUrl}/game/reports/finished/deliveries`, {
        headers: this.headers(),
        params
      });
    });
  }

  /**
   * `GET /game/reports/finished/actions-by-delivery` (paginado).
   */
  getGameReportsFinishedActionsByDelivery(
    q: Game4uReportsActionsByDeliveryQuery
  ): Observable<Game4uUserActionModel[]> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/finished/actions-by-delivery: defina backend_url_base.')
      );
    }
    const key = this.reportsActionsByDeliveryKey(q);
    return this.shareGame4uDedupe(key, this.reportsActionsByDeliveryCache, () => {
      let params = this.appendReportParams(new HttpParams(), q).set('delivery_title', q.delivery_title);
      const off = q.offset ?? 0;
      const lim = Math.min(q.limit ?? 500, 500);
      params = params.set('offset', String(off)).set('limit', String(lim));
      return this.http.get<Game4uUserActionModel[]>(
        `${this.baseUrl}/game/reports/finished/actions-by-delivery`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/goal/month/summary`
   */
  getGameReportsGoalMonthSummary(q: Game4uReportsGoalMonthQuery): Observable<Game4uGoalMonthSummaryResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/goal/month/summary: defina backend_url_base.')
      );
    }
    const key = this.reportsGoalMonthKey(q);
    return this.shareGame4uDedupe(key, this.reportsGoalMonthCache, () => {
      const params = new HttpParams()
        .set('email', q.email)
        .set('dt_prazo_start', q.dt_prazo_start)
        .set('dt_prazo_end', q.dt_prazo_end);
      return this.http.get<Game4uGoalMonthSummaryResponse>(
        `${this.baseUrl}/game/reports/goal/month/summary`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  private headers(): HttpHeaders {
    const cid = (environment.client_id || '').trim();
    return cid ? new HttpHeaders({ client_id: cid }) : new HttpHeaders();
  }

  getHealth(): Observable<unknown> {
    let origin: string;
    try {
      origin = new URL(this.baseUrl).origin;
    } catch {
      origin = this.baseUrl;
    }
    return this.http.get(`${origin}/`, { headers: this.headers() });
  }

  getGameStats(q: Game4uUserScopedQuery): Observable<Game4uUserActionStatsResponse> {
    const key = this.statsRequestKey(q);
    if (!this.isConfigured()) {
      if (this.useSupabaseStandalone()) {
        return this.shareGame4uDedupe(key, this.statsDedupCache, () => this.supabaseFallback.getGameStats(q));
      }
      return throwError(
        () => new Error('[Game4U] stats: defina backend_url_base (ou GAME4U_SUPABASE_FALLBACK=true + Supabase).')
      );
    }
    return this.shareGame4uDedupe(key, this.statsDedupCache, () => {
      const params = new HttpParams()
        .set('start', q.start)
        .set('end', q.end)
        .set('user', q.user);
      return this.http.get<Game4uUserActionStatsResponse>(`${this.baseUrl}/game/stats`, {
        headers: this.headers(),
        params
      });
    });
  }

  getGameActions(
    q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    const key = this.actionsRequestKey(q);
    if (!this.isConfigured()) {
      if (this.useSupabaseStandalone()) {
        return this.shareGame4uDedupe(key, this.actionsDedupCache, () => this.supabaseFallback.getGameActions(q));
      }
      return throwError(
        () => new Error('[Game4U] actions: defina backend_url_base (ou GAME4U_SUPABASE_FALLBACK=true + Supabase).')
      );
    }
    return this.shareGame4uDedupe(key, this.actionsDedupCache, () => {
      let params = new HttpParams().set('start', q.start).set('end', q.end).set('user', q.user);
      if (q.status) {
        params = params.set('status', q.status);
      }
      return this.http.get<Game4uUserActionModel[]>(`${this.baseUrl}/game/actions`, {
        headers: this.headers(),
        params
      });
    });
  }

  getGameDeliveries(
    q: Game4uUserScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    if (!this.isConfigured()) {
      if (this.useSupabaseStandalone()) {
        return this.shareGame4u(this.supabaseFallback.getGameDeliveries(q));
      }
      return throwError(
        () => new Error('[Game4U] deliveries: defina backend_url_base (ou GAME4U_SUPABASE_FALLBACK=true + Supabase).')
      );
    }
    const params = new HttpParams()
      .set('start', q.start.slice(0, 10))
      .set('end', q.end.slice(0, 10))
      .set('user', q.user)
      .set('status', q.status);
    const http$ = this.http.get<Game4uDeliveryModel[]>(`${this.baseUrl}/game/deliveries`, {
      headers: this.headers(),
      params
    });
    return this.httpOrSupabase(http$, this.supabaseFallback.getGameDeliveries(q), 'deliveries');
  }

  getGameTeamStats(q: Game4uTeamScopedQuery): Observable<Game4uUserActionStatsResponse> {
    const key = this.teamStatsRequestKey(q);
    if (!this.isConfigured()) {
      if (this.useSupabaseStandalone()) {
        return this.shareGame4uDedupe(key, this.teamStatsDedupCache, () =>
          this.supabaseFallback.getGameTeamStats(q)
        );
      }
      return throwError(
        () => new Error('[Game4U] team-stats: defina backend_url_base (ou GAME4U_SUPABASE_FALLBACK=true + Supabase).')
      );
    }
    return this.shareGame4uDedupe(key, this.teamStatsDedupCache, () => {
      const params = new HttpParams().set('start', q.start).set('end', q.end).set('team', q.team);
      return this.http.get<Game4uUserActionStatsResponse>(`${this.baseUrl}/game/team-stats`, {
        headers: this.headers(),
        params
      });
    });
  }

  getGameTeamActions(
    q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    const key = this.teamActionsRequestKey(q);
    if (!this.isConfigured()) {
      if (this.useSupabaseStandalone()) {
        return this.shareGame4uDedupe(key, this.teamActionsDedupCache, () =>
          this.supabaseFallback.getGameTeamActions(q)
        );
      }
      return throwError(
        () => new Error('[Game4U] team-actions: defina backend_url_base (ou GAME4U_SUPABASE_FALLBACK=true + Supabase).')
      );
    }
    return this.shareGame4uDedupe(key, this.teamActionsDedupCache, () => {
      let params = new HttpParams().set('start', q.start).set('end', q.end);
      params = params.set('team', q.team);
      if (q.status) {
        params = params.set('status', q.status);
      }
      return this.http.get<Game4uUserActionModel[]>(`${this.baseUrl}/game/team-actions`, {
        headers: this.headers(),
        params
      });
    });
  }

  getGameTeamDeliveries(
    q: Game4uTeamScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    if (!this.isConfigured()) {
      if (this.useSupabaseStandalone()) {
        return this.shareGame4u(this.supabaseFallback.getGameTeamDeliveries(q));
      }
      return throwError(
        () =>
          new Error('[Game4U] team-deliveries: defina backend_url_base (ou GAME4U_SUPABASE_FALLBACK=true + Supabase).')
      );
    }
    const params = new HttpParams()
      .set('start', q.start.slice(0, 10))
      .set('end', q.end.slice(0, 10))
      .set('status', q.status)
      .set('team', q.team);
    const http$ = this.http.get<Game4uDeliveryModel[]>(`${this.baseUrl}/game/team-deliveries`, {
      headers: this.headers(),
      params
    });
    return this.httpOrSupabase(
      http$,
      this.supabaseFallback.getGameTeamDeliveries(q),
      'team-deliveries'
    );
  }
}
