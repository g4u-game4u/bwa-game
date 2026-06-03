import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uDashboardInsightsComponent } from './c4u-dashboard-insights.component';
import { C4uCardModule } from '@components/c4u-card/c4u-card.module';
import { C4uInfoButtonModule } from '@components/c4u-info-button/c4u-info-button.module';

@NgModule({
  declarations: [C4uDashboardInsightsComponent],
  imports: [CommonModule, C4uCardModule, C4uInfoButtonModule],
  exports: [C4uDashboardInsightsComponent]
})
export class C4uDashboardInsightsModule {}
