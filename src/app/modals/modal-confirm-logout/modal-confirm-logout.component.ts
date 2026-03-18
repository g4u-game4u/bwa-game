import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'modal-confirm-logout',
  templateUrl: './modal-confirm-logout.component.html',
  styleUrls: ['./modal-confirm-logout.component.scss']
})
export class ModalConfirmLogoutComponent {
  @Input() title: string = 'Sair do sistema';
  @Input() message: string = 'Tem certeza que deseja sair do sistema?';
  @Input() confirmLabel: string = 'Desconectar';

  constructor(public activeModal: NgbActiveModal) {}

  confirm(): void {
    this.activeModal.close({ confirmed: true });
  }

  cancel(): void {
    this.activeModal.dismiss({ confirmed: false });
  }
}

