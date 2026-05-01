import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { joinApiPath } from '../../environments/backend-url';

/**
 * Chamadas HTTP à API BWA para times (`GET .../team`, `GET .../team/:id`).
 * Usa URL absoluta com {@link joinApiPath} e o mesmo HttpClient + interceptor que o resto da app.
 */
@Injectable({ providedIn: 'root' })
export class BwaTeamApiService {
  constructor(private http: HttpClient) {}

  private baseUrl(): string {
    return (environment.backend_url_base || '').trim().replace(/\/+$/, '');
  }

  normalizeTeamListResponse(raw: unknown): any[] {
    if (raw == null) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === 'object' && raw !== null && 'data' in (raw as object)) {
      const d = (raw as { data: unknown }).data;
      if (Array.isArray(d)) {
        return d;
      }
    }
    return [];
  }

  /**
   * GET `{backend_url_base}/team`
   */
  async fetchTeamList(): Promise<any[]> {
    const b = this.baseUrl();
    if (!b) {
      console.error('[BwaTeamApi] backend_url_base vazio — defina G4U_API_BASE / BACKEND_URL_BASE no build.');
      return [];
    }
    const url = joinApiPath(b, 'team');
    console.log('[BwaTeamApi] GET', url);
    try {
      const raw = await firstValueFrom(this.http.get<any>(url));
      return this.normalizeTeamListResponse(raw);
    } catch (err) {
      console.error('[BwaTeamApi] falha GET lista:', url, err);
      return [];
    }
  }

  /**
   * GET `{backend_url_base}/team/{teamId}`
   */
  async fetchTeamDetail(teamId: string): Promise<any | null> {
    const b = this.baseUrl();
    if (!b) {
      console.error('[BwaTeamApi] backend_url_base vazio — defina G4U_API_BASE / BACKEND_URL_BASE no build.');
      return null;
    }
    const path = `team/${encodeURIComponent(teamId)}`;
    const url = joinApiPath(b, path);
    console.log('[BwaTeamApi] GET', url);
    try {
      return await firstValueFrom(this.http.get<any>(url));
    } catch (err) {
      console.warn('[BwaTeamApi] falha GET detalhe:', url, err);
      return null;
    }
  }
}
