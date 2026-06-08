import { ActivityListItem } from '@model/gamification-dashboard.model';
import {
  buildDashboardInsightPresets,
  computeDashboardInsightsFromActivityLists,
  mergeDashboardInsightsSnapshots
} from './dashboard-insights.service';
import { DASHBOARD_INSIGHTS_WEEKDAY_LABELS } from '@model/dashboard-insights.model';

describe('computeDashboardInsightsFromActivityLists', () => {
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYmd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayYmd = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  it('counts fine risk, due soon and overdue pending tasks', () => {
    const pending: ActivityListItem[] = [
      { id: '1', title: 'A', points: 1, created: 0, dt_prazo: yesterdayYmd, risco_multa: true },
      { id: '2', title: 'B', points: 1, created: 0, dt_prazo: todayYmd },
      { id: '3', title: 'C', points: 1, created: 0, dt_prazo: tomorrowYmd, risco_multa: true }
    ];
    const snapshot = computeDashboardInsightsFromActivityLists(pending, []);
    expect(snapshot.fineRiskTasks).toBe(2);
    expect(snapshot.overduePendingTasks).toBe(1);
    expect(snapshot.dueSoonTasks).toBe(2);
  });

  it('finds top activity and most productive weekday from finished tasks', () => {
    const monday = new Date(2026, 5, 1, 12, 0, 0, 0);
    while (monday.getDay() !== 1) {
      monday.setDate(monday.getDate() + 1);
    }
    const tuesday = new Date(monday);
    tuesday.setDate(tuesday.getDate() + 1);

    const finished: ActivityListItem[] = [
      {
        id: '1',
        title: 'Emitir certidão',
        points: 1,
        created: monday.getTime(),
        dt_prazo: '2026-06-10'
      },
      {
        id: '2',
        title: 'Emitir certidão',
        points: 1,
        created: tuesday.getTime(),
        dt_prazo: '2026-06-12'
      },
      {
        id: '3',
        title: 'Outra tarefa',
        points: 1,
        created: monday.getTime(),
        dt_prazo: '2026-06-08'
      }
    ];

    const snapshot = computeDashboardInsightsFromActivityLists([], finished);
    expect(snapshot.topActivity?.label).toBe('Emitir certidão');
    expect(snapshot.topActivity?.count).toBe(2);
    expect(snapshot.mostProductiveWeekday?.index).toBe(1);
    expect(snapshot.onTimeFinishedTasks).toBe(3);
  });

  it('counts justified tasks separately from on-time and late finished', () => {
    const finished: ActivityListItem[] = [
      {
        id: '1',
        title: 'No prazo',
        points: 1,
        created: Date.now(),
        dt_prazo: '2099-01-01'
      },
      {
        id: '2',
        title: 'Atrasada',
        points: 1,
        created: Date.now(),
        dt_prazo: '2020-01-01'
      },
      {
        id: '3',
        title: 'Justificada',
        points: 1,
        created: Date.now(),
        dt_prazo: '2020-01-01',
        atraso_justificado: true
      }
    ];
    const pending: ActivityListItem[] = [
      {
        id: '4',
        title: 'Pend. justificada',
        points: 1,
        created: 0,
        dt_prazo: yesterdayYmd,
        atraso_justificado: true
      }
    ];

    const snapshot = computeDashboardInsightsFromActivityLists(pending, finished);

    expect(snapshot.justifiedTasks).toBe(2);
    expect(snapshot.onTimeFinishedTasks).toBe(1);
    expect(snapshot.lateFinishedTasks).toBe(1);
    expect(snapshot.finishedTasks).toBe(3);
    expect(snapshot.pendingTasks).toBe(1);
  });

  it('excludes justified pending tasks from overdue and due soon alerts', () => {
    const pending: ActivityListItem[] = [
      {
        id: '1',
        title: 'Justificada atrasada',
        points: 1,
        created: 0,
        dt_prazo: yesterdayYmd,
        atraso_justificado: true
      },
      {
        id: '2',
        title: 'Atrasada real',
        points: 1,
        created: 0,
        dt_prazo: yesterdayYmd
      }
    ];

    const snapshot = computeDashboardInsightsFromActivityLists(pending, []);

    expect(snapshot.justifiedTasks).toBe(1);
    expect(snapshot.overduePendingTasks).toBe(1);
    expect(snapshot.pendingTasks).toBe(2);
  });
});

describe('mergeDashboardInsightsSnapshots', () => {
  it('sums counts and merges top activities across teams', () => {
    const base = computeDashboardInsightsFromActivityLists(
      [{ id: '1', title: 'Pend', points: 1, created: 0, risco_multa: true }],
      []
    );
    const other = computeDashboardInsightsFromActivityLists(
      [],
      [{ id: '2', title: 'Emitir certidão', points: 1, created: Date.now(), dt_prazo: '2026-06-10' }]
    );
    const merged = mergeDashboardInsightsSnapshots([base, other]);
    expect(merged?.fineRiskTasks).toBe(1);
    expect(merged?.pendingTasks).toBe(1);
    expect(merged?.finishedTasks).toBe(1);
    expect(merged?.topActivity?.label).toBe('Emitir certidão');
    expect(merged?.weekdayDistribution.length).toBe(DASHBOARD_INSIGHTS_WEEKDAY_LABELS.length);
  });
});

describe('buildDashboardInsightPresets', () => {
  it('returns player fine-risk preset when there is risco de multa', () => {
    const presets = buildDashboardInsightPresets(
      {
        fineRiskTasks: 2,
        fineRiskDeliveries: 1,
        overduePendingTasks: 0,
        dueSoonTasks: 0,
        dueSoonDays: 3,
        finishedTasks: 0,
        onTimeFinishedTasks: 0,
        lateFinishedTasks: 0,
        justifiedTasks: 0,
        pendingTasks: 2
      },
      { audience: 'player' }
    );

    expect(presets[0]).toEqual(
      jasmine.objectContaining({
        tone: 'urgent',
        title: 'Risco de multa identificado'
      })
    );
    expect(presets[0].message).toContain('2 entregas');
    expect(presets[0].message).toContain('regularização');
    expect(presets[0].message).not.toContain('assessoria');
  });

  it('returns supervisor-specific message for overdue pending tasks', () => {
    const presets = buildDashboardInsightPresets(
      {
        fineRiskTasks: 0,
        fineRiskDeliveries: 0,
        overduePendingTasks: 3,
        dueSoonTasks: 0,
        dueSoonDays: 3,
        finishedTasks: 0,
        onTimeFinishedTasks: 0,
        lateFinishedTasks: 0,
        justifiedTasks: 0,
        pendingTasks: 3
      },
      { audience: 'supervisor', scopeLabel: 'do time' }
    );

    expect(presets[0].title).toBe('Pendências fora do prazo');
    expect(presets[0].message).toContain('no time');
    expect(presets[0].message).toContain('Verifique quem concentra');
    expect(presets[0].message).not.toContain('assessoria');
  });

  it('uses colaborador ref in supervisor fine-risk preset when scope is a collaborator', () => {
    const presets = buildDashboardInsightPresets(
      {
        fineRiskTasks: 1,
        fineRiskDeliveries: 1,
        overduePendingTasks: 0,
        dueSoonTasks: 0,
        dueSoonDays: 3,
        finishedTasks: 0,
        onTimeFinishedTasks: 0,
        lateFinishedTasks: 0,
        justifiedTasks: 0,
        pendingTasks: 1
      },
      { audience: 'supervisor', scopeLabel: 'do colaborador selecionado' }
    );

    expect(presets[0].message).toContain('colaborador responsável');
    expect(presets[0].message).not.toContain('assessoria');
  });

  it('returns c_level healthy month preset when all finished tasks are on time', () => {
    const presets = buildDashboardInsightPresets(
      {
        fineRiskTasks: 0,
        fineRiskDeliveries: 0,
        overduePendingTasks: 0,
        dueSoonTasks: 0,
        dueSoonDays: 3,
        finishedTasks: 5,
        onTimeFinishedTasks: 5,
        lateFinishedTasks: 0,
        justifiedTasks: 0,
        pendingTasks: 0
      },
      { audience: 'c_level', scopeLabel: 'da organização' }
    );

    expect(presets.some(p => p.title === 'Ritmo saudável')).toBe(true);
    expect(presets.find(p => p.title === 'Ritmo saudável')?.message).toContain('organização');
  });

  it('returns gerente and diretor presets with distinct copy for due soon tasks', () => {
    const metrics = {
      fineRiskTasks: 0,
      fineRiskDeliveries: 0,
      overduePendingTasks: 0,
      dueSoonTasks: 4,
      dueSoonDays: 3,
      finishedTasks: 2,
      onTimeFinishedTasks: 2,
      lateFinishedTasks: 0,
      justifiedTasks: 0,
      pendingTasks: 4
    };

    const gerente = buildDashboardInsightPresets(metrics, {
      audience: 'gerente',
      scopeLabel: 'do time'
    });
    const diretor = buildDashboardInsightPresets(metrics, {
      audience: 'diretor',
      scopeLabel: 'da organização'
    });

    expect(gerente[0].title).toBe('Prazos se aproximando');
    expect(gerente[0].message).toContain('supervisões');
    expect(diretor[0].message).toContain('gerências');
  });
});
