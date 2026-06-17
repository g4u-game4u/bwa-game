import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { SharedModule } from '../../shared.module';
import { HelpCenterComponent } from './help-center.component';
import { HelpCenterHomeComponent } from './help-center-home/help-center-home.component';
import { HelpCenterModulePageComponent } from './help-center-module-page/help-center-module-page.component';
import { HelpCenterSearchComponent } from './help-center-search/help-center-search.component';
import { HelpCenterBreadcrumbComponent } from './help-center-breadcrumb/help-center-breadcrumb.component';

const routes = [
  {
    path: '',
    component: HelpCenterComponent,
    children: [
      { path: '', component: HelpCenterHomeComponent },
      { path: ':moduleSlug', component: HelpCenterModulePageComponent },
    ],
  },
];

@NgModule({
  declarations: [
    HelpCenterComponent,
    HelpCenterHomeComponent,
    HelpCenterModulePageComponent,
    HelpCenterSearchComponent,
    HelpCenterBreadcrumbComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    TranslateModule,
    RouterModule.forChild(routes),
  ],
})
export class HelpCenterModule {}
