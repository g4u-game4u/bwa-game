import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { OrgHierarchyNode, OrgHierarchyNodeType, OrgHierarchyKpiDetailKey } from '@model/game4u-api.model';
import {
  formatHighlightMtdMetricValue,
  getOrgHierarchyNodeTypeLabel,
  getOrgHierarchyCompareTone,
  formatOrgHierarchyComparePct,
  computeOrgPointsGoalPct,
  getOrgPointsGoalTone,
  getOrgHierarchyAreaLabelClass
} from '@services/org-hierarchy-report.mapper';
import { normalizeOrgHierarchyNodeType } from '@services/org-hierarchy-segmentation.mapper';

@Component({
  selector: 'c4u-org-hierarchy-flowchart',
  templateUrl: './org-hierarchy-flowchart.component.html',
  styleUrls: ['./org-hierarchy-flowchart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uOrgHierarchyFlowchartComponent {
  @Input() root!: OrgHierarchyNode;
  @Input() expandedIds = new Set<string>();
  @Input() searchHighlightIds = new Set<string>();

  @Output() toggleNode = new EventEmitter<string>();
  @Output() expandAll = new EventEmitter<void>();
  @Output() collapseAll = new EventEmitter<void>();
  @Output() kpiClick = new EventEmitter<{
    kpi: OrgHierarchyKpiDetailKey;
    nodeType: OrgHierarchyNodeType;
    nodeId: string;
    nodeLabel: string;
  }>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() selectNode = new EventEmitter<string>();

  searchQuery = '';
  selectedNodeId: string | null = null;

  readonly legendItems = [
    { type: 'organization', label: 'Organização', color: '#6366f1' },
    { type: 'c_level', label: 'C-Level', color: '#6366f1' },
    { type: 'segmentacao', label: 'Área', color: '#818cf8' },
    { type: 'diretoria', label: 'Diretoria', color: '#8b5cf6' },
    { type: 'gerencia', label: 'Gerência', color: '#0ea5e9' },
    { type: 'supervisao', label: 'Supervisão', color: '#10b981' },
    { type: 'player', label: 'Colaborador', color: '#64748b' }
  ] as const;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get selectedNode(): OrgHierarchyNode | null {
    if (!this.selectedNodeId || !this.root) {
      return null;
    }
    return this.findNode(this.root, this.selectedNodeId);
  }

  get hasSearch(): boolean {
    return this.searchQuery.trim().length > 0;
  }

  onSearchInput(raw: string): void {
    this.searchQuery = raw;
    this.searchChange.emit(raw);
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchChange.emit('');
    this.cdr.markForCheck();
  }

  onNodeSelect(nodeId: string): void {
    this.selectedNodeId = nodeId;
    this.selectNode.emit(nodeId);
    this.cdr.markForCheck();
  }

  formatPoints(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.points_delivered, 'number');
  }

  formatOnTime(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.on_time_pct, 'pct');
  }

  formatFinished(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.finished, 'number');
  }

  formatPending(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.pending_open, 'number');
  }

  nodeTypeLabel(node: OrgHierarchyNode): string {
    return getOrgHierarchyNodeTypeLabel(node.node_type);
  }

  mtdComparePct(node: OrgHierarchyNode): string {
    return formatOrgHierarchyComparePct(node.compare?.vs_prev_mtd_points_pct);
  }

  mtdCompareTone(node: OrgHierarchyNode): 'positive' | 'negative' | 'neutral' {
    return getOrgHierarchyCompareTone(node.compare?.vs_prev_mtd_points_pct);
  }

  onTimeTone(node: OrgHierarchyNode): 'success' | 'warning' | 'danger' | 'neutral' {
    const pct = node.mtd?.on_time_pct;
    if (pct == null || !Number.isFinite(pct)) {
      return 'neutral';
    }
    if (pct >= 90) {
      return 'success';
    }
    if (pct >= 70) {
      return 'warning';
    }
    return 'danger';
  }

  private findNode(node: OrgHierarchyNode, nodeId: string): OrgHierarchyNode | null {
    if (node.node_id === nodeId) {
      return node;
    }
    for (const child of node.children ?? []) {
      const found = this.findNode(child, nodeId);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
