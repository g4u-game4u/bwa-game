import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uGoalsProgressTabComponent } from './c4u-goals-progress-tab.component';
import { C4uKpiCircularProgressModule } from '../c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';

/**
 * Module for Goals Progress Tab Component
 * 
 * This module provides the goals progress tab component which displays
 * goal achievement metrics with circular progress indicators.
 */
@NgModule({
  declarations: [
    C4uGoalsProgressTabComponent
  ],
  imports: [
    CommonModule,
    C4uKpiCircularProgressModule
  ],
  exports: [
    C4uGoalsProgressTabComponent
  ]
})
export class C4uGoalsProgressTabModule { }
