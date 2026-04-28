import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TemporadaDashboard } from '../model/temporadaDashboard.model';
import { TIPO_CONSULTA_TIME } from '@app/pages/dashboard/dashboard.component';
import { environment } from '../../environments/environment';
import { SeasonDatesService } from './season-dates.service';
import { Game4uApiService } from './game4u-api.service';
import type { Game4uUserActionStatsResponse } from '@model/game4u-api.model';

/**
 * Card de temporada (`page-season`): um snapshot de `/game/stats` ou `/game/team-stats` em **todo o intervalo da campanha**
 * (`start`/`end` = início e fim da temporada via {@link SeasonDatesService}).
 *
 * Usa {@link Game4uApiService} — mesmo cliente HTTP, `client_id` e dedupe por `(start,end,user|team)` que o painel de gamificação.
 *
 * **Contrato de rede** (shell + área principal Game4U, sem contar outros ecrãs como listas paginadas):
 * - até **2×** agregados tipo stats (`/game/stats` ou `/game/team-stats`): **(1)** temporada completa — este serviço; **(2)** mês do painel — gamificação (`ActionLogService` / `getProgressMetrics`).
 * - até **2×** `/game/actions` com **critérios diferentes** (ex.: intervalo «campanha→fim do mês» para progresso + outro intervalo/status). O card de temporada **não** pede `/game/actions`.
 */
@Injectable({
  providedIn: 'root'
})
export class TemporadaService {
  constructor(
    private game4u: Game4uApiService,
    private seasonDatesService: SeasonDatesService
  ) {}

  /**
   * `start` / `end` em ISO para stats de temporada: início e fim da campanha ativa (GET `/campaign`).
   */
  private async getSeasonStatsRangeISO(): Promise<{ start: string; end: string }> {
    const [start, end] = await Promise.all([
      this.seasonDatesService.getSeasonStartDateISO(),
      this.seasonDatesService.getSeasonEndDateISO()
    ]);
    return { start, end };
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

  private mapStatsToDashboard(response: Game4uUserActionStatsResponse): TemporadaDashboard {
    const doneBucket = response?.action_stats?.DONE ?? response?.action_stats?.done;
    const completedTasks = Math.floor(Number(doneBucket?.count) || 0);
    const rootTp = Math.floor(Number(response?.total_points) || 0);
    const rootTbp = Math.floor(Number(response?.total_blocked_points) || 0);
    const aggTp = Math.floor(Number(response?.action_stats?.total_points) || 0);
    const aggTbp = Math.floor(Number(response?.action_stats?.total_blocked_points) || 0);
    const unblockedPoints = rootTp || aggTp;
    const blockedPoints = rootTbp || aggTbp;
    const clientes = this.countClientesFromDeliveryStats(response?.delivery_stats);

    return {
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
      total_actions: completedTasks
    };
  }

  /**
   * Mesma semântica que antes: GET stats de temporada completa via {@link Game4uApiService} (dedupe partilhado com o resto da app).
   */
  public async getDadosTemporadaDashboard(id: number, tipo: number): Promise<TemporadaDashboard> {
    if (!environment.backend_url_base || !this.game4u.isConfigured()) {
      console.warn('⚠️ TemporadaService: backend não configurado para Game4U, a devolver dados vazios');
      return this.getEmptyTemporadaDashboard();
    }

    try {
      const { start: startDateISO, end: endDateISO } = await this.getSeasonStatsRangeISO();

      let response: Game4uUserActionStatsResponse;

      if (Number(tipo) === TIPO_CONSULTA_TIME) {
        response = await firstValueFrom(
          this.game4u.getGameTeamStats({
            team: String(id),
            start: startDateISO,
            end: endDateISO
          })
        );
      } else {
        response = await firstValueFrom(
          this.game4u.getGameStats({
            user: String(id),
            start: startDateISO,
            end: endDateISO
          })
        );
      }

      return this.mapStatsToDashboard(response);
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
      completedTasks: 0,
      pendingDeliveries: 0,
      incompleteDeliveries: 0,
      completedDeliveries: 0,
      clientes: 0,
      total_points: 0,
      total_blocked_points: 0,
      total_actions: 0
    };
  }
}
