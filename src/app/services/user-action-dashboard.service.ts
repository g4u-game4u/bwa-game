import { Injectable } from '@angular/core';
import { Observable, from, of, firstValueFrom, forkJoin } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { BackendUserActionApiService } from './backend-user-action-api.service';
import { CompanyKpiService, CompanyDisplay } from './company-kpi.service';
import { ActivityListItem, ClienteActionItem } from './action-log.service';
import { ActivityMetrics, ProcessMetrics } from '@model/gamification-dashboard.model';
import { lookupActivityPoints } from '@utils/activity-points.util';
import {
  extractGame4uUserIdFromUserPayload,
  looksLikeEmail,
  pickSessionEmailForGameApi
} from '@utils/game4u-user-id.util';
import { SEASON_GAME_ACTION_RANGE } from '@app/constants/season-action-range';

/** Mapear `userId` (ex.: UUID Game4U) → e-mail real para GET `/game/actions?user=`. */
export type GameActionsUserRosterEntry = { userId: string; email?: string };

/** Registo normalizado vindo do GET `/game/actions` ou `/game/team-actions` (lista em JSON). */
export interface UserActionRow {
  id: string;
  action_title: string;
  user_email: string;
  status: string;
  created_at: string;
  finished_at?: string | null;
  points?: number;
  delivery_id?: string;
  delivery_title?: string;
  integration_id?: string;
  action_template_id?: string;
  approved?: boolean | null;
  dismissed?: boolean;
  deal?: string;
  /** Presente em várias respostas GET `/game/actions` (ex.: RevisaPrev). */
  team_name?: string;
}

@Injectable({ providedIn: 'root' })
export class UserActionDashboardService {
  /** Cache por jogador (email / chave resolvida) para GET `/game/actions`. */
  private actionCache = new Map<string, UserActionRow[]>();

  constructor(
    private backendUserActionApi: BackendUserActionApiService,
    private sessao: SessaoProvider,
    private companyKpiService: CompanyKpiService
  ) {}

  clearCache(): void {
    this.actionCache.clear();
  }

  /**
   * Chave para cache e para GET `/game/actions?user=`: usar **e-mail** quando existir (contrato da API).
   */
  resolvePlayerKey(playerId: string): string {
    const u = this.sessao.usuario as
      | { id?: string; user_id?: string; _id?: string; email?: string }
      | null
      | undefined;
    const sessEmail = pickSessionEmailForGameApi(u, this.sessao.token ?? null);

    if (playerId === 'me') {
      return sessEmail || playerId;
    }
    if (playerId.includes('@')) {
      return playerId.trim();
    }
    if (u) {
      const sid = extractGame4uUserIdFromUserPayload(u, this.sessao.token ?? null);
      const same =
        playerId === String(u.id ?? '') ||
        playerId === String(u.user_id ?? '') ||
        playerId === String(u._id ?? '') ||
        (sid != null && playerId === sid);
      if (same && sessEmail) {
        return sessEmail;
      }
    }
    return playerId.trim();
  }

  /**
   * Resolve `user` para `/game/actions`: e-mail da sessão, e-mail explícito, ou e-mail do colaborador no roster do time.
   */
  resolvePlayerKeyWithRoster(
    playerId: string,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): string {
    const id = (playerId || '').trim();
    if (!id) {
      return '';
    }
    if (id.includes('@')) {
      return id;
    }
    if (roster?.length) {
      const row = roster.find(c => c.userId === id);
      const em = row?.email?.trim();
      if (em && looksLikeEmail(em)) {
        return em;
      }
    }
    return this.resolvePlayerKey(id);
  }

  /** Query param `user` em `/game/actions` — deve ser e-mail (chave já resolvida em {@link resolvePlayerKey}). */
  private queryUserParamForPlayerKey(playerKey: string): Record<string, string> {
    const key = (playerKey || '').trim();
    return key ? { user: key } : {};
  }

  private unwrapItems(body: unknown): unknown[] {
    if (!body) {
      return [];
    }
    if (Array.isArray(body)) {
      return body;
    }
    if (typeof body === 'object' && body !== null) {
      const o = body as Record<string, unknown>;
      const listKeys = ['items', 'data', 'actions', 'results', 'records', 'rows'] as const;
      for (const k of listKeys) {
        if (Array.isArray(o[k])) {
          return o[k] as unknown[];
        }
      }
    }
    return [];
  }

  /** Identificador estável da linha: vários backends usam `_id` / `user_action_id` em vez de `id`. */
  /**
   * Extrai ISO string de campos de data na resposta Game4U (string, `{ $date }` ou epoch ms).
   * Não usa `updated_at` — só chaves explicitamente pedidas.
   */
  private pickIsoDateString(raw: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const v = raw[key];
      if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
      if (v && typeof v === 'object' && v !== null && '$date' in (v as Record<string, unknown>)) {
        const d = (v as { $date?: unknown }).$date;
        if (typeof d === 'string' && d.trim()) {
          return d.trim();
        }
        if (typeof d === 'number' && isFinite(d)) {
          return new Date(d).toISOString();
        }
      }
      if (typeof v === 'number' && isFinite(v)) {
        return new Date(v).toISOString();
      }
    }
    return '';
  }

  private pickRawActionId(raw: Record<string, unknown>): string | null {
    const keys = [
      'id',
      '_id',
      'user_action_id',
      'userActionId',
      'action_id',
      'actionId'
    ] as const;
    for (const k of keys) {
      const v = raw[k];
      if (v == null) {
        continue;
      }
      const s = String(v).trim();
      if (s !== '') {
        return s;
      }
    }
    return null;
  }

  private normalizeRow(raw: Record<string, unknown>): UserActionRow | null {
    const id = this.pickRawActionId(raw);
    if (!id) {
      return null;
    }
    const titleFromGame =
      typeof raw['action_title'] === 'string'
        ? raw['action_title']
        : typeof raw['title'] === 'string'
          ? raw['title']
          : '';
    const action_title = titleFromGame;
    const user_email =
      typeof raw['user_email'] === 'string' ? raw['user_email'] : '';
    const status = typeof raw['status'] === 'string' ? raw['status'] : '';
    const created_at = this.pickIsoDateString(raw, 'created_at', 'createdAt');
    const finishedStr = this.pickIsoDateString(raw, 'finished_at', 'finishedAt');
    const finished_at = finishedStr ? finishedStr : null;
    const delivery_id =
      raw['delivery_id'] != null ? String(raw['delivery_id']) : undefined;
    const delivery_title =
      typeof raw['delivery_title'] === 'string' ? raw['delivery_title'] : undefined;
    const integration_id =
      raw['integration_id'] != null ? String(raw['integration_id']) : undefined;
    const action_template_id =
      raw['action_template_id'] != null ? String(raw['action_template_id']) : undefined;
    const deal = typeof raw['deal'] === 'string' ? raw['deal'] : undefined;
    const team_name =
      typeof raw['team_name'] === 'string' && raw['team_name'].trim()
        ? raw['team_name'].trim()
        : undefined;
    const dismissed = raw['dismissed'] === true;
    const approved =
      typeof raw['approved'] === 'boolean' || raw['approved'] === null
        ? (raw['approved'] as boolean | null)
        : undefined;
    let points: number | undefined;
    if (typeof raw['points'] === 'number' && isFinite(raw['points'])) {
      points = raw['points'];
    }

    return {
      id,
      action_title,
      user_email,
      status,
      created_at,
      finished_at,
      points,
      delivery_id,
      delivery_title,
      integration_id,
      action_template_id,
      approved,
      dismissed,
      deal,
      team_name
    };
  }

  private parsePage(body: unknown): { items: UserActionRow[]; page: number; totalPages: number } {
    const rawItems = this.unwrapItems(body);
    const items: UserActionRow[] = [];
    for (const r of rawItems) {
      if (r && typeof r === 'object') {
        const row = this.normalizeRow(r as Record<string, unknown>);
        if (row) {
          items.push(row);
        }
      }
    }
    if (typeof body === 'object' && body !== null) {
      const o = body as Record<string, unknown>;
      const page = typeof o['page'] === 'number' ? o['page'] : 1;
      const totalPages =
        typeof o['totalPages'] === 'number'
          ? o['totalPages']
          : typeof o['total_pages'] === 'number'
            ? (o['total_pages'] as number)
            : 1;
      return { items, page, totalPages: Math.max(1, totalPages) };
    }
    return { items, page: 1, totalPages: 1 };
  }

  private extractNextPageToken(body: unknown): string | null {
    if (!body || typeof body !== 'object') {
      return null;
    }
    const o = body as Record<string, unknown>;
    const tok = o['next_page_token'] ?? o['nextPageToken'] ?? o['Next_Page_Token'];
    if (typeof tok === 'string' && tok.trim()) {
      return tok.trim();
    }
    return null;
  }

  private dedupeUserActionRows(rows: UserActionRow[]): UserActionRow[] {
    const byId = new Map<string, UserActionRow>();
    for (const r of rows) {
      byId.set(r.id, r);
    }
    return [...byId.values()];
  }

  /**
   * Todas as páginas de GET `/user-action/search` (delivery_id, datas, dismissed, limit; status pode ser string ou array).
   * Paginação: `page` ou `page_token`; continuação pelo corpo (`next_page_token` / variantes).
   * Nota: Backend não suporta `sort` - ordenação feita no cliente após fetch.
   */
  private async fetchUserActionSearchAllPages(
    base: Record<string, string | string[]>
  ): Promise<UserActionRow[]> {
    const limRaw = base['limit'] || '500'; // Increased default from 200 to 500
    const limit = Math.min(Math.max(parseInt(limRaw, 10) || 500, 1), 500);
    const merged: UserActionRow[] = [];
    let page = 1;
    let pageToken: string | null = null;
    const maxIterations = 200;

    // Remove sort parameter as backend doesn't support it
    const baseWithoutSort = { ...base };
    delete baseWithoutSort['sort'];

    for (let iter = 0; iter < maxIterations; iter++) {
      const entries: Record<string, string | string[]> = { ...baseWithoutSort };
      delete entries['page'];
      delete entries['page_token'];
      entries['limit'] = String(limit);
      if (pageToken) {
        entries['page_token'] = pageToken;
      } else {
        entries['page'] = String(page);
      }

      const body = await firstValueFrom(this.backendUserActionApi.getUserActionSearch(entries));
      const parsed = this.parsePage(body);
      
      console.log(`[fetchUserActionSearchAllPages] Page ${page}: fetched ${parsed.items.length} items, total so far: ${merged.length + parsed.items.length}`);
      
      merged.push(...parsed.items);

      const nextTok = this.extractNextPageToken(body);
      if (nextTok) {
        console.log(`[fetchUserActionSearchAllPages] Found next_page_token, continuing to next page`);
        pageToken = nextTok;
        continue;
      }
      pageToken = null;

      const curPage = parsed.page;
      const totalPages = parsed.totalPages;
      if (curPage < totalPages) {
        page = curPage + 1;
        continue;
      }

      if (parsed.items.length === 0) {
        console.log(`[fetchUserActionSearchAllPages] No more items. Total fetched: ${merged.length}`);
        break;
      }

      const singlePageButMaybeTruncated =
        totalPages === 1 && parsed.items.length >= 50 && iter < maxIterations - 1;
      if (singlePageButMaybeTruncated) {
        page = curPage + 1;
        continue;
      }

      console.log(`[fetchUserActionSearchAllPages] Completed. Total pages: ${totalPages}, Total items: ${merged.length}`);
      break;
    }

    const deduped = this.dedupeUserActionRows(merged);
    
    // Sort by finished_at descending (newest first) on client side since backend doesn't support sort parameter
    deduped.sort((a, b) => {
      const aTime = this.referenceTimestamp(a);
      const bTime = this.referenceTimestamp(b);
      return bTime - aTime; // Descending order (newest first)
    });
    
    console.log(`[fetchUserActionSearchAllPages] After deduplication and sorting: ${deduped.length} unique items`);
    return deduped;
  }

  /**
   * Todas as user actions da entrega na janela: busca apenas ações DONE ou DELIVERED (que têm finished_at).
   * Usa `finished_at_start` / `finished_at_end` para filtrar pelo mês correto.
   */
  private async fetchDeliveryActionsViaUserActionSearch(
    deliveryId: string,
    finishedAtStart: string,
    finishedAtEnd: string
  ): Promise<UserActionRow[]> {
    const did = String(deliveryId || '').trim();
    if (!did) {
      return [];
    }
    const base: Record<string, string | string[]> = {
      delivery_id: did,
      finished_at_start: finishedAtStart,
      finished_at_end: finishedAtEnd,
      limit: '200',
      status: ['DONE', 'DELIVERED'] // Fetch both finished statuses
    };
    
    console.log(`[fetchDeliveryActionsViaUserActionSearch] Fetching DONE and DELIVERED actions for delivery ${did}`);
    
    const actions = await this.fetchUserActionSearchAllPages(base).catch(
      () => [] as UserActionRow[]
    );
    
    console.log(`[fetchDeliveryActionsViaUserActionSearch] Fetched ${actions.length} finished actions`);
    
    return actions;
  }

  /**
   * GET `/game/actions?start&end&user` ou `/game/team-actions?start&end&team` (todas as páginas no intervalo).
   */
  async fetchAllUserActionsWithParams(extra: Record<string, string>): Promise<UserActionRow[]> {
    const seasonStartIso = SEASON_GAME_ACTION_RANGE.start.toISOString();
    let start = (extra['start'] || seasonStartIso).trim();
    let end = (extra['end'] || new Date().toISOString()).trim();
    const t0 = Date.parse(start);
    const t1 = Date.parse(end);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t0 > t1) {
      console.warn('[UserActionDashboard] Intervalo inválido start>end; ajustando para [min,max].', {
        start,
        end
      });
      const lo = Math.min(t0, t1);
      const hi = Math.max(t0, t1);
      start = new Date(lo).toISOString();
      end = new Date(hi).toISOString();
    }
    const teamId = String(extra['team_id'] || '').trim();
    const user =
      String(extra['user'] || extra['user_id'] || extra['user_email'] || '').trim();

    if (!teamId && !user) {
      return [];
    }

    const maxIterations = 200;
    const merged: UserActionRow[] = [];
    let pageToken: string | null = null;
    // Note: /game/actions doesn't support 'limit' parameter, only next_page_token pagination

    for (let iter = 0; iter < maxIterations; iter++) {
      const paging: { next_page_token?: string } = {};
      if (pageToken) {
        paging.next_page_token = pageToken;
      }

      let body: unknown;
      if (teamId) {
        body = await firstValueFrom(
          this.backendUserActionApi.getGameTeamActions({
            start,
            end,
            team: teamId,
            ...paging
          })
        );
      } else {
        body = await firstValueFrom(
          this.backendUserActionApi.getGameActions({
            start,
            end,
            user,
            ...paging
          })
        );
      }

      const parsed = this.parsePage(body);
      console.log(`[fetchAllUserActions] Page ${iter + 1}: fetched ${parsed.items.length} items, total so far: ${merged.length + parsed.items.length}`);
      merged.push(...parsed.items);

      const nextTok = this.extractNextPageToken(body);
      if (nextTok) {
        console.log(`[fetchAllUserActions] Found next_page_token, continuing to page ${iter + 2}`);
        pageToken = nextTok;
        continue;
      }

      console.log(`[fetchAllUserActions] No more pages. Total items fetched: ${merged.length}`);
      break;
    }

    const deduped = this.dedupeUserActionRows(merged);
    console.log(`[fetchAllUserActions] After deduplication: ${deduped.length} unique items`);
    return deduped;
  }

  /**
   * Busca todas as user actions de um usuário no mês usando GET `/user-action/search`.
   * Mais eficiente e com melhor controle de paginação do que `/game/actions`.
   * Usa finished_at para filtrar apenas ações finalizadas (DONE ou DELIVERED).
   */
  async fetchAllUserActionsForMonthViaSearch(
    userEmail: string,
    month: Date
  ): Promise<UserActionRow[]> {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const rangeStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

    const finishedAtStart = rangeStart.toISOString();
    const finishedAtEnd = rangeEnd.toISOString();

    const base: Record<string, string | string[]> = {
      user_email: userEmail,
      finished_at_start: finishedAtStart,
      finished_at_end: finishedAtEnd,
      limit: '500', // Request 500 items per page
      status: ['DONE', 'DELIVERED'] // Fetch both finished statuses
    };

    console.log(`[fetchAllUserActionsForMonthViaSearch] Fetching DONE and DELIVERED actions for ${userEmail}, month: ${year}-${monthIndex + 1}`);
    
    const allActions = await this.fetchUserActionSearchAllPages(base);
    
    console.log(`[fetchAllUserActionsForMonthViaSearch] Total finished actions fetched: ${allActions.length}`);
    
    return allActions;
  }

  async fetchAllUserActions(playerKey: string): Promise<UserActionRow[]> {
    const baseParams = this.queryUserParamForPlayerKey(playerKey);
    return this.fetchAllUserActionsWithParams(baseParams);
  }

  getActions(
    playerKey: string,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<UserActionRow[]> {
    const key = this.resolvePlayerKeyWithRoster(playerKey, roster ?? null) || playerKey.trim();
    if (!key || !looksLikeEmail(key)) {
      return of([]);
    }
    const hit = this.actionCache.get(key);
    if (hit) {
      return of(hit);
    }
    return from(this.fetchAllUserActions(key)).pipe(
      tap(items => {
        this.actionCache.set(key, items);
      })
    );
  }

  /**
   * GET `/game/actions?start&end&user=` com intervalo explícito (não reutiliza cache de lista ampla).
   */
  getActionsForPlayerDateRange(
    playerKey: string,
    rangeStart: Date,
    rangeEnd: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<UserActionRow[]> {
    const user = (this.resolvePlayerKeyWithRoster(playerKey, roster ?? null) || '').trim();
    if (!user || !looksLikeEmail(user)) {
      return of([]);
    }
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    return from(
      this.fetchAllUserActionsWithParams({
        ...this.queryUserParamForPlayerKey(user),
        start,
        end
      })
    );
  }

  getDeliveryCountInRange(
    playerId: string,
    rangeStart: Date,
    rangeEnd: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<number> {
    return this.getActionsForPlayerDateRange(playerId, rangeStart, rangeEnd, roster).pipe(
      map(items => this.buildCarteiraCompaniesInRange(items, rangeStart, rangeEnd).length)
    );
  }

  getActivityMetricsForPlayerInRange(
    playerId: string,
    rangeStart: Date,
    rangeEnd: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ActivityMetrics> {
    return this.getActionsForPlayerDateRange(playerId, rangeStart, rangeEnd, roster).pipe(
      map(items => this.getActivityMetricsFromActionsInRange(items, rangeStart, rangeEnd))
    );
  }

  /**
   * GET `/game/team-actions?start&end&team=` e métricas no intervalo.
   */
  getActivityMetricsForTeamInRange(
    teamId: string,
    rangeStart: Date,
    rangeEnd: Date
  ): Observable<ActivityMetrics> {
    const tid = String(teamId || '').trim();
    if (!tid) {
      return of({ pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 });
    }
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    return from(
      this.fetchAllUserActionsWithParams({
        team_id: tid,
        start,
        end
      })
    ).pipe(map(items => this.getActivityMetricsFromActionsInRange(items, rangeStart, rangeEnd)));
  }

  getDeliveryCountForTeamInRange(
    teamId: string,
    rangeStart: Date,
    rangeEnd: Date
  ): Observable<number> {
    const tid = String(teamId || '').trim();
    if (!tid) {
      return of(0);
    }
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    return from(
      this.fetchAllUserActionsWithParams({
        team_id: tid,
        start,
        end
      })
    ).pipe(
      map(items => this.buildCarteiraCompaniesInRange(items, rangeStart, rangeEnd).length)
    );
  }

  /**
   * Um pedido GET `/game/team-actions?start&end&team=` e métricas de atividades + processos (entregas)
   * no intervalo, usando {@link referenceTimestamp} (prioriza `finished_at`).
   */
  getTeamActivityAndProcessMetricsInRange(
    teamId: string,
    rangeStart: Date,
    rangeEnd: Date
  ): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    const tid = String(teamId || '').trim();
    if (!tid) {
      return of({
        activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
        processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
      });
    }
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    return from(
      this.fetchAllUserActionsWithParams({
        team_id: tid,
        start,
        end
      })
    ).pipe(
      map(items => ({
        activity: this.getActivityMetricsFromActionsInRange(items, rangeStart, rangeEnd),
        processo: this.getProcessMetricsFromActionsInRange(items, rangeStart, rangeEnd)
      }))
    );
  }

  getProcessMetricsForPlayerInRange(
    playerId: string,
    rangeStart: Date,
    rangeEnd: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ProcessMetrics> {
    return this.getActionsForPlayerDateRange(playerId, rangeStart, rangeEnd, roster ?? null).pipe(
      map(items => this.getProcessMetricsFromActionsInRange(items, rangeStart, rangeEnd))
    );
  }

  /**
   * Métricas de atividade no mês para um jogador usando GET `/user-action/search` (mais eficiente).
   */
  getActivityMetricsForPlayer(
    playerId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ActivityMetrics> {
    const userEmail = this.resolvePlayerKeyWithRoster(playerId, roster ?? null) || playerId.trim();
    
    if (!userEmail || !looksLikeEmail(userEmail)) {
      console.warn('[getActivityMetricsForPlayer] Invalid user email:', userEmail);
      return of({ finalizadas: 0, pontos: 0, pendentes: 0, dispensadas: 0, emExecucao: 0 });
    }

    return from(this.fetchAllUserActionsForMonthViaSearch(userEmail, month)).pipe(
      map(items => this.getActivityMetricsFromActions(items, month))
    );
  }

  /**
   * Soma métricas de todos os membros (tarefas finalizadas e pontos no mês).
   */
  sumTeamActivityInMonth(
    memberIds: string[],
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ActivityMetrics> {
    if (!memberIds.length) {
      return of({ pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 });
    }
    return forkJoin(
      memberIds.map(id =>
        this.getActivityMetricsForPlayer(id, month, roster ?? null)
      )
    ).pipe(
      map(metricsList =>
        metricsList.reduce(
          (acc, m) => ({
            pendentes: acc.pendentes + m.pendentes,
            emExecucao: acc.emExecucao + m.emExecucao,
            finalizadas: acc.finalizadas + m.finalizadas,
            pontos: acc.pontos + m.pontos
          }),
          { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 }
        )
      )
    );
  }

  /**
   * Métricas do mês para todas as ações do time (GET `/game/team-actions?team=`).
   */
  getActivityMetricsForTeam(teamId: string, month: Date): Observable<ActivityMetrics> {
    const tid = String(teamId || '').trim();
    if (!tid) {
      return of({ pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 });
    }
    return from(this.fetchAllUserActionsWithParams({ team_id: tid })).pipe(
      map(items => this.getActivityMetricsFromActions(items, month))
    );
  }

  private parseInstant(iso: string | undefined | null): number {
    if (!iso) {
      return 0;
    }
    const t = Date.parse(iso);
    return isNaN(t) ? 0 : t;
  }

  /**
   * Data de referência para filtro por mês/intervalo no painel e modais Game4U:
   * `finished_at` quando existir; senão `created_at`. **Nunca** `updated_at`.
   */
  private referenceTimestamp(row: UserActionRow): number {
    const ft = this.parseInstant(row.finished_at);
    if (ft > 0) {
      return ft;
    }
    return this.parseInstant(row.created_at);
  }

  inSelectedMonth(row: UserActionRow, month: Date): boolean {
    const ts = this.referenceTimestamp(row);
    if (ts <= 0) {
      return false;
    }
    const d = new Date(ts);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  }

  /** Inclui `referenceTimestamp` (finished_at → created_at, nunca updated_at) em [rangeStart, rangeEnd]. */
  inDateRange(row: UserActionRow, rangeStart: Date, rangeEnd: Date): boolean {
    const ts = this.referenceTimestamp(row);
    if (ts <= 0) {
      return false;
    }
    return ts >= rangeStart.getTime() && ts <= rangeEnd.getTime();
  }

  filterDateRange(items: UserActionRow[], rangeStart: Date, rangeEnd: Date): UserActionRow[] {
    return items.filter(r => this.inDateRange(r, rangeStart, rangeEnd));
  }

  countFinalizadasInRange(items: UserActionRow[], rangeStart: Date, rangeEnd: Date): number {
    return this.filterDateRange(items, rangeStart, rangeEnd).filter(r => this.isFinalizedStatus(r)).length;
  }

  buildCarteiraCompaniesInRange(
    items: UserActionRow[],
    rangeStart: Date,
    rangeEnd: Date
  ): { cnpj: string; actionCount: number; deliveryId: string; deliveryTitle?: string }[] {
    const monthRows = this.filterDateRange(items, rangeStart, rangeEnd);
    const byDelivery = new Map<string, UserActionRow[]>();
    for (const r of monthRows) {
      const did = (r.delivery_id || '').trim();
      if (!did) {
        continue;
      }
      const list = byDelivery.get(did) || [];
      list.push(r);
      byDelivery.set(did, list);
    }
    const result: {
      cnpj: string;
      actionCount: number;
      deliveryId: string;
      deliveryTitle?: string;
      latestActionTimestamp?: number;
    }[] = [];
    for (const [deliveryId, rows] of byDelivery) {
      const first = rows[0];
      const titleFromApi =
        (first.delivery_title && first.delivery_title.trim()) ||
        (first.deal && first.deal.trim()) ||
        '';
      const cnpj = titleFromApi || `Entrega ${deliveryId}`;
      const deliveryTitle = (first.delivery_title && first.delivery_title.trim()) || undefined;
      
      // Find the most recent action timestamp for this delivery
      const latestActionTimestamp = Math.max(...rows.map(r => this.referenceTimestamp(r)));
      
      result.push({
        deliveryId,
        cnpj,
        actionCount: rows.length,
        deliveryTitle,
        latestActionTimestamp
      });
    }
    // Sort by most recent action first (descending timestamp), then by action count
    result.sort((a, b) => {
      const timeDiff = (b.latestActionTimestamp || 0) - (a.latestActionTimestamp || 0);
      if (timeDiff !== 0) return timeDiff;
      return b.actionCount - a.actionCount;
    });
    console.log(`[buildCarteiraCompaniesInRange] Built ${result.length} deliveries, sorted by most recent action first`);
    return result;
  }

  /**
   * Por dia (calendário local) e por e-mail do executor: contagem de tarefas finalizadas e soma de pontos,
   * alinhado a {@link getActivityMetricsFromActionsInRange} (data de referência + {@link isFinalizedStatus}).
   * Usado na aba «Análise de produtividade» com GET `/game/team-actions`.
   */
  buildDailyFinalizedActivityAndPointsByUserEmail(
    items: UserActionRow[],
    rangeStart: Date,
    rangeEnd: Date
  ): Map<string, Map<string, { activities: number; points: number }>> {
    const out = new Map<string, Map<string, { activities: number; points: number }>>();
    const rows = this.filterDateRange(items, rangeStart, rangeEnd).filter(r =>
      this.isFinalizedStatus(r)
    );
    for (const r of rows) {
      const email = (r.user_email || '').trim().toLowerCase();
      if (!email) {
        continue;
      }
      const ts = this.referenceTimestamp(r);
      if (ts <= 0) {
        continue;
      }
      const dateStr = this.localCalendarDateKey(ts);
      let byDay = out.get(email);
      if (!byDay) {
        byDay = new Map();
        out.set(email, byDay);
      }
      const cur = byDay.get(dateStr) || { activities: 0, points: 0 };
      cur.activities += 1;
      cur.points += this.rowPoints(r);
      byDay.set(dateStr, cur);
    }
    return out;
  }

  private localCalendarDateKey(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  getActivityMetricsFromActionsInRange(
    items: UserActionRow[],
    rangeStart: Date,
    rangeEnd: Date
  ): ActivityMetrics {
    const rows = this.filterDateRange(items, rangeStart, rangeEnd);
    const finalizadas = rows.filter(r => this.isFinalizedStatus(r)).length;
    const pontos = rows
      .filter(r => this.isFinalizedStatus(r))
      .reduce((sum, r) => sum + this.rowPoints(r), 0);
    return {
      pendentes: 0,
      emExecucao: 0,
      finalizadas,
      pontos
    };
  }

  /**
   * Processos (entregas) no intervalo a partir das mesmas linhas `/game/actions` / `team-actions`:
   * agrupa por `delivery_id`; entrega «finalizada» se existir linha DELIVERED no período;
   * «incompleta» se há atividade finalizada no período sem DELIVERED nessa entrega.
   */
  getProcessMetricsFromActionsInRange(
    items: UserActionRow[],
    rangeStart: Date,
    rangeEnd: Date
  ): ProcessMetrics {
    const rows = this.filterDateRange(items, rangeStart, rangeEnd).filter(r => !r.dismissed);
    const byDid = new Map<string, UserActionRow[]>();
    for (const r of rows) {
      const did = (r.delivery_id || '').trim();
      if (!did) {
        continue;
      }
      const arr = byDid.get(did) || [];
      arr.push(r);
      byDid.set(did, arr);
    }
    let finalizadas = 0;
    let incompletas = 0;
    for (const [, arr] of byDid) {
      const hasDelivered = arr.some(r => this.statusComparable(r) === 'DELIVERED');
      if (hasDelivered) {
        finalizadas++;
        continue;
      }
      if (arr.some(r => this.isFinalizedStatus(r))) {
        incompletas++;
      }
    }
    return { pendentes: 0, incompletas, finalizadas };
  }

  /** Comparação de `status` tolerando acentos e caixa (ex.: Concluído → CONCLUIDO). */
  private statusComparable(row: UserActionRow): string {
    return (row.status || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Contagem/listagem de “finalizadas” no painel: estados clássicos (DONE, DELIVERED, …),
   * linha com `finished_at` válido, ou **PENDING** não dispensada (aguarda aprovação no jogo
   * mas entra em métricas e modais alinhado ao contrato da API).
   */
  isFinalizedStatus(row: UserActionRow): boolean {
    if (row.dismissed) {
      return false;
    }
    if (this.parseInstant(row.finished_at) > 0) {
      return true;
    }
    const s = this.statusComparable(row);
    if (!s) {
      return false;
    }
    const finalized = new Set([
      'DONE',
      'DELIVERED',
      'PENDING',
      'FINALIZADO',
      'FINALIZED',
      'COMPLETED',
      'COMPLETE',
      'CONCLUIDO',
      'CONCLUIDA',
      'FECHADO',
      'CLOSED',
      'RESOLVED',
      'SUCCESS'
    ]);
    return finalized.has(s);
  }

  rowPoints(row: UserActionRow): number {
    const hit = lookupActivityPoints(row.action_title);
    if (hit.found) {
      return hit.points;
    }
    return Math.round(Number(row.points ?? 0)) || 0;
  }

  /**
   * Carteira da temporada (sidebar), soma em `[rangeStart, rangeEnd]` sobre GET `/game/actions`:
   * - `DONE` → bloqueados; `DELIVERED` → desbloqueados;
   * - Outras linhas que {@link isFinalizedStatus} trata como finalizadas (ex. `PENDING`): mesma regra do
   *   breakdown mensal — `approved === false` → bloqueados; caso contrário → desbloqueados.
   * Linhas `dismissed` não entram.
   */
  getSeasonPointWalletDoneDelivered(
    items: UserActionRow[],
    rangeStart: Date,
    rangeEnd: Date
  ): { bloqueados: number; desbloqueados: number } {
    const rows = this.filterDateRange(items, rangeStart, rangeEnd).filter(r => !r.dismissed);
    let bloqueados = 0;
    let desbloqueados = 0;
    for (const r of rows) {
      const s = this.statusComparable(r);
      const pts = this.rowPoints(r);
      if (s === 'DONE') {
        bloqueados += pts;
      } else if (s === 'DELIVERED') {
        desbloqueados += pts;
      } else if (this.isFinalizedStatus(r)) {
        if (r.approved !== false) {
          desbloqueados += pts;
        } else {
          bloqueados += pts;
        }
      }
    }
    return {
      bloqueados: Math.floor(bloqueados),
      desbloqueados: Math.floor(desbloqueados)
    };
  }

  /**
   * Nome do time mais frequente nas ações no intervalo (fallback quando o perfil não traz nome legível).
   */
  pickPrimaryTeamNameFromActions(
    items: UserActionRow[],
    rangeStart: Date,
    rangeEnd: Date
  ): string {
    const rows = this.filterDateRange(items, rangeStart, rangeEnd);
    const counts = new Map<string, number>();
    for (const r of rows) {
      const n = (r.team_name || '').trim();
      if (!n) {
        continue;
      }
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [name, c] of counts) {
      if (c > bestCount) {
        best = name;
        bestCount = c;
      }
    }
    return best;
  }

  filterMonth(items: UserActionRow[], month: Date): UserActionRow[] {
    return items.filter(r => this.inSelectedMonth(r, month));
  }

  /** Soma dos pontos no mês para atividades que {@link isFinalizedStatus} considera finalizadas (incl. PENDING). */
  sumPointsInMonth(items: UserActionRow[], month: Date): number {
    return this.filterMonth(items, month)
      .filter(r => this.isFinalizedStatus(r))
      .reduce((sum, r) => sum + this.rowPoints(r), 0);
  }

  countFinalizadasInMonth(items: UserActionRow[], month: Date): number {
    return this.filterMonth(items, month).filter(r => this.isFinalizedStatus(r)).length;
  }

  getActivityMetricsFromActions(items: UserActionRow[], month: Date): ActivityMetrics {
    const monthRows = this.filterMonth(items, month);
    const finalizadas = monthRows.filter(r => this.isFinalizedStatus(r)).length;
    const pontos = monthRows
      .filter(r => this.isFinalizedStatus(r))
      .reduce((sum, r) => sum + this.rowPoints(r), 0);
    return {
      pendentes: 0,
      emExecucao: 0,
      finalizadas,
      pontos
    };
  }

  /**
   * Pontos do mês na secção “dados mensais”: só linhas que {@link isFinalizedStatus} trata como finalizadas
   * (DONE/DELIVERED, `finished_at`, PENDING não dispensada, etc.).
   * Entre essas, `approved === false` → bloqueados; caso contrário → desbloqueados.
   * Demais estados não entram na soma.
   */
  getMonthlyPointsBreakdownFromActions(
    items: UserActionRow[],
    month: Date
  ): { bloqueados: number; desbloqueados: number } {
    const monthRows = this.filterMonth(items, month);
    let desbloqueados = 0;
    let bloqueados = 0;
    for (const r of monthRows) {
      if (!this.isFinalizedStatus(r)) {
        continue;
      }
      const pts = this.rowPoints(r);
      if (r.approved !== false) {
        desbloqueados += pts;
      } else {
        bloqueados += pts;
      }
    }
    return { bloqueados, desbloqueados };
  }

  toActivityListItem(row: UserActionRow): ActivityListItem {
    const created = this.referenceTimestamp(row) || this.parseInstant(row.created_at);
    const deal = (row.deal || '').trim();
    const deliveryTitle = (row.delivery_title || '').trim();
    return {
      id: row.id,
      title: row.action_title || 'Atividade',
      points: this.rowPoints(row),
      created,
      player: row.user_email,
      status: this.isFinalizedStatus(row) ? 'finalizado' : 'pendente',
      cnpj: deal || undefined,
      deliveryName: deliveryTitle || undefined
    };
  }

  getFinishedActivityListItems(items: UserActionRow[], month: Date): ActivityListItem[] {
    return this.filterMonth(items, month)
      .filter(r => this.isFinalizedStatus(r))
      .map(r => this.toActivityListItem(r))
      .sort((a, b) => b.created - a.created);
  }

  /**
   * Carteira = uma linha por entrega (delivery_id) com atividades no mês.
   */
  buildCarteiraCompanies(
    items: UserActionRow[],
    month: Date
  ): { cnpj: string; actionCount: number; deliveryId: string; deliveryTitle?: string }[] {
    const monthRows = this.filterMonth(items, month);
    const byDelivery = new Map<string, UserActionRow[]>();
    for (const r of monthRows) {
      const did = (r.delivery_id || '').trim();
      if (!did) {
        continue;
      }
      const list = byDelivery.get(did) || [];
      list.push(r);
      byDelivery.set(did, list);
    }
    const result: {
      cnpj: string;
      actionCount: number;
      deliveryId: string;
      deliveryTitle?: string;
      latestActionTimestamp?: number;
    }[] = [];
    for (const [deliveryId, rows] of byDelivery) {
      const first = rows[0];
      const titleFromApi =
        (first.delivery_title && first.delivery_title.trim()) ||
        (first.deal && first.deal.trim()) ||
        '';
      const cnpj = titleFromApi || `Entrega ${deliveryId}`;
      const deliveryTitle = (first.delivery_title && first.delivery_title.trim()) || undefined;
      
      // Find the most recent action timestamp for this delivery
      const latestActionTimestamp = Math.max(...rows.map(r => this.referenceTimestamp(r)));
      
      result.push({
        deliveryId,
        cnpj,
        actionCount: rows.length,
        deliveryTitle,
        latestActionTimestamp
      });
    }
    // Sort by most recent action first (descending timestamp), then by action count
    result.sort((a, b) => {
      const timeDiff = (b.latestActionTimestamp || 0) - (a.latestActionTimestamp || 0);
      if (timeDiff !== 0) return timeDiff;
      return b.actionCount - a.actionCount;
    });
    console.log(`[buildCarteiraCompanies] Built ${result.length} deliveries, sorted by most recent action first`);
    return result;
  }

  /**
   * Carteira enriquecida com KPIs usando GET `/user-action/search` para melhor controle de paginação e filtros.
   */
  getCarteiraEnriched(
    playerId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<CompanyDisplay[]> {
    const userEmail = this.resolvePlayerKeyWithRoster(playerId, roster ?? null) || playerId.trim();
    
    if (!userEmail || !looksLikeEmail(userEmail)) {
      console.warn('[getCarteiraEnriched] Invalid user email:', userEmail);
      return of([]);
    }

    return from(this.fetchAllUserActionsForMonthViaSearch(userEmail, month)).pipe(
      switchMap(items => {
        const companies = this.buildCarteiraCompanies(items, month);
        if (companies.length === 0) {
          return of([]);
        }
        return this.companyKpiService.enrichCompaniesWithKpis(companies);
      })
    );
  }

  /**
   * Contagem de entregas (deliveries) no mês usando GET `/user-action/search` (mais eficiente).
   */
  getDeliveryCount(
    playerId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<number> {
    const userEmail = this.resolvePlayerKeyWithRoster(playerId, roster ?? null) || playerId.trim();
    
    if (!userEmail || !looksLikeEmail(userEmail)) {
      console.warn('[getDeliveryCount] Invalid user email:', userEmail);
      return of(0);
    }

    return from(this.fetchAllUserActionsForMonthViaSearch(userEmail, month)).pipe(
      map(items => this.buildCarteiraCompanies(items, month).length)
    );
  }

  /**
   * @param applyMonthFilter — quando `false`, assume que `items` já veio com `start`/`end` da API
   * (ex.: team-actions no mês); evita excluir linhas com `created_at`/`finished_at` incompletos.
   */
  toClienteActionItemsForDelivery(
    items: UserActionRow[],
    deliveryId: string,
    month: Date,
    applyMonthFilter = true
  ): ClienteActionItem[] {
    const scope = applyMonthFilter ? this.filterMonth(items, month) : items;
    const want = String(deliveryId ?? '').trim();
    return scope
      .filter(r => String(r.delivery_id ?? '').trim() === want)
      .map(r => ({
        id: r.id,
        title: r.action_title || 'Atividade',
        player: r.user_email,
        created: this.referenceTimestamp(r) || this.parseInstant(r.created_at),
        status: (r.dismissed
          ? 'dispensado'
          : this.isFinalizedStatus(r)
            ? 'finalizado'
            : 'pendente') as 'finalizado' | 'pendente' | 'dispensado',
        points: this.rowPoints(r)
      }))
      .sort((a, b) => b.created - a.created);
  }

  /**
   * Ações de um cliente/entrega no mês - filtra as ações do usuário específico naquela entrega.
   */
  getClienteActionsForDelivery(
    playerId: string,
    deliveryId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ClienteActionItem[]> {
    const userEmail = this.resolvePlayerKeyWithRoster(playerId, roster ?? null) || playerId.trim();
    
    console.log(`[getClienteActionsForDelivery] playerId: ${playerId}, userEmail: ${userEmail}, deliveryId: ${deliveryId}`);
    
    if (!userEmail || !looksLikeEmail(userEmail)) {
      console.warn('[getClienteActionsForDelivery] Invalid user email:', userEmail);
      return of([]);
    }

    // Fetch user's actions for the month, then filter by delivery_id
    return from(this.fetchAllUserActionsForMonthViaSearch(userEmail, month)).pipe(
      map(items => {
        console.log(`[getClienteActionsForDelivery] Fetched ${items.length} total actions for ${userEmail}`);
        const filtered = this.toClienteActionItemsForDelivery(items, deliveryId, month, false);
        console.log(`[getClienteActionsForDelivery] Filtered to ${filtered.length} actions for delivery ${deliveryId}`);
        return filtered;
      })
    );
  }

  private monthBoundsIso(month: Date): { start: string; end: string } {
    const y = month.getFullYear();
    const m = month.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  /**
   * Detalhe da entrega no modal: GET `/user-action/search` (`delivery_id`, `finished_at_start` / `finished_at_end` do mês, `dismissed`, `limit`, `page` ou `page_token`).
   */
  getDeliveryDetailActionsFromUserActionSearch(
    deliveryId: string,
    month: Date
  ): Observable<ClienteActionItem[]> {
    const did = String(deliveryId || '').trim();
    if (!did) {
      return of([]);
    }
    const { start, end } = this.monthBoundsIso(month);
    return from(this.fetchDeliveryActionsViaUserActionSearch(did, start, end)).pipe(
      map(items => this.toClienteActionItemsForDelivery(items, did, month, false))
    );
  }

  /**
   * @deprecated Preferir {@link getDeliveryDetailActionsFromUserActionSearch}; `teamId` é ignorado.
   */
  getTeamActionsForDeliveryInMonth(
    teamId: string,
    deliveryId: string,
    month: Date
  ): Observable<ClienteActionItem[]> {
    void teamId;
    return this.getDeliveryDetailActionsFromUserActionSearch(deliveryId, month);
  }

  /** Mesma entrega agregada para vários membros (ex.: modal carteira na gestão de equipa). */
  getClienteActionsForDeliveryForPlayers(
    playerIds: string[],
    deliveryId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ClienteActionItem[]> {
    if (!playerIds.length) {
      return of([]);
    }
    return forkJoin(
      playerIds.map(id =>
        this.getClienteActionsForDelivery(id, deliveryId, month, roster ?? null)
      )
    ).pipe(
      map(groups => {
        const merged = groups.flat();
        merged.sort((a, b) => b.created - a.created);
        return merged;
      })
    );
  }

  getFinishedListForPlayer(
    playerId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ActivityListItem[]> {
    const user = (this.resolvePlayerKeyWithRoster(playerId, roster ?? null) || '').trim();
    if (!user || !looksLikeEmail(user)) {
      return of([]);
    }
    const y = month.getFullYear();
    const m = month.getMonth();
    const rangeStart = new Date(y, m, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return this.getActionsForPlayerDateRange(playerId, rangeStart, rangeEnd, roster ?? null).pipe(
      map(items =>
        items
          .filter(r => this.inDateRange(r, rangeStart, rangeEnd))
          .filter(r => this.isFinalizedStatus(r))
          .map(r => this.toActivityListItem(r))
          .sort((a, b) => b.created - a.created)
      )
    );
  }

  /**
   * Get total canceled points for a user by fetching all CANCELLED actions
   * and summing their points. Optional `rangeStart`/`rangeEnd` restrict by
   * {@link inDateRange} (mesma lógica da temporada no painel).
   */
  getCanceledPoints(userId: string, rangeStart?: Date, rangeEnd?: Date): Observable<number> {
    const user = (userId || '').trim();
    if (!user || !looksLikeEmail(user)) {
      return of(0);
    }

    // Fetch all cancelled actions for this user
    const params: Record<string, string> = {
      user_email: user,
      status: 'CANCELLED',
      limit: '500' // Get a large batch
    };

    return from(this.fetchUserActionSearchAllPages(params)).pipe(
      map(items => {
        const rows =
          rangeStart && rangeEnd
            ? this.filterDateRange(items, rangeStart, rangeEnd)
            : items;
        // Sum all points from cancelled actions
        return rows.reduce((sum, item) => {
          const points = this.rowPoints(item);
          return sum + points;
        }, 0);
      })
    );
  }

}
