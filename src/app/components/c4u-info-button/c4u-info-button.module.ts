import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { C4uInfoButtonComponent } from './c4u-info-button.component';

@NgModule({
  declarations: [
    C4uInfoButtonComponent
  ],
  imports: [
    CommonModule,
    HttpClientModule
  ],
  exports: [
    C4uInfoButtonComponent
  ]
})
export class C4uInfoButtonModule { }

