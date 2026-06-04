import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '@app/shared.module';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { ModalSeasonFaqComponent } from './modal-season-faq.component';

@NgModule({
  declarations: [ModalSeasonFaqComponent],
  exports: [ModalSeasonFaqComponent],
  imports: [
    CommonModule,
    SharedModule,
    C4uModalModule,
  ],
})
export class ModalSeasonFaqModule {}
