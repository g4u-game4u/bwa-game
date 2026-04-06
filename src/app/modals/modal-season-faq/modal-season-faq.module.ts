import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '@app/shared.module';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { C4uAccordionModule } from '@components/c4u-accordion/c4u-accordion.module';
import { C4uAccordionItemModule } from '@components/c4u-accordion-item/c4u-accordion-item.module';
import { ModalSeasonFaqComponent } from './modal-season-faq.component';

@NgModule({
  declarations: [ModalSeasonFaqComponent],
  exports: [ModalSeasonFaqComponent],
  imports: [
    CommonModule,
    SharedModule,
    C4uModalModule,
    C4uAccordionModule,
    C4uAccordionItemModule,
  ],
})
export class ModalSeasonFaqModule {}
