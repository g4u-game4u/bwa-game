import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalConfirmLogoutComponent } from './modal-confirm-logout.component';

@NgModule({
  declarations: [ModalConfirmLogoutComponent],
  imports: [CommonModule, NgbModule],
  exports: [ModalConfirmLogoutComponent]
})
export class ModalConfirmLogoutModule {}

