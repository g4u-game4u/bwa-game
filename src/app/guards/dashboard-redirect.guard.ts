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
 * - SUPERVISOR, GESTOR, DIRETOR → /dashboard/team-management (team management dashboard)
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
      console.warn('🛡️ DashboardRedirectGuard: No user found, redirecting to login');
      // User not authenticated, redirect to login
      await this.router.navigate(['/login']);
      return false;
    }

    const profile = this.userProfileService.getCurrentUserProfile();
    // Check current route to avoid infinite redirect loops
    const currentUrl = state.url;
    const isOnDashboard = currentUrl === '/dashboard' || currentUrl.startsWith('/dashboard/');
    const isOnTeamManagement = currentUrl.startsWith('/dashboard/team-management');
    const isOnDashboardRoot = currentUrl === '/dashboard' || currentUrl === '/dashboard/';
    // Redirect based on profile
    if (profile === UserProfile.JOGADOR) {
      // JOGADOR goes to their own dashboard
      if (isOnTeamManagement) {
        // JOGADOR is on team management, redirect to dashboard
        await this.router.navigate(['/dashboard']);
        return false;
      } else if (isOnDashboard && !isOnTeamManagement) {
        // JOGADOR is already on dashboard (but not team management), allow access
        return true;
      } else {
        // JOGADOR is somewhere else, redirect to dashboard
        await this.router.navigate(['/dashboard']);
        return false;
      }
    } else {
      // SUPERVISOR, GESTOR, and DIRETOR go to team management dashboard
      if (!isOnTeamManagement) {
        // Management user is not on team management, redirect
        const navigationResult = await this.router.navigate(['/dashboard/team-management']);
        return false;
      } else {
        // Management user is already on team management, allow access
        return true;
      }
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

