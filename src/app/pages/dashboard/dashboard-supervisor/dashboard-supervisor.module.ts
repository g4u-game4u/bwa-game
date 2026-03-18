import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { DashboardSupervisorComponent } from './dashboard-supervisor.component';
import { SharedModule } from '@app/shared.module';

import { C4uSeletorMesModule } from '@components/c4u-seletor-mes/c4u-seletor-mes.module';
import { C4uCardModule } from '@components/c4u-card/c4u-card.module';
import { C4uShimmerModule } from '@components/c4u-shimmer/c4u-shimmer.module';
import { C4uErrorMessageModule } from '@components/c4u-error-message/c4u-error-message.module';
import { C4uDashboardNavigationModule } from '@components/c4u-dashboard-navigation/c4u-dashboard-navigation.module';
import { C4uInfoButtonModule } from '@components/c4u-info-button/c4u-info-button.module';
import { C4uKpiCircularProgressModule } from '@components/c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';
import { ModalPlayerDetailModule } from '@app/modals/modal-player-detail/modal-player-detail.module';
import { ModalCompanyDetailModule } from '@app/modals/modal-company-detail/modal-company-detail.module';
import { ModalConfirmLogoutModule } from '@modals/modal-confirm-logout/modal-confirm-logout.module';

const routes: Routes = [
  {
    path: '',
    component: DashboardSupervisorComponent
  }
];

@NgModule({
  declarations: [
    DashboardSupervisorComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    RouterModule.forChild(routes),
    C4uSeletorMesModule,
    C4uCardModule,
    C4uShimmerModule,
    C4uErrorMessageModule,
    C4uDashboardNavigationModule,
    C4uInfoButtonModule,
    C4uKpiCircularProgressModule,
    ModalPlayerDetailModule,
    ModalCompanyDetailModule,
    ModalConfirmLogoutModule
  ],
  exports: [
    DashboardSupervisorComponent
  ]
})
export class DashboardSupervisorModule { }
