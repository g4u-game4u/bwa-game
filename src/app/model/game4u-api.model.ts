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
}

export interface Game4uTeamScopedQuery extends Game4uDateRangeQuery {
  team: string;
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

/** Query para `GET /game/reports/open/summary`: `email` + intervalo em `dt_prazo` (ISO 8601), não `finished_at_*`. */
export interface Game4uReportsOpenSummaryQuery {
  email: string;
  dt_prazo_start: string;
  dt_prazo_end: string;
}

/**
 * Linha normalizada de `GET /game/reports/finished/deliveries`.
 * Legado: array de strings (= só título). Atual: objetos com `delivery_id` tipo `41355-2026-03-01`
 * (prefixo numérico = EmpID no GET `/gamificacao`).
 */
export interface Game4uReportsFinishedDeliveryRow {
  delivery_title: string;
  delivery_id?: string;
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
      let delivery_title = pickFirstNonEmptyString(o, ['delivery_title', 'deliveryTitle', 'title']);
      if (!delivery_title && delivery_id) {
        delivery_title = delivery_id;
      }
      if (!delivery_title) {
        continue;
      }
      out.push(
        delivery_id
          ? { delivery_title, delivery_id }
          : { delivery_title }
      );
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

export interface Game4uReportsFinishedQuery {
  email: string;
  finished_at_start: string;
  finished_at_end: string;
  /** Opcional: repete `status` na query string se necessário. */
  status?: string[];
}

export interface Game4uReportsActionsByDeliveryQuery extends Game4uReportsFinishedQuery {
  delivery_title: string;
  offset?: number;
  limit?: number;
}

/** Resposta paginada de `GET /game/reports/finished/actions-by-delivery` (`items` + total). */
export interface Game4uReportsActionsByDeliveryPage {
  items: Game4uUserActionModel[];
  total: number;
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
  email: string;
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
  email: string;
  /** `YYYY-MM-DD` (início do mês). */
  dt_prazo_start: string;
  /** `YYYY-MM-DD` (exclusivo: primeiro dia do mês seguinte, como no curl do doc). */
  dt_prazo_end: string;
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
