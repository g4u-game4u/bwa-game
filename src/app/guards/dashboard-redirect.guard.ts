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
    const user = this.sessao.usuario;
    
    if (!user) {
      // User not authenticated, redirect to login
      await this.router.navigate(['/login']);
      return false;
    }

    const profile = this.userProfileService.getCurrentUserProfile();
    
    // Redirect based on profile
    if (profile === UserProfile.JOGADOR) {
      // JOGADOR goes to their own dashboard
      await this.router.navigate(['/dashboard']);
      return false; // Prevent access to root route
    } else {
      // SUPERVISOR, GESTOR, and DIRETOR go to team management dashboard
      await this.router.navigate(['/dashboard/team-management']);
      return false; // Prevent access to root route
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

