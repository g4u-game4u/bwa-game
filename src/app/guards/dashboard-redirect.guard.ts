import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfileService } from '@services/user-profile.service';
import { UserProfile } from '@utils/user-profile';

/**
 * Guard service to redirect users to the appropriate dashboard based on their profile
 * 
 * Redirects:
 * - JOGADOR → /dashboard (gamification dashboard), except session roles ADMIN / GESTOR → team management
 * - SUPERVISOR → /dashboard/supervisor
 * - GESTOR, DIRETOR → /dashboard/team-management (team management dashboard)
 */
@Injectable({
  providedIn: 'root'
})
export class DashboardRedirectGuardService {
  constructor(
    private sessao: SessaoProvider,
    private router: Router,
    private userProfileService: UserProfileService
  ) {}

  /**
   * CanActivate implementation for route guard
   * Redirects user to appropriate dashboard based on their profile
   */
  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    // First ensure user is authenticated
    let user = this.sessao.usuario;
    const token = this.sessao.token;
    
    // If we have a token but no user, wait a bit for the state to update
    // This can happen right after login when navigating
    if (!user && token) {
      // Wait up to 500ms for user state to be available
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        user = this.sessao.usuario;
        if (user) {
          break;
        }
      }
    }
    
    if (!user) {
      // User not authenticated, redirect to login
      await this.router.navigate(['/login']);
      return false;
    }

    const profile = this.userProfileService.getCurrentUserProfile();
    
    // Check current route to avoid infinite redirect loops
    const currentUrl = state.url;
    const isOnTeamManagement = currentUrl.startsWith('/dashboard/team-management');
    const isSupervisorUrl = currentUrl === '/dashboard/supervisor' || currentUrl.startsWith('/dashboard/supervisor/') || currentUrl.startsWith('/dashboard/supervisor?');
    const isSupervisorTecnicoUrl = currentUrl.startsWith('/dashboard/supervisor-tecnico');
    const isManagementUrl = isOnTeamManagement || isSupervisorUrl || isSupervisorTecnicoUrl;
    
    // Redirect based on profile
    switch (profile) {
      case UserProfile.JOGADOR:
        // Role ADMIN / GESTOR without gestor team codes: allow team-management (same as TeamRoleGuard)
        if (isManagementUrl && !this.userProfileService.canAccessTeamManagement()) {
          await this.router.navigate(['/dashboard']);
          return false;
        }
        if (!isManagementUrl && this.userProfileService.canAccessTeamManagement()) {
          await this.router.navigate(['/dashboard/team-management']);
          return false;
        }
        return true;

      case UserProfile.SUPERVISOR:
        // SUPERVISOR → supervisor dashboard (cards view)
        if (!isSupervisorUrl) {
          await this.router.navigate(['/dashboard/supervisor']);
          return false;
        }
        return true;

      case UserProfile.GESTOR:
      case UserProfile.DIRETOR:
        // GESTOR/DIRETOR → team management dashboard
        if (!isOnTeamManagement) {
          await this.router.navigate(['/dashboard/team-management']);
          return false;
        }
        return true;

      default:
        return true;
    }
  }
}

/**
 * Functional guard for use in route configuration
 * Usage: canActivate: [DashboardRedirectGuard]
 */
export const DashboardRedirectGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Promise<boolean> => {
  return inject(DashboardRedirectGuardService).canActivate(route, state);
};

