import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { GamificationDashboardComponent } from './gamification-dashboard.component';
import { SharedModule } from '@app/shared.module';

// Import child components
import { C4uCardModule } from '@components/c4u-card/c4u-card.module';
import { C4uSeasonLevelModule } from '@components/c4u-season-level/c4u-season-level.module';
import { C4uPointWalletModule } from '@components/c4u-point-wallet/c4u-point-wallet.module';
import { C4uSeasonProgressModule } from '@components/c4u-season-progress/c4u-season-progress.module';
import { C4uSeletorMesModule } from '@components/c4u-seletor-mes/c4u-seletor-mes.module';
import { C4uKpiCircularProgressModule } from '@components/c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';
import { C4uActivityProgressModule } from '@components/c4u-activity-progress/c4u-activity-progress.module';
import { C4uCompanyTableModule } from '@components/c4u-company-table/c4u-company-table.module';
import { C4uShimmerModule } from '@components/c4u-shimmer/c4u-shimmer.module';
import { C4uErrorMessageModule } from '@components/c4u-error-message/c4u-error-message.module';
import { C4uDashboardNavigationModule } from '@components/c4u-dashboard-navigation/c4u-dashboard-navigation.module';
import { ModalCompanyDetailModule } from '@modals/modal-company-detail/modal-company-detail.module';
import { ModalProgressListModule } from '@modals/modal-progress-list/modal-progress-list.module';
import { ModalCarteiraModule } from '@modals/modal-carteira/modal-carteira.module';

const routes: Routes = [
  {
    path: '',
    component: GamificationDashboardComponent
  }
];

@NgModule({
  declarations: [
    GamificationDashboardComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild(routes),
    // Child component modules
    C4uCardModule,
    C4uSeasonLevelModule,
    C4uPointWalletModule,
    C4uSeasonProgressModule,
    C4uSeletorMesModule,
    C4uKpiCircularProgressModule,
    C4uActivityProgressModule,
    C4uCompanyTableModule,
    C4uShimmerModule,
    C4uErrorMessageModule,
    C4uDashboardNavigationModule,
    ModalCompanyDetailModule,
    ModalProgressListModule,
    ModalCarteiraModule
  ],
  exports: [
    GamificationDashboardComponent
  ]
})
export class GamificationDashboardModule { }
