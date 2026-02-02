import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { TeamRoleGuardService } from '@guards/team-role.guard';
import { ROLES_LIST } from '@utils/constants';
import { filter } from 'rxjs/operators';

interface DashboardOption {
  label: string;
  route: string;
  icon: string;
  requiresRole?: ROLES_LIST;
}

@Component({
  selector: 'c4u-dashboard-navigation',
  templateUrl: './c4u-dashboard-navigation.component.html',
  styleUrls: ['./c4u-dashboard-navigation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uDashboardNavigationComponent implements OnInit {
  private readonly LAST_DASHBOARD_KEY = 'lastVisitedDashboard';
  
  dashboards: DashboardOption[] = [
    {
      label: 'Meu Painel',
      route: '/dashboard',
      icon: 'ri-dashboard-line'
    },
    {
      label: 'Gestão de Equipe',
      route: '/dashboard/team-management',
      icon: 'ri-team-line',
      requiresRole: ROLES_LIST.ACCESS_TEAM_MANAGEMENT
    }
  ];
  
  currentDashboard: DashboardOption | null = null;
  availableDashboards: DashboardOption[] = [];
  hasGestaoRole = false;
  
  constructor(
    private router: Router,
    private sessaoProvider: SessaoProvider,
    private teamRoleGuard: TeamRoleGuardService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit(): void {
    this.checkUserRole();
    this.filterAvailableDashboards();
    this.detectCurrentDashboard();
    this.restoreLastVisitedDashboard();
    
    // Listen to route changes to update current dashboard
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.detectCurrentDashboard();
        this.cdr.markForCheck();
      });
  }
  
  /**
   * Check if user has GESTAO team access
   * Uses the same validation logic as TeamRoleGuard to ensure consistency
   * Validates if user has team "FkgMSNO" in the teams array (array of strings)
   */
  private checkUserRole(): void {
    const usuario = this.sessaoProvider.usuario;
    
    // Log team IDs for debugging
    if (usuario && usuario.teams && Array.isArray(usuario.teams)) {
      console.log('👤 User logged in - Team IDs:', usuario.teams);
      console.log('👤 User teams full data:', usuario.teams);
    } else {
      console.log('👤 User logged in - No teams found');
    }
    
    // Use the same validation logic from TeamRoleGuard
    // This ensures consistency between navigation visibility and route access
    this.hasGestaoRole = this.teamRoleGuard.hasGestaoRole();
  }
  
  /**
   * Filter dashboards based on user role
   */
  private filterAvailableDashboards(): void {
    this.availableDashboards = this.dashboards.filter(dashboard => {
      if (!dashboard.requiresRole) {
        return true; // Always show dashboards without role requirement
      }
      return this.hasGestaoRole;
    });
  }
  
  /**
   * Detect current dashboard based on route
   */
  private detectCurrentDashboard(): void {
    const currentUrl = this.router.url;
    
    // Find matching dashboard (check longest route first for better matching)
    const sortedDashboards = [...this.availableDashboards].sort(
      (a, b) => b.route.length - a.route.length
    );
    
    this.currentDashboard = sortedDashboards.find(dashboard => 
      currentUrl.startsWith(dashboard.route)
    ) || this.availableDashboards[0] || null;
  }
  
  /**
   * Navigate to selected dashboard
   */
  navigateToDashboard(dashboard: DashboardOption): void {
    if (dashboard.route === this.currentDashboard?.route) {
      return; // Already on this dashboard
    }
    
    this.router.navigate([dashboard.route]);
    this.saveLastVisitedDashboard(dashboard.route);
  }
  
  /**
   * Save last visited dashboard to session storage
   */
  private saveLastVisitedDashboard(route: string): void {
    try {
      sessionStorage.setItem(this.LAST_DASHBOARD_KEY, route);
    } catch (error) {
      console.warn('Failed to save last visited dashboard:', error);
    }
  }
  
  /**
   * Restore last visited dashboard from session storage
   * This is called on app initialization to navigate to the last visited dashboard
   */
  private restoreLastVisitedDashboard(): void {
    try {
      const lastDashboard = sessionStorage.getItem(this.LAST_DASHBOARD_KEY);
      
      // Only restore if we're on the default dashboard route and have a saved preference
      if (lastDashboard && this.router.url === '/dashboard') {
        const dashboard = this.availableDashboards.find(d => d.route === lastDashboard);
        
        // Only navigate if the dashboard is available to the user
        if (dashboard) {
          this.router.navigate([lastDashboard]);
        }
      }
    } catch (error) {
      console.warn('Failed to restore last visited dashboard:', error);
    }
  }
  
  /**
   * Check if there are multiple dashboards available
   */
  get hasMultipleDashboards(): boolean {
    return this.availableDashboards.length > 1;
  }
  
  /**
   * Get current dashboard name for display
   */
  get currentDashboardName(): string {
    return this.currentDashboard?.label || 'Painel';
  }
}
