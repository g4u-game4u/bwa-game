import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalProgressListComponent } from './modal-progress-list.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';

@NgModule({
  declarations: [ModalProgressListComponent],
  imports: [CommonModule, C4uModalModule],
  exports: [ModalProgressListComponent]
})
export class ModalProgressListModule {}
