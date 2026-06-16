import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalOrganizationHierarchyKpiDetailComponent } from './modal-organization-hierarchy-kpi-detail.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { C4uGraficoBarrasModule } from '@components/c4u-grafico-barras/c4u-grafico-barras.module';
import { C4uSpinnerModule } from '@components/c4u-spinner/c4u-spinner.module';
import { SharedModule } from '@app/shared.module';

@NgModule({
  declarations: [ModalOrganizationHierarchyKpiDetailComponent],
  imports: [CommonModule, SharedModule, C4uModalModule, C4uGraficoBarrasModule, C4uSpinnerModule],
  exports: [ModalOrganizationHierarchyKpiDetailComponent]
})
export class ModalOrganizationHierarchyKpiDetailModule {}

