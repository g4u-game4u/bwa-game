import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';

/**
 * Guard service to restrict access to team management dashboard
 * Only users with GESTOR team (ID: FkgMSNO) can access
 * 
 * Note: GESTOR is determined by team membership, not a role.
 * The player profile from /v3/player/me/status contains a teams array,
 * and we check if any team has the ID "FkgMSNO" (GESTAO team).
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
   * @returns true if user has GESTOR team (FkgMSNO), false otherwise
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

    // Log team IDs for debugging
    console.log('🔒 TeamRoleGuard: User team IDs:', user.teams);
    console.log('🔒 TeamRoleGuard: User teams full data:', user.teams);

    // Check if teams array contains "FkgMSNO" (GESTAO team ID)
    // Teams array is an array of strings from /status endpoint: ["FkgMSNO"]
    // Support both formats: array of strings or array of objects
    const hasGestaoTeam = (user.teams as any[]).some((team: any) => {
      // If team is a string, check directly
      if (typeof team === 'string') {
        return team === 'FkgMSNO';
      }
      // If team is an object, check _id property
      if (team && typeof team === 'object') {
        return team._id === 'FkgMSNO';
      }
      return false;
    });
    
    console.log('🔒 TeamRoleGuard: Has GESTAO team (FkgMSNO):', hasGestaoTeam);
    
    return hasGestaoTeam;
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

    // Check if user has GESTAO role (team ID: FkgMSNO)
    if (this.hasGestaoRole()) {
      return true;
    }

    // User doesn't have GESTOR team (FkgMSNO) - silently redirect to regular dashboard
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
