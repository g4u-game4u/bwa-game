import { Injectable } from '@angular/core';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TemporadaDashboard } from '../model/temporadaDashboard.model';
import { TIPO_CONSULTA_TIME } from '@app/pages/dashboard/dashboard.component';
import { environment } from '../../environments/environment';
import { SeasonDatesService } from './season-dates.service';
import { Game4uApiService } from './game4u-api.service';
import type { Game4uUserActionModel, Game4uUserActionStatsResponse } from '@model/game4u-api.model';
import {
  getGame4uParticipationRowKey,
  isGame4uUserActionFinalizedStatus,
  mapGame4uActionsToProcessMetrics,
  sumGame4uActionPointsByStatus
} from './game4u-game-mapper';
const OPEN_ACTION_STATUSES = new Set(['PENDING', 'DOING']);

/**
 * Card de temporada (`page-season`): snapshot no **intervalo completo da campanha**
 * (`start`/`end` via {@link SeasonDatesService} → GET `/campaign`).
 *
 * Usa {@link Game4uApiService} em paralelo:
 * - `/game/stats` ou `/game/team-stats` (agregados)
 * - `/game/actions` ou `/game/team-actions` (user-actions no mesmo intervalo)
 *
 * Os campos do card são calculados **primariamente** a partir das user-actions; `/stats` serve de
 * fallback quando a lista de actions está vazia ou os pontos por action não batem com os totais da API.
 *
 * **Contrato de rede** (shell + área principal Game4U, sem contar listas paginadas):
 * - até **2×** stats (`/game/stats` ou `/game/team-stats`): **(1)** temporada — este serviço; **(2)** mês — gamificação.
 * - até **2×** `/game/actions` com critérios diferentes possíveis; aqui **(1)** intervalo campanha inteira para o card.
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

  /** Fallback só a partir de `/game/stats` (ou team-stats). */
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
   * Combina stats + user-actions: prioridade às actions; stats quando lista vazia ou pontos inconsistentes.
   */
  private mapToSeasonDashboard(
    stats: Game4uUserActionStatsResponse,
    actions: Game4uUserActionModel[]
  ): TemporadaDashboard {
    const fromStats = this.mapStatsToDashboard(stats);
    if (!actions?.length) {
      return fromStats;
    }

    const unblockedFromActions = sumGame4uActionPointsByStatus(actions, ['DELIVERED', 'PAID']);
    const blockedFromActions = sumGame4uActionPointsByStatus(actions, ['DONE']);
    const sumActionsPoints = unblockedFromActions + blockedFromActions;
    const sumStatsPoints = fromStats.unblocked_points + fromStats.blocked_points;
    const useStatsPoints = sumActionsPoints === 0 && sumStatsPoints > 0;
    const unblocked = useStatsPoints ? fromStats.unblocked_points : unblockedFromActions;
    const blocked = useStatsPoints ? fromStats.blocked_points : blockedFromActions;

    const completedTasks = actions.filter(a => isGame4uUserActionFinalizedStatus(a.status)).length;
    const pendingTasks = actions.filter(a =>
      OPEN_ACTION_STATUSES.has(String(a.status ?? '').trim().toUpperCase())
    ).length;

    const proc = mapGame4uActionsToProcessMetrics(actions);

    const clientKeys = new Set<string>();
    for (const a of actions) {
      if (isGame4uUserActionFinalizedStatus(a.status)) {
        const k = getGame4uParticipationRowKey(a);
        if (k) {
          clientKeys.add(k);
        }
      }
    }
    let clientes = clientKeys.size;
    if (clientes === 0 && fromStats.clientes > 0) {
      clientes = fromStats.clientes;
    }

    return {
      blocked_points: blocked,
      unblocked_points: unblocked,
      pendingTasks,
      completedTasks,
      pendingDeliveries: proc.pendentes,
      incompleteDeliveries: proc.incompletas,
      completedDeliveries: proc.finalizadas,
      clientes,
      total_points: unblocked + blocked,
      total_blocked_points: blocked,
      total_actions: completedTasks
    };
  }

  /**
   * Stats de temporada completa + user-actions no mesmo intervalo (dedupe partilhado em {@link Game4uApiService}).
   */
  public async getDadosTemporadaDashboard(id: number, tipo: number): Promise<TemporadaDashboard> {
    if (!environment.backend_url_base || !this.game4u.isConfigured()) {
      console.warn('⚠️ TemporadaService: backend não configurado para Game4U, a devolver dados vazios');
      return this.getEmptyTemporadaDashboard();
    }

    try {
      const { start: startDateISO, end: endDateISO } = await this.getSeasonStatsRangeISO();

      const actionsCatch = catchError((err: unknown) => {
        console.warn('⚠️ TemporadaService: falha ao obter actions da temporada, fallback só stats:', err);
        return of([] as Game4uUserActionModel[]);
      });

      type SeasonPack = { stats: Game4uUserActionStatsResponse; actions: Game4uUserActionModel[] };

      if (Number(tipo) === TIPO_CONSULTA_TIME) {
        const team = String(id);
        const { stats, actions } = (await firstValueFrom(
          forkJoin({
            stats: this.game4u.getGameTeamStats({
              team,
              start: startDateISO,
              end: endDateISO
            }),
            actions: this.game4u
              .getGameTeamActions({
                team,
                start: startDateISO,
                end: endDateISO
              })
              .pipe(actionsCatch)
          })
        )) as SeasonPack;
        return this.mapToSeasonDashboard(stats, actions);
      }

      const user = String(id);
      const { stats, actions } = (await firstValueFrom(
        forkJoin({
          stats: this.game4u.getGameStats({
            user,
            start: startDateISO,
            end: endDateISO
          }),
          actions: this.game4u
            .getGameActions({
              user,
              start: startDateISO,
              end: endDateISO
            })
            .pipe(actionsCatch)
        })
      )) as SeasonPack;
      return this.mapToSeasonDashboard(stats, actions);
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
