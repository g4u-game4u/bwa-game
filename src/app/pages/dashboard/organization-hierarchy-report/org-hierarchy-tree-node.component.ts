import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { OrgHierarchyNode } from '@model/game4u-api.model';
import {
  formatBrl,
  formatHighlightMtdMetricValue,
  formatOrgHierarchyComparePct,
  formatOrgHierarchySharePct,
  getOrgHierarchyCompareTone,
  getOrgHierarchyNodeTypeLabel,
  OrgHighlightMtdColumn
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

  readonly mtdColumns: ReadonlyArray<OrgHighlightMtdColumn> = [
    { key: 'on_time_pct', label: '% prazo', format: 'pct', title: 'Percentual de entregas no prazo' },
    { key: 'finished', label: 'Entregas', format: 'number' },
    { key: 'clients_served', label: 'Clientes', format: 'number', title: 'Clientes atendidos' },
    { key: 'clients_onboarding', label: 'Onboarding', format: 'number' },
    { key: 'clients_acessorias_g4', label: 'Acess. G4', format: 'number', title: 'Clientes Acessórias G4' },
    { key: 'clients_acessorias_onboarding', label: 'Acess. onboard.', format: 'number', title: 'Clientes Acessórias em onboarding' },
    { key: 'clients_acessorias_risco_de_churn', label: 'Acess. churn', format: 'number', title: 'Clientes Acessórias com risco de churn' },
    { key: 'pending_open', label: 'Pendentes', format: 'number' },
    { key: 'near_due', label: 'Próx. venc.', format: 'number', title: 'Próximo do vencimento' },
    { key: 'overdue_pending', label: 'Atrasados', format: 'number' },
    { key: 'multa_risk', label: 'Multa risco', format: 'number' },
    { key: 'multa_incurred', label: 'Multa incorr.', format: 'number', title: 'Multas incorridas' },
    { key: 'multa_and_near_due', label: 'Multa+prox.', format: 'number', title: 'Multa e próximo do vencimento' },
    { key: 'goal_points', label: 'Meta', format: 'number', title: 'Meta de pontos' }
  ];

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

  get showPlayerAccess(): boolean {
    return this.node.node_type === 'player' && !!this.node.access;
  }

  get playerAccessDaysLabel(): string {
    const days = this.node.access?.mtd?.access_days;
    if (days == null || !Number.isFinite(days)) {
      return '—';
    }
    return days.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  get playerAccessSessionsLabel(): string {
    const sessions = this.node.access?.mtd?.access_sessions;
    if (sessions == null || !Number.isFinite(sessions)) {
      return '—';
    }
    return sessions.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  get playerAccessStreakLabel(): string {
    const streak = this.node.access?.current_streak;
    if (streak == null || !Number.isFinite(streak)) {
      return '—';
    }
    return `${streak} ${streak === 1 ? 'dia' : 'dias'}`;
  }

  get playerLongestStreakLabel(): string {
    const streak = this.node.access?.longest_streak;
    if (streak == null || !Number.isFinite(streak)) {
      return '—';
    }
    return `${streak} ${streak === 1 ? 'dia' : 'dias'}`;
  }

  formatMtdValue(col: OrgHighlightMtdColumn): string {
    const value = this.node.mtd?.[col.key];
    return formatHighlightMtdMetricValue(value as number | undefined | null, col.format);
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
