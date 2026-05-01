import {
  computeGame4uDrPrazoMetaBoost,
  computeMonthlyPointsFromGame4uActions,
  filterGame4uActionsByCompetenceMonth,
  filterGame4uActionsByMonth,
  getGame4uMonthlyPointsCircularFromActionStats,
  getGame4uParticipationRowKey,
  getGame4uAtendidosGroupKey,
  pickGame4uAtendidosRepresentativeKey,
  getGame4uUserActionFinishedOrFallbackMs,
  game4uActionMatchesParticipacaoModalRow,
  isGame4uUserActionFinalizedStatus,
  readGame4uDeliveryStatsTotal,
  parseCompetenceYearMonthFromDeliveryId,
  parseExtraDrPrazoToUtcMs,
  mapGame4uActionsToActivityList,
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
          created_at: '2024-05-15T12:00:00.000Z'
        },
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-15T12:00:00.000Z'
        }
      ];
      const out = filterGame4uActionsByMonth(actions, month);
      expect(out.map(a => a.id)).toEqual(['2']);
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

  describe('parseExtraDrPrazoToUtcMs / computeGame4uDrPrazoMetaBoost', () => {
    it('parses ISO and Mongo $date for prazo', () => {
      const iso = parseExtraDrPrazoToUtcMs('2024-03-15T12:00:00.000Z');
      expect(iso).toBe(Date.parse('2024-03-15T12:00:00.000Z'));
      const mongo = parseExtraDrPrazoToUtcMs({ $date: '2024-03-20T00:00:00.000Z' });
      expect(mongo).toBe(Date.parse('2024-03-20T00:00:00.000Z'));
    });

    it('adds meta boost only for dt_prazo in filter month outside competence (PENDING only)', () => {
      const month = new Date(2024, 2, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: 'in-comp',
          points: 5,
          status: 'DONE',
          created_at: '2024-03-01T00:00:00.000Z',
          delivery_id: '1079-2024-03-31',
          extra: { dt_prazo: '2024-03-10T00:00:00.000Z' }
        },
        {
          id: 'extra-only',
          points: 12,
          status: 'PENDING',
          created_at: '2024-02-01T00:00:00.000Z',
          delivery_id: 'no-date-suffix',
          extra: { dt_prazo: '2024-03-15T00:00:00.000Z' }
        },
        {
          id: 'wrong-month',
          points: 99,
          status: 'PENDING',
          created_at: '2024-02-01T00:00:00.000Z',
          delivery_id: 'no-date-suffix',
          extra: { dt_prazo: '2024-07-15T15:00:00.000Z' }
        },
        {
          id: 'non-pending',
          points: 777,
          status: 'DONE',
          created_at: '2024-02-01T00:00:00.000Z',
          delivery_id: 'no-date-suffix',
          extra: { dt_prazo: '2024-03-15T00:00:00.000Z' }
        }
      ];
      expect(computeGame4uDrPrazoMetaBoost(actions, month)).toBe(12);
    });
  });

  describe('isGame4uUserActionFinalizedStatus / getGame4uParticipationRowKey', () => {
    it('treats DONE, DELIVERED, PAID as finalized', () => {
      expect(isGame4uUserActionFinalizedStatus('DONE')).toBe(true);
      expect(isGame4uUserActionFinalizedStatus('done')).toBe(true);
      expect(isGame4uUserActionFinalizedStatus('DELIVERED')).toBe(true);
      expect(isGame4uUserActionFinalizedStatus('PENDING')).toBe(false);
    });

    it('prefers integration_id then client_id then delivery_id', () => {
      expect(
        getGame4uParticipationRowKey({
          id: '1',
          points: 0,
          status: 'DONE',
          created_at: '2024-01-01T00:00:00.000Z',
          integration_id: '1586',
          client_id: 'c99',
          delivery_id: 'd-1'
        })
      ).toBe('1586');
      expect(
        getGame4uParticipationRowKey({
          id: '2',
          points: 0,
          status: 'DONE',
          created_at: '2024-01-01T00:00:00.000Z',
          client_id: 'c99',
          delivery_id: 'd-1'
        })
      ).toBe('c99');
      expect(
        getGame4uParticipationRowKey({
          id: '3',
          points: 0,
          status: 'DONE',
          created_at: '2024-01-01T00:00:00.000Z',
          delivery_id: '1079-2025-12-31'
        })
      ).toBe('1079-2025-12-31');
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

  describe('mapGame4uActionsToActivityList', () => {
    it('uses finished_at for display timestamp and month filter when present', () => {
      const month = new Date(2024, 5, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2024-05-01T10:00:00.000Z',
          finished_at: '2024-06-15T12:00:00.000Z'
        }
      ];
      const list = mapGame4uActionsToActivityList(actions, month);
      expect(list.length).toBe(1);
      expect(list[0].created).toBe(Date.parse('2024-06-15T12:00:00.000Z'));
    });

    it('excludes action when finished_at is outside month even if created_at is inside', () => {
      const month = new Date(2024, 5, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-10T10:00:00.000Z',
          finished_at: '2024-07-01T12:00:00.000Z'
        }
      ];
      expect(mapGame4uActionsToActivityList(actions, month).length).toBe(0);
    });

    it('falls back to created_at when finished_at is absent', () => {
      const month = new Date(2024, 5, 1);
      const actions: Game4uUserActionModel[] = [
        { id: '1', points: 1, status: 'DONE', created_at: '2024-06-10T10:00:00.000Z' }
      ];
      const list = mapGame4uActionsToActivityList(actions, month);
      expect(list.length).toBe(1);
      expect(list[0].created).toBe(Date.parse('2024-06-10T10:00:00.000Z'));
    });

    it('maps dt_prazo from reports/user-actions payload', () => {
      const month = new Date(2024, 5, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-10T10:00:00.000Z',
          finished_at: '2024-06-15T12:00:00.000Z',
          dt_prazo: '2024-06-20'
        }
      ];
      const list = mapGame4uActionsToActivityList(actions, month);
      expect(list[0].dt_prazo).toBe('2024-06-20');
    });

    it('monthFilter dtPrazo keeps pending rows whose created_at is outside month but dt_prazo is inside', () => {
      const month = new Date(2024, 5, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: 'pend',
          points: 1,
          status: 'PENDING',
          created_at: '2024-01-01T10:00:00.000Z',
          dt_prazo: '2024-06-25'
        }
      ];
      expect(mapGame4uActionsToActivityList(actions, month).length).toBe(0);
      expect(mapGame4uActionsToActivityList(actions, month, { monthFilter: 'dtPrazo' }).length).toBe(1);
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

  describe('getGame4uAtendidosGroupKey', () => {
    it('prefers delivery_id over integration_id', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        delivery_id: 'del-99',
        integration_id: 'emp-a'
      } as Game4uUserActionModel;
      expect(getGame4uAtendidosGroupKey(a)).toBe('d:del-99');
    });

    it('uses normalized extra.cnpj when delivery_id is absent', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        integration_id: 'emp-b',
        extra: { cnpj: '508.275.706-78' }
      } as Game4uUserActionModel;
      expect(getGame4uAtendidosGroupKey(a)).toBe('c:50827570678');
    });
  });

  describe('pickGame4uAtendidosRepresentativeKey', () => {
    it('keeps previous integration_id when set', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        integration_id: 'emp-z'
      } as Game4uUserActionModel;
      expect(pickGame4uAtendidosRepresentativeKey('emp-first', a)).toBe('emp-first');
    });

    it('falls back to integration_id then extra.cnpj digits', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        extra: { cnpj: '41.192.340/0001-49' }
      } as Game4uUserActionModel;
      expect(pickGame4uAtendidosRepresentativeKey(undefined, a)).toBe('41192340000149');
    });
  });

  describe('getGame4uUserActionFinishedOrFallbackMs', () => {
    it('uses finished_at first', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2025-06-01T00:00:00.000Z',
        finished_at: '2026-03-15T12:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z'
      } as Game4uUserActionModel;
      const ms = getGame4uUserActionFinishedOrFallbackMs(a);
      expect(ms).toBe(Date.parse('2026-03-15T12:00:00.000Z'));
    });

    it('falls back to updated_at when finished_at is absent', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2025-06-01T00:00:00.000Z',
        updated_at: '2026-03-10T08:00:00.000Z'
      } as Game4uUserActionModel;
      const ms = getGame4uUserActionFinishedOrFallbackMs(a);
      expect(ms).toBe(Date.parse('2026-03-10T08:00:00.000Z'));
    });
  });

  describe('game4uActionMatchesParticipacaoModalRow', () => {
    it('matches by delivery_id', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        delivery_id: 'del-42'
      } as Game4uUserActionModel;
      expect(
        game4uActionMatchesParticipacaoModalRow(a, { cnpj: 'x', deliveryId: 'del-42' })
      ).toBe(true);
    });

    it('matches row CNPJ digits to action extra.cnpj', () => {
      const a = {
        id: '1',
        points: 0,
        status: 'DONE' as const,
        created_at: '2026-01-01T00:00:00.000Z',
        integration_id: 'other',
        extra: { cnpj: '41.192.340/0001-49' }
      } as Game4uUserActionModel;
      expect(
        game4uActionMatchesParticipacaoModalRow(a, {
          cnpj: '41192340000149',
          delivery_extra_cnpj: '41.192.340/0001-49'
        })
      ).toBe(true);
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
