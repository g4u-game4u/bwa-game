import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildGame4uQueryString } from '@utils/game4u-query-encode.util';

/**
 * Listagem de ações via Game4U: GET `/game/actions` (utilizador) ou GET `/game/team-actions` (equipa).
 * Query params: `start`, `end`, `user` ou `team`; paginação só com `next_page_token` (sem `page` em `/game/actions` nem `/game/team-actions`). Sem `per_page`.
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

  private userActionSearchUrl(): string {
    return `${this.g4uBase()}/user-action/search`;
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
   * `next_page_token` quando o gateway pagina (não enviar `page` — a API rejeita).
   */
  getGameActions(q: {
    start: string;
    end: string;
    user: string;
    status?: string;
    next_page_token?: string;
  }): Observable<unknown> {
    const entries: Record<string, string> = {
      start: q.start,
      end: q.end,
      user: q.user
    };
    if (q.status != null && String(q.status).trim() !== '') {
      entries['status'] = String(q.status).trim();
    }
    if (q.next_page_token != null && String(q.next_page_token).trim() !== '') {
      entries['next_page_token'] = String(q.next_page_token).trim();
    }
    const url = this.buildQueryUrl(this.gameActionsUrl(), entries);
    return this.http.get<unknown>(url, { headers: this.getHeaders() });
  }

  /**
   * GET `/game/team-actions?start=&end=&team=` — só `next_page_token` para continuar páginas (sem `page`).
   */
  getGameTeamActions(q: {
    start: string;
    end: string;
    team: string;
    next_page_token?: string;
  }): Observable<unknown> {
    const entries: Record<string, string> = {
      start: q.start,
      end: q.end,
      team: q.team
    };
    if (q.next_page_token != null && String(q.next_page_token).trim() !== '') {
      entries['next_page_token'] = String(q.next_page_token).trim();
    }
    const url = this.buildQueryUrl(this.gameTeamActionsUrl(), entries);
    return this.http.get<unknown>(url, { headers: this.getHeaders() });
  }

  /**
   * GET `/user-action/search` — alinhado ao `UserActionController_search` (delivery_id, status, `finished_at_*` ou `created_at_*`, limit, page | page_token, dismissed).
   * Query montada com o mesmo encoding de datas que `/game/actions`.
   */
  getUserActionSearch(entries: Record<string, string>): Observable<unknown> {
    const url = this.buildQueryUrl(this.userActionSearchUrl(), entries);
    return this.http.get<unknown>(url, { headers: this.getHeaders() });
  }
}
