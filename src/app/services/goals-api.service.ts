import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiProvider } from '@providers/api.provider';

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
  // Goal template IDs as specified
  private readonly GOAL_TEMPLATE_IDS = {
    APOSENTADORIAS: '126bfa2d-5845-4a3f-94d0-301b988dac33',
    RECEITA_1: '6429c552-989a-47fe-82b8-ee57ee685dc5',
    RECEITA_2: 'ddda4928-6e01-452a-bbac-edaf4d873b85',
    META_PROTOCOLO: 'b96dd54a-2847-4267-b234-2bd02e63b118'
  };

  constructor(private api: ApiProvider) {}

  /**
   * Fetch all goal logs from the API
   */
  private fetchGoalLogs(): Observable<GoalLogRow[]> {
    return from(this.api.get<unknown>('/goals/logs')).pipe(
      map(response => this.unwrapGoalLogs(response))
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

  /**
   * Get the most recent log for a specific goal template ID
   */
  private getMostRecentLog(logs: GoalLogRow[], templateId: string): GoalLogRow | null {
    const filtered = logs.filter(log => log.goal_template_id === templateId);
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
   * Get Receita Concedida KPI data (checks both template IDs and returns the most recent)
   */
  getReceitaConcedida(): Observable<GoalKpiData | null> {
    return this.fetchGoalLogs().pipe(
      map(logs => {
        const log1 = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.RECEITA_1);
        const log2 = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.RECEITA_2);
        
        // Pick the most recent between the two
        let mostRecent: GoalLogRow | null = null;
        if (log1 && log2) {
          const date1 = new Date(log1.updated_at).getTime();
          const date2 = new Date(log2.updated_at).getTime();
          mostRecent = date1 > date2 ? log1 : log2;
        } else {
          mostRecent = log1 || log2;
        }
        
        if (!mostRecent) {
          console.warn('📊 No goal log found for Receita Concedida');
          return null;
        }
        return this.parseGoalLog(mostRecent);
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

  /**
   * Parse a goal log into KPI data
   */
  private parseGoalLog(log: GoalLogRow): GoalKpiData {
    // Use updated_value as current, current_goal_value as target
    // If cumulative values are available and valid, prefer them
    let current = this.parseNumber(log.updated_value);
    let target = this.parseNumber(log.current_goal_value);
    
    // Check if cumulative values are available and make more sense
    const cumulativeValue = this.parseNumber(log.cumulative_value);
    if (cumulativeValue > 0) {
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
      id: log.goal_template_id,
      title: log.title,
      current: current,
      target: target,
      percentage: Math.round(percentage),
      updated_at: log.updated_at
    };
  }

  /**
   * Get all KPIs for a team based on team name
   */
  getAllKpisForTeam(teamName: string): Observable<GoalKpiData[]> {
    const normalizedTeam = teamName.toLowerCase().trim();
    
    return this.fetchGoalLogs().pipe(
      map(logs => {
        const kpis: GoalKpiData[] = [];
        
        if (normalizedTeam.includes('financeiro')) {
          // Financeiro: Receita Concedida only
          const receitaLog1 = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.RECEITA_1);
          const receitaLog2 = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.RECEITA_2);
          
          let mostRecent: GoalLogRow | null = null;
          if (receitaLog1 && receitaLog2) {
            const date1 = new Date(receitaLog1.updated_at).getTime();
            const date2 = new Date(receitaLog2.updated_at).getTime();
            mostRecent = date1 > date2 ? receitaLog1 : receitaLog2;
          } else {
            mostRecent = receitaLog1 || receitaLog2;
          }
          
          if (mostRecent) {
            kpis.push(this.parseGoalLog(mostRecent));
          }
        } else if (normalizedTeam.includes('juridico') || normalizedTeam.includes('jurídico')) {
          // Jurídico: Meta de Protocolo + Aposentadorias Concedidas
          const protocoloLog = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.META_PROTOCOLO);
          if (protocoloLog) {
            kpis.push(this.parseGoalLog(protocoloLog));
          }
          
          const aposentadoriasLog = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.APOSENTADORIAS);
          if (aposentadoriasLog) {
            kpis.push(this.parseGoalLog(aposentadoriasLog));
          }
        } else if (normalizedTeam.includes('cs') || normalizedTeam === 'cs') {
          // CS: Meta de Protocolo + Aposentadorias Concedidas
          const protocoloLog = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.META_PROTOCOLO);
          if (protocoloLog) {
            kpis.push(this.parseGoalLog(protocoloLog));
          }
          
          const aposentadoriasLog = this.getMostRecentLog(logs, this.GOAL_TEMPLATE_IDS.APOSENTADORIAS);
          if (aposentadoriasLog) {
            kpis.push(this.parseGoalLog(aposentadoriasLog));
          }
        }
        
        return kpis;
      })
    );
  }
}
