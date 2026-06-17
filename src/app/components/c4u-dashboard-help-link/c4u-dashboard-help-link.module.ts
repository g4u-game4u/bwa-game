import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { C4uDashboardHelpLinkComponent } from './c4u-dashboard-help-link.component';

@NgModule({
  declarations: [C4uDashboardHelpLinkComponent],
  imports: [CommonModule, RouterModule],
  exports: [C4uDashboardHelpLinkComponent],
})
export class C4uDashboardHelpLinkModule {}
