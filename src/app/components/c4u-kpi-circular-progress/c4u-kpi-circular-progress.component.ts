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
    // Use explicit color if provided (new goal-based system)
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
    return `${this.current}${this.unit || ''}`;
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
