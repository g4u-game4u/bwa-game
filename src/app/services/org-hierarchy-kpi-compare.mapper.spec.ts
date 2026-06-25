import {
  buildOrgKpiComparePanel,
  resolveOrgKpiMonthlyHistoryForChart
} from './org-hierarchy-kpi-compare.mapper';

describe('org-hierarchy-kpi-compare.mapper monthly history', () => {
  it('move closed-month totals from MTD column to full month column', () => {
    const history = resolveOrgKpiMonthlyHistoryForChart(
      'points_delivered',
      {
        mtd: { points_delivered: 9000 },
        prev_mtd: {},
        prev_full: {},
        compare: {},
        mtd_monthly_series: [
          {
            cache_month: '2026-05-01',
            mtd_finished: 0,
            mtd_points_delivered: 36000,
            mtd_goal_points: 0,
            mtd_pending_open: 0,
            mtd_multa_risk: 0,
            mtd_multa_incurred: 0,
            mtd_on_time_pct: 0,
            mtd_clients_served: 0
          },
          {
            cache_month: '2026-06-01',
            mtd_finished: 0,
            mtd_points_delivered: 9000,
            mtd_goal_points: 0,
            mtd_pending_open: 0,
            mtd_multa_risk: 0,
            mtd_multa_incurred: 0,
            mtd_on_time_pct: 0,
            mtd_clients_served: 0
          }
        ]
      },
      undefined,
      { cache_month: '2026-06-01' }
    );

    expect(history).toHaveLength(2);
    expect(history[0].mtdValue).toBeNull();
    expect(history[0].fullValue).toBe(36000);
    expect(history[1].mtdValue).toBe(9000);
    expect(history[1].fullValue).toBeNull();
  });

  it('merges kpi-detail full_value over hierarchy-report series', () => {
    const history = resolveOrgKpiMonthlyHistoryForChart(
      'points_delivered',
      {
        mtd: { points_delivered: 9000 },
        prev_mtd: {},
        prev_full: {},
        compare: {},
        mtd_monthly_series: [
          {
            cache_month: '2026-05-01',
            mtd_finished: 0,
            mtd_points_delivered: 8100,
            mtd_goal_points: 0,
            mtd_pending_open: 0,
            mtd_multa_risk: 0,
            mtd_multa_incurred: 0,
            mtd_on_time_pct: 0,
            mtd_clients_served: 0
          }
        ]
      },
      [
        {
          cache_month: '2026-05-01',
          month_label: '2026-05',
          value: 8100,
          full_value: 36000
        }
      ],
      { cache_month: '2026-06-01' }
    );

    expect(history[0].mtdValue).toBe(8100);
    expect(history[0].fullValue).toBe(36000);
  });

  it('buildOrgKpiComparePanel keeps snapshot values from hierarchy-report windows', () => {
    const panel = buildOrgKpiComparePanel(
      'points_delivered',
      {
        mtd: { points_delivered: 9000 },
        prev_mtd: { points_delivered: 8100 },
        prev_full: { points_delivered: 36000 },
        compare: {
          vs_prev_mtd_points: 900,
          vs_prev_mtd_points_pct: 11.1,
          vs_prev_full_points: -27000,
          vs_prev_full_points_pct: -75
        }
      },
      {
        cache_month: '2026-06-01',
        mtd_start: '2026-06-01',
        mtd_end: '2026-06-22',
        prev_month: '2026-05-01',
        prev_mtd_start: '2026-05-01',
        prev_mtd_end: '2026-05-22'
      }
    );

    expect(panel?.currentSnapshot.value).toBe(9000);
    expect(panel?.prevMtdSnapshot.value).toBe(8100);
    expect(panel?.prevFullSnapshot.value).toBe(36000);
  });
});
