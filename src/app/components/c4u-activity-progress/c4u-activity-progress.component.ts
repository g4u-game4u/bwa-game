import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ActivityMetrics, ProcessMetrics } from '@model/gamification-dashboard.model';

export type ProgressCardType = 'atividades-finalizadas' | 'atividades-pontos' | 'processos-pendentes' | 'processos-finalizados';

export interface MonthlyPointsBreakdown {
  bloqueados: number;
  desbloqueados: number;
}

@Component({
  selector: 'c4u-activity-progress',
  templateUrl: './c4u-activity-progress.component.html',
  styleUrls: ['./c4u-activity-progress.component.scss']
})
export class C4uActivityProgressComponent {
  @Input() activities: ActivityMetrics = {
    pendentes: 0,
    emExecucao: 0,
    finalizadas: 0,
    pontos: 0
  };

  @Input() processos: ProcessMetrics = {
    pendentes: 0,
    incompletas: 0,
    finalizadas: 0
  };

  @Input() monthlyPointsBreakdown: MonthlyPointsBreakdown | null = null;

  @Output() cardClicked = new EventEmitter<ProgressCardType>();

  onCardClick(type: ProgressCardType): void {
    this.cardClicked.emit(type);
  }

  /**
   * Format number in PT-BR format (using dot as thousand separator)
   * Example: 1234 -> "1.234"
   */
  formatNumber(value: number): string {
    return new Intl.NumberFormat('pt-BR').format(value);
  }

  /**
   * Get text for monthly points breakdown tooltip
   */
  get monthlyPointsText(): string {
    if (!this.monthlyPointsBreakdown) {
      return '';
    }
    const bloqueados = this.formatNumber(this.monthlyPointsBreakdown.bloqueados);
    const desbloqueados = this.formatNumber(this.monthlyPointsBreakdown.desbloqueados);
    return `Pontos mensais: ${bloqueados} bloqueados e ${desbloqueados} desbloqueados.`;
  }
}
