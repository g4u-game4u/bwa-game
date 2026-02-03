import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

export interface TeamSeasonPoints {
  total: number;
  bloqueados: number;
  desbloqueados: number;
}

export interface TeamProgressMetrics {
  processosIncompletos: number;
  atividadesFinalizadas: number;
  processosFinalizados: number;
}

export interface SeasonDates {
  start: Date;
  end: Date;
}

export type TeamSidebarViewMode = 'player' | 'team-management';

@Component({
  selector: 'c4u-team-sidebar',
  templateUrl: './c4u-team-sidebar.component.html',
  styleUrls: ['./c4u-team-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uTeamSidebarComponent {
  @Input() teamName: string = '';
  @Input() seasonPoints: TeamSeasonPoints = {
    total: 0,
    bloqueados: 0,
    desbloqueados: 0
  };
  @Input() progressMetrics: TeamProgressMetrics = {
    processosIncompletos: 0,
    atividadesFinalizadas: 0,
    processosFinalizados: 0
  };
  @Input() seasonDates: SeasonDates = {
    start: new Date(),
    end: new Date()
  };
  @Input() viewMode: TeamSidebarViewMode = 'player';
  @Input() insideCard: boolean = false;
  @Input() averagePoints: number = 0;
}
