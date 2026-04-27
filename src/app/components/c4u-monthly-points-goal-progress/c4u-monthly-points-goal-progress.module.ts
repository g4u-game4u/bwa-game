import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uMonthlyPointsGoalProgressComponent } from './c4u-monthly-points-goal-progress.component';
import { C4uKpiCircularProgressModule } from '../c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';
import { C4uShimmerModule } from '../c4u-shimmer/c4u-shimmer.module';

@NgModule({
  declarations: [C4uMonthlyPointsGoalProgressComponent],
  imports: [CommonModule, C4uKpiCircularProgressModule, C4uShimmerModule],
  exports: [C4uMonthlyPointsGoalProgressComponent]
})
export class C4uMonthlyPointsGoalProgressModule {}
