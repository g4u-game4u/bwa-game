import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { C4uTimePeriodSelectorComponent } from './c4u-time-period-selector.component';

@NgModule({
  declarations: [
    C4uTimePeriodSelectorComponent
  ],
  imports: [
    CommonModule,
    FormsModule
  ],
  exports: [
    C4uTimePeriodSelectorComponent
  ]
})
export class C4uTimePeriodSelectorModule { }
