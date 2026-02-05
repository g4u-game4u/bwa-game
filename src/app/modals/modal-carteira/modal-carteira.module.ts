import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalCarteiraComponent } from './modal-carteira.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';

@NgModule({
  declarations: [ModalCarteiraComponent],
  imports: [CommonModule, C4uModalModule],
  exports: [ModalCarteiraComponent]
})
export class ModalCarteiraModule {}
