import { ActivityListItem } from '@model/gamification-dashboard.model';
import { computeDashboardInsightsFromActivityLists } from './dashboard-insights.service';

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
});
