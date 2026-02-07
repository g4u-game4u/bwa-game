import { Component, Input } from '@angular/core';
import { PointWallet } from '@model/gamification-dashboard.model';

@Component({
  selector: 'c4u-point-wallet',
  templateUrl: './c4u-point-wallet.component.html',
  styleUrls: ['./c4u-point-wallet.component.scss']
})
export class C4uPointWalletComponent {
  @Input() points: PointWallet = {
    bloqueados: 0,
    desbloqueados: 0,
    moedas: 0
  };
  
  @Input() mediaPontos?: number;
}
