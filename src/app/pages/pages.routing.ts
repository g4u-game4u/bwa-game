import {Routes} from '@angular/router';
import {DashboardComponent} from './dashboard/dashboard.component';

export const PagesRoutes: Routes = [
  {
    path: '',
    component: DashboardComponent
  },
  {
    path: 'rewards',
    loadChildren: () => import('./recompensas/rewards.module').then(m => m.RewardsModule)
  },
  {
    path: 'thermometer',
    loadChildren: () => import('./thermometer/thermometer.module').then(m => m.ThermometerModule)
  },
  {
    path: 'ranking',
    loadChildren: () => import('./ranking/ranking.module').then(m => m.RankingModule)
  }
];
