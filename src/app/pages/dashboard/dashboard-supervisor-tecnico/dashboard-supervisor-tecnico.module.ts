import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { DashboardSupervisorTecnicoComponent } from './dashboard-supervisor-tecnico.component';
import { SharedModule } from '@app/shared.module';

import { C4uSeletorMesModule } from '@components/c4u-seletor-mes/c4u-seletor-mes.module';
import { C4uCardModule } from '@components/c4u-card/c4u-card.module';
import { C4uShimmerModule } from '@components/c4u-shimmer/c4u-shimmer.module';
import { C4uErrorMessageModule } from '@components/c4u-error-message/c4u-error-message.module';
import { C4uDashboardNavigationModule } from '@components/c4u-dashboard-navigation/c4u-dashboard-navigation.module';
import { C4uInfoButtonModule } from '@components/c4u-info-button/c4u-info-button.module';
import { C4uKpiCircularProgressModule } from '@components/c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';
import { C4uPointWalletModule } from '@components/c4u-point-wallet/c4u-point-wallet.module';
import { C4uSeasonProgressModule } from '@components/c4u-season-progress/c4u-season-progress.module';
import { C4uActivityProgressModule } from '@components/c4u-activity-progress/c4u-activity-progress.module';
import { ModalPlayerDetailModule } from '@app/modals/modal-player-detail/modal-player-detail.module';
import { ModalCompanyDetailModule } from '@app/modals/modal-company-detail/modal-company-detail.module';
import { ModalCompanyCarteiraDetailModule } from '@modals/modal-company-carteira-detail/modal-company-carteira-detail.module';
import { ModalProgressListModule } from '@modals/modal-progress-list/modal-progress-list.module';

const routes: Routes = [
  {
    path: '',
    component: DashboardSupervisorTecnicoComponent
  }
];

@NgModule({
  declarations: [
    DashboardSupervisorTecnicoComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedModule,
    RouterModule.forChild(routes),
    C4uSeletorMesModule,
    C4uCardModule,
    C4uShimmerModule,
    C4uErrorMessageModule,
    C4uDashboardNavigationModule,
    C4uInfoButtonModule,
    C4uKpiCircularProgressModule,
    C4uPointWalletModule,
    C4uSeasonProgressModule,
    C4uActivityProgressModule,
    ModalPlayerDetailModule,
    ModalCompanyDetailModule,
    ModalCompanyCarteiraDetailModule,
    ModalProgressListModule
  ],
  exports: [
    DashboardSupervisorTecnicoComponent
  ]
})
export class DashboardSupervisorTecnicoModule { }
