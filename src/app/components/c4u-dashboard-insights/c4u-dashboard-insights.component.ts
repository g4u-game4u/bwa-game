import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { DashboardInsightsSnapshot } from '@model/dashboard-insights.model';

export type DashboardInsightsVariant = 'player' | 'team';

@Component({
  selector: 'c4u-dashboard-insights',
  templateUrl: './c4u-dashboard-insights.component.html',
  styleUrls: ['./c4u-dashboard-insights.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uDashboardInsightsComponent {
  readonly skeletonAlerts = [0, 1, 2];
  readonly skeletonRankedRows = [0, 1, 2];
  readonly skeletonSummaryRows = [0, 1, 2, 3];
  readonly skeletonWeekdayBarHeights = [28, 44, 18, 52, 36, 22, 48];

  @Input() insights: DashboardInsightsSnapshot | null = null;
  @Input() loading = false;
  @Input() variant: DashboardInsightsVariant = 'player';
  @Input() scopeLabel = 'você';
  /** Sem cabeçalho de secção nem card exterior (ex.: dentro de insights executivos). */
  @Input() embedded = false;

  get hasData(): boolean {
    return !!this.insights && (this.insights.pendingTasks > 0 || this.insights.finishedTasks > 0);
  }

  get sectionTitle(): string {
    return this.variant === 'player' ? 'Insights do mês' : 'Insights operacionais';
  }

  get infoText(): string {
    if (this.variant === 'player') {
      return 'Resumo inteligente das suas entregas no mês selecionado: produtividade, prazos e alertas de atenção';
    }
    return `Resumo operacional de ${this.scopeLabel} no mês: entregas urgentes, produtividade e padrões de entrega`;
  }

  get weekdayMaxCount(): number {
    const rows = this.insights?.weekdayDistribution ?? [];
    return Math.max(1, ...rows.map(r => r.count));
  }

  weekdayBarHeight(count: number): string {
    if (count <= 0) {
      return '0%';
    }
    const max = this.weekdayMaxCount;
    const pct = Math.round((count / max) * 100);
    return `${Math.max(pct, 10)}%`;
  }

  isPeakWeekday(day: { index: number; count: number }): boolean {
    const peak = this.insights?.mostProductiveWeekday;
    return peak != null && peak.index === day.index && day.count > 0;
  }

  weekdayBarTitle(day: { label: string; count: number }): string {
    const n = day.count;
    return `${day.label}: ${n} ${n === 1 ? 'entrega finalizada' : 'entregas finalizadas'}`;
  }

  get weekdayChartAriaLabel(): string {
    const peak = this.insights?.mostProductiveWeekday;
    if (!peak || peak.count <= 0) {
      return 'Distribuição de entregas finalizadas por dia da semana';
    }
    return `Distribuição de entregas por dia da semana. Dia mais produtivo: ${peak.label}, com ${peak.count} entregas finalizadas.`;
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByKey(_index: number, item: { key: string }): string {
    return item.key;
  }
}
