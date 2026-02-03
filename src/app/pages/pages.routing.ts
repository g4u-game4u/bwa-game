import {Routes} from '@angular/router';
import { DashboardRedirectGuard } from '@guards/dashboard-redirect.guard';

export const PagesRoutes: Routes = [
  {
    path: '',
    loadChildren: () => import('./dashboard/gamification-dashboard/gamification-dashboard.module').then(m => m.GamificationDashboardModule),
    canActivate: [DashboardRedirectGuard]
  },
  {
    path: 'team-management',
    loadChildren: () => import('./dashboard/team-management-dashboard/team-management-dashboard.module').then(m => m.TeamManagementDashboardModule)
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
