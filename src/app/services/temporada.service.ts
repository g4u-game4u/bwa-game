import {Injectable} from '@angular/core';
import {TemporadaDashboard} from '../model/temporadaDashboard.model';
import {ApiProvider} from "../providers/api.provider";
import {TIPO_CONSULTA_TIME} from "@app/pages/dashboard/dashboard.component";
import {environment} from '../../environments/environment';

/** Início do período do season component para `/game/stats` (fixo). */
const SEASON_STATS_RANGE_START_ISO = '2026-04-01T00:00:00.000Z';

@Injectable({
  providedIn: 'root'
})
export class TemporadaService {

  basePath = '/game/stats';

  constructor(
    private api: ApiProvider
  ) {
  }

  /** Intervalo exclusivo do card de temporada: 2026-04-01 UTC → agora. */
  private getSeasonStatsRangeISO(): { start: string; end: string } {
    return {
      start: SEASON_STATS_RANGE_START_ISO,
      end: new Date().toISOString()
    };
  }

  private countClientesFromDeliveryStats(deliveryStats: unknown): number {
    if (!deliveryStats || typeof deliveryStats !== 'object') {
      return 0;
    }
    const d = deliveryStats as Record<string, unknown>;
    const incomplete =
      Number(d['incomplete'] ?? d['INCOMPLETE'] ?? d['Incomplete']) || 0;
    const delivered =
      Number(d['delivered'] ?? d['DELIVERED'] ?? d['Delivered']) || 0;
    return Math.floor(incomplete + delivered);
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
      const { start: startDateISO, end: endDateISO } = this.getSeasonStatsRangeISO();
      let queryParams =
        '?start=' + encodeURIComponent(startDateISO) + '&end=' + encodeURIComponent(endDateISO);

      if (tipo === TIPO_CONSULTA_TIME) {
        url = '/game/team-stats';
        queryParams += '&team=' + encodeURIComponent(String(id));
      } else {
        queryParams += '&user=' + encodeURIComponent(String(id));
      }

      const response = await this.api.get<any>(url + queryParams);

      const doneBucket = response?.action_stats?.DONE ?? response?.action_stats?.done;
      const completedTasks = Math.floor(Number(doneBucket?.count) || 0);
      const rootTp = Math.floor(Number(response?.total_points) || 0);
      const rootTbp = Math.floor(Number(response?.total_blocked_points) || 0);
      const aggTp = Math.floor(Number(response?.action_stats?.total_points) || 0);
      const aggTbp = Math.floor(Number(response?.action_stats?.total_blocked_points) || 0);
      const unblockedPoints = rootTp || aggTp;
      const blockedPoints = rootTbp || aggTbp;
      const clientes = this.countClientesFromDeliveryStats(response?.delivery_stats);

      return <TemporadaDashboard>{
        blocked_points: blockedPoints,
        unblocked_points: unblockedPoints,
        pendingTasks: response?.action_stats?.PENDING?.count || 0,
        completedTasks,
        pendingDeliveries: response?.delivery_stats?.PENDING || 0,
        incompleteDeliveries: response?.delivery_stats?.INCOMPLETE || 0,
        completedDeliveries: response?.delivery_stats?.DELIVERED || 0,
        clientes,
        total_points: unblockedPoints + blockedPoints,
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
      clientes: 0,
      total_points: 0,
      total_blocked_points: 0,
      total_actions: 0,
    };
  }

}
