import {
  filterGame4uActionsByMonth,
  mapGame4uActionsToProcessMetrics,
  mapGame4uStatsToActivityMetrics,
  mapGame4uStatsToPointWallet,
  mergeGame4uDeliveryParticipation,
  mergeGame4uTeamDeliveryRows
} from './game4u-game-mapper';
import type { Game4uDeliveryModel, Game4uUserActionModel } from '@model/game4u-api.model';

describe('game4u-game-mapper', () => {
  describe('mapGame4uStatsToPointWallet', () => {
    it('maps blocked and unlocked totals', () => {
      const w = mapGame4uStatsToPointWallet({
        stats: [],
        total_actions: 0,
        total_points: 99,
        total_blocked_points: 11
      });
      expect(w).toEqual({ bloqueados: 11, desbloqueados: 99, moedas: 0 });
    });

    it('uses action_stats.done for desbloqueados when action_stats is present', () => {
      const w = mapGame4uStatsToPointWallet({
        stats: [],
        total_actions: 10,
        total_points: 99,
        total_blocked_points: 5,
        action_stats: {
          total_blocked_points: 7,
          done: { count: 4, total_points: 42 }
        }
      });
      expect(w).toEqual({ bloqueados: 7, desbloqueados: 42, moedas: 0 });
    });
  });

  describe('mapGame4uStatsToActivityMetrics', () => {
    it('uses action_stats.done for finalizadas and pontos', () => {
      const m = mapGame4uStatsToActivityMetrics({
        stats: [{ status: 'DELIVERED', count: 9, total_points: 0 }],
        total_actions: 99,
        total_points: 1,
        total_blocked_points: 0,
        action_stats: {
          DONE: { count: 3, total_points: 100 }
        }
      });
      expect(m.finalizadas).toBe(3);
      expect(m.pontos).toBe(100);
    });
  });

  describe('filterGame4uActionsByMonth', () => {
    it('filters by calendar month', () => {
      const month = new Date(2024, 5, 15);
      const actions: Game4uUserActionModel[] = [
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2024-05-10T12:00:00.000Z'
        },
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-01T12:00:00.000Z'
        }
      ];
      const out = filterGame4uActionsByMonth(actions, month);
      expect(out.map(a => a.id)).toEqual(['1']);
    });
  });

  describe('mapGame4uActionsToProcessMetrics', () => {
    it('counts finalized deliveries', () => {
      const actions: Game4uUserActionModel[] = [
        {
          id: 'a1',
          points: 0,
          status: 'DOING',
          created_at: '2024-01-01T00:00:00.000Z',
          delivery_id: 'd1'
        },
        {
          id: 'a2',
          points: 0,
          status: 'DELIVERED',
          created_at: '2024-01-02T00:00:00.000Z',
          delivery_id: 'd1'
        }
      ];
      expect(mapGame4uActionsToProcessMetrics(actions)).toEqual({
        pendentes: 0,
        incompletas: 0,
        finalizadas: 1
      });
    });
  });

  describe('mergeGame4uDeliveryParticipation', () => {
    it('dedupes delivery ids across status lists', () => {
      const d: Game4uDeliveryModel[] = [{ id: 'x', status: 'DELIVERED' }];
      const merged = mergeGame4uDeliveryParticipation(d, [{ id: 'x', status: 'PENDING' }]);
      expect(merged).toEqual([{ cnpj: 'x', actionCount: 2 }]);
    });
  });

  describe('mergeGame4uTeamDeliveryRows', () => {
    it('aggregates processCount for delivered', () => {
      const rows = mergeGame4uTeamDeliveryRows(
        [{ id: 'c1', status: 'DELIVERED' }],
        [{ id: 'c2', status: 'PENDING' }]
      );
      expect(rows).toContain(jasmine.objectContaining({ cnpj: 'c1', processCount: 1 }));
      expect(rows).toContain(jasmine.objectContaining({ cnpj: 'c2', processCount: 0 }));
    });
  });
});
