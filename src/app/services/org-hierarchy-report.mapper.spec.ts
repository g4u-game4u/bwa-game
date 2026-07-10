import { OrgHierarchyNode } from '@model/game4u-api.model';
import {
  getHighlightGerenciaLabel,
  getHighlightTeamLabel,
  getHighlightDiretoriaLabel,
  highlightHasContext,
  highlightHasContextForViewTab,
  inferHighlightNodeType,
  filterHighlightsByViewTab,
  countHighlightsByViewTab,
  getDerivedHighlightsForTab,
  formatHighlightMtdCell,
  collectOrgHierarchyNodesByType,
  highlightViewTabHasNodes,
  getDirectorateRankingLabel,
  getOrgHierarchyAreaLabelClass,
  ORG_HIGHLIGHT_MTD_COLUMNS,
  ORG_GLOBAL_MTD_METRICS,
  formatOrgGlobalMtdValue,
  isOrgHierarchyDeliveriesDrilldownKpi,
  computeOrgPointsGoalPct,
  formatOrgPointsGoalPct,
  getOrgPointsGoalTone,
  computeOrgPointsPerCollaborator,
  formatOrgPointsPerCollaborator,
  sortOrgHierarchyChildren,
  mapAccessByDowToWeekdayStats,
  mapPlayerAccessRows,
  avgAccessSessionsPerActiveUser,
  weekdayMaxAccessDays,
  weekdayMaxAccessSessions,
  mapOrgPipelineSegments,
  mapOrgPipelineLegendSegments,
  orgPipelineSegmentsTotal
} from './org-hierarchy-report.mapper';

describe('org-hierarchy-report.mapper highlights', () => {
  const root: OrgHierarchyNode = {
    node_type: 'organization',
    node_id: 'org',
    label: 'BWA',
    players_count: 1,
    season_points_total: 0,
    mtd: {},
    prev_full: {},
    prev_mtd: {},
    compare: {},
    children: [
      {
        node_type: 'diretoria',
        node_id: 'dir-1',
        label: 'Diretoria SP',
        players_count: 1,
        season_points_total: 0,
        mtd: {},
        prev_full: {},
        prev_mtd: {},
        compare: {},
        children: [
          {
            node_type: 'gerencia',
            node_id: 'ger-1',
            label: 'Gerência Registro',
            players_count: 1,
            season_points_total: 0,
            mtd: {},
            prev_full: {},
            prev_mtd: {},
            compare: {},
            children: [
              {
                node_type: 'supervisao',
                node_id: 'sup-1',
                label: 'Supervisão Alpha',
                players_count: 1,
                season_points_total: 0,
                mtd: {},
                prev_full: {},
                prev_mtd: {},
                compare: {},
                children: [
                  {
                    node_type: 'player',
                    node_id: 'joao@bwa.com',
                    label: 'João Carlos',
                    players_count: 1,
                    season_points_total: 0,
                    mtd: {},
                    prev_full: {},
                    prev_mtd: {},
                    compare: {}
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  it('reads team and gerencia from highlight item fields', () => {
    const item = {
      label: 'João Carlos',
      team_name: 'Time Norte',
      gerencia_name: 'Gerência Sul'
    };

    expect(getHighlightTeamLabel(item, root)).toBe('Time Norte');
    expect(getHighlightGerenciaLabel(item, root)).toBe('Gerência Sul');
    expect(highlightHasContext(item, root)).toBe(true);
  });

  it('resolves team and gerencia from hierarchy tree when fields are missing', () => {
    const item = {
      node_id: 'joao@bwa.com',
      label: 'João Carlos'
    };

    expect(getHighlightTeamLabel(item, root)).toBe('Supervisão Alpha');
    expect(getHighlightGerenciaLabel(item, root)).toBe('Gerência Registro');
    expect(highlightHasContext(item, root)).toBe(true);
  });

  it('matches player by label when node_id is absent', () => {
    const item = { label: 'João Carlos' };

    expect(getHighlightTeamLabel(item, root)).toBe('Supervisão Alpha');
    expect(getHighlightGerenciaLabel(item, root)).toBe('Gerência Registro');
  });

  it('filters highlights by view tab using node_type', () => {
    const destaque = [
      { label: 'João Carlos', node_type: 'player' as const },
      { label: 'Supervisão Alpha', node_type: 'supervisao' as const },
      { label: 'Gerência Registro', node_type: 'gerencia' as const }
    ];
    const atencao = [{ label: 'Maria', node_type: 'player' as const }];

    expect(filterHighlightsByViewTab(destaque, 'player', root).map(i => i.label)).toEqual([
      'João Carlos'
    ]);
    expect(filterHighlightsByViewTab(destaque, 'supervisao', root).map(i => i.label)).toEqual([
      'Supervisão Alpha'
    ]);
    expect(filterHighlightsByViewTab(destaque, 'gerencia', root).map(i => i.label)).toEqual([
      'Gerência Registro'
    ]);
    expect(countHighlightsByViewTab(destaque, atencao, 'player', root)).toBe(2);
  });

  it('infers player tab when node_type is missing and resolves diretoria for gerencia', () => {
    const item = { label: 'João Carlos' };
    expect(inferHighlightNodeType(item, root)).toBe('player');
    expect(getHighlightDiretoriaLabel({ label: 'Gerência Registro', node_type: 'gerencia' }, root)).toBe(
      'Diretoria SP'
    );
    expect(highlightHasContextForViewTab({ label: 'Gerência Registro', node_type: 'gerencia' }, 'gerencia', root)).toBe(
      true
    );
  });

  it('includes full mtd metrics on derived highlights', () => {
    const metricsRoot: OrgHierarchyNode = {
      node_type: 'organization',
      node_id: 'org',
      label: 'BWA',
      players_count: 1,
      season_points_total: 0,
      mtd: {},
      prev_full: {},
      prev_mtd: {},
      compare: {},
      children: [
        {
          node_type: 'player',
          node_id: 'p1',
          label: 'Maria Silva',
          players_count: 1,
          season_points_total: 0,
          mtd: {
            finished: 10,
            on_time_pct: 86.72,
            clients_served: 7963,
            clients_onboarding: 1923,
            points_delivered: 1324988,
            goal_points: 891908,
            pending_open: 3179,
            multa_risk: 222,
            near_due: 1645,
            multa_and_near_due: 0,
            overdue_pending: 1534
          },
          prev_full: {},
          prev_mtd: {},
          compare: {}
        }
      ]
    };

    const { destaque } = getDerivedHighlightsForTab(metricsRoot, 'player');
    expect(destaque).toHaveLength(1);
    expect(destaque[0].mtd?.points_delivered).toBe(1324988);
    expect(destaque[0].mtd?.clients_onboarding).toBe(1923);
    expect(formatHighlightMtdCell(destaque[0], ORG_HIGHLIGHT_MTD_COLUMNS[0])).toBe('86,7%');
  });

  it('does not repeat the same node between destaque and atencao', () => {
    const manyPlayersRoot: OrgHierarchyNode = {
      node_type: 'organization',
      node_id: 'org',
      label: 'BWA',
      players_count: 12,
      season_points_total: 0,
      mtd: {},
      prev_full: {},
      prev_mtd: {},
      compare: {},
      children: Array.from({ length: 12 }).map((_, idx) => ({
        node_type: 'player',
        node_id: `p-${idx + 1}`,
        label: `Player ${idx + 1}`,
        players_count: 1,
        season_points_total: 0,
        mtd: {
          finished: 10 + idx,
          clients_served: 100 + idx,
          on_time_pct: idx % 2 === 0 ? 95 : 60
        },
        prev_full: {},
        prev_mtd: {},
        compare: {}
      }))
    };

    const { destaque, atencao } = getDerivedHighlightsForTab(manyPlayersRoot, 'player');
    const idsD = new Set(destaque.map(i => i.node_id));
    const overlap = atencao.filter(i => idsD.has(i.node_id));
    expect(overlap).toHaveLength(0);
  });

  it('returns a single ranking list for diretorias (no atencao)', () => {
    const dirsRoot: OrgHierarchyNode = {
      node_type: 'organization',
      node_id: 'org',
      label: 'BWA',
      players_count: 20,
      season_points_total: 0,
      mtd: {},
      prev_full: {},
      prev_mtd: {},
      compare: {},
      children: [
        {
          node_type: 'diretoria',
          node_id: 'd1',
          label: 'Dir 1',
          players_count: 5,
          season_points_total: 0,
          mtd: { finished: 10, clients_served: 100, on_time_pct: 90 },
          prev_full: {},
          prev_mtd: {},
          compare: {}
        },
        {
          node_type: 'diretoria',
          node_id: 'd2',
          label: 'Dir 2',
          players_count: 5,
          season_points_total: 0,
          mtd: { finished: 12, clients_served: 100, on_time_pct: 70 },
          prev_full: {},
          prev_mtd: {},
          compare: {}
        },
        {
          node_type: 'diretoria',
          node_id: 'd3',
          label: 'Dir 3',
          players_count: 5,
          season_points_total: 0,
          mtd: { finished: 9, clients_served: 100, on_time_pct: 80 },
          prev_full: {},
          prev_mtd: {},
          compare: {}
        },
        {
          node_type: 'diretoria',
          node_id: 'd4',
          label: 'Dir 4',
          players_count: 5,
          season_points_total: 0,
          mtd: { finished: 20, clients_served: 100, on_time_pct: 85 },
          prev_full: {},
          prev_mtd: {},
          compare: {}
        }
      ]
    };

    const directorates = collectOrgHierarchyNodesByType(dirsRoot, 'diretoria');
    expect(directorates).toHaveLength(4);
    expect(directorates.map(d => d.label)).toEqual(['Dir 1', 'Dir 2', 'Dir 3', 'Dir 4']);
  });

  it('collects supervisao nodes when API uses team node_type', () => {
    const teamRoot: OrgHierarchyNode = {
      node_type: 'organization',
      node_id: 'org',
      label: 'BWA',
      players_count: 10,
      season_points_total: 0,
      mtd: {},
      prev_full: {},
      prev_mtd: {},
      compare: {},
      children: [
        {
          node_type: 'gerencia',
          node_id: 'ger-1',
          label: 'Gerência Fiscal',
          players_count: 10,
          season_points_total: 0,
          mtd: {},
          prev_full: {},
          prev_mtd: {},
          compare: {},
          children: [
            {
              node_type: 'team',
              node_id: 'team-1',
              label: 'Fiscal - Apuração SP',
              players_count: 5,
              season_points_total: 0,
              mtd: { finished: 12, on_time_pct: 88, clients_served: 40 },
              prev_full: {},
              prev_mtd: {},
              compare: {},
              children: []
            }
          ]
        }
      ]
    };

    expect(highlightViewTabHasNodes(teamRoot, 'supervisao')).toBe(true);
    const { destaque } = getDerivedHighlightsForTab(teamRoot, 'supervisao');
    expect(destaque).toHaveLength(1);
    expect(destaque[0].label).toBe('Fiscal - Apuração SP');
  });

  it('prefixes diretoria ranking label with area from segmentacao ancestor', () => {
    const root: OrgHierarchyNode = {
      node_type: 'organization',
      node_id: 'org',
      label: 'BWA',
      players_count: 1,
      season_points_total: 0,
      mtd: {},
      prev_full: {},
      prev_mtd: {},
      compare: {},
      children: [
        {
          node_type: 'area',
          node_id: 'area-fiscal',
          label: 'Fiscal',
          players_count: 1,
          season_points_total: 0,
          mtd: {},
          prev_full: {},
          prev_mtd: {},
          compare: {},
          children: [
            {
              node_type: 'diretoria',
              node_id: 'dir-1',
              label: 'Thales Furtado',
              players_count: 1,
              season_points_total: 0,
              mtd: {},
              prev_full: {},
              prev_mtd: {},
              compare: {}
            }
          ]
        },
        {
          node_type: 'segmentacao',
          node_id: 'area-pessoal',
          label: 'Departamento Pessoal',
          players_count: 1,
          season_points_total: 0,
          mtd: {},
          prev_full: {},
          prev_mtd: {},
          compare: {},
          children: [
            {
              node_type: 'diretoria',
              node_id: 'dir-2',
              label: 'Daniel Viana',
              players_count: 1,
              season_points_total: 0,
              mtd: {},
              prev_full: {},
              prev_mtd: {},
              compare: {}
            }
          ]
        }
      ]
    };

    expect(getDirectorateRankingLabel(root, root.children![0].children![0])).toBe(
      'Fiscal > Thales Furtado'
    );
    expect(getDirectorateRankingLabel(root, root.children![1].children![0])).toBe(
      'Pessoal > Daniel Viana'
    );
  });

  it('maps area labels to color css classes', () => {
    expect(getOrgHierarchyAreaLabelClass('Departamento Pessoal')).toBe('org-area-label--pessoal');
    expect(getOrgHierarchyAreaLabelClass('Fiscal')).toBe('org-area-label--fiscal');
    expect(getOrgHierarchyAreaLabelClass('Contábil')).toBe('org-area-label--contabil');
    expect(getOrgHierarchyAreaLabelClass('Legalização')).toBe('org-area-label--legalizacao');
  });
});

describe('org-hierarchy-report.mapper access', () => {
  it('maps access_by_dow to all weekdays with zero defaults', () => {
    const stats = mapAccessByDowToWeekdayStats([
      { dow: 1, access_days: 10, access_sessions: 15 },
      { dow: 5, access_days: 20, access_sessions: 25 }
    ]);
    expect(stats).toHaveLength(7);
    expect(stats[0]).toMatchObject({ dow: 1, shortLabel: 'Seg', accessDays: 10, accessSessions: 15 });
    expect(stats[4]).toMatchObject({ dow: 5, shortLabel: 'Sex', accessDays: 20, accessSessions: 25 });
    expect(stats[6]).toMatchObject({ dow: 7, accessDays: 0, accessSessions: 0 });
  });

  it('computes max access days for heatmap scaling', () => {
    const stats = mapAccessByDowToWeekdayStats([{ dow: 3, access_days: 8, access_sessions: 12 }]);
    expect(weekdayMaxAccessDays(stats)).toBe(8);
    expect(weekdayMaxAccessSessions(stats)).toBe(12);
  });

  it('maps player access rows sorted by sessions desc', () => {
    const root = {
      node_type: 'organization',
      node_id: 'bwa',
      label: 'BWA',
      players_count: 2,
      season_points_total: 0,
      mtd: {},
      prev_full: {},
      prev_mtd: {},
      compare: {},
      children: [
        {
          node_type: 'player',
          node_id: 'a@bwa.com',
          label: 'Alice',
          players_count: 1,
          season_points_total: 0,
          mtd: {},
          prev_full: {},
          prev_mtd: {},
          compare: {},
          access: {
            mtd: { access_days: 3, access_sessions: 5 },
            prev_full: {},
            prev_mtd: {},
            compare: {},
            current_streak: 2,
            last_access_date: '2026-06-15'
          }
        },
        {
          node_type: 'player',
          node_id: 'b@bwa.com',
          label: 'Bob',
          players_count: 1,
          season_points_total: 0,
          mtd: {},
          prev_full: {},
          prev_mtd: {},
          compare: {},
          access: {
            mtd: { access_days: 5, access_sessions: 12 },
            prev_full: {},
            prev_mtd: {},
            compare: {}
          }
        }
      ]
    } as any;

    const rows = mapPlayerAccessRows(root);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe('Bob');
    expect(rows[0].accessSessions).toBe(12);
    expect(rows[1].accessDays).toBe(3);
  });

  it('computes avg sessions per active user', () => {
    expect(avgAccessSessionsPerActiveUser(25, 5)).toBe(5);
    expect(avgAccessSessionsPerActiveUser(10, 0)).toBeNull();
  });
});

describe('org-hierarchy-report.mapper pipeline', () => {
  it('maps pipeline bar segments without pending_open total', () => {
    const segments = mapOrgPipelineSegments({
      pending_open: 3179,
      near_due: 1645,
      overdue_pending_justified: 294,
      overdue_pending_unjustified: 1240,
      multa_risk: 222,
      multa_incurred: 15
    });

    expect(segments.map((seg) => seg.key)).toEqual([
      'near_due',
      'overdue_pending_justified',
      'overdue_pending_unjustified'
    ]);
    expect(segments.find((seg) => seg.key === 'pending_open')).toBeUndefined();
    expect(orgPipelineSegmentsTotal(segments)).toBe(1645 + 294 + 1240);
  });

  it('maps pipeline legend with pending_open total chip outside the bar', () => {
    const mtd = {
      pending_open: 3179,
      near_due: 1645,
      overdue_pending_justified: 294,
      overdue_pending_unjustified: 1240
    };

    const legend = mapOrgPipelineLegendSegments(mtd);

    expect(legend.map((seg) => seg.key)).toEqual([
      'pending_open',
      'near_due',
      'overdue_pending_justified',
      'overdue_pending_unjustified'
    ]);
    expect(legend[0].label).toBe('Pendentes em aberto total');
    expect(legend[0].value).toBe(3179);
  });
});

describe('org-hierarchy-report.mapper global MTD', () => {
  it('formats global MTD metrics from root.mtd', () => {
    const mtd = {
      clients_served: 4595,
      finished: 59986,
      on_time_pct: 86.84,
      overdue_pending: 1528,
      overdue_pending_justified: 294,
      overdue_pending_unjustified: 1234
    };

    const onTime = ORG_GLOBAL_MTD_METRICS.find((m) => m.key === 'on_time_pct')!;
    const justified = ORG_GLOBAL_MTD_METRICS.find((m) => m.key === 'overdue_pending_justified')!;

    expect(formatOrgGlobalMtdValue(mtd, onTime)).toBe('86%');
    expect(formatOrgGlobalMtdValue(mtd, justified)).toBe('294');
    expect(ORG_GLOBAL_MTD_METRICS.map((m) => m.key)).toContain('multa_incurred');
    expect(ORG_GLOBAL_MTD_METRICS.map((m) => m.key)).toContain('multa_and_near_due');
  });
});

describe('org-hierarchy-report.mapper deliveries drilldown', () => {
  it('recognizes multa_incurred as deliveries drilldown kpi', () => {
    expect(isOrgHierarchyDeliveriesDrilldownKpi('multa_incurred')).toBe(true);
    expect(isOrgHierarchyDeliveriesDrilldownKpi('multa_risk')).toBe(true);
    expect(isOrgHierarchyDeliveriesDrilldownKpi('finished')).toBe(false);
  });
});

describe('org-hierarchy-report.mapper points goal pct', () => {
  it('computes and formats points vs goal percentage', () => {
    expect(computeOrgPointsGoalPct({ points_delivered: 9000, goal_points: 12000 })).toBe(75);
    expect(formatOrgPointsGoalPct({ points_delivered: 9000, goal_points: 12000 })).toBe('75%');
    expect(getOrgPointsGoalTone(75)).toBe('neutral');
    expect(getOrgPointsGoalTone(100)).toBe('positive');
    expect(getOrgPointsGoalTone(69)).toBe('negative');
    expect(formatOrgPointsGoalPct({ points_delivered: 100, goal_points: 0 })).toBeNull();
  });
});

describe('org-hierarchy-report.mapper ranking sort', () => {
  const node = (
    label: string,
    onTime: number,
    points: number,
    players: number
  ): OrgHierarchyNode => ({
    node_type: 'diretoria',
    node_id: label,
    label,
    players_count: players,
    season_points_total: 0,
    mtd: { on_time_pct: onTime, points_delivered: points, finished: 0, goal_points: 0 },
    prev_full: { finished: 0, points_delivered: 0, goal_points: 0 },
    prev_mtd: { finished: 0, points_delivered: 0, goal_points: 0 },
    compare: {
      vs_prev_full_points: 0,
      vs_prev_full_points_pct: 0,
      vs_prev_mtd_points: 0,
      vs_prev_mtd_points_pct: 0
    }
  });

  it('sorts directorates by on_time_pct descending', () => {
    const sorted = sortOrgHierarchyChildren(
      [node('B', 70, 1000, 10), node('A', 90, 500, 5), node('C', 85, 2000, 20)],
      'on_time_pct'
    );
    expect(sorted.map(n => n.label)).toEqual(['A', 'C', 'B']);
  });

  it('sorts directorates by points per collaborator descending', () => {
    const a = node('A', 80, 1000, 10);
    const b = node('B', 80, 1500, 10);
    const sorted = sortOrgHierarchyChildren([a, b], 'points_per_collaborator');
    expect(sorted.map(n => n.label)).toEqual(['B', 'A']);
    expect(computeOrgPointsPerCollaborator(b)).toBe(150);
    expect(formatOrgPointsPerCollaborator(b)).toBe('150,0');
  });
});
