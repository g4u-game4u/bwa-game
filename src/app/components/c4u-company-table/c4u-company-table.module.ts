import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { C4uCompanyTableComponent } from './c4u-company-table.component';

@NgModule({
  declarations: [C4uCompanyTableComponent],
  imports: [CommonModule, ScrollingModule],
  exports: [C4uCompanyTableComponent]
})
export class C4uCompanyTableModule {}
