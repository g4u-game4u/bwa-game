import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'c4u-time-period-selector',
  templateUrl: './c4u-time-period-selector.component.html',
  styleUrls: ['./c4u-time-period-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uTimePeriodSelectorComponent {
  @Input() periods: number[] = [7, 15, 30, 60, 90];
  @Input() selectedPeriod: number = 30;
  @Output() periodSelected = new EventEmitter<number>();

  onPeriodChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const period = Number(target.value);
    this.selectedPeriod = period;
    this.periodSelected.emit(period);
  }
}
