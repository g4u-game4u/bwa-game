import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
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
  Game4uReportsOpenSummary,
  Game4uReportsOpenSummaryQuery,
  Game4uGoalMonthSummaryResponse,
  Game4uReportsFinishedQuery,
  Game4uReportsActionsByDeliveryQuery,
  Game4uReportsActionsByDeliveryPage,
  Game4uReportsGoalMonthQuery,
  normalizeGameReportsActionsByDeliveryResponse,
  Game4uReportsFinishedDeliveryRow,
  normalizeGameReportsFinishedDeliveriesPayload,
  Game4uReportsUserActionsQuery,
  Game4uReportsUserActionsPage,
  normalizeGameReportsUserActionsResponse
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
  private readonly reportsFinishedDeliveriesCache = new Map<
    string,
    Observable<Game4uReportsFinishedDeliveryRow[]>
  >();
  private readonly reportsActionsByDeliveryCache = new Map<
    string,
    Observable<Game4uReportsActionsByDeliveryPage>
  >();
  private readonly reportsGoalMonthCache = new Map<string, Observable<Game4uGoalMonthSummaryResponse>>();
  private readonly reportsOpenSummaryCache = new Map<string, Observable<Game4uReportsOpenSummary>>();

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

  private withOptionalTeamId(params: HttpParams, teamId?: string): HttpParams {
    const t = (teamId ?? '').trim();
    return t ? params.set('team_id', t) : params;
  }

  /** Com `team_id`, o backend escopa por equipa (utilizador via JWT) — não enviar `email`/`user` na query. */
  private teamScopedOmitUserEmail(teamId?: string): boolean {
    return (teamId ?? '').trim() !== '';
  }

  private reportIdentitySegment(q: { email: string; team_id?: string }): string {
    const tid = (q.team_id ?? '').trim();
    return tid ? `team:${tid}` : `email:${q.email}`;
  }

  private userScopedCacheSegment(q: Game4uUserScopedQuery): string {
    const tid = (q.team_id ?? '').trim();
    return tid ? `team:${tid}` : `user:${q.user}`;
  }

  private statsRequestKey(q: Game4uUserScopedQuery): string {
    return `stats|${this.userScopedCacheSegment(q)}|${q.start}|${q.end}|${q.team_id ?? ''}`;
  }

  private actionsRequestKey(q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }): string {
    return `actions|${this.userScopedCacheSegment(q)}|${q.start}|${q.end}|${q.status ?? ''}|${q.team_id ?? ''}`;
  }

  private teamStatsRequestKey(q: Game4uTeamScopedQuery): string {
    return `team-stats|${q.team}|${q.start}|${q.end}|${q.team_id ?? ''}`;
  }

  private teamActionsRequestKey(q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }): string {
    return `team-actions|${q.team}|${q.start}|${q.end}|${q.status ?? ''}|${q.team_id ?? ''}`;
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
    this.reportsOpenSummaryCache.clear();
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
    return `rpt-sum|${this.reportIdentitySegment(q)}|${q.finished_at_start}|${q.finished_at_end}|${st}|${q.team_id ?? ''}`;
  }

  private reportsFinishedDeliveriesKey(q: Game4uReportsFinishedQuery): string {
    const st = (q.status ?? []).join(',');
    return `rpt-del|${this.reportIdentitySegment(q)}|${q.finished_at_start}|${q.finished_at_end}|${st}|${q.team_id ?? ''}`;
  }

  private reportsActionsByDeliveryKey(q: Game4uReportsActionsByDeliveryQuery): string {
    const st = (q.status ?? []).join(',');
    return `rpt-act|${this.reportIdentitySegment(q)}|${q.finished_at_start}|${q.finished_at_end}|${q.delivery_title}|${q.offset ?? 0}|${q.limit ?? 500}|${st}|${q.team_id ?? ''}`;
  }

  private reportsGoalMonthKey(q: Game4uReportsGoalMonthQuery): string {
    return `rpt-goal|${this.reportIdentitySegment(q)}|${q.dt_prazo_start}|${q.dt_prazo_end}|${q.team_id ?? ''}`;
  }

  private reportsOpenSummaryKey(q: Game4uReportsOpenSummaryQuery): string {
    return `rpt-open-sum|${this.reportIdentitySegment(q)}|${q.dt_prazo_start}|${q.dt_prazo_end}|${q.team_id ?? ''}`;
  }

  private appendOpenSummaryParams(base: HttpParams, q: Game4uReportsOpenSummaryQuery): HttpParams {
    let p = base.set('dt_prazo_start', q.dt_prazo_start).set('dt_prazo_end', q.dt_prazo_end);
    if (!this.teamScopedOmitUserEmail(q.team_id)) {
      p = p.set('email', q.email);
    }
    return this.withOptionalTeamId(p, q.team_id);
  }

  private appendReportParams(
    base: HttpParams,
    q: Game4uReportsFinishedQuery
  ): HttpParams {
    let p = base
      .set('finished_at_start', q.finished_at_start)
      .set('finished_at_end', q.finished_at_end);
    if (!this.teamScopedOmitUserEmail(q.team_id)) {
      p = p.set('email', q.email);
    }
    for (const s of q.status ?? []) {
      p = p.append('status', s);
    }
    return this.withOptionalTeamId(p, q.team_id);
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
   * `GET /game/reports/open/summary` — agregados de tarefas PENDING/DOING (`tasks_count`, `points_sum`, `delivery_count`).
   */
  getGameReportsOpenSummary(q: Game4uReportsOpenSummaryQuery): Observable<Game4uReportsOpenSummary> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/open/summary: defina backend_url_base.')
      );
    }
    const key = this.reportsOpenSummaryKey(q);
    return this.shareGame4uDedupe(key, this.reportsOpenSummaryCache, () => {
      const params = this.appendOpenSummaryParams(new HttpParams(), q);
      return this.http.get<Game4uReportsOpenSummary>(`${this.baseUrl}/game/reports/open/summary`, {
        headers: this.headers(),
        params
      });
    });
  }

  /**
   * `GET /game/reports/finished/deliveries` — linhas com `delivery_title` e, quando existir, `delivery_id` (`EmpID-YYYY-MM-DD`).
   */
  getGameReportsFinishedDeliveries(q: Game4uReportsFinishedQuery): Observable<Game4uReportsFinishedDeliveryRow[]> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/finished/deliveries: defina backend_url_base.')
      );
    }
    const key = this.reportsFinishedDeliveriesKey(q);
    return this.shareGame4uDedupe(key, this.reportsFinishedDeliveriesCache, () => {
      const params = this.appendReportParams(new HttpParams(), q);
      return this.http
        .get<unknown>(`${this.baseUrl}/game/reports/finished/deliveries`, {
          headers: this.headers(),
          params
        })
        .pipe(map(body => normalizeGameReportsFinishedDeliveriesPayload(body)));
    });
  }

  /**
   * `GET /game/reports/finished/actions-by-delivery` (paginado).
   */
  getGameReportsFinishedActionsByDelivery(
    q: Game4uReportsActionsByDeliveryQuery
  ): Observable<Game4uReportsActionsByDeliveryPage> {
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
      return this.http
        .get<unknown>(`${this.baseUrl}/game/reports/finished/actions-by-delivery`, {
          headers: this.headers(),
          params
        })
        .pipe(map(body => normalizeGameReportsActionsByDeliveryResponse(body)));
    });
  }

  /**
   * `GET /game/reports/user-actions` (paginado, `offset`/`limit` máx. 500).
   * Pares opcionais (um por pedido): `finished_at_*`, `dt_prazo_*`, `created_at_*` — par incompleto ou mais de um par → erro.
   */
  getGameReportsUserActions(q: Game4uReportsUserActionsQuery): Observable<Game4uReportsUserActionsPage> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/user-actions: defina backend_url_base.')
      );
    }
    let params = new HttpParams();
    if (!this.teamScopedOmitUserEmail(q.team_id)) {
      params = params.set('email', q.email);
    }
    for (const s of q.status ?? []) {
      params = params.append('status', s);
    }
    const fs = (q.finished_at_start ?? '').trim();
    const fe = (q.finished_at_end ?? '').trim();
    const ds = (q.dt_prazo_start ?? '').trim();
    const de = (q.dt_prazo_end ?? '').trim();
    const cs = (q.created_at_start ?? '').trim();
    const ce = (q.created_at_end ?? '').trim();

    if ((fs && !fe) || (!fs && fe)) {
      return throwError(
        () => new Error('[Game4U] reports/user-actions: informe finished_at_start e finished_at_end juntos.')
      );
    }
    if ((ds && !de) || (!ds && de)) {
      return throwError(
        () => new Error('[Game4U] reports/user-actions: informe dt_prazo_start e dt_prazo_end juntos.')
      );
    }
    if ((cs && !ce) || (!cs && ce)) {
      return throwError(
        () => new Error('[Game4U] reports/user-actions: informe created_at_start e created_at_end juntos.')
      );
    }

    const finOk = !!(fs && fe);
    const dtOk = !!(ds && de);
    const crOk = !!(cs && ce);
    const pairCount = (finOk ? 1 : 0) + (dtOk ? 1 : 0) + (crOk ? 1 : 0);
    if (pairCount > 1) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/user-actions: use apenas um intervalo (finished_at_*, dt_prazo_* ou created_at_*).'
          )
      );
    }

    if (finOk) {
      params = params.set('finished_at_start', fs).set('finished_at_end', fe);
    } else if (dtOk) {
      params = params.set('dt_prazo_start', ds).set('dt_prazo_end', de);
    } else if (crOk) {
      params = params.set('created_at_start', cs).set('created_at_end', ce);
    }

    const off = q.offset ?? 0;
    const lim = Math.min(q.limit ?? 500, 500);
    params = params.set('offset', String(off)).set('limit', String(lim));
    params = this.withOptionalTeamId(params, q.team_id);
    return this.http
      .get<unknown>(`${this.baseUrl}/game/reports/user-actions`, {
        headers: this.headers(),
        params
      })
      .pipe(map(body => normalizeGameReportsUserActionsResponse(body)));
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
      let inner = new HttpParams()
        .set('dt_prazo_start', q.dt_prazo_start)
        .set('dt_prazo_end', q.dt_prazo_end);
      if (!this.teamScopedOmitUserEmail(q.team_id)) {
        inner = inner.set('email', q.email);
      }
      const params = this.withOptionalTeamId(inner, q.team_id);
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
      let params = new HttpParams().set('start', q.start).set('end', q.end);
      if (!this.teamScopedOmitUserEmail(q.team_id)) {
        params = params.set('user', q.user);
      }
      params = this.withOptionalTeamId(params, q.team_id);
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
      let params = new HttpParams().set('start', q.start).set('end', q.end);
      if (!this.teamScopedOmitUserEmail(q.team_id)) {
        params = params.set('user', q.user);
      }
      if (q.status) {
        params = params.set('status', q.status);
      }
      params = this.withOptionalTeamId(params, q.team_id);
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
    let delParams = new HttpParams()
      .set('start', q.start.slice(0, 10))
      .set('end', q.end.slice(0, 10))
      .set('status', q.status);
    if (!this.teamScopedOmitUserEmail(q.team_id)) {
      delParams = delParams.set('user', q.user);
    }
    const params = this.withOptionalTeamId(delParams, q.team_id);
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
      const params = this.withOptionalTeamId(
        new HttpParams().set('start', q.start).set('end', q.end).set('team', q.team),
        q.team_id
      );
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
      params = this.withOptionalTeamId(params, q.team_id);
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
    const params = this.withOptionalTeamId(
      new HttpParams()
        .set('start', q.start.slice(0, 10))
        .set('end', q.end.slice(0, 10))
        .set('status', q.status)
        .set('team', q.team),
      q.team_id
    );
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
