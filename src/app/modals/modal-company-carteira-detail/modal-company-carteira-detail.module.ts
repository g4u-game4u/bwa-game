import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalCompanyCarteiraDetailComponent } from './modal-company-carteira-detail.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { C4uKpiCircularProgressModule } from '@components/c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';
import { C4uGraficoBarrasModule } from '@components/c4u-grafico-barras/c4u-grafico-barras.module';

@NgModule({
  declarations: [ModalCompanyCarteiraDetailComponent],
  imports: [
    CommonModule,
    C4uModalModule,
    C4uKpiCircularProgressModule,
    C4uGraficoBarrasModule
  ],
  exports: [ModalCompanyCarteiraDetailComponent]
})
export class ModalCompanyCarteiraDetailModule {}

