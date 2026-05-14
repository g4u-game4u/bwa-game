import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiProvider } from '@providers/api.provider';
import { APOSENTADORIAS_TARGET, META_PROTOCOLO_TARGET } from '../constants/kpi-targets.constants';

/**
 * Goal log row from GET /goals/logs
 */
export interface GoalLogRow {
  id: string;
  title: string;
  goal_template_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  complete: string | number;
  incomplete: string | number;
  current_goal_value: string | number;
  updated_value: string | number;
  updated_percentual_progress: string | number | null;
  cumulative_value: string | number;
  cumulative_percentual_progress: string | number | null;
  extra?: Record<string, unknown>;
}

/**
 * Parsed goal data for KPI display
 */
export interface GoalKpiData {
  id: string;
  title: string;
  current: number;
  target: number;
  percentage: number;
  updated_at: string;
}

/**
 * Service to fetch goals from G4U API
 */
@Injectable({
  providedIn: 'root'
})
export class GoalsApiService {
  // IDs de goal / action template em GET `/goals/logs` (logTemplateId = raiz ou extra).
  private readonly GOAL_TEMPLATE_IDS = {
    /** Volume de concessões — meta circular Jurídico/CS. */
    APOSENTADORIAS: '126bfa2d-5845-4a3f-94d0-301b988dac33',
    /** Receita concedida (circular / financeiro) — template único em `/goals/logs`. */
    RECEITA_CONCEDIDA: '75274eb5-0412-4c2b-8bcf-ac5c34ea904b',
    /** Valor de protocolos — meta circular Jurídico/CS. */
    META_PROTOCOLO: 'b96dd54a-2847-4267-b234-2bd02e63b118'
  };

  constructor(private api: ApiProvider) {}

  /**
   * Fetch all goal logs from the API
   */
  private fetchGoalLogs(): Observable<GoalLogRow[]> {
    return from(this.api.get<unknown>('/goals/logs')).pipe(
      map(response => {
        const logs = this.unwrapGoalLogs(response);
        console.log('📊 [Goals API] Successfully fetched', logs.length, 'goal logs');
        return logs;
      }),
      catchError(error => {
        console.error('📊 [Goals API] Error fetching goal logs:', error);
        console.warn('📊 [Goals API] Returning empty array, will use default values');
        // Return empty array so getAllKpisForTeam can provide defaults
        return of([]);
      })
    );
  }

  /**
   * Unwrap the API response to get the array of goal logs
   */
  private unwrapGoalLogs(body: unknown): GoalLogRow[] {
    if (!body) {
      return [];
    }
    if (Array.isArray(body)) {
      return body as GoalLogRow[];
    }
    if (typeof body === 'object' && body !== null) {
      const o = body as Record<string, unknown>;
      const listKeys = ['items', 'data', 'logs', 'goals_logs', 'goal_logs', 'results', 'records', 'rows'] as const;
      for (const k of listKeys) {
        if (Array.isArray(o[k])) {
          return o[k] as GoalLogRow[];
        }
      }
    }
    return [];
  }

  /**
   * Parse a numeric value from various formats (string, number, etc.)
   */
  private parseNumber(value: unknown): number {
    if (value == null || value === '') {
      return 0;
    }
    if (typeof value === 'number') {
      return isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      // Remove spaces and handle comma as decimal separator
      let s = value.trim().replace(/[\s\u00a0]/g, '');
      if (!s) {
        return 0;
      }
      // Handle Brazilian number format (1.234.567,89)
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma >= 0 && lastDot >= 0) {
        if (lastComma > lastDot) {
          // Brazilian format: 1.234,56
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          // US format: 1,234.56
          s = s.replace(/,/g, '');
        }
      } else if (lastComma >= 0) {
        // Only comma, assume decimal separator
        s = s.replace(',', '.');
      }
      const n = Number(s);
      return isFinite(n) ? n : 0;
    }
    return 0;
  }

  /** `goal_template_id` na raiz ou em `extra` (respostas G4U variadas). */
  private logTemplateId(log: GoalLogRow): string {
    const root = String(log.goal_template_id || '').trim();
    if (root) {
      return root;
    }
    const ex = log.extra?.['goal_template_id'] ?? log.extra?.['goalTemplateId'];
    if (typeof ex === 'string' && ex.trim()) {
      return ex.trim();
    }
    if (typeof ex === 'number' && Number.isFinite(ex)) {
      return String(Math.trunc(ex));
    }
    return '';
  }

  /**
   * Get the most recent log for a specific goal template ID
   */
  private getMostRecentLog(logs: GoalLogRow[], templateId: string): GoalLogRow | null {
    const want = String(templateId || '').trim().toLowerCase();
    const filtered = logs.filter(log => this.logTemplateId(log).toLowerCase() === want);
    if (filtered.length === 0) {
      return null;
    }
    // Sort by updated_at descending (most recent first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA;
    });
    return filtered[0];
  }

  /** `YYYY-MM` no fuso local (igual ao seletor de mês dos dashboards). */
  private formatMonthKeyFromDate(month: Date): string {
    const y = month.getFullYear();
    const m = month.getMonth() + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  /** Início e fim do mês de calendário local (inclusive), em ms desde epoch. */
  private selectedMonthWallRangeMs(selectedMonth: Date): { startMs: number; endMs: number } {
    const y = selectedMonth.getFullYear();
    const m = selectedMonth.getMonth();
    const startMs = new Date(y, m, 1, 0, 0, 0, 0).getTime();
    const endMs = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();
    return { startMs, endMs };
  }

  private logUpdatedAtInSelectedMonth(log: GoalLogRow, selectedMonth: Date): boolean {
    const t = new Date(log.updated_at).getTime();
    if (!isFinite(t)) {
      return false;
    }
    const { startMs, endMs } = this.selectedMonthWallRangeMs(selectedMonth);
    return t >= startMs && t <= endMs;
  }

  /** Valor bruto de `cumulative_value` na raiz do log ou em `extra` (respostas G4U variadas). */
  private cumulativeRawFromLog(log: GoalLogRow): unknown {
    const root = log.cumulative_value;
    if (root != null && !(typeof root === 'string' && (root as string).trim() === '')) {
      return root;
    }
    const ex = log.extra;
    if (ex && typeof ex === 'object') {
      return ex['cumulative_value'] ?? ex['cumulativeValue'];
    }
    return null;
  }

  /** `cumulative_value` presente e interpretável como número (0 é válido). */
  private logHasInterpretableCumulativeValue(log: GoalLogRow): boolean {
    const v = this.cumulativeRawFromLog(log);
    if (v == null) {
      return false;
    }
    if (typeof v === 'string' && v.trim() === '') {
      return false;
    }
    if (typeof v === 'number' && !isFinite(v)) {
      return false;
    }
    const n = this.parseNumber(v);
    return isFinite(n);
  }

  /**
   * Receita (financeiro): com mês seleccionado, só logs com `cumulative_value` utilizável e
   * `updated_at` nesse mês (calendário local).
   */
  private scopeGoalLogsForCircularMonth(logs: GoalLogRow[], selectedMonth?: Date): GoalLogRow[] {
    if (!selectedMonth) {
      return logs;
    }
    const scoped = logs.filter(
      l => this.logUpdatedAtInSelectedMonth(l, selectedMonth) && this.logHasInterpretableCumulativeValue(l)
    );
    console.log(
      '📊 [Goals API] Month scope (receita: updated_at + cumulative_value)',
      this.formatMonthKeyFromDate(selectedMonth),
      ':',
      scoped.length,
      '/',
      logs.length,
      'logs'
    );
    return scoped;
  }

  /**
   * Jurídico / CS: último log por `goal_template_id` com `updated_at` dentro do mês filtrado
   * (templates `126bfa2d-…` volume de concessões, `b96dd54a-…` valor de protocolos — sem exigir `cumulative_value`).
   */
  private scopeGoalLogsJurCsByUpdatedAtInMonth(logs: GoalLogRow[], selectedMonth?: Date): GoalLogRow[] {
    if (!selectedMonth) {
      return logs;
    }
    const scoped = logs.filter(l => this.logUpdatedAtInSelectedMonth(l, selectedMonth));
    console.log(
      '📊 [Goals API] Month scope (Jur/CS: updated_at in',
      this.formatMonthKeyFromDate(selectedMonth),
      '):',
      scoped.length,
      '/',
      logs.length,
      'logs'
    );
    return scoped;
  }

  /**
   * Get Aposentadorias Concedidas KPI data
   */
  getAposentadoriasConcedidas(): Observable<GoalKpiData | null> {
    return this.fetchGoalLogs().pipe(
      map(logs => {
        const log = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.APOSENTADORIAS);
        if (!log) {
          console.warn('📊 No goal log found for Aposentadorias Concedidas');
          return null;
        }
        return this.parseGoalLog(log);
      })
    );
  }

  /**
   * Get Receita Concedida KPI data (template único em `/goals/logs`).
   */
  getReceitaConcedida(): Observable<GoalKpiData | null> {
    return this.fetchGoalLogs().pipe(
      map(logs => {
        const log = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.RECEITA_CONCEDIDA);
        if (!log) {
          console.warn('📊 No goal log found for Receita Concedida');
          return null;
        }
        return this.parseGoalLog(log);
      })
    );
  }

  /**
   * Get Meta de Protocolo KPI data
   */
  getMetaProtocolo(): Observable<GoalKpiData | null> {
    return this.fetchGoalLogs().pipe(
      map(logs => {
        const log = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.META_PROTOCOLO);
        if (!log) {
          console.warn('📊 No goal log found for Meta de Protocolo');
          return null;
        }
        return this.parseGoalLog(log);
      })
    );
  }

  /** Linha sintética para demo (percentual = current/target × 100, arredondado). */
  private buildSyntheticGoalKpi(id: string, title: string, current: number, target: number): GoalKpiData {
    const percentage = target > 0 ? Math.round((current / target) * 100) : 0;
    return {
      id,
      title,
      current,
      target,
      percentage,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Temporário: Abril e Maio com valores fixos até a integração com API estar estável.
   * Financeiro: valor concedido / receita. Jurídico/CS: volume de concessões + valor de protocolos.
   */
  private buildHardcodedKpisIfDemoMonth(
    normalizedTeam: string,
    selectedMonth?: Date
  ): GoalKpiData[] | null {
    if (!selectedMonth) {
      return null;
    }
    const monthIdx = selectedMonth.getMonth();
    const isApril = monthIdx === 3;
    const isMay = monthIdx === 4;
    if (!isApril && !isMay) {
      return null;
    }

    if (normalizedTeam.includes('financeiro')) {
      if (isApril) {
        return [
          this.buildSyntheticGoalKpi(
            this.GOAL_TEMPLATE_IDS.RECEITA_CONCEDIDA,
            'Receita concedida',
            817_000,
            775_000
          )
        ];
      }
      return [
        this.buildSyntheticGoalKpi(
          this.GOAL_TEMPLATE_IDS.RECEITA_CONCEDIDA,
          'Receita concedida',
          191_836,
          800_000
        )
      ];
    }

    const isJurCs =
      normalizedTeam.includes('juridico') ||
      normalizedTeam.includes('jurídico') ||
      normalizedTeam.includes('cs') ||
      normalizedTeam === 'cs';
    if (!isJurCs) {
      return null;
    }

    if (isApril) {
      return [
        this.buildSyntheticGoalKpi(
          this.GOAL_TEMPLATE_IDS.APOSENTADORIAS,
          'Volume de concessões',
          230,
          220
        ),
        this.buildSyntheticGoalKpi(
          this.GOAL_TEMPLATE_IDS.META_PROTOCOLO,
          'Valor de protocolos',
          1_013_000,
          1_000_000
        )
      ];
    }

    return [
      this.buildSyntheticGoalKpi(
        this.GOAL_TEMPLATE_IDS.APOSENTADORIAS,
        'Volume de concessões',
        16,
        220
      ),
      this.buildSyntheticGoalKpi(
        this.GOAL_TEMPLATE_IDS.META_PROTOCOLO,
        'Valor de protocolos',
        224_907,
        1_000_000
      )
    ];
  }

  /**
   * Parse a goal log into KPI data
   */
  private parseGoalLog(log: GoalLogRow): GoalKpiData {
    // Use updated_value as current, current_goal_value as target
    // If cumulative values are available and valid, prefer them
    let current = this.parseNumber(log.updated_value);
    let target = this.parseNumber(log.current_goal_value);
    
    const cumulativeValue = this.parseNumber(this.cumulativeRawFromLog(log));
    if (this.logHasInterpretableCumulativeValue(log)) {
      current = cumulativeValue;
    }
    
    // Calculate percentage
    let percentage = 0;
    
    // First try to use the API-provided percentage
    const apiPercentage = this.parseNumber(
      log.cumulative_percentual_progress ?? log.updated_percentual_progress
    );
    
    if (apiPercentage > 0 && apiPercentage <= 100) {
      percentage = apiPercentage;
    } else if (target > 0) {
      // Calculate from current/target
      percentage = Math.min(100, (current / target) * 100);
    }
    
    return {
      id: this.logTemplateId(log) || String(log.goal_template_id || ''),
      title: log.title,
      current: current,
      target: target,
      percentage: Math.round(percentage),
      updated_at: log.updated_at
    };
  }

  /**
   * Get all KPIs for a team based on team name.
   * @param selectedMonth Com mês definido: **Jurídico/CS** — último log por `updated_at` dentro do mês para cada
   *   `goal_template_id` (`126bfa2d-…` volume de concessões, `b96dd54a-…` valor de protocolos).
   *   **Financeiro** — receita: último log no mês com `cumulative_value` utilizável e `updated_at` no mês.
   */
  getAllKpisForTeam(teamName: string, selectedMonth?: Date): Observable<GoalKpiData[]> {
    const normalizedTeam = teamName.toLowerCase().trim();
    
    console.log('📊 [Goals API] Fetching KPIs for team:', normalizedTeam);
    
    return this.fetchGoalLogs().pipe(
      map(logs => {
        const hardcoded = this.buildHardcodedKpisIfDemoMonth(normalizedTeam, selectedMonth);
        if (hardcoded !== null) {
          console.warn(
            '📊 [Goals API] Abril/Maio: KPIs hardcoded temporários (integração API desligada para estes meses).'
          );
          return hardcoded;
        }

        const scopedFinance = this.scopeGoalLogsForCircularMonth(logs, selectedMonth);
        const scopedJurCs = this.scopeGoalLogsJurCsByUpdatedAtInMonth(logs, selectedMonth);
        console.log('📊 [Goals API] Received', logs.length, 'goal logs');
        const kpis: GoalKpiData[] = [];
        
        if (normalizedTeam.includes('financeiro')) {
          // Financeiro: Receita concedida (template único)
          const receitaLog = this.getMostRecentLog(scopedFinance, this.GOAL_TEMPLATE_IDS.RECEITA_CONCEDIDA);

          if (receitaLog) {
            kpis.push(this.parseGoalLog(receitaLog));
            console.log('📊 [Goals API] Found Receita Concedida from API');
          } else {
            // No data found - return with 0 current and hardcoded target
            console.warn('📊 [Goals API] No Receita Concedida data found, using defaults');
            kpis.push({
              id: this.GOAL_TEMPLATE_IDS.RECEITA_CONCEDIDA,
              title: 'Receita concedida',
              current: 0,
              target: 775000, // Hardcoded default target
              percentage: 0,
              updated_at: new Date().toISOString()
            });
          }
        } else if (normalizedTeam.includes('juridico') || normalizedTeam.includes('jurídico')) {
          // Jurídico: volume de concessões (126…) → valor de protocolos (b96…), alinhado à UI
          const aposentadoriasLog = this.getMostRecentLog(scopedJurCs, this.GOAL_TEMPLATE_IDS.APOSENTADORIAS);
          if (aposentadoriasLog) {
            kpis.push(this.parseGoalLog(aposentadoriasLog));
            console.log('📊 [Goals API] Found volume de concessões from API');
          } else {
            console.warn('📊 [Goals API] No volume de concessões data found, using defaults');
            kpis.push({
              id: this.GOAL_TEMPLATE_IDS.APOSENTADORIAS,
              title: 'Volume de concessões',
              current: 0,
              target: APOSENTADORIAS_TARGET, // fallback alinhado a kpi-targets.constants
              percentage: 0,
              updated_at: new Date().toISOString()
            });
          }

          const protocoloLog = this.getMostRecentLog(scopedJurCs, this.GOAL_TEMPLATE_IDS.META_PROTOCOLO);
          if (protocoloLog) {
            kpis.push(this.parseGoalLog(protocoloLog));
            console.log('📊 [Goals API] Found valor de protocolos from API');
          } else {
            console.warn('📊 [Goals API] No valor de protocolos data found, using defaults');
            kpis.push({
              id: this.GOAL_TEMPLATE_IDS.META_PROTOCOLO,
              title: 'Valor de protocolos',
              current: 0,
              target: META_PROTOCOLO_TARGET, // fallback alinhado a kpi-targets.constants
              percentage: 0,
              updated_at: new Date().toISOString()
            });
          }
        } else if (normalizedTeam.includes('cs') || normalizedTeam === 'cs') {
          // CS: mesma ordem (volume de concessões, depois valor de protocolos)
          const aposentadoriasLogCs = this.getMostRecentLog(scopedJurCs, this.GOAL_TEMPLATE_IDS.APOSENTADORIAS);
          if (aposentadoriasLogCs) {
            kpis.push(this.parseGoalLog(aposentadoriasLogCs));
            console.log('📊 [Goals API] Found volume de concessões from API');
          } else {
            console.warn('📊 [Goals API] No volume de concessões data found, using defaults');
            kpis.push({
              id: this.GOAL_TEMPLATE_IDS.APOSENTADORIAS,
              title: 'Volume de concessões',
              current: 0,
              target: APOSENTADORIAS_TARGET, // fallback alinhado a kpi-targets.constants
              percentage: 0,
              updated_at: new Date().toISOString()
            });
          }

          const protocoloLogCs = this.getMostRecentLog(scopedJurCs, this.GOAL_TEMPLATE_IDS.META_PROTOCOLO);
          if (protocoloLogCs) {
            kpis.push(this.parseGoalLog(protocoloLogCs));
            console.log('📊 [Goals API] Found valor de protocolos from API');
          } else {
            console.warn('📊 [Goals API] No valor de protocolos data found, using defaults');
            kpis.push({
              id: this.GOAL_TEMPLATE_IDS.META_PROTOCOLO,
              title: 'Valor de protocolos',
              current: 0,
              target: META_PROTOCOLO_TARGET, // fallback alinhado a kpi-targets.constants
              percentage: 0,
              updated_at: new Date().toISOString()
            });
          }
        } else {
          console.warn('📊 [Goals API] Unknown team:', normalizedTeam, '- no KPIs returned');
        }
        
        console.log('📊 [Goals API] Returning', kpis.length, 'KPIs for team', normalizedTeam);
        return kpis;
      })
    );
  }
}
