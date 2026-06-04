import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '@app/shared.module';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { ModalTeamManagementFaqComponent } from './modal-team-management-faq.component';

@NgModule({
  declarations: [ModalTeamManagementFaqComponent],
  exports: [ModalTeamManagementFaqComponent],
  imports: [CommonModule, SharedModule, C4uModalModule],
})
export class ModalTeamManagementFaqModule {}
