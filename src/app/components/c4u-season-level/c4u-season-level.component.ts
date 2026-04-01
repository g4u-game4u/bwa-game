import { Component, Input } from '@angular/core';
import { PlayerMetadata } from '@model/gamification-dashboard.model';

@Component({
  selector: 'c4u-season-level',
  templateUrl: './c4u-season-level.component.html',
  styleUrls: ['./c4u-season-level.component.scss']
})
export class C4uSeasonLevelComponent {
  @Input() level: number = 0;
  @Input() playerName: string = '';
  @Input() metadata: PlayerMetadata = {
    area: '',
    time: '',
    squad: ''
  };
  /** Average KPI percentage (0-100) to display in the level circle */
  @Input() kpiAveragePercent: number = 0;

  /**
   * Get the color class based on KPI average percentage
   */
  get levelColorClass(): string {
    if (this.kpiAveragePercent >= 80) return 'level-success';
    if (this.kpiAveragePercent >= 50) return 'level-warning';
    return 'level-danger';
  }

  /**
   * Get the stroke dasharray for the circular progress
   */
  get progressDasharray(): string {
    const percent = Math.min(100, Math.max(0, this.kpiAveragePercent));
    return `${percent}, 100`;
  }
}
