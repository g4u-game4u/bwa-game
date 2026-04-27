import {
  computeMonthlyPointsFromGame4uActions,
  filterGame4uActionsByCompetenceMonth,
  filterGame4uActionsByMonth,
  getGame4uMonthlyPointsCircularFromActionStats,
  readGame4uDeliveryStatsTotal,
  parseCompetenceYearMonthFromDeliveryId,
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
      expect(m.pontosDone).toBe(100);
      expect(m.pontosTodosStatus).toBe(100);
    });

    it('sums pontosTodosStatus across action_stats buckets', () => {
      const m = mapGame4uStatsToActivityMetrics({
        stats: [],
        total_actions: 0,
        total_points: 0,
        total_blocked_points: 0,
        action_stats: {
          DOING: { count: 1, total_points: 25 },
          DONE: { count: 2, total_points: 40 },
          PENDING: { count: 1, total_points: 15 }
        }
      });
      expect(m.pontosDone).toBe(40);
      expect(m.pontosTodosStatus).toBe(80);
    });
  });

  describe('readGame4uDeliveryStatsTotal', () => {
    it('reads total from delivery_stats', () => {
      expect(
        readGame4uDeliveryStatsTotal({
          stats: [],
          total_actions: 0,
          total_points: 0,
          total_blocked_points: 0,
          delivery_stats: { total: 12 }
        })
      ).toBe(12);
    });

    it('accepts TOTAL alias', () => {
      expect(
        readGame4uDeliveryStatsTotal({
          stats: [],
          total_actions: 0,
          total_points: 0,
          total_blocked_points: 0,
          delivery_stats: { TOTAL: 7 }
        })
      ).toBe(7);
    });

    it('returns null when missing', () => {
      expect(
        readGame4uDeliveryStatsTotal({
          stats: [],
          total_actions: 0,
          total_points: 0,
          total_blocked_points: 0
        })
      ).toBeNull();
    });
  });

  describe('getGame4uMonthlyPointsCircularFromActionStats', () => {
    it('uses pending + done total_points as meta and done as current', () => {
      const c = getGame4uMonthlyPointsCircularFromActionStats({
        stats: [],
        total_actions: 0,
        total_points: 0,
        total_blocked_points: 0,
        action_stats: {
          PENDING: { count: 3, total_points: 30 },
          DONE: { count: 2, total_points: 20 }
        }
      });
      expect(c).not.toBeNull();
      expect(c!.pontosDone).toBe(20);
      expect(c!.pontosTodosStatus).toBe(50);
      expect(c!.finalizadas).toBe(2);
    });

    it('accepts lowercase done and pending buckets', () => {
      const c = getGame4uMonthlyPointsCircularFromActionStats({
        stats: [],
        total_actions: 0,
        total_points: 0,
        total_blocked_points: 0,
        action_stats: {
          pending: { count: 1, total_points: 10 },
          done: { count: 1, total_points: 5 }
        }
      });
      expect(c!.pontosDone).toBe(5);
      expect(c!.pontosTodosStatus).toBe(15);
    });

    it('returns null when action_stats is absent', () => {
      expect(
        getGame4uMonthlyPointsCircularFromActionStats({
          stats: [],
          total_actions: 0,
          total_points: 1,
          total_blocked_points: 0
        })
      ).toBeNull();
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

  describe('parseCompetenceYearMonthFromDeliveryId', () => {
    it('parses trailing YYYY-MM-DD as competence', () => {
      expect(parseCompetenceYearMonthFromDeliveryId('1079-2025-12-31')).toEqual({ y: 2025, m: 11 });
    });

    it('returns null when suffix is not a date', () => {
      expect(parseCompetenceYearMonthFromDeliveryId('1079-2025-13-01')).toBeNull();
      expect(parseCompetenceYearMonthFromDeliveryId('plain')).toBeNull();
    });
  });

  describe('filterGame4uActionsByCompetenceMonth', () => {
    it('includes action by competence month even if created_at is outside', () => {
      const month = new Date(2025, 11, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: '1',
          points: 10,
          status: 'DOING',
          created_at: '2024-01-01T00:00:00.000Z',
          delivery_id: '1079-2025-12-31'
        },
        {
          id: '2',
          points: 5,
          status: 'DONE',
          created_at: '2025-12-15T00:00:00.000Z',
          delivery_id: '1080-2025-11-30'
        }
      ];
      const out = filterGame4uActionsByCompetenceMonth(actions, month);
      expect(out.map(a => a.id)).toEqual(['1']);
    });

    it('falls back to created_at month when delivery_id has no competence suffix', () => {
      const month = new Date(2024, 5, 1);
      const inMonth: Game4uUserActionModel[] = [
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-10T12:00:00.000Z',
          delivery_id: '999'
        }
      ];
      expect(filterGame4uActionsByCompetenceMonth(inMonth, month).map(a => a.id)).toEqual(['1']);

      const outOfMonth: Game4uUserActionModel[] = [
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2024-07-10T12:00:00.000Z',
          delivery_id: '999'
        }
      ];
      expect(filterGame4uActionsByCompetenceMonth(outOfMonth, month).length).toBe(0);
    });
  });

  describe('computeMonthlyPointsFromGame4uActions', () => {
    it('sums all points as target and DONE only as current', () => {
      const actions: Game4uUserActionModel[] = [
        { id: 'a', points: 10, status: 'DONE', created_at: '2024-01-01T00:00:00.000Z' },
        { id: 'b', points: 20, status: 'PENDING', created_at: '2024-01-02T00:00:00.000Z' }
      ];
      const r = computeMonthlyPointsFromGame4uActions(actions);
      expect(r.pontosTodosStatus).toBe(30);
      expect(r.pontosDone).toBe(10);
      expect(r.pontos).toBe(10);
      expect(r.finalizadas).toBe(1);
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

    it('includes delivery_title when present on delivery', () => {
      const merged = mergeGame4uDeliveryParticipation(
        [{ id: 'a', status: 'DELIVERED', delivery_title: 'Processo Alpha' }],
        [{ id: 'a', status: 'PENDING' }]
      );
      expect(merged).toEqual([{ cnpj: 'a', actionCount: 2, delivery_title: 'Processo Alpha' }]);
    });

    it('falls back to title when delivery_title is absent', () => {
      const merged = mergeGame4uDeliveryParticipation([{ id: 'b', status: 'DELIVERED', title: 'Fallback title' }]);
      expect(merged).toEqual([{ cnpj: 'b', actionCount: 1, delivery_title: 'Fallback title' }]);
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
