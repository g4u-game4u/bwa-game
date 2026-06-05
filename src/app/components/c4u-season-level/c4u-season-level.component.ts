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
  /** Nome do time (`team_name` em `/auth/user`). */
  @Input() teamName: string = '';
  @Input() metadata: PlayerMetadata = {
    area: '',
    time: '',
    squad: ''
  };
  /** Média da % de «Pontos no mês» e «Entregas no prazo». */
  @Input() kpiAveragePercent: number = 0;

  private static readonly PROGRESS_RED = { r: 197, g: 102, b: 133 };
  private static readonly PROGRESS_GREEN = { r: 55, g: 204, b: 66 };

  get clampedPercent(): number {
    return Math.min(100, Math.max(0, this.kpiAveragePercent));
  }

  get levelColorClass(): string {
    return this.clampedPercent >= 100 ? 'level-gold' : 'level-dynamic';
  }

  /** Cor do anel: vermelho → verde conforme o preenchimento; 100% = dourado. */
  get circleStroke(): string {
    if (this.clampedPercent >= 100) {
      return 'url(#seasonLevelGold)';
    }
    return this.interpolateProgressColor(this.clampedPercent);
  }

  get progressDasharray(): string {
    return `${this.clampedPercent}, 100`;
  }

  private interpolateProgressColor(percent: number): string {
    const t = percent / 100;
    const { r: r1, g: g1, b: b1 } = C4uSeasonLevelComponent.PROGRESS_RED;
    const { r: r2, g: g2, b: b2 } = C4uSeasonLevelComponent.PROGRESS_GREEN;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}
