/**
 * User Profile Types
 * 
 * Defines user profile types and their access levels:
 * - JOGADOR: Can only see their own dashboard
 * - LIDER_CELULA: Team-management com visão consolidada da célula (sub-equipe)
 * - SUPERVISOR: Can see team-management dashboard, but only their own team
 * - GESTOR: Can see team-management dashboard, can see multiple teams in their management
 * - DIRETOR: Can see team-management dashboard, has admin view and can see all teams
 */
export enum UserProfile {
  JOGADOR = 'JOGADOR',
  LIDER_CELULA = 'LIDER_CELULA',
  SUPERVISOR = 'SUPERVISOR',
  GESTOR = 'GESTOR',
  DIRETOR = 'DIRETOR'
}

/**
 * Import TeamCodes interface from team-code.service
 */
import { TeamCodes } from '../services/team-code.service';

/**
 * Team IDs that correspond to management roles
 * @deprecated Use TeamCodeService.getTeamCodes() instead for configurable team codes
 */
export const MANAGEMENT_TEAM_IDS = {
  GESTAO: 'FkmdnFU',
  SUPERVISAO: 'Fkmdmko',
  DIRECAO: 'FkmdhZ9'
} as const;

/**
 * Default team codes used when no custom codes are provided.
 * These match the values in MANAGEMENT_TEAM_IDS for backward compatibility.
 */
const DEFAULT_TEAM_CODES: TeamCodes = {
  supervisor: 'Fkmdmko',
  gestor: 'FkmdnFU',
  diretor: 'FkmdhZ9'
};

/**
 * Helper function to extract team IDs from teams array
 * Handles both string and object formats
 * 
 * @param teams - User's teams array (can be strings or objects with _id)
 * @returns Array of team ID strings
 */
function extractTeamIds(teams: any[] | undefined | null): string[] {
  if (!teams || !Array.isArray(teams) || teams.length === 0) {
    return [];
  }

  return teams.map((team: any) => {
    if (typeof team === 'string') {
      return team;
    } else if (team && typeof team === 'object' && team._id) {
      return team._id;
    }
    return null;
  }).filter(Boolean) as string[];
}

function normalizeIdListToStrings(value: unknown): string[] {
  if (value == null || !Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' || typeof item === 'number') {
      const s = String(item).trim();
      if (s !== '') {
        out.push(s);
      }
    } else if (item && typeof item === 'object' && '_id' in (item as object)) {
      const id = (item as { _id?: unknown })._id;
      if (id != null) {
        const s = String(id).trim();
        if (s !== '') {
          out.push(s);
        }
      }
    }
  }
  return out;
}

/**
 * Team IDs where the user is an observer (BWA `Team.observers`), as returned on `/auth/user`.
 * Supports snake_case / camelCase and `extra.*` for Funifier-style payloads.
 */
export function extractObserverTeamIdsFromSessionUser(user: unknown): string[] {
  if (!user || typeof user !== 'object') {
    return [];
  }
  const u = user as Record<string, unknown>;
  const extra = u['extra'];
  const extraObj = extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : null;
  const buckets: unknown[] = [
    u['observer_teams'],
    u['observerTeams'],
    u['observer_team_ids'],
    u['observerTeamIds'],
    u['observing_teams'],
    u['observingTeams'],
    extraObj?.['observer_teams'],
    extraObj?.['observerTeams'],
    extraObj?.['observer_team_ids']
  ];
  const ids = new Set<string>();
  for (const b of buckets) {
    for (const id of normalizeIdListToStrings(b)) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Determine user profile based on team membership
 * 
 * Priority order (highest to lowest):
 * 1. DIRETOR - Has DIREÇÃO team
 * 2. GESTOR - Has GESTAO team
 * 3. SUPERVISOR - Has SUPERVISÃO team
 * 4. JOGADOR - No management teams
 * 
 * @param teams - User's teams array (can be strings or objects with _id)
 * @param teamCodes - Optional team codes configuration. If not provided, uses default values.
 * @returns UserProfile enum value
 */
export function determineUserProfile(
  teams: any[] | undefined | null,
  teamCodes?: TeamCodes
): UserProfile {
  const codes = teamCodes || DEFAULT_TEAM_CODES;
  const teamIds = extractTeamIds(teams);

  if (teamIds.length === 0) {
    return UserProfile.JOGADOR;
  }

  // Check in priority order (highest to lowest)
  if (teamIds.includes(codes.diretor)) {
    return UserProfile.DIRETOR;
  }
  
  if (teamIds.includes(codes.gestor)) {
    return UserProfile.GESTOR;
  }
  
  if (teamIds.includes(codes.supervisor)) {
    return UserProfile.SUPERVISOR;
  }

  return UserProfile.JOGADOR;
}

/**
 * Get the user's own team ID based on their profile
 * 
 * @param teams - User's teams array
 * @param profile - User's profile
 * @param teamCodes - Optional team codes configuration. If not provided, uses default values.
 * @returns The team ID that the user belongs to (for supervisor/gestor) or null
 */
export function getUserOwnTeamId(
  teams: any[] | undefined | null,
  profile: UserProfile,
  teamCodes?: TeamCodes
): string | null {
  if (
    profile === UserProfile.JOGADOR ||
    profile === UserProfile.DIRETOR ||
    profile === UserProfile.LIDER_CELULA
  ) {
    return null; // Jogador / líder de célula: escopo via equipas da sessão; Diretor vê tudo
  }

  const codes = teamCodes || DEFAULT_TEAM_CODES;
  const teamIds = extractTeamIds(teams);

  if (teamIds.length === 0) {
    return null;
  }

  // For SUPERVISOR, return their SUPERVISÃO team
  if (profile === UserProfile.SUPERVISOR) {
    return teamIds.find(id => id === codes.supervisor) || null;
  }

  // For GESTOR, return their GESTAO team
  if (profile === UserProfile.GESTOR) {
    return teamIds.find(id => id === codes.gestor) || null;
  }

  return null;
}

/**
 * Get all management team IDs that a user has access to
 * 
 * @param teams - User's teams array
 * @param profile - User's profile
 * @param teamCodes - Optional team codes configuration. If not provided, uses default values.
 * @returns Array of team IDs the user can access
 */
export function getAccessibleTeamIds(
  teams: any[] | undefined | null,
  profile: UserProfile,
  teamCodes?: TeamCodes
): string[] {
  if (profile === UserProfile.JOGADOR) {
    return [];
  }

  if (profile === UserProfile.DIRETOR) {
    // Diretor can see all teams - return empty array to indicate "all"
    return [];
  }

  const codes = teamCodes || DEFAULT_TEAM_CODES;
  const teamIds = extractTeamIds(teams);

  if (teamIds.length === 0) {
    return [];
  }

  console.log('👤 getAccessibleTeamIds: extracted teamIds:', teamIds, 'for profile:', profile);

  if (profile === UserProfile.SUPERVISOR) {
    // Supervisor can see their managed team (the non-SUPERVISAO team)
    // They have 2 teams: SUPERVISAO team + the team they manage
    const managedTeams = teamIds.filter(id => id !== codes.supervisor);
    console.log('👤 SUPERVISOR: managedTeams:', managedTeams);
    return managedTeams.length > 0 ? managedTeams : [];
  }

  if (profile === UserProfile.LIDER_CELULA) {
    // Líder de célula: time-pai + célula na sessão — o painel filtra para a célula (líder/observer).
    const cellScope = teamIds.filter(
      id => id !== codes.supervisor && id !== codes.gestor && id !== codes.diretor
    );
    console.log('👤 LIDER_CELULA: team scope (sessão):', cellScope);
    return cellScope;
  }

  if (profile === UserProfile.GESTOR) {
    // Gestor can see ALL their teams EXCEPT the GESTAO team itself
    // They have multiple teams: GESTAO team + all teams they manage
    const managedTeams = teamIds.filter(id => id !== codes.gestor);
    console.log('👤 GESTOR: managedTeams:', managedTeams);
    return managedTeams;
  }

  return [];
}
