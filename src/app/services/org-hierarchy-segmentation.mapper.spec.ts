import { OrgHierarchyNode } from '@model/game4u-api.model';
import {
  buildSegmentedOrgHierarchyTree,
  collectDefaultExpandedSegmentedNodeIds,
  normalizeOrgHierarchyTree,
  resolveCLevelAnchorFromApi,
  resolveSupervisaoSegmentation
} from './org-hierarchy-segmentation.mapper';

function metric(value: number): OrgHierarchyNode['mtd'] {
  return {
    finished: value,
    points_delivered: value * 10,
    on_time_pct: 80
  };
}

function compare(value: number): OrgHierarchyNode['compare'] {
  return {
    vs_prev_mtd_points: value,
    vs_prev_mtd_points_pct: 10
  };
}

function supervisao(
  id: string,
  label: string,
  points: number,
  players = 2
): OrgHierarchyNode {
  return {
    node_type: 'supervisao',
    node_id: id,
    label,
    players_count: players,
    season_points_total: points,
    balance_score: 100,
    mtd: metric(points),
    prev_full: metric(points),
    prev_mtd: metric(points),
    compare: compare(points)
  };
}

describe('org-hierarchy-segmentation.mapper', () => {
  const apiRoot: OrgHierarchyNode = {
    node_type: 'organization',
    node_id: 'org-bwa',
    label: 'bwa',
    players_count: 21,
    season_points_total: 5574,
    balance_score: 637.8,
    mtd: metric(557),
    prev_full: metric(557),
    prev_mtd: metric(557),
    compare: compare(557),
    children: [
      {
        node_type: 'c_level',
        node_id: 'andre',
        label: 'ANDRE ADOLFO',
        players_count: 21,
        season_points_total: 5574,
        balance_score: 637.8,
        mtd: metric(557),
        prev_full: metric(557),
        prev_mtd: metric(557),
        compare: compare(557),
        children: [
          {
            node_type: 'c_level',
            node_id: 'pedro',
            label: 'Pedro Barros',
            players_count: 21,
            season_points_total: 5574,
            balance_score: 637.8,
            mtd: metric(557),
            prev_full: metric(557),
            prev_mtd: metric(557),
            compare: compare(557),
            children: [
              {
                node_type: 'diretoria',
                node_id: 'dir-1',
                label: 'Daniel Viana',
                players_count: 10,
                season_points_total: 3000,
                balance_score: 640,
                mtd: metric(300),
                prev_full: metric(300),
                prev_mtd: metric(300),
                compare: compare(300),
                children: [
                  {
                    node_type: 'gerencia',
                    node_id: 'ger-1',
                    label: 'Gerência Fiscal SP',
                    players_count: 5,
                    season_points_total: 1500,
                    balance_score: 650,
                    mtd: metric(150),
                    prev_full: metric(150),
                    prev_mtd: metric(150),
                    compare: compare(150),
                    children: [
                      supervisao('sup-fiscal', 'Fiscal - Apuração SP', 80),
                      supervisao('sup-simples', 'Simples Nacional - SP', 70)
                    ]
                  },
                  {
                    node_type: 'gerencia',
                    node_id: 'ger-2',
                    label: 'Gerência Legalização',
                    players_count: 5,
                    season_points_total: 1500,
                    balance_score: 620,
                    mtd: metric(150),
                    prev_full: metric(150),
                    prev_mtd: metric(150),
                    compare: compare(150),
                    children: [supervisao('sup-legal', 'Legalização - Registro Geral - SP', 90)]
                  }
                ]
              },
              {
                node_type: 'diretoria',
                node_id: 'dir-2',
                label: 'Sem diretoria',
                players_count: 11,
                season_points_total: 2574,
                balance_score: 630,
                mtd: metric(257),
                prev_full: metric(257),
                prev_mtd: metric(257),
                compare: compare(257),
                children: [
                  {
                    node_type: 'gerencia',
                    node_id: 'ger-3',
                    label: 'Gerência DP',
                    players_count: 6,
                    season_points_total: 1200,
                    balance_score: 610,
                    mtd: metric(120),
                    prev_full: metric(120),
                    prev_mtd: metric(120),
                    compare: compare(120),
                    children: [supervisao('sup-dp', 'Departamento Pessoal - Folha', 60)]
                  },
                  {
                    node_type: 'gerencia',
                    node_id: 'ger-4',
                    label: 'Gerência Contábil',
                    players_count: 5,
                    season_points_total: 1374,
                    balance_score: 645,
                    mtd: metric(137),
                    prev_full: metric(137),
                    prev_mtd: metric(137),
                    compare: compare(137),
                    children: [supervisao('sup-cont', 'Contábil - Fechamento', 110)]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  it('normalizes API node types and removes players from the display tree', () => {
    const withPlayer = supervisao('sup', 'Fiscal - Teste', 10);
    withPlayer.children = [
      {
        node_type: 'player',
        node_id: 'p1',
        label: 'Colaborador',
        players_count: 1,
        season_points_total: 0,
        mtd: {},
        prev_full: {},
        prev_mtd: {},
        compare: {}
      }
    ];

    const normalized = normalizeOrgHierarchyTree(withPlayer);
    expect(normalized.node_type).toBe('supervisao');
    expect(normalized.children).toBeUndefined();
  });

  it('resolves Pedro Barros as C-Level anchor from API data', () => {
    const normalized = normalizeOrgHierarchyTree(apiRoot);
    const anchor = resolveCLevelAnchorFromApi(normalized);
    expect(anchor?.label).toBe('Pedro Barros');
    expect(anchor?.node_id).toBe('pedro');
  });

  it('classifies supervision names into umbrellas', () => {
    expect(resolveSupervisaoSegmentation('Fiscal - Apuração SP')).toBe('Fiscal');
    expect(resolveSupervisaoSegmentation('Contábil - Fechamento')).toBe('Contábil');
    expect(resolveSupervisaoSegmentation('Departamento Pessoal - Folha')).toBe('Departamento Pessoal');
    expect(resolveSupervisaoSegmentation('Legalização - Registro Geral - SP')).toBe('Legalização');
    expect(resolveSupervisaoSegmentation('Simples Nacional - SP')).toBe('Simples Nacional');
  });

  it('builds organization > Pedro Barros > segmentations > diretoria > gerencia > supervisao from API tree', () => {
    const display = buildSegmentedOrgHierarchyTree(apiRoot)!;

    expect(display.label).toBe('bwa');
    expect(display.children?.length).toBe(1);
    expect(display.children![0].label).toBe('Pedro Barros');
    expect(display.children![0].node_id).toBe('pedro');
    expect(display.children![0].children?.map(node => node.label)).toEqual([
      'Fiscal',
      'Contábil',
      'Departamento Pessoal',
      'Legalização',
      'Simples Nacional'
    ]);

    const fiscal = display.children![0].children!.find(node => node.label === 'Fiscal')!;
    expect(fiscal.children?.length).toBe(1);
    expect(fiscal.children![0].label).toBe('Daniel Viana');
    expect(fiscal.children![0].children![0].label).toBe('Gerência Fiscal SP');
    expect(fiscal.children![0].children![0].children!.map(node => node.label)).toEqual([
      'Fiscal - Apuração SP'
    ]);

    const simples = display.children![0].children!.find(node => node.label === 'Simples Nacional')!;
    expect(simples.children![0].children![0].children!.map(node => node.label)).toEqual([
      'Simples Nacional - SP'
    ]);
  });

  it('does not include Andre Adolfo in the display hierarchy', () => {
    const display = buildSegmentedOrgHierarchyTree(apiRoot)!;
    const labels: string[] = [];
    const walk = (node: OrgHierarchyNode): void => {
      labels.push(node.label);
      for (const child of node.children ?? []) {
        walk(child);
      }
    };
    walk(display);
    expect(labels).not.toContain('ANDRE ADOLFO');
  });

  it('collects default expanded ids for organization, c-level and segmentations', () => {
    const display = buildSegmentedOrgHierarchyTree(apiRoot)!;
    const ids = collectDefaultExpandedSegmentedNodeIds(display);

    expect(ids).toContain('org-bwa');
    expect(ids).toContain('pedro');
    expect(ids).toContain('segmentacao-fiscal');
    expect(ids).toContain('segmentacao-contabil');
  });
});
