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
  @Input() color?: 'red' | 'yellow' | 'green' | 'pink' | 'gray';
  @Input() unit?: string = '';
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() isMissing: boolean = false;
  /** Carregamento em curso: anel neutro + reticências animadas no valor/meta/status. */
  @Input() isPending = false;
  /** Só o valor percentual visível (sem rótulo, meta nem status) — ex.: entregas no prazo. */
  @Input() compactPercentOnly = false;
  /** Quando preenchido, substitui o texto de ajuda do botão de informação. */
  @Input() helpDescription = '';
  
  @HostBinding('class')
  get hostClasses(): string {
    const compact = this.compactPercentOnly ? ' compact-percent-only' : '';
    return `size-${this.size}${compact}`;
  }

  // Color palette for different KPIs (fallback)
  private readonly colorPalette: Array<'green' | 'gold' | 'red' | 'blue' | 'purple'> = [
    'green', 'blue', 'purple', 'gold', 'red'
  ];

  get percentage(): number {
    if (this.isMissing || this.isPending) {
      return 0;
    }
    
    // For percentage KPIs (like "Entregas no Prazo"), use the raw value as the percentage
    // capped at 100 for the progress bar visual
    if (this.unit === '%') {
      return Math.min(Math.round(this.current), 100);
    }
    
    // For count-based KPIs, calculate goal completion percentage
    if (this.target === 0) {
      return 0;
    }
    return Math.round((this.current / this.target) * 100);
  }

  get progressColor(): 'green' | 'blue' | 'purple' | 'gold' | 'red' | 'gray' {
    if (this.isMissing || this.isPending) {
      return 'gray';
    }
    
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
        case 'pink': return 'red'; // KPIData usa pink; anel usa tema red (#C56685 no centro)
        case 'gray': return 'gray';
        default: return 'blue';
      }
    }
    
    // Fallback to colorIndex system (legacy)
    return this.colorPalette[this.colorIndex % this.colorPalette.length];
  }

  /**
   * Get display value
   * For percentage-based KPIs (unit === '%'), show the raw value directly
   * For count-based KPIs, show the raw count (not percentage)
   */
  get displayValue(): string {
    if (this.isPending) {
      return '';
    }
    if (this.isMissing) {
      return '?';
    }
    
    // For percentage KPIs (like "Entregas no Prazo"), show the raw value with %
    if (this.unit === '%') {
      const n = Math.round(this.current * 100) / 100;
      const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
      return `${text}%`;
    }
    
    // For count-based KPIs (like "Clientes na Carteira"), show the raw count
    if (this.unit === 'pts') {
      return `${Math.round(this.current)} pts`;
    }
    return `${Math.round(this.current)}`;
  }

  /**
   * Get target value display showing "Meta: X unit"
   * This replaces the old displayValue that showed current value
   */
  get targetDisplayValue(): string {
    if (this.unit) {
      return `Meta: ${this.target} ${this.unit}`;
    }
    return `Meta: ${this.target}`;
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

    if (labelLower.includes('pontos')) {
      return 'ri-trophy-line';
    }
    
    // Default icon for other KPIs
    return 'ri-bar-chart-line';
  }

  /** Classe do badge inferior (neutro durante carregamento ou dado em falta). */
  get statusBadgeClass(): string {
    if (this.isPending || this.isMissing) {
      return 'status-gray';
    }
    const c = this.color ?? 'green';
    return `status-${c}`;
  }

  get goalStatus(): string {
    if (this.isPending) {
      return '';
    }
    if (this.isMissing) {
      return 'Dado indisponível';
    }
    
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
    if (this.isPending || this.isMissing) {
      return false;
    }
    return this.current >= this.target;
  }

  /**
   * Get help text key based on KPI label
   */
  get helpTextKey(): string {
    const labelLower = this.label.toLowerCase();
    
    if ((labelLower.includes('clientes') || labelLower.includes('empresas')) && labelLower.includes('carteira')) {
      return 'clientes-na-carteira';
    } else if (labelLower.includes('pontos') && labelLower.includes('mês')) {
      return 'pontos-no-mes';
    } else if (labelLower.includes('entregas') && labelLower.includes('prazo')) {
      return 'entregas-no-prazo';
    }
    
    // Default fallback
    return 'clientes-na-carteira';
  }

  /**
   * Get custom help text with current and target values
   * Format: "100 de 10" (current de target)
   * Only for "clientes-na-carteira" and "entregas-no-prazo" KPIs
   */
  get customHelpText(): string {
    const trimmed = this.helpDescription?.trim();
    if (trimmed) {
      return trimmed;
    }

    const key = this.helpTextKey;
    
    // Only add custom text for these specific KPIs
    if (key === 'clientes-na-carteira' || key === 'entregas-no-prazo' || key === 'pontos-no-mes') {
      if (this.isPending) {
        return 'A carregar dados…';
      }
      if (this.isMissing) {
        return 'Dado não disponível';
      }
      const unitText = this.unit ? ` ${this.unit}` : '';
      if (key === 'pontos-no-mes') {
        return `${Math.round(this.current)} pts de meta ${Math.round(this.target)} pts (mês selecionado).`;
      }
      return `${this.current}${unitText} de ${this.target}${unitText}`;
    }
    
    // Return empty string to use default help text from service
    return '';
  }

  /**
   * Generate accessible ARIA label for screen readers
   */
  get ariaLabel(): string {
    if (this.isPending) {
      return `${this.label}: a carregar`;
    }
    if (this.isMissing) {
      return `${this.label}: dado indisponível`;
    }
    if (this.compactPercentOnly && this.unit === '%') {
      return `${this.displayValue} (meta ${this.target}${this.unit})`;
    }
    const unitText = this.unit ? ` ${this.unit}` : '';
    return `${this.label}: ${this.percentage}% da meta (${this.current}${unitText} de ${this.target}${unitText}). ${this.goalStatus}`;
  }

  /**
   * Generate ARIA value text for screen readers
   */
  get ariaValueText(): string {
    if (this.isPending) {
      return 'a carregar';
    }
    return `${this.percentage}% da meta`;
  }
}
