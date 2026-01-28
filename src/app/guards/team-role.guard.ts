import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';

/**
 * Guard service to restrict access to team management dashboard
 * Only users with GESTOR team can access
 * 
 * Note: GESTOR is a team name in the player's profile, not a role.
 * The player profile from /v3/player/me/status contains a teams array,
 * and we check if any team has the name "GESTOR".
 */
@Injectable({
  providedIn: 'root'
})
export class TeamRoleGuardService {
  constructor(
    private sessao: SessaoProvider,
    private router: Router
  ) {}

  /**
   * Check if the current user has GESTOR team
   * @returns true if user has GESTOR team, false otherwise
   */
  hasGestaoRole(): boolean {
    const user = this.sessao.usuario;
    
    if (!user) {
      return false;
    }

    // Check if user has teams array
    if (!user.teams || !Array.isArray(user.teams)) {
      return false;
    }

    // Check if any team has the name "GESTOR"
    return user.teams.some((team: any) => 
      team && team.name && 
      (team.name.toUpperCase() === 'GESTOR' || team.name.toUpperCase() === 'GESTAO')
    );
  }

  /**
   * CanActivate implementation for route guard
   * Verifies user has GESTOR team before allowing access
   * Silently redirects to /dashboard if user doesn't have GESTOR team
   * 
   * Note: No error message is shown because this is used for automatic
   * routing decisions. Users without GESTOR team simply go to the regular
   * dashboard instead.
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

    // Check if user has GESTAO role
    if (this.hasGestaoRole()) {
      return true;
    }

    // User doesn't have GESTOR team - silently redirect to regular dashboard
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
