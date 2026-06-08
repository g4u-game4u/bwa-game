import {
  OrganizationHierarchyReportResponse,
  OrgHierarchyNode,
  OrgMetricsWindow
} from '@model/game4u-api.model';

export interface MockOrgHierarchyReportOptions {
  month?: Date;
  simulationPotBrl?: number;
}

function mtdWindow(overrides: Partial<OrgMetricsWindow> = {}): OrgMetricsWindow {
  return {
    finished: 0,
    points_delivered: 0,
    goal_points: 0,
    pending_open: 0,
    multa_risk: 0,
    near_due: 0,
    multa_and_near_due: 0,
    overdue_pending: 0,
    clients_served: 0,
    on_time_pct: 0,
    ...overrides
  };
}

function compareBlock(
  mtdPts: number,
  prevMtdPts: number,
  prevFullPts: number
): OrgHierarchyNode['compare'] {
  const vsPrevMtd = mtdPts - prevMtdPts;
  const vsPrevFull = mtdPts - prevFullPts;
  return {
    vs_prev_mtd_points: vsPrevMtd,
    vs_prev_mtd_points_pct: prevMtdPts ? (vsPrevMtd / prevMtdPts) * 100 : 0,
    vs_prev_full_points: vsPrevFull,
    vs_prev_full_points_pct: prevFullPts ? (vsPrevFull / prevFullPts) * 100 : 0
  };
}

function applySimulation(
  node: OrgHierarchyNode,
  orgMtdPoints: number,
  potBrl: number
): OrgHierarchyNode {
  const basis = node.mtd?.points_delivered ?? 0;
  const sharePct = orgMtdPoints > 0 ? (basis / orgMtdPoints) * 100 : 0;
  const payoutBrl = orgMtdPoints > 0 ? (basis / orgMtdPoints) * potBrl : 0;
  const enriched: OrgHierarchyNode = {
    ...node,
    simulation: {
      share_pct: sharePct,
      payout_brl: payoutBrl,
      points_basis: basis
    }
  };
  if (node.children?.length) {
    enriched.children = node.children.map(child =>
      applySimulation(child, orgMtdPoints, potBrl)
    );
  }
  return enriched;
}

function buildPlayer(
  id: string,
  label: string,
  mtd: Partial<OrgMetricsWindow>,
  prevMtdPts: number,
  prevFullPts: number
): OrgHierarchyNode {
  const mtdPts = mtd.points_delivered ?? 0;
  return {
    node_type: 'player',
    node_id: id,
    label,
    players_count: 1,
    season_points_total: mtdPts * 4,
    mtd: mtdWindow(mtd),
    prev_full: mtdWindow({ points_delivered: prevFullPts, finished: Math.round(prevFullPts / 45) }),
    prev_mtd: mtdWindow({ points_delivered: prevMtdPts, finished: Math.round(prevMtdPts / 45) }),
    compare: compareBlock(mtdPts, prevMtdPts, prevFullPts)
  };
}

function buildSupervisao(
  id: string,
  label: string,
  players: OrgHierarchyNode[],
  risks: Partial<OrgMetricsWindow> = {}
): OrgHierarchyNode {
  const sum = (fn: (p: OrgHierarchyNode) => number) =>
    players.reduce((acc, p) => acc + fn(p), 0);
  const mtdPts = sum(p => p.mtd?.points_delivered ?? 0);
  const prevMtdPts = sum(p => p.prev_mtd?.points_delivered ?? 0);
  const prevFullPts = sum(p => p.prev_full?.points_delivered ?? 0);
  const finished = sum(p => p.mtd?.finished ?? 0);
  const goal = sum(p => p.mtd?.goal_points ?? 0);
  const clients = sum(p => p.mtd?.clients_served ?? 0);
  const onTimeWeighted = players.reduce(
    (acc, p) => acc + (p.mtd?.on_time_pct ?? 0) * (p.mtd?.finished ?? 0),
    0
  );
  return {
    node_type: 'supervisao',
    node_id: id,
    label,
    players_count: players.length,
    season_points_total: mtdPts * 4,
    balance_score: 72 + players.length,
    mtd: mtdWindow({
      finished,
      points_delivered: mtdPts,
      goal_points: goal,
      clients_served: clients,
      on_time_pct: finished ? onTimeWeighted / finished : 0,
      pending_open: risks.pending_open ?? 8,
      multa_risk: risks.multa_risk ?? 2,
      near_due: risks.near_due ?? 5,
      overdue_pending: risks.overdue_pending ?? 3,
      multa_and_near_due: risks.multa_and_near_due ?? 1
    }),
    prev_full: mtdWindow({ points_delivered: prevFullPts, finished: Math.round(prevFullPts / 40) }),
    prev_mtd: mtdWindow({ points_delivered: prevMtdPts, finished: Math.round(prevMtdPts / 40) }),
    compare: compareBlock(mtdPts, prevMtdPts, prevFullPts),
    children: players
  };
}

function buildGerencia(
  id: string,
  label: string,
  supervisoes: OrgHierarchyNode[]
): OrgHierarchyNode {
  const sum = (fn: (p: OrgHierarchyNode) => number) =>
    supervisoes.reduce((acc, s) => acc + fn(s), 0);
  const mtdPts = sum(s => s.mtd?.points_delivered ?? 0);
  const prevMtdPts = sum(s => s.prev_mtd?.points_delivered ?? 0);
  const prevFullPts = sum(s => s.prev_full?.points_delivered ?? 0);
  const players = sum(s => s.players_count);
  return {
    node_type: 'gerencia',
    node_id: id,
    label,
    players_count: players,
    season_points_total: mtdPts * 4,
    balance_score: 78 + supervisoes.length * 2,
    mtd: mtdWindow({
      finished: sum(s => s.mtd?.finished ?? 0),
      points_delivered: mtdPts,
      goal_points: sum(s => s.mtd?.goal_points ?? 0),
      clients_served: sum(s => s.mtd?.clients_served ?? 0),
      on_time_pct: 84.2,
      pending_open: sum(s => s.mtd?.pending_open ?? 0),
      multa_risk: sum(s => s.mtd?.multa_risk ?? 0),
      near_due: sum(s => s.mtd?.near_due ?? 0),
      overdue_pending: sum(s => s.mtd?.overdue_pending ?? 0),
      multa_and_near_due: sum(s => s.mtd?.multa_and_near_due ?? 0)
    }),
    prev_full: mtdWindow({ points_delivered: prevFullPts }),
    prev_mtd: mtdWindow({ points_delivered: prevMtdPts }),
    compare: compareBlock(mtdPts, prevMtdPts, prevFullPts),
    children: supervisoes
  };
}

function buildDiretoria(
  id: string,
  label: string,
  gerencias: OrgHierarchyNode[],
  balanceScore: number
): OrgHierarchyNode {
  const sum = (fn: (p: OrgHierarchyNode) => number) =>
    gerencias.reduce((acc, g) => acc + fn(g), 0);
  const mtdPts = sum(g => g.mtd?.points_delivered ?? 0);
  const prevMtdPts = sum(g => g.prev_mtd?.points_delivered ?? 0);
  const prevFullPts = sum(g => g.prev_full?.points_delivered ?? 0);
  return {
    node_type: 'diretoria',
    node_id: id,
    label,
    players_count: sum(g => g.players_count),
    season_points_total: mtdPts * 4,
    balance_score: balanceScore,
    mtd: mtdWindow({
      finished: sum(g => g.mtd?.finished ?? 0),
      points_delivered: mtdPts,
      goal_points: sum(g => g.mtd?.goal_points ?? 0),
      clients_served: sum(g => g.mtd?.clients_served ?? 0),
      on_time_pct: 81.5,
      pending_open: sum(g => g.mtd?.pending_open ?? 0),
      multa_risk: sum(g => g.mtd?.multa_risk ?? 0),
      near_due: sum(g => g.mtd?.near_due ?? 0),
      overdue_pending: sum(g => g.mtd?.overdue_pending ?? 0),
      multa_and_near_due: sum(g => g.mtd?.multa_and_near_due ?? 0)
    }),
    prev_full: mtdWindow({ points_delivered: prevFullPts }),
    prev_mtd: mtdWindow({ points_delivered: prevMtdPts }),
    compare: compareBlock(mtdPts, prevMtdPts, prevFullPts),
    children: gerencias
  };
}

function buildMockTree(): OrgHierarchyNode {
  const dirOperacoes = buildDiretoria(
    'dir-operacoes',
    'Diretoria de Operações',
    [
      buildGerencia('ger-norte', 'Gerência Norte', [
        buildSupervisao(
          'sup-alpha',
          'Supervisão Alpha',
          [
            buildPlayer('p-ana', 'Ana Silva', { finished: 28, points_delivered: 1260, goal_points: 1400, clients_served: 9, on_time_pct: 92 }, 1180, 4800),
            buildPlayer('p-bruno', 'Bruno Costa', { finished: 22, points_delivered: 990, goal_points: 1200, clients_served: 7, on_time_pct: 88 }, 1050, 4200),
            buildPlayer('p-carla', 'Carla Mendes', { finished: 19, points_delivered: 855, goal_points: 1100, clients_served: 6, on_time_pct: 85 }, 920, 3900)
          ],
          { multa_risk: 1, near_due: 3, overdue_pending: 2 }
        ),
        buildSupervisao(
          'sup-beta',
          'Supervisão Beta',
          [
            buildPlayer('p-diego', 'Diego Alves', { finished: 25, points_delivered: 1125, goal_points: 1300, clients_served: 8, on_time_pct: 90 }, 1080, 4500),
            buildPlayer('p-elisa', 'Elisa Rocha', { finished: 21, points_delivered: 945, goal_points: 1150, clients_served: 7, on_time_pct: 87 }, 980, 4100)
          ]
        )
      ]),
      buildGerencia('ger-sul', 'Gerência Sul', [
        buildSupervisao(
          'sup-gamma',
          'Supervisão Gamma',
          [
            buildPlayer('p-felipe', 'Felipe Nunes', { finished: 18, points_delivered: 810, goal_points: 1000, clients_served: 5, on_time_pct: 82 }, 870, 3600),
            buildPlayer('p-gabriela', 'Gabriela Lima', { finished: 24, points_delivered: 1080, goal_points: 1250, clients_served: 8, on_time_pct: 91 }, 1020, 4400)
          ],
          { multa_risk: 2, near_due: 4, overdue_pending: 3, multa_and_near_due: 1 }
        )
      ])
    ],
    86.4
  );

  const dirComercial = buildDiretoria(
    'dir-comercial',
    'Diretoria Comercial',
    [
      buildGerencia('ger-comercial-1', 'Gerência Comercial SP', [
        buildSupervisao(
          'sup-delta',
          'Supervisão Delta',
          [
            buildPlayer('p-henrique', 'Henrique Dias', { finished: 30, points_delivered: 1350, goal_points: 1500, clients_served: 10, on_time_pct: 94 }, 1280, 5200),
            buildPlayer('p-isabela', 'Isabela Freitas', { finished: 26, points_delivered: 1170, goal_points: 1350, clients_served: 9, on_time_pct: 89 }, 1100, 4700)
          ]
        )
      ])
    ],
    91.2
  );

  const dirTecnologia = buildDiretoria(
    'dir-tecnologia',
    'Diretoria de Tecnologia',
    [
      buildGerencia('ger-tech', 'Gerência de Produto', [
        buildSupervisao(
          'sup-epsilon',
          'Supervisão Epsilon',
          [
            buildPlayer('p-joao', 'João Pedro', { finished: 15, points_delivered: 675, goal_points: 900, clients_served: 4, on_time_pct: 78 }, 720, 3000),
            buildPlayer('p-karina', 'Karina Souza', { finished: 20, points_delivered: 900, goal_points: 1050, clients_served: 6, on_time_pct: 86 }, 850, 3800)
          ],
          { near_due: 6, overdue_pending: 4 }
        )
      ])
    ],
    74.8
  );

  const children = [dirComercial, dirOperacoes, dirTecnologia];
  const sum = (fn: (n: OrgHierarchyNode) => number) =>
    children.reduce((acc, d) => acc + fn(d), 0);
  const mtdPts = sum(d => d.mtd?.points_delivered ?? 0);
  const prevMtdPts = sum(d => d.prev_mtd?.points_delivered ?? 0);
  const prevFullPts = sum(d => d.prev_full?.points_delivered ?? 0);

  return {
    node_type: 'organization',
    node_id: 'bwa',
    label: 'BWA Global',
    players_count: sum(d => d.players_count),
    season_points_total: mtdPts * 4,
    balance_score: 84.1,
    mtd: mtdWindow({
      finished: sum(d => d.mtd?.finished ?? 0),
      points_delivered: mtdPts,
      goal_points: sum(d => d.mtd?.goal_points ?? 0),
      clients_served: sum(d => d.mtd?.clients_served ?? 0),
      on_time_pct: 86.7,
      pending_open: 42,
      multa_risk: 8,
      near_due: 18,
      overdue_pending: 12,
      multa_and_near_due: 5,
      clients_onboarding: 14,
      clients_classificacao_1: 22,
      clients_classificacao_2: 35,
      clients_classificacao_3: 18,
      clients_classificacao_4: 9,
      clients_classificacao_5: 4
    }),
    prev_full: mtdWindow({
      points_delivered: prevFullPts,
      finished: 820,
      clients_served: 310
    }),
    prev_mtd: mtdWindow({
      points_delivered: prevMtdPts,
      finished: 198,
      clients_served: 72
    }),
    compare: compareBlock(mtdPts, prevMtdPts, prevFullPts),
    finished_by_dow: [
      { dow: 1, finished_count: 42, points_total: 1890 },
      { dow: 2, finished_count: 58, points_total: 2610 },
      { dow: 3, finished_count: 51, points_total: 2295 },
      { dow: 4, finished_count: 47, points_total: 2115 },
      { dow: 5, finished_count: 38, points_total: 1710 },
      { dow: 6, finished_count: 12, points_total: 540 },
      { dow: 7, finished_count: 4, points_total: 180 }
    ],
    top_deliveries: [
      { delivery_title: 'Revisão de obrigações acessórias', finished_count: 38 },
      { delivery_title: 'Apuração de impostos federais', finished_count: 31 },
      { delivery_title: 'Fechamento contábil mensal', finished_count: 27 }
    ],
    highlights: {
      destaque: [
        { label: 'Diretoria Comercial', metric: 'pontos_mtd', value: dirComercial.mtd?.points_delivered },
        { label: 'Henrique Dias', metric: 'on_time_pct', value: 94 },
        { label: 'Supervisão Alpha', metric: 'entregas_concluidas', value: 69 }
      ],
      atencao: [
        { label: 'Diretoria de Tecnologia', metric: 'on_time_pct', value: 78 },
        { label: 'Supervisão Gamma', metric: 'multa_risk', value: 2 },
        { label: 'João Pedro', metric: 'pontos_mtd', value: 675 }
      ]
    },
    children
  };
}

/** Dados mock temporários para validar UI do relatório organizacional. */
export function buildMockOrganizationHierarchyReport(
  options: MockOrgHierarchyReportOptions = {}
): OrganizationHierarchyReportResponse {
  const refMonth = options.month ?? new Date();
  const y = refMonth.getFullYear();
  const m = String(refMonth.getMonth() + 1).padStart(2, '0');
  const monthStr = `${y}-${m}`;
  const mtdEndDay = String(Math.min(refMonth.getDate(), 28)).padStart(2, '0');

  let root = buildMockTree();
  const orgMtdPoints = root.mtd?.points_delivered ?? 0;
  const pot = options.simulationPotBrl;

  if (pot != null && pot > 0) {
    root = applySimulation(root, orgMtdPoints, pot);
  }

  return {
    refreshed_at: new Date().toISOString(),
    params: {
      cache_month: `${monthStr}-01`,
      mtd_start: `${monthStr}-01`,
      mtd_end: `${monthStr}-${mtdEndDay}`,
      prev_month: m === '01' ? `${y - 1}-12-01` : `${y}-${String(Number(m) - 1).padStart(2, '0')}-01`,
      prev_mtd_start: m === '01' ? `${y - 1}-12-01` : `${y}-${String(Number(m) - 1).padStart(2, '0')}-01`,
      prev_mtd_end: m === '01' ? `${y - 1}-12-${mtdEndDay}` : `${y}-${String(Number(m) - 1).padStart(2, '0')}-${mtdEndDay}`,
      ...(pot != null && pot > 0
        ? {
            simulation_pot_brl: pot,
            points_per_brl: orgMtdPoints > 0 ? pot / orgMtdPoints : 0
          }
        : {})
    },
    root
  };
}
