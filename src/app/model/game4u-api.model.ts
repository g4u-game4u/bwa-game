/** Contratos alinhados ao OpenAPI Game4U (g4u-api-bwa). */

import { environment } from '../../environments/environment';

export type Game4uUserActionStatus =
  | 'PENDING'
  | 'DOING'
  | 'DONE'
  | 'DELIVERED'
  | 'PAID'
  | 'LOST'
  | 'CANCELLED';

export type Game4uDeliveryStatus = 'PENDING' | 'INCOMPLETE' | 'DELIVERED' | 'CANCELLED';

export interface Game4uDateRangeQuery {
  start: string;
  end: string;
}

export interface Game4uUserScopedQuery extends Game4uDateRangeQuery {
  user: string;
  /**
   * Escopo BWA (opcional). Nos endpoints `GET /game/stats`, `/game/actions` e `/game/deliveries`,
   * **não** é enviado na query quando `user` está definido — a API rejeita `team_id` nesse caso.
   * Continua útil em relatórios Supabase/cache quando aplicável.
   */
  team_id?: string;
}

export interface Game4uTeamScopedQuery extends Game4uDateRangeQuery {
  /** Id numérico da equipa no jogo (query `team`). Não usar nome legível. */
  team: string;
  /** Evitar em `team-actions` se o backend rejeitar (`property user should not exist`). */
  user?: string;
  /**
   * Escopo BWA (opcional em memória/DTOs). O cliente **não** envia `team_id` em `GET /game/team-actions`
   * (só `team`, `start`, `end`, opcional `user`/`status`). Em `team-stats` / `team-deliveries` também não vai na query.
   */
  team_id?: string;
}

export interface Game4uUserActionStatsModel {
  status: Game4uUserActionStatus;
  count: number;
  total_points: number;
}

/** Agregados por status na resposta de `/game/stats` (ex.: `action_stats.DONE`). */
export interface Game4uActionStatBucket {
  count?: number;
  total_points?: number;
}

export interface Game4uActionStatsNested {
  total_points?: number;
  total_blocked_points?: number;
  DONE?: Game4uActionStatBucket;
  done?: Game4uActionStatBucket;
  PENDING?: Game4uActionStatBucket;
  pending?: Game4uActionStatBucket;
  DOING?: Game4uActionStatBucket;
  DELIVERED?: Game4uActionStatBucket;
  PAID?: Game4uActionStatBucket;
}

/** Agregados de entregas em `/game/stats` (ex.: `delivery_stats.total`). */
export interface Game4uDeliveryStatsNested {
  total?: number;
  TOTAL?: number;
  PENDING?: number;
  INCOMPLETE?: number;
  DELIVERED?: number;
  [key: string]: unknown;
}

export interface Game4uUserActionStatsResponse {
  stats: Game4uUserActionStatsModel[];
  total_actions: number;
  total_points: number;
  total_blocked_points: number;
  /** Quando presente, o painel usa `DONE`/`done` para tarefas e pontos “finalizados”. */
  action_stats?: Game4uActionStatsNested;
  delivery_stats?: Game4uDeliveryStatsNested;
  total_cancelled_points?: number;
  cancelled_actions_count?: number;
}

/** Campos podem vir como string ou objeto na API real — tratamos nos mappers. */
export interface Game4uUserActionModel {
  id: string;
  user_id?: unknown;
  points: number;
  status: Game4uUserActionStatus;
  finished_at?: string | null | unknown;
  created_at: string;
  updated_at?: string;
  action_template_id?: string;
  delivery_id?: string;
  action_title?: string;
  delivery_title?: string;
  user_email?: unknown;
  team_id?: unknown;
  team_name?: unknown;
  client_id?: string;
  integration_id?: unknown;
  dismissed?: boolean;
  /** Prazo (`YYYY-MM-DD`) em relatórios como `/game/reports/user-actions`. */
  dt_prazo?: string;
  /** Indica se a entrega pode gerar multa (relatórios user-actions). */
  risco_multa?: boolean;
  [key: string]: unknown;
}

export interface Game4uDeliveryModel {
  id: string;
  created_at?: string;
  status?: Game4uDeliveryStatus;
  finished_at?: string;
  /** Título humano do processo/entrega (preferir em UI em vez de `id`). */
  delivery_title?: string;
  title?: string;
  [key: string]: unknown;
}

/** `GET /game/reports/finished/summary` */
export interface Game4uReportsFinishedSummary {
  tasks_count?: number;
  points_sum?: number;
  deliveries_count?: number;
  [key: string]: unknown;
}

/** `GET /game/reports/open/summary` — tarefas PENDING ou DOING (mesmo formato agregado). */
export interface Game4uReportsOpenSummary {
  tasks_count?: number;
  points_sum?: number;
  /** Novo nome no contrato; aceitar também `deliveries_count` via índice. */
  delivery_count?: number;
  [key: string]: unknown;
}

/** Query para `GET /game/reports/open/summary`: intervalo em `dt_prazo` (ISO 8601), não `finished_at_*`. */
export interface Game4uReportsOpenSummaryQuery {
  /** Utilizador; omitir com `team_id` para consolidado da equipa (gestor). */
  email?: string;
  dt_prazo_start: string;
  dt_prazo_end: string;
  team_id?: string;
}

/**
 * Linha normalizada de `GET /game/reports/finished/deliveries`.
 * Legado: array de strings (= só título). Atual: objetos com `delivery_id` tipo `41355-2026-03-01`
 * (prefixo numérico = EmpID no GET `/gamificacao`).
 */
export interface Game4uReportsFinishedDeliveryRow {
  delivery_title: string;
  delivery_id?: string;
  emp_id?: string | number;
  user_email?: string;
  /** Metadados da assessoria (ex.: `status_api` com «justif» para entrega justificada). */
  extra?: Record<string, unknown>;
  /** % no prazo no mês (0–100), quando vem de `finished/deliveries/cached`. */
  on_time_pct?: number | null;
  /** Tarefas DONE/DELIVERED no mês (`dt_prazo`) nesta entrega; lista só inclui linhas com valor > 0. */
  tasks_total?: number;
  tasks_on_time?: number;
}

/** Query `GET /game/reports/finished/deliveries/cached` (informe `email` ou `team_id`). */
export interface Game4uReportsFinishedDeliveriesCachedQuery {
  email?: string;
  team_id?: string;
  /** `YYYY-MM` ou `YYYY-MM-DD` */
  month: string;
  offset?: number;
  limit?: number;
}

/**
 * Query `GET /game/reports/management/finished/deliveries/cached` — agregado da gestão
 * (GERENTE / DIRETOR / C_LEVEL); escopo vem do JWT (`user_role_team_month`) — sem `email`/`team_id`.
 */
export interface Game4uReportsManagementFinishedDeliveriesCachedQuery {
  /** `YYYY-MM` ou `YYYY-MM-DD` */
  month: string;
  offset?: number;
  limit?: number;
  /** Só ADMIN/SERVICE: consultar outro gestor. */
  user_id?: string;
}

/** Resposta paginada de `GET /game/reports/finished/deliveries/cached`. */
export interface Game4uReportsFinishedDeliveriesCachedPage {
  refreshed_at?: string;
  params?: PlayerDashboardCachedParams;
  offset: number;
  limit: number;
  items: Game4uReportsFinishedDeliveryRow[];
  total?: number;
  /** Quando presente, indica se há mais páginas além desta resposta. */
  has_more?: boolean;
}

function normalizeDeliveryRowExtraField(raw: unknown): Record<string, unknown> | undefined {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // extra não é JSON — ignorar
    }
  }
  return undefined;
}

function pickFirstNonEmptyString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === 'string') {
      const t = v.trim();
      if (t) {
        return t;
      }
    }
  }
  return undefined;
}

/** Aceita `string[]` legado ou `Record[]` com `delivery_id` / `delivery_title`. */
export function normalizeGameReportsFinishedDeliveriesPayload(body: unknown): Game4uReportsFinishedDeliveryRow[] {
  if (!Array.isArray(body)) {
    return [];
  }
  const out: Game4uReportsFinishedDeliveryRow[] = [];
  for (const raw of body) {
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t) {
        out.push({ delivery_title: t });
      }
      continue;
    }
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      const delivery_id = pickFirstNonEmptyString(o, ['delivery_id', 'deliveryId']);
      const emp_id_raw = o['emp_id'] ?? o['empId'] ?? o['EmpID'];
      const emp_id =
        typeof emp_id_raw === 'number' && Number.isFinite(emp_id_raw)
          ? emp_id_raw
          : typeof emp_id_raw === 'string' && emp_id_raw.trim()
            ? emp_id_raw.trim()
            : undefined;
      let delivery_title = pickFirstNonEmptyString(o, ['delivery_title', 'deliveryTitle', 'title']);
      if (!delivery_title && delivery_id) {
        delivery_title = delivery_id;
      }
      if (!delivery_title) {
        continue;
      }
      const on_time_raw = o['on_time_pct'] ?? o['onTimePct'];
      let on_time_pct: number | null | undefined;
      if (on_time_raw != null && on_time_raw !== '') {
        let n = Number(on_time_raw);
        if (Number.isFinite(n)) {
          if (n > 0 && n <= 1) {
            n = n * 100;
          }
          on_time_pct = Math.min(100, Math.max(0, Math.round(n * 100) / 100));
        }
      }
      const user_email = pickFirstNonEmptyString(o, ['user_email', 'userEmail']);
      const tasks_total = Number(o['tasks_total'] ?? o['tasksTotal']);
      const tasks_on_time = Number(o['tasks_on_time'] ?? o['tasksOnTime']);
      const extra = normalizeDeliveryRowExtraField(o['extra']);
      out.push({
        delivery_title,
        ...(delivery_id ? { delivery_id } : {}),
        ...(emp_id !== undefined ? { emp_id } : {}),
        ...(user_email ? { user_email } : {}),
        ...(extra ? { extra } : {}),
        ...(on_time_pct != null ? { on_time_pct } : {}),
        ...(Number.isFinite(tasks_total) ? { tasks_total: Math.floor(tasks_total) } : {}),
        ...(Number.isFinite(tasks_on_time) ? { tasks_on_time: Math.floor(tasks_on_time) } : {})
      });
    }
  }
  return out;
}

/** `GET /game/reports/goal/month/summary` — chaves alinhadas ao RPC (fallback em leitura). */
export interface Game4uGoalMonthSummaryResponse {
  points_sum?: number;
  tasks_count?: number;
  total_points?: number;
  goal_points?: number;
  [key: string]: unknown;
}

/** Query `GET /game/reports/dashboard/cached` */
export interface Game4uReportsDashboardCachedQuery {
  email: string;
  /** `YYYY-MM` ou `YYYY-MM-DD` */
  month: string;
}

/** Intervalos usados no cálculo do cache (exibição no painel). */
export interface PlayerDashboardCachedParams {
  cache_month: string;
  season_start: string;
  season_end: string;
  month_start: string;
  month_end: string;
}

/** `GET /game/reports/dashboard/cached` — KPIs denormalizados do painel do jogador. */
export interface PlayerDashboardCachedResponse {
  refreshed_at: string;
  params: PlayerDashboardCachedParams;
  season_points_total: number;
  season_clients_total: number;
  season_tasks_finished_total: number;
  month_points_done_delivered: number;
  month_goal_points: number;
  month_pending_tasks_count: number;
  month_finished_tasks_count: number;
  month_clients_served: number;
  /** % de entregas no prazo no mês (0–100). */
  month_on_time_delivery_pct?: number | null;
  refresh_error?: string | null;
}

/** Parâmetros de intervalo (jogador e supervisão). */
export type SupervisionDashboardCachedParams = PlayerDashboardCachedParams;

/** Métricas agregadas por time (`GET /game/reports/supervision/dashboard/cached`). */
export interface SupervisionTeamDashboardCached {
  refreshed_at: string;
  team_id: number;
  team_name: string | null;
  players_count: number;
  params: SupervisionDashboardCachedParams;
  season_points_total: number;
  season_clients_total: number;
  season_tasks_finished_total: number;
  month_points_done_delivered: number;
  month_goal_points: number;
  month_pending_tasks_count: number;
  month_finished_tasks_count: number;
  month_clients_served: number;
  month_on_time_delivery_pct?: number | null;
  refresh_error?: string | null;
}

export interface SupervisionDashboardCachedListResponse {
  teams: SupervisionTeamDashboardCached[];
}

export type ManagementDashboardUserRole = 'GERENTE' | 'DIRETOR' | 'C_LEVEL';

export interface ManagerTeamRef {
  team_id: number;
  team_name: string | null;
}

/** `GET /game/reports/management/dashboard/cached` — linha `manager_dashboard_report_cache`. */
export interface ManagerDashboardCached
  extends Omit<SupervisionTeamDashboardCached, 'team_id' | 'team_name' | 'players_count'> {
  team_id?: number;
  team_name?: string | null;
  players_count: number;
  user_id: string;
  user_email: string;
  user_role: ManagementDashboardUserRole;
  teams_count: number;
  team_ids: number[];
  teams: ManagerTeamRef[];
}

export type TeamSupervisionCached = SupervisionTeamDashboardCached;

export type OrganizationalTierCached = SupervisionTeamDashboardCached & {
  management_tier: ManagementDashboardUserRole;
  managers_count: number;
  teams_count: number;
  team_ids: number[];
  teams: ManagerTeamRef[];
};

export interface ManagementDashboardOverviewResponse {
  manager: ManagerDashboardCached;
  teams: TeamSupervisionCached[];
  organizational_tier: OrganizationalTierCached | null;
}

export interface Game4uReportsManagementCachedQuery {
  month: string;
  user_id?: string;
}

/** Query para `GET /game/reports/management/dashboard/cached/list`. */
export interface Game4uReportsManagementCachedListQuery {
  month: string;
  /** Filtra gestores por camada (ex.: `GERENTE` para agrupar gerências). */
  role?: ManagementDashboardUserRole;
  user_id?: string;
}

/** Resposta de `GET /game/reports/management/dashboard/cached/list`. */
export interface ManagementDashboardCachedListResponse {
  managers: ManagerDashboardCached[];
}

export interface Game4uReportsSupervisionCachedQuery {
  team_id: string;
  month: string;
}

export interface Game4uReportsSupervisionCachedListQuery {
  month: string;
}

export interface Game4uReportsFinishedQuery {
  /**
   * E-mail do colaborador filtrado; omitir quando só `team_id` for usado (dados consolidados da equipa).
   * Ver `game-reports-doc.md`.
   */
  email?: string;
  /** Obrigatório em `GET …/finished/deliveries` e `…/actions-by-delivery` (ISO 8601). */
  finished_at_start?: string;
  finished_at_end?: string;
  /** Opcional: repete `status` na query string se necessário. */
  status?: string[];
  /** Escopo BWA / equipa — consolidado sem `email`. */
  team_id?: string;
  /** Paginação opcional (quando suportada no backend). */
  offset?: number;
  limit?: number;
}

/**
 * Query para `GET /game/reports/team/daily-finished-stats` (`getReportTeamDailyFinishedStats`).
 * Este endpoint usa `start` / `end` (ISO 8601), não `finished_at_start` / `finished_at_end`.
 */
export interface Game4uReportsTeamDailyFinishedStatsQuery {
  email?: string;
  /** Escopo BWA / equipa (consolidado sem `email`). */
  team_id: string;
  /** Início do intervalo (ISO 8601). */
  start: string;
  /** Fim do intervalo (ISO 8601). */
  end: string;
  status?: string[];
  offset?: number;
  limit?: number;
}

/**
 * Linha normalizada de `GET /game/reports/team/daily-finished-stats`.
 * O backend pode variar os nomes das colunas; usamos normalização no service.
 */
export interface Game4uReportsTeamDailyFinishedStatRow {
  /** Dia (ISO `YYYY-MM-DD` ou ISO date-time). */
  day: string;
  /** E-mail do colaborador quando a resposta é “por membro” (pode vir vazio no consolidado). */
  email?: string;
  /** Total de tarefas/ações finalizadas no dia. */
  tasks_count?: number;
  /** Soma de pontos no dia. */
  points_sum?: number;
  [key: string]: unknown;
}

/**
 * Query para `GET /game/reports/team/daily-pending-stats` — agregado diário de tarefas
 * pendentes (status default `PENDING` + `DOING`) cujo `due_date` (com fallback `extra.dt_prazo`)
 * cai no intervalo `start..end`.
 *
 * Identidade: `team_id` (obrigatório). Use `team_id=__management_overview__` para a visão
 * agregada de gestão (GERENTE / DIRETOR / C_LEVEL / ADMIN / SERVICE).
 */
export interface Game4uReportsTeamDailyPendingStatsQuery {
  /** Escopo BWA / equipa, ou `__management_overview__` para visão agregada de gestão. */
  team_id: string;
  /** Início do intervalo (ISO 8601 `YYYY-MM-DD`). */
  start: string;
  /** Fim do intervalo (ISO 8601 `YYYY-MM-DD`). */
  end: string;
  /** Override opcional do filtro de status (default no backend: `PENDING` + `DOING`). */
  status?: string[];
  /** E-mail opcional do colaborador (drill-down). */
  email?: string;
}

/**
 * Linha normalizada de `GET /game/reports/team/daily-pending-stats`.
 * Mesmo shape do daily-finished-stats; `points_sum` em geral será 0 (tarefas pendentes
 * ainda não geraram pontos), e `tasks_count` é a contagem de tarefas com `due_date` no dia.
 */
export interface Game4uReportsTeamDailyPendingStatRow {
  day: string;
  email?: string;
  tasks_count?: number;
  points_sum?: number;
  [key: string]: unknown;
}

export interface Game4uReportsActionsByDeliveryQuery extends Game4uReportsFinishedQuery {
  delivery_title: string;
}

/** Resposta paginada de `GET /game/reports/finished/actions-by-delivery` (`items` + total). */
export interface Game4uReportsActionsByDeliveryPage {
  items: Game4uUserActionModel[];
  total: number;
}

/** Resposta paginada de `GET /game/reports/finished/deliveries` (quando o backend suporta). */
export interface Game4uReportsFinishedDeliveriesPage {
  offset: number;
  limit: number;
  items: Game4uReportsFinishedDeliveryRow[];
  total?: number;
}

export function normalizeGameReportsFinishedDeliveriesPagePayload(
  body: unknown
): Game4uReportsFinishedDeliveriesPage {
  const empty: Game4uReportsFinishedDeliveriesPage = { offset: 0, limit: 30, items: [] };
  if (Array.isArray(body)) {
    const items = normalizeGameReportsFinishedDeliveriesPayload(body);
    return { offset: 0, limit: items.length || 30, items, total: items.length };
  }
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const raw = o['items'] ?? o['data'] ?? o['results'];
    const items = normalizeGameReportsFinishedDeliveriesPayload(Array.isArray(raw) ? raw : []);
    const offRaw = o['offset'];
    const limRaw = o['limit'];
    const offset =
      typeof offRaw === 'number' && Number.isFinite(offRaw)
        ? Math.floor(offRaw)
        : typeof offRaw === 'string' && offRaw.trim() !== ''
          ? Math.floor(Number(offRaw)) || 0
          : 0;
    const limit =
      typeof limRaw === 'number' && Number.isFinite(limRaw)
        ? Math.floor(limRaw)
        : typeof limRaw === 'string' && limRaw.trim() !== ''
          ? Math.floor(Number(limRaw)) || (items.length > 0 ? items.length : 30)
          : items.length > 0
            ? items.length
            : 30;
    const totalRaw = o['total'] ?? o['total_count'] ?? o['count'] ?? o['total_items'];
    const n = typeof totalRaw === 'number' ? totalRaw : typeof totalRaw === 'string' ? Number(totalRaw) : NaN;
    const total = Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
    return { offset, limit, items, ...(total != null ? { total } : {}) };
  }
  return empty;
}

/** Normaliza corpo de `GET /game/reports/finished/deliveries/cached`. */
export function normalizeGameReportsFinishedDeliveriesCachedPagePayload(
  body: unknown,
  fallbackOffset = 0,
  fallbackLimit = 30
): Game4uReportsFinishedDeliveriesCachedPage {
  const empty: Game4uReportsFinishedDeliveriesCachedPage = {
    offset: fallbackOffset,
    limit: fallbackLimit,
    items: []
  };
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const raw = o['items'] ?? o['data'] ?? o['results'];
    const items = normalizeGameReportsFinishedDeliveriesPayload(Array.isArray(raw) ? raw : []);
    const offRaw = o['offset'];
    const limRaw = o['limit'];
    const offset =
      typeof offRaw === 'number' && Number.isFinite(offRaw)
        ? Math.floor(offRaw)
        : typeof offRaw === 'string' && offRaw.trim() !== ''
          ? Math.floor(Number(offRaw)) || fallbackOffset
          : fallbackOffset;
    const limit =
      typeof limRaw === 'number' && Number.isFinite(limRaw)
        ? Math.floor(limRaw)
        : typeof limRaw === 'string' && limRaw.trim() !== ''
          ? Math.floor(Number(limRaw)) || fallbackLimit
          : fallbackLimit;
    const totalRaw = o['total'] ?? o['total_count'] ?? o['count'] ?? o['total_items'];
    const n = typeof totalRaw === 'number' ? totalRaw : typeof totalRaw === 'string' ? Number(totalRaw) : NaN;
    const total = Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
    const refreshed_at = pickFirstNonEmptyString(o, ['refreshed_at', 'refreshedAt']);
    const paramsRaw = o['params'];
    const params =
      paramsRaw && typeof paramsRaw === 'object' ? (paramsRaw as PlayerDashboardCachedParams) : undefined;
    const hasMoreRaw = o['has_more'] ?? o['hasMore'];
    let has_more: boolean | undefined;
    if (hasMoreRaw === true || hasMoreRaw === 'true') {
      has_more = true;
    } else if (hasMoreRaw === false || hasMoreRaw === 'false') {
      has_more = false;
    }
    return {
      offset,
      limit,
      items,
      ...(total != null ? { total } : {}),
      ...(has_more != null ? { has_more } : {}),
      ...(refreshed_at ? { refreshed_at } : {}),
      ...(params ? { params } : {})
    };
  }
  return empty;
}

export function normalizeGameReportsActionsByDeliveryResponse(body: unknown): Game4uReportsActionsByDeliveryPage {
  if (Array.isArray(body)) {
    const items = body as Game4uUserActionModel[];
    return { items, total: items.length };
  }
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const raw = o['items'] ?? o['data'] ?? o['results'];
    const items = Array.isArray(raw) ? (raw as Game4uUserActionModel[]) : [];
    const totalRaw = o['total'] ?? o['total_count'] ?? o['count'] ?? o['total_items'];
    const n = typeof totalRaw === 'number' ? totalRaw : typeof totalRaw === 'string' ? Number(totalRaw) : NaN;
    const total = Number.isFinite(n) && n >= 0 ? Math.floor(n) : items.length;
    return { items, total };
  }
  return { items: [], total: 0 };
}

/** `GET /game/reports/user-actions` — query (pares de data só completos; um par por pedido). */
export interface Game4uReportsUserActionsQuery {
  /** Colaborador; com `team_id` omitir para agregado da equipa (se o backend permitir). */
  email?: string;
  /** Repetido na query string (`status=DONE&status=…`) ou equivalente CSV no backend. */
  status?: Game4uUserActionStatus[];
  finished_at_start?: string;
  finished_at_end?: string;
  /** Intervalo em `extra.dt_prazo` (datas ISO / `YYYY-MM-DD`). */
  dt_prazo_start?: string;
  dt_prazo_end?: string;
  created_at_start?: string;
  created_at_end?: string;
  offset?: number;
  limit?: number;
  team_id?: string;
}

/** Resposta paginada de `GET /game/reports/user-actions`. */
export interface Game4uReportsUserActionsPage {
  offset: number;
  limit: number;
  items: Game4uUserActionModel[];
  total?: number;
}

export function normalizeGameReportsUserActionsResponse(body: unknown): Game4uReportsUserActionsPage {
  const empty: Game4uReportsUserActionsPage = { offset: 0, limit: 500, items: [] };
  if (!body || typeof body !== 'object') {
    return empty;
  }
  const o = body as Record<string, unknown>;
  const raw = o['items'] ?? o['data'] ?? o['results'];
  const items = Array.isArray(raw) ? (raw as Game4uUserActionModel[]) : [];
  const offRaw = o['offset'];
  const limRaw = o['limit'];
  const offset =
    typeof offRaw === 'number' && Number.isFinite(offRaw)
      ? Math.floor(offRaw)
      : typeof offRaw === 'string' && offRaw.trim() !== ''
        ? Math.floor(Number(offRaw)) || 0
        : 0;
  const limit =
    typeof limRaw === 'number' && Number.isFinite(limRaw)
      ? Math.floor(limRaw)
      : typeof limRaw === 'string' && limRaw.trim() !== ''
        ? Math.floor(Number(limRaw)) || (items.length > 0 ? items.length : 500)
        : items.length > 0
          ? items.length
          : 500;
  const totalRaw = o['total'];
  const total =
    typeof totalRaw === 'number' && Number.isFinite(totalRaw)
      ? Math.floor(totalRaw)
      : typeof totalRaw === 'string' && totalRaw.trim() !== ''
        ? Math.floor(Number(totalRaw))
        : undefined;
  return { offset, limit, items, ...(total != null && Number.isFinite(total) ? { total } : {}) };
}

export interface Game4uReportsGoalMonthQuery {
  /** Meta por colaborador; omitir com `team_id` se o contrato de consolidado for suportado. */
  email?: string;
  /** `YYYY-MM-DD` (início do mês). */
  dt_prazo_start: string;
  /** `YYYY-MM-DD` (exclusivo: primeiro dia do mês seguinte, como no curl do doc). */
  dt_prazo_end: string;
  team_id?: string;
}

function supabaseGameFallbackCredentials(): boolean {
  const url = (environment.supabaseUrl || '').trim();
  const key = (
    (environment.supabaseServiceRoleKey || '').trim() ||
    (environment.supabaseAnonKey || '').trim()
  );
  return url.length > 0 && key.length > 0;
}

/** True quando dá para ler `/game/*` via HTTP (`backend_url_base`), ou só Supabase se não houver base e `GAME4U_SUPABASE_FALLBACK=true`. */
export function isGame4uDataEnabled(): boolean {
  if (environment.useGame4uApi === false) {
    return false;
  }
  const base = (environment.backend_url_base || '').trim();
  if (base.length > 0) {
    return true;
  }
  return (
    environment.useGame4uSupabaseFallback === true && supabaseGameFallbackCredentials()
  );
}
