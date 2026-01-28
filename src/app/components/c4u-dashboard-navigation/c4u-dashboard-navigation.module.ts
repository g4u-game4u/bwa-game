import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { C4uDashboardNavigationComponent } from './c4u-dashboard-navigation.component';

@NgModule({
  declarations: [
    C4uDashboardNavigationComponent
  ],
  imports: [
    CommonModule,
    RouterModule
  ],
  exports: [
    C4uDashboardNavigationComponent
  ]
})
export class C4uDashboardNavigationModule { }
