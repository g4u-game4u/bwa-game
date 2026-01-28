import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uProductivityAnalysisTabComponent } from './c4u-productivity-analysis-tab.component';
import { C4uTimePeriodSelectorModule } from '../c4u-time-period-selector/c4u-time-period-selector.module';
import { C4uGraficoLinhasModule } from '../c4u-grafico-linhas/c4u-grafico-linhas.module';
import { C4uGraficoBarrasModule } from '../c4u-grafico-barras/c4u-grafico-barras.module';

/**
 * Module for Productivity Analysis Tab Component
 * 
 * This module provides the productivity analysis tab component which displays
 * historical productivity trends using line or bar charts with configurable time periods.
 */
@NgModule({
  declarations: [
    C4uProductivityAnalysisTabComponent
  ],
  imports: [
    CommonModule,
    C4uTimePeriodSelectorModule,
    C4uGraficoLinhasModule,
    C4uGraficoBarrasModule
  ],
  exports: [
    C4uProductivityAnalysisTabComponent
  ]
})
export class C4uProductivityAnalysisTabModule { }
