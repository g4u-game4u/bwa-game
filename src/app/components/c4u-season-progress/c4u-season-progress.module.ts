import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uSeasonProgressComponent } from './c4u-season-progress.component';
import { C4uInfoButtonModule } from '../c4u-info-button/c4u-info-button.module';

@NgModule({
  declarations: [C4uSeasonProgressComponent],
  imports: [
    CommonModule,
    C4uInfoButtonModule
  ],
  exports: [C4uSeasonProgressComponent]
})
export class C4uSeasonProgressModule {}
