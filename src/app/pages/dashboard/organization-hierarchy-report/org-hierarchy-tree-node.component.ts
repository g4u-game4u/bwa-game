import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { OrgHierarchyNode } from '@model/game4u-api.model';
import {
  formatBrl,
  formatOrgHierarchyComparePct,
  formatOrgHierarchySharePct,
  getOrgHierarchyCompareTone,
  getOrgHierarchyNodeTypeLabel
} from '@services/org-hierarchy-report.mapper';

@Component({
  selector: 'c4u-org-hierarchy-tree-node',
  templateUrl: './org-hierarchy-tree-node.component.html',
  styleUrls: ['./org-hierarchy-tree-node.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uOrgHierarchyTreeNodeComponent {
  @Input() node!: OrgHierarchyNode;
  @Input() depth = 0;
  @Input() showSimulation = false;
  @Input() expandedIds = new Set<string>();

  @Output() toggleNode = new EventEmitter<string>();

  get hasChildren(): boolean {
    return !!(this.node.children && this.node.children.length > 0);
  }

  get isExpanded(): boolean {
    return this.expandedIds.has(this.node.node_id);
  }

  get nodeTypeLabel(): string {
    return getOrgHierarchyNodeTypeLabel(this.node.node_type);
  }

  get mtdComparePct(): string {
    return formatOrgHierarchyComparePct(this.node.compare?.vs_prev_mtd_points_pct);
  }

  get mtdCompareTone(): 'positive' | 'negative' | 'neutral' {
    return getOrgHierarchyCompareTone(this.node.compare?.vs_prev_mtd_points_pct);
  }

  get simulationPayout(): string {
    return formatBrl(this.node.simulation?.payout_brl);
  }

  get simulationShare(): string {
    return formatOrgHierarchySharePct(this.node.simulation?.share_pct);
  }

  onToggle(): void {
    if (!this.hasChildren) {
      return;
    }
    this.toggleNode.emit(this.node.node_id);
  }

  onToggleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onToggle();
    }
  }

  trackByNodeId(_index: number, child: OrgHierarchyNode): string {
    return child.node_id;
  }
}
