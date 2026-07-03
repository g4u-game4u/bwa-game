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
  /** Id numérico da equipe no jogo (query `team`). Não usar nome legível. */
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

/** Hierarquia organizacional em `GET /game/reports/user-actions` (campo `hierarchy`). */
export interface Game4uUserActionHierarchy {
  diretor_email?: string | null;
  diretor_name?: string | null;
  gerente_email?: string | null;
  gerente_name?: string | null;
  team_id?: number | string | null;
  team_name?: string | null;
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
  /** Entrega/tarefa marcada como justificada em `/game/reports/user-actions`. */
  justificada?: boolean;
  /** Gestor, diretor e equipe associados à tarefa (painel agregado). */
  hierarchy?: Game4uUserActionHierarchy | null;
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
  /** Utilizador; omitir com `team_id` para consolidado da equipe (gestor). */
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
  is_acessorias_g4?: boolean;
  is_acessorias_onboarding?: boolean;
  is_acessorias_risco_de_churn?: boolean;
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
  /** Só ADMIN/SERVICE: simular escopo de GERENTE / DIRETOR / C_LEVEL. */
  role?: ManagementDashboardUserRole;
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

function pickBooleanField(obj: Record<string, unknown>, keys: string[]): boolean {
  for (const k of keys) {
    const v = obj[k];
    if (v === true || v === 'true' || v === 1 || v === '1') {
      return true;
    }
    if (v === false || v === 'false' || v === 0 || v === '0') {
      return false;
    }
  }
  return false;
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
      const is_acessorias_g4 = pickBooleanField(o, ['is_acessorias_g4', 'isAcessoriasG4']);
      const is_acessorias_onboarding = pickBooleanField(o, [
        'is_acessorias_onboarding',
        'isAcessoriasOnboarding'
      ]);
      const is_acessorias_risco_de_churn = pickBooleanField(o, [
        'is_acessorias_risco_de_churn',
        'isAcessoriasRiscoDeChurn'
      ]);
      out.push({
        delivery_title,
        ...(delivery_id ? { delivery_id } : {}),
        ...(emp_id !== undefined ? { emp_id } : {}),
        ...(user_email ? { user_email } : {}),
        ...(extra ? { extra } : {}),
        ...(on_time_pct != null ? { on_time_pct } : {}),
        ...(Number.isFinite(tasks_total) ? { tasks_total: Math.floor(tasks_total) } : {}),
        ...(Number.isFinite(tasks_on_time) ? { tasks_on_time: Math.floor(tasks_on_time) } : {}),
        ...(is_acessorias_g4 ? { is_acessorias_g4: true } : {}),
        ...(is_acessorias_onboarding ? { is_acessorias_onboarding: true } : {}),
        ...(is_acessorias_risco_de_churn ? { is_acessorias_risco_de_churn: true } : {})
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
  /** Só ADMIN/SERVICE: simular escopo de GERENTE / DIRETOR / C_LEVEL. */
  role?: ManagementDashboardUserRole;
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
   * E-mail do colaborador filtrado; omitir quando só `team_id` for usado (dados consolidados da equipe).
   * Ver `game-reports-doc.md`.
   */
  email?: string;
  /** Obrigatório em `GET …/finished/deliveries` e `…/actions-by-delivery` (ISO 8601). */
  finished_at_start?: string;
  finished_at_end?: string;
  /** Opcional: repete `status` na query string se necessário. */
  status?: string[];
  /** Escopo BWA / equipe — consolidado sem `email`. */
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
  /** Escopo BWA / equipe (consolidado sem `email`), ou `__management_overview__` para visão agregada de gestão. */
  team_id: string;
  /** Início do intervalo (ISO 8601). */
  start: string;
  /** Fim do intervalo (ISO 8601). */
  end: string;
  status?: string[];
  offset?: number;
  limit?: number;
  /** Só ADMIN/SERVICE com `team_id=__management_overview__`: simular escopo de gestão. */
  role?: ManagementDashboardUserRole;
  /** Só ADMIN/SERVICE com `team_id=__management_overview__`: consultar outro gestor. */
  user_id?: string;
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
  /** Escopo BWA / equipe, ou `__management_overview__` para visão agregada de gestão. */
  team_id: string;
  /** Início do intervalo (ISO 8601 `YYYY-MM-DD`). */
  start: string;
  /** Fim do intervalo (ISO 8601 `YYYY-MM-DD`). */
  end: string;
  /** Override opcional do filtro de status (default no backend: `PENDING` + `DOING`). */
  status?: string[];
  /** E-mail opcional do colaborador (drill-down). */
  email?: string;
  /** Só ADMIN/SERVICE com `team_id=__management_overview__`: simular escopo de gestão. */
  role?: ManagementDashboardUserRole;
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
  /** Colaborador; com `team_id` omitir para agregado da equipe (se o backend permitir). */
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

/** Nível hierárquico em `GET /game/reports/organization/hierarchy-report`. */
export type OrgHierarchyNodeType =
  | 'organization'
  | 'c_level'
  | 'segmentacao'
  | 'diretoria'
  | 'gerencia'
  | 'supervisao'
  | 'player';

/** Métricas por janela temporal (MTD, mês anterior fechado, MTD simétrico anterior). */
export interface OrgMetricsWindow {
  finished?: number;
  points_delivered?: number;
  goal_points?: number;
  expected_points_to_date?: number;
  goal_deliveries?: number;
  expected_deliveries_to_date?: number;
  pending_open?: number;
  multa_risk?: number;
  multa_incurred?: number;
  near_due?: number;
  multa_and_near_due?: number;
  overdue_pending?: number;
  overdue_pending_justified?: number;
  overdue_pending_unjustified?: number;
  clients_served?: number;
  on_time_pct?: number;
  /** % no prazo MTD por tag Acessórias (somente `mtd`). */
  on_time_pct_acessorias_g4?: number;
  on_time_pct_acessorias_risco_de_churn?: number;
  on_time_pct_acessorias_onboarding?: number;
  clients_onboarding?: number;
  clients_acessorias_g4?: number;
  clients_acessorias_onboarding?: number;
  clients_acessorias_risco_de_churn?: number;
  clients_classificacao_1?: number;
  clients_classificacao_2?: number;
  clients_classificacao_3?: number;
  clients_classificacao_4?: number;
  clients_classificacao_5?: number;
  /** Empresas ativas com classificação nula no portal BWA. */
  clients_sem_classificacao?: number;
  /** Ritmo preditivo — somente em mtd (calculado na API). */
  points_gap_vs_expected?: number;
  pct_of_expected_delivered?: number;
  pace_points_per_day?: number;
  projected_points_month_end?: number;
  required_pace_points_per_day?: number;
  finished_gap_vs_expected?: number;
  pace_finished_per_day?: number;
  projected_finished_month_end?: number;
  required_pace_finished_per_day?: number;
}

export interface OrgHierarchyCompare {
  vs_prev_full_points?: number;
  vs_prev_full_points_pct?: number;
  vs_prev_mtd_points?: number;
  vs_prev_mtd_points_pct?: number;
  prev_mtd?: Record<string, number>;
  prev_full?: Record<string, number>;
}

export interface TeamPlayerMtd {
  player_email: string;
  player_name: string;
  points_delivered: number;
  goal_points: number;
  expected_points_to_date: number;
  finished: number;
  goal_deliveries: number;
  expected_deliveries_to_date: number;
}

export type CriticalClientRiskTier = 'critical' | 'high' | 'medium' | 'low';

export interface CriticalClientItem {
  company_serve_key: string;
  company_label: string;
  risk_score: number;
  risk_tier: CriticalClientRiskTier;
  is_acessorias_risco_de_churn: boolean;
  is_acessorias_onboarding: boolean;
  is_acessorias_g4: boolean;
  mtd_overdue_unjustified: number;
  mtd_late_finish: number;
  consecutive_issue_months: number;
}

export interface CriticalClientsSummary {
  count: number;
  with_overdue: number;
  with_late_finish: number;
  high_risk: number;
  consecutive_2plus: number;
  avg_risk_score: number;
  max_risk_score: number;
  /** Lista completa ordenada por risk_score desc. */
  clients?: CriticalClientItem[];
  top_clients?: CriticalClientItem[];
}

export interface OrgMetricsMonthlyPoint {
  cache_month: string;
  mtd_finished: number;
  mtd_points_delivered: number;
  mtd_goal_points: number;
  mtd_expected_points_to_date?: number;
  mtd_goal_deliveries?: number;
  mtd_expected_deliveries_to_date?: number;
  mtd_pending_open: number;
  mtd_multa_risk: number;
  mtd_multa_incurred: number;
  mtd_on_time_pct: number;
  mtd_clients_served: number;
  /** Valores do mês fechado (mesmo KPI, janela completa). */
  full_finished?: number;
  full_points_delivered?: number;
  full_on_time_pct?: number;
  full_clients_served?: number;
  full_pending_open?: number;
  full_multa_risk?: number;
  full_multa_incurred?: number;
}

export interface OrgHierarchySimulation {
  share_pct?: number;
  payout_brl?: number;
  points_basis?: number;
}

export interface OrgHierarchyHighlightItem {
  node_type?: OrgHierarchyNodeType;
  node_id?: string;
  label?: string;
  metric?: string;
  value?: number;
  mtd?: OrgMetricsWindow;
  team_name?: string;
  team_label?: string;
  supervisao_label?: string;
  supervisao_name?: string;
  gerencia_label?: string;
  gerencia_name?: string;
  gerente_name?: string;
  [key: string]: unknown;
}

export interface OrgHierarchyFinishedByDow {
  dow: number;
  finished_count: number;
  points_total: number;
}

export interface OrgHierarchyTopDelivery {
  delivery_title: string;
  finished_count: number;
}

export interface OrgHierarchyAccessMetrics {
  access_days?: number;
  access_sessions?: number;
  active_users?: number;
  active_users_pct?: number;
  avg_access_days_per_active_user?: number;
}

export interface OrgHierarchyAccessCompare {
  vs_prev_mtd_active_users?: number;
  vs_prev_mtd_active_users_pct?: number;
  vs_prev_mtd_access_days?: number;
}

export interface OrgHierarchyAccessByDow {
  dow: number;
  access_days: number;
  access_sessions: number;
}

export interface OrgHierarchyAccess {
  mtd: OrgHierarchyAccessMetrics;
  prev_full: OrgHierarchyAccessMetrics;
  prev_mtd: OrgHierarchyAccessMetrics;
  compare: OrgHierarchyAccessCompare;
  access_by_dow?: OrgHierarchyAccessByDow[];
  current_streak?: number;
  longest_streak?: number;
  last_access_date?: string | null;
  accessed_today?: boolean;
}

export interface OrgHierarchyNode {
  node_type: OrgHierarchyNodeType;
  node_id: string;
  label: string;
  players_count: number;
  season_points_total: number;
  balance_score?: number;
  mtd: OrgMetricsWindow;
  prev_full: OrgMetricsWindow;
  prev_mtd: OrgMetricsWindow;
  compare: OrgHierarchyCompare;
  simulation?: OrgHierarchySimulation;
  highlights?: { destaque: OrgHierarchyHighlightItem[]; atencao: OrgHierarchyHighlightItem[] };
  finished_by_dow?: OrgHierarchyFinishedByDow[];
  top_deliveries?: OrgHierarchyTopDelivery[];
  access?: OrgHierarchyAccess;
  prior_months_mtd?: OrgMetricsWindow;
  mtd_monthly_series?: OrgMetricsMonthlyPoint[];
  month_day_count?: number;
  mtd_elapsed_days?: number;
  days_remaining_in_month?: number;
  team_players_mtd?: TeamPlayerMtd[];
  critical_clients?: CriticalClientsSummary;
  children?: OrgHierarchyNode[];
}

export interface OrganizationHierarchyReportParams {
  cache_month: string;
  mtd_start: string;
  mtd_end: string;
  prev_month: string;
  prev_mtd_start: string;
  prev_mtd_end: string;
  simulation_pot_brl?: number;
  points_per_brl?: number;
}

export interface OrganizationHierarchyReportResponse {
  refreshed_at: string;
  params: OrganizationHierarchyReportParams;
  root: OrgHierarchyNode;
}

export type OrgHierarchyKpiDetailKey =
  | 'on_time_pct'
  | 'clients_served'
  | 'finished'
  | 'points_delivered'
  | 'pending_open'
  | 'near_due'
  | 'overdue_pending'
  | 'overdue_pending_justified'
  | 'overdue_pending_unjustified'
  | 'multa_risk'
  | 'multa_incurred'
  | 'clients_acessorias_risco_de_churn'
  | 'clients_acessorias_onboarding'
  | 'clients_acessorias_g4'
  | 'clients_classificacao_1'
  | 'clients_classificacao_2'
  | 'clients_classificacao_3'
  | 'clients_classificacao_4'
  | 'clients_classificacao_5'
  | 'clients_sem_classificacao';

export type OrgHierarchyDeliveriesDrilldownKey =
  | 'multa_risk'
  | 'multa_incurred'
  | 'near_due'
  | 'overdue_pending'
  | 'overdue_pending_justified'
  | 'overdue_pending_unjustified'
  | 'critical_client';

/** Drill-downs operacionais que também são {@link OrgHierarchyKpiDetailKey}. */
export type OrgHierarchyOperationalDeliveriesDrilldownKey = Exclude<
  OrgHierarchyDeliveriesDrilldownKey,
  'critical_client'
>;

/** Filtro de problemas no drill-down de cliente crítico (`/deliveries?drilldown=critical_client`). */
export type CriticalClientIssueFilter = 'all' | 'overdue' | 'late_finish';

export type CriticalClientIssueKind = 'overdue' | 'late_finish';

export type OrgHierarchyClientListKey =
  | 'clients_served'
  | 'clients_acessorias_g4'
  | 'clients_acessorias_onboarding'
  | 'clients_acessorias_risco_de_churn'
  | 'clients_classificacao_1'
  | 'clients_classificacao_2'
  | 'clients_classificacao_3'
  | 'clients_classificacao_4'
  | 'clients_classificacao_5'
  | 'clients_sem_classificacao';

export interface OrgHierarchyClientListItem {
  company_serve_key: string;
  company_cnpj_digits?: string | null;
  company_name: string;
  acessorias_classificacao?: number | null;
  is_acessorias_g4: boolean;
  is_acessorias_onboarding: boolean;
  is_acessorias_risco_de_churn: boolean;
  player_email: string | null;
  player_name: string | null;
  diretor_name: string | null;
  gerente_name: string | null;
  supervisor_name: string | null;
}

export interface OrgHierarchyClientLists {
  clients_served: OrgHierarchyClientListItem[];
  clients_acessorias_g4: OrgHierarchyClientListItem[];
  clients_acessorias_onboarding: OrgHierarchyClientListItem[];
  clients_acessorias_risco_de_churn: OrgHierarchyClientListItem[];
  clients_classificacao_1: OrgHierarchyClientListItem[];
  clients_classificacao_2: OrgHierarchyClientListItem[];
  clients_classificacao_3: OrgHierarchyClientListItem[];
  clients_classificacao_4: OrgHierarchyClientListItem[];
  clients_classificacao_5: OrgHierarchyClientListItem[];
  clients_sem_classificacao: OrgHierarchyClientListItem[];
}

export interface OrganizationHierarchyKpiDetailHistoryItem {
  cache_month: string; // '2026-03-01'
  month_label: string; // '2026-03'
  mtd_start: string;
  mtd_end: string;
  value: number | null;
  /** Valor do mês fechado (quando disponível na API). */
  full_value?: number | null;
}

export interface OrganizationHierarchyKpiDetailResponse {
  kpi: OrgHierarchyKpiDetailKey;
  kpi_label: string;
  node_type: string;
  node_id: string;
  node_label: string;
  history: OrganizationHierarchyKpiDetailHistoryItem[];
  client_lists?: OrgHierarchyClientLists;
}

export interface Game4uReportsOrganizationHierarchyKpiDetailQuery {
  month: string; // YYYY-MM or YYYY-MM-DD
  kpi: OrgHierarchyKpiDetailKey;
  node_type?: OrgHierarchyNodeType | string;
  node_id?: string;
  months?: number; // default 4
}

/** Query para `GET /game/reports/organization/hierarchy-report/clients-served/export/xlsx`. */
export interface Game4uReportsOrganizationHierarchyClientsServedExportQuery {
  month: string; // YYYY-MM
  node_type?: OrgHierarchyNodeType | string;
  node_id?: string;
}

/** Query para `GET /game/reports/organization/hierarchy-report/critical-clients/deliveries/export`. */
export interface Game4uReportsOrganizationHierarchyCriticalClientsDeliveriesExportQuery {
  month: string; // YYYY-MM
  node_type?: OrgHierarchyNodeType | string;
  node_id?: string;
  company_serve_key?: string;
  issue?: CriticalClientIssueFilter | string;
  /** `true` = todas as user_actions que entram no score do cliente crítico. */
  all_scoring_events?: boolean;
}

export interface OrganizationHierarchyDeliveryRow {
  delivery_id: string;
  delivery_title: string;
  action_name?: string | null;
  action_title?: string | null;
  company_serve_key?: string | null;
  company_cnpj_digits?: string | null;
  issue_kind?: CriticalClientIssueKind | null;
  /** Presente quando `all_scoring_events=true` no drill-down de cliente crítico. */
  user_action_id?: string | null;
  client_key: string | null;
  client_name?: string | null;
  dt_prazo: string | null;
  dt_atraso: string | null;
  status?: string | null;
  status_calc?: string | null;
  points?: number | null;
  finished_at?: string | null;
  is_justificada?: boolean | null;
  player_email: string;
  player_name: string | null;
  team_id: string;
  team_name: string | null;
}

export interface OrganizationHierarchyDeliveriesSupervisorRow {
  node_id: string;
  label: string;
  delivery_count: number;
  deliveries: OrganizationHierarchyDeliveryRow[];
}

export interface OrganizationHierarchyDeliveriesGerenciaRow {
  node_id: string;
  label: string;
  delivery_count: number;
  supervisoes: OrganizationHierarchyDeliveriesSupervisorRow[];
}

export interface OrganizationHierarchyDeliveriesDiretoriaRow {
  node_id: string;
  label: string;
  delivery_count: number;
  gerencias: OrganizationHierarchyDeliveriesGerenciaRow[];
}

export interface OrganizationHierarchyDeliveriesResponse {
  cache_month: string;
  mtd_start: string;
  mtd_end: string;
  drilldown?: string;
  drilldown_label?: string;
  ref_date?: string;
  total_deliveries: number;
  diretorias: OrganizationHierarchyDeliveriesDiretoriaRow[];
}

function pickOptionalString(
  obj: Record<string, unknown>,
  keys: string[]
): string | undefined {
  const value = pickFirstNonEmptyString(obj, keys);
  return value ?? undefined;
}

function pickNullableString(obj: Record<string, unknown>, keys: string[]): string | null {
  return pickFirstNonEmptyString(obj, keys) ?? null;
}

function pickOptionalNumber(obj: Record<string, unknown>, keys: string[]): number | null | undefined {
  for (const key of keys) {
    const raw = obj[key];
    if (raw == null || raw === '') {
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

function pickOptionalBoolean(obj: Record<string, unknown>, keys: string[]): boolean | null | undefined {
  for (const key of keys) {
    const raw = obj[key];
    if (raw == null || raw === '') {
      continue;
    }
    if (typeof raw === 'boolean') {
      return raw;
    }
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'sim') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'nao' || normalized === 'não') {
        return false;
      }
    }
  }
  return undefined;
}

function normalizeOrganizationHierarchyDeliveryRow(
  raw: unknown
): OrganizationHierarchyDeliveryRow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const delivery_id =
    pickFirstNonEmptyString(o, ['delivery_id', 'deliveryId', 'action_id', 'actionId']) ?? '';
  const action_name = pickOptionalString(o, ['action_name', 'actionName', 'action_title', 'actionTitle']);
  const action_title = pickOptionalString(o, ['action_title', 'actionTitle', 'action_name', 'actionName']);
  const client_name = pickOptionalString(o, ['client_name', 'clientName']);
  let delivery_title = pickFirstNonEmptyString(o, [
    'delivery_title',
    'deliveryTitle',
    'action_title',
    'actionTitle',
    'action_name',
    'actionName',
    'title'
  ]);
  if (!delivery_title && delivery_id) {
    delivery_title = delivery_id;
  }
  if (!delivery_title) {
    return null;
  }

  const issueKindRaw = pickOptionalString(o, ['issue_kind', 'issueKind']);
  const issue_kind: CriticalClientIssueKind | null =
    issueKindRaw === 'overdue' || issueKindRaw === 'late_finish' ? issueKindRaw : null;

  return {
    delivery_id,
    delivery_title,
    action_name,
    action_title,
    company_serve_key: pickNullableString(o, ['company_serve_key', 'companyServeKey']),
    company_cnpj_digits: pickNullableString(o, ['company_cnpj_digits', 'companyCnpjDigits']),
    issue_kind,
    user_action_id: pickNullableString(o, ['user_action_id', 'userActionId']),
    client_key: pickNullableString(o, [
      'client_name',
      'clientName',
      'client_key',
      'clientKey',
      'emp_title',
      'empTitle'
    ]),
    client_name,
    dt_prazo: pickNullableString(o, ['dt_prazo', 'dtPrazo']),
    dt_atraso: pickNullableString(o, ['dt_atraso', 'dtAtraso']),
    status: pickOptionalString(o, ['status']),
    status_calc: pickOptionalString(o, ['status_calc', 'statusCalc']),
    points: pickOptionalNumber(o, ['points']),
    finished_at: pickNullableString(o, ['finished_at', 'finishedAt']),
    is_justificada: pickOptionalBoolean(o, ['is_justificada', 'isJustificada']),
    player_email:
      pickFirstNonEmptyString(o, ['player_email', 'playerEmail', 'user_email', 'userEmail']) ?? '',
    player_name: pickNullableString(o, ['player_name', 'playerName']),
    team_id: pickFirstNonEmptyString(o, ['team_id', 'teamId']) ?? '',
    team_name: pickNullableString(o, ['team_name', 'teamName'])
  };
}

function normalizeOrganizationHierarchyDeliveriesSupervisorRow(
  raw: unknown
): OrganizationHierarchyDeliveriesSupervisorRow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const node_id = pickFirstNonEmptyString(o, ['node_id', 'nodeId']) ?? '';
  const label = pickFirstNonEmptyString(o, ['label']) ?? node_id;
  const deliveries = Array.isArray(o['deliveries'])
    ? o['deliveries']
        .map(item => normalizeOrganizationHierarchyDeliveryRow(item))
        .filter((item): item is OrganizationHierarchyDeliveryRow => item != null)
    : [];
  const delivery_count = Number(o['delivery_count'] ?? o['deliveryCount']);
  return {
    node_id,
    label,
    delivery_count: Number.isFinite(delivery_count) ? delivery_count : deliveries.length,
    deliveries
  };
}

function normalizeOrganizationHierarchyDeliveriesGerenciaRow(
  raw: unknown
): OrganizationHierarchyDeliveriesGerenciaRow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const node_id = pickFirstNonEmptyString(o, ['node_id', 'nodeId']) ?? '';
  const label = pickFirstNonEmptyString(o, ['label']) ?? node_id;
  const supervisoes = Array.isArray(o['supervisoes'])
    ? o['supervisoes']
        .map(item => normalizeOrganizationHierarchyDeliveriesSupervisorRow(item))
        .filter((item): item is OrganizationHierarchyDeliveriesSupervisorRow => item != null)
    : [];
  const delivery_count = Number(o['delivery_count'] ?? o['deliveryCount']);
  return {
    node_id,
    label,
    delivery_count: Number.isFinite(delivery_count)
      ? delivery_count
      : supervisoes.reduce((sum, sup) => sum + sup.delivery_count, 0),
    supervisoes
  };
}

function normalizeOrganizationHierarchyDeliveriesDiretoriaRow(
  raw: unknown
): OrganizationHierarchyDeliveriesDiretoriaRow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const node_id = pickFirstNonEmptyString(o, ['node_id', 'nodeId']) ?? '';
  const label = pickFirstNonEmptyString(o, ['label']) ?? node_id;
  const gerencias = Array.isArray(o['gerencias'])
    ? o['gerencias']
        .map(item => normalizeOrganizationHierarchyDeliveriesGerenciaRow(item))
        .filter((item): item is OrganizationHierarchyDeliveriesGerenciaRow => item != null)
    : [];
  const delivery_count = Number(o['delivery_count'] ?? o['deliveryCount']);
  return {
    node_id,
    label,
    delivery_count: Number.isFinite(delivery_count)
      ? delivery_count
      : gerencias.reduce((sum, ger) => sum + ger.delivery_count, 0),
    gerencias
  };
}

/** Normaliza payload de `/deliveries` e `/multa-risk` (aliases de campo da API). */
export function normalizeOrganizationHierarchyDeliveriesResponse(
  body: unknown
): OrganizationHierarchyDeliveriesResponse | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const o = body as Record<string, unknown>;
  const diretorias = Array.isArray(o['diretorias'])
    ? o['diretorias']
        .map(item => normalizeOrganizationHierarchyDeliveriesDiretoriaRow(item))
        .filter((item): item is OrganizationHierarchyDeliveriesDiretoriaRow => item != null)
    : [];
  const total_deliveries = Number(o['total_deliveries'] ?? o['totalDeliveries']);
  return {
    cache_month:
      pickFirstNonEmptyString(o, ['cache_month', 'cacheMonth']) ??
      pickFirstNonEmptyString(o, ['month']) ??
      '',
    mtd_start: pickFirstNonEmptyString(o, ['mtd_start', 'mtdStart']) ?? '',
    mtd_end: pickFirstNonEmptyString(o, ['mtd_end', 'mtdEnd']) ?? '',
    drilldown: pickOptionalString(o, ['drilldown']),
    drilldown_label: pickOptionalString(o, ['drilldown_label', 'drilldownLabel']),
    ref_date: pickOptionalString(o, ['ref_date', 'refDate']),
    total_deliveries: Number.isFinite(total_deliveries)
      ? total_deliveries
      : diretorias.reduce((sum, dir) => sum + dir.delivery_count, 0),
    diretorias
  };
}

export interface Game4uReportsOrganizationHierarchyDeliveriesQuery {
  month: string;
  drilldown: OrgHierarchyDeliveriesDrilldownKey;
  node_type?: OrgHierarchyNodeType | string;
  node_id?: string;
  company_serve_key?: string;
  issue?: CriticalClientIssueFilter;
  /** Cliente crítico: `true` lista cada user_action do score (paridade com contadores MTD). */
  all_scoring_events?: boolean;
}

/** @deprecated Prefer {@link OrganizationHierarchyDeliveryRow} */
export type OrganizationHierarchyMultaRiskDeliveryRow = OrganizationHierarchyDeliveryRow;

/** @deprecated Prefer {@link OrganizationHierarchyDeliveriesSupervisorRow} */
export type OrganizationHierarchyMultaRiskSupervisorRow = OrganizationHierarchyDeliveriesSupervisorRow;

/** @deprecated Prefer {@link OrganizationHierarchyDeliveriesGerenciaRow} */
export type OrganizationHierarchyMultaRiskGerenciaRow = OrganizationHierarchyDeliveriesGerenciaRow;

/** @deprecated Prefer {@link OrganizationHierarchyDeliveriesDiretoriaRow} */
export type OrganizationHierarchyMultaRiskDiretoriaRow = OrganizationHierarchyDeliveriesDiretoriaRow;

/** @deprecated Prefer {@link OrganizationHierarchyDeliveriesResponse} */
export type OrganizationHierarchyMultaRiskResponse = OrganizationHierarchyDeliveriesResponse;

export interface Game4uReportsOrganizationHierarchyMultaRiskQuery {
  month: string;
  node_type?: OrgHierarchyNodeType | string;
  node_id?: string;
}

/** Query para `GET /game/reports/organization/hierarchy-report`. */
export interface Game4uReportsOrganizationHierarchyQuery {
  month: string;
  simulation_pot_brl?: number;
  depth?: number;
  node_type?: OrgHierarchyNodeType;
  node_id?: string;
}

export type OrgHierarchyInsightsFocus =
  | 'risks_and_actions'
  | 'performance'
  | 'people'
  | 'financial';

export type OrgHierarchyInsightPriority = 'high' | 'medium' | 'low';

export type OrgHierarchyInsightCategory =
  | 'risk'
  | 'performance'
  | 'opportunity'
  | 'people'
  | string;

/** Item de insight retornado por `GET|POST /game/reports/organization/hierarchy-insights`. */
export interface OrganizationHierarchyInsightItem {
  priority: OrgHierarchyInsightPriority | string;
  category: OrgHierarchyInsightCategory;
  title: string;
  evidence: string[];
  suggested_action: string;
  owner_hint?: string;
  metric_refs?: string[];
}

/** Resposta de insights do relatório organizacional (memória Supabase). */
export interface OrganizationHierarchyInsightsResponse {
  generated_at: string;
  from_cache: boolean;
  params: OrganizationHierarchyReportParams;
  summary: string;
  insights: OrganizationHierarchyInsightItem[];
  llm_provider?: string;
  llm_model?: string;
  scope_key?: string;
}

/** Query para `GET|POST /game/reports/organization/hierarchy-insights` (escopo na query string). */
export interface Game4uReportsOrganizationHierarchyInsightsQuery {
  month: string;
  simulation_pot_brl?: number;
  depth?: number;
  node_type?: OrgHierarchyNodeType | string;
  node_id?: string;
  focus?: OrgHierarchyInsightsFocus;
}

/** Body opcional do `POST /game/reports/organization/hierarchy-insights`. */
export interface Game4uReportsOrganizationHierarchyInsightsBody {
  focus?: OrgHierarchyInsightsFocus;
}

/** Fase do pipeline em `GET /game/reports/pipeline-integration/changes`. */
export type PipelineIntegrationPhase =
  | 'reconcile'
  | 'ingest'
  | 'transform'
  | 'sync'
  | string;

/** Query `GET /game/reports/pipeline-integration/changes` (`pipeline_integracao_changes`). */
export interface Game4uReportsPipelineIntegrationChangesQuery {
  /** Início do intervalo (ISO 8601). */
  start: string;
  /** Fim do intervalo (ISO 8601). */
  end: string;
  phase?: PipelineIntegrationPhase;
  limit?: number;
  offset?: number;
}

/** Linha de `pipeline_integracao_changes` (campos normalizados na leitura). */
export interface PipelineIntegrationChangeRow {
  id?: string | number;
  run_id?: string;
  applied_at?: string;
  rule?: string;
  action_kind?: string;
  email?: string;
  entity_type?: string;
  success?: boolean;
  error_message?: string | null;
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
  detail_summary?: string;
  run?: {
    id?: string;
    phase?: string;
    trigger?: string;
    status?: string;
    started_at?: string;
    finished_at?: string;
  };
  phase?: string;
  entity_id?: string;
  table_name?: string;
  record_key?: string;
  field_name?: string;
  column_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  value_before?: unknown;
  value_after?: unknown;
  changed_at?: string;
  created_at?: string;
  recorded_at?: string;
  batch_id?: string;
  delivery_id?: string;
  action_id?: string;
  user_email?: string;
  details?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

export interface PipelineIntegrationChangesSummary {
  total_changes?: number;
  success_count?: number;
  failed_count?: number;
  distinct_emails?: number;
  distinct_runs?: number;
  by_action_kind?: Record<string, number>;
}

/** Resposta paginada de `GET /game/reports/pipeline-integration/changes`. */
export interface Game4uReportsPipelineIntegrationChangesPage {
  items: PipelineIntegrationChangeRow[];
  total?: number;
  limit: number;
  offset?: number;
  start?: string;
  end?: string;
  phase?: string;
  has_more?: boolean;
  summary?: PipelineIntegrationChangesSummary;
  params?: Record<string, unknown>;
}

function formatPipelineChangeValue(value: unknown): string {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** @deprecated Prefer {@link pipelineChangeAppliedAt} from pipeline-integration-changes.mapper */
export function pipelineChangeTimestamp(row: PipelineIntegrationChangeRow): string | null {
  const raw = row.applied_at ?? row.changed_at ?? row.created_at ?? row.recorded_at;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** @deprecated Prefer diff helpers from pipeline-integration-changes.mapper */
export function pipelineChangeFieldName(row: PipelineIntegrationChangeRow): string {
  const raw = row.field_name ?? row.column_name ?? row['field'];
  return typeof raw === 'string' ? raw.trim() : '';
}

/** @deprecated Prefer {@link pipelineChangeBeforeJson} */
export function pipelineChangeOldValue(row: PipelineIntegrationChangeRow): string {
  const snapshot = row.before_json ?? row.old_value ?? row.value_before ?? row['before_value'];
  return formatPipelineChangeValue(snapshot);
}

/** @deprecated Prefer {@link pipelineChangeAfterJson} */
export function pipelineChangeNewValue(row: PipelineIntegrationChangeRow): string {
  const snapshot = row.after_json ?? row.new_value ?? row.value_after ?? row['after_value'];
  return formatPipelineChangeValue(snapshot);
}

export function pipelineChangeEntityLabel(row: PipelineIntegrationChangeRow): string {
  const email = (row.email ?? row.user_email ?? '').toString().trim();
  const type = (row.entity_type ?? row.table_name ?? '').toString().trim();
  if (email && type) {
    return `${email} (${type})`;
  }
  return email || type || '—';
}

export function normalizePipelineIntegrationChangesResponse(
  body: unknown
): Game4uReportsPipelineIntegrationChangesPage {
  const empty: Game4uReportsPipelineIntegrationChangesPage = { items: [], limit: 100 };
  if (!body || typeof body !== 'object') {
    return empty;
  }
  const o = body as Record<string, unknown>;
  const raw = o['items'] ?? o['data'] ?? o['results'] ?? o['changes'];
  const items = Array.isArray(raw) ? (raw as PipelineIntegrationChangeRow[]) : [];
  const limRaw = o['limit'];
  const limit =
    typeof limRaw === 'number' && Number.isFinite(limRaw)
      ? Math.floor(limRaw)
      : typeof limRaw === 'string' && limRaw.trim() !== ''
        ? Math.floor(Number(limRaw)) || items.length || 100
        : items.length > 0
          ? items.length
          : 100;
  const offRaw = o['offset'];
  const offset =
    typeof offRaw === 'number' && Number.isFinite(offRaw)
      ? Math.floor(offRaw)
      : typeof offRaw === 'string' && offRaw.trim() !== ''
        ? Math.floor(Number(offRaw)) || 0
        : undefined;
  const summaryRaw = o['summary'];
  const summary =
    summaryRaw && typeof summaryRaw === 'object'
      ? (summaryRaw as PipelineIntegrationChangesSummary)
      : undefined;
  const totalRaw = o['total'] ?? o['count'] ?? summary?.total_changes;
  const total =
    typeof totalRaw === 'number' && Number.isFinite(totalRaw)
      ? Math.floor(totalRaw)
      : typeof totalRaw === 'string' && totalRaw.trim() !== ''
        ? Math.floor(Number(totalRaw))
        : undefined;
  const params =
    o['params'] && typeof o['params'] === 'object'
      ? (o['params'] as Record<string, unknown>)
      : undefined;
  const hasMore = typeof o['has_more'] === 'boolean' ? o['has_more'] : undefined;
  const start =
    typeof o['start'] === 'string'
      ? o['start']
      : typeof params?.['start'] === 'string'
        ? params['start']
        : undefined;
  const end =
    typeof o['end'] === 'string'
      ? o['end']
      : typeof params?.['end'] === 'string'
        ? params['end']
        : undefined;
  const phase =
    typeof o['phase'] === 'string'
      ? o['phase']
      : typeof params?.['phase'] === 'string'
        ? params['phase']
        : undefined;
  return {
    items,
    limit,
    ...(offset != null ? { offset } : {}),
    ...(total != null && Number.isFinite(total) ? { total } : {}),
    ...(hasMore != null ? { has_more: hasMore } : {}),
    ...(summary ? { summary } : {}),
    ...(params ? { params } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(phase ? { phase } : {})
  };
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
