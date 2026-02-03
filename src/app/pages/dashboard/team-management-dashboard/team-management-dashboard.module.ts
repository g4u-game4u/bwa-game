import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TeamManagementDashboardComponent } from './team-management-dashboard.component';
import { TeamRoleGuard } from '@guards/team-role.guard';

// Child components
import { C4uTeamSidebarComponent } from '@components/c4u-team-sidebar/c4u-team-sidebar.component';
import { C4uTeamSelectorComponent } from '@components/c4u-team-selector/c4u-team-selector.component';
import { C4uCollaboratorSelectorComponent } from '@components/c4u-collaborator-selector/c4u-collaborator-selector.component';
import { C4uErrorMessageModule } from '@components/c4u-error-message/c4u-error-message.module';
import { C4uSeletorMesModule } from '@components/c4u-seletor-mes/c4u-seletor-mes.module';
import { C4uGoalsProgressTabModule } from '@components/c4u-goals-progress-tab/c4u-goals-progress-tab.module';
import { C4uProductivityAnalysisTabModule } from '@components/c4u-productivity-analysis-tab/c4u-productivity-analysis-tab.module';
import { C4uTimePeriodSelectorModule } from '@components/c4u-time-period-selector/c4u-time-period-selector.module';
import { C4uDashboardNavigationModule } from '@components/c4u-dashboard-navigation/c4u-dashboard-navigation.module';
import { C4uCardModule } from '@components/c4u-card/c4u-card.module';
import { C4uShimmerModule } from '@components/c4u-shimmer/c4u-shimmer.module';
import { C4uActivityProgressModule } from '@components/c4u-activity-progress/c4u-activity-progress.module';
import { ModalProgressListModule } from '@modals/modal-progress-list/modal-progress-list.module';
import { ModalCarteiraModule } from '@modals/modal-carteira/modal-carteira.module';

// Shared modules
import { SharedModule } from '../../../shared.module';

const routes: Routes = [
  {
    path: '',
    component: TeamManagementDashboardComponent,
    canActivate: [TeamRoleGuard],
    data: { title: 'Gestão de Equipe' }
  }
];

@NgModule({
  declarations: [
    TeamManagementDashboardComponent,
    C4uTeamSidebarComponent,
    C4uTeamSelectorComponent,
    C4uCollaboratorSelectorComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule, // This provides NumberFormatPipe and DateFormatPipe
    C4uSeletorMesModule,
    C4uGoalsProgressTabModule,
    C4uProductivityAnalysisTabModule,
    C4uTimePeriodSelectorModule,
    C4uDashboardNavigationModule,
    C4uErrorMessageModule,
    C4uCardModule,
    C4uShimmerModule,
    C4uActivityProgressModule,
    ModalProgressListModule,
    ModalCarteiraModule
  ]
})
export class TeamManagementDashboardModule { }
