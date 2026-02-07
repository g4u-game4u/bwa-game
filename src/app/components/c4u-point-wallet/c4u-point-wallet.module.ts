import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uPointWalletComponent } from './c4u-point-wallet.component';
import { C4uInfoButtonModule } from '../c4u-info-button/c4u-info-button.module';

@NgModule({
  declarations: [C4uPointWalletComponent],
  imports: [
    CommonModule,
    C4uInfoButtonModule
  ],
  exports: [C4uPointWalletComponent]
})
export class C4uPointWalletModule {}
