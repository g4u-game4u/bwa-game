import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OrganizationHierarchyReportComponent } from './organization-hierarchy-report.component';
import { C4uOrgHierarchyTreeNodeComponent } from './org-hierarchy-tree-node.component';
import { C4uOrgHierarchyTreeTableComponent } from './org-hierarchy-tree-table.component';
import { C4uOrgHierarchyFlowchartComponent } from './org-hierarchy-flowchart.component';
import { C4uOrgHierarchyFlowchartNodeComponent } from './org-hierarchy-flowchart-node.component';
import { OrgHierarchyReportGuard } from '@guards/org-hierarchy-report.guard';
import { C4uDashboardNavigationModule } from '@components/c4u-dashboard-navigation/c4u-dashboard-navigation.module';
import { C4uSeletorMesModule } from '@components/c4u-seletor-mes/c4u-seletor-mes.module';
import { C4uCardModule } from '@components/c4u-card/c4u-card.module';
import { C4uShimmerModule } from '@components/c4u-shimmer/c4u-shimmer.module';
import { C4uInfoButtonModule } from '@components/c4u-info-button/c4u-info-button.module';
import { SharedModule } from '../../../shared.module';
import { ModalOrganizationHierarchyKpiDetailModule } from '@app/modals/modal-organization-hierarchy-kpi-detail/modal-organization-hierarchy-kpi-detail.module';
import { ModalOrganizationHierarchyCriticalClientsModule } from '@app/modals/modal-organization-hierarchy-critical-clients/modal-organization-hierarchy-critical-clients.module';

const routes: Routes = [
  {
    path: '',
    component: OrganizationHierarchyReportComponent,
    canActivate: [OrgHierarchyReportGuard],
    data: { title: 'Relatório Organizacional' }
  }
];

@NgModule({
  declarations: [
    OrganizationHierarchyReportComponent,
    C4uOrgHierarchyTreeNodeComponent,
    C4uOrgHierarchyTreeTableComponent,
    C4uOrgHierarchyFlowchartComponent,
    C4uOrgHierarchyFlowchartNodeComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
    C4uDashboardNavigationModule,
    C4uSeletorMesModule,
    C4uCardModule,
    C4uShimmerModule,
    C4uInfoButtonModule,
    ModalOrganizationHierarchyKpiDetailModule,
    ModalOrganizationHierarchyCriticalClientsModule
  ]
})
export class OrganizationHierarchyReportModule {}
