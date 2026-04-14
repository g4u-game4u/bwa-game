import { Injectable } from '@angular/core';
import { ApiProvider } from '@providers/api.provider';
import { environment } from '../../environments/environment';
import { SystemParamsService } from './system-params.service';

export interface ReceitaConcedidaGoalsKpi {
  current: number;
  target: number;
  percent: number;
}

/**
 * Lê meta e valor acumulado de receita concedida via backend G4U:
 * ID do template: env → system param `receita_concedida_goal_template_id` → heurística em GET /goals/templates;
 * depois GET `/goals/logs` (lista completa), filtro por `goal_template_id` === template resolvido;
 * se não houver linha, fallback por título «Receita concedida» (evita env com UUID errado).
 */
@Injectable({ providedIn: 'root' })
export class GoalsReceitaBackendService {
  private templateIdCache: { id: string; at: number } | null = null;
  private static readonly TEMPLATE_CACHE_MS = 5 * 60 * 1000;

  constructor(
    private readonly api: ApiProvider,
    private readonly systemParams: SystemParamsService
  ) {}

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
      const body = await this.api.get<unknown>('/goals/logs');
      const candidates = this.unwrapLogRows(body).filter(r => this.looksLikeGoalLogRow(r));
      const rows = this.pickReceitaLogRowsForKpi(candidates, templateId);
      return this.parseLogRows(rows, month);
    } catch (e) {
      console.warn('[GoalsReceitaBackend] indisponível:', e);
      return null;
    }
  }

  private async resolveGoalTemplateId(): Promise<string | null> {
    const now = Date.now();

    const fromEnv = this.readEnvTemplateId();
    if (fromEnv) {
      this.templateIdCache = { id: fromEnv, at: now };
      return fromEnv;
    }

    const fromParams = await this.readSystemParamTemplateId();
    if (fromParams) {
      this.templateIdCache = { id: fromParams, at: now };
      return fromParams;
    }

    if (
      this.templateIdCache &&
      now - this.templateIdCache.at < GoalsReceitaBackendService.TEMPLATE_CACHE_MS
    ) {
      return this.templateIdCache.id;
    }

    const body = await this.api.get<unknown>('/goals/templates');
    const list = this.unwrapArray(body);
    const picked =
      this.pickReceitaConcedidaTemplateId(list) ?? this.pickFirstTemplateIdFromList(list);
    const id = picked ?? this.extractTemplateIdFromRecord(body);
    if (id) {
      this.templateIdCache = { id, at: now };
    }
    return id;
  }

  private readEnvTemplateId(): string | null {
    const raw = environment.receitaConcedidaGoalTemplateId;
    if (typeof raw === 'string') {
      const t = raw.trim().replace(/^["']+|["']+$/g, '');
      if (t) {
        return t;
      }
    }
    return null;
  }

  private async readSystemParamTemplateId(): Promise<string | null> {
    try {
      const v = await this.systemParams.getParam<string>('receita_concedida_goal_template_id');
      if (v != null && String(v).trim()) {
        const t = String(v).trim().replace(/^["']+|["']+$/g, '');
        if (t) {
          return t;
        }
      }
    } catch {
      /* login / rede */
    }
    return null;
  }

  /** Primeiro ID na lista (fallback quando a heurística não encontra correspondência). */
  private pickFirstTemplateIdFromList(list: unknown[]): string | null {
    for (const item of list) {
      const id = this.extractTemplateIdFromRecord(item);
      if (id) {
        return id;
      }
    }
    return null;
  }

  /**
   * Escolhe o template mais provável de «receita / valor concedido» (vários templates na API).
   */
  private pickReceitaConcedidaTemplateId(list: unknown[]): string | null {
    let bestId: string | null = null;
    let bestScore = -1;
    for (const item of list) {
      const id = this.extractTemplateIdFromRecord(item);
      if (!id) {
        continue;
      }
      const score = this.scoreTemplateForReceita(item);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (bestId != null && bestScore > 0) {
      return bestId;
    }
    if (list.length > 0) {
      console.warn(
        '[GoalsReceitaBackend] Nenhum template em /goals/templates correspondeu à heurística de receita concedida. ' +
          'Defina RECEITA_CONCEDIDA_GOAL_TEMPLATE_ID (build) ou o system param receita_concedida_goal_template_id.'
      );
    }
    return null;
  }

  private scoreTemplateForReceita(item: unknown): number {
    if (item == null || typeof item !== 'object') {
      return 0;
    }
    const o = item as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of [
      'name',
      'title',
      'slug',
      'description',
      'type',
      'code',
      'key',
      'label',
      'metric_key',
      'metricKey',
      'goal_name',
      'goalName'
    ]) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) {
        parts.push(v);
      }
    }
    const hay = parts
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    let s = 0;
    if (hay.includes('receita') && hay.includes('conced')) {
      s += 12;
    }
    if (hay.includes('valor') && hay.includes('conced')) {
      s += 8;
    }
    if (hay.includes('receita concedida')) {
      s += 6;
    }
    if (hay.includes('omie')) {
      s += 2;
    }
    if (hay.includes('financeiro')) {
      s += 2;
    }
    if (hay.includes('billing')) {
      s += 2;
    }
    if (hay.includes('fatur')) {
      s += 1;
    }
    if (hay.includes('revenue')) {
      s += 1;
    }
    return s;
  }

  private unwrapArray(body: unknown): unknown[] {
    if (body == null) {
      return [];
    }
    if (Array.isArray(body)) {
      return body;
    }
    if (typeof body !== 'object') {
      return [];
    }
    const o = body as Record<string, unknown>;
    for (const key of [
      'goals_templates',
      'goal_templates',
      'templates',
      'items',
      'results',
      'rows',
      'data'
    ]) {
      const v = o[key];
      if (Array.isArray(v)) {
        return v;
      }
    }
    const nested = o['data'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return this.unwrapArray(nested);
    }
    return [];
  }

  /** ID num único registo de template (sem seguir `data` aninhado de outro recurso). */
  private extractTemplateIdFromRecord(src: unknown): string | null {
    if (src == null || typeof src !== 'object') {
      return null;
    }
    const o = src as Record<string, unknown>;
    for (const key of ['id', '_id', 'goal_template_id', 'goalTemplateId']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
      if (typeof v === 'number' && Number.isFinite(v)) {
        return String(Math.trunc(v));
      }
    }
    return null;
  }

  /** `goal_template_id` na raiz do log, em `data` ou em `extra` (várias formas da API G4U). */
  private extractGoalTemplateIdFromLog(row: unknown): string {
    if (row == null || typeof row !== 'object') {
      return '';
    }
    const o = row as Record<string, unknown>;
    const keys = ['goal_template_id', 'goalTemplateId', 'template_id', 'templateId'];
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) {
        return v.trim();
      }
      if (typeof v === 'number' && Number.isFinite(v)) {
        return String(Math.trunc(v));
      }
    }
    const data = o['data'];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const nested = this.extractGoalTemplateIdFromLog(data);
      if (nested) {
        return nested;
      }
    }
    const ex = o['extra'];
    if (ex && typeof ex === 'object') {
      const exo = ex as Record<string, unknown>;
      for (const k of keys) {
        const v = exo[k];
        if (typeof v === 'string' && v.trim()) {
          return v.trim();
        }
        if (typeof v === 'number' && Number.isFinite(v)) {
          return String(Math.trunc(v));
        }
      }
    }
    return '';
  }

  private rowMatchesGoalTemplate(row: unknown, templateId: string): boolean {
    const want = String(templateId || '').trim().toLowerCase();
    if (!want) {
      return false;
    }
    const got = this.extractGoalTemplateIdFromLog(row).trim().toLowerCase();
    return got !== '' && got === want;
  }

  private isReceitaConcedidaLogByTitle(row: unknown): boolean {
    if (row == null || typeof row !== 'object') {
      return false;
    }
    const t = String((row as Record<string, unknown>)['title'] || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return t.includes('receita') && t.includes('conced');
  }

  /**
   * Preferência: `goal_template_id` === template resolvido (env / system param / templates).
   * Se nada casar, usa linhas cujo título indica «receita concedida» (template na env por vezes é o id do *log* por engano).
   */
  private pickReceitaLogRowsForKpi(candidates: unknown[], templateId: string): unknown[] {
    const strict = candidates.filter(r => this.rowMatchesGoalTemplate(r, templateId));
    if (strict.length > 0) {
      return strict;
    }
    const byTitle = candidates.filter(r => this.isReceitaConcedidaLogByTitle(r));
    if (byTitle.length > 0) {
      const ids = [...new Set(candidates.map(r => this.extractGoalTemplateIdFromLog(r)).filter(Boolean))];
      console.warn(
        '[GoalsReceitaBackend] Nenhum log com goal_template_id igual ao template configurado; ' +
          'a usar filtro por título «Receita concedida». Confirme RECEITA_CONCEDIDA_GOAL_TEMPLATE_ID = goal_template_id do log (não o id do log).',
        { templateIdConfigurado: templateId, goal_template_ids_nos_logs: ids }
      );
      return byTitle;
    }
    return [];
  }

  private parseLogRows(rows: unknown[], month: Date): ReceitaConcedidaGoalsKpi | null {
    void month;
    if (rows.length === 0) {
      return null;
    }
    // Sempre o registo mais recente (por `updated_at` / `created_at`); evita ficar preso a um mês com `extra.reference_month` desatualizado.
    const row = this.pickLatestRow(rows);
    if (!row || typeof row !== 'object') {
      return null;
    }
    const o = row as Record<string, unknown>;

    const target = this.rowNum(o, [
      'current_goal_value',
      'currentGoalValue',
      'goal_value',
      'goalValue',
      'target_value',
      'targetValue',
      'meta',
      'meta_recebimento',
      'target'
    ]);
    const current = this.rowNum(o, [
      'cumulative_value',
      'cumulativeValue',
      'updated_value',
      'updatedValue',
      'valor_acumulado_recebido',
      'valor_acumulado',
      'value',
      'amount',
      'total',
      'valor',
      'current',
      'progress_value',
      'progressValue',
      'log_value',
      'logValue'
    ]);
    let percent = this.rowNum(o, [
      'cumulative_percentual_progress',
      'cumulativePercentualProgress',
      'updated_percentual_progress',
      'updatedPercentualProgress',
      'percent',
      'percentage',
      'progress_percent',
      'progressPercent'
    ]);

    if (!Number.isFinite(target) || target <= 0) {
      return null;
    }
    if (!Number.isFinite(current)) {
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
      for (const key of [
        'items',
        'logs',
        'goals_logs',
        'goal_logs',
        'records',
        'list',
        'results',
        'rows'
      ]) {
        const v = o[key];
        if (Array.isArray(v)) {
          return v;
        }
      }
      for (const key of ['payload', 'result', 'record', 'log', 'goal_log']) {
        const v = o[key];
        if (Array.isArray(v)) {
          return v;
        }
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
          const inner = this.unwrapLogRows(v);
          if (inner.length > 0) {
            return inner;
          }
        }
      }
      if (this.looksLikeGoalLogRow(o)) {
        return [o];
      }
      return [];
    }
    return [];
  }

  /** Evita tratar envelopes JSON (`{ ok, message }`) como linha de log. */
  private looksLikeGoalLogRow(x: unknown): boolean {
    if (x == null || typeof x !== 'object' || Array.isArray(x)) {
      return false;
    }
    const o = x as Record<string, unknown>;
    const keys = [
      'current_goal_value',
      'currentGoalValue',
      'goal_value',
      'goalValue',
      'target_value',
      'updated_value',
      'updatedValue',
      'cumulative_value',
      'cumulativeValue',
      'meta_recebimento',
      'valor_acumulado_recebido'
    ];
    for (const k of keys) {
      const v = o[k];
      if (v == null || v === '') {
        continue;
      }
      if (typeof v === 'number' || typeof v === 'bigint') {
        return true;
      }
      if (typeof v === 'string' && v.trim() !== '') {
        return true;
      }
    }
    const ex = o['extra'];
    if (ex && typeof ex === 'object') {
      const exo = ex as Record<string, unknown>;
      for (const k of keys) {
        const v = exo[k];
        if (v != null && v !== '' && (typeof v === 'number' || typeof v === 'bigint' || (typeof v === 'string' && v.trim() !== ''))) {
          return true;
        }
      }
    }
    const data = o['data'];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return this.looksLikeGoalLogRow(data);
    }
    return false;
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

  /**
   * Converte valores da API / Postgres (`numeric` em string, vírgula decimal, separadores de milhares).
   */
  private parseLooseNumber(v: unknown): number {
    if (v == null || v === '') {
      return NaN;
    }
    if (typeof v === 'number') {
      return Number.isFinite(v) ? v : NaN;
    }
    if (typeof v === 'bigint') {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    }
    if (typeof v === 'boolean') {
      return v ? 1 : 0;
    }
    if (typeof v !== 'string') {
      return NaN;
    }
    let s = v.trim().replace(/[\s\u00a0]/g, '');
    if (!s) {
      return NaN;
    }
    s = s.replace(/^[^\d.,+-]+/i, '').replace(/[^\d.,+-]+$/i, '');
    if (!s) {
      return NaN;
    }
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (lastComma >= 0) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  private num(...vals: unknown[]): number {
    for (const v of vals) {
      const n = this.parseLooseNumber(v);
      if (Number.isFinite(n)) {
        return n;
      }
    }
    return NaN;
  }

  /** Lê número na raiz do log e, em falta, em `extra`. */
  private rowNum(o: Record<string, unknown>, keys: readonly string[]): number {
    const direct = this.num(...keys.map(k => o[k]));
    if (Number.isFinite(direct)) {
      return direct;
    }
    const ex = o['extra'];
    if (ex && typeof ex === 'object') {
      const exo = ex as Record<string, unknown>;
      const nested = this.num(...keys.map(k => exo[k]));
      if (Number.isFinite(nested)) {
        return nested;
      }
    }
    const data = o['data'];
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      return this.num(...keys.map(k => d[k]));
    }
    return NaN;
  }
}
