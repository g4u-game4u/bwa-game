import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Chamadas ao backend configurado em `environment.backend_url_base` (ex.: Game4U MVP API).
 * O `AuthInterceptor` também envia `client_id` e `Authorization` nas URLs do backend.
 */
@Injectable({ providedIn: 'root' })
export class BackendActionApiService {
  constructor(private http: HttpClient) {}

  private actionsUrl(): string {
    const base = (environment.backend_url_base || '').replace(/\/$/, '');
    return `${base}/action`;
  }

  /**
   * GET `/action` com header `client_id` (e demais headers do interceptor).
   */
  getActions(): Observable<unknown> {
    const headers = new HttpHeaders({
      client_id: environment.client_id || ''
    });
    return this.http.get<unknown>(this.actionsUrl(), { headers });
  }
}
