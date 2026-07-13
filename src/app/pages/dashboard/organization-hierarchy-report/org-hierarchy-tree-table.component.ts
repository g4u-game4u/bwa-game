import {

  Component,

  Input,

  Output,

  EventEmitter,

  ChangeDetectionStrategy

} from '@angular/core';

import { OrgHierarchyNode, OrgHierarchyNodeType, OrgMetricsWindow, TeamPlayerMtd } from '@model/game4u-api.model';

import {

  formatBrl,

  formatHighlightMtdMetricValue,

  formatOrgHierarchyComparePct,

  formatOrgHierarchySharePct,

  getOrgHierarchyAreaLabelClass,

  getOrgHierarchyCompareTone,

  getOrgHierarchyNodeTypeLabel,

  ORG_TREE_COMPACT_COLUMNS,

  OrgHighlightMtdColumn

} from '@services/org-hierarchy-report.mapper';

import { normalizeOrgHierarchyNodeType } from '@services/org-hierarchy-segmentation.mapper';

import type { OrgHierarchyKpiDetailKey } from '@model/game4u-api.model';



interface OrgHierarchyVisibleRow {

  rowId: string;

  node: OrgHierarchyNode;

  player?: TeamPlayerMtd;

  depth: number;

  hasChildren: boolean;

  isExpanded: boolean;

  kind: 'node' | 'player';

}



interface OrgHierarchyLevelLegend {

  type: OrgHierarchyNodeType;

  label: string;

  color: string;

}



@Component({

  selector: 'c4u-org-hierarchy-tree-table',

  templateUrl: './org-hierarchy-tree-table.component.html',

  styleUrls: ['./org-hierarchy-tree-table.component.scss'],

  changeDetection: ChangeDetectionStrategy.OnPush

})

export class C4uOrgHierarchyTreeTableComponent {

  @Input() root!: OrgHierarchyNode;

  @Input() showSimulation = false;

  @Input() showAllMetrics = false;

  @Input() expandedIds = new Set<string>();



  @Output() toggleNode = new EventEmitter<string>();

  @Output() expandAll = new EventEmitter<void>();

  @Output() collapseAll = new EventEmitter<void>();

  @Output() kpiClick = new EventEmitter<{

    kpi: OrgHierarchyKpiDetailKey;

    nodeType: OrgHierarchyNodeType;

    nodeId: string;

    nodeLabel: string;

  }>();



  private readonly kpiDrilldownKeys = new Set<OrgHierarchyKpiDetailKey>([

    'on_time_pct',

    // 'clients_served', // drill-down desabilitado temporariamente (performance)

    'finished',

    'points_delivered',

    'pending_open',

    'near_due',

    'overdue_pending',

    'overdue_pending_justified',

    'overdue_pending_unjustified',

    'multa_risk',

    'multa_incurred'

  ]);



  readonly mtdColumns: ReadonlyArray<OrgHighlightMtdColumn> = [

    { key: 'on_time_pct', label: '% prazo', format: 'pct', title: 'Percentual de entregas no prazo' },

    { key: 'finished', label: 'Entregas', format: 'number', title: 'Entregas concluídas no MTD' },

    { key: 'clients_served', label: 'Clientes', format: 'number', title: 'Clientes atendidos' },

    { key: 'clients_acessorias_g4', label: 'G4', format: 'number', title: 'Clientes Acessórias G4' },

    { key: 'clients_acessorias_onboarding', label: 'Em onboarding', format: 'number', title: 'Clientes Acessórias em onboarding' },

    { key: 'clients_acessorias_risco_de_churn', label: 'Risco churn', format: 'number', title: 'Clientes Acessórias com risco de churn' },

    { key: 'pending_open', label: 'Pendentes', format: 'number' },

    { key: 'near_due', label: 'Próx. venc.', format: 'number', title: 'Próximo do vencimento' },

    { key: 'overdue_pending', label: 'Atrasados', format: 'number' },

    { key: 'overdue_pending_justified', label: 'Atraso just.', format: 'number', title: 'Atraso justificado' },

    { key: 'overdue_pending_unjustified', label: 'Atraso s/ just.', format: 'number', title: 'Atraso sem justificativa' },

    { key: 'multa_risk', label: 'Risco multa', format: 'number', title: 'Risco de multa' },

    { key: 'multa_incurred', label: 'Multa incorr.', format: 'number', title: 'Multas incorridas' }

  ];



  readonly pointsMtdColumn: OrgHighlightMtdColumn = {

    key: 'points_delivered',

    label: 'Pontos MTD',

    format: 'number',

    title: 'Pontos entregues no mês'

  };



  readonly riskMetricKeys = new Set<keyof OrgMetricsWindow>([

    'pending_open',

    'near_due',

    'overdue_pending',

    'overdue_pending_justified',

    'overdue_pending_unjustified',

    'multa_risk',

    'multa_and_near_due',

    'multa_incurred'

  ]);



  readonly legendItems: ReadonlyArray<OrgHierarchyLevelLegend> = [

    { type: 'organization', label: 'Organização', color: '#6366f1' },

    { type: 'c_level', label: 'C-Level', color: '#6366f1' },

    { type: 'segmentacao', label: 'Área', color: '#a5b4fc' },

    { type: 'diretoria', label: 'Diretoria', color: '#8b5cf6' },

    { type: 'gerencia', label: 'Gerência', color: '#0ea5e9' },

    { type: 'supervisao', label: 'Supervisão', color: '#10b981' },

    { type: 'player', label: 'Colaborador', color: '#64748b' }

  ];



  get visibleMtdColumns(): ReadonlyArray<OrgHighlightMtdColumn> {

    return this.showAllMetrics ? this.mtdColumns : ORG_TREE_COMPACT_COLUMNS;

  }



  get showExtendedTreeColumns(): boolean {

    return this.showAllMetrics;

  }



  get rows(): OrgHierarchyVisibleRow[] {

    const out: OrgHierarchyVisibleRow[] = [];

    const walk = (node: OrgHierarchyNode, depth: number): void => {

      const hasChildren = !!(node.children && node.children.length > 0);

      const isExpanded = this.expandedIds.has(node.node_id);

      out.push({

        rowId: node.node_id,

        node,

        depth,

        hasChildren,

        isExpanded,

        kind: 'node'

      });



      if (

        normalizeOrgHierarchyNodeType(node.node_type) === 'supervisao' &&

        (node.team_players_mtd?.length ?? 0) > 0

      ) {

        for (const player of node.team_players_mtd ?? []) {

          out.push({

            rowId: `${node.node_id}__player__${player.player_email}`,

            node,

            player,

            depth: depth + 1,

            hasChildren: false,

            isExpanded: false,

            kind: 'player'

          });

        }

      }



      if (hasChildren && isExpanded) {

        for (const child of node.children ?? []) {

          walk(child, depth + 1);

        }

      }

    };

    walk(this.root, 0);

    return out;

  }



  isNodeRow(row: OrgHierarchyVisibleRow): boolean {

    return row.kind === 'node';

  }



  isPlayerRow(row: OrgHierarchyVisibleRow): boolean {

    return row.kind === 'player';

  }



  formatTeamPlayerNumber(value: number | undefined | null): string {

    if (value == null || !Number.isFinite(value)) {

      return '—';

    }

    return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  }



  playerLabel(player: TeamPlayerMtd): string {

    return player.player_name?.trim() || player.player_email;

  }



  playerMetricsSummary(player: TeamPlayerMtd): string {

    const parts = [

      `Pts. ${this.formatTeamPlayerNumber(player.points_delivered)}/${this.formatTeamPlayerNumber(player.expected_points_to_date)} esperados`,

      `Entr. ${this.formatTeamPlayerNumber(player.finished)}/${this.formatTeamPlayerNumber(player.expected_deliveries_to_date)} previstas`

    ];



    if (player.goal_points != null) {

      parts.push(`Meta mês: ${this.formatTeamPlayerNumber(player.goal_points)} pts.`);

    }

    if (player.goal_deliveries != null) {

      parts.push(`Meta mês: ${this.formatTeamPlayerNumber(player.goal_deliveries)} entr.`);

    }



    return parts.join(' · ');

  }



  formatPlayerMtdCell(player: TeamPlayerMtd, col: OrgHighlightMtdColumn): string | null {

    switch (col.key) {

      case 'finished':

        return this.formatTeamPlayerNumber(player.finished);

      case 'points_delivered':

        return this.formatTeamPlayerNumber(player.points_delivered);

      default:

        return null;

    }

  }



  nodeTypeLabel(node: OrgHierarchyNode): string {

    return getOrgHierarchyNodeTypeLabel(node.node_type);

  }



  rowLevelClass(row: OrgHierarchyVisibleRow): string {

    if (row.kind === 'player') {

      return 'org-tree-table__row--player';

    }

    return `org-tree-table__row--${row.node.node_type}`;

  }



  rowBadgeLabel(row: OrgHierarchyVisibleRow): string {

    return row.kind === 'player' ? 'Colaborador' : this.nodeTypeLabel(row.node);

  }



  rowNameLabel(row: OrgHierarchyVisibleRow): string {

    return row.kind === 'player' ? this.playerLabel(row.player!) : row.node.label;

  }



  mtdComparePct(node: OrgHierarchyNode): string {

    return formatOrgHierarchyComparePct(node.compare?.vs_prev_mtd_points_pct);

  }



  mtdCompareTone(node: OrgHierarchyNode): 'positive' | 'negative' | 'neutral' {

    return getOrgHierarchyCompareTone(node.compare?.vs_prev_mtd_points_pct);

  }



  simulationPayout(node: OrgHierarchyNode): string {

    return formatBrl(node.simulation?.payout_brl);

  }



  simulationShare(node: OrgHierarchyNode): string {

    return formatOrgHierarchySharePct(node.simulation?.share_pct);

  }



  formatMtdCell(node: OrgHierarchyNode, col: OrgHighlightMtdColumn): string {

    const value = node.mtd?.[col.key] as number | undefined | null;

    return formatHighlightMtdMetricValue(value, col.format);

  }



  isKpiDrilldownKey(key: string): key is OrgHierarchyKpiDetailKey {

    return this.kpiDrilldownKeys.has(key as OrgHierarchyKpiDetailKey);

  }



  onKpiCellClick(node: OrgHierarchyNode, kpi: OrgHierarchyKpiDetailKey, event?: Event): void {

    if (event) {

      event.stopPropagation();

      if (event instanceof KeyboardEvent) {

        event.preventDefault();

      }

    }

    this.kpiClick.emit({

      kpi,

      nodeType: node.node_type,

      nodeId: node.node_id,

      nodeLabel: node.label

    });

  }



  isSegmentacaoNode(node: OrgHierarchyNode): boolean {

    return normalizeOrgHierarchyNodeType(node.node_type) === 'segmentacao';

  }



  nodeAreaLabelClass(node: OrgHierarchyNode): string | null {

    if (!this.isSegmentacaoNode(node)) {

      return null;

    }

    return getOrgHierarchyAreaLabelClass(node.label ?? '');

  }



  mtdRawValue(node: OrgHierarchyNode, col: OrgHighlightMtdColumn): number {

    const raw = node.mtd?.[col.key];

    const n = typeof raw === 'number' ? raw : Number(raw);

    return Number.isFinite(n) ? n : 0;

  }



  isRiskMetric(col: OrgHighlightMtdColumn): boolean {

    return this.riskMetricKeys.has(col.key);

  }



  isRiskHighlight(node: OrgHierarchyNode, col: OrgHighlightMtdColumn): boolean {

    return this.isRiskMetric(col) && this.mtdRawValue(node, col) > 0;

  }



  collaboratorsLabel(count: number): string {

    return `${count.toLocaleString('pt-BR')} ${count === 1 ? 'colaborador' : 'colaboradores'}`;

  }



  indentPx(depth: number): number {

    return depth * 18;

  }



  onToggle(row: OrgHierarchyVisibleRow, event?: Event): void {

    event?.stopPropagation();

    if (!row.hasChildren) {

      return;

    }

    this.toggleNode.emit(row.node.node_id);

  }



  onToggleKeydown(event: KeyboardEvent, row: OrgHierarchyVisibleRow): void {

    if (!row.hasChildren) {

      return;

    }

    if (event.key === 'Enter' || event.key === ' ') {

      event.preventDefault();

      event.stopPropagation();

      this.onToggle(row);

    }

  }



  trackByNodeId(_index: number, row: OrgHierarchyVisibleRow): string {

    return row.rowId;

  }

}


