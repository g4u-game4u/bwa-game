import { Injectable } from '@angular/core';
import { Observable, from, of, firstValueFrom, forkJoin } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { BackendUserActionApiService } from './backend-user-action-api.service';
import { CompanyKpiService, CompanyDisplay } from './company-kpi.service';
import { ActivityListItem, ClienteActionItem } from './action-log.service';
import { ActivityMetrics } from '@model/gamification-dashboard.model';
import { lookupActivityPoints } from '@utils/activity-points.util';
import {
  extractGame4uUserIdFromUserPayload,
  looksLikeEmail,
  pickSessionEmailForGameApi
} from '@utils/game4u-user-id.util';

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
    const created_at =
      typeof raw['created_at'] === 'string' ? raw['created_at'] : '';
    const finishedRaw = raw['finished_at'];
    const finished_at =
      finishedRaw === null || finishedRaw === undefined
        ? null
        : typeof finishedRaw === 'string'
          ? finishedRaw
          : null;
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
   * Todas as páginas de GET `/user-action/search` (delivery_id, created_at_*, dismissed, limit; sem `status` — todos os estados).
   * Paginação: `page` ou `page_token`; continuação pelo corpo (`next_page_token` / variantes).
   */
  private async fetchUserActionSearchAllPages(
    base: Record<string, string>
  ): Promise<UserActionRow[]> {
    const limRaw = base['limit'] || '200';
    const limit = Math.min(Math.max(parseInt(limRaw, 10) || 200, 1), 500);
    const merged: UserActionRow[] = [];
    let page = 1;
    let pageToken: string | null = null;
    const maxIterations = 200;

    for (let iter = 0; iter < maxIterations; iter++) {
      const entries: Record<string, string> = { ...base };
      delete entries['status'];
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
      merged.push(...parsed.items);

      const nextTok = this.extractNextPageToken(body);
      if (nextTok) {
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
        break;
      }

      const singlePageButMaybeTruncated =
        totalPages === 1 && parsed.items.length >= 50 && iter < maxIterations - 1;
      if (singlePageButMaybeTruncated) {
        page = curPage + 1;
        continue;
      }

      break;
    }

    return this.dedupeUserActionRows(merged);
  }

  /**
   * Todas as user actions da entrega na janela: duas buscas (dismissed false / true), sem filtro `status`.
   */
  private async fetchDeliveryActionsViaUserActionSearch(
    deliveryId: string,
    createdAtStart: string,
    createdAtEnd: string
  ): Promise<UserActionRow[]> {
    const did = String(deliveryId || '').trim();
    if (!did) {
      return [];
    }
    const base = {
      delivery_id: did,
      created_at_start: createdAtStart,
      created_at_end: createdAtEnd,
      limit: '200'
    };
    const [a, b] = await Promise.all([
      this.fetchUserActionSearchAllPages({ ...base, dismissed: 'false' }).catch(
        () => [] as UserActionRow[]
      ),
      this.fetchUserActionSearchAllPages({ ...base, dismissed: 'true' }).catch(
        () => [] as UserActionRow[]
      )
    ]);
    return this.dedupeUserActionRows([...a, ...b]);
  }

  /**
   * GET `/game/actions?start&end&user` ou `/game/team-actions?start&end&team` (todas as páginas no intervalo).
   */
  async fetchAllUserActionsWithParams(extra: Record<string, string>): Promise<UserActionRow[]> {
    const start = (extra['start'] || '2000-01-01T00:00:00.000Z').trim();
    const end = (extra['end'] || new Date().toISOString()).trim();
    const teamId = String(extra['team_id'] || '').trim();
    const user =
      String(extra['user'] || extra['user_id'] || extra['user_email'] || '').trim();

    if (!teamId && !user) {
      return [];
    }

    const maxIterations = 200;
    const merged: UserActionRow[] = [];
    let pageToken: string | null = null;

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
      merged.push(...parsed.items);

      const nextTok = this.extractNextPageToken(body);
      if (nextTok) {
        pageToken = nextTok;
        continue;
      }

      break;
    }

    return this.dedupeUserActionRows(merged);
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
   * Métricas de atividade no mês para um jogador (GET `/game/actions`).
   */
  getActivityMetricsForPlayer(
    playerId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ActivityMetrics> {
    return this.getActions(playerId, roster ?? null).pipe(
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
   * Data de referência para filtro por mês: finalização se existir; senão criação.
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

  /** Inclui `referenceTimestamp` em [rangeStart, rangeEnd] (comparado em ms). */
  inDateRange(row: UserActionRow, rangeStart: Date, rangeEnd: Date): boolean {
    const ts = this.referenceTimestamp(row);
    if (ts <= 0) {
      return false;
    }
    const t = ts;
    return t >= rangeStart.getTime() && t <= rangeEnd.getTime();
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
    }[] = [];
    for (const [deliveryId, rows] of byDelivery) {
      const first = rows[0];
      const titleFromApi =
        (first.delivery_title && first.delivery_title.trim()) ||
        (first.deal && first.deal.trim()) ||
        '';
      const cnpj = titleFromApi || `Entrega ${deliveryId}`;
      const deliveryTitle = (first.delivery_title && first.delivery_title.trim()) || undefined;
      result.push({
        deliveryId,
        cnpj,
        actionCount: rows.length,
        deliveryTitle
      });
    }
    result.sort((a, b) => b.actionCount - a.actionCount);
    return result;
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
    }[] = [];
    for (const [deliveryId, rows] of byDelivery) {
      const first = rows[0];
      const titleFromApi =
        (first.delivery_title && first.delivery_title.trim()) ||
        (first.deal && first.deal.trim()) ||
        '';
      const cnpj = titleFromApi || `Entrega ${deliveryId}`;
      const deliveryTitle = (first.delivery_title && first.delivery_title.trim()) || undefined;
      result.push({
        deliveryId,
        cnpj,
        actionCount: rows.length,
        deliveryTitle
      });
    }
    result.sort((a, b) => b.actionCount - a.actionCount);
    return result;
  }

  getCarteiraEnriched(
    playerId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<CompanyDisplay[]> {
    return this.getActions(playerId, roster ?? null).pipe(
      switchMap(items => {
        const companies = this.buildCarteiraCompanies(items, month);
        if (companies.length === 0) {
          return of([]);
        }
        return this.companyKpiService.enrichCompaniesWithKpis(companies);
      })
    );
  }

  getDeliveryCount(
    playerId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<number> {
    return this.getActions(playerId, roster ?? null).pipe(
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

  getClienteActionsForDelivery(
    playerId: string,
    deliveryId: string,
    month: Date,
    roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
  ): Observable<ClienteActionItem[]> {
    return this.getActions(playerId, roster ?? null).pipe(
      map(items => this.toClienteActionItemsForDelivery(items, deliveryId, month))
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
   * Detalhe da entrega no modal: GET `/user-action/search` (`delivery_id`, `created_at_start` / `created_at_end` do mês, `status`, `dismissed`, `limit`, `page` ou `page_token`).
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
          .filter(r => this.isFinalizedStatus(r))
          .map(r => this.toActivityListItem(r))
          .sort((a, b) => b.created - a.created)
      )
    );
  }

}
