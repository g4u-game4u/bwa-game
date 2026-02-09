/**
 * User Profile Types
 * 
 * Defines the 4 user profile types and their access levels:
 * - JOGADOR: Can only see their own dashboard
 * - SUPERVISOR: Can see team-management dashboard, but only their own team
 * - GESTOR: Can see team-management dashboard, can see multiple teams in their management
 * - DIRETOR: Can see team-management dashboard, has admin view and can see all teams
 */
export enum UserProfile {
  JOGADOR = 'JOGADOR',
  SUPERVISOR = 'SUPERVISOR',
  GESTOR = 'GESTOR',
  DIRETOR = 'DIRETOR'
}

/**
 * Team IDs that correspond to management roles
 */
export const MANAGEMENT_TEAM_IDS = {
  GESTAO: 'FkmdnFU',
  SUPERVISAO: 'Fkmdmko',
  DIRECAO: 'FkmdhZ9'
} as const;

/**
 * Determine user profile based on team membership
 * 
 * Priority order (highest to lowest):
 * 1. DIRETOR - Has DIREÇÃO team (FkmdhZ9)
 * 2. GESTOR - Has GESTAO team (FkmdnFU)
 * 3. SUPERVISOR - Has SUPERVISÃO team (Fkmdmko)
 * 4. JOGADOR - No management teams
 * 
 * @param teams - User's teams array (can be strings or objects with _id)
 * @returns UserProfile enum value
 */
export function determineUserProfile(teams: any[] | undefined | null): UserProfile {
  if (!teams || !Array.isArray(teams) || teams.length === 0) {
    return UserProfile.JOGADOR;
  }

  // Extract team IDs from teams array (handles both string and object formats)
  const teamIds = teams.map((team: any) => {
    if (typeof team === 'string') {
      return team;
    } else if (team && typeof team === 'object' && team._id) {
      return team._id;
    }
    return null;
  }).filter(Boolean) as string[];

  // Check in priority order (highest to lowest)
  if (teamIds.includes(MANAGEMENT_TEAM_IDS.DIRECAO)) {
    return UserProfile.DIRETOR;
  }
  
  if (teamIds.includes(MANAGEMENT_TEAM_IDS.GESTAO)) {
    return UserProfile.GESTOR;
  }
  
  if (teamIds.includes(MANAGEMENT_TEAM_IDS.SUPERVISAO)) {
    return UserProfile.SUPERVISOR;
  }

  return UserProfile.JOGADOR;
}

/**
 * Get the user's own team ID based on their profile
 * 
 * @param teams - User's teams array
 * @param profile - User's profile
 * @returns The team ID that the user belongs to (for supervisor/gestor) or null
 */
export function getUserOwnTeamId(teams: any[] | undefined | null, profile: UserProfile): string | null {
  if (profile === UserProfile.JOGADOR || profile === UserProfile.DIRETOR) {
    return null; // Jogador doesn't have a management team, Diretor can see all
  }

  if (!teams || !Array.isArray(teams)) {
    return null;
  }

  // Extract team IDs
  const teamIds = teams.map((team: any) => {
    if (typeof team === 'string') {
      return team;
    } else if (team && typeof team === 'object' && team._id) {
      return team._id;
    }
    return null;
  }).filter(Boolean) as string[];

  // For SUPERVISOR, return their SUPERVISÃO team
  if (profile === UserProfile.SUPERVISOR) {
    return teamIds.find(id => id === MANAGEMENT_TEAM_IDS.SUPERVISAO) || null;
  }

  // For GESTOR, return their GESTAO team
  if (profile === UserProfile.GESTOR) {
    return teamIds.find(id => id === MANAGEMENT_TEAM_IDS.GESTAO) || null;
  }

  return null;
}

/**
 * Get all management team IDs that a user has access to
 * 
 * @param teams - User's teams array
 * @param profile - User's profile
 * @returns Array of team IDs the user can access
 */
export function getAccessibleTeamIds(teams: any[] | undefined | null, profile: UserProfile): string[] {
  if (profile === UserProfile.JOGADOR) {
    return [];
  }

  if (profile === UserProfile.DIRETOR) {
    // Diretor can see all teams - return empty array to indicate "all"
    return [];
  }

  if (!teams || !Array.isArray(teams)) {
    return [];
  }

  // Extract team IDs
  const teamIds = teams.map((team: any) => {
    if (typeof team === 'string') {
      return team;
    } else if (team && typeof team === 'object' && team._id) {
      return team._id;
    }
    return null;
  }).filter(Boolean) as string[];

  console.log('👤 getAccessibleTeamIds: extracted teamIds:', teamIds, 'for profile:', profile);

  if (profile === UserProfile.SUPERVISOR) {
    // Supervisor can see their managed team (the non-SUPERVISAO team)
    // They have 2 teams: SUPERVISAO team + the team they manage
    const managedTeams = teamIds.filter(id => id !== MANAGEMENT_TEAM_IDS.SUPERVISAO);
    console.log('👤 SUPERVISOR: managedTeams:', managedTeams);
    return managedTeams.length > 0 ? managedTeams : [];
  }

  if (profile === UserProfile.GESTOR) {
    // Gestor can see ALL their teams EXCEPT the GESTAO team itself
    // They have multiple teams: GESTAO team + all teams they manage
    const managedTeams = teamIds.filter(id => id !== MANAGEMENT_TEAM_IDS.GESTAO);
    console.log('👤 GESTOR: managedTeams:', managedTeams);
    return managedTeams;
  }

  return [];
}

