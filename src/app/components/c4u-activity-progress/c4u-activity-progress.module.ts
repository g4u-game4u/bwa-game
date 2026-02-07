import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uActivityProgressComponent } from './c4u-activity-progress.component';
import { C4uInfoButtonModule } from '@components/c4u-info-button/c4u-info-button.module';

@NgModule({
  declarations: [C4uActivityProgressComponent],
  imports: [CommonModule, C4uInfoButtonModule],
  exports: [C4uActivityProgressComponent]
})
export class C4uActivityProgressModule { }
