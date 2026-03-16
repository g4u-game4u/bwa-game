import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfileService } from '@services/user-profile.service';
import { UserProfile } from '@utils/user-profile';

/**
 * Guard service to redirect users to the appropriate dashboard based on their profile
 *
 * Redirects:
 * - JOGADOR → /dashboard (gamification dashboard)
 * - SUPERVISOR → /dashboard/supervisor (new supervisor dashboard)
 * - SUPERVISOR_TECNICO → /dashboard (regular player dashboard) or /dashboard/supervisor-tecnico (secondary)
 * - GESTOR → /dashboard/team-management (existing team management dashboard)
 * - DIRETOR → /dashboard/team-management (existing team management dashboard)
 * - Unauthenticated → /login
 * - JOGADOR accessing management URLs → /dashboard
 * - SUPERVISOR_TECNICO accessing /dashboard/supervisor or /dashboard/team-management → /dashboard
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
    const currentUrl = state.url;

    // Determine specific management URLs
    const isTeamManagementUrl = currentUrl.startsWith('/dashboard/team-management');
    const isSupervisorUrl = currentUrl === '/dashboard/supervisor' || currentUrl.startsWith('/dashboard/supervisor/') || currentUrl.startsWith('/dashboard/supervisor?');
    const isSupervisorTecnicoUrl = currentUrl.startsWith('/dashboard/supervisor-tecnico');

    // Management URLs that JOGADOR cannot access
    const isManagementUrl = isTeamManagementUrl || isSupervisorUrl || isSupervisorTecnicoUrl;

    // Route based on profile
    switch (profile) {
      case UserProfile.JOGADOR:
        if (isManagementUrl) {
          // Block JOGADOR from management dashboard URLs
          await this.router.navigate(['/dashboard']);
          return false;
        }
        // JOGADOR on regular dashboard — allow
        return true;

      case UserProfile.SUPERVISOR:
        // SUPERVISOR → new supervisor dashboard
        if (!isSupervisorUrl) {
          await this.router.navigate(['/dashboard/supervisor']);
          return false;
        }
        return true;

      case UserProfile.SUPERVISOR_TECNICO:
        // SUPERVISOR_TECNICO → regular player dashboard or their secondary dashboard
        if (isSupervisorTecnicoUrl) {
          // Allow access to their own secondary dashboard
          return true;
        }
        if (isTeamManagementUrl || isSupervisorUrl) {
          // Block from other management dashboards
          await this.router.navigate(['/dashboard']);
          return false;
        }
        return true;

      case UserProfile.GESTOR:
        // GESTOR → team management dashboard
        if (!currentUrl.startsWith('/dashboard/team-management')) {
          await this.router.navigate(['/dashboard/team-management']);
          return false;
        }
        return true;

      case UserProfile.DIRETOR:
        // DIRETOR → team management dashboard
        if (!currentUrl.startsWith('/dashboard/team-management')) {
          await this.router.navigate(['/dashboard/team-management']);
          return false;
        }
        return true;

      default:
        // Unknown profile, treat as JOGADOR
        await this.router.navigate(['/dashboard']);
        return false;
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




