import {Injectable} from '@angular/core';
import {TemporadaDashboard} from '../model/temporadaDashboard.model';
import {ApiProvider} from "../providers/api.provider";
import {TIPO_CONSULTA_TIME} from "@app/pages/dashboard/dashboard.component";
import {SeasonDatesService} from "./season-dates.service";
import {environment} from '../../environments/environment';
import { PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG } from '@app/constants/pontos-por-atividade-action-log';

@Injectable({
  providedIn: 'root'
})
export class TemporadaService {

  basePath = '/game/stats';

  constructor(
    private api: ApiProvider,
    private seasonDatesService: SeasonDatesService
  ) {
  }

  public async getDadosTemporadaDashboard(id: number, tipo: number): Promise<TemporadaDashboard> {
    // Check if backend_url_base is configured - if not, return empty data
    // This prevents calls to non-existent endpoints in production
    if (!environment.backend_url_base || environment.backend_url_base === 'http://localhost') {
      console.warn('⚠️ TemporadaService: backend_url_base not configured, returning empty data');
      return this.getEmptyTemporadaDashboard();
    }

    try {
      let url = this.basePath;
      
      // Obter datas da temporada (campanha) no formato ISO
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();
      
      let queryParams = '?start=' + startDateISO + '&end=' + endDateISO;

      if (tipo === TIPO_CONSULTA_TIME) {
        url = '/game/team-stats';
        queryParams += '&team=' + id;
      } else {
        queryParams += '&user=' + id;
      }

      const response = await this.api.get<any>(url + queryParams);

      const completedTasks = response?.action_stats?.DONE?.count || 0;
      const blockedPoints = response?.action_stats?.total_blocked_points || 0;
      const unblockedFromActivities = Math.floor(
        completedTasks * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG
      );

      return <TemporadaDashboard>{
        blocked_points: blockedPoints,
        unblocked_points: unblockedFromActivities,
        pendingTasks: response?.action_stats?.PENDING?.count || 0,
        completedTasks,
        pendingDeliveries: response?.delivery_stats?.PENDING || 0,
        incompleteDeliveries: response?.delivery_stats?.INCOMPLETE || 0,
        completedDeliveries: response?.delivery_stats?.DELIVERED || 0,
        total_points: blockedPoints + unblockedFromActivities,
        total_blocked_points: blockedPoints,
        total_actions: completedTasks,
      };
    } catch (error) {
      console.error('❌ TemporadaService: Error fetching season data:', error);
      return this.getEmptyTemporadaDashboard();
    }
  }

  private getEmptyTemporadaDashboard(): TemporadaDashboard {
    return {
      blocked_points: 0,
      unblocked_points: 0,
      pendingTasks: 0,
      completedTasks: 0,
      pendingDeliveries: 0,
      incompleteDeliveries: 0,
      completedDeliveries: 0,
      total_points: 0,
      total_blocked_points: 0,
      total_actions: 0,
    };
  }

}
