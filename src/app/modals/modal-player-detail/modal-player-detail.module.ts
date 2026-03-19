import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalPlayerDetailComponent } from './modal-player-detail.component';
import { SharedModule } from '@app/shared.module';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { C4uSpinnerModule } from '@components/c4u-spinner/c4u-spinner.module';

@NgModule({
  declarations: [ModalPlayerDetailComponent],
  imports: [
    CommonModule,
    SharedModule,
    C4uModalModule,
    C4uSpinnerModule
  ],
  exports: [ModalPlayerDetailComponent]
})
export class ModalPlayerDetailModule {}
