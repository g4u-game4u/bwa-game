import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type DashboardGoalsSkeletonType = 'kpi' | 'progress' | 'clientes';

@Component({
  selector: 'c4u-dashboard-goals-skeleton',
  templateUrl: './c4u-dashboard-goals-skeleton.component.html',
  styleUrls: ['./c4u-dashboard-goals-skeleton.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uDashboardGoalsSkeletonComponent {
  @Input() type: DashboardGoalsSkeletonType = 'kpi';
  /** Número de cartões KPI circulares (inclui meta de pontos do mês). */
  @Input() kpiCount = 2;
  /** Número de linhas na lista de clientes atendidos. */
  @Input() clientesCount = 5;

  readonly progressMetricSlots = [0, 1, 2];

  get kpiSlots(): number[] {
    const count = Math.max(1, Math.min(this.kpiCount, 4));
    return Array.from({ length: count }, (_, index) => index);
  }

  get clientesSlots(): number[] {
    const count = Math.max(3, Math.min(this.clientesCount, 8));
    return Array.from({ length: count }, (_, index) => index);
  }

  get ariaLabel(): string {
    switch (this.type) {
      case 'kpi':
        return 'A carregar metas…';
      case 'progress':
        return 'A carregar progresso…';
      case 'clientes':
        return 'A carregar clientes atendidos…';
    }
  }

  trackByIndex(index: number): number {
    return index;
  }
}
