import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import type {
  Game4uDeliveryModel,
  Game4uDeliveryStatus,
  Game4uUserActionModel,
  Game4uUserActionStatsResponse,
  Game4uUserActionStatus,
  Game4uTeamScopedQuery,
  Game4uUserScopedQuery
} from '@model/game4u-api.model';

/**
 * Fallback quando `GET /game/*` em `backend_url_base` falha ou não está disponível.
 * Lê tabelas no Supabase (mesmo schema que `supabaseDbSchema`, ex. public ou game4you).
 *
 * **Segurança:** `SUPABASE_SERVICE_ROLE_KEY` no bundle do browser ignora RLS — use só em
 * builds internos ou prefira `SUPABASE_ANON_KEY` + políticas RLS. Nunca commite a service role.
 */
@Injectable({
  providedIn: 'root'
})
export class Game4uSupabaseFallbackService {
  private client: SupabaseClient<any, string, string, any, any> | null = null;

  isAvailable(): boolean {
    return !!(this.getUrl() && this.getAuthKey() && this.actionsTable());
  }

  getGameStats(q: Game4uUserScopedQuery): Observable<Game4uUserActionStatsResponse> {
    return this.fetchUserActions(q).pipe(map(rows => this.buildStatsFromActions(rows)));
  }

  getGameActions(q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }): Observable<Game4uUserActionModel[]> {
    return this.fetchUserActions(q);
  }

  getGameDeliveries(
    q: Game4uUserScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    return from(this.runDeliveriesQuery(q));
  }

  getGameTeamStats(q: Game4uTeamScopedQuery): Observable<Game4uUserActionStatsResponse> {
    return this.fetchTeamActions(q).pipe(map(rows => this.buildStatsFromActions(rows)));
  }

  getGameTeamActions(
    q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    return this.fetchTeamActions(q);
  }

  getGameTeamDeliveries(
    q: Game4uTeamScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    return from(this.runTeamDeliveriesQuery(q));
  }

  private getUrl(): string {
    return (environment.supabaseUrl || '').trim();
  }

  /** Service role se definida; senão anon (RLS deve permitir leitura). */
  private getAuthKey(): string {
    const role = (environment.supabaseServiceRoleKey || '').trim();
    if (role) {
      return role;
    }
    return (environment.supabaseAnonKey || '').trim();
  }

  private actionsTable(): string {
    return (environment.supabaseGameUserActionsTable || 'user_actions').trim() || 'user_actions';
  }

  private deliveriesTable(): string {
    return (environment.supabaseGameDeliveriesTable || 'deliveries').trim() || 'deliveries';
  }

  private teamFilterColumn(): string {
    return (environment.supabaseGameTeamFilterColumn || 'team_id').trim() || 'team_id';
  }

  private userEmailColumn(): string {
    return (environment.supabaseGameUserEmailColumn || 'user_email').trim() || 'user_email';
  }

  private getOrCreateClient(): SupabaseClient<any, string, string, any, any> | null {
    const url = this.getUrl();
    const key = this.getAuthKey();
    if (!url || !key) {
      return null;
    }
    if (!this.client) {
      const schema = (environment.supabaseDbSchema || 'public').trim() || 'public';
      this.client = createClient(url, key, { db: { schema } });
    }
    return this.client;
  }

  private fetchUserActions(
    q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    return from(this.runUserActionsQuery(q));
  }

  private fetchTeamActions(
    q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    return from(this.runTeamActionsQuery(q));
  }

  private async runUserActionsQuery(
    q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }
  ): Promise<Game4uUserActionModel[]> {
    const client = this.getOrCreateClient();
    if (!client) {
      throw new Error('Supabase fallback: cliente indisponível');
    }
    const col = this.userEmailColumn();
    let query = client
      .from(this.actionsTable())
      .select('*')
      .eq(col, q.user)
      .gte('created_at', q.start)
      .lte('created_at', q.end);
    if (q.status) {
      query = query.eq('status', q.status);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return (data || []).map(r => this.rowToUserAction(r as Record<string, unknown>));
  }

  private async runTeamActionsQuery(
    q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }
  ): Promise<Game4uUserActionModel[]> {
    const client = this.getOrCreateClient();
    if (!client) {
      throw new Error('Supabase fallback: cliente indisponível');
    }
    const teamCol = this.teamFilterColumn();
    let query = client
      .from(this.actionsTable())
      .select('*')
      .eq(teamCol, q.team)
      .gte('created_at', q.start)
      .lte('created_at', q.end);
    if (q.status) {
      query = query.eq('status', q.status);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return (data || []).map(r => this.rowToUserAction(r as Record<string, unknown>));
  }

  private async runDeliveriesQuery(
    q: Game4uUserScopedQuery & { status: Game4uDeliveryStatus }
  ): Promise<Game4uDeliveryModel[]> {
    const client = this.getOrCreateClient();
    if (!client) {
      throw new Error('Supabase fallback: cliente indisponível');
    }
    const col = this.userEmailColumn();
    const { data, error } = await client
      .from(this.deliveriesTable())
      .select('*')
      .eq(col, q.user)
      .eq('status', q.status)
      .gte('created_at', q.start)
      .lte('created_at', q.end);
    if (error) {
      throw error;
    }
    return (data || []).map(r => this.rowToDelivery(r as Record<string, unknown>));
  }

  private async runTeamDeliveriesQuery(
    q: Game4uTeamScopedQuery & { status: Game4uDeliveryStatus }
  ): Promise<Game4uDeliveryModel[]> {
    const client = this.getOrCreateClient();
    if (!client) {
      throw new Error('Supabase fallback: cliente indisponível');
    }
    const teamCol = this.teamFilterColumn();
    const { data, error } = await client
      .from(this.deliveriesTable())
      .select('*')
      .eq(teamCol, q.team)
      .eq('status', q.status)
      .gte('created_at', q.start)
      .lte('created_at', q.end);
    if (error) {
      throw error;
    }
    return (data || []).map(r => this.rowToDelivery(r as Record<string, unknown>));
  }

  private rowToUserAction(r: Record<string, unknown>): Game4uUserActionModel {
    return {
      id: String(r['id'] ?? ''),
      points: Math.floor(Number(r['points']) || 0),
      status: (r['status'] as Game4uUserActionStatus) || 'PENDING',
      finished_at: r['finished_at'] != null ? String(r['finished_at']) : undefined,
      created_at: String(r['created_at'] ?? ''),
      updated_at: r['updated_at'] != null ? String(r['updated_at']) : undefined,
      action_template_id: r['action_template_id'] != null ? String(r['action_template_id']) : undefined,
      delivery_id: r['delivery_id'] != null ? String(r['delivery_id']) : undefined,
      action_title: r['action_title'] != null ? String(r['action_title']) : undefined,
      delivery_title: r['delivery_title'] != null ? String(r['delivery_title']) : undefined,
      user_email: r['user_email'] ?? r['userEmail'],
      team_id: r['team_id'],
      team_name: r['team_name'],
      client_id: r['client_id'] != null ? String(r['client_id']) : undefined,
      integration_id: r['integration_id'],
      dismissed: Boolean(r['dismissed'])
    };
  }

  private rowToDelivery(r: Record<string, unknown>): Game4uDeliveryModel {
    return {
      id: String(r['id'] ?? ''),
      created_at: r['created_at'] != null ? String(r['created_at']) : undefined,
      status: r['status'] as Game4uDeliveryStatus | undefined,
      finished_at: r['finished_at'] != null ? String(r['finished_at']) : undefined,
      title: r['title'] != null ? String(r['title']) : undefined
    };
  }

  private buildStatsFromActions(actions: Game4uUserActionModel[]): Game4uUserActionStatsResponse {
    const byStatus = new Map<Game4uUserActionStatus, { count: number; total_points: number }>();
    let total_points = 0;
    let total_blocked_points = 0;
    let cancelled_actions_count = 0;
    let total_cancelled_points = 0;

    for (const a of actions) {
      const st = a.status;
      const pts = Math.floor(Number(a.points) || 0);
      total_points += pts;
      if (st === 'CANCELLED') {
        cancelled_actions_count++;
        total_cancelled_points += pts;
      }
      const cur = byStatus.get(st) || { count: 0, total_points: 0 };
      cur.count++;
      cur.total_points += pts;
      byStatus.set(st, cur);
    }

    const stats: Game4uUserActionStatsResponse['stats'] = [...byStatus.entries()].map(([status, v]) => ({
      status,
      count: v.count,
      total_points: v.total_points
    }));

    return {
      stats,
      total_actions: actions.length,
      total_points,
      total_blocked_points,
      total_cancelled_points,
      cancelled_actions_count
    };
  }
}
