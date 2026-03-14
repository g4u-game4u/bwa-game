import { Component, Input } from '@angular/core';
import { SeasonProgress } from '@model/gamification-dashboard.model';

@Component({
  selector: 'c4u-season-progress',
  templateUrl: './c4u-season-progress.component.html',
  styleUrls: ['./c4u-season-progress.component.scss']
})
export class C4uSeasonProgressComponent {
  @Input() progress: SeasonProgress = {
    metas: { current: 0, target: 0 },
    clientes: 0,
    tarefasFinalizadas: 0,
    seasonDates: {
      start: new Date(),
      end: new Date()
    }
  };
  
  @Input() processosFinalizados?: number;

  formatDate(date: Date | string): string {
    // Ensure we have a Date object
    const dateObj = date instanceof Date ? date : new Date(date);
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear().toString().slice(-2);
    return `${day}/${month}/${year}`;
  }

  get seasonDateRange(): string {
    return `${this.formatDate(this.progress.seasonDates.start)} a ${this.formatDate(this.progress.seasonDates.end)}`;
  }
}
