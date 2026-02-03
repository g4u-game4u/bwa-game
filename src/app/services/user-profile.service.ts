import { Injectable } from '@angular/core';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfile, determineUserProfile, getUserOwnTeamId, getAccessibleTeamIds } from '@utils/user-profile';

/**
 * Service to manage user profile and permissions
 * 
 * Provides methods to:
 * - Get current user's profile
 * - Check if user can access team management
 * - Get user's accessible teams
 * - Get user's own team ID
 */
@Injectable({
  providedIn: 'root'
})
export class UserProfileService {
  constructor(private sessao: SessaoProvider) {}

  /**
   * Get current user's profile
   * 
   * @returns UserProfile enum value
   */
  getCurrentUserProfile(): UserProfile {
    const user = this.sessao.usuario;
    if (!user) {
      return UserProfile.JOGADOR;
    }
    return determineUserProfile(user.teams);
  }

  /**
   * Check if current user can access team management dashboard
   * 
   * @returns true if user is SUPERVISOR, GESTOR, or DIRETOR
   */
  canAccessTeamManagement(): boolean {
    const profile = this.getCurrentUserProfile();
    return profile !== UserProfile.JOGADOR;
  }

  /**
   * Get current user's own team ID (for SUPERVISOR and GESTOR)
   * 
   * @returns Team ID or null
   */
  getCurrentUserOwnTeamId(): string | null {
    const user = this.sessao.usuario;
    if (!user) {
      return null;
    }
    const profile = this.getCurrentUserProfile();
    return getUserOwnTeamId(user.teams, profile);
  }

  /**
   * Get all team IDs that current user can access
   * 
   * Returns:
   * - Empty array for JOGADOR (no access)
   * - Empty array for DIRETOR (all teams - indicates "all")
   * - Array with team IDs for SUPERVISOR and GESTOR
   * 
   * @returns Array of team IDs
   */
  getAccessibleTeamIds(): string[] {
    const user = this.sessao.usuario;
    if (!user) {
      return [];
    }
    const profile = this.getCurrentUserProfile();
    return getAccessibleTeamIds(user.teams, profile);
  }

  /**
   * Check if current user can see all teams (DIRETOR only)
   * 
   * @returns true if user is DIRETOR
   */
  canSeeAllTeams(): boolean {
    return this.getCurrentUserProfile() === UserProfile.DIRETOR;
  }

  /**
   * Check if current user can only see their own team (SUPERVISOR only)
   * 
   * @returns true if user is SUPERVISOR
   */
  canOnlySeeOwnTeam(): boolean {
    return this.getCurrentUserProfile() === UserProfile.SUPERVISOR;
  }

  /**
   * Check if current user is a JOGADOR
   * 
   * @returns true if user is JOGADOR
   */
  isJogador(): boolean {
    return this.getCurrentUserProfile() === UserProfile.JOGADOR;
  }

  /**
   * Check if current user is a SUPERVISOR
   * SUPERVISOR belongs to team Fkku5tB (SUPERVISÃO)
   * 
   * @returns true if user is SUPERVISOR
   */
  isSupervisor(): boolean {
    return this.getCurrentUserProfile() === UserProfile.SUPERVISOR;
  }

  /**
   * Check if current user is a GESTOR
   * GESTOR belongs to team FkgMSNO (GESTAO)
   * 
   * @returns true if user is GESTOR
   */
  isGestor(): boolean {
    return this.getCurrentUserProfile() === UserProfile.GESTOR;
  }

  /**
   * Check if current user is a DIRETOR
   * DIRETOR belongs to team Fkku7Gd (DIREÇÃO)
   * 
   * @returns true if user is DIRETOR
   */
  isDiretor(): boolean {
    return this.getCurrentUserProfile() === UserProfile.DIRETOR;
  }

  /**
   * Check if current user has a management profile
   * (SUPERVISOR, GESTOR, or DIRETOR)
   * 
   * @returns true if user is SUPERVISOR, GESTOR, or DIRETOR
   */
  isManagementUser(): boolean {
    return this.canAccessTeamManagement();
  }
}

