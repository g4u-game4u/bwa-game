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
  DOING?: Game4uActionStatBucket;
  DELIVERED?: Game4uActionStatBucket;
  PAID?: Game4uActionStatBucket;
}

export interface Game4uUserActionStatsResponse {
  stats: Game4uUserActionStatsModel[];
  total_actions: number;
  total_points: number;
  total_blocked_points: number;
  /** Quando presente, o painel usa `DONE`/`done` para tarefas e pontos “finalizados”. */
  action_stats?: Game4uActionStatsNested;
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
  [key: string]: unknown;
}

export interface Game4uDeliveryModel {
  id: string;
  created_at?: string;
  status?: Game4uDeliveryStatus;
  finished_at?: string;
  title?: string;
  [key: string]: unknown;
}

function supabaseGameFallbackCredentials(): boolean {
  const url = (environment.supabaseUrl || '').trim();
  const key = (
    (environment.supabaseServiceRoleKey || '').trim() ||
    (environment.supabaseAnonKey || '').trim()
  );
  return url.length > 0 && key.length > 0;
}

/** True quando dá para ler `/game/*` via HTTP (`backend_url_base`), ou Supabase só se o fallback estiver explícito. */
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
