import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { OrgHierarchyNode, OrgHierarchyNodeType, OrgMetricsWindow } from '@model/game4u-api.model';
import {
  formatBrl,
  formatHighlightMtdMetricValue,
  formatOrgHierarchyComparePct,
  formatOrgHierarchySharePct,
  getOrgHierarchyAreaLabelClass,
  getOrgHierarchyCompareTone,
  getOrgHierarchyNodeTypeLabel,
  OrgHighlightMtdColumn
} from '@services/org-hierarchy-report.mapper';
import { normalizeOrgHierarchyNodeType } from '@services/org-hierarchy-segmentation.mapper';
import type { OrgHierarchyKpiDetailKey } from '@model/game4u-api.model';

interface OrgHierarchyVisibleRow {
  node: OrgHierarchyNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
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
    'clients_served',
    'finished',
    'points_delivered',
    'pending_open',
    'near_due',
    'overdue_pending',
    'multa_risk'
  ]);

  readonly mtdColumns: ReadonlyArray<OrgHighlightMtdColumn> = [
    { key: 'on_time_pct', label: '% prazo', format: 'pct', title: 'Percentual de entregas no prazo' },
    { key: 'finished', label: 'Entregas', format: 'number' },
    { key: 'clients_served', label: 'Clientes', format: 'number', title: 'Clientes atendidos' },
    { key: 'clients_onboarding', label: 'Onboarding', format: 'number' },
    { key: 'pending_open', label: 'Pendentes', format: 'number' },
    { key: 'near_due', label: 'Próx. venc.', format: 'number', title: 'Próximo do vencimento' },
    { key: 'overdue_pending', label: 'Atrasados', format: 'number' },
    { key: 'multa_risk', label: 'Risco multa', format: 'number', title: 'Risco de multa' }
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
    'multa_risk'
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

  get rows(): OrgHierarchyVisibleRow[] {
    const out: OrgHierarchyVisibleRow[] = [];
    const walk = (node: OrgHierarchyNode, depth: number): void => {
      const hasChildren = !!(node.children && node.children.length > 0);
      const isExpanded = this.expandedIds.has(node.node_id);
      out.push({ node, depth, hasChildren, isExpanded });
      if (hasChildren && isExpanded) {
        for (const child of node.children ?? []) {
          walk(child, depth + 1);
        }
      }
    };
    walk(this.root, 0);
    return out;
  }

  nodeTypeLabel(node: OrgHierarchyNode): string {
    return getOrgHierarchyNodeTypeLabel(node.node_type);
  }

  levelClass(node: OrgHierarchyNode): string {
    return `org-tree-table__row--${node.node_type}`;
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
    return row.node.node_id;
  }
}
