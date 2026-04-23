import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Game4uDeliveryModel,
  Game4uUserActionModel,
  Game4uUserActionStatsResponse,
  Game4uUserActionStatus,
  Game4uDeliveryStatus
} from '@model/game4u-api.model';

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

@Injectable({
  providedIn: 'root'
})
export class Game4uApiService {
  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = (environment.game4uApiUrl || '').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
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
    const params = new HttpParams()
      .set('start', q.start)
      .set('end', q.end)
      .set('user', q.user);
    return this.http.get<Game4uUserActionStatsResponse>(`${this.baseUrl}/game/stats`, {
      headers: this.headers(),
      params
    });
  }

  getGameActions(
    q: Game4uUserScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    let params = new HttpParams().set('start', q.start).set('end', q.end).set('user', q.user);
    if (q.status) {
      params = params.set('status', q.status);
    }
    return this.http.get<Game4uUserActionModel[]>(`${this.baseUrl}/game/actions`, {
      headers: this.headers(),
      params
    });
  }

  getGameDeliveries(
    q: Game4uUserScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    const params = new HttpParams()
      .set('start', q.start.slice(0, 10))
      .set('end', q.end.slice(0, 10))
      .set('user', q.user)
      .set('status', q.status);
    return this.http.get<Game4uDeliveryModel[]>(`${this.baseUrl}/game/deliveries`, {
      headers: this.headers(),
      params
    });
  }

  getGameTeamStats(q: Game4uTeamScopedQuery): Observable<Game4uUserActionStatsResponse> {
    const params = new HttpParams().set('start', q.start).set('end', q.end).set('team', q.team);
    return this.http.get<Game4uUserActionStatsResponse>(`${this.baseUrl}/game/team-stats`, {
      headers: this.headers(),
      params
    });
  }

  getGameTeamActions(
    q: Game4uTeamScopedQuery & { status?: Game4uUserActionStatus }
  ): Observable<Game4uUserActionModel[]> {
    let params = new HttpParams().set('start', q.start).set('end', q.end);
    params = params.set('team', q.team);
    if (q.status) {
      params = params.set('status', q.status);
    }
    return this.http.get<Game4uUserActionModel[]>(`${this.baseUrl}/game/team-actions`, {
      headers: this.headers(),
      params
    });
  }

  getGameTeamDeliveries(
    q: Game4uTeamScopedQuery & { status: Game4uDeliveryStatus }
  ): Observable<Game4uDeliveryModel[]> {
    const params = new HttpParams()
      .set('start', q.start.slice(0, 10))
      .set('end', q.end.slice(0, 10))
      .set('status', q.status)
      .set('team', q.team);
    return this.http.get<Game4uDeliveryModel[]>(`${this.baseUrl}/game/team-deliveries`, {
      headers: this.headers(),
      params
    });
  }
}
