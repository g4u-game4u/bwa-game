import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalCarteiraComponent } from './modal-carteira.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { C4uKpiCircularProgressModule } from '@components/c4u-kpi-circular-progress/c4u-kpi-circular-progress.module';

@NgModule({
  declarations: [ModalCarteiraComponent],
  imports: [
    CommonModule, 
    C4uModalModule,
    C4uKpiCircularProgressModule
  ],
  exports: [ModalCarteiraComponent]
})
export class ModalCarteiraModule {}
