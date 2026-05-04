import { Injectable } from '@angular/core';
import { ApiProvider } from '@providers/api.provider';

export interface GoalsKpiResult {
  current: number;
  target: number;
}

/**
 * Reads Meta de Protocolo and Aposentadorias Concedidas KPI values
 * from the G4U goals API (/goals/logs).
 *
 * These are team-level (not per-player) cumulative KPIs stored as goal logs.
 * The most recent log entry per template is used.
 *
 * Template IDs (resolved by title heuristic if not configured):
 *   - Meta de Protocolo:            b96dd54a-2847-4267-b234-2bd02e63b118
 *   - Aposentadorias Concedidas:    126bfa2d-5845-4a3f-94d0-301b988dac33
 *
 * Log fields used:
 *   - current_goal_value  → target
 *   - updated_value       → current (realizado)
 */
@Injectable({ providedIn: 'root' })
export class GoalsKpiService {
  private static readonly CACHE_MS = 3 * 60 * 1000; // 3 minutes

  private cache: {
    metaProtocolo: { result: GoalsKpiResult | null; at: number } | null;
    aposentadorias: { result: GoalsKpiResult | null; at: number } | null;
  } = { metaProtocolo: null, aposentadorias: null };

  constructor(private readonly api: ApiProvider) {}

  /** Returns current/target for Meta de Protocolo from the most recent goals log. */
  async getMetaProtocolo(): Promise<GoalsKpiResult | null> {
    const now = Date.now();
    if (this.cache.metaProtocolo && now - this.cache.metaProtocolo.at < GoalsKpiService.CACHE_MS) {
      return this.cache.metaProtocolo.result;
    }
    const result = await this.fetchLatestForTitle('meta de protocolo');
    this.cache.metaProtocolo = { result, at: now };
    return result;
  }

  /** Returns current/target for Aposentadorias Concedidas from the most recent goals log. */
  async getAposentadoriasConcedidas(): Promise<GoalsKpiResult | null> {
    const now = Date.now();
    if (this.cache.aposentadorias && now - this.cache.aposentadorias.at < GoalsKpiService.CACHE_MS) {
      return this.cache.aposentadorias.result;
    }
    const result = await this.fetchLatestForTitle('aposentadorias');
    this.cache.aposentadorias = { result, at: now };
    return result;
  }

  /** Clears the in-memory cache (useful for testing). */
  clearCache(): void {
    this.cache = { metaProtocolo: null, aposentadorias: null };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchLatestForTitle(titleFragment: string): Promise<GoalsKpiResult | null> {
    try {
      const body = await this.api.get<unknown>('/goals/logs');
      const rows = this.unwrapRows(body);
      const fragment = titleFragment.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const matching = rows.filter(r => {
        const title = String((r as Record<string, unknown>)['title'] || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return title.includes(fragment);
      });

      if (matching.length === 0) {
        console.warn(`[GoalsKpiService] No log entries found for title fragment: "${titleFragment}"`);
        return null;
      }

      // Sort by updated_at descending — most recent first
      const sorted = [...matching].sort((a, b) => {
        const ta = this.parseTs((a as Record<string, unknown>)['updated_at']);
        const tb = this.parseTs((b as Record<string, unknown>)['updated_at']);
        return tb - ta;
      });

      const latest = sorted[0] as Record<string, unknown>;
      const target = this.parseNum(latest['current_goal_value']);
      const current = this.parseNum(latest['updated_value']);

      if (!Number.isFinite(target) || target <= 0) {
        console.warn(`[GoalsKpiService] Invalid target in log for "${titleFragment}":`, latest);
        return null;
      }
      if (!Number.isFinite(current)) {
        console.warn(`[GoalsKpiService] Invalid current value in log for "${titleFragment}":`, latest);
        return null;
      }

      return { current, target };
    } catch (e) {
      console.warn(`[GoalsKpiService] Failed to fetch goals logs for "${titleFragment}":`, e);
      return null;
    }
  }

  private unwrapRows(body: unknown): unknown[] {
    if (Array.isArray(body)) return body;
    if (body == null || typeof body !== 'object') return [];
    const o = body as Record<string, unknown>;
    for (const key of ['data', 'items', 'logs', 'results', 'rows']) {
      const v = o[key];
      if (Array.isArray(v)) return v;
    }
    return [];
  }

  private parseNum(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  private parseTs(v: unknown): number {
    if (typeof v === 'string') {
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    }
    if (typeof v === 'number') return v;
    return 0;
  }
}
