import { OrgHierarchyNode } from '@model/game4u-api.model';
import {
  getHighlightGerenciaLabel,
  getHighlightTeamLabel,
  highlightHasContext
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
});
