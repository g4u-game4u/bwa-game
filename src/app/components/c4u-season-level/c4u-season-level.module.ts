import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { C4uSeasonLevelComponent } from './c4u-season-level.component';
import { C4uInfoButtonModule } from '../c4u-info-button/c4u-info-button.module';

@NgModule({
  declarations: [C4uSeasonLevelComponent],
  imports: [CommonModule, C4uInfoButtonModule],
  exports: [C4uSeasonLevelComponent]
})
export class C4uSeasonLevelModule {}
