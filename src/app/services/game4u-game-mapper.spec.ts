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
  mergeGame4uTeamDeliveryRows,
  mapGame4uFinishedDeliveryRowsToParticipacaoCnpjRows,
  readGame4uUserActionTitle,
  aggregateExecutiveDeliveryOnTimeFromUserActions,
  aggregateExecutiveDeliveryRowsForRanking,
  aggregateExecutiveHierarchyRankings,
  aggregateExecutivePlayerRankingsFromUserActions,
  aggregateExecutiveTeamRankingFromUserActions,
  aggregateExecutiveTopProcessesFromUserActions,
  isExecutiveDeliveryRowOnTimeFromUserActions,
  computeCompanyDeliveryInsightsFromTasks,
  computeExecutiveJustifiedDeliveryPct,
  readGame4uUserActionDtPrazo,
  game4uUserActionMatchesDeliveryRow,
  resolveExecutiveHierarchySegment,
  buildJustifiedDeliveryKeysFromUserActions,
  classifyExecutivePlayerRankings,
  collectExecutiveDirectorateSeeds,
  countExecutiveFinishedTasksFromUserActions,
  countExecutiveOnTimeTasksFromUserActions,
  isGame4uDeliveryRowJustified,
  mergeExecutiveDirectorateCandidates,
  partitionExecutivePlayerRankings,
  deliveryRowCountsAsOnTime,
  deliveryRowHasFinishedTaskInMonth,
  hasMoreFinishedDeliveriesCachedPage,
  resolveGame4uFinishedPrazoStatus,
  resolveTaskPrazoBadgeKind
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

    it('maps risco_multa from reports/user-actions payload', () => {
      const month = new Date(2024, 5, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: '1',
          points: 1,
          status: 'PENDING',
          created_at: '2024-06-10T10:00:00.000Z',
          dt_prazo: '2024-06-20',
          risco_multa: true
        },
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-11T10:00:00.000Z',
          finished_at: '2024-06-12T10:00:00.000Z',
          risco_multa: false
        }
      ];
      const list = mapGame4uActionsToActivityList(actions, month, { monthFilter: 'dtPrazo' });
      expect(list.find(i => i.id === '1')?.risco_multa).toBe(true);
      expect(list.find(i => i.id === '2')?.risco_multa).toBeUndefined();
    });

    it('maps justificada when extra.status_api contains justif (case-insensitive)', () => {
      const month = new Date(2024, 5, 1);
      const actions: Game4uUserActionModel[] = [
        {
          id: 'just',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-10T10:00:00.000Z',
          finished_at: '2024-06-15T12:00:00.000Z',
          extra: { status_api: 'Pend. justificada' }
        },
        {
          id: 'caps',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-10T11:00:00.000Z',
          finished_at: '2024-06-15T13:00:00.000Z',
          extra: { status_api: 'Justificado' }
        },
        {
          id: 'ok',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-11T10:00:00.000Z',
          finished_at: '2024-06-12T10:00:00.000Z',
          extra: { status_api: 'No prazo' }
        }
      ];
      const list = mapGame4uActionsToActivityList(actions, month);
      expect(list.find(i => i.id === 'just')?.justificada).toBe(true);
      expect(list.find(i => i.id === 'caps')?.justificada).toBe(true);
      expect(list.find(i => i.id === 'ok')?.justificada).toBeUndefined();
    });

    it('maps justificada from user-actions field', () => {
      const actions: Game4uUserActionModel[] = [
        {
          id: 'pending-just',
          points: 1,
          status: 'PENDING',
          created_at: '2024-06-10T10:00:00.000Z',
          justificada: true,
          dt_prazo: '2024-06-01'
        },
        {
          id: 'done-just',
          points: 1,
          status: 'DONE',
          created_at: '2024-06-10T10:00:00.000Z',
          finished_at: '2024-06-15T12:00:00.000Z',
          justificada: true
        }
      ];
      const list = mapGame4uActionsToActivityList(actions);
      expect(list.find(i => i.id === 'pending-just')?.justificada).toBe(true);
      expect(list.find(i => i.id === 'done-just')?.justificada).toBe(true);
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

  describe('resolveGame4uFinishedPrazoStatus', () => {
    it('returns on_time when finished on the deadline day', () => {
      const prazo = '2026-05-29';
      const finishedMs = new Date(2026, 4, 29, 15, 30, 0, 0).getTime();
      expect(resolveGame4uFinishedPrazoStatus(prazo, finishedMs)).toBe('on_time');
    });

    it('returns on_time when finished before the deadline day', () => {
      const prazo = '2026-05-29';
      const finishedMs = new Date(2026, 4, 28, 23, 59, 0, 0).getTime();
      expect(resolveGame4uFinishedPrazoStatus(prazo, finishedMs)).toBe('on_time');
    });

    it('returns late when finished after the deadline day', () => {
      const prazo = '2026-05-29';
      const finishedMs = new Date(2026, 4, 30, 0, 0, 0, 0).getTime();
      expect(resolveGame4uFinishedPrazoStatus(prazo, finishedMs)).toBe('late');
    });

    it('returns unknown when prazo is missing', () => {
      expect(resolveGame4uFinishedPrazoStatus(undefined, Date.now())).toBe('unknown');
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

  describe('deliveryRowCountsAsOnTime', () => {
    it('returns true when tasks_on_time covers all tasks', () => {
      expect(
        deliveryRowCountsAsOnTime({ delivery_title: 'A', tasks_total: 3, tasks_on_time: 3 })
      ).toBe(true);
    });

    it('returns true when on_time_pct is 100%', () => {
      expect(deliveryRowCountsAsOnTime({ delivery_title: 'B', tasks_total: 2, on_time_pct: 100 })).toBe(
        true
      );
    });

    it('returns false when delivery is partially late', () => {
      expect(
        deliveryRowCountsAsOnTime({ delivery_title: 'C', tasks_total: 4, tasks_on_time: 2 })
      ).toBe(false);
      expect(deliveryRowCountsAsOnTime({ delivery_title: 'D', tasks_total: 2, on_time_pct: 80 })).toBe(
        false
      );
    });
  });

  describe('deliveryRowHasFinishedTaskInMonth', () => {
    it('returns true when tasks_total > 0', () => {
      expect(deliveryRowHasFinishedTaskInMonth({ delivery_title: 'A', tasks_total: 1 })).toBe(true);
    });

    it('returns false when month counters are zero', () => {
      expect(
        deliveryRowHasFinishedTaskInMonth({ delivery_title: 'B', tasks_total: 0, tasks_on_time: 0 })
      ).toBe(false);
    });
  });

  describe('hasMoreFinishedDeliveriesCachedPage', () => {
    it('uses total when known even if page is not full after client filter', () => {
      expect(hasMoreFinishedDeliveriesCachedPage(10, 30, 10, 45)).toBe(true);
      expect(hasMoreFinishedDeliveriesCachedPage(10, 30, 45, 45)).toBe(false);
    });

    it('uses full page heuristic when total is absent', () => {
      expect(hasMoreFinishedDeliveriesCachedPage(30, 30, 30, undefined)).toBe(true);
      expect(hasMoreFinishedDeliveriesCachedPage(5, 30, 5, undefined)).toBe(false);
    });

    it('respects explicit has_more from API', () => {
      expect(hasMoreFinishedDeliveriesCachedPage(0, 30, 0, 0, true)).toBe(true);
      expect(hasMoreFinishedDeliveriesCachedPage(30, 30, 30, 100, false)).toBe(false);
    });

    it('treats total equal to full page size as possibly incomplete', () => {
      expect(hasMoreFinishedDeliveriesCachedPage(30, 30, 30, 30)).toBe(true);
      expect(hasMoreFinishedDeliveriesCachedPage(12, 30, 12, 12)).toBe(false);
    });
  });

  describe('executive top processes from user-actions', () => {
    it('readGame4uUserActionTitle prefers top-level title', () => {
      expect(
        readGame4uUserActionTitle({
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-01',
          title: 'DCTF Web',
          action_title: 'Enviar guia',
          delivery_title: 'Cliente X'
        } as Game4uUserActionModel)
      ).toBe('DCTF Web');
    });

    it('aggregateExecutiveTopProcessesFromUserActions groups by title and counts clients', () => {
      const { top, distinctProcesses } = aggregateExecutiveTopProcessesFromUserActions([
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-01',
          title: 'Folha de pagamento',
          integration_id: 'c1',
          dt_prazo: '2026-03-10',
          finished_at: '2026-03-05T12:00:00Z'
        },
        {
          id: '2',
          points: 1,
          status: 'DELIVERED',
          created_at: '2026-03-02',
          title: 'Folha de pagamento',
          integration_id: 'c2',
          dt_prazo: '2026-03-10',
          finished_at: '2026-03-06T12:00:00Z'
        },
        {
          id: '3',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-03',
          action_title: 'SPED Fiscal',
          integration_id: 'c1',
          dt_prazo: '2026-03-10',
          finished_at: '2026-03-07T12:00:00Z'
        }
      ]);
      expect(distinctProcesses).toBe(2);
      expect(top[0].deliveryTitle).toBe('Folha de pagamento');
      expect(top[0].tasksTotal).toBe(2);
      expect(top[0].deliveriesCount).toBe(2);
    });

    it('aggregateExecutiveDeliveryRowsForRanking sums deliveries and on-time pct', () => {
      const agg = aggregateExecutiveDeliveryRowsForRanking([
        { delivery_title: 'A', tasks_total: 2, tasks_on_time: 2, emp_id: 1 },
        { delivery_title: 'B', tasks_total: 1, on_time_pct: 80, emp_id: 2 },
        { delivery_title: 'C', tasks_total: 0, emp_id: 3 }
      ]);

      expect(agg.deliveriesCount).toBe(2);
      expect(agg.judgedDeliveriesCount).toBe(2);
      expect(agg.onTimeDeliveries).toBe(1);
      expect(agg.clientsCount).toBe(2);
      expect(agg.onTimeDeliveryPct).toBe(50);
    });

    it('aggregateExecutiveDeliveryRowsForRanking ignores justified rows in deadline metrics', () => {
      const justifiedLookup = { keys: new Set(['2']), deliveryIds: new Set<string>() };
      const agg = aggregateExecutiveDeliveryRowsForRanking(
        [
          { delivery_title: 'A', tasks_total: 2, tasks_on_time: 2, emp_id: 1 },
          { delivery_title: 'B', tasks_total: 1, on_time_pct: 0, emp_id: 2 }
        ],
        { justifiedLookup }
      );

      expect(agg.deliveriesCount).toBe(2);
      expect(agg.judgedDeliveriesCount).toBe(1);
      expect(agg.onTimeDeliveries).toBe(1);
      expect(agg.onTimeDeliveryPct).toBe(100);
      expect(isGame4uDeliveryRowJustified({ delivery_title: 'B', emp_id: 2 }, justifiedLookup)).toBe(
        true
      );
    });

    it('isGame4uDeliveryRowJustified detects extra.status_api with justif on delivery row', () => {
      expect(
        isGame4uDeliveryRowJustified({
          delivery_title: 'Cliente X',
          emp_id: 99,
          extra: { status_api: 'Pend. justificada' }
        })
      ).toBe(true);
    });

    it('countExecutiveFinishedTasksFromUserActions excludes justified actions', () => {
      const counts = countExecutiveFinishedTasksFromUserActions([
        { id: '1', points: 1, status: 'DONE', created_at: '2026-03-01', extra: { status_api: 'Pend. justificada' } },
        { id: '2', points: 1, status: 'DONE', created_at: '2026-03-02' },
        { id: '3', points: 1, status: 'PENDING', created_at: '2026-03-03' }
      ]);

      expect(counts).toEqual({ total: 2, justified: 1, judged: 1 });
    });

    it('resolveExecutiveHierarchySegment groups by gerente for diretor view', () => {
      const action = {
        id: '1',
        points: 1,
        status: 'DONE',
        created_at: '2026-03-01',
        hierarchy: {
          gerente_email: 'ellem.sampaio@bwa.global',
          gerente_name: 'Ellem Sampaio',
          team_id: 68,
          team_name: 'Legalização - Registro Geral - SP'
        }
      } as Game4uUserActionModel;

      expect(resolveExecutiveHierarchySegment(action, 'gerente')).toEqual({
        key: 'ellem.sampaio@bwa.global',
        name: 'Ellem Sampaio',
        email: 'ellem.sampaio@bwa.global'
      });
    });

    it('resolveExecutiveHierarchySegment groups by diretor for c-level view', () => {
      const action = {
        id: '1',
        points: 1,
        status: 'DONE',
        created_at: '2026-03-01',
        hierarchy: {
          diretor_email: 'diretor@bwa.global',
          diretor_name: 'Diretor X'
        }
      } as Game4uUserActionModel;

      expect(resolveExecutiveHierarchySegment(action, 'diretor')).toEqual({
        key: 'diretor@bwa.global',
        name: 'Diretor X',
        email: 'diretor@bwa.global'
      });
    });

    it('aggregateExecutiveHierarchyRankings aggregates deliveries per gerente segment', () => {
      const hierarchy = {
        gerente_email: 'gerente@bwa.global',
        gerente_name: 'Gerente A',
        team_id: 68,
        team_name: 'Equipe SP'
      };
      const actions = [
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-01',
          user_email: 'player@bwa.global',
          integration_id: '100',
          dt_prazo: '2099-01-01',
          finished_at: '2026-03-05T12:00:00Z',
          hierarchy
        },
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-02',
          user_email: 'player2@bwa.global',
          integration_id: '200',
          dt_prazo: '2020-01-01',
          finished_at: '2026-03-06T12:00:00Z',
          hierarchy: {
            gerente_email: 'outro@bwa.global',
            gerente_name: 'Gerente B',
            team_id: 69,
            team_name: 'Equipe RJ'
          }
        }
      ] as Game4uUserActionModel[];
      const rankings = aggregateExecutiveHierarchyRankings(actions, 'gerente');

      expect(rankings).toHaveLength(2);
      expect(rankings.find(r => r.email === 'gerente@bwa.global')).toEqual(
        jasmine.objectContaining({
          name: 'Gerente A',
          judgedDeliveriesCount: 1,
          onTimeDeliveries: 1,
          onTimeDeliveryPct: 100
        })
      );
      expect(rankings.find(r => r.email === 'outro@bwa.global')).toEqual(
        jasmine.objectContaining({
          judgedDeliveriesCount: 1,
          onTimeDeliveries: 0,
          onTimeDeliveryPct: 0
        })
      );
    });

    it('aggregateExecutivePlayerRankingsFromUserActions counts each user_action as one entrega', () => {
      const email = 'adriano@bwa.global';
      const actions = [1, 2, 3, 4, 5].map(n => ({
        id: String(n),
        points: 1,
        status: 'DONE',
        created_at: `2026-03-0${n}`,
        user_email: email,
        integration_id: String(n),
        dt_prazo: n <= 2 ? '2099-01-01' : '2020-01-01',
        finished_at: '2026-03-05T12:00:00Z'
      })) as Game4uUserActionModel[];

      const rankings = aggregateExecutivePlayerRankingsFromUserActions(actions);

      expect(rankings.get(email)).toEqual({
        tasksTotal: 5,
        judgedTasks: 5,
        deliveriesCount: 5,
        judgedDeliveriesCount: 5,
        justifiedDeliveriesCount: 0,
        onTimeDeliveries: 2,
        clientsCount: 5
      });
    });

    it('aggregateExecutivePlayerRankingsFromUserActions tracks justified deliveries pct', () => {
      const email = 'player@bwa.global';
      const actions = [
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-01',
          user_email: email,
          dt_prazo: '2099-01-01',
          finished_at: '2026-03-05T12:00:00Z',
          extra: { status_api: 'Pend. justificada' }
        },
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-02',
          user_email: email,
          dt_prazo: '2099-01-01',
          finished_at: '2026-03-06T12:00:00Z'
        }
      ] as Game4uUserActionModel[];

      const agg = aggregateExecutivePlayerRankingsFromUserActions(actions).get(email)!;

      expect(agg.justifiedDeliveriesCount).toBe(1);
      expect(computeExecutiveJustifiedDeliveryPct(agg.deliveriesCount, agg.justifiedDeliveriesCount)).toBe(50);
    });

    it('game4uUserActionMatchesDeliveryRow matches by user_email and emp_id', () => {
      expect(
        game4uUserActionMatchesDeliveryRow(
          { id: '1', points: 1, status: 'DONE', created_at: '2026-03-01', user_email: 'a@x.com' },
          { delivery_title: 'X', user_email: 'a@x.com', tasks_total: 1 }
        )
      ).toBe(true);
      expect(
        game4uUserActionMatchesDeliveryRow(
          { id: '1', points: 1, status: 'DONE', created_at: '2026-03-01', integration_id: '55' },
          { delivery_title: 'X', emp_id: 55, tasks_total: 1 }
        )
      ).toBe(true);
    });

    it('countExecutiveOnTimeTasksFromUserActions mirrors resumo do mês prazo rules', () => {
      const counts = countExecutiveOnTimeTasksFromUserActions([
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-01',
          dt_prazo: '2026-03-10',
          finished_at: '2026-03-05T12:00:00Z',
          extra: { status_api: 'Pend. justificada' }
        },
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-02',
          dt_prazo: '2026-03-10',
          finished_at: '2026-03-06T12:00:00Z'
        },
        {
          id: '3',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-03',
          dt_prazo: '2026-03-01',
          finished_at: '2026-03-08T12:00:00Z'
        }
      ]);

      expect(counts).toEqual({ onTime: 1, late: 1, justified: 1, judged: 2 });
    });

    it('aggregateExecutiveTopProcessesFromUserActions excludes justified from on-time pct', () => {
      const { top } = aggregateExecutiveTopProcessesFromUserActions([
        {
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-01',
          title: 'Processo X',
          integration_id: 'c1',
          dt_prazo: '2020-01-01',
          finished_at: '2026-03-05T12:00:00Z',
          extra: { status_api: 'Pend. justificada' }
        },
        {
          id: '2',
          points: 1,
          status: 'DONE',
          created_at: '2026-03-02',
          title: 'Processo X',
          integration_id: 'c2',
          dt_prazo: '2099-01-01',
          finished_at: '2026-03-06T12:00:00Z'
        }
      ]);

      expect(top[0].tasksTotal).toBe(2);
      expect(top[0].onTimePct).toBe(100);
      expect(buildJustifiedDeliveryKeysFromUserActions([{ id: '1', points: 1, status: 'DONE', created_at: '2026-03-01', extra: { status_api: 'Justificado' }, delivery_id: 'd1' }])).toEqual(
        new Set(['d1'])
      );
    });

    it('partitionExecutivePlayerRankings keeps attention players out of top highlights', () => {
      const players = [
        { email: 'a@x.com', deliveriesCount: 5, onTimeDeliveries: 4, onTimeDeliveryPct: 80 },
        { email: 'b@x.com', deliveriesCount: 4, onTimeDeliveries: 3, onTimeDeliveryPct: 75 },
        { email: 'c@x.com', deliveriesCount: 3, onTimeDeliveries: 2, onTimeDeliveryPct: 66.7 }
      ];

      const { top, attention } = partitionExecutivePlayerRankings(players);

      expect(attention.map(p => p.email)).toEqual(['c@x.com', 'b@x.com', 'a@x.com']);
      expect(top).toEqual([]);
    });

    it('partitionExecutivePlayerRankings excludes null pct and justified-only volumes from attention', () => {
      const { attention } = partitionExecutivePlayerRankings([
        { email: 'null@x.com', deliveriesCount: 5, judgedDeliveriesCount: 5, onTimeDeliveries: 2, onTimeDeliveryPct: null },
        { email: 'low@x.com', deliveriesCount: 4, judgedDeliveriesCount: 4, onTimeDeliveries: 2, onTimeDeliveryPct: 50 }
      ]);

      expect(attention.map(p => p.email)).toEqual(['low@x.com']);
    });

    it('partitionExecutivePlayerRankings lists only non-attention players in top highlights', () => {
      const players = [
        { email: 'star@x.com', deliveriesCount: 10, onTimeDeliveries: 10, onTimeDeliveryPct: 100 },
        { email: 'risk@x.com', deliveriesCount: 8, onTimeDeliveries: 4, onTimeDeliveryPct: 50 },
        { email: 'mid@x.com', deliveriesCount: 6, onTimeDeliveries: 5, onTimeDeliveryPct: 83.3 }
      ];

      const { top, attention } = partitionExecutivePlayerRankings(players);

      expect(attention.map(p => p.email)).toEqual(['risk@x.com', 'mid@x.com']);
      expect(top.map(p => p.email)).toEqual(['star@x.com']);
    });

    it('classifyExecutivePlayerRankings returns all directorates with status labels', () => {
      const players = [
        { email: 'star@x.com', name: 'Star', deliveriesCount: 10, judgedDeliveriesCount: 10, onTimeDeliveries: 10, onTimeDeliveryPct: 100 },
        { email: 'risk@x.com', name: 'Risk', deliveriesCount: 8, judgedDeliveriesCount: 8, onTimeDeliveries: 4, onTimeDeliveryPct: 50 },
        { email: 'quiet@x.com', name: 'Quiet', deliveriesCount: 1, judgedDeliveriesCount: 1, onTimeDeliveries: 1, onTimeDeliveryPct: 100 },
        { email: 'empty@x.com', name: 'Empty', deliveriesCount: 0, judgedDeliveriesCount: 0, onTimeDeliveries: 0, onTimeDeliveryPct: null }
      ];

      const classified = classifyExecutivePlayerRankings(players);

      expect(classified.map(c => [c.item.email, c.status])).toEqual([
        ['risk@x.com', 'atencao'],
        ['star@x.com', 'destaque'],
        ['empty@x.com', 'neutral'],
        ['quiet@x.com', 'neutral']
      ]);
    });

    it('mergeExecutiveDirectorateCandidates includes directorates without deliveries', () => {
      const seeds = new Map([
        ['dir-a@x.com', { name: 'Diretoria A', email: 'dir-a@x.com' }],
        ['dir-b@x.com', { name: 'Diretoria B', email: 'dir-b@x.com' }]
      ]);
      const aggregated = aggregateExecutiveHierarchyRankings(
        [
          {
            id: '1',
            points: 1,
            status: 'DONE',
            created_at: '2026-03-01',
            user_email: 'p@x.com',
            hierarchy: {
              diretor_email: 'dir-a@x.com',
              diretor_name: 'Diretoria A'
            },
            dt_prazo: '2099-01-01',
            finished_at: '2026-03-05T12:00:00Z'
          }
        ],
        'diretor'
      );

      const merged = mergeExecutiveDirectorateCandidates(seeds, aggregated);

      expect(merged.map(m => m.email).sort()).toEqual(['dir-a@x.com', 'dir-b@x.com']);
      expect(merged.find(m => m.email === 'dir-b@x.com')?.deliveriesCount).toBe(0);
    });

    it('collectExecutiveDirectorateSeeds merges actions and DIRETOR managers', () => {
      const seeds = collectExecutiveDirectorateSeeds(
        [
          {
            id: '1',
            points: 1,
            status: 'PENDING',
            created_at: '2026-03-01',
            hierarchy: { diretor_email: 'dir-a@x.com', diretor_name: 'Diretoria A' }
          }
        ],
        [{ user_email: 'dir-b@x.com', user_role: 'DIRETOR' }],
        email => `Label ${email}`
      );

      expect([...seeds.keys()].sort()).toEqual(['dir-a@x.com', 'dir-b@x.com']);
      expect(seeds.get('dir-b@x.com')?.name).toBe('Label dir-b@x.com');
    });
  });

  describe('readGame4uUserActionDtPrazo', () => {
    it('reads root dt_prazo', () => {
      expect(
        readGame4uUserActionDtPrazo({
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-06-01',
          dt_prazo: '2026-06-20'
        })
      ).toBe('2026-06-20');
    });

    it('falls back to extra.dt_prazo', () => {
      expect(
        readGame4uUserActionDtPrazo({
          id: '1',
          points: 1,
          status: 'DONE',
          created_at: '2026-06-01',
          extra: { dt_prazo: '2026-06-25T00:00:00.000Z' }
        })
      ).toBe('2026-06-25');
    });
  });

  describe('computeCompanyDeliveryInsightsFromTasks', () => {
    it('flags fine risk and suggests urgent action', () => {
      const snap = computeCompanyDeliveryInsightsFromTasks([
        {
          created: Date.parse('2026-06-10'),
          dt_prazo: '2026-06-15',
          risco_multa: true
        }
      ]);
      expect(snap.fineRiskTasks).toBe(1);
      expect(snap.presets.some(p => p.tone === 'urgent')).toBe(true);
    });

    it('suggests improvement when many tasks are late', () => {
      const snap = computeCompanyDeliveryInsightsFromTasks([
        { created: Date.parse('2026-06-20'), dt_prazo: '2026-06-10' },
        { created: Date.parse('2026-06-18'), dt_prazo: '2026-06-12' }
      ]);
      expect(snap.lateTasks).toBe(2);
      expect(snap.presets.some(p => p.title === 'Oportunidade de melhoria')).toBe(true);
    });

    it('suggests maintaining rhythm when all judged tasks are on time', () => {
      const snap = computeCompanyDeliveryInsightsFromTasks([
        { created: Date.parse('2026-06-10'), dt_prazo: '2026-06-20' },
        { created: Date.parse('2026-06-12'), dt_prazo: '2026-06-25' }
      ]);
      expect(snap.onTimeTasks).toBe(2);
      expect(snap.lateTasks).toBe(0);
      expect(snap.presets.some(p => p.tone === 'success')).toBe(true);
    });

    it('counts justified tasks separately from late/on-time', () => {
      const snap = computeCompanyDeliveryInsightsFromTasks([
        {
          created: Date.parse('2026-06-20'),
          dt_prazo: '2026-06-10',
          justificada: true
        },
        { created: Date.parse('2026-06-10'), dt_prazo: '2026-06-20' }
      ]);
      expect(snap.justifiedTasks).toBe(1);
      expect(snap.onTimeTasks).toBe(1);
      expect(snap.lateTasks).toBe(0);
      expect(snap.presets.some(p => p.title === 'Entregas justificadas')).toBe(true);
    });
  });

  describe('mapGame4uFinishedDeliveryRowsToParticipacaoCnpjRows', () => {
    it('omits deliveries without finished tasks in the selected month', () => {
      const month = new Date(2026, 4, 1);
      const rows = mapGame4uFinishedDeliveryRowsToParticipacaoCnpjRows(
        [
          { delivery_title: 'Com tarefa', emp_id: 1, tasks_total: 2, on_time_pct: 50 },
          { delivery_title: 'Sem tarefa', emp_id: 2, tasks_total: 0, tasks_on_time: 0 }
        ],
        month
      );
      expect(rows.length).toBe(1);
      expect(rows[0].delivery_title).toBe('Com tarefa');
    });
  });

  describe('resolveTaskPrazoBadgeKind', () => {
    it('returns distinct labels for finished justified, pending justified and pending overdue', () => {
      expect(
        resolveTaskPrazoBadgeKind({ justificada: true, isPending: false, isOverdue: false })
      ).toBe('entrega-justificada');
      expect(
        resolveTaskPrazoBadgeKind({ justificada: true, isPending: true, isOverdue: true })
      ).toBe('atraso-justificado');
      expect(
        resolveTaskPrazoBadgeKind({ justificada: false, isPending: true, isOverdue: true })
      ).toBe('atraso');
      expect(
        resolveTaskPrazoBadgeKind({ justificada: false, isPending: true, isOverdue: false })
      ).toBeNull();
    });
  });
});
