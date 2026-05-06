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

  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

  private teamListCache: { timestamp: number; value: any[] } | null = null;
  private teamListPromise: Promise<any[]> | null = null;

  private teamDetailCache = new Map<string, { timestamp: number; value: any | null }>();
  private teamDetailPromises = new Map<string, Promise<any | null>>();

  private teamUsersCache = new Map<string, { timestamp: number; value: any[] }>();
  private teamUsersPromises = new Map<string, Promise<any[]>>();

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

  /** Resposta de `GET .../team/:id/users`: array direto ou `{ data | users }`. */
  normalizeTeamUsersResponse(raw: unknown): any[] {
    if (raw == null) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === 'object' && raw !== null) {
      const o = raw as Record<string, unknown>;
      if (Array.isArray(o['data'])) {
        return o['data'] as any[];
      }
      if (Array.isArray(o['users'])) {
        return o['users'] as any[];
      }
    }
    return [];
  }

  /**
   * GET `{backend_url_base}/team`
   */
  async fetchTeamList(): Promise<any[]> {
    const now = Date.now();
    if (this.teamListCache && now - this.teamListCache.timestamp < this.CACHE_DURATION) {
      return this.teamListCache.value;
    }
    if (this.teamListPromise) {
      return this.teamListPromise;
    }

    this.teamListPromise = (async () => {
      const b = this.baseUrl();
      if (!b) {
        console.error('[BwaTeamApi] backend_url_base vazio — defina G4U_API_BASE / BACKEND_URL_BASE no build.');
        const v: any[] = [];
        this.teamListCache = { timestamp: Date.now(), value: v };
        return v;
      }
      const url = joinApiPath(b, 'team');
      console.log('[BwaTeamApi] GET', url);
      try {
        const raw = await firstValueFrom(this.http.get<any>(url));
        const v = this.normalizeTeamListResponse(raw);
        this.teamListCache = { timestamp: Date.now(), value: v };
        return v;
      } catch (err) {
        console.error('[BwaTeamApi] falha GET lista:', url, err);
        const v: any[] = [];
        this.teamListCache = { timestamp: Date.now(), value: v };
        return v;
      } finally {
        this.teamListPromise = null;
      }
    })();

    return this.teamListPromise;
  }

  /**
   * GET `{backend_url_base}/team/{teamId}`
   */
  async fetchTeamDetail(teamId: string): Promise<any | null> {
    const tid = (teamId || '').trim();
    if (!tid) {
      return null;
    }
    const now = Date.now();
    const cached = this.teamDetailCache.get(tid);
    if (cached && now - cached.timestamp < this.CACHE_DURATION) {
      return cached.value;
    }
    const inFlight = this.teamDetailPromises.get(tid);
    if (inFlight) {
      return inFlight;
    }

    const p = (async () => {
      const b = this.baseUrl();
      if (!b) {
        console.error('[BwaTeamApi] backend_url_base vazio — defina G4U_API_BASE / BACKEND_URL_BASE no build.');
        this.teamDetailCache.set(tid, { timestamp: Date.now(), value: null });
        return null;
      }
      const path = `team/${encodeURIComponent(tid)}`;
      const url = joinApiPath(b, path);
      console.log('[BwaTeamApi] GET', url);
      try {
        const v = await firstValueFrom(this.http.get<any>(url));
        this.teamDetailCache.set(tid, { timestamp: Date.now(), value: v });
        return v;
      } catch (err) {
        console.warn('[BwaTeamApi] falha GET detalhe:', url, err);
        this.teamDetailCache.set(tid, { timestamp: Date.now(), value: null });
        return null;
      } finally {
        this.teamDetailPromises.delete(tid);
      }
    })();

    this.teamDetailPromises.set(tid, p);
    return p;
  }

  /**
   * GET `{backend_url_base}/team/{teamId}/users` — membros do time (BWA).
   */
  async fetchTeamUsers(teamId: string): Promise<any[]> {
    const b = this.baseUrl();
    const tid = (teamId || '').trim();
    if (!b || !tid) {
      if (!tid) {
        console.warn('[BwaTeamApi] fetchTeamUsers: teamId vazio');
      }
      return [];
    }

    const now = Date.now();
    const cached = this.teamUsersCache.get(tid);
    if (cached && now - cached.timestamp < this.CACHE_DURATION) {
      return cached.value;
    }
    const inFlight = this.teamUsersPromises.get(tid);
    if (inFlight) {
      return inFlight;
    }

    const path = `team/${encodeURIComponent(tid)}/users`;
    const url = joinApiPath(b, path);
    console.log('[BwaTeamApi] GET', url);

    const p = (async () => {
      try {
        const raw = await firstValueFrom(this.http.get<any>(url));
        const v = this.normalizeTeamUsersResponse(raw);
        this.teamUsersCache.set(tid, { timestamp: Date.now(), value: v });
        return v;
      } catch (err) {
        console.warn('[BwaTeamApi] falha GET users:', url, err);
        const v: any[] = [];
        this.teamUsersCache.set(tid, { timestamp: Date.now(), value: v });
        return v;
      } finally {
        this.teamUsersPromises.delete(tid);
      }
    })();

    this.teamUsersPromises.set(tid, p);
    return p;
  }

  clearCache(): void {
    this.teamListCache = null;
    this.teamListPromise = null;
    this.teamDetailCache.clear();
    this.teamDetailPromises.clear();
    this.teamUsersCache.clear();
    this.teamUsersPromises.clear();
  }
}
