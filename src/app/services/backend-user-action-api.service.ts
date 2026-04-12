import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildGame4uQueryString } from '@utils/game4u-query-encode.util';

/**
 * Listagem de ações via Game4U: GET `/game/actions` (utilizador) ou GET `/game/team-actions` (equipa).
 * Query params: `start`, `end`, `user` ou `team` (sem paginação no servidor — agregar no cliente se necessário).
 * O `AuthInterceptor` envia `client_id` e `Authorization`; aqui reforçamos `client_id`.
 */
@Injectable({ providedIn: 'root' })
export class BackendUserActionApiService {
  constructor(private http: HttpClient) {}

  private g4uBase(): string {
    return String(environment.g4u_api_base || environment.backend_url_base || '').replace(/\/$/, '');
  }

  private gameActionsUrl(): string {
    return `${this.g4uBase()}/game/actions`;
  }

  private gameTeamActionsUrl(): string {
    return `${this.g4uBase()}/game/team-actions`;
  }

  private buildQueryUrl(base: string, entries: Record<string, string>): string {
    const qs = buildGame4uQueryString(entries);
    return qs ? `${base}?${qs}` : base;
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      client_id: environment.client_id || ''
    });
  }

  /**
   * GET `/game/actions?start=&end=&user=` — `user` = e-mail do utilizador (ex.: query da API Game4U).
   * `status` opcional (ex.: DONE), como no cliente de referência.
   */
  getGameActions(q: { start: string; end: string; user: string; status?: string }): Observable<unknown> {
    const entries: Record<string, string> = {
      start: q.start,
      end: q.end,
      user: q.user
    };
    if (q.status != null && String(q.status).trim() !== '') {
      entries['status'] = String(q.status).trim();
    }
    const url = this.buildQueryUrl(this.gameActionsUrl(), entries);
    return this.http.get<unknown>(url, { headers: this.getHeaders() });
  }

  /**
   * GET `/game/team-actions?start=&end=&team=`
   */
  getGameTeamActions(q: { start: string; end: string; team: string }): Observable<unknown> {
    const url = this.buildQueryUrl(this.gameTeamActionsUrl(), {
      start: q.start,
      end: q.end,
      team: q.team
    });
    return this.http.get<unknown>(url, { headers: this.getHeaders() });
  }
}
