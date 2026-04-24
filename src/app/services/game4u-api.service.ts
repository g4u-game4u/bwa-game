import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  Game4uDeliveryModel,
  Game4uUserActionModel,
  Game4uUserActionStatsResponse,
  Game4uUserActionStatus,
  Game4uDeliveryStatus,
  Game4uTeamScopedQuery,
  Game4uUserScopedQuery
} from '@model/game4u-api.model';
import { Game4uSupabaseFallbackService } from './game4u-supabase-fallback.service';

export type { Game4uDateRangeQuery, Game4uTeamScopedQuery, Game4uUserScopedQuery } from '@model/game4u-api.model';

@Injectable({
  providedIn: 'root'
})
export class Game4uApiService {
  private readonly baseUrl: string;

  constructor(
    private http: HttpClient,
    private supabaseFallback: Game4uSupabaseFallbackService
  ) {
    this.baseUrl = (environment.backend_url_base || '').trim().replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  private useSupabaseOnHttpFailure(): boolean {
    return (
      environment.useGame4uSupabaseFallback !== false && this.supabaseFallback.isAvailable()
    );
  }

  private httpOrSupabase<T>(
    http$: Observable<T>,
    supabase$: Observable<T>,
    label: string
  ): Observable<T> {
    return http$.pipe(
      catchError(err => {
        if (this.useSupabaseOnHttpFailure()) {
          console.warn(`[Game4U] ${label}: HTTP falhou, usando Supabase.`, err);
          return supabase$;
        }
        return throwError(() => err);
      })
    );
  }

  /** Intervalo ISO para o mês calendário ou temporada ampla quando `month` é undefined. */
  toQueryRange(month?: Date): { start: string; end: string } {
    if (!month) {
      return {
        start: new Date('2000-01-01T00:00:00.000Z').toISOString(),
        end: new Date('2099-12-31T23:59:59.999Z').toISOString()
      };
    }
    const y = month.getFullYear();
    const m = month.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  toIsoRange(start: Date, end: Date): { start: string; end: string } {
    return { start: start.toISOString(), end: end.toISOString() };
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      client_id: environment.client_id || ''
    });
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
    if (!this.isConfigured()) {
      if (this.supabaseFallback.isAvailable()) {
        return this.supabaseFallback.getGameStats(q);
      }
      return throwError(
        () => new Error('[Game4U] stats: defina backend_url_base ou Supabase (URL + chave).')
      );
    }
    const params = new HttpParams()
      .set('start', q.start)
      .set('end', q.end)
      .set('user', q.user);
    const http$ = this.http.get<Game4uUserActionStatsResponse>(`${this.baseUrl}/game/stats`, {
      headers: this.headers(),
      params
    });
    return this.httpOrSupabase(http$, this.supabaseFallback.getGameStats(q), 'stats');
  }

  getGameActions(
    q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    if (!this.isConfigured()) {
      if (this.supabaseFallback.isAvailable()) {
        return this.supabaseFallback.getGameActions(q);
      }
      return throwError(
        () => new Error('[Game4U] actions: defina backend_url_base ou Supabase (URL + chave).')
      );
    }
    let params = new HttpParams().set('start', q.start).set('end', q.end).set('user', q.user);
    if (q.status) {
      params = params.set('status', q.status);
    }
    const http$ = this.http.get<Game4uUserActionModel[]>(`${this.baseUrl}/game/actions`, {
      headers: this.headers(),
      params
    });
    return this.httpOrSupabase(http$, this.supabaseFallback.getGameActions(q), 'actions');
  }

  getGameDeliveries(
    q: Game4uUserScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    if (!this.isConfigured()) {
      if (this.supabaseFallback.isAvailable()) {
        return this.supabaseFallback.getGameDeliveries(q);
      }
      return throwError(
        () => new Error('[Game4U] deliveries: defina backend_url_base ou Supabase (URL + chave).')
      );
    }
    const params = new HttpParams()
      .set('start', q.start.slice(0, 10))
      .set('end', q.end.slice(0, 10))
      .set('user', q.user)
      .set('status', q.status);
    const http$ = this.http.get<Game4uDeliveryModel[]>(`${this.baseUrl}/game/deliveries`, {
      headers: this.headers(),
      params
    });
    return this.httpOrSupabase(http$, this.supabaseFallback.getGameDeliveries(q), 'deliveries');
  }

  getGameTeamStats(q: Game4uTeamScopedQuery): Observable<Game4uUserActionStatsResponse> {
    if (!this.isConfigured()) {
      if (this.supabaseFallback.isAvailable()) {
        return this.supabaseFallback.getGameTeamStats(q);
      }
      return throwError(
        () => new Error('[Game4U] team-stats: defina backend_url_base ou Supabase (URL + chave).')
      );
    }
    const params = new HttpParams().set('start', q.start).set('end', q.end).set('team', q.team);
    const http$ = this.http.get<Game4uUserActionStatsResponse>(`${this.baseUrl}/game/team-stats`, {
      headers: this.headers(),
      params
    });
    return this.httpOrSupabase(http$, this.supabaseFallback.getGameTeamStats(q), 'team-stats');
  }

  getGameTeamActions(
    q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    if (!this.isConfigured()) {
      if (this.supabaseFallback.isAvailable()) {
        return this.supabaseFallback.getGameTeamActions(q);
      }
      return throwError(
        () => new Error('[Game4U] team-actions: defina backend_url_base ou Supabase (URL + chave).')
      );
    }
    let params = new HttpParams().set('start', q.start).set('end', q.end);
    params = params.set('team', q.team);
    if (q.status) {
      params = params.set('status', q.status);
    }
    const http$ = this.http.get<Game4uUserActionModel[]>(`${this.baseUrl}/game/team-actions`, {
      headers: this.headers(),
      params
    });
    return this.httpOrSupabase(http$, this.supabaseFallback.getGameTeamActions(q), 'team-actions');
  }

  getGameTeamDeliveries(
    q: Game4uTeamScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    if (!this.isConfigured()) {
      if (this.supabaseFallback.isAvailable()) {
        return this.supabaseFallback.getGameTeamDeliveries(q);
      }
      return throwError(
        () =>
          new Error('[Game4U] team-deliveries: defina backend_url_base ou Supabase (URL + chave).')
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
