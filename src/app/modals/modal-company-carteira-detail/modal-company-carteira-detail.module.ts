import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalCompanyCarteiraDetailComponent } from './modal-company-carteira-detail.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { C4uKpiCircularProgressModule } from '@components/c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';

@NgModule({
  declarations: [ModalCompanyCarteiraDetailComponent],
  imports: [
    CommonModule,
    C4uModalModule,
    C4uKpiCircularProgressModule
  ],
  exports: [ModalCompanyCarteiraDetailComponent]
})
export class ModalCompanyCarteiraDetailModule {}

