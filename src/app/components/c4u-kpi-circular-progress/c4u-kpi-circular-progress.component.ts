import { Component, Input } from '@angular/core';

@Component({
  selector: 'c4u-kpi-circular-progress',
  templateUrl: './c4u-kpi-circular-progress.component.html',
  styleUrls: ['./c4u-kpi-circular-progress.component.scss']
})
export class C4uKpiCircularProgressComponent {
  @Input() label: string = '';
  @Input() current: number = 0;
  @Input() target: number = 0;
  @Input() colorIndex: number = 0;

  // Color palette for different KPIs
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
    // Use colorIndex to assign different colors to each KPI
    return this.colorPalette[this.colorIndex % this.colorPalette.length];
  }
}
