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
  ORG_HIGHLIGHT_MTD_COLUMNS
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
