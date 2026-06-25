import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
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
  selector: 'c4u-org-hierarchy-flowchart-node',
  templateUrl: './org-hierarchy-flowchart-node.component.html',
  styleUrls: ['./org-hierarchy-flowchart-node.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uOrgHierarchyFlowchartNodeComponent {
  @Input() node!: OrgHierarchyNode;
  @Input() expandedIds = new Set<string>();
  @Input() searchHighlightIds = new Set<string>();
  @Input() selectedNodeId: string | null = null;

  @Output() toggleNode = new EventEmitter<string>();
  @Output() selectNode = new EventEmitter<string>();
  @Output() kpiClick = new EventEmitter<{
    kpi: OrgHierarchyKpiDetailKey;
    nodeType: OrgHierarchyNodeType;
    nodeId: string;
    nodeLabel: string;
  }>();

  get hasChildren(): boolean {
    return !!(this.node.children && this.node.children.length > 0);
  }

  get isExpanded(): boolean {
    return this.expandedIds.has(this.node.node_id);
  }

  get showChildren(): boolean {
    return this.hasChildren && this.isExpanded;
  }

  get isSelected(): boolean {
    return this.selectedNodeId === this.node.node_id;
  }

  get isSearchMatch(): boolean {
    return this.searchHighlightIds.has(this.node.node_id);
  }

  levelClass(): string {
    return `org-flowchart-card--${normalizeOrgHierarchyNodeType(this.node.node_type)}`;
  }

  nodeTypeLabel(): string {
    return getOrgHierarchyNodeTypeLabel(this.node.node_type);
  }

  nodeAreaLabelClass(): string | null {
    if (normalizeOrgHierarchyNodeType(this.node.node_type) !== 'segmentacao') {
      return null;
    }
    return getOrgHierarchyAreaLabelClass(this.node.label ?? '');
  }

  formatPoints(): string {
    return formatHighlightMtdMetricValue(this.node.mtd?.points_delivered, 'number');
  }

  formatOnTime(): string {
    return formatHighlightMtdMetricValue(this.node.mtd?.on_time_pct, 'pct');
  }

  formatGoalPct(): string | null {
    const pct = computeOrgPointsGoalPct(this.node.mtd);
    if (pct == null) {
      return null;
    }
    return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}% da meta`;
  }

  goalTone(): 'positive' | 'negative' | 'neutral' {
    return getOrgPointsGoalTone(computeOrgPointsGoalPct(this.node.mtd));
  }

  mtdComparePct(): string {
    return formatOrgHierarchyComparePct(this.node.compare?.vs_prev_mtd_points_pct);
  }

  mtdCompareTone(): 'positive' | 'negative' | 'neutral' {
    return getOrgHierarchyCompareTone(this.node.compare?.vs_prev_mtd_points_pct);
  }

  onTimeTone(): 'success' | 'warning' | 'danger' | 'neutral' {
    const pct = this.node.mtd?.on_time_pct;
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

  childCountLabel(): string {
    const count = this.node.children?.length ?? 0;
    if (count === 0) {
      return '';
    }
    return count === 1 ? '1 subnível' : `${count} subníveis`;
  }

  onCardClick(): void {
    this.selectNode.emit(this.node.node_id);
  }

  onExpandClick(event: Event): void {
    event.stopPropagation();
    if (!this.hasChildren) {
      return;
    }
    this.toggleNode.emit(this.node.node_id);
  }

  onExpandKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (this.hasChildren) {
        this.toggleNode.emit(this.node.node_id);
      }
    }
  }

  onCardKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onCardClick();
    }
  }

  onKpiClick(kpi: OrgHierarchyKpiDetailKey, event: Event): void {
    event.stopPropagation();
    this.kpiClick.emit({
      kpi,
      nodeType: this.node.node_type,
      nodeId: this.node.node_id,
      nodeLabel: this.node.label
    });
  }

  trackByNodeId(_index: number, child: OrgHierarchyNode): string {
    return child.node_id;
  }
}
