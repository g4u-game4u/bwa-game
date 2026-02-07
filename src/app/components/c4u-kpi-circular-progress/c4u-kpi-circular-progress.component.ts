import { Component, Input, HostBinding } from '@angular/core';

@Component({
  selector: 'c4u-kpi-circular-progress',
  templateUrl: './c4u-kpi-circular-progress.component.html',
  styleUrls: ['./c4u-kpi-circular-progress.component.scss']
})
export class C4uKpiCircularProgressComponent {
  @Input() label: string = '';
  @Input() current: number = 0;
  @Input() target: number = 0;
  @Input() superTarget?: number;
  @Input() colorIndex: number = 0;
  @Input() color?: 'red' | 'yellow' | 'green';
  @Input() unit?: string = '';
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  
  @HostBinding('class')
  get hostClasses(): string {
    return `size-${this.size}`;
  }

  // Color palette for different KPIs (fallback)
  private readonly colorPalette: Array<'green' | 'gold' | 'red' | 'blue' | 'purple'> = [
    'green', 'blue', 'purple', 'gold', 'red'
  ];

  get percentage(): number {
    if (this.target === 0) {
      return 0;
    }
    return Math.round((this.current / this.target) * 100);
  }

  get progressColor(): 'green' | 'blue' | 'purple' | 'gold' | 'red' {
    // If current is below target, always show red
    if (this.target > 0 && this.current < this.target) {
      return 'red';
    }
    
    // If goal is achieved, use gold color (especially for modals)
    if (this.isGoalAchieved) {
      return 'gold';
    }
    
    // Use explicit color if provided (new goal-based system)
    // Only use provided color if current >= target (already checked above)
    if (this.color) {
      switch (this.color) {
        case 'green': return 'green';
        case 'yellow': return 'gold';
        case 'red': return 'red';
        default: return 'blue';
      }
    }
    
    // Fallback to colorIndex system (legacy)
    return this.colorPalette[this.colorIndex % this.colorPalette.length];
  }

  get displayValue(): string {
    return this.unit ? `${this.current} ${this.unit}` : `${this.current}`;
  }

  /**
   * Get icon class based on KPI label
   * - "Entregas no Prazo" or "Entregas" -> ri-time-line (delivery deadline)
   * - "Clientes na Carteira" or "Clientes" -> ri-building-line (clients - same as sidebar)
   * - Default -> ri-bar-chart-line (generic KPI)
   */
  get kpiIcon(): string {
    const labelLower = this.label.toLowerCase();
    
    // Check for delivery/deadline related labels
    if (labelLower.includes('entregas') || labelLower.includes('prazo')) {
      return 'ri-time-line';
    }
    
    // Check for clients/clientes related labels (using same icon as sidebar)
    if (labelLower.includes('clientes') || labelLower.includes('carteira') || labelLower.includes('empresas')) {
      return 'ri-building-line';
    }
    
    // Default icon for other KPIs
    return 'ri-bar-chart-line';
  }

  get goalStatus(): string {
    if (!this.superTarget) {
      return this.current >= this.target ? 'Meta atingida' : 'Abaixo da meta';
    }
    
    if (this.current >= this.superTarget) {
      return 'Super meta atingida';
    } else if (this.current >= this.target) {
      return 'Meta atingida';
    } else {
      return 'Abaixo da meta';
    }
  }

  /**
   * Check if goal is achieved (current >= target)
   */
  get isGoalAchieved(): boolean {
    return this.current >= this.target;
  }

  /**
   * Get help text key based on KPI label
   */
  get helpTextKey(): string {
    const labelLower = this.label.toLowerCase();
    
    if ((labelLower.includes('clientes') || labelLower.includes('empresas')) && labelLower.includes('carteira')) {
      return 'clientes-na-carteira';
    } else if (labelLower.includes('entregas') && labelLower.includes('prazo')) {
      return 'entregas-no-prazo';
    }
    
    // Default fallback
    return 'clientes-na-carteira';
  }

  /**
   * Generate accessible ARIA label for screen readers
   */
  get ariaLabel(): string {
    const unitText = this.unit ? ` ${this.unit}` : '';
    return `${this.label}: ${this.current}${unitText} de ${this.target}${unitText}, ${this.percentage}% completo. ${this.goalStatus}`;
  }

  /**
   * Generate ARIA value text for screen readers
   */
  get ariaValueText(): string {
    return `${this.current} de ${this.target}, ${this.percentage} por cento`;
  }
}
