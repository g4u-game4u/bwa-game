import { Injectable } from '@angular/core';
import { TemporadaDashboard } from '../model/temporadaDashboard.model';
import { ApiProvider } from '../providers/api.provider';
import { SeasonDatesService } from './season-dates.service';
import { environment } from '../../environments/environment';
import { TIPO_CONSULTA_TIME } from '../pages/dashboard/dashboard.component';

@Injectable({
  providedIn: 'root'
})
export class TemporadaService {
  basePath = '/game/stats';

  constructor(
    private api: ApiProvider,
    private seasonDatesService: SeasonDatesService
  ) {}

  /** Respostas G4U por vezes vêm em `data` / `payload` / `result`. */
  private unwrapStatsPayload(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    const o = raw as Record<string, unknown>;
    const nested = o['data'] ?? o['payload'] ?? o['result'] ?? o['body'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
    return o;
  }

  private pickFiniteNumber(...candidates: unknown[]): number {
    for (const v of candidates) {
      if (v == null || v === '') {
        continue;
      }
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) {
        return n;
      }
    }
    return 0;
  }

  /** Contagem em `action_stats.DONE` / `done` / objeto `{ count }`. */
  private actionStatsBucketCount(
    ast: Record<string, unknown> | undefined,
    ...bucketNames: string[]
  ): number {
    if (!ast) {
      return 0;
    }
    for (const name of bucketNames) {
      for (const key of [name, String(name).toUpperCase(), String(name).toLowerCase()]) {
        const v = ast[key];
        if (typeof v === 'number' && Number.isFinite(v)) {
          return v;
        }
        if (v && typeof v === 'object' && 'count' in (v as object)) {
          const c = Number((v as { count?: unknown }).count);
          if (Number.isFinite(c)) {
            return c;
          }
        }
      }
    }
    return 0;
  }

  private mapPayloadToTemporadaDashboard(r: Record<string, unknown>): TemporadaDashboard {
    const ast = (r['action_stats'] ?? r['actionStats']) as Record<string, unknown> | undefined;
    const del = (r['delivery_stats'] ?? r['deliveryStats']) as Record<string, unknown> | undefined;
    const nivelRaw = r['nivel'] as Record<string, unknown> | undefined;

    const blocked = this.pickFiniteNumber(
      ast?.['total_blocked_points'],
      ast?.['totalBlockedPoints'],
      ast?.['locked_points'],
      r['blocked_points'],
      r['blockedPoints'],
      r['total_blocked_points'],
      r['locked_points'],
      r['pontos_bloqueados'],
      r['pontosBloqueados']
    );
    const unblocked = this.pickFiniteNumber(
      ast?.['total_points'],
      ast?.['totalPoints'],
      ast?.['unlocked_points'],
      r['unblocked_points'],
      r['unblockedPoints'],
      r['total_points'],
      r['unlocked_points'],
      r['pontos_desbloqueados'],
      r['pontosDesbloqueados']
    );

    const pending = ast?.['PENDING'] as { count?: unknown } | undefined;
    const doing = ast?.['DOING'] as { count?: unknown } | undefined;
    const done = ast?.['DONE'] as { count?: unknown } | undefined;

    const doneFromBuckets =
      this.actionStatsBucketCount(ast, 'DONE', 'done') +
      this.actionStatsBucketCount(ast, 'DELIVERED', 'delivered');

    const completedTasks = Math.max(
      this.pickFiniteNumber(done?.count),
      this.pickFiniteNumber(
        r['completed_tasks'],
        r['completedTasks'],
        r['tasks_completed'],
        r['tasksCompleted']
      ),
      doneFromBuckets
    );

    return {
      blocked_points: blocked,
      unblocked_points: unblocked,
      pendingTasks: this.pickFiniteNumber(pending?.count),
      doingTasks: this.pickFiniteNumber(doing?.count),
      completedTasks,
      pendingDeliveries: this.pickFiniteNumber(del?.['PENDING'], r['pendingDeliveries']),
      incompleteDeliveries: this.pickFiniteNumber(del?.['INCOMPLETE'], r['incompleteDeliveries']),
      completedDeliveries: this.pickFiniteNumber(del?.['DELIVERED'], r['completedDeliveries']),
      total_points: unblocked + blocked,
      total_blocked_points: blocked,
      total_actions: this.pickFiniteNumber(ast?.['total_actions'], r['total_actions']),
      nivel: {
        nivelAtual: this.pickFiniteNumber(nivelRaw?.['nivelAtual'], r['nivelAtual']),
        nivelMax: this.pickFiniteNumber(nivelRaw?.['nivelMax'], r['nivelMax'])
      }
    };
  }

  /**
   * GET `/game/stats?start&end&user=` (colaborador) ou `/game/team-stats?start&end&team=` (time).
   * `user` deve ser o e-mail do utilizador, tal como na API Game4U.
   */
  public async getDadosTemporadaDashboard(
    id: string | number | null | undefined,
    tipo: number,
    range?: { start: string; end: string }
  ): Promise<TemporadaDashboard> {
    if (id == null || id === '') {
      return this.getEmptyTemporadaDashboard();
    }

    const baseOk =
      String(environment.g4u_api_base || environment.backend_url_base || '').trim() !== '' &&
      environment.backend_url_base !== 'http://localhost';

    if (!baseOk) {
      console.warn('⚠️ TemporadaService: API base não configurada, dados da temporada vazios');
      return this.getEmptyTemporadaDashboard();
    }

    try {
      const startDateISO = range?.start ?? (await this.seasonDatesService.getSeasonStartDateISO());
      const endDateISO = range?.end ?? (await this.seasonDatesService.getSeasonEndDateISO());

      let url = this.basePath;
      const params: Record<string, string> = {
        start: startDateISO,
        end: endDateISO
      };

      if (tipo === TIPO_CONSULTA_TIME) {
        url = '/game/team-stats';
        params['team'] = String(id);
      } else {
        params['user'] = String(id);
      }

      const response = await this.api.get<any>(url, { params });
      const r = this.unwrapStatsPayload(response);
      return this.mapPayloadToTemporadaDashboard(r);
    } catch (error) {
      console.error('❌ TemporadaService: erro ao obter dados da temporada:', error);
      return this.getEmptyTemporadaDashboard();
    }
  }

  private getEmptyTemporadaDashboard(): TemporadaDashboard {
    return {
      blocked_points: 0,
      unblocked_points: 0,
      pendingTasks: 0,
      doingTasks: 0,
      completedTasks: 0,
      pendingDeliveries: 0,
      incompleteDeliveries: 0,
      completedDeliveries: 0,
      total_points: 0,
      total_blocked_points: 0,
      total_actions: 0,
      nivel: { nivelAtual: 0, nivelMax: 0 }
    };
  }
}
