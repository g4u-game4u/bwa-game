import { Injectable } from '@angular/core';
import dayjs from 'dayjs';
import { ApiProvider } from '@providers/api.provider';

export interface ReceitaConcedidaGoalsKpi {
  current: number;
  target: number;
  percent: number;
}

/**
 * Lê meta e valor acumulado de receita concedida via backend G4U:
 * GET /goals/templates → único template → GET /goals/logs?goal_template_id=...
 */
@Injectable({ providedIn: 'root' })
export class GoalsReceitaBackendService {
  private templateIdCache: { id: string; at: number } | null = null;
  private static readonly TEMPLATE_CACHE_MS = 5 * 60 * 1000;

  constructor(private readonly api: ApiProvider) {}

  /**
   * Tenta obter current/target para o KPI circular (financeiro).
   * `month` filtra por `extra.reference_month` === YYYY-MM quando a resposta é lista.
   */
  async tryGetReceitaConcedidaKpi(month: Date): Promise<ReceitaConcedidaGoalsKpi | null> {
    try {
      const templateId = await this.resolveGoalTemplateId();
      if (!templateId) {
        return null;
      }
      const body = await this.api.get<unknown>('/goals/logs', {
        params: { goal_template_id: templateId }
      });
      return this.parseLogsResponse(body, month);
    } catch (e) {
      console.warn('[GoalsReceitaBackend] indisponível:', e);
      return null;
    }
  }

  private async resolveGoalTemplateId(): Promise<string | null> {
    const now = Date.now();
    if (
      this.templateIdCache &&
      now - this.templateIdCache.at < GoalsReceitaBackendService.TEMPLATE_CACHE_MS
    ) {
      return this.templateIdCache.id;
    }
    const body = await this.api.get<unknown>('/goals/templates');
    const id = this.pickFirstTemplateId(body);
    if (id) {
      this.templateIdCache = { id, at: now };
    }
    return id;
  }

  private pickFirstTemplateId(body: unknown): string | null {
    const list = this.unwrapArray(body);
    for (const item of list) {
      const id = this.extractGoalTemplateId(item);
      if (id) {
        return id;
      }
    }
    return this.extractGoalTemplateId(body);
  }

  private unwrapArray(body: unknown): unknown[] {
    if (body == null) {
      return [];
    }
    if (Array.isArray(body)) {
      return body;
    }
    if (typeof body === 'object') {
      const o = body as Record<string, unknown>;
      for (const key of ['data', 'items', 'templates', 'results', 'rows']) {
        const v = o[key];
        if (Array.isArray(v)) {
          return v;
        }
      }
    }
    return [];
  }

  private extractGoalTemplateId(src: unknown): string | null {
    if (src == null || typeof src !== 'object') {
      return null;
    }
    const o = src as Record<string, unknown>;
    for (const key of ['id', 'goal_template_id', 'goalTemplateId']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
    const nested = o['data'];
    if (nested && typeof nested === 'object') {
      return this.extractGoalTemplateId(nested);
    }
    return null;
  }

  private parseLogsResponse(body: unknown, month: Date): ReceitaConcedidaGoalsKpi | null {
    const rows = this.unwrapLogRows(body);
    if (rows.length === 0) {
      return null;
    }
    const ym = dayjs(month).format('YYYY-MM');
    const withMonth = rows.filter((r) => this.rowReferenceMonth(r) === ym);
    const candidates = withMonth.length > 0 ? withMonth : rows;
    const row = this.pickLatestRow(candidates);
    if (!row || typeof row !== 'object') {
      return null;
    }
    const o = row as Record<string, unknown>;

    const target = this.num(
      o['current_goal_value'],
      o['currentGoalValue'],
      o['goal_value'],
      o['goalValue']
    );
    const current = this.num(
      o['cumulative_value'],
      o['cumulativeValue'],
      o['updated_value'],
      o['updatedValue']
    );
    let percent = this.num(
      o['cumulative_percentual_progress'],
      o['cumulativePercentualProgress'],
      o['updated_percentual_progress'],
      o['updatedPercentualProgress']
    );

    if (!Number.isFinite(target) || target <= 0) {
      return null;
    }
    if (!Number.isFinite(current) || current < 0) {
      return null;
    }
    if (!Number.isFinite(percent) || percent < 0) {
      percent = Math.min(100, Math.round((current / target) * 100));
    } else {
      percent = Math.min(100, Math.round(percent));
    }

    return { current, target, percent };
  }

  private unwrapLogRows(body: unknown): unknown[] {
    if (body == null) {
      return [];
    }
    if (Array.isArray(body)) {
      return body;
    }
    if (typeof body === 'object') {
      const o = body as Record<string, unknown>;
      if (o['data'] != null) {
        const inner = this.unwrapLogRows(o['data']);
        if (inner.length > 0) {
          return inner;
        }
      }
      for (const key of ['items', 'logs', 'results', 'rows']) {
        const v = o[key];
        if (Array.isArray(v)) {
          return v;
        }
      }
      return [body];
    }
    return [];
  }

  private rowReferenceMonth(row: unknown): string | null {
    if (row == null || typeof row !== 'object') {
      return null;
    }
    const extra = (row as Record<string, unknown>)['extra'];
    if (extra && typeof extra === 'object') {
      const ref = (extra as Record<string, unknown>)['reference_month'];
      if (typeof ref === 'string' && ref.trim()) {
        return ref.trim();
      }
    }
    return null;
  }

  private pickLatestRow(rows: unknown[]): unknown {
    if (rows.length === 1) {
      return rows[0];
    }
    let best: unknown = null;
    let bestTs = -1;
    for (const r of rows) {
      const ts = this.rowUpdatedTs(r);
      if (ts >= bestTs) {
        bestTs = ts;
        best = r;
      }
    }
    return best ?? rows[rows.length - 1];
  }

  private rowUpdatedTs(row: unknown): number {
    if (row == null || typeof row !== 'object') {
      return 0;
    }
    const o = row as Record<string, unknown>;
    for (const key of ['updated_at', 'updatedAt', 'created_at', 'createdAt']) {
      const v = o[key];
      if (typeof v === 'string') {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) {
          return t;
        }
      }
      if (typeof v === 'number' && Number.isFinite(v)) {
        return v;
      }
    }
    return 0;
  }

  private num(...vals: unknown[]): number {
    for (const v of vals) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        return v;
      }
      if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) {
          return n;
        }
      }
    }
    return NaN;
  }
}
