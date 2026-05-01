import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfileService } from '@services/user-profile.service';

/**
 * Guard service to restrict access to team management dashboard
 * Users can access when they have session roles ADMIN or GESTOR (ROLES_LIST), or management profiles:
 * - SUPERVISOR (Fkmdmko - SUPERVISÃO)
 * - GESTOR (FkmdnFU - GESTAO)
 * - DIRETOR (FkmdhZ9 - DIREÇÃO)
 * 
 * JOGADOR users are redirected to their own dashboard.
 */
@Injectable({
  providedIn: 'root'
})
export class TeamRoleGuardService {
  constructor(
    private sessao: SessaoProvider,
    private router: Router,
    private userProfileService: UserProfileService
  ) {}

  /**
   * Check if the current user has access to team management dashboard
   * @returns true if user may access team management (see UserProfileService.canAccessTeamManagement)
   */
  hasGestaoRole(): boolean {
    return this.userProfileService.canAccessTeamManagement();
  }

  /**
   * CanActivate implementation for route guard
   * Verifies user has management profile (SUPERVISOR, GESTOR, or DIRETOR) before allowing access
   * Silently redirects to /dashboard if user is JOGADOR
   * 
   * Note: No error message is shown because this is used for automatic
   * routing decisions. JOGADOR users simply go to the regular dashboard instead.
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

    // Check if user has management profile (SUPERVISOR, GESTOR, or DIRETOR)
    if (this.hasGestaoRole()) {
      return true;
    }

    // User is JOGADOR - silently redirect to regular dashboard
    // No error message needed as this is a normal routing decision
    await this.router.navigate(['/dashboard']);
    return false;
  }
}

/**
 * Functional guard for use in route configuration
 * Usage: canActivate: [TeamRoleGuard]
 */
export const TeamRoleGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Promise<boolean> => {
  return inject(TeamRoleGuardService).canActivate(route, state);
};
