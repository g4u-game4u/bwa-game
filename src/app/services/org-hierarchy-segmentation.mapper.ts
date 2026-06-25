import {
  OrganizationHierarchyReportResponse,
  OrgHierarchyCompare,
  OrgHierarchyNode,
  OrgHierarchyNodeType,
  OrgMetricsWindow
} from '@model/game4u-api.model';

/** Guarda-chuvas exibidas abaixo do C-Level no relatório organizacional. */
export const ORG_SUPERVISAO_SEGMENTATIONS = [
  'Fiscal',
  'Contábil',
  'Departamento Pessoal',
  'Legalização',
  'Simples Nacional'
] as const;

export type OrgSupervisaoSegmentation = (typeof ORG_SUPERVISAO_SEGMENTATIONS)[number];

/** Rótulos preferidos de C-Level quando a API retorna mais de um nó. */
const PREFERRED_C_LEVEL_LABELS = ['pedro barros'];

const SEGMENTATION_MATCHERS: ReadonlyArray<{
  segment: OrgSupervisaoSegmentation;
  patterns: readonly RegExp[];
}> = [
  { segment: 'Simples Nacional', patterns: [/simples\s*nacional/i] },
  {
    segment: 'Departamento Pessoal',
    patterns: [/departamento\s*pessoal/i, /\bdp\b/i, /^dp[\s\-–]/i]
  },
  { segment: 'Legalização', patterns: [/legaliza[cç][aã]o/i] },
  { segment: 'Contábil', patterns: [/cont[aá]bil/i] },
  { segment: 'Fiscal', patterns: [/fiscal/i] }
];

interface SupervisaoBranch {
  diretoria: OrgHierarchyNode;
  gerencia: OrgHierarchyNode;
  supervisao: OrgHierarchyNode;
}

const METRIC_SUM_KEYS: ReadonlyArray<keyof OrgMetricsWindow> = [
  'finished',
  'points_delivered',
  'goal_points',
  'pending_open',
  'multa_risk',
  'multa_incurred',
  'near_due',
  'multa_and_near_due',
  'overdue_pending',
  'clients_served',
  'clients_onboarding',
  'clients_acessorias_g4',
  'clients_acessorias_onboarding',
  'clients_acessorias_risco_de_churn',
  'clients_classificacao_1',
  'clients_classificacao_2',
  'clients_classificacao_3',
  'clients_classificacao_4',
  'clients_classificacao_5',
  'clients_sem_classificacao'
];

function normalizeLookupText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Normaliza `node_type` retornado pela API para o contrato do frontend. */
export function normalizeOrgHierarchyNodeType(
  raw: string | undefined | null
): OrgHierarchyNodeType {
  const value = normalizeLookupText(String(raw ?? ''));

  switch (value) {
    case 'organization':
    case 'org':
      return 'organization';
    case 'c_level':
    case 'c-level':
    case 'clevel':
      return 'c_level';
    case 'segmentacao':
    case 'segmentation':
    case 'area':
      return 'segmentacao';
    case 'diretoria':
    case 'diretor':
      return 'diretoria';
    case 'gerencia':
    case 'gerente':
      return 'gerencia';
    case 'supervisao':
    case 'supervisão':
    case 'supervisor':
    case 'team':
    case 'time':
      return 'supervisao';
    case 'player':
    case 'colaborador':
      return 'player';
    default:
      return (raw as OrgHierarchyNodeType) || 'organization';
  }
}

function isNodeType(node: OrgHierarchyNode, type: OrgHierarchyNodeType): boolean {
  return normalizeOrgHierarchyNodeType(node.node_type) === type;
}

/** Normaliza recursivamente a árvore vinda de `hierarchy-report`. */
export function normalizeOrgHierarchyTree(node: OrgHierarchyNode): OrgHierarchyNode {
  const normalizedType = normalizeOrgHierarchyNodeType(node.node_type);
  const children = (node.children ?? [])
    .map(child => normalizeOrgHierarchyTree(child))
    .filter(child => normalizeOrgHierarchyNodeType(child.node_type) !== 'player');

  return {
    ...node,
    node_type: normalizedType,
    children: children.length ? children : undefined
  };
}

export function normalizeOrganizationHierarchyReport(
  response: OrganizationHierarchyReportResponse
): OrganizationHierarchyReportResponse {
  return {
    ...response,
    root: normalizeOrgHierarchyTree(response.root)
  };
}

/** Classifica uma supervisão em uma das guarda-chuvas pelo nome. */
export function resolveSupervisaoSegmentation(supervisaoLabel: string): OrgSupervisaoSegmentation {
  const normalized = normalizeLookupText(supervisaoLabel);
  for (const matcher of SEGMENTATION_MATCHERS) {
    if (matcher.patterns.some(pattern => pattern.test(normalized))) {
      return matcher.segment;
    }
  }
  return 'Fiscal';
}

function slugifySegmentation(label: string): string {
  return normalizeLookupText(label).replace(/[^a-z0-9]+/g, '-');
}

function emptyMetrics(): OrgMetricsWindow {
  return {};
}

function emptyCompare(): OrgHierarchyCompare {
  return {};
}

function readMetric(window: OrgMetricsWindow | undefined, key: keyof OrgMetricsWindow): number {
  const raw = window?.[key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function weightedAverage(
  nodes: OrgHierarchyNode[],
  weightFn: (node: OrgHierarchyNode) => number,
  valueFn: (node: OrgHierarchyNode) => number
): number | null {
  let totalWeight = 0;
  let totalValue = 0;
  for (const node of nodes) {
    const weight = weightFn(node);
    const value = valueFn(node);
    if (weight <= 0 || !Number.isFinite(value)) {
      continue;
    }
    totalWeight += weight;
    totalValue += value * weight;
  }
  if (totalWeight <= 0) {
    return null;
  }
  return totalValue / totalWeight;
}

function sumMetricWindows(nodes: OrgHierarchyNode[], pick: 'mtd' | 'prev_full' | 'prev_mtd'): OrgMetricsWindow {
  const result: OrgMetricsWindow = {};
  for (const key of METRIC_SUM_KEYS) {
    result[key] = nodes.reduce((sum, node) => sum + readMetric(node[pick], key), 0);
  }

  const weightedOnTime = weightedAverage(
    nodes,
    node => readMetric(node[pick], 'finished'),
    node => readMetric(node[pick], 'on_time_pct')
  );
  if (weightedOnTime != null) {
    result.on_time_pct = weightedOnTime;
  }

  return result;
}

function sumCompare(nodes: OrgHierarchyNode[]): OrgHierarchyCompare {
  return {
    vs_prev_full_points: nodes.reduce((sum, node) => sum + (node.compare?.vs_prev_full_points ?? 0), 0),
    vs_prev_mtd_points: nodes.reduce((sum, node) => sum + (node.compare?.vs_prev_mtd_points ?? 0), 0),
    vs_prev_full_points_pct:
      weightedAverage(
        nodes,
        node => node.prev_full?.points_delivered ?? 0,
        node => node.compare?.vs_prev_full_points_pct ?? 0
      ) ?? 0,
    vs_prev_mtd_points_pct:
      weightedAverage(
        nodes,
        node => node.prev_mtd?.points_delivered ?? 0,
        node => node.compare?.vs_prev_mtd_points_pct ?? 0
      ) ?? 0
  };
}

function aggregateBalanceScore(nodes: OrgHierarchyNode[]): number | undefined {
  const score = weightedAverage(
    nodes,
    node => node.mtd?.points_delivered ?? 0,
    node => node.balance_score ?? 0
  );
  return score == null ? undefined : score;
}

function aggregateNodes(
  nodeType: OrgHierarchyNodeType,
  template: Pick<OrgHierarchyNode, 'node_id' | 'label'>,
  children: OrgHierarchyNode[]
): OrgHierarchyNode {
  if (!children.length) {
    return {
      node_type: nodeType,
      node_id: template.node_id,
      label: template.label,
      players_count: 0,
      season_points_total: 0,
      mtd: emptyMetrics(),
      prev_full: emptyMetrics(),
      prev_mtd: emptyMetrics(),
      compare: emptyCompare(),
      children: []
    };
  }

  return {
    node_type: nodeType,
    node_id: template.node_id,
    label: template.label,
    players_count: children.reduce((sum, child) => sum + (child.players_count ?? 0), 0),
    season_points_total: children.reduce((sum, child) => sum + (child.season_points_total ?? 0), 0),
    balance_score: aggregateBalanceScore(children),
    mtd: sumMetricWindows(children, 'mtd'),
    prev_full: sumMetricWindows(children, 'prev_full'),
    prev_mtd: sumMetricWindows(children, 'prev_mtd'),
    compare: sumCompare(children),
    children
  };
}

function placeholderNode(nodeType: OrgHierarchyNodeType, label: string, nodeId: string): OrgHierarchyNode {
  return {
    node_type: nodeType,
    node_id: nodeId,
    label,
    players_count: 0,
    season_points_total: 0,
    mtd: emptyMetrics(),
    prev_full: emptyMetrics(),
    prev_mtd: emptyMetrics(),
    compare: emptyCompare()
  };
}

function walkOrgHierarchy(
  node: OrgHierarchyNode,
  visit: (node: OrgHierarchyNode, ancestors: OrgHierarchyNode[]) => void,
  ancestors: OrgHierarchyNode[] = []
): void {
  visit(node, ancestors);
  for (const child of node.children ?? []) {
    walkOrgHierarchy(child, visit, [...ancestors, node]);
  }
}

function countSupervisaoInSubtree(node: OrgHierarchyNode): number {
  let count = 0;
  walkOrgHierarchy(node, current => {
    if (isNodeType(current, 'supervisao')) {
      count += 1;
    }
  });
  return count;
}

function depthFromRoot(root: OrgHierarchyNode, target: OrgHierarchyNode): number {
  let depth = -1;
  walkOrgHierarchy(root, (node, ancestors) => {
    if (node.node_id === target.node_id) {
      depth = ancestors.length;
    }
  });
  return depth;
}

/** Escolhe o nó C-Level da árvore retornada pela API. */
export function resolveCLevelAnchorFromApi(root: OrgHierarchyNode): OrgHierarchyNode | null {
  const cLevels: OrgHierarchyNode[] = [];
  walkOrgHierarchy(root, node => {
    if (isNodeType(node, 'c_level')) {
      cLevels.push(node);
    }
  });

  if (!cLevels.length) {
    return null;
  }

  for (const preferredLabel of PREFERRED_C_LEVEL_LABELS) {
    const preferred = cLevels.find(node => normalizeLookupText(node.label) === preferredLabel);
    if (preferred) {
      return preferred;
    }
  }

  const withSupervisao = cLevels.filter(node => countSupervisaoInSubtree(node) > 0);
  const pool = withSupervisao.length ? withSupervisao : cLevels;

  return pool.reduce((selected, candidate) =>
    depthFromRoot(root, candidate) > depthFromRoot(root, selected) ? candidate : selected
  );
}

function collectSupervisaoBranches(subtree: OrgHierarchyNode): SupervisaoBranch[] {
  const branches: SupervisaoBranch[] = [];

  walkOrgHierarchy(subtree, (node, ancestors) => {
    if (!isNodeType(node, 'supervisao')) {
      return;
    }

    const diretoria =
      [...ancestors].reverse().find(ancestor => isNodeType(ancestor, 'diretoria')) ??
      placeholderNode('diretoria', 'Sem diretoria', `diretoria-unassigned-${node.node_id}`);

    const gerencia =
      [...ancestors].reverse().find(ancestor => isNodeType(ancestor, 'gerencia')) ??
      placeholderNode('gerencia', 'Sem gerência', `gerencia-unassigned-${node.node_id}`);

    branches.push({
      diretoria,
      gerencia,
      supervisao: {
        ...node,
        children: undefined
      }
    });
  });

  return branches;
}

function buildDiretoriaGerenciaTree(branches: SupervisaoBranch[]): OrgHierarchyNode[] {
  const byDiretoria = new Map<
    string,
    {
      node: OrgHierarchyNode;
      gerencias: Map<string, { node: OrgHierarchyNode; supervisions: OrgHierarchyNode[] }>;
    }
  >();

  for (const branch of branches) {
    const diretoriaKey = branch.diretoria.node_id;
    if (!byDiretoria.has(diretoriaKey)) {
      byDiretoria.set(diretoriaKey, {
        node: branch.diretoria,
        gerencias: new Map()
      });
    }

    const diretoriaEntry = byDiretoria.get(diretoriaKey)!;
    const gerenciaKey = branch.gerencia.node_id;
    if (!diretoriaEntry.gerencias.has(gerenciaKey)) {
      diretoriaEntry.gerencias.set(gerenciaKey, {
        node: branch.gerencia,
        supervisions: []
      });
    }

    diretoriaEntry.gerencias.get(gerenciaKey)!.supervisions.push(branch.supervisao);
  }

  return [...byDiretoria.values()]
    .map(diretoriaEntry => {
      const gerenciaChildren = [...diretoriaEntry.gerencias.values()]
        .map(gerenciaEntry =>
          aggregateNodes('gerencia', gerenciaEntry.node, gerenciaEntry.supervisions)
        )
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

      return aggregateNodes('diretoria', diretoriaEntry.node, gerenciaChildren);
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function buildSegmentationNodes(branches: SupervisaoBranch[]): OrgHierarchyNode[] {
  return ORG_SUPERVISAO_SEGMENTATIONS.map(segmentLabel => {
    const segmentBranches = branches.filter(
      branch => resolveSupervisaoSegmentation(branch.supervisao.label) === segmentLabel
    );
    const diretoriaChildren = buildDiretoriaGerenciaTree(segmentBranches);
    return aggregateNodes(
      'segmentacao',
      { node_id: `segmentacao-${slugifySegmentation(segmentLabel)}`, label: segmentLabel },
      diretoriaChildren
    );
  }).filter(segment => (segment.children?.length ?? 0) > 0);
}

function wrapOrganizationWithCLevel(
  root: OrgHierarchyNode,
  cLevel: OrgHierarchyNode,
  children: OrgHierarchyNode[]
): OrgHierarchyNode {
  return {
    ...root,
    children: [
      {
        ...cLevel,
        node_type: 'c_level',
        children
      }
    ]
  };
}

/**
 * Monta a árvore de exibição a partir da resposta de `hierarchy-report`:
 * Organização → C-Level (da API) → segmentações → Diretorias → Gerências → Supervisões.
 */
export function buildSegmentedOrgHierarchyTree(
  root: OrgHierarchyNode | null | undefined
): OrgHierarchyNode | null {
  if (!root) {
    return null;
  }

  const normalizedRoot = normalizeOrgHierarchyTree(root);
  if (!isNodeType(normalizedRoot, 'organization')) {
    return normalizedRoot;
  }

  const cLevelAnchor = resolveCLevelAnchorFromApi(normalizedRoot);
  const branchSource = cLevelAnchor ?? normalizedRoot;
  const branches = collectSupervisaoBranches(branchSource);
  const segmentationNodes = buildSegmentationNodes(branches);

  if (!cLevelAnchor) {
    if (segmentationNodes.length) {
      return {
        ...normalizedRoot,
        children: segmentationNodes
      };
    }
    return normalizedRoot;
  }

  if (!segmentationNodes.length) {
    return wrapOrganizationWithCLevel(
      normalizedRoot,
      cLevelAnchor,
      (cLevelAnchor.children ?? []).filter(child => !isNodeType(child, 'player'))
    );
  }

  return wrapOrganizationWithCLevel(normalizedRoot, cLevelAnchor, segmentationNodes);
}

/** Expande organização, C-Level e segmentações na árvore segmentada. */
export function collectDefaultExpandedSegmentedNodeIds(root: OrgHierarchyNode | null | undefined): string[] {
  if (!root) {
    return [];
  }

  const ids = [root.node_id];
  for (const child of root.children ?? []) {
    ids.push(child.node_id);
    if (isNodeType(child, 'c_level')) {
      for (const segment of child.children ?? []) {
        ids.push(segment.node_id);
      }
    }
  }
  return ids;
}
