import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfileService } from '@services/user-profile.service';
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
    },
    {
      label: 'Dashboard de Equipe',
      route: '/dashboard/supervisor-tecnico',
      icon: 'ri-group-line'
    }
  ];
  
  currentDashboard: DashboardOption | null = null;
  availableDashboards: DashboardOption[] = [];
  hasGestaoRole = false;
  
  constructor(
    private router: Router,
    private sessaoProvider: SessaoProvider,
    private userProfileService: UserProfileService,
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
   * Check if user has management profile (SUPERVISOR, GESTOR, or DIRETOR)
   * Uses UserProfileService to determine access
   */
  private checkUserRole(): void {
    const usuario = this.sessaoProvider.usuario;
    const profile = this.userProfileService.getCurrentUserProfile();
    
    // Log profile for debugging
    if (usuario && usuario.teams && Array.isArray(usuario.teams)) {
                } else {
          }
    
    // Check if user can access team management (not JOGADOR)
    this.hasGestaoRole = this.userProfileService.canAccessTeamManagement();
  }
  
  /**
   * Filter dashboards based on user role
   * - "Meu Painel" is available for JOGADOR and SUPERVISOR_TECNICO profiles
   * - "Gestão de Equipe" is only available for management profiles (SUPERVISOR, GESTOR, DIRETOR)
   * - "Dashboard de Equipe" is only available for SUPERVISOR_TECNICO
   */
  private filterAvailableDashboards(): void {
    const userProfile = this.userProfileService.getCurrentUserProfile();
    const isJogador = this.userProfileService.isJogador();
    const isSupervisorTecnico = this.userProfileService.isSupervisorTecnico();
    
    this.availableDashboards = this.dashboards.filter(dashboard => {
      // "Meu Painel" should be shown to JOGADOR and SUPERVISOR_TECNICO
      if (dashboard.route === '/dashboard' && dashboard.label === 'Meu Painel') {
        return isJogador || isSupervisorTecnico;
      }
      
      // "Dashboard de Equipe" should only be shown to SUPERVISOR_TECNICO
      if (dashboard.route === '/dashboard/supervisor-tecnico') {
        return isSupervisorTecnico;
      }
      
      // Dashboards with role requirement (e.g., "Gestão de Equipe")
      if (dashboard.requiresRole) {
        return this.hasGestaoRole && !isSupervisorTecnico;
      }
      
      // Other dashboards without specific requirements
      return true;
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

