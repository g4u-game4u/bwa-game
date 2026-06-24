import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PipelineIntegrationChangesComponent } from './pipeline-integration-changes.component';
import { AdminGuard } from '@guards/admin.guard';
import { C4uDashboardNavigationModule } from '@components/c4u-dashboard-navigation/c4u-dashboard-navigation.module';
import { C4uSeletorMesModule } from '@components/c4u-seletor-mes/c4u-seletor-mes.module';
import { SharedModule } from '../../../shared.module';

const routes: Routes = [
  {
    path: '',
    component: PipelineIntegrationChangesComponent,
    canActivate: [AdminGuard],
    data: { title: 'Log Pipeline Integração' }
  }
];

@NgModule({
  declarations: [PipelineIntegrationChangesComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
    C4uDashboardNavigationModule,
    C4uSeletorMesModule
  ]
})
export class PipelineIntegrationChangesModule {}
