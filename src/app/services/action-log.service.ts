import { Injectable } from '@angular/core';
import { Observable, of, forkJoin, throwError, EMPTY } from 'rxjs';
import { map, catchError, shareReplay, switchMap, expand, reduce } from 'rxjs/operators';
import { BackendApiService } from './backend-api.service';
import {
  ActivityListItem,
  ActivityMetrics,
  PointWallet,
  ProcessListItem,
  ProcessMetrics
} from '@model/gamification-dashboard.model';
import { PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG } from '@app/constants/pontos-por-atividade-action-log';
import { isGame4uDataEnabled, type Game4uReportsUserActionsQuery } from '@model/game4u-api.model';
import { Game4uApiService } from './game4u-api.service';
import type {
  Game4uUserActionModel,
  Game4uUserActionStatsResponse,
  Game4uUserActionStatus,
  Game4uUserScopedQuery,
  Game4uTeamScopedQuery,
  Game4uGoalMonthSummaryResponse,
  Game4uReportsOpenSummaryQuery,
  Game4uReportsTeamDailyFinishedStatsQuery
} from '@model/game4u-api.model';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import {
  computeGame4uDrPrazoMetaBoost,
  computeMonthlyPointsFromGame4uActions,
  filterGame4uActionsByCompetenceMonth,
  filterGame4uActionsByMonth,
  parseExtraDrPrazoToUtcMs,
  getGame4uParticipationRowKey,
  readGame4uExtraCnpj,
  getGame4uAtendidosGroupKey,
  pickGame4uAtendidosRepresentativeKey,
  getGame4uUserActionFinishedOrFallbackMs,
  getGame4uActionStatsDone,
  getGame4uMonthlyPointsCircularFromActionStats,
  mapGame4uActionsToActivityList,
  mapGame4uActionsToProcessList,
  mapGame4uActionsToProcessMetrics,
  mapGame4uStatsToActivityMetrics,
  mapGame4uStatsToTeamProgressMetrics,
  mapGame4uStatsToPointWallet,
  mapGame4uUserActionsToParticipacaoCnpjRows,
  isGame4uUserActionFinalizedStatus,
  game4uActionMatchesParticipacaoModalRow
} from './game4u-game-mapper';

export interface ActionLogEntry {
  _id: string;
  actionId: string; // Action type identifier (e.g., 'acessorias', 'desbloquear')
  userId: string; // User's email
  time: number | { $date: string }; // Timestamp when action was logged (can be number or { $date: "ISO string" })
  attributes?: {
    delivery_title?: string; // Process title
    delivery_id?: number; // Process ID (number)
    delivery?: number; // Used in desbloquear action to reference delivery_id
    deal?: string | number; // ID da empresa no CRM (carteira por time usa este campo no aggregate)
    acao?: string; // Action title to display
    cnpj?: string; // Client CNPJ
    integration_id?: number;
    [key: string]: unknown;
  };
  extra?: {
    processed?: boolean;
    processed_at?: number;
    [key: string]: unknown;
  };
  // Legacy fields (may not exist in all entries)
  action?: string;
  action_title?: string;
  status?: string;
  points?: number;
  player?: string; // Deprecated: use userId
  created?: number; // Deprecated: use time
  updated?: number;
  delivery_id?: string; // Deprecated: use attributes.delivery_id
  delivery_title?: string; // Deprecated: use attributes.delivery_title
}

export type { ActivityListItem, ProcessListItem } from '@model/gamification-dashboard.model';

/** Uma página de `GET /game/reports/user-actions` para modais com «Carregar mais». */
export interface ActivityListReportsPageResult {
  items: ActivityListItem[];
  offset: number;
  limit: number;
  total?: number;
}

export interface TeamFinishedSummaryMonthResult {
  tarefasFinalizadas: number;
  deliveriesCount: number;
}

export interface TeamDailyFinishedStatsRow {
  day: string; // `YYYY-MM-DD`
  email?: string;
  tasksCount: number;
  pointsSum: number;
}

/** Opções de {@link ActionLogService.getProgressMetrics}. */
export interface GetProgressMetricsOptions {
  /**
   * Painel gamificação: não usa `GET /game/stats`, `GET /game/actions` nem `GET /game/reports/user-actions`
   * em {@link ActionLogService.getProgressMetrics} — apenas `finished/summary` (e season summary se aplicável).
   */
  gamificationDashboardReportsOnly?: boolean;
  /** Repete-se como `team_id` em GET `/game/*` **user-scoped** (ignorado quando {@link game4uTeamAggregate} está definido). */
  teamId?: string | number | null;
  /**
   * Painel equipa sem colaborador: com `team_id` BWA → `GET /game/reports/finished|open/summary`;
   * sem BWA → só `GET /game/team-stats` (sem `team-actions`, sem `/game/stats`).
   */
  game4uTeamAggregate?: { team: string; bwaTeamId?: string | number | null };
}

export interface ClienteListItem {
  cnpj: string;
  actions: ClienteActionItem[];
}

export interface ClienteActionItem {
  id: string;
  title: string; // attributes.acao
  player: string; // userId (email do executor)
  created: number; // timestamp
  status?: 'finalizado' | 'pendente' | 'dispensado'; // Status da tarefa
  /** Processo (delivery_title) quando vem do action_log */
  processTitle?: string;
  /** Pontos da user-action / relatório Game4U. */
  points?: number;
}

/** Página de tarefas (modal participação com `/game/reports/.../actions-by-delivery`). */
export interface ClienteActionItemsPage {
  items: ClienteActionItem[];
  total: number;
}

/** Opções para alinhar o aggregate ao mesmo critério da carteira (cnpj vs deal, escopo jogador/time). */
export interface GetActionsByCompanyKeyOptions {
  userId?: string;
  teamId?: string;
}

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

/**
 * Helper to extract timestamp from Funifier's time field
 * Funifier may return time as a number or as { $date: "ISO string" }
 */
function extractTimestamp(time: number | { $date: string } | undefined): number {
  if (!time) return 0;
  if (typeof time === 'number') return time;
  if (typeof time === 'object' && '$date' in time) {
    const date = new Date(time.$date);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

/** Valores para $in em attributes.cnpj e attributes.deal (Funifier pode gravar string ou número). */
function buildCompanyIdentifierVariants(raw: string): (string | number)[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];
  const out = new Set<string | number>();
  out.add(trimmed);
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && !Number.isNaN(asNum)) {
    out.add(asNum);
    out.add(String(asNum));
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits && digits !== trimmed) {
    out.add(digits);
    const dn = Number(digits);
    if (Number.isFinite(dn)) {
      out.add(dn);
    }
  }
  return [...out];
}

/** Cruza linha da carteira (CNPJ/deal) com attributes.cnpj / attributes.deal do action_log (string ou número). */
function actionLogEntryMatchesCompanyKey(entry: ActionLogEntry, companyKey: string): boolean {
  const variants = buildCompanyIdentifierVariants(companyKey);
  if (variants.length === 0) {
    return false;
  }

  const attrCnpj = entry.attributes?.cnpj;
  const attrDeal = entry.attributes?.deal;
  const candidates: unknown[] = [attrCnpj, attrDeal].filter(x => x != null && x !== '');

  for (const cand of candidates) {
    const asStr = String(cand).trim();
    const asNum = Number(asStr);
    for (const v of variants) {
      if (v === cand) {
        return true;
      }
      if (String(v) === asStr) {
        return true;
      }
      if (typeof v === 'number' && Number.isFinite(asNum) && !Number.isNaN(asNum) && v === asNum) {
        return true;
      }
    }
    const digitsCand = asStr.replace(/\D/g, '');
    if (digitsCand) {
      for (const v of variants) {
        const vs = String(v).replace(/\D/g, '');
        if (vs && digitsCand === vs) {
          return true;
        }
      }
    }
  }
  return false;
}

function mapGame4uStatusToClienteTaskStatus(
  status: string | undefined
): 'finalizado' | 'pendente' | 'dispensado' | undefined {
  const u = String(status ?? '').toUpperCase();
  if (u === 'DONE' || u === 'DELIVERED' || u === 'PAID') {
    return 'finalizado';
  }
  if (u === 'PENDING' || u === 'DOING') {
    return 'pendente';
  }
  if (u === 'CANCELLED' || u === 'LOST') {
    return 'dispensado';
  }
  return undefined;
}

/**
 * Helper to generate Funifier date expressions (relative or absolute)
 * Funifier supports: -0d-, -0d+, -1d-, -0M-, -0M+, -0y-, etc.
 * - `-0M-` = start of current month
 * - `-0M+` = end of current month
 * - `-1M-` = start of previous month
 * - `-1M+` = end of previous month
 * 
 * Also supports absolute dates: { $date: "2026-01-01T00:00:00.000Z" }
 * 
 * Logic:
 * - When month is undefined (Toda temporada), returns no date boundary (all data)
 * - When a specific month is selected, returns only that month's range
 */
function getRelativeDateExpression(month: Date | undefined, position: 'start' | 'end'): { $date: string } | number {
  // If month is undefined (Toda temporada), return extreme boundaries (effectively no filter)
  if (!month) {
    if (position === 'start') {
      return { $date: new Date('2000-01-01T00:00:00.000Z').toISOString() };
    } else {
      return { $date: new Date('2099-12-31T23:59:59.999Z').toISOString() };
    }
  }
  
  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();
  
  // Calculate the start or end of the selected month
  if (position === 'start') {
    const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0);
    return { $date: monthStart.toISOString() };
  } else {
    // End of the selected month
    const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999);
    return { $date: monthEnd.toISOString() };
  }
}

/**
 * Helper to get epoch milliseconds for a date position.
 * Used alongside getRelativeDateExpression to build $or queries
 * that match both { $date: "..." } and raw epoch number formats.
 */
function getEpochMs(month: Date | undefined, position: 'start' | 'end'): number {
  // If month is undefined (Toda temporada), return extreme boundaries (effectively no filter)
  if (!month) {
    if (position === 'start') {
      return 0;
    } else {
      return new Date('2099-12-31T23:59:59.999Z').getTime();
    }
  }

  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();

  if (position === 'start') {
    const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0);
    return monthStart.getTime();
  } else {
    const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999);
    return monthEnd.getTime();
  }
}

/**
 * Build a $match condition for the time field that handles both formats:
 * - { $date: "ISO string" } (BSON Date objects from Funifier)
 * - number (epoch milliseconds)
 * Uses $or to match documents regardless of which format their time field uses.
 * 
 * NOTE: This function is kept for reference but NO LONGER USED in aggregate queries.
 * Time filtering is now done on the frontend using filterByMonth().
 */
function buildTimeMatch(month: Date | undefined): Record<string, unknown> {
  const startDate = getRelativeDateExpression(month, 'start');
  const endDate = getRelativeDateExpression(month, 'end');
  const startMs = getEpochMs(month, 'start');
  const endMs = getEpochMs(month, 'end');

  return {
    $or: [
      { time: { $gte: startDate, $lte: endDate } },
      { time: { $gte: startMs, $lte: endMs } }
    ]
  };
}

/**
 * Filter an array of action log entries by month on the frontend.
 * If month is undefined (Toda temporada), returns ALL entries with no date filter.
 * If month is specified, returns only entries from that month.
 * 
 * @param entries - Array of entries with a 'time' field
 * @param month - Target month to filter by (undefined = all data, no filter)
 * @returns Filtered array of entries
 */
function filterByMonth<T extends { time?: number | { $date: string } }>(entries: T[], month: Date | undefined): T[] {
  if (!month) {
    console.warn('📊 filterByMonth: no month filter, returning all', entries.length, 'entries');
    return entries;
  }
  
  const targetMonthNum = month.getMonth();
  const targetYear = month.getFullYear();
  const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0).getTime();
  const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999).getTime();
  
  const filtered = entries.filter(entry => {
    const timestamp = extractTimestamp(entry.time);
    return timestamp >= monthStart && timestamp <= monthEnd;
  });
  
  console.warn('📊 filterByMonth:', targetYear, '-', targetMonthNum + 1, '→', filtered.length, '/', entries.length, 'entries');
  return filtered;
}

/**
 * Filter achievement entries by month on the frontend.
 * Achievement entries use 'time' field for timestamp.
 * 
 * @param entries - Array of achievement entries with a 'time' field
 * @param month - Target month to filter by (undefined = entire season)
 * @returns Filtered array of entries
 */
function filterAchievementsByMonth<T extends { time?: number | { $date: string } }>(entries: T[], month: Date | undefined): T[] {
  return filterByMonth(entries, month);
}

@Injectable({
  providedIn: 'root'
})
export class ActionLogService {
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes
  /**
   * Cache mais longo para relatórios Game4U (mês/time/colaborador).
   * Objetivo: evitar “rajadas” de requests ao alternar entre meses/abas.
   */
  private readonly GAME4U_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

  /**
   * Pontos exibidos no painel e modais: calculados no frontend — 3 por cada
   * registro de action_log no período (cada registro = uma tarefa/entrega logada).
   */
  private actionLogCache = new Map<string, CacheEntry<ActionLogEntry[]>>();
  private metricsCache = new Map<string, CacheEntry<{ activity: ActivityMetrics; processo: ProcessMetrics }>>();
  private activityCountCache = new Map<string, CacheEntry<number>>(); // Cache for activity counts
  private uniqueClientesCache = new Map<string, CacheEntry<number>>();
  private cnpjListWithCountCache = new Map<string, CacheEntry<{ cnpj: string; actionCount: number }[]>>();
  private activitiesByDayCache = new Map<string, CacheEntry<{ day: number; count: number }[]>>();
  private activitiesByProcessCache = new Map<string, CacheEntry<ActivityListItem[]>>();
  private processListCache = new Map<string, CacheEntry<ProcessListItem[]>>();
  private processFinalizationCache = new Map<string, CacheEntry<Set<number>>>();
  private actionsByCnpjCache = new Map<string, CacheEntry<ClienteActionItem[]>>();
  private processMetricsCache = new Map<string, CacheEntry<ProcessMetrics>>();
  private pontosForMonthCache = new Map<string, CacheEntry<number>>();
  private monthlyPointsBreakdownCache = new Map<string, CacheEntry<{ bloqueados: number; desbloqueados: number }>>();
  private game4uGoalMonthTargetCache = new Map<string, CacheEntry<number>>();
  private game4uTeamGoalMonthTargetCache = new Map<string, CacheEntry<number>>();
  private game4uSeasonSidebarDetailsCache = new Map<
    string,
    CacheEntry<{ tarefasFinalizadas: number; deliveryStatsTotal?: number }>
  >();
  private game4uPlayerDashboardSnapshotCache = new Map<
    string,
    CacheEntry<{ wallet: PointWallet; pontosActionLog: number; sidebar: { tarefasFinalizadas: number; deliveryStatsTotal?: number } }>
  >();
  private game4uTeamDashboardSnapshotCache = new Map<
    string,
    CacheEntry<{ wallet: PointWallet; pontosActionLog: number; sidebar: { tarefasFinalizadas: number; deliveryStatsTotal?: number } }>
  >();
  private game4uTeamFinishedSummaryForMonthCache = new Map<string, CacheEntry<TeamFinishedSummaryMonthResult>>();
  private game4uTeamDailyFinishedStatsCache = new Map<string, CacheEntry<TeamDailyFinishedStatsRow[]>>();

  constructor(
    private backendApi: BackendApiService,
    private game4u: Game4uApiService,
    private sessao: SessaoProvider
  ) {}

  private resolveGame4uUserEmail(playerId: string): string {
    const id = (playerId || '').trim();
    let out: string;
    if (!id || id === 'me') {
      out = (this.sessao.usuario?.email || '').trim();
    } else {
      out = id;
    }
    if (!out) {
      return '';
    }
    /** Alinha a `/game/*?user=` ao email normalizado do JWT (evita 403 por diferença de maiúsculas). */
    return out.includes('@') ? out.toLowerCase() : out;
  }

  private normalizeGame4uTeamId(teamId?: string | number | null): string | undefined {
    if (teamId == null) {
      return undefined;
    }
    const t = String(teamId).trim();
    return t !== '' ? t : undefined;
  }

  private game4uUserQuery(playerId: string, month?: Date): Game4uUserScopedQuery | null {
    const user = this.resolveGame4uUserEmail(playerId);
    if (!user) {
      return null;
    }
    return { user, ...this.game4u.toQueryRange(month) };
  }

  /**
   * Intervalo de `/game/actions` alinhado ao **mês do painel** (mesmo critério que {@link Game4uApiService.toQueryRange}
   * e `/game/stats`). O filtro por competência em `delivery_id` continua em
   * {@link filterGame4uActionsByCompetenceMonth} sobre a resposta.
   */
  private game4uUserQueryActionsForCompetenceMonth(playerId: string, month: Date): Game4uUserScopedQuery | null {
    const user = this.resolveGame4uUserEmail(playerId);
    if (!user) {
      return null;
    }
    return { user, ...this.game4u.toQueryRange(month) };
  }

  /**
   * Intervalo amplo (início da **campanha** até fim do mês do painel) para `/game/actions`, capturando linhas com
   * `extra.dr_prazo` na competência mesmo quando `created_at` está fora do mês.
   */
  private game4uUserQueryYearThroughMonthEnd(playerId: string, month: Date): Game4uUserScopedQuery | null {
    const user = this.resolveGame4uUserEmail(playerId);
    if (!user) {
      return null;
    }
    return { user, ...this.game4u.toCampaignStartThroughMonthEnd(month) };
  }

  /**
   * Âmbito equipa para `/game/actions` no modal «Clientes atendidos» (gestor sem colaborador selecionado).
   * Com `team_id`, o backend omite `user` na query; o campo `user` satisfaz o tipo e alinha ao JWT.
   */
  private game4uTeamQueryForModal(teamId: string, month?: Date): Game4uUserScopedQuery | null {
    const tid = this.normalizeGame4uTeamId(teamId);
    if (!tid) {
      return null;
    }
    const email = (this.sessao.usuario?.email || '').trim();
    if (!email) {
      return null;
    }
    const user = email.includes('@') ? email.toLowerCase() : email;
    const range =
      month != null
        ? this.game4u.toCampaignStartThroughMonthEnd(month)
        : this.game4u.toQueryRange(undefined);
    return { user, ...range, team_id: tid };
  }

  /**
   * Agrega todas as páginas de `GET /game/reports/user-actions` (até 500 itens por pedido).
   * Usa `total` na resposta, quando vier, para não pedir páginas em excesso.
   */
  private fetchGameReportsUserActionsAllPages(
    base: Omit<Game4uReportsUserActionsQuery, 'offset' | 'limit'>
  ): Observable<Game4uUserActionModel[]> {
    const pageSize = 500;
    /** Próximo offset pedido ao servidor (a resposta pode omitir `offset` ou vir sempre 0). */
    let nextRequestOffset = 0;
    let accumulatedItems = 0;
    return this.game4u.getGameReportsUserActions({ ...base, offset: 0, limit: pageSize }).pipe(
      expand(page => {
        accumulatedItems += page.items.length;
        const total = page.total;
        if (
          typeof total === 'number' &&
          Number.isFinite(total) &&
          total > 0 &&
          accumulatedItems >= total
        ) {
          return EMPTY;
        }
        if (!page.items.length || page.items.length < pageSize) {
          return EMPTY;
        }
        nextRequestOffset += page.items.length;
        return this.game4u.getGameReportsUserActions({
          ...base,
          offset: nextRequestOffset,
          limit: pageSize
        });
      }),
      reduce((acc, page) => acc.concat(page.items), [] as Game4uUserActionModel[])
    );
  }

  private mapGame4uUserActionModelToClienteItem(a: Game4uUserActionModel): ClienteActionItem {
    const raw = a as Record<string, unknown>;
    const titleAlt = typeof raw['title'] === 'string' ? String(raw['title']).trim() : '';
    const titleRaw =
      (typeof a.action_title === 'string' && a.action_title.trim()) || titleAlt || '';
    const timeRaw = a.finished_at ?? a.created_at ?? a.updated_at;
    const created = Date.parse(String(timeRaw)) || 0;
    const idRaw = String(a.id ?? '').trim();
    const id =
      idRaw ||
      `rpt-${created}-${titleRaw.slice(0, 48)}-${String(a.user_email ?? '').slice(0, 64)}`;
    const pts = a.points;
    const points =
      typeof pts === 'number' && Number.isFinite(pts)
        ? pts
        : pts != null && String(pts).trim() !== ''
          ? Number(pts)
          : undefined;
    return {
      id,
      title: titleRaw || 'Ação',
      player: String(a.user_email ?? ''),
      created,
      processTitle: (typeof a.delivery_title === 'string' && a.delivery_title.trim()) || undefined,
      status:
        mapGame4uStatusToClienteTaskStatus(a.status) ??
        (a.finished_at != null && String(a.finished_at).trim() !== '' ? 'finalizado' : undefined),
      ...(points != null && Number.isFinite(points) ? { points } : {})
    };
  }

  /**
   * Meta de pontos do mês (`GET /game/reports/goal/month/summary`) para o circular de metas.
   */
  getMonthlyPointsGoalTarget(
    playerId: string,
    month: Date,
    teamId?: string | number | null
  ): Observable<number> {
    const email = this.resolveGame4uUserEmail(playerId);
    if (!email || !(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return of(0);
    }
    const tid = this.normalizeGame4uTeamId(teamId);
    const { start, end } = this.game4u.toDtPrazoMonthRange(month);
    const cacheKey = `g4u_goal_month_target_${email}_${tid ?? 'no-team'}_${this.getMonthCacheKey(month)}`;
    const cached = this.getCachedData(this.game4uGoalMonthTargetCache, cacheKey, this.GAME4U_CACHE_DURATION);
    if (cached) {
      return cached;
    }

    const request$ = this.game4u
      .getGameReportsGoalMonthSummary({
        email,
        dt_prazo_start: start,
        dt_prazo_end: end,
        ...(tid ? { team_id: tid } : {})
      })
      .pipe(
        map((res: Game4uGoalMonthSummaryResponse) => {
          const n = Number(res.points_sum ?? res.total_points ?? res.goal_points ?? 0);
          return Number.isFinite(n) ? Math.floor(n) : 0;
        }),
        catchError(err => {
          console.error('Error fetching goal/month summary:', err);
          return of(0);
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.GAME4U_CACHE_DURATION })
      );

    this.setCachedData(this.game4uGoalMonthTargetCache, cacheKey, request$);
    return request$;
  }

  /**
   * Meta de pontos do mês agregada da equipa (`GET /game/reports/goal/month/summary` só com `team_id`).
   */
  getMonthlyTeamGoalPointsTarget(bwaTeamScopeId: string, month: Date): Observable<number> {
    const tid = this.normalizeGame4uTeamId(bwaTeamScopeId);
    if (!tid || !(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return of(0);
    }
    const { start, end } = this.game4u.toDtPrazoMonthRange(month);
    const cacheKey = `g4u_team_goal_month_target_${tid}_${this.getMonthCacheKey(month)}`;
    const cached = this.getCachedData(this.game4uTeamGoalMonthTargetCache, cacheKey, this.GAME4U_CACHE_DURATION);
    if (cached) {
      return cached;
    }

    const request$ = this.game4u
      .getGameReportsGoalMonthSummary({
        team_id: tid,
        dt_prazo_start: start,
        dt_prazo_end: end
      })
      .pipe(
        map((res: Game4uGoalMonthSummaryResponse) => {
          const n = Number(res.points_sum ?? res.total_points ?? res.goal_points ?? 0);
          return Number.isFinite(n) ? Math.floor(n) : 0;
        }),
        catchError(err => {
          console.error('Error fetching team goal/month summary:', err);
          return of(0);
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.GAME4U_CACHE_DURATION })
      );

    this.setCachedData(this.game4uTeamGoalMonthTargetCache, cacheKey, request$);
    return request$;
  }

  private getMonthCacheKey(month?: Date): string {
    if (!month) {
      return 'season';
    }
    return `${month.getFullYear()}-${month.getMonth()}`;
  }

  private readonly PAGE_SIZE = 100; // Funifier pagination limit

  /**
   * Get ALL action log entries for a player (no time filtering in aggregate)
   * Time filtering is done on the frontend based on selected month
   * Uses userId field to match the user's email
   * Note: action_log uses 'time' field for timestamp, not 'created'
   * 
   * IMPORTANT: Uses pagination to handle players with 100+ action logs
   * Funifier limits to 100 items per request by default
   */
  getPlayerActionLogForMonth(playerId: string, month?: Date): Observable<ActionLogEntry[]> {
    // Cache key without month - we fetch ALL data and filter on frontend
    const cacheKey = `${playerId}_all_actions`;
    const cached = this.getCachedData(this.actionLogCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch all action logs using pagination
    const request$ = this.fetchAllActionLogsPaginated(playerId).pipe(
      map(response => {
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error('Error fetching action log:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionLogCache, cacheKey, request$);
    return request$;
  }

  /**
   * Fetch all action logs for a player using Range header pagination
   * Funifier Range header format: items={{offset}}-{{count}}
   * Example: items=0-100, items=100-100, items=200-100
   * Keeps fetching until we get less than PAGE_SIZE items
   */
  private fetchAllActionLogsPaginated(playerId: string): Observable<ActionLogEntry[]> {
    return this.fetchActionLogPage(playerId, 0).pipe(
      switchMap(firstPage => {
        // If first page has less than PAGE_SIZE, we have all data
        if (firstPage.length < this.PAGE_SIZE) {
          return of(firstPage);
        }

        // Need to fetch more pages
        return this.fetchRemainingPages(playerId, firstPage);
      }),
      catchError(error => {
        console.error('Error fetching action logs:', error);
        return of([]);
      })
    );
  }

  /**
   * Recursively fetch remaining pages until we get less than PAGE_SIZE
   */
  private fetchRemainingPages(playerId: string, accumulatedLogs: ActionLogEntry[], pageIndex: number = 1): Observable<ActionLogEntry[]> {
    return this.fetchActionLogPage(playerId, pageIndex).pipe(
      switchMap(page => {
        const allLogs = [...accumulatedLogs, ...page];
        
        // If this page has less than PAGE_SIZE, we're done
        if (page.length < this.PAGE_SIZE) {
          // Sort by time descending
          allLogs.sort((a, b) => extractTimestamp(b.time) - extractTimestamp(a.time));
          return of(allLogs);
        }

        // Fetch next page
        return this.fetchRemainingPages(playerId, allLogs, pageIndex + 1);
      })
    );
  }

  /**
   * Fetch a single page of action logs using Range header
   * Funifier Range format: items={{offset}}-{{count}}
   */
  private fetchActionLogPage(playerId: string, pageIndex: number): Observable<ActionLogEntry[]> {
    const offset = pageIndex * this.PAGE_SIZE;
    
    const aggregateBody = [
      { $match: { userId: playerId } },
      { $sort: { time: -1 } }
    ];

    return this.backendApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody,
      { headers: { 'Range': `items=${offset}-${this.PAGE_SIZE}` } }
    ).pipe(
      map(response => {
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error(`Error fetching action log page ${pageIndex}:`, error);
        return of([]);
      })
    );
  }

  /**
   * Get count of activities finalizadas
   * Now uses getPlayerActionLogForMonth (which fetches ALL data) and filters on frontend
   */
  getAtividadesFinalizadas(playerId: string, month?: Date): Observable<number> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of(0);
      }
      return this.game4u.getGameStats(q).pipe(
        map(s => {
          if (s.action_stats != null) {
            return getGame4uActionStatsDone(s).count;
          }
          return Math.floor(Number(s.total_actions) || 0);
        }),
        catchError(error => {
          console.error('Error fetching Game4U activity count:', error);
          return of(0);
        })
      );
    }

    // Use the main action log method and filter by month on frontend
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        return filtered.length;
      }),
      catchError(error => {
        console.error('Error fetching activity count:', error);
        return of(0);
      })
    );
  }

  /**
   * Alias for getAtividadesFinalizadas for backward compatibility
   */
  getCompletedTasksCount(playerId: string, month?: Date): Observable<number> {
    return this.getAtividadesFinalizadas(playerId, month);
  }

  /**
   * Dados do card «Progresso da temporada»: Game4U via `GET /game/reports/finished/summary`;
   * Funifier: só contagem de tarefas (action_log).
   */
  getSeasonProgressSidebarDetails(
    playerId: string,
    month?: Date,
    teamId?: string | number | null
  ): Observable<{ tarefasFinalizadas: number; deliveryStatsTotal?: number }> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of({ tarefasFinalizadas: 0 });
      }
      const email = this.resolveGame4uUserEmail(playerId);
      if (!email) {
        return of({ tarefasFinalizadas: 0 });
      }
      const tid = this.normalizeGame4uTeamId(teamId);
      // Painel gamificação: só `GET /game/reports/finished/summary` (sem `GET /game/stats`).
      const cacheKey = `g4u_season_sidebar_${email}_${tid ?? 'no-team'}_${this.getMonthCacheKey(month)}`;
      const cached = this.getCachedData(
        this.game4uSeasonSidebarDetailsCache,
        cacheKey,
        this.GAME4U_CACHE_DURATION
      );
      if (cached) {
        return cached;
      }

      const request$ = this.game4u
        .getGameReportsFinishedSummary({
          email,
          finished_at_start: q.start,
          finished_at_end: q.end,
          ...(tid ? { team_id: tid } : {})
        })
        .pipe(
          map(summary => {
            const tarefasFinalizadas = Math.floor(Number(summary.tasks_count) || 0);
            const dc = Math.floor(Number(summary.deliveries_count) || 0);
            return {
              tarefasFinalizadas,
              ...(dc > 0 ? { deliveryStatsTotal: dc } : {})
            };
          }),
          catchError(error => {
            console.error('Error fetching season sidebar stats (Game4U):', error);
            return of({ tarefasFinalizadas: 0 });
          }),
          shareReplay({ bufferSize: 1, refCount: true, windowTime: this.GAME4U_CACHE_DURATION })
        );

      this.setCachedData(this.game4uSeasonSidebarDetailsCache, cacheKey, request$);
      return request$;
    }
    return this.getCompletedTasksCount(playerId, month).pipe(
      map(tarefasFinalizadas => ({ tarefasFinalizadas }))
    );
  }

  /**
   * Snapshot Game4U para carteira + sidebar no painel de gamificação.
   * Usa apenas `GET /game/reports/finished/summary` na temporada (sem `GET /game/stats` nem `GET /game/actions`).
   */
  getMonthlyGame4uPlayerDashboardData(
    playerId: string,
    month?: Date,
    teamId?: string | number | null
  ): Observable<{
    wallet: PointWallet;
    pontosActionLog: number;
    sidebar: { tarefasFinalizadas: number; deliveryStatsTotal?: number };
  }> {
    if (!(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return throwError(
        () => new Error('[ActionLog] getMonthlyGame4uPlayerDashboardData: Game4U indisponível')
      );
    }
    const q = this.game4uUserQuery(playerId, month);
    if (!q) {
      return of({
        wallet: { moedas: 0, bloqueados: 0, desbloqueados: 0 },
        pontosActionLog: 0,
        sidebar: { tarefasFinalizadas: 0 }
      });
    }
    const tid = this.normalizeGame4uTeamId(teamId);
    const seasonRange = this.game4u.toQueryRange(undefined);
    const cacheKey = `g4u_player_dashboard_snapshot_${q.user}_${tid ?? 'no-team'}`;
    const cached = this.getCachedData(
      this.game4uPlayerDashboardSnapshotCache,
      cacheKey,
      this.GAME4U_CACHE_DURATION
    );
    if (cached) {
      return cached;
    }

    const request$ = this.game4u
      .getGameReportsFinishedSummary({
        email: q.user,
        finished_at_start: seasonRange.start,
        finished_at_end: seasonRange.end,
        ...(tid ? { team_id: tid } : {})
      })
      .pipe(
        map(seasonSummary => {
          const tasks = Math.floor(Number(seasonSummary.tasks_count) || 0);
          const deliveries = Math.floor(Number(seasonSummary.deliveries_count) || 0);
          const pts = Math.floor(Number(seasonSummary.points_sum) || 0);
          const wallet: PointWallet = { moedas: 0, bloqueados: 0, desbloqueados: pts };
          const deliveryStatsTotal = deliveries > 0 ? deliveries : undefined;
          return {
            wallet,
            pontosActionLog: pts,
            sidebar:
              deliveryStatsTotal !== undefined
                ? { tarefasFinalizadas: tasks, deliveryStatsTotal }
                : { tarefasFinalizadas: tasks }
          };
        }),
        catchError(error => {
          console.error('Error in getMonthlyGame4uPlayerDashboardData (Game4U reports-only):', error);
          return of({
            wallet: { moedas: 0, bloqueados: 0, desbloqueados: 0 },
            pontosActionLog: 0,
            sidebar: { tarefasFinalizadas: 0 }
          });
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.GAME4U_CACHE_DURATION })
      );

    this.setCachedData(this.game4uPlayerDashboardSnapshotCache, cacheKey, request$);
    return request$;
  }

  /**
   * Snapshot Game4U para sidebar do **painel de equipa** (vista agregada sem colaborador):
   * `GET /game/reports/finished/summary` com `team_id` (= id BWA da equipa), sem `email`.
   */
  getMonthlyGame4uTeamDashboardData(bwaTeamScopeId: string): Observable<{
    wallet: PointWallet;
    pontosActionLog: number;
    sidebar: { tarefasFinalizadas: number; deliveryStatsTotal?: number };
  }> {
    if (!(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return throwError(
        () => new Error('[ActionLog] getMonthlyGame4uTeamDashboardData: Game4U indisponível')
      );
    }
    const tid = (bwaTeamScopeId || '').trim();
    if (!tid) {
      return of({
        wallet: { moedas: 0, bloqueados: 0, desbloqueados: 0 },
        pontosActionLog: 0,
        sidebar: { tarefasFinalizadas: 0 }
      });
    }
    const seasonRange = this.game4u.toQueryRange(undefined);
    const cacheKey = `g4u_team_dashboard_snapshot_${tid}`;
    const cached = this.getCachedData(
      this.game4uTeamDashboardSnapshotCache,
      cacheKey,
      this.GAME4U_CACHE_DURATION
    );
    if (cached) {
      return cached;
    }

    const request$ = this.game4u
      .getGameReportsFinishedSummary({
        team_id: tid,
        finished_at_start: seasonRange.start,
        finished_at_end: seasonRange.end
      })
      .pipe(
        map(summary => {
          const tasks = Math.floor(Number(summary.tasks_count) || 0);
          const deliveries = Math.floor(Number(summary.deliveries_count) || 0);
          const pts = Math.floor(Number(summary.points_sum) || 0);
          const wallet: PointWallet = { moedas: 0, bloqueados: 0, desbloqueados: pts };
          return {
            wallet,
            pontosActionLog: pts,
            sidebar:
              deliveries > 0
                ? { tarefasFinalizadas: tasks, deliveryStatsTotal: deliveries }
                : { tarefasFinalizadas: tasks }
          };
        }),
        catchError(error => {
          console.error('Error in getMonthlyGame4uTeamDashboardData (Game4U reports):', error);
          return of({
            wallet: { moedas: 0, bloqueados: 0, desbloqueados: 0 },
            pontosActionLog: 0,
            sidebar: { tarefasFinalizadas: 0 }
          });
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.GAME4U_CACHE_DURATION })
      );

    this.setCachedData(this.game4uTeamDashboardSnapshotCache, cacheKey, request$);
    return request$;
  }

  /**
   * Game4U (reports): `GET /game/reports/finished/summary` no mês selecionado, escopo equipa (`team_id`), sem `email`.
   * Usado para o contador «Clientes atendidos este mês» (deliveries_count) no painel de equipa.
   */
  getTeamFinishedSummaryForMonth(
    bwaTeamScopeId: string,
    month: Date
  ): Observable<TeamFinishedSummaryMonthResult> {
    if (!(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return throwError(() => new Error('[ActionLog] getTeamFinishedSummaryForMonth: Game4U indisponível'));
    }
    const tid = (bwaTeamScopeId || '').trim();
    if (!tid) {
      return of({ tarefasFinalizadas: 0, deliveriesCount: 0 });
    }
    const range = this.game4u.toQueryRange(month);
    const cacheKey = `g4u_team_finished_summary_month_${tid}_${this.getMonthCacheKey(month)}`;
    const cached = this.getCachedData(
      this.game4uTeamFinishedSummaryForMonthCache,
      cacheKey,
      this.GAME4U_CACHE_DURATION
    );
    if (cached) {
      return cached;
    }

    const request$ = this.game4u
      .getGameReportsFinishedSummary({
        team_id: tid,
        finished_at_start: range.start,
        finished_at_end: range.end
      })
      .pipe(
        map(summary => ({
          tarefasFinalizadas: Math.floor(Number(summary.tasks_count) || 0),
          deliveriesCount: Math.floor(Number(summary.deliveries_count) || 0)
        })),
        catchError(error => {
          console.error('Error in getTeamFinishedSummaryForMonth:', error);
          return of({ tarefasFinalizadas: 0, deliveriesCount: 0 });
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.GAME4U_CACHE_DURATION })
      );

    this.setCachedData(this.game4uTeamFinishedSummaryForMonthCache, cacheKey, request$);
    return request$;
  }

  /**
   * Game4U (reports): daily stats de tarefas finalizadas por equipa (e opcionalmente por colaborador),
   * usado na aba “Análise de Produtividade”.
   */
  getReportTeamDailyFinishedStats(
    q: Game4uReportsTeamDailyFinishedStatsQuery
  ): Observable<TeamDailyFinishedStatsRow[]> {
    if (!(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return throwError(
        () => new Error('[ActionLog] getReportTeamDailyFinishedStats: Game4U indisponível')
      );
    }
    const tid = (q.team_id ?? '').trim();
    if (!tid) {
      return of([]);
    }
    const statusKey = Array.isArray(q.status) ? q.status.join(',') : '';
    const cacheKey = `g4u_team_daily_finished_${tid}_${String(q.email ?? '')}_${String(q.start ?? '')}_${String(
      q.end ?? ''
    )}_${statusKey}_${String(q.offset ?? '')}_${String(q.limit ?? '')}`;
    const cached = this.getCachedData(
      this.game4uTeamDailyFinishedStatsCache,
      cacheKey,
      this.GAME4U_CACHE_DURATION
    );
    if (cached) {
      return cached;
    }

    const request$ = this.game4u.getGameReportsTeamDailyFinishedStats(q).pipe(
      map(rows => this.normalizeTeamDailyFinishedStatsRows(rows)),
      catchError(err => {
        console.error('Error in getReportTeamDailyFinishedStats:', err);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.GAME4U_CACHE_DURATION })
    );

    this.setCachedData(this.game4uTeamDailyFinishedStatsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Normaliza a resposta do daily finished stats:
   * - Formato aninhado: `{ stats: [{ date, users: [{ email, total_actions, total_points }], ... }] }`
   * - Formato legado: array plano de linhas `{ day|date, email?, tasks_count?, points_sum? }`
   */
  private normalizeTeamDailyFinishedStatsRows(body: unknown): TeamDailyFinishedStatsRow[] {
    if (body && typeof body === 'object' && Array.isArray((body as { stats?: unknown }).stats)) {
      return this.normalizeTeamDailyFinishedStatsNested(
        (body as { stats: unknown[] }).stats
      );
    }
    if (Array.isArray(body)) {
      return this.normalizeTeamDailyFinishedStatsFlatArray(body);
    }
    return [];
  }

  /** `stats[]` do payload aninhado (ver `exemplo-resposta-get-daily-finished-stats.md`). */
  private normalizeTeamDailyFinishedStatsNested(stats: unknown[]): TeamDailyFinishedStatsRow[] {
    const out: TeamDailyFinishedStatsRow[] = [];
    for (const raw of stats) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const dayRaw =
        (typeof o['date'] === 'string' && (o['date'] as string).trim()) ||
        (typeof o['day'] === 'string' && (o['day'] as string).trim()) ||
        '';
      const day = this.toYmdDay(dayRaw);
      if (!day) continue;

      const users = o['users'];
      if (Array.isArray(users) && users.length > 0) {
        for (const u of users) {
          if (!u || typeof u !== 'object') continue;
          const ur = u as Record<string, unknown>;
          const email =
            (typeof ur['email'] === 'string' && (ur['email'] as string).trim()) ||
            (typeof ur['user_email'] === 'string' && (ur['user_email'] as string).trim()) ||
            '';
          if (!email) continue;
          const tasksCount = Math.max(
            0,
            Math.floor(
              Number(
                ur['total_actions'] ??
                  ur['totalActions'] ??
                  ur['tasks_count'] ??
                  ur['actions_count'] ??
                  0
              ) || 0
            )
          );
          const pointsSum = Math.max(
            0,
            Math.floor(
              Number(
                ur['total_points'] ?? ur['totalPoints'] ?? ur['points_sum'] ?? ur['points'] ?? 0
              ) || 0
            )
          );
          out.push({ day, email, tasksCount, pointsSum });
        }
      } else {
        const tasksCount = Math.max(
          0,
          Math.floor(
            Number(o['total_actions'] ?? o['totalActions'] ?? o['tasks_count'] ?? 0) || 0
          )
        );
        const pointsSum = Math.max(
          0,
          Math.floor(Number(o['total_points'] ?? o['totalPoints'] ?? o['points_sum'] ?? 0) || 0)
        );
        if (tasksCount > 0 || pointsSum > 0) {
          out.push({ day, email: undefined, tasksCount, pointsSum });
        }
      }
    }
    return out;
  }

  private normalizeTeamDailyFinishedStatsFlatArray(rows: unknown[]): TeamDailyFinishedStatsRow[] {
    const out: TeamDailyFinishedStatsRow[] = [];
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;

      const dayRaw =
        (typeof o['day'] === 'string' && (o['day'] as string).trim()) ||
        (typeof o['date'] === 'string' && (o['date'] as string).trim()) ||
        (typeof o['dt'] === 'string' && (o['dt'] as string).trim()) ||
        (typeof o['finished_day'] === 'string' && (o['finished_day'] as string).trim()) ||
        (typeof o['finished_date'] === 'string' && (o['finished_date'] as string).trim()) ||
        '';

      const day = this.toYmdDay(dayRaw);
      if (!day) continue;

      const email =
        (typeof o['email'] === 'string' && (o['email'] as string).trim()) ||
        (typeof o['user_email'] === 'string' && (o['user_email'] as string).trim()) ||
        (typeof o['user'] === 'string' && (o['user'] as string).trim()) ||
        undefined;

      const tasksCount = Math.max(
        0,
        Math.floor(
          Number(
            o['tasks_count'] ??
              o['tasksCount'] ??
              o['count'] ??
              o['actions_count'] ??
              o['actionsCount'] ??
              o['total_actions'] ??
              o['totalActions'] ??
              0
          ) || 0
        )
      );
      const pointsSum = Math.max(
        0,
        Math.floor(
          Number(
            o['points_sum'] ??
              o['pointsSum'] ??
              o['points'] ??
              o['total_points'] ??
              o['totalPoints'] ??
              0
          ) || 0
        )
      );

      out.push({ day, email, tasksCount, pointsSum });
    }
    return out;
  }

  private toYmdDay(raw: string): string | null {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    // If it already looks like YYYY-MM-DD, keep it.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  /**
   * Todas as user-actions Game4U com o mesmo `delivery_id` (intervalo alinhado ao mês do painel ou temporada).
   */
  getGame4uUserActionsForDeliveryId(
    playerId: string,
    deliveryId: string,
    month?: Date,
    teamId?: string | number | null
  ): Observable<ClienteActionItem[]> {
    const id = (deliveryId || '').trim();
    if (!id || !(isGame4uDataEnabled() && this.game4u.isConfigured())) {
      return of([]);
    }
    const tid = this.normalizeGame4uTeamId(teamId);
    const qBase =
      month != null
        ? this.game4uUserQueryActionsForCompetenceMonth(playerId, month)
        : this.game4uUserQuery(playerId, month);
    const qActions =
      qBase != null ? ({ ...qBase, ...(tid ? { team_id: tid } : {}) } as Game4uUserScopedQuery) : null;
    if (!qActions) {
      return of([]);
    }
    return this.game4u.getGameActions(qActions).pipe(
      map(actions => {
        const scoped =
          month != null
            ? filterGame4uActionsByCompetenceMonth(actions, month)
            : filterGame4uActionsByMonth(actions, month);
        const rows = scoped.filter(a => String(a.delivery_id ?? '').trim() === id);
        rows.sort((a, b) => {
          const ta = Date.parse(String(a.created_at));
          const tb = Date.parse(String(b.created_at));
          return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
        });
        return rows.map(a => ({
          id: a.id,
          title:
            (typeof a.action_title === 'string' && a.action_title.trim()) || 'Ação',
          player: String(a.user_email ?? ''),
          created: Date.parse(String(a.created_at)) || 0,
          processTitle:
            (typeof a.delivery_title === 'string' && a.delivery_title.trim()) || undefined,
          status: mapGame4uStatusToClienteTaskStatus(a.status)
        }));
      }),
      catchError(error => {
        console.error('Error fetching Game4U actions by delivery_id:', error);
        return of([]);
      })
    );
  }

  /**
   * Tarefas Game4U para o modal de detalhe da linha «Clientes atendidos»:
   * mesmo intervalo e filtro de mês que a lista (finished_at + status final), e critério de linha
   * por `delivery_title` no relatório (intervalo + email); `delivery_id` da linha não é enviado na query.
   */
  getGame4uUserActionsForParticipationModal(
    playerId: string,
    row: {
      cnpj: string;
      deliveryId?: string;
      delivery_extra_cnpj?: string;
      delivery_title?: string;
      loadTasksViaGameReports?: boolean;
    },
    month?: Date,
    page?: { offset: number; limit: number },
    teamId?: string | number | null
  ): Observable<ClienteActionItemsPage> {
    if (!isGame4uDataEnabled() || !this.game4u.isConfigured()) {
      return of({ items: [], total: 0 });
    }
    const tid = this.normalizeGame4uTeamId(teamId);
    const teamExtras = tid ? { team_id: tid } : {};
    const title = row.delivery_title?.trim();
    if (row.loadTasksViaGameReports && title && month != null) {
      /** Modal equipa passa `playerId` `'me'` + `team_id`; não enviar `email` (consolidado). Com utilizador real + `team_id`, mantém-se o e-mail. */
      const pid = String(playerId ?? '').trim();
      const email =
        tid && pid === 'me' ? undefined : this.resolveGame4uUserEmail(playerId);
      if (!tid && !email) {
        return of({ items: [], total: 0 });
      }
      const rng = this.game4u.toQueryRange(month);
      const offset = page?.offset ?? 0;
      const limit = page?.limit ?? 25;
      return this.game4u
        .getGameReportsFinishedActionsByDelivery({
          ...(email ? { email } : {}),
          finished_at_start: rng.start,
          finished_at_end: rng.end,
          delivery_title: title,
          offset,
          limit,
          ...teamExtras
        })
        .pipe(
          map(p => ({
            items: (p.items || []).map(a => this.mapGame4uUserActionModelToClienteItem(a)),
            total: p.total
          })),
          catchError(err => {
            console.error('Error fetching actions-by-delivery (modal):', err);
            return of({ items: [], total: 0 });
          })
        );
    }
    const qBase = tid
      ? this.game4uTeamQueryForModal(tid, month ?? undefined)
      : month != null
        ? this.game4uUserQueryYearThroughMonthEnd(playerId, month)
        : this.game4uUserQuery(playerId, month);
    const qActions =
      qBase != null ? ({ ...qBase, ...teamExtras } as Game4uUserScopedQuery) : null;
    if (!qActions) {
      return of({ items: [], total: 0 });
    }
    return this.game4u.getGameActions(qActions).pipe(
      map(actions => {
        let scoped = actions.filter(a => isGame4uUserActionFinalizedStatus(a.status));
        if (month != null) {
          const start = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0).getTime();
          const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
          scoped = scoped.filter(a => {
            const t = getGame4uUserActionFinishedOrFallbackMs(a);
            return t != null && t >= start && t <= end;
          });
        }
        const matched = scoped.filter(a => game4uActionMatchesParticipacaoModalRow(a, row));
        matched.sort((a, b) => {
          const ta = Date.parse(String(a.created_at));
          const tb = Date.parse(String(b.created_at));
          return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
        });
        const items = matched.map(a => this.mapGame4uUserActionModelToClienteItem(a));
        return { items, total: items.length };
      }),
      catchError(error => {
        console.error('Error fetching Game4U actions for participação modal:', error);
        return of({ items: [], total: 0 });
      })
    );
  }

  /**
   * Get ALL achievements for a player (no time filtering in aggregate)
   * Time filtering is done on the frontend based on selected month
   * Cached with shareReplay to avoid duplicate requests
   * Uses pagination with Range header to handle 100+ achievements
   */
  private getAllAchievements(playerId: string): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    const cacheKey = `${playerId}_all_achievements`;
    const cached = this.getCachedData(this.pontosForMonthCache as any, cacheKey);
    if (cached) {
      return cached as any;
    }

    const request$ = this.fetchAllAchievementsPaginated(playerId).pipe(
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.pontosForMonthCache as any, cacheKey, request$ as any);
    return request$;
  }

  /**
   * Fetch all achievements for a player using Range header pagination
   * Funifier Range header format: items={{offset}}-{{count}}
   */
  private fetchAllAchievementsPaginated(playerId: string): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    return this.fetchAchievementPage(playerId, 0).pipe(
      switchMap(firstPage => {
        if (firstPage.length < this.PAGE_SIZE) {
          return of(firstPage);
        }
        return this.fetchRemainingAchievementPages(playerId, firstPage);
      }),
      catchError(error => {
        console.error('Error fetching achievements:', error);
        return of([]);
      })
    );
  }

  /**
   * Recursively fetch remaining achievement pages
   */
  private fetchRemainingAchievementPages(
    playerId: string, 
    accumulatedAchievements: { _id: string; item: string; total: number; time?: number | { $date: string } }[], 
    pageIndex: number = 1
  ): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    return this.fetchAchievementPage(playerId, pageIndex).pipe(
      switchMap(page => {
        const allAchievements = [...accumulatedAchievements, ...page];
        
        if (page.length < this.PAGE_SIZE) {
          return of(allAchievements);
        }

        return this.fetchRemainingAchievementPages(playerId, allAchievements, pageIndex + 1);
      })
    );
  }

  /**
   * Fetch a single page of achievements using Range header
   */
  private fetchAchievementPage(playerId: string, pageIndex: number): Observable<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]> {
    const offset = pageIndex * this.PAGE_SIZE;
    
    const aggregateBody = [
      {
        $match: {
          player: playerId,
          type: 0 // type 0 = points
        }
      },
      {
        $project: {
          item: 1,
          total: 1,
          time: 1
        }
      }
    ];

    return this.backendApi.post<{ _id: string; item: string; total: number; time?: number | { $date: string } }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody,
      { headers: { 'Range': `items=${offset}-${this.PAGE_SIZE}` } }
    ).pipe(
      map(response => {
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error(`Error fetching achievement page ${pageIndex}:`, error);
        return of([]);
      })
    );
  }

  /**
   * Get monthly points breakdown (blocked and unlocked)
   * Fetches ALL achievements and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getMonthlyPointsBreakdown(
    playerId: string,
    month?: Date,
    teamId?: string | number | null
  ): Observable<{ bloqueados: number; desbloqueados: number }> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of({ bloqueados: 0, desbloqueados: 0 });
      }
      const tid = this.normalizeGame4uTeamId(teamId);
      return this.game4u.getGameStats(tid ? { ...q, team_id: tid } : q).pipe(
        map(stats => {
          const w = mapGame4uStatsToPointWallet(stats);
          return { bloqueados: w.bloqueados, desbloqueados: w.desbloqueados };
        }),
        catchError(error => {
          console.error('Error in getMonthlyPointsBreakdown (Game4U):', error);
          return of({ bloqueados: 0, desbloqueados: 0 });
        })
      );
    }

    return this.getAllAchievements(playerId).pipe(
      map(achievements => {
        // Filter by month on frontend
        const filtered = filterAchievementsByMonth(achievements, month);
        
        let bloqueados = 0;
        let desbloqueados = 0;

        filtered.forEach(item => {
          if (item.item === 'locked_points' || item.item === 'bloqueados') {
            bloqueados += item.total || 0;
          } else if (item.item === 'points' || item.item === 'unlocked_points' || item.item === 'desbloqueados') {
            desbloqueados += item.total || 0;
          }
        });

        return { bloqueados, desbloqueados };
      }),
      catchError(error => {
        console.error('Error fetching monthly points breakdown:', error);
        return of({ bloqueados: 0, desbloqueados: 0 });
      })
    );
  }

  /**
   * Pontos do período: calculados no frontend como
   * `atividades no action_log (mês/temporada) × PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG`.
   * Não consulta mais achievement/delivery_ids no Funifier.
   */
  getPontosForMonth(playerId: string, month?: Date): Observable<number> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of(0);
      }
      return this.game4u.getGameStats(q).pipe(
        map(s =>
          s.action_stats != null
            ? getGame4uActionStatsDone(s).totalPoints
            : mapGame4uStatsToActivityMetrics(s).pontos
        ),
        catchError(error => {
          console.error('Error in getPontosForMonth (Game4U):', error);
          return of(0);
        })
      );
    }

    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        const total = filtered.length * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG;
        return total;
      }),
      catchError(error => {
        console.error('Error in getPontosForMonth:', error);
        return of(0);
      })
    );
  }

  /**
   * Get unique CNPJs count from user's action_log
   * Fetches ALL action logs and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getUniqueClientesCount(playerId: string, month?: Date): Observable<number> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      return this.getPlayerCnpjListWithCount(playerId, month).pipe(
        map(rows => rows.length),
        catchError(error => {
          console.error('Error counting unique clientes (Game4U):', error);
          return of(0);
        })
      );
    }

    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Filter by month on frontend
        const filtered = filterByMonth(actions, month);
        
        // Count unique CNPJs
        const uniqueCnpjs = new Set(
          filtered
            .map(a => a.attributes?.cnpj)
            .filter((cnpj): cnpj is string => cnpj != null)
        );
        
        return uniqueCnpjs.size;
      }),
      catchError(error => {
        console.error('Error counting unique CNPJs:', error);
        return of(0);
      })
    );
  }

  /**
   * Get process metrics for a player
   * A Process is identified by unique attributes.delivery_id (number) in action_log
   * Process is Finalizado if there's a "desbloquear" action with attributes.delivery = delivery_id
   * Otherwise it's Pendente/Incompleto
   * Fetches ALL data and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessMetrics(playerId: string, month?: Date): Observable<ProcessMetrics> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
      }
      return this.game4u.getGameActions(q).pipe(
        map(actions =>
          mapGame4uActionsToProcessMetrics(filterGame4uActionsByMonth(actions, month))
        ),
        catchError(error => {
          console.error('Error calculating process metrics (Game4U):', error);
          return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
        })
      );
    }

    const cacheKey = `${playerId}_all_process_metrics`;
    const cached = this.getCachedData(this.processMetricsCache, cacheKey);
    if (cached) {
      // If we have cached data, filter by month on frontend
      return cached.pipe(
        map((metrics: ProcessMetrics) => metrics) // Return as-is, filtering happens in getProgressMetrics
      );
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Filter by month on frontend
        const filtered = filterByMonth(userActions, month);
        
        // Get unique delivery_ids from user's actions (attributes.delivery_id is a number)
        const deliveryIds = [...new Set(
          filtered
            .map(a => a.attributes?.delivery_id)
            .filter((id): id is number => id != null)
        )];

        if (deliveryIds.length === 0) {
          return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
        }

        // Query action_log for "desbloquear" actions with matching delivery_ids
        // Note: actionId field contains the action type, attributes.delivery matches delivery_id
        // NO time filtering here - we check if ANY desbloquear exists for these delivery_ids
        const aggregateBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];

        return this.backendApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const desbloqueadosIds = new Set(desbloqueados.map(d => d._id));
            
            // Count finalizadas (have desbloquear action)
            const finalizadas = deliveryIds.filter(id => desbloqueadosIds.has(id)).length;
            
            // Count pendentes/incompletas (don't have desbloquear action)
            const pendentesIncompletas = deliveryIds.length - finalizadas;

            return {
              pendentes: pendentesIncompletas,
              incompletas: 0, // Combined with pendentes
              finalizadas
            };
          }),
          catchError(error => {
            console.error('Error fetching desbloquear actions:', error);
            return of({ pendentes: deliveryIds.length, incompletas: 0, finalizadas: 0 });
          })
        );
      }),
      catchError(error => {
        console.error('Error calculating process metrics:', error);
        return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.processMetricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get activity and process metrics for a player
   * This provides data for "Meu Progresso" section
   * - Atividades: Finalizadas (count of action_log entries), Pontos (from achievement)
   * - Processos: Finalizados, Pendentes/Incompletos (based on desbloquear action)
   * Funifier: dados amplos e filtro por mês no cliente.
   * Game4U com mês selecionado: pontos e processos usam competência em `delivery_id` (`{id}-{YYYY-MM-DD}`), não só `created_at`.
   *
   * {@link GetProgressMetricsOptions.gamificationDashboardReportsOnly}: painel gamificação evita
   * `GET /game/stats`, `GET /game/actions` e **`GET /game/reports/user-actions`** neste método — só relatórios agregados.
   *
   * Vista equipa (`game4uTeamAggregate` + `team_id` BWA): `finished/summary` + `open/summary` no mês
   * (sem `GET /game/team-actions`). Sem BWA: só `GET /game/team-stats` (não é `/game/stats`).
   */
  getProgressMetrics(
    playerId: string,
    month?: Date,
    opts?: GetProgressMetricsOptions
  ): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const teamAgg = opts?.game4uTeamAggregate;
      if (teamAgg && (teamAgg.team || '').trim() && month != null) {
        const teamKey = teamAgg.team.trim();
        const bwa = this.normalizeGame4uTeamId(teamAgg.bwaTeamId);
        const finishedRange = this.game4u.toQueryRange(month);
        const dp = this.game4u.toDtPrazoMonthRange(month);

        if (bwa) {
          return forkJoin({
            finished: this.game4u
              .getGameReportsFinishedSummary({
                team_id: bwa,
                finished_at_start: finishedRange.start,
                finished_at_end: finishedRange.end
              })
              .pipe(
                catchError(err => {
                  console.warn('getProgressMetrics (team finished/summary):', err);
                  return of({ tasks_count: 0, points_sum: 0, deliveries_count: 0 });
                })
              ),
            open: this.game4u
              .getGameReportsOpenSummary({
                team_id: bwa,
                dt_prazo_start: dp.start,
                dt_prazo_end: dp.end
              })
              .pipe(
                catchError(err => {
                  console.warn('getProgressMetrics (team open/summary):', err);
                  return of({ tasks_count: 0, delivery_count: 0 });
                })
              )
          }).pipe(
            map(({ finished, open }) => {
              const pendingFromReport = Math.floor(Number(open.tasks_count) || 0);
              const finalizadas = Math.floor(Number(finished.tasks_count) || 0);
              const pts = Math.floor(Number(finished.points_sum) || 0);
              const procFin = Math.floor(Number(finished.deliveries_count) || 0);
              const openDel = Math.floor(Number(open.delivery_count) || 0);
              const processo: ProcessMetrics = {
                pendentes: 0,
                incompletas: openDel,
                finalizadas: procFin
              };
              return {
                activity: {
                  pendentes: pendingFromReport,
                  emExecucao: 0,
                  finalizadas,
                  pontos: pts,
                  pontosDone: pts,
                  pontosTodosStatus: pts
                },
                processo
              };
            }),
            catchError(err => {
              console.error('getProgressMetrics (Game4U team reports):', err);
              return of({
                activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
                processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
              });
            })
          );
        }

        const range = this.game4u.toQueryRange(month);
        const statsQuery: Game4uTeamScopedQuery = {
          team: teamKey,
          start: range.start,
          end: range.end
        };
        return this.game4u.getGameTeamStats(statsQuery).pipe(
          map(stats => {
            const tpm = mapGame4uStatsToTeamProgressMetrics(stats);
            const activity = mapGame4uStatsToActivityMetrics(stats);
            const processo: ProcessMetrics = {
              pendentes: 0,
              incompletas: tpm.processosIncompletos,
              finalizadas: tpm.processosFinalizados
            };
            return { activity, processo };
          }),
          catchError(err => {
            console.error('getProgressMetrics (Game4U team-stats only):', err);
            return of({
              activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
              processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
            });
          })
        );
      }

      const reportsOnly = !!opts?.gamificationDashboardReportsOnly;
      const tid = this.normalizeGame4uTeamId(opts?.teamId);
      const teamExtras = tid ? { team_id: tid } : {};
      const qStatsBase = this.game4uUserQuery(playerId, month);
      const qActionsBase =
        month != null ? this.game4uUserQueryYearThroughMonthEnd(playerId, month) : qStatsBase;
      const qStats =
        qStatsBase != null ? ({ ...qStatsBase, ...teamExtras } as Game4uUserScopedQuery) : null;
      const qActions =
        qActionsBase != null ? ({ ...qActionsBase, ...teamExtras } as Game4uUserScopedQuery) : null;
      if (!qStats || !qActions) {
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }
      const email = this.resolveGame4uUserEmail(playerId);
      const finishedMonthRange = month != null ? this.game4u.toQueryRange(month) : null;
      const summaryRangeForPending =
        finishedMonthRange ?? (qStats ? { start: qStats.start, end: qStats.end } : null);

      let dtPrazoOpenSummary: Game4uReportsOpenSummaryQuery | null = null;
      if (email && month != null) {
        const dp = this.game4u.toDtPrazoMonthRange(month);
        dtPrazoOpenSummary = { email, dt_prazo_start: dp.start, dt_prazo_end: dp.end, ...teamExtras };
      } else if (email && summaryRangeForPending) {
        dtPrazoOpenSummary = {
          email,
          dt_prazo_start: summaryRangeForPending.start,
          dt_prazo_end: summaryRangeForPending.end,
          ...teamExtras
        };
      }

      const stats$: Observable<Game4uUserActionStatsResponse | null> = reportsOnly
        ? of(null)
        : this.game4u.getGameStats(qStats);

      const seasonSummary$ =
        reportsOnly && month == null && email
          ? this.game4u
              .getGameReportsFinishedSummary({
                email,
                finished_at_start: qStats.start,
                finished_at_end: qStats.end,
                ...teamExtras
              })
              .pipe(
                catchError(err => {
                  console.warn('Error fetching season finished summary (progress metrics):', err);
                  return of({ tasks_count: 0, points_sum: 0, deliveries_count: 0 });
                })
              )
          : of(null);

      return forkJoin({
        summary:
          email && finishedMonthRange
            ? this.game4u
                .getGameReportsFinishedSummary({
                  email,
                  finished_at_start: finishedMonthRange.start,
                  finished_at_end: finishedMonthRange.end,
                  ...teamExtras
                })
                .pipe(
                  catchError(err => {
                    console.warn('Error fetching finished summary (progress metrics):', err);
                    return of({ tasks_count: 0, points_sum: 0, deliveries_count: 0 });
                  })
                )
            : of({ tasks_count: 0, points_sum: 0, deliveries_count: 0 }),
        pendingSummary:
          dtPrazoOpenSummary != null
            ? this.game4u
                .getGameReportsOpenSummary(dtPrazoOpenSummary)
                .pipe(
                  catchError(err => {
                    console.warn('Error fetching open summary (progress metrics):', err);
                    return of({ tasks_count: 0, delivery_count: 0 });
                  })
                )
            : of({ tasks_count: 0, delivery_count: 0 }),
        seasonSummary: seasonSummary$,
        stats: stats$
      }).pipe(
        switchMap(({ summary, pendingSummary, seasonSummary, stats }) => {
          /**
           * Painel gamificação (reports-only): não chamar `GET /game/reports/user-actions` aqui — o intervalo
           * «campanha → fim do mês» (`toCampaignStartThroughMonthEnd`) gerava um GET largo desnecessário no load;
           * atividade e pendentes vêm de `finished/summary`, temporada de `seasonSummary`; processo por entrega fica vazio.
           */
          if (reportsOnly) {
            return of({
              summary,
              pendingSummary,
              seasonSummary,
              stats,
              actions: [] as Game4uUserActionModel[]
            });
          }

          return this.game4u.getGameActions(qActions).pipe(
            map(actions => ({ summary, pendingSummary, seasonSummary, stats, actions }))
          );
        }),
        map(({ summary, pendingSummary, seasonSummary, stats, actions }) => {
          const pendingFromReport = Math.floor(Number(pendingSummary.tasks_count) || 0);
          const statsMissing = stats == null;
          if (month != null) {
            const byCompetence = filterGame4uActionsByCompetenceMonth(actions, month);
            const processoFromActions = mapGame4uActionsToProcessMetrics(byCompetence);
            const fromReportTasks = Math.floor(Number(summary.tasks_count) || 0);
            const fromReportPts = Math.floor(Number(summary.points_sum) || 0);
            const fromReportDel = Math.floor(Number(summary.deliveries_count) || 0);
            const openDel = Math.floor(Number(pendingSummary.delivery_count) || 0);
            const hasActionProcessoDetail =
              processoFromActions.finalizadas > 0 ||
              processoFromActions.incompletas > 0 ||
              processoFromActions.pendentes > 0;
            const processo: ProcessMetrics = hasActionProcessoDetail
              ? processoFromActions
              : { pendentes: 0, incompletas: openDel, finalizadas: fromReportDel };
            if (fromReportTasks > 0 || fromReportPts > 0 || fromReportDel > 0) {
              return {
                activity: {
                  pendentes: pendingFromReport,
                  emExecucao: 0,
                  finalizadas: fromReportTasks,
                  pontos: fromReportPts,
                  pontosDone: fromReportPts,
                  pontosTodosStatus: fromReportPts
                },
                processo
              };
            }
            const drPrazoMetaBoost = computeGame4uDrPrazoMetaBoost(actions, month);
            if (!statsMissing) {
              const circular = getGame4uMonthlyPointsCircularFromActionStats(
                stats as Game4uUserActionStatsResponse
              );
              if (circular) {
                return {
                  activity: {
                    pendentes: pendingFromReport,
                    emExecucao: 0,
                    finalizadas: circular.finalizadas,
                    pontos: circular.pontosDone,
                    pontosDone: circular.pontosDone,
                    pontosTodosStatus: circular.pontosTodosStatus + drPrazoMetaBoost
                  },
                  processo
                };
              }
            }
            const pts = computeMonthlyPointsFromGame4uActions(byCompetence);
            return {
              activity: {
                pendentes: pendingFromReport,
                emExecucao: 0,
                finalizadas: pts.finalizadas,
                pontos: pts.pontos,
                pontosDone: pts.pontosDone,
                pontosTodosStatus: pts.pontosTodosStatus + drPrazoMetaBoost
              },
              processo
            };
          }
          const scoped = filterGame4uActionsByMonth(actions, month);
          if (statsMissing) {
            if (!month && seasonSummary) {
              const st = Math.floor(Number(seasonSummary.tasks_count) || 0);
              const sp = Math.floor(Number(seasonSummary.points_sum) || 0);
              if (st > 0 || sp > 0) {
                const processo = mapGame4uActionsToProcessMetrics(scoped);
                return {
                  activity: {
                    pendentes: pendingFromReport,
                    emExecucao: 0,
                    finalizadas: st,
                    pontos: sp,
                    pontosDone: sp,
                    pontosTodosStatus: sp
                  },
                  processo
                };
              }
            }
            const processo = mapGame4uActionsToProcessMetrics(scoped);
            let finalizadas = 0;
            let pontosDone = 0;
            let pontosTodos = 0;
            for (const a of scoped) {
              const st = String(a.status ?? '').toUpperCase();
              const p = Math.floor(Number(a.points) || 0);
              pontosTodos += p;
              if (st === 'DONE' || st === 'DELIVERED' || st === 'PAID') {
                finalizadas++;
                if (st === 'DONE') {
                  pontosDone += p;
                }
              }
            }
            return {
              activity: {
                pendentes: pendingFromReport,
                emExecucao: 0,
                finalizadas,
                pontos: pontosDone,
                pontosDone,
                pontosTodosStatus: pontosTodos
              },
              processo
            };
          }
          const done = getGame4uActionStatsDone(stats as Game4uUserActionStatsResponse);
          const finalizadas =
            stats!.action_stats != null
              ? done.count
              : Math.floor(Number(stats!.total_actions) || scoped.length);
          const pontos =
            stats!.action_stats != null
              ? done.totalPoints
              : mapGame4uStatsToActivityMetrics(stats as Game4uUserActionStatsResponse).pontos;
          const processo = mapGame4uActionsToProcessMetrics(scoped);
          const fromStats = mapGame4uStatsToActivityMetrics(stats as Game4uUserActionStatsResponse);
          return {
            activity: {
              pendentes: pendingFromReport,
              emExecucao: 0,
              finalizadas,
              pontos,
              pontosDone: fromStats.pontosDone,
              pontosTodosStatus: fromStats.pontosTodosStatus
            },
            processo
          };
        }),
        catchError(error => {
          console.error('Error calculating progress metrics (Game4U):', error);
          return of({
            activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
            processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
          });
        })
      );
    }

    // Cache key without month - we fetch ALL data
    const cacheKey = `metrics_${playerId}_all`;
    
    // Note: We don't cache the final result because month filtering happens here
    // The underlying methods (getAtividadesFinalizadas, getPontosForMonth, getProcessMetrics) 
    // already cache their raw data

    return forkJoin({
      finalizadas: this.getAtividadesFinalizadas(playerId, month),
      pontos: this.getPontosForMonth(playerId, month),
      processo: this.getProcessMetrics(playerId, month)
    }).pipe(
      map(({ finalizadas, pontos, processo }) => ({
        activity: {
          pendentes: 0, // Not used anymore
          emExecucao: 0, // Not used anymore
          finalizadas,
          pontos
        },
        processo
      })),
      catchError(error => {
        console.error('Error calculating progress metrics:', error);
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      })
    );
  }

  /**
   * Get list of activities for modal display
   * Returns list with attributes.acao as title
   * Fetches ALL data and filters by month on frontend
   * @param game4uActionStatus `DONE` usa `GET /game/reports/user-actions` com `DONE`+`DELIVERED` (todas as páginas); sem status definido, `GET /game/actions` (ex.: modal «Pontos»).
   * @param reportUserActionsStatuses Se definido (ex. `PENDING`+`DOING` ou `DONE`+`DELIVERED`), usa só `GET /game/reports/user-actions` com esses status (todas as páginas agregadas), com `dt_prazo_*` para só abertas e `finished_at_*` para finalizadas/outros.
   */
  getActivityList(
    playerId: string,
    month?: Date,
    game4uActionStatus?: Game4uUserActionStatus,
    reportUserActionsStatuses?: Game4uUserActionStatus[],
    teamId?: string | number | null
  ): Observable<ActivityListItem[]> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const baseQ = this.game4uUserQuery(playerId, month);
      if (!baseQ) {
        return of([]);
      }
      const tid = this.normalizeGame4uTeamId(teamId);
      if (reportUserActionsStatuses?.length) {
        const openOnly =
          reportUserActionsStatuses.every(s => s === 'PENDING' || s === 'DOING');
        const dtPrazoRange =
          month != null
            ? this.game4u.toDtPrazoMonthRange(month)
            : { start: baseQ.start, end: baseQ.end };
        const pageQuery: Omit<Game4uReportsUserActionsQuery, 'offset' | 'limit'> = openOnly
          ? {
              email: baseQ.user,
              status: reportUserActionsStatuses,
              dt_prazo_start: dtPrazoRange.start,
              dt_prazo_end: dtPrazoRange.end,
              ...(tid ? { team_id: tid } : {})
            }
          : {
              email: baseQ.user,
              status: reportUserActionsStatuses,
              finished_at_start: baseQ.start,
              finished_at_end: baseQ.end,
              ...(tid ? { team_id: tid } : {})
            };
        return this.fetchGameReportsUserActionsAllPages(pageQuery).pipe(
          map(actions =>
            mapGame4uActionsToActivityList(actions, month, openOnly ? { monthFilter: 'dtPrazo' } : undefined)
          ),
          catchError(error => {
            console.error('Error fetching activity list (Game4U reports/user-actions):', error);
            return of([]);
          })
        );
      }
      if (game4uActionStatus === 'DONE') {
        return this.fetchGameReportsUserActionsAllPages({
          email: baseQ.user,
          status: ['DONE', 'DELIVERED'],
          finished_at_start: baseQ.start,
          finished_at_end: baseQ.end,
          ...(tid ? { team_id: tid } : {})
        }).pipe(
          map(actions => mapGame4uActionsToActivityList(actions, month)),
          catchError(error => {
            console.error('Error fetching activity list (Game4U reports/user-actions):', error);
            return of([]);
          })
        );
      }
      const q = game4uActionStatus ? { ...baseQ, status: game4uActionStatus } : baseQ;
      const qScoped = tid ? ({ ...q, team_id: tid } as typeof q & { team_id: string }) : q;
      return this.game4u.getGameActions(qScoped).pipe(
        map(actions => mapGame4uActionsToActivityList(actions, month)),
        catchError(error => {
          console.error('Error fetching activity list (Game4U):', error);
          return of([]);
        })
      );
    }

    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        
        return filtered.map(a => ({
          id: a._id,
          title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
          delivery_title: a.attributes?.delivery_title || undefined,
          points: PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG,
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          player: a.userId || '',
          cnpj: a.attributes?.cnpj || undefined
        }));
      }),
      catchError(error => {
        console.error('Error fetching activity list:', error);
        return of([]);
      })
    );
  }

  /** Indica se o modal pode paginar `GET /game/reports/user-actions` (Game4U ativo). */
  canPaginateGame4uActivityReports(): boolean {
    return isGame4uDataEnabled() && this.game4u.isConfigured();
  }

  /**
   * Uma página de tarefas via `GET /game/reports/user-actions` (offset/limit; máx. 500).
   * Mesmos filtros que {@link getActivityList} com `reportUserActionsStatuses` definido.
   */
  getActivityListReportsPage(
    playerId: string,
    month: Date | undefined,
    reportUserActionsStatuses: Game4uUserActionStatus[],
    offset: number,
    limit: number,
    teamId?: string | number | null
  ): Observable<ActivityListReportsPageResult> {
    if (!isGame4uDataEnabled() || !this.game4u.isConfigured()) {
      return throwError(
        () => new Error('[ActionLog] getActivityListReportsPage requer Game4U configurado.')
      );
    }
    if (!reportUserActionsStatuses?.length) {
      return throwError(() => new Error('[ActionLog] getActivityListReportsPage: informe status.'));
    }
    const baseQ = this.game4uUserQuery(playerId, month);
    const lim = Math.min(Math.max(Math.floor(limit), 1), 500);
    const off = Math.max(0, Math.floor(offset));
    if (!baseQ) {
      return of({ items: [], offset: off, limit: lim });
    }
    const tid = this.normalizeGame4uTeamId(teamId);
    const openOnly = reportUserActionsStatuses.every(s => s === 'PENDING' || s === 'DOING');
    const dtPrazoRange =
      month != null
        ? this.game4u.toDtPrazoMonthRange(month)
        : { start: baseQ.start, end: baseQ.end };
    const pageQuery: Game4uReportsUserActionsQuery = openOnly
      ? {
          email: baseQ.user,
          status: reportUserActionsStatuses,
          dt_prazo_start: dtPrazoRange.start,
          dt_prazo_end: dtPrazoRange.end,
          ...(tid ? { team_id: tid } : {}),
          offset: off,
          limit: lim
        }
      : {
          email: baseQ.user,
          status: reportUserActionsStatuses,
          finished_at_start: baseQ.start,
          finished_at_end: baseQ.end,
          ...(tid ? { team_id: tid } : {}),
          offset: off,
          limit: lim
        };

    return this.game4u.getGameReportsUserActions(pageQuery).pipe(
      map(page => ({
        items: mapGame4uActionsToActivityList(
          page.items,
          month,
          openOnly ? { monthFilter: 'dtPrazo' } : undefined
        ),
        offset: page.offset,
        limit: page.limit,
        ...(page.total != null && Number.isFinite(page.total) ? { total: page.total } : {})
      })),
      catchError(error => {
        console.error('Error fetching activity list page (Game4U reports/user-actions):', error);
        return of({ items: [], offset: off, limit: lim });
      })
    );
  }

  /**
   * Get list of processes for modal display
   * Groups by attributes.delivery_id (number), shows attributes.delivery_title and action count
   * Note: delivery_id is a number in attributes, not a string
   * Fetches ALL data and filters by month on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessList(
    playerId: string,
    month?: Date,
    teamId?: string | number | null
  ): Observable<ProcessListItem[]> {
    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const q = this.game4uUserQuery(playerId, month);
      if (!q) {
        return of([]);
      }
      const tid = this.normalizeGame4uTeamId(teamId);
      const qScoped = tid ? ({ ...q, team_id: tid } as typeof q & { team_id: string }) : q;
      return this.game4u.getGameActions(qScoped).pipe(
        map(actions => mapGame4uActionsToProcessList(actions, month)),
        catchError(error => {
          console.error('Error fetching process list (Game4U):', error);
          return of([]);
        })
      );
    }

    // Cache key without month - we fetch ALL data
    const cacheKey = `${playerId}_all_process_list`;
    const cached = this.getCachedData(this.processListCache, cacheKey);
    if (cached) {
      // Filter cached data by month on frontend
      return cached.pipe(
        map((processes: ProcessListItem[]) => processes) // Return as-is, data already filtered in request
      );
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Filter by month on frontend
        const filtered = filterByMonth(userActions, month);
        
        // Group actions by attributes.delivery_id (number)
        const deliveryMap = new Map<number, { title: string; count: number; cnpj?: string }>();
        
        filtered.forEach(action => {
          const deliveryId = action.attributes?.delivery_id;
          if (deliveryId != null) {
            const existing = deliveryMap.get(deliveryId);
            if (existing) {
              existing.count++;
              // Update CNPJ if not set yet and this action has one
              if (!existing.cnpj && action.attributes?.cnpj) {
                existing.cnpj = action.attributes.cnpj;
              }
            } else {
              deliveryMap.set(deliveryId, {
                title: action.attributes?.delivery_title || `Processo ${deliveryId}`,
                count: 1,
                cnpj: action.attributes?.cnpj
              });
            }
          }
        });

        const deliveryIds = [...deliveryMap.keys()];
        

        if (deliveryIds.length === 0) {
          return of([]);
        }

        // Check which processes are finalized (have desbloquear action with matching attributes.delivery)
        // NO time filtering here - we check if ANY desbloquear exists
        const aggregateBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];

        return this.backendApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const finalizedIds = new Set(desbloqueados.map(d => d._id));
            return deliveryIds.map(deliveryId => {
              const info = deliveryMap.get(deliveryId)!;
              return {
                deliveryId: String(deliveryId),
                title: info.title,
                actionCount: info.count,
                isFinalized: finalizedIds.has(deliveryId),
                cnpj: info.cnpj
              };
            });
          }),
          catchError(() => {
            // If desbloquear query fails, return all as not finalized
            return of(deliveryIds.map(deliveryId => {
              const info = deliveryMap.get(deliveryId)!;
              return {
                deliveryId: String(deliveryId),
                title: info.title,
                actionCount: info.count,
                isFinalized: false,
                cnpj: info.cnpj
              };
            }));
          })
        );
      }),
      catchError(error => {
        console.error('Error fetching process list:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.processListCache, cacheKey, request$);
    return request$;
  }

  /**
   * Lista de clientes (CNPJ) com contagem de ações no período.
   * Funifier: action_log filtrado por mês no cliente (`time`).
   * Game4U com mês: user-actions **finalizadas** com competência no mês (`finished_at`, ou `updated_at`/`created_at`
   * se `finished_at` ausente), agrupadas por **`delivery_id`** (uma linha por entrega), senão por CPF/CNPJ em
   * `extra.cnpj`, senão pela chave de participação — evita duplicar a mesma entrega quando há várias user-actions
   * com `integration_id` distinto.
   * Temporada: entregas (`/game/deliveries`).
   */
  getPlayerCnpjListWithCount(
    playerId: string,
    month?: Date,
    teamId?: string | number | null
  ): Observable<
    {
      cnpj: string;
      actionCount: number;
      delivery_title?: string;
      deliveryId?: string;
      /** `extra.cnpj` na entrega / user-action (distinguir títulos repetidos). */
      delivery_extra_cnpj?: string;
      /** Origem: `GET /game/reports/finished/deliveries` (detalhe = `actions-by-delivery`). */
      fromGameReportsDeliveries?: boolean;
      loadTasksViaGameReports?: boolean;
    }[]
  > {
      // Month must be part of the key: the inner map closes over `month` when the cached observable is built.
      const monthKey = this.getMonthCacheKey(month);
      const tidKey = this.normalizeGame4uTeamId(teamId) ?? '';
      const cacheKey = `${playerId}_cnpj_list_count_${monthKey}_${tidKey}_ad`;
      const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
      if (cached) {
        return cached;
      }

      if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
        if (month != null) {
          const user = this.resolveGame4uUserEmail(playerId);
          if (!user) {
            return of([]);
          }
          const range = this.game4u.toQueryRange(month);
          const tid = this.normalizeGame4uTeamId(teamId);
          const request$ = this.game4u
            .getGameReportsFinishedDeliveries({
              email: user,
              finished_at_start: range.start,
              finished_at_end: range.end,
              ...(tid ? { team_id: tid } : {})
            })
            .pipe(
              map(finishedRows => {
                const rows: {
                  cnpj: string;
                  actionCount: number;
                  delivery_title?: string;
                  deliveryId?: string;
                  fromGameReportsDeliveries?: boolean;
                  loadTasksViaGameReports?: boolean;
                }[] = [];
                const seen = new Set<string>();
                for (const row of finishedRows || []) {
                  const title = row.delivery_title?.trim() || '';
                  const did = row.delivery_id?.trim() || '';
                  const dedupeKey = did || title;
                  if (!dedupeKey || seen.has(dedupeKey)) {
                    continue;
                  }
                  seen.add(dedupeKey);
                  rows.push({
                    cnpj: did ? `g4u-rpt:${did}` : `g4u-rpt:${title}`,
                    actionCount: 0,
                    delivery_title: title || undefined,
                    ...(did ? { deliveryId: did } : {}),
                    fromGameReportsDeliveries: true,
                    loadTasksViaGameReports: true
                  });
                }
                return rows;
              }),
              catchError(error => {
                console.error('Error fetching finished deliveries (participação):', error);
                return of([]);
              }),
              shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
            );
          this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
          return request$;
        }

        const q = this.game4uUserQuery(playerId, month);
        if (!q) {
          return of([]);
        }
        const tid = this.normalizeGame4uTeamId(teamId);
        const qDel = tid ? ({ ...q, team_id: tid } as Game4uUserScopedQuery) : q;
        const request$ = forkJoin({
          done: this.game4u.getGameActions({ ...qDel, status: 'DONE' }),
          delivered: this.game4u.getGameActions({ ...qDel, status: 'DELIVERED' })
        }).pipe(
          map(({ done, delivered }) =>
            mapGame4uUserActionsToParticipacaoCnpjRows([...(done || []), ...(delivered || [])])
          ),
          catchError(error => {
            console.error('Error fetching player actions for participação (Game4U):', error);
            return of([]);
          }),
          shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
        );
        this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
        return request$;
      }

      // NO time filtering - fetch ALL action logs and filter on frontend
      const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
        map(actions => {
          // Filter by month on frontend
          const filtered = filterByMonth(actions, month);
          
          // Group by CNPJ and count
          const cnpjMap = new Map<string, number>();
          filtered.forEach(action => {
            const cnpj = action.attributes?.cnpj;
            if (cnpj) {
              cnpjMap.set(cnpj, (cnpjMap.get(cnpj) || 0) + 1);
            }
          });
          
          const result = Array.from(cnpjMap.entries()).map(([cnpj, count]) => ({
            cnpj,
            actionCount: count
          }));
          
          return result;
        }),
        catchError(error => {
          console.error('Error fetching player CNPJs with count:', error);
          return of([]);
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
      );

      this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
      return request$;
    }


  /**
   * Get list of unique CNPJs from player's action_log
   * Uses userId field and time field with Funifier relative dates
   */
  getPlayerCnpjList(playerId: string, month?: Date): Observable<string[]> {
    return this.getPlayerCnpjListWithCount(playerId, month).pipe(
      map(items => items.map(i => i.cnpj))
    );
  }

  /**
   * Get list of unique CNPJs from player's action_log WITHOUT filtering by executor,
   * aggregated across ALL users (matches modal-company-carteira-detail behavior).
   *
   * IMPORTANT: this method is intended for "carteira list" counters; it counts
   * all actions (independent of status) for the given CNPJ ids.
   * 
   * NO time filtering in aggregate - filtering done on frontend
   */
  getCnpjListWithCountForAllExecutors(
    cnpjList: string[],
    month?: Date
  ): Observable<{ cnpj: string; actionCount: number }[]> {
    const normalized = Array.from(new Set((cnpjList || []).filter(Boolean))).map(String);
    const monthKey = this.getMonthCacheKey(month);
    const cacheKey = `all_global_cnpj_list_count_${monthKey}_${normalized.sort().join(',')}`;

    const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    if (normalized.length === 0) {
      return of([]);
    }

    // NO time filtering - fetch ALL actions for these CNPJs
    const actionCountBody = [
      {
        $match: {
          'attributes.cnpj': { $in: normalized }
        }
      },
      {
        $project: {
          cnpj: '$attributes.cnpj',
          time: 1
        }
      }
    ];

    const request$ = this.backendApi.post<{ _id: string; cnpj: string; time?: number | { $date: string } }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      actionCountBody
    ).pipe(
      map(actionResponse => {
        // Filter by month on frontend
        const filtered = filterByMonth(actionResponse as any, month);
        
        // Group by CNPJ and count
        const cnpjMap = new Map<string, number>();
        filtered.forEach((action: any) => {
          const cnpj = action.cnpj;
          if (cnpj) {
            cnpjMap.set(cnpj, (cnpjMap.get(cnpj) || 0) + 1);
          }
        });
        
        return Array.from(cnpjMap.entries()).map(([cnpj, count]) => ({
          cnpj,
          actionCount: count
        }));
      }),
      catchError(error => {
        console.error('Error fetching global CNPJ counts:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    // Cache using existing cache map.
    this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
    return request$;
  }

  /**
   * Game4U (mês definido): uma página de `GET /game/reports/finished/deliveries` para «Clientes atendidos».
   * Retorna no mesmo formato usado por {@link getPlayerCnpjListWithCount} quando `fromGameReportsDeliveries` é true.
   */
  getPlayerFinishedDeliveriesParticipacaoPage(
    playerId: string,
    month: Date | undefined,
    offset: number,
    limit: number,
    teamId?: string | number | null
  ): Observable<{ items: { cnpj: string; actionCount: number; delivery_title?: string; deliveryId?: string; fromGameReportsDeliveries?: boolean; loadTasksViaGameReports?: boolean }[]; offset: number; limit: number; total?: number }> {
    if (!isGame4uDataEnabled() || !this.game4u.isConfigured() || month == null) {
      return of({ items: [], offset: Math.max(0, Math.floor(offset)), limit: Math.max(1, Math.floor(limit)) });
    }
    const user = this.resolveGame4uUserEmail(playerId);
    if (!user) {
      return of({ items: [], offset: Math.max(0, Math.floor(offset)), limit: Math.max(1, Math.floor(limit)) });
    }
    const range = this.game4u.toQueryRange(month);
    const tid = this.normalizeGame4uTeamId(teamId);
    const off = Math.max(0, Math.floor(offset));
    const lim = Math.min(Math.max(Math.floor(limit), 1), 500);

    return this.game4u
      .getGameReportsFinishedDeliveriesPage({
        email: user,
        finished_at_start: range.start,
        finished_at_end: range.end,
        ...(tid ? { team_id: tid } : {}),
        offset: off,
        limit: lim
      })
      .pipe(
        map(page => {
          const rows: {
            cnpj: string;
            actionCount: number;
            delivery_title?: string;
            deliveryId?: string;
            fromGameReportsDeliveries?: boolean;
            loadTasksViaGameReports?: boolean;
          }[] = [];
          const seen = new Set<string>();
          for (const row of page.items || []) {
            const title = row.delivery_title?.trim() || '';
            const did = row.delivery_id?.trim() || '';
            const dedupeKey = did || title;
            if (!dedupeKey || seen.has(dedupeKey)) {
              continue;
            }
            seen.add(dedupeKey);
            rows.push({
              cnpj: did ? `g4u-rpt:${did}` : `g4u-rpt:${title}`,
              actionCount: 0,
              delivery_title: title || undefined,
              ...(did ? { deliveryId: did } : {}),
              fromGameReportsDeliveries: true,
              loadTasksViaGameReports: true
            });
          }
          return {
            items: rows,
            offset: page.offset ?? off,
            limit: page.limit ?? lim,
            ...(page.total != null ? { total: page.total } : {})
          };
        }),
        catchError(error => {
          console.error('Error fetching finished deliveries page (participação):', error);
          return of({ items: [], offset: off, limit: lim });
        })
      );
  }

  /**
   * Tarefas da empresa cruzadas com POST `action_log/aggregate?strict=true`.
   * O identificador da linha da carteira pode ser `attributes.cnpj` ou `attributes.deal` (ex.: aggregate da equipa).
   * Filtro de mês no cliente (filterByMonth), como nas outras leituras de action_log.
   */
  getActionsByCnpj(
    companyKey: string,
    month?: Date,
    options?: GetActionsByCompanyKeyOptions
  ): Observable<ClienteActionItem[]> {
    const monthKey = this.getMonthCacheKey(month);
    const optUser = options?.userId?.trim() || '';
    const optTeam = options?.teamId?.trim() || '';
    const cacheKey = `${companyKey}_actions_company_${monthKey}_u_${optUser || 'all'}_t_${optTeam || 'all'}`;
    const cached = this.getCachedData(this.actionsByCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    const variants = buildCompanyIdentifierVariants(companyKey);
    if (variants.length === 0) {
      return of([]);
    }

    const companyOr = {
      $or: [
        { 'attributes.cnpj': { $in: variants } },
        { 'attributes.deal': { $in: variants } }
      ]
    };

    let aggregateBody: object[];
    if (optUser) {
      aggregateBody = [
        { $match: { $and: [companyOr, { userId: optUser }] } },
        { $sort: { time: -1 } },
        { $limit: 1000 }
      ];
    } else if (optTeam) {
      aggregateBody = [
        {
          $lookup: {
            from: 'player',
            localField: 'userId',
            foreignField: '_id',
            as: 'playerData'
          }
        },
        { $unwind: '$playerData' },
        {
          $match: {
            $and: [{ 'playerData.teams': optTeam }, companyOr]
          }
        },
        { $sort: { time: -1 } },
        { $limit: 1000 }
      ];
    } else {
      aggregateBody = [{ $match: companyOr }, { $sort: { time: -1 } }, { $limit: 1000 }];
    }


    const request$ = this.backendApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);

        return filtered.map(a => ({
          id: a._id,
          title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
          player: a.userId || '',
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          processTitle: a.attributes?.delivery_title || undefined
        }));
      }),
      catchError(error => {
        console.error('Error fetching actions by company key:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionsByCnpjCache, cacheKey, request$);
    return request$;
  }

  /**
   * Tarefas do colaborador para um cliente (CNPJ/deal), usando o mesmo conjunto de dados do painel:
   * `getPlayerActionLogForMonth` → mesmo aggregate paginado `{ $match: { userId } }, { $sort: { time: -1 } }` do carregamento inicial.
   * Filtra no cliente por `attributes.cnpj` / `attributes.deal` alinhado à lista de participação.
   */
  getUserActionsForCompanyUsingPlayerActionLog(
    playerId: string,
    companyKey: string,
    month?: Date
  ): Observable<ClienteActionItem[]> {
    return this.getPlayerActionLogForMonth(playerId).pipe(
      map(actions => {
        const matched = actions.filter(a => actionLogEntryMatchesCompanyKey(a, companyKey));
        const filtered = filterByMonth(matched, month);
        filtered.sort((a, b) => extractTimestamp(b.time) - extractTimestamp(a.time));
        return filtered.map(a => ({
          id: a._id,
          title:
            a.attributes?.delivery_title ||
            a.attributes?.acao ||
            a.action_title ||
            a.actionId ||
            'Ação sem título',
          player: a.userId || '',
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          processTitle: a.attributes?.delivery_title || undefined
        }));
      }),
      catchError(error => {
        console.error('Error in getUserActionsForCompanyUsingPlayerActionLog:', error);
        return of([]);
      })
    );
  }

  /**
   * Get cliente list with actions for carteira section
   */
  getCarteiraClientes(playerId: string, month?: Date): Observable<ClienteListItem[]> {
    return this.getPlayerCnpjList(playerId, month).pipe(
      switchMap(cnpjs => {
        if (cnpjs.length === 0) {
          return of([]);
        }

        // Fetch actions for each CNPJ
        const requests = cnpjs.map(cnpj =>
          this.getActionsByCnpj(cnpj, month, { userId: playerId }).pipe(
            map(actions => ({ cnpj, actions }))
          )
        );

        return forkJoin(requests);
      }),
      catchError(error => {
        console.error('Error fetching carteira clientes:', error);
        return of([]);
      })
    );
  }

  /**
   * Get activities for a specific process (delivery_id)
   * Returns list of activities for the given delivery_id
   * NO time filtering in aggregate - filtering done on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByProcess(deliveryId: number, playerId: string, month?: Date): Observable<ActivityListItem[]> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `${playerId}_${deliveryId}_all_activities_by_process`;
    const cached = this.getCachedData(this.activitiesByProcessCache, cacheKey);
    if (cached) {
      return cached;
    }

    // NO time filtering - fetch ALL activities for this process
    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          'attributes.delivery_id': deliveryId
        }
      },
      { $sort: { time: -1 } }
    ];

    const request$ = this.backendApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        
        // Filter by month on frontend
        const filtered = filterByMonth(actions, month);
        
        return filtered.map(a => {
          // Determine status based on action data
          let status: 'finalizado' | 'pendente' | 'dispensado' | undefined;
          
          // Check if action is dismissed (highest priority)
          if (a.extra?.['dismissed'] === true || a.attributes?.['dismissed'] === true || a.status === 'CANCELLED') {
            status = 'dispensado';
          }
          // Check if action is completed/finalized
          else if (a.extra?.processed === true || 
                   a.status === 'DONE' || 
                   a.status === 'DELIVERED' ||
                   a.actionId === 'desbloquear') {
            status = 'finalizado';
          }
          // Check if action is pending or in progress
          else if (a.status === 'PENDING' || 
                   a.status === 'DOING' || 
                   a.status === 'INCOMPLETE' ||
                   !a.status) {
            status = 'pendente';
          }

          return {
            id: a._id,
            title: a.attributes?.acao || a.action_title || a.actionId || 'Ação sem título',
            delivery_title: a.attributes?.delivery_title || undefined,
            points: PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG,
            created: extractTimestamp(a.time as number | { $date: string } | undefined),
            player: a.userId || '',
            status,
            cnpj: a.attributes?.cnpj || undefined
          };
        });
      }),
      catchError(error => {
        console.error('Error fetching activities by process:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.activitiesByProcessCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get activities count grouped by day of the month
   * Returns an array with count for each day of the month
   * NO time filtering in aggregate - filtering done on frontend
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByDay(playerId: string, month?: Date): Observable<{ day: number; count: number }[]> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `${playerId}_all_activities_by_day`;
    const cached = this.getCachedData(this.activitiesByDayCache, cacheKey);
    if (cached) {
      // Filter cached data by month on frontend
      return cached;
    }

    // Fetch ALL action logs and group by day on frontend
    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        // Filter by month on frontend
        const filtered = filterByMonth(actions, month);
        
        // Group by day
        const dayMap = new Map<number, number>();
        filtered.forEach(action => {
          const timestamp = extractTimestamp(action.time);
          if (timestamp > 0) {
            const day = new Date(timestamp).getDate();
            dayMap.set(day, (dayMap.get(day) || 0) + 1);
          }
        });
        
        const result = Array.from(dayMap.entries())
          .map(([day, count]) => ({ day, count }))
          .sort((a, b) => a.day - b.day);
        
        return result;
      }),
      catchError(error => {
        console.error('Error fetching activities by day:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.activitiesByDayCache, cacheKey, request$);
    return request$;
  }

  /**
   * Clear all caches
   */
  /**
   * Get unique deals from action_log (attributes.deals) for a player.
   * Fetches ALL data and filters by month on frontend.
   */
  getUniqueDeals(playerId: string, month?: Date): Observable<string[]> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      map(actions => {
        const filtered = filterByMonth(actions, month);
        const dealsSet = new Set<string>();
        filtered.forEach(action => {
          const deals = (action.attributes as any)?.deals;
          if (typeof deals === 'string' && deals.trim()) {
            dealsSet.add(deals.trim());
          } else if (Array.isArray(deals)) {
            deals.forEach((d: string) => {
              if (typeof d === 'string' && d.trim()) {
                dealsSet.add(d.trim());
              }
            });
          }
        });
        return Array.from(dealsSet);
      }),
      catchError(error => {
        console.error('Error fetching unique deals:', error);
        return of([]);
      })
    );
  }

  clearCache(): void {
    this.actionLogCache.clear();
    this.metricsCache.clear();
    this.activityCountCache.clear();
    this.uniqueClientesCache.clear();
    this.cnpjListWithCountCache.clear();
    this.activitiesByDayCache.clear();
    this.activitiesByProcessCache.clear();
    this.processListCache.clear();
    this.processFinalizationCache.clear();
    this.actionsByCnpjCache.clear();
    this.processMetricsCache.clear();
    this.pontosForMonthCache.clear();
    this.monthlyPointsBreakdownCache.clear();
    this.game4uGoalMonthTargetCache.clear();
    this.game4uTeamGoalMonthTargetCache.clear();
    this.game4uSeasonSidebarDetailsCache.clear();
    this.game4uPlayerDashboardSnapshotCache.clear();
    this.game4uTeamDashboardSnapshotCache.clear();
    this.game4uTeamFinishedSummaryForMonthCache.clear();
    this.game4uTeamDailyFinishedStatsCache.clear();
    this.teamMetricsCache.clear();
    this.teamCnpjCache.clear();
    this.teamPointsBreakdownCache.clear();
  }

  // ============================================
  // TEAM AGGREGATE METHODS (OPTIMIZED)
  // These methods use $lookup to fetch data for all team members in a single query
  // ============================================

  private teamMetricsCache = new Map<string, CacheEntry<any>>();
  private teamCnpjCache = new Map<string, CacheEntry<any>>();
  private teamPointsBreakdownCache = new Map<string, CacheEntry<any>>();

  /**
   * Get progress metrics for all team members in a single aggregate query.
   * Uses $lookup to join player data and filter by team.
   * NO time filtering in aggregate - filtering done on frontend
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering (done on frontend)
   * @returns Observable of aggregated metrics for the team
   */
  getTeamProgressMetrics(teamId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `team_metrics_${teamId}_all`;
    const cached = this.getCachedData(this.teamMetricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    // NO time filtering - fetch ALL data for the team
    // Single aggregate query to get all action counts for the team
    const activityAggregateBody = [
      {
        $lookup: {
          from: 'player',
          localField: 'userId',
          foreignField: '_id',
          as: 'playerData'
        }
      },
      {
        $unwind: '$playerData'
      },
      {
        $match: {
          'playerData.teams': teamId
        }
      },
      {
        $project: {
          time: 1,
          actionId: 1,
          'attributes.delivery': 1,
          'attributes.delivery_id': 1
        }
      }
    ];

    console.log('📊 Team progress metrics query (ALL data, no time filter) for team:', teamId);

    const request$ = this.backendApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', activityAggregateBody).pipe(
      switchMap(allActions => {
        // Filter by month on frontend
        const filtered = filterByMonth(allActions, month);
        const finalizadas = filtered.length;
        
        // Get unique delivery_ids
        const deliveryIds = [...new Set(
          filtered
            .map(a => a.attributes?.delivery_id)
            .filter((id): id is number => id != null)
        )];
        
        if (deliveryIds.length === 0) {
          return of({
            activity: { pendentes: 0, emExecucao: 0, finalizadas, pontos: 0 },
            processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
          });
        }
        
        // Query for desbloquear actions (no time filter)
        const desbloqueadosBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];
        
        return this.backendApi.post<{ _id: number }[]>('/v3/database/action_log/aggregate?strict=true', desbloqueadosBody).pipe(
          map(desbloqueados => {
            const desbloqueadosIds = new Set(desbloqueados.map(d => d._id));
            const processosFinalizados = deliveryIds.filter(id => desbloqueadosIds.has(id)).length;
            const processosIncompletos = deliveryIds.length - processosFinalizados;

            return {
              activity: {
                pendentes: 0,
                emExecucao: 0,
                finalizadas,
                pontos: 0 // Points are loaded separately
              },
              processo: {
                pendentes: 0,
                incompletas: processosIncompletos,
                finalizadas: processosFinalizados
              }
            };
          }),
          catchError(() => of({
            activity: { pendentes: 0, emExecucao: 0, finalizadas, pontos: 0 },
            processo: { pendentes: 0, incompletas: deliveryIds.length, finalizadas: 0 }
          }))
        );
      }),
      catchError(error => {
        console.error('Error fetching team progress metrics:', error);
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamMetricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get CNPJ list with action counts for all team members in a single aggregate query.
   * Uses $lookup to join player data and filter by team.
   * NO time filtering in aggregate - filtering done on frontend
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering (done on frontend)
   * @returns Observable of CNPJ list with action and process counts
   */
  getTeamCnpjListWithCount(teamId: string, month?: Date): Observable<{ cnpj: string; actionCount: number; processCount: number }[]> {
    // Cache key without month - we fetch ALL data
    const cacheKey = `team_cnpj_${teamId}_all`;
    const cached = this.getCachedData(this.teamCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    // NO time filtering - fetch ALL data for the team
    const actionCountBody = [
      {
        $lookup: {
          from: 'player',
          localField: 'userId',
          foreignField: '_id',
          as: 'playerData'
        }
      },
      {
        $unwind: '$playerData'
      },
      {
        $match: {
          'playerData.teams': teamId,
          'attributes.cnpj': { $ne: null }
        }
      },
      {
        $project: {
          cnpj: '$attributes.cnpj',
          time: 1
        }
      }
    ];
    
    console.log('📊 Team CNPJ list query (ALL data, no time filter) for team:', teamId);

    const request$ = this.backendApi.post<{ _id: string; cnpj: string; time?: number | { $date: string } }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      actionCountBody
    ).pipe(
      map(actionResponse => {
        // Filter by month on frontend
        const filtered = filterByMonth(actionResponse as any, month);
        
        // Group by CNPJ and count
        const cnpjMap = new Map<string, number>();
        filtered.forEach((action: any) => {
          const cnpj = action.cnpj;
          if (cnpj) {
            cnpjMap.set(cnpj, (cnpjMap.get(cnpj) || 0) + 1);
          }
        });
        
        const result = Array.from(cnpjMap.entries()).map(([cnpj, count]) => ({
          cnpj,
          actionCount: count,
          processCount: 0
        }));

        return result;
      }),
      catchError(error => {
        console.error('Error fetching team CNPJ list:', error);
        return of([] as { cnpj: string; actionCount: number; processCount: number }[]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamCnpjCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get cached data if valid
   */
  private getCachedData<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    ttlMs: number = this.CACHE_DURATION
  ): Observable<T> | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > ttlMs) {
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
