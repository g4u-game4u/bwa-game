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
    path: 'organization-hierarchy',
    loadChildren: () =>
      import('./dashboard/organization-hierarchy-report/organization-hierarchy-report.module').then(
        m => m.OrganizationHierarchyReportModule
      )
  },
  {
    path: 'admin/pipeline-integration-changes',
    loadChildren: () =>
      import('./admin/pipeline-integration-changes/pipeline-integration-changes.module').then(
        m => m.PipelineIntegrationChangesModule
      )
  },
  {
    path: 'supervisor',
    loadChildren: () => import('./dashboard/dashboard-supervisor/dashboard-supervisor.module')
      .then(m => m.DashboardSupervisorModule),
    canActivate: [DashboardRedirectGuard]
  },
  {
    path: 'supervisor-tecnico',
    loadChildren: () => import('./dashboard/dashboard-supervisor-tecnico/dashboard-supervisor-tecnico.module')
      .then(m => m.DashboardSupervisorTecnicoModule),
    canActivate: [DashboardRedirectGuard]
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
