import {Injectable} from '@angular/core';
import {TemporadaDashboard} from '../model/temporadaDashboard.model';
import {ApiProvider} from "../providers/api.provider";
import {SeasonDatesService} from "./season-dates.service";

@Injectable({
  providedIn: 'root'
})
export class TemporadaService {

  basePath = '/game/stats';

  constructor(
    private api: ApiProvider,
    private seasonDatesService: SeasonDatesService
  ) {
    void this.api;
    void this.seasonDatesService;
  }

  public async getDadosTemporadaDashboard(_id: number, _tipo: number): Promise<TemporadaDashboard> {
    // REFATORAÇÃO: stats da temporada no card não vêm mais de /game/stats nem de agregados Funifier.
    // Reativar o bloco abaixo quando houver novo backend.
    /*
    if (!environment.backend_url_base || environment.backend_url_base === 'http://localhost') {
      console.warn('⚠️ TemporadaService: backend_url_base not configured, returning empty data');
      return this.getEmptyTemporadaDashboard();
    }

    try {
      let url = this.basePath;
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

      return <TemporadaDashboard>{
        blocked_points: response?.action_stats?.total_blocked_points || 0,
        unblocked_points: response?.action_stats?.total_points || 0,
        pendingTasks: response?.action_stats?.PENDING?.count || 0,
        completedTasks: response?.action_stats?.DONE?.count || 0,
        pendingDeliveries: response?.delivery_stats?.PENDING || 0,
        incompleteDeliveries: response?.delivery_stats?.INCOMPLETE || 0,
        completedDeliveries: response?.delivery_stats?.DELIVERED || 0,
      };
    } catch (error) {
      console.error('❌ TemporadaService: Error fetching season data:', error);
      return this.getEmptyTemporadaDashboard();
    }
    */
    void _id;
    void _tipo;
    return this.getEmptyTemporadaDashboard();
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
      nivel: { nivelAtual: 0, nivelMax: 0 },
    };
  }

}
