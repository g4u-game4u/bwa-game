import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalOrganizationHierarchyCriticalClientsComponent } from './modal-organization-hierarchy-critical-clients.component';
import { C4uModalModule } from '@components/c4u-modal/c4u-modal.module';
import { SharedModule } from '@app/shared.module';

@NgModule({
  declarations: [ModalOrganizationHierarchyCriticalClientsComponent],
  imports: [CommonModule, SharedModule, C4uModalModule],
  exports: [ModalOrganizationHierarchyCriticalClientsComponent]
})
export class ModalOrganizationHierarchyCriticalClientsModule {}
