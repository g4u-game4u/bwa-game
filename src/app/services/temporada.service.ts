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

      /**
       * Contrato típico G4U (definido no backend): `action_stats` agrega por estado
       * (`PENDING`, `DOING`, `DONE`, …) em `count`; `total_points` / `total_blocked_points`
       * costumam refletir apenas pontos de ações concluídas (aprovadas vs bloqueadas),
       * não a soma de pontos de tarefas abertas. Se o teu serviço somar tudo, alinha-o no API.
       */
      const blocked =
        response?.action_stats?.total_blocked_points ?? response?.blocked_points ?? 0;
      const unblocked =
        response?.action_stats?.total_points ?? response?.unblocked_points ?? 0;

      return {
        blocked_points: blocked,
        unblocked_points: unblocked,
        pendingTasks: response?.action_stats?.PENDING?.count || 0,
        doingTasks: response?.action_stats?.DOING?.count || 0,
        completedTasks: response?.action_stats?.DONE?.count || 0,
        pendingDeliveries: response?.delivery_stats?.PENDING || 0,
        incompleteDeliveries: response?.delivery_stats?.INCOMPLETE || 0,
        completedDeliveries: response?.delivery_stats?.DELIVERED || 0,
        total_points: unblocked + blocked,
        total_blocked_points: blocked,
        total_actions: response?.action_stats?.total_actions ?? 0,
        nivel: {
          nivelAtual: response?.nivel?.nivelAtual ?? 0,
          nivelMax: response?.nivel?.nivelMax ?? 0
        }
      };
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
