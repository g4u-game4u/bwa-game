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
  /** Average KPI percentage (0-100+) to display in the level circle */
  @Input() kpiAveragePercent: number = 0;
  
  /** 
   * Color class based on how many goals are beaten
   * - 'red': No goals beaten
   * - 'yellow': Some goals beaten
   * - 'green': All goals beaten
   */
  @Input() kpiColorClass: 'red' | 'yellow' | 'green' = 'red';

  /**
   * Get the color class based on kpiColorClass input
   * This determines the color of the circular progress indicator
   */
  get levelColorClass(): string {
    switch (this.kpiColorClass) {
      case 'green': return 'level-success';
      case 'yellow': return 'level-warning';
      case 'red': 
      default: return 'level-danger';
    }
  }

  /**
   * Get the stroke dasharray for the circular progress
   * Capped at 100% for visual display
   */
  get progressDasharray(): string {
    const percent = Math.min(100, Math.max(0, this.kpiAveragePercent));
    return `${percent}, 100`;
  }
}
