import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
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
  Game4uReportsDashboardCachedQuery,
  PlayerDashboardCachedResponse,
  SupervisionTeamDashboardCached,
  SupervisionDashboardCachedListResponse,
  ManagementDashboardOverviewResponse,
  ManagementDashboardCachedListResponse,
  Game4uReportsManagementCachedQuery,
  Game4uReportsManagementCachedListQuery,
  Game4uReportsSupervisionCachedQuery,
  Game4uReportsSupervisionCachedListQuery,
  Game4uReportsFinishedDeliveriesCachedQuery,
  Game4uReportsFinishedDeliveriesCachedPage,
  Game4uReportsManagementFinishedDeliveriesCachedQuery,
  normalizeGameReportsFinishedDeliveriesCachedPagePayload,
  Game4uReportsFinishedQuery,
  Game4uReportsActionsByDeliveryQuery,
  Game4uReportsActionsByDeliveryPage,
  Game4uReportsGoalMonthQuery,
  normalizeGameReportsActionsByDeliveryResponse,
  Game4uReportsFinishedDeliveryRow,
  normalizeGameReportsFinishedDeliveriesPayload,
  Game4uReportsFinishedDeliveriesPage,
  normalizeGameReportsFinishedDeliveriesPagePayload,
  Game4uReportsUserActionsQuery,
  Game4uReportsUserActionsPage,
  normalizeGameReportsUserActionsResponse,
  Game4uReportsTeamDailyFinishedStatsQuery,
  Game4uReportsTeamDailyPendingStatsQuery,
  Game4uReportsOrganizationHierarchyQuery,
  OrganizationHierarchyReportResponse,
  Game4uReportsOrganizationHierarchyKpiDetailQuery,
  OrganizationHierarchyKpiDetailResponse,
  Game4uReportsOrganizationHierarchyMultaRiskQuery,
  OrganizationHierarchyMultaRiskResponse,
  Game4uReportsOrganizationHierarchyDeliveriesQuery,
  Game4uReportsOrganizationHierarchyClientsServedExportQuery,
  Game4uReportsOrganizationHierarchyCriticalClientsDeliveriesExportQuery,
  OrganizationHierarchyDeliveriesResponse,
  Game4uReportsOrganizationHierarchyInsightsQuery,
  Game4uReportsOrganizationHierarchyInsightsBody,
  OrganizationHierarchyInsightsResponse
} from '@model/game4u-api.model';
import { Game4uSupabaseFallbackService } from './game4u-supabase-fallback.service';
import {
  buildOrgHierarchyInsightsCacheKey,
  buildOrgHierarchyInsightsHttpParams,
  defaultOrgHierarchyInsightsBody
} from './org-hierarchy-insights-params';
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
  private readonly reportsDashboardCachedCache = new Map<string, Observable<PlayerDashboardCachedResponse>>();
  private readonly reportsFinishedDeliveriesCachedCache = new Map<
    string,
    Observable<Game4uReportsFinishedDeliveriesCachedPage>
  >();
  private readonly reportsManagementFinishedDeliveriesCachedCache = new Map<
    string,
    Observable<Game4uReportsFinishedDeliveriesCachedPage>
  >();
  private readonly reportsSupervisionDashboardCachedCache = new Map<
    string,
    Observable<SupervisionTeamDashboardCached>
  >();
  private readonly reportsSupervisionDashboardListCache = new Map<
    string,
    Observable<SupervisionDashboardCachedListResponse>
  >();
  private readonly reportsManagementDashboardOverviewCache = new Map<
    string,
    Observable<ManagementDashboardOverviewResponse>
  >();
  private readonly reportsManagementDashboardListCache = new Map<
    string,
    Observable<ManagementDashboardCachedListResponse>
  >();
  private readonly reportsOpenSummaryCache = new Map<string, Observable<Game4uReportsOpenSummary>>();
  private readonly reportsTeamDailyFinishedStatsCache = new Map<string, Observable<unknown>>();
  private readonly reportsTeamDailyPendingStatsCache = new Map<string, Observable<unknown>>();
  private readonly reportsOrganizationHierarchyCache = new Map<
    string,
    Observable<OrganizationHierarchyReportResponse>
  >();
  private readonly reportsOrganizationHierarchyKpiDetailCache = new Map<
    string,
    Observable<OrganizationHierarchyKpiDetailResponse>
  >();
  private readonly reportsOrganizationHierarchyMultaRiskCache = new Map<
    string,
    Observable<OrganizationHierarchyMultaRiskResponse>
  >();
  private readonly reportsOrganizationHierarchyDeliveriesCache = new Map<
    string,
    Observable<OrganizationHierarchyDeliveriesResponse>
  >();
  private readonly reportsOrganizationHierarchyInsightsCache = new Map<
    string,
    Observable<OrganizationHierarchyInsightsResponse>
  >();

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

  /**
   * Em `/game/stats`, `/game/actions` e `/game/deliveries`, a API não aceita `team_id` na query
   * quando `user` está definido (validação: "property team_id should not exist").
   */
  private withOptionalTeamIdUserScoped(
    params: HttpParams,
    teamId: string | undefined,
    user: string | undefined
  ): HttpParams {
    if (this.shouldIncludeUserQueryParam(user)) {
      return params;
    }
    return this.withOptionalTeamId(params, teamId);
  }

  /** Envia `user` quando há alvo explícito. */
  private shouldIncludeUserQueryParam(user?: string): boolean {
    return (user ?? '').trim() !== '';
  }

  /** Envia `email` nos relatórios quando definido (idem com `team_id` + gestor). */
  private shouldIncludeEmailQueryParam(email?: string): boolean {
    return (email ?? '').trim() !== '';
  }

  /** Chave de cache: equipe + opcionalmente e-mail (colaborador dentro da equipe). */
  private reportIdentitySegment(q: { email?: string; team_id?: string }): string {
    const tid = (q.team_id ?? '').trim();
    const em = (q.email ?? '').trim();
    if (tid && em) {
      return `team:${tid}|email:${em}`;
    }
    if (tid) {
      return `team:${tid}`;
    }
    return em ? `email:${em}` : 'none';
  }

  /** Relatórios exigem `email` (colaborador) ou `team_id` (consolidado da equipe). */
  private hasReportsIdentity(q: { email?: string; team_id?: string }): boolean {
    return this.shouldIncludeEmailQueryParam(q.email) || (q.team_id ?? '').trim() !== '';
  }

  private userScopedCacheSegment(q: Game4uUserScopedQuery): string {
    const u = (q.user ?? '').trim();
    if (u) {
      return `user:${u}`;
    }
    const tid = (q.team_id ?? '').trim();
    return tid ? `team:${tid}` : 'none';
  }

  private statsRequestKey(q: Game4uUserScopedQuery): string {
    return `stats|${this.userScopedCacheSegment(q)}|${q.start}|${q.end}`;
  }

  private actionsRequestKey(q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }): string {
    return `actions|${this.userScopedCacheSegment(q)}|${q.start}|${q.end}|${q.status ?? ''}`;
  }

  private teamStatsRequestKey(q: Game4uTeamScopedQuery): string {
    return `team-stats|${q.team}|${q.start}|${q.end}`;
  }

  private teamActionsRequestKey(q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }): string {
    const u = (q.user ?? '').trim();
    return `team-actions|${q.team}|${q.start}|${q.end}|${q.status ?? ''}|${u}`;
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
    this.reportsDashboardCachedCache.clear();
    this.reportsFinishedDeliveriesCachedCache.clear();
    this.reportsManagementFinishedDeliveriesCachedCache.clear();
    this.reportsSupervisionDashboardCachedCache.clear();
    this.reportsSupervisionDashboardListCache.clear();
    this.reportsManagementDashboardOverviewCache.clear();
    this.reportsManagementDashboardListCache.clear();
    this.reportsOpenSummaryCache.clear();
    this.reportsTeamDailyFinishedStatsCache.clear();
    this.reportsTeamDailyPendingStatsCache.clear();
    this.reportsOrganizationHierarchyCache.clear();
    this.reportsOrganizationHierarchyKpiDetailCache.clear();
    this.reportsOrganizationHierarchyMultaRiskCache.clear();
    this.reportsOrganizationHierarchyDeliveriesCache.clear();
    this.reportsOrganizationHierarchyInsightsCache.clear();
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

  /**
   * Intervalo `dt_prazo_*` para `GET /game/reports/user-actions` (fim = último dia do mês vigente).
   */
  toDtPrazoMonthRangeForUserActions(month: Date): { start: string; end: string } {
    const y = month.getFullYear();
    const m = month.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const start = `${y}-${pad(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
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
    return `rpt-act|${this.reportIdentitySegment(q)}|${q.finished_at_start}|${q.finished_at_end}|${q.delivery_title}|${st}|${q.team_id ?? ''}`;
  }

  private reportsGoalMonthKey(q: Game4uReportsGoalMonthQuery): string {
    return `rpt-goal|${this.reportIdentitySegment(q)}|${q.dt_prazo_start}|${q.dt_prazo_end}|${q.team_id ?? ''}`;
  }

  private reportsOpenSummaryKey(q: Game4uReportsOpenSummaryQuery): string {
    return `rpt-open-sum|${this.reportIdentitySegment(q)}|${q.dt_prazo_start}|${q.dt_prazo_end}|${q.team_id ?? ''}`;
  }

  private reportsTeamDailyFinishedStatsKey(q: Game4uReportsTeamDailyFinishedStatsQuery): string {
    return `rpt-team-daily|${this.reportIdentitySegment(q)}|${q.start}|${q.end}|${q.team_id ?? ''}`;
  }

  private reportsTeamDailyPendingStatsKey(q: Game4uReportsTeamDailyPendingStatsQuery): string {
    const st = (q.status ?? []).join(',');
    return `rpt-team-daily-pending|${this.reportIdentitySegment(q)}|${q.start}|${q.end}|${q.team_id ?? ''}|${st}`;
  }

  private appendTeamDailyPendingStatsParams(
    base: HttpParams,
    q: Game4uReportsTeamDailyPendingStatsQuery
  ): HttpParams {
    let p = base.set('start', q.start).set('end', q.end);
    if (this.shouldIncludeEmailQueryParam(q.email)) {
      p = p.set('email', (q.email ?? '').trim());
    }
    for (const s of q.status ?? []) {
      p = p.append('status', s);
    }
    return this.withOptionalTeamId(p, q.team_id);
  }

  private appendTeamDailyFinishedStatsParams(
    base: HttpParams,
    q: Game4uReportsTeamDailyFinishedStatsQuery
  ): HttpParams {
    let p = base.set('start', q.start).set('end', q.end);
    if (this.shouldIncludeEmailQueryParam(q.email)) {
      p = p.set('email', (q.email ?? '').trim());
    }
    for (const s of q.status ?? []) {
      p = p.append('status', s);
    }
    const off = q.offset;
    const lim = q.limit;
    if (off != null && Number.isFinite(off)) {
      p = p.set('offset', String(Math.max(0, Math.floor(off))));
    }
    if (lim != null && Number.isFinite(lim)) {
      p = p.set('limit', String(Math.min(Math.max(1, Math.floor(lim)), 500)));
    }
    return this.withOptionalTeamId(p, q.team_id);
  }

  private appendOpenSummaryParams(base: HttpParams, q: Game4uReportsOpenSummaryQuery): HttpParams {
    let p = base.set('dt_prazo_start', q.dt_prazo_start).set('dt_prazo_end', q.dt_prazo_end);
    if (this.shouldIncludeEmailQueryParam(q.email)) {
      p = p.set('email', (q.email ?? '').trim());
    }
    return this.withOptionalTeamId(p, q.team_id);
  }

  /** Endpoints «finished» (deliveries, actions-by-delivery) exigem o par de datas no Nest. */
  private assertFinishedAtRange(q: Game4uReportsFinishedQuery, endpoint: string): void {
    const fs = (q.finished_at_start ?? '').trim();
    const fe = (q.finished_at_end ?? '').trim();
    if (!fs || !fe) {
      throw new Error(
        `[Game4U] ${endpoint}: informe finished_at_start e finished_at_end (ISO 8601).`
      );
    }
  }

  private appendReportParams(
    base: HttpParams,
    q: Game4uReportsFinishedQuery
  ): HttpParams {
    let p = base;
    const fs = (q.finished_at_start ?? '').trim();
    const fe = (q.finished_at_end ?? '').trim();
    if (fs && fe) {
      p = p.set('finished_at_start', fs).set('finished_at_end', fe);
    }
    if (this.shouldIncludeEmailQueryParam(q.email)) {
      p = p.set('email', (q.email ?? '').trim());
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
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/finished/summary: informe email ou team_id.')
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
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/open/summary: informe email ou team_id.')
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

  private reportsFinishedDeliveriesCachedKey(q: Game4uReportsFinishedDeliveriesCachedQuery): string {
    const email = (q.email ?? '').trim();
    const teamId = (q.team_id ?? '').trim();
    return `rpt-del-cached|${email}|${teamId}|${(q.month ?? '').trim()}|${q.offset ?? 0}|${q.limit ?? 30}`;
  }

  /**
   * `GET /game/reports/finished/deliveries/cached` — lista paginada + `on_time_pct` por linha (mês).
   * Escopo: `email` (jogador) ou `team_id` (equipe).
   */
  getGameReportsFinishedDeliveriesCached(
    q: Game4uReportsFinishedDeliveriesCachedQuery
  ): Observable<Game4uReportsFinishedDeliveriesCachedPage> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/finished/deliveries/cached: defina backend_url_base.')
      );
    }
    const email = (q.email ?? '').trim();
    const teamId = (q.team_id ?? '').trim();
    const month = (q.month ?? '').trim();
    if (!email && !teamId) {
      return throwError(
        () => new Error('[Game4U] reports/finished/deliveries/cached: informe email ou team_id.')
      );
    }
    if (!month) {
      return throwError(() => new Error('[Game4U] reports/finished/deliveries/cached: informe month (YYYY-MM).'));
    }
    const off = Math.max(0, Math.floor(q.offset ?? 0));
    const lim = Math.min(Math.max(Math.floor(q.limit ?? 30), 1), 500);
    const key = this.reportsFinishedDeliveriesCachedKey({
      ...q,
      email: email || undefined,
      team_id: teamId || undefined,
      month,
      offset: off,
      limit: lim
    });
    return this.shareGame4uDedupe(key, this.reportsFinishedDeliveriesCachedCache, () => {
      let params = new HttpParams().set('month', month).set('offset', String(off)).set('limit', String(lim));
      if (email) {
        params = params.set('email', email);
      }
      if (teamId) {
        params = params.set('team_id', teamId);
      }
      return this.http
        .get<unknown>(`${this.baseUrl}/game/reports/finished/deliveries/cached`, {
          headers: this.headers(),
          params
        })
        .pipe(
          map(body => normalizeGameReportsFinishedDeliveriesCachedPagePayload(body, off, lim)),
          catchError(err => {
            if (err instanceof HttpErrorResponse && err.status === 404) {
              return of({ offset: off, limit: lim, items: [] });
            }
            return throwError(() => err);
          })
        );
    });
  }

  /**
   * `GET /game/reports/management/finished/deliveries/cached` — lista paginada (mês) agregada para
   * GERENTE / DIRETOR / C_LEVEL. Sem `email`/`team_id`: escopo do gestor vem do JWT
   * (`user_role_team_month`); `user_id` é apenas para ADMIN/SERVICE consultar outro gestor.
   */
  getGameReportsManagementFinishedDeliveriesCached(
    q: Game4uReportsManagementFinishedDeliveriesCachedQuery
  ): Observable<Game4uReportsFinishedDeliveriesCachedPage> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/management/finished/deliveries/cached: defina backend_url_base.'
          )
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/management/finished/deliveries/cached: informe month (YYYY-MM).'
          )
      );
    }
    const uid = (q.user_id ?? '').trim();
    const off = Math.max(0, Math.floor(q.offset ?? 0));
    const lim = Math.min(Math.max(Math.floor(q.limit ?? 30), 1), 500);
    const key = `rpt-mgmt-del-cached|${uid}|${month}|${off}|${lim}`;
    return this.shareGame4uDedupe(key, this.reportsManagementFinishedDeliveriesCachedCache, () => {
      let params = new HttpParams()
        .set('month', month)
        .set('offset', String(off))
        .set('limit', String(lim));
      if (uid) {
        params = params.set('user_id', uid);
      }
      return this.http
        .get<unknown>(`${this.baseUrl}/game/reports/management/finished/deliveries/cached`, {
          headers: this.headers(),
          params
        })
        .pipe(
          map(body => normalizeGameReportsFinishedDeliveriesCachedPagePayload(body, off, lim)),
          catchError(err => {
            if (err instanceof HttpErrorResponse && err.status === 404) {
              return of({ offset: off, limit: lim, items: [] });
            }
            return throwError(() => err);
          })
        );
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
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/finished/deliveries: informe email ou team_id.')
      );
    }
    try {
      this.assertFinishedAtRange(q, 'reports/finished/deliveries');
    } catch (e) {
      return throwError(() => e);
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
   * `GET /game/reports/finished/deliveries` com `offset`/`limit` (paginado quando suportado no backend).
   * Não usa cache de dedupe por chave, pois cada página tem parâmetros distintos.
   */
  getGameReportsFinishedDeliveriesPage(
    q: Game4uReportsFinishedQuery
  ): Observable<Game4uReportsFinishedDeliveriesPage> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/finished/deliveries: defina backend_url_base.')
      );
    }
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/finished/deliveries: informe email ou team_id.')
      );
    }
    try {
      this.assertFinishedAtRange(q, 'reports/finished/deliveries (paginado)');
    } catch (e) {
      return throwError(() => e);
    }
    let params = this.appendReportParams(new HttpParams(), q);
    const off = Math.max(0, Math.floor(q.offset ?? 0));
    const lim = Math.min(Math.max(Math.floor(q.limit ?? 500), 1), 500);
    params = params.set('offset', String(off)).set('limit', String(lim));
    return this.http
      .get<unknown>(`${this.baseUrl}/game/reports/finished/deliveries`, {
        headers: this.headers(),
        params
      })
      .pipe(map(body => normalizeGameReportsFinishedDeliveriesPagePayload(body)));
  }

  /**
   * `GET /game/reports/finished/actions-by-delivery`.
   */
  getGameReportsFinishedActionsByDelivery(
    q: Game4uReportsActionsByDeliveryQuery
  ): Observable<Game4uReportsActionsByDeliveryPage> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/finished/actions-by-delivery: defina backend_url_base.')
      );
    }
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/finished/actions-by-delivery: informe email ou team_id.')
      );
    }
    try {
      this.assertFinishedAtRange(q, 'reports/finished/actions-by-delivery');
    } catch (e) {
      return throwError(() => e);
    }
    const key = this.reportsActionsByDeliveryKey(q);
    return this.shareGame4uDedupe(key, this.reportsActionsByDeliveryCache, () => {
      const params = this.appendReportParams(new HttpParams(), q).set('delivery_title', q.delivery_title);
      return this.http
        .get<unknown>(`${this.baseUrl}/game/reports/finished/actions-by-delivery`, {
          headers: this.headers(),
          params
        })
        .pipe(map(body => normalizeGameReportsActionsByDeliveryResponse(body)));
    });
  }

  /**
   * `GET /game/reports/user-actions`.
   * Pares opcionais (um por pedido): `finished_at_*`, `dt_prazo_*`, `created_at_*` — par incompleto ou mais de um par → erro.
   */
  getGameReportsUserActions(q: Game4uReportsUserActionsQuery): Observable<Game4uReportsUserActionsPage> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/user-actions: defina backend_url_base.')
      );
    }
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/user-actions: informe email ou team_id.')
      );
    }
    let params = new HttpParams();
    if (this.shouldIncludeEmailQueryParam(q.email)) {
      params = params.set('email', (q.email ?? '').trim());
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

    params = this.withOptionalTeamId(params, q.team_id);
    return this.http
      .get<unknown>(`${this.baseUrl}/game/reports/user-actions`, {
        headers: this.headers(),
        params
      })
      .pipe(map(body => normalizeGameReportsUserActionsResponse(body)));
  }

  /**
   * `GET /game/reports/dashboard/cached` — painel resumo do jogador (substitui finished/open/goal month summary).
   */
  getGameReportsDashboardCached(
    q: Game4uReportsDashboardCachedQuery
  ): Observable<PlayerDashboardCachedResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/dashboard/cached: defina backend_url_base.')
      );
    }
    const email = (q.email ?? '').trim();
    const month = (q.month ?? '').trim();
    if (!email) {
      return throwError(() => new Error('[Game4U] reports/dashboard/cached: informe email.'));
    }
    if (!month) {
      return throwError(() => new Error('[Game4U] reports/dashboard/cached: informe month (YYYY-MM).'));
    }
    const key = `dashboard-cached|${email}|${month}`;
    return this.shareGame4uDedupe(key, this.reportsDashboardCachedCache, () => {
      const params = new HttpParams().set('email', email).set('month', month);
      return this.http.get<PlayerDashboardCachedResponse>(
        `${this.baseUrl}/game/reports/dashboard/cached`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/supervision/dashboard/cached` — painel agregado por time (substitui finished/open/goal month summary com team_id).
   */
  getGameReportsSupervisionDashboardCached(
    q: Game4uReportsSupervisionCachedQuery
  ): Observable<SupervisionTeamDashboardCached> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/supervision/dashboard/cached: defina backend_url_base.')
      );
    }
    const teamId = (q.team_id ?? '').trim();
    const month = (q.month ?? '').trim();
    if (!teamId) {
      return throwError(
        () => new Error('[Game4U] reports/supervision/dashboard/cached: informe team_id.')
      );
    }
    if (!month) {
      return throwError(
        () => new Error('[Game4U] reports/supervision/dashboard/cached: informe month (YYYY-MM).')
      );
    }
    const key = `supervision-cached|${teamId}|${month}`;
    return this.shareGame4uDedupe(key, this.reportsSupervisionDashboardCachedCache, () => {
      const params = new HttpParams().set('team_id', teamId).set('month', month);
      return this.http.get<SupervisionTeamDashboardCached>(
        `${this.baseUrl}/game/reports/supervision/dashboard/cached`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/supervision/dashboard/cached/list` — grade de times no mês.
   */
  getGameReportsSupervisionDashboardCachedList(
    q: Game4uReportsSupervisionCachedListQuery
  ): Observable<SupervisionDashboardCachedListResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error('[Game4U] reports/supervision/dashboard/cached/list: defina backend_url_base.')
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error('[Game4U] reports/supervision/dashboard/cached/list: informe month (YYYY-MM).')
      );
    }
    const key = `supervision-cached-list|${month}`;
    return this.shareGame4uDedupe(key, this.reportsSupervisionDashboardListCache, () => {
      const params = new HttpParams().set('month', month);
      return this.http.get<SupervisionDashboardCachedListResponse>(
        `${this.baseUrl}/game/reports/supervision/dashboard/cached/list`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/management/dashboard/cached/overview` — painel agregado do gestor (GERENTE / DIRETOR / C_LEVEL).
   */
  /**
   * `GET /game/reports/management/dashboard/cached/list` — gestores no escopo do JWT (ex.: gerências para DIRETOR/C_LEVEL).
   */
  getGameReportsManagementDashboardCachedList(
    q: Game4uReportsManagementCachedListQuery
  ): Observable<ManagementDashboardCachedListResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error('[Game4U] reports/management/dashboard/cached/list: defina backend_url_base.')
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error('[Game4U] reports/management/dashboard/cached/list: informe month (YYYY-MM).')
      );
    }
    const role = (q.role ?? '').trim();
    const uid = (q.user_id ?? '').trim();
    const key = `management-list|${month}|${role}|${uid}`;
    return this.shareGame4uDedupe(key, this.reportsManagementDashboardListCache, () => {
      let params = new HttpParams().set('month', month);
      if (role) {
        params = params.set('role', role);
      }
      if (uid) {
        params = params.set('user_id', uid);
      }
      return this.http.get<ManagementDashboardCachedListResponse>(
        `${this.baseUrl}/game/reports/management/dashboard/cached/list`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  getGameReportsManagementDashboardCachedOverview(
    q: Game4uReportsManagementCachedQuery
  ): Observable<ManagementDashboardOverviewResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error('[Game4U] reports/management/dashboard/cached/overview: defina backend_url_base.')
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/management/dashboard/cached/overview: informe month (YYYY-MM).'
          )
      );
    }
    const uid = (q.user_id ?? '').trim();
    const key = `management-overview|${month}|${uid}`;
    return this.shareGame4uDedupe(key, this.reportsManagementDashboardOverviewCache, () => {
      let params = new HttpParams().set('month', month);
      if (uid) {
        params = params.set('user_id', uid);
      }
      return this.http.get<ManagementDashboardOverviewResponse>(
        `${this.baseUrl}/game/reports/management/dashboard/cached/overview`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/organization/hierarchy-report` — relatório organizacional hierárquico (cache Snowflake).
   */
  getGameReportsOrganizationHierarchyReport(
    q: Game4uReportsOrganizationHierarchyQuery
  ): Observable<OrganizationHierarchyReportResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error('[Game4U] reports/organization/hierarchy-report: defina backend_url_base.')
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/organization/hierarchy-report: informe month (YYYY-MM).'
          )
      );
    }
    const sim = q.simulation_pot_brl;
    const depth = q.depth;
    const nodeType = (q.node_type ?? '').trim();
    const nodeId = (q.node_id ?? '').trim();
    const key = `org-hierarchy|${month}|${sim ?? ''}|${depth ?? ''}|${nodeType}|${nodeId}`;
    return this.shareGame4uDedupe(key, this.reportsOrganizationHierarchyCache, () => {
      let params = new HttpParams().set('month', month);
      if (sim != null && Number.isFinite(sim) && sim > 0) {
        params = params.set('simulation_pot_brl', String(sim));
      }
      if (depth != null && Number.isFinite(depth)) {
        params = params.set('depth', String(Math.floor(depth)));
      }
      if (nodeType) {
        params = params.set('node_type', nodeType);
      }
      if (nodeId) {
        params = params.set('node_id', nodeId);
      }
      return this.http.get<OrganizationHierarchyReportResponse>(
        `${this.baseUrl}/game/reports/organization/hierarchy-report`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/organization/hierarchy-report/kpi-detail`
   */
  getGameReportsOrganizationHierarchyKpiDetail(
    q: Game4uReportsOrganizationHierarchyKpiDetailQuery
  ): Observable<OrganizationHierarchyKpiDetailResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error('[Game4U] reports/organization/hierarchy-report/kpi-detail: defina backend_url_base.')
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(() => new Error('[Game4U] kpi-detail: informe month (YYYY-MM).'));
    }
    const kpi = q.kpi;
    const nodeType = (q.node_type ?? '').trim();
    const nodeId = (q.node_id ?? '').trim();
    const months = q.months ?? 4;

    const key = `org-hierarchy-kpi-detail|${month}|${kpi}|${months}|${nodeType}|${nodeId}`;
    return this.shareGame4uDedupe(key, this.reportsOrganizationHierarchyKpiDetailCache, () => {
      let params = new HttpParams().set('month', month).set('kpi', kpi).set('months', String(Math.max(1, Math.floor(months))));
      if (nodeType) {
        params = params.set('node_type', nodeType);
      }
      if (nodeId) {
        params = params.set('node_id', nodeId);
      }
      return this.http.get<OrganizationHierarchyKpiDetailResponse>(
        `${this.baseUrl}/game/reports/organization/hierarchy-report/kpi-detail`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/organization/hierarchy-report/multa-risk`
   */
  getGameReportsOrganizationHierarchyMultaRisk(
    q: Game4uReportsOrganizationHierarchyMultaRiskQuery
  ): Observable<OrganizationHierarchyMultaRiskResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/organization/hierarchy-report/multa-risk: defina backend_url_base.'
          )
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(() => new Error('[Game4U] multa-risk: informe month (YYYY-MM).'));
    }
    const nodeType = (q.node_type ?? '').trim();
    const nodeId = (q.node_id ?? '').trim();

    const key = `org-hierarchy-multa-risk|${month}|${nodeType}|${nodeId}`;
    return this.shareGame4uDedupe(key, this.reportsOrganizationHierarchyMultaRiskCache, () => {
      let params = new HttpParams().set('month', month);
      if (nodeType) {
        params = params.set('node_type', nodeType);
      }
      if (nodeId) {
        params = params.set('node_id', nodeId);
      }
      return this.http.get<OrganizationHierarchyMultaRiskResponse>(
        `${this.baseUrl}/game/reports/organization/hierarchy-report/multa-risk`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/organization/hierarchy-report/clients-served/export/xlsx`
   */
  getGameReportsOrganizationHierarchyClientsServedExportXlsx(
    q: Game4uReportsOrganizationHierarchyClientsServedExportQuery
  ): Observable<HttpResponse<Blob>> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/organization/hierarchy-report/clients-served/export/xlsx: defina backend_url_base.'
          )
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error(
            '[Game4U] clients-served/export/xlsx: informe month (YYYY-MM).'
          )
      );
    }
    const nodeType = (q.node_type ?? '').trim();
    const nodeId = (q.node_id ?? '').trim();
    let params = new HttpParams().set('month', month);
    if (nodeType) {
      params = params.set('node_type', nodeType);
    }
    if (nodeId) {
      params = params.set('node_id', nodeId);
    }
    return this.http.get(`${this.baseUrl}/game/reports/organization/hierarchy-report/clients-served/export/xlsx`, {
      headers: this.headers(),
      params,
      observe: 'response',
      responseType: 'blob'
    });
  }

  /**
   * `GET /game/reports/organization/hierarchy-report/critical-clients/deliveries/export`
   */
  getGameReportsOrganizationHierarchyCriticalClientsDeliveriesExport(
    q: Game4uReportsOrganizationHierarchyCriticalClientsDeliveriesExportQuery
  ): Observable<HttpResponse<Blob>> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/organization/hierarchy-report/critical-clients/deliveries/export: defina backend_url_base.'
          )
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error(
            '[Game4U] critical-clients/deliveries/export: informe month (YYYY-MM).'
          )
      );
    }
    const nodeType = (q.node_type ?? '').trim();
    const nodeId = (q.node_id ?? '').trim();
    const issue = (q.issue ?? 'all').trim() || 'all';
    let params = new HttpParams().set('month', month).set('issue', issue);
    if (nodeType) {
      params = params.set('node_type', nodeType);
    }
    if (nodeId) {
      params = params.set('node_id', nodeId);
    }
    return this.http.get(
      `${this.baseUrl}/game/reports/organization/hierarchy-report/critical-clients/deliveries/export`,
      {
        headers: this.headers(),
        params,
        observe: 'response',
        responseType: 'blob'
      }
    );
  }

  /**
   * `GET /game/reports/organization/hierarchy-report/deliveries`
   */
  getGameReportsOrganizationHierarchyDeliveries(
    q: Game4uReportsOrganizationHierarchyDeliveriesQuery
  ): Observable<OrganizationHierarchyDeliveriesResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error(
            '[Game4U] reports/organization/hierarchy-report/deliveries: defina backend_url_base.'
          )
      );
    }
    const month = (q.month ?? '').trim();
    const drilldown = (q.drilldown ?? '').trim();
    if (!month) {
      return throwError(() => new Error('[Game4U] deliveries: informe month (YYYY-MM).'));
    }
    if (!drilldown) {
      return throwError(() => new Error('[Game4U] deliveries: informe drilldown.'));
    }
    const nodeType = (q.node_type ?? '').trim();
    const nodeId = (q.node_id ?? '').trim();

    const key = `org-hierarchy-deliveries|${month}|${drilldown}|${nodeType}|${nodeId}|${(q.company_serve_key ?? '').trim()}|${(q.issue ?? '').trim()}`;
    return this.shareGame4uDedupe(key, this.reportsOrganizationHierarchyDeliveriesCache, () => {
      let params = new HttpParams().set('month', month).set('drilldown', drilldown);
      if (nodeType) {
        params = params.set('node_type', nodeType);
      }
      if (nodeId) {
        params = params.set('node_id', nodeId);
      }
      const companyServeKey = (q.company_serve_key ?? '').trim();
      if (companyServeKey) {
        params = params.set('company_serve_key', companyServeKey);
      }
      const issue = (q.issue ?? '').trim();
      if (issue) {
        params = params.set('issue', issue);
      }
      return this.http.get<OrganizationHierarchyDeliveriesResponse>(
        `${this.baseUrl}/game/reports/organization/hierarchy-report/deliveries`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/organization/hierarchy-insights` — análise executiva em cache (Supabase).
   */
  getGameReportsOrganizationHierarchyInsights(
    q: Game4uReportsOrganizationHierarchyInsightsQuery
  ): Observable<OrganizationHierarchyInsightsResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error('[Game4U] reports/organization/hierarchy-insights: defina backend_url_base.')
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error('[Game4U] reports/organization/hierarchy-insights: informe month (YYYY-MM).')
      );
    }
    const scope = { ...q, month, focus: q.focus ?? 'risks_and_actions' };
    const key = `org-hierarchy-insights|${buildOrgHierarchyInsightsCacheKey(scope)}`;
    return this.shareGame4uDedupe(key, this.reportsOrganizationHierarchyInsightsCache, () =>
      this.http.get<OrganizationHierarchyInsightsResponse>(
        `${this.baseUrl}/game/reports/organization/hierarchy-insights`,
        {
          headers: this.headers(),
          params: buildOrgHierarchyInsightsHttpParams(scope)
        }
      )
    );
  }

  /**
   * `POST /game/reports/organization/hierarchy-insights` — gera análise executiva para o escopo.
   */
  postGameReportsOrganizationHierarchyInsights(
    q: Game4uReportsOrganizationHierarchyInsightsQuery,
    body?: Game4uReportsOrganizationHierarchyInsightsBody
  ): Observable<OrganizationHierarchyInsightsResponse> {
    if (!this.isConfigured()) {
      return throwError(
        () =>
          new Error('[Game4U] reports/organization/hierarchy-insights: defina backend_url_base.')
      );
    }
    const month = (q.month ?? '').trim();
    if (!month) {
      return throwError(
        () =>
          new Error('[Game4U] reports/organization/hierarchy-insights: informe month (YYYY-MM).')
      );
    }
    const scope = { ...q, month, focus: q.focus ?? body?.focus ?? 'risks_and_actions' };
    const key = `org-hierarchy-insights|${buildOrgHierarchyInsightsCacheKey(scope)}`;
    const payload = body ?? defaultOrgHierarchyInsightsBody(scope);
    const paramsScope = { ...scope } as Game4uReportsOrganizationHierarchyInsightsQuery & { focus?: never };
    // No backend real, POST não aceita `focus` na query string; ele deve ir no body.
    delete (paramsScope as any).focus;
    return this.http
      .post<OrganizationHierarchyInsightsResponse>(
        `${this.baseUrl}/game/reports/organization/hierarchy-insights`,
        payload,
        {
          headers: this.headers(),
          params: buildOrgHierarchyInsightsHttpParams(paramsScope)
        }
      )
      .pipe(
        tap(() => {
          this.reportsOrganizationHierarchyInsightsCache.delete(key);
        })
      );
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
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/goal/month/summary: informe email ou team_id.')
      );
    }
    const key = this.reportsGoalMonthKey(q);
    return this.shareGame4uDedupe(key, this.reportsGoalMonthCache, () => {
      let inner = new HttpParams()
        .set('dt_prazo_start', q.dt_prazo_start)
        .set('dt_prazo_end', q.dt_prazo_end);
      if (this.shouldIncludeEmailQueryParam(q.email)) {
        inner = inner.set('email', (q.email ?? '').trim());
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

  /**
   * `GET /game/reports/team/daily-finished-stats`
   * OpenAPI: `GameController_getReportTeamDailyFinishedStats`.
   *
   * Use `team_id=__management_overview__` para a visão de gestão (GERENTE/DIRETOR/C_LEVEL/ADMIN/SERVICE).
   */
  getGameReportsTeamDailyFinishedStats(
    q: Game4uReportsTeamDailyFinishedStatsQuery
  ): Observable<unknown> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/team/daily-finished-stats: defina backend_url_base.')
      );
    }
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/team/daily-finished-stats: informe email ou team_id.')
      );
    }
    const key = this.reportsTeamDailyFinishedStatsKey(q);
    return this.shareGame4uDedupe(key, this.reportsTeamDailyFinishedStatsCache, () => {
      const params = this.appendTeamDailyFinishedStatsParams(new HttpParams(), q);
      return this.http.get<unknown>(
        `${this.baseUrl}/game/reports/team/daily-finished-stats`,
        {
          headers: this.headers(),
          params
        }
      );
    });
  }

  /**
   * `GET /game/reports/team/daily-pending-stats`
   *
   * Agregado diário de tarefas pendentes (status default `PENDING` + `DOING`) cujo `due_date`
   * — com fallback para `extra.dt_prazo` — cai no intervalo `start..end`.
   *
   * Use `team_id=__management_overview__` para a visão de gestão (GERENTE/DIRETOR/C_LEVEL/ADMIN/SERVICE).
   */
  getGameReportsTeamDailyPendingStats(
    q: Game4uReportsTeamDailyPendingStatsQuery
  ): Observable<unknown> {
    if (!this.isConfigured()) {
      return throwError(
        () => new Error('[Game4U] reports/team/daily-pending-stats: defina backend_url_base.')
      );
    }
    if (!this.hasReportsIdentity(q)) {
      return throwError(
        () => new Error('[Game4U] reports/team/daily-pending-stats: informe email ou team_id.')
      );
    }
    const key = this.reportsTeamDailyPendingStatsKey(q);
    return this.shareGame4uDedupe(key, this.reportsTeamDailyPendingStatsCache, () => {
      const params = this.appendTeamDailyPendingStatsParams(new HttpParams(), q);
      return this.http.get<unknown>(
        `${this.baseUrl}/game/reports/team/daily-pending-stats`,
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
      if (this.shouldIncludeUserQueryParam(q.user)) {
        params = params.set('user', q.user);
      }
      params = this.withOptionalTeamIdUserScoped(params, q.team_id, q.user);
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
      if (this.shouldIncludeUserQueryParam(q.user)) {
        params = params.set('user', q.user);
      }
      if (q.status) {
        params = params.set('status', q.status);
      }
      params = this.withOptionalTeamIdUserScoped(params, q.team_id, q.user);
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
    if (this.shouldIncludeUserQueryParam(q.user)) {
      delParams = delParams.set('user', q.user);
    }
    const params = this.withOptionalTeamIdUserScoped(delParams, q.team_id, q.user);
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
      if (this.shouldIncludeUserQueryParam(q.user)) {
        params = params.set('user', q.user!);
      }
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
