import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ProfileComponent } from './profile.component';
import { SharedModule } from '../../shared.module';
import { C4uCardModule } from '../../components/c4u-card/c4u-card.module';

const routes: Routes = [{ path: '', component: ProfileComponent }];

@NgModule({
  declarations: [ProfileComponent],
  imports: [
    CommonModule,
    SharedModule,
    TranslateModule,
    C4uCardModule,
    RouterModule.forChild(routes),
  ],
})
export class ProfileModule {}
