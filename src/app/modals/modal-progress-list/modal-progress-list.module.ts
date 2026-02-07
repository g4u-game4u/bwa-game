import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalProgressListComponent } from './modal-progress-list.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { C4uGraficoBarrasModule } from '@components/c4u-grafico-barras/c4u-grafico-barras.module';

@NgModule({
  declarations: [ModalProgressListComponent],
  imports: [
    CommonModule,
    C4uModalModule,
    C4uGraficoBarrasModule
  ],
  exports: [ModalProgressListComponent]
})
export class ModalProgressListModule {}
