import {
  UserProfile,
  MANAGEMENT_TEAM_IDS,
  determineUserProfile,
  getUserOwnTeamId,
  getAccessibleTeamIds
} from './user-profile';
import { TeamCodes } from '../services/team-code.service';

/**
 * Unit tests for user-profile.ts utility functions
 * 
 * Tests cover:
 * - determineUserProfile() with default and custom team codes
 * - getUserOwnTeamId() with default and custom team codes
 * - getAccessibleTeamIds() with default and custom team codes
 * - Edge cases: null/undefined teams, empty arrays, mixed team formats
 * - Profile determination priority: DIRETOR > GESTOR > SUPERVISOR > JOGADOR
 * - Team access filtering for SUPERVISOR and GESTOR profiles
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3
 */
describe('User Profile Utility', () => {
  // Default team codes (matching MANAGEMENT_TEAM_IDS)
  const DEFAULT_CODES: TeamCodes = {
    supervisor: 'Fkmdmko',
    gestor: 'FkmdnFU',
    diretor: 'FkmdhZ9'
  };

  // Custom team codes for testing configurable behavior
  const CUSTOM_CODES: TeamCodes = {
    supervisor: 'CUSTOM_SUP',
    gestor: 'CUSTOM_GES',
    diretor: 'CUSTOM_DIR'
  };

  describe('UserProfile Enum', () => {
    it('should have JOGADOR profile', () => {
      expect(UserProfile.JOGADOR).toBe('JOGADOR');
    });

    it('should have SUPERVISOR profile', () => {
      expect(UserProfile.SUPERVISOR).toBe('SUPERVISOR');
    });

    it('should have GESTOR profile', () => {
      expect(UserProfile.GESTOR).toBe('GESTOR');
    });

    it('should have DIRETOR profile', () => {
      expect(UserProfile.DIRETOR).toBe('DIRETOR');
    });
  });

  describe('MANAGEMENT_TEAM_IDS Constant', () => {
    it('should have GESTAO team ID', () => {
      expect(MANAGEMENT_TEAM_IDS.GESTAO).toBe('FkmdnFU');
    });

    it('should have SUPERVISAO team ID', () => {
      expect(MANAGEMENT_TEAM_IDS.SUPERVISAO).toBe('Fkmdmko');
    });

    it('should have DIRECAO team ID', () => {
      expect(MANAGEMENT_TEAM_IDS.DIRECAO).toBe('FkmdhZ9');
    });
  });

  describe('determineUserProfile() - Backward Compatibility (No teamCodes parameter)', () => {
    it('should return JOGADOR for null teams', () => {
      expect(determineUserProfile(null)).toBe(UserProfile.JOGADOR);
    });

    it('should return JOGADOR for undefined teams', () => {
      expect(determineUserProfile(undefined)).toBe(UserProfile.JOGADOR);
    });

    it('should return JOGADOR for empty array', () => {
      expect(determineUserProfile([])).toBe(UserProfile.JOGADOR);
    });

    it('should return JOGADOR for teams without management codes', () => {
      expect(determineUserProfile(['team1', 'team2'])).toBe(UserProfile.JOGADOR);
    });

    it('should return SUPERVISOR for user with default supervisor team code', () => {
      expect(determineUserProfile([DEFAULT_CODES.supervisor])).toBe(UserProfile.SUPERVISOR);
    });

    it('should return GESTOR for user with default gestor team code', () => {
      expect(determineUserProfile([DEFAULT_CODES.gestor])).toBe(UserProfile.GESTOR);
    });

    it('should return DIRETOR for user with default diretor team code', () => {
      expect(determineUserProfile([DEFAULT_CODES.diretor])).toBe(UserProfile.DIRETOR);
    });
  });

  describe('determineUserProfile() - role GESTOR', () => {
    it('should return GESTOR when roles include GESTOR and user has a non-meta team', () => {
      expect(
        determineUserProfile(['operational-team-1'], DEFAULT_CODES, ['GESTOR', 'ACCESS_PLAYER_PANEL'])
      ).toBe(UserProfile.GESTOR);
    });

    it('should return GESTOR for role GESTOR when API envia times vazios (GET /auth/user)', () => {
      expect(determineUserProfile([], DEFAULT_CODES, ['GESTOR'])).toBe(UserProfile.GESTOR);
    });
  });

  describe('determineUserProfile() - Custom Team Codes', () => {
    it('should return JOGADOR when teams do not contain custom codes', () => {
      expect(determineUserProfile(['team1', 'team2'], CUSTOM_CODES)).toBe(UserProfile.JOGADOR);
    });

    it('should return SUPERVISOR for user with custom supervisor team code', () => {
      expect(determineUserProfile([CUSTOM_CODES.supervisor], CUSTOM_CODES)).toBe(UserProfile.SUPERVISOR);
    });

    it('should return GESTOR for user with custom gestor team code', () => {
      expect(determineUserProfile([CUSTOM_CODES.gestor], CUSTOM_CODES)).toBe(UserProfile.GESTOR);
    });

    it('should return DIRETOR for user with custom diretor team code', () => {
      expect(determineUserProfile([CUSTOM_CODES.diretor], CUSTOM_CODES)).toBe(UserProfile.DIRETOR);
    });

    it('should NOT recognize default codes when custom codes are provided', () => {
      // User has default supervisor code, but custom codes are provided
      expect(determineUserProfile([DEFAULT_CODES.supervisor], CUSTOM_CODES)).toBe(UserProfile.JOGADOR);
    });

    it('should recognize custom codes mixed with other teams', () => {
      expect(determineUserProfile(['team1', CUSTOM_CODES.gestor, 'team2'], CUSTOM_CODES)).toBe(UserProfile.GESTOR);
    });
  });

  describe('determineUserProfile() - Profile Priority (DIRETOR > GESTOR > SUPERVISOR > JOGADOR)', () => {
    it('should return DIRETOR when user has all management codes (default)', () => {
      const teams = [DEFAULT_CODES.supervisor, DEFAULT_CODES.gestor, DEFAULT_CODES.diretor];
      expect(determineUserProfile(teams)).toBe(UserProfile.DIRETOR);
    });

    it('should return DIRETOR when user has all management codes (custom)', () => {
      const teams = [CUSTOM_CODES.supervisor, CUSTOM_CODES.gestor, CUSTOM_CODES.diretor];
      expect(determineUserProfile(teams, CUSTOM_CODES)).toBe(UserProfile.DIRETOR);
    });

    it('should return GESTOR when user has gestor and supervisor codes (default)', () => {
      const teams = [DEFAULT_CODES.supervisor, DEFAULT_CODES.gestor];
      expect(determineUserProfile(teams)).toBe(UserProfile.GESTOR);
    });

    it('should return GESTOR when user has gestor and supervisor codes (custom)', () => {
      const teams = [CUSTOM_CODES.supervisor, CUSTOM_CODES.gestor];
      expect(determineUserProfile(teams, CUSTOM_CODES)).toBe(UserProfile.GESTOR);
    });

    it('should return DIRETOR over GESTOR when both present (default)', () => {
      const teams = [DEFAULT_CODES.gestor, DEFAULT_CODES.diretor];
      expect(determineUserProfile(teams)).toBe(UserProfile.DIRETOR);
    });

    it('should return DIRETOR over GESTOR when both present (custom)', () => {
      const teams = [CUSTOM_CODES.gestor, CUSTOM_CODES.diretor];
      expect(determineUserProfile(teams, CUSTOM_CODES)).toBe(UserProfile.DIRETOR);
    });

    it('should return DIRETOR over SUPERVISOR when both present (default)', () => {
      const teams = [DEFAULT_CODES.supervisor, DEFAULT_CODES.diretor];
      expect(determineUserProfile(teams)).toBe(UserProfile.DIRETOR);
    });

    it('should return DIRETOR over SUPERVISOR when both present (custom)', () => {
      const teams = [CUSTOM_CODES.supervisor, CUSTOM_CODES.diretor];
      expect(determineUserProfile(teams, CUSTOM_CODES)).toBe(UserProfile.DIRETOR);
    });
  });

  describe('determineUserProfile() - Edge Cases', () => {
    it('should handle teams as objects with _id property', () => {
      const teams = [{ _id: DEFAULT_CODES.gestor, name: 'Gestão' }];
      expect(determineUserProfile(teams)).toBe(UserProfile.GESTOR);
    });

    it('should handle teams as objects with _id property (custom codes)', () => {
      const teams = [{ _id: CUSTOM_CODES.diretor, name: 'Direção' }];
      expect(determineUserProfile(teams, CUSTOM_CODES)).toBe(UserProfile.DIRETOR);
    });

    it('should handle team ids numéricos (API Game4U)', () => {
      expect(determineUserProfile([42, 99], DEFAULT_CODES, ['GESTOR'])).toBe(UserProfile.GESTOR);
    });

    it('should handle mixed team formats (strings and objects)', () => {
      const teams = [
        'team1',
        { _id: DEFAULT_CODES.supervisor, name: 'Supervisão' },
        'team2'
      ];
      expect(determineUserProfile(teams)).toBe(UserProfile.SUPERVISOR);
    });

    it('should handle mixed team formats with custom codes', () => {
      const teams = [
        { _id: 'team1' },
        CUSTOM_CODES.gestor,
        { _id: 'team2', name: 'Team 2' }
      ];
      expect(determineUserProfile(teams, CUSTOM_CODES)).toBe(UserProfile.GESTOR);
    });

    it('should handle objects without _id property', () => {
      const teams = [{ name: 'Team without ID' }, { other: 'property' }];
      expect(determineUserProfile(teams)).toBe(UserProfile.JOGADOR);
    });

    it('should handle null values in teams array', () => {
      const teams = [null, DEFAULT_CODES.supervisor, null];
      expect(determineUserProfile(teams)).toBe(UserProfile.SUPERVISOR);
    });

    it('should handle undefined values in teams array', () => {
      const teams = [undefined, DEFAULT_CODES.gestor, undefined];
      expect(determineUserProfile(teams)).toBe(UserProfile.GESTOR);
    });

    it('should handle array with only null/undefined values', () => {
      const teams = [null, undefined, null];
      expect(determineUserProfile(teams)).toBe(UserProfile.JOGADOR);
    });
  });

  describe('getUserOwnTeamId() - Backward Compatibility (No teamCodes parameter)', () => {
    it('should return null for JOGADOR profile', () => {
      expect(getUserOwnTeamId(['team1'], UserProfile.JOGADOR)).toBeNull();
    });

    it('should return null for DIRETOR profile', () => {
      expect(getUserOwnTeamId([DEFAULT_CODES.diretor], UserProfile.DIRETOR)).toBeNull();
    });

    it('should return supervisor code for SUPERVISOR profile', () => {
      const teams = [DEFAULT_CODES.supervisor, 'managed_team'];
      expect(getUserOwnTeamId(teams, UserProfile.SUPERVISOR)).toBe(DEFAULT_CODES.supervisor);
    });

    it('should return first managed team for GESTOR profile (not meta GESTAO)', () => {
      const teams = [DEFAULT_CODES.gestor, 'managed_team1', 'managed_team2'];
      expect(getUserOwnTeamId(teams, UserProfile.GESTOR)).toBe('managed_team1');
    });

    it('should return meta GESTAO when it is the only team for GESTOR', () => {
      expect(getUserOwnTeamId([DEFAULT_CODES.gestor], UserProfile.GESTOR)).toBe(DEFAULT_CODES.gestor);
    });

    it('should return null for null teams', () => {
      expect(getUserOwnTeamId(null, UserProfile.SUPERVISOR)).toBeNull();
    });

    it('should return null for undefined teams', () => {
      expect(getUserOwnTeamId(undefined, UserProfile.GESTOR)).toBeNull();
    });

    it('should return null for empty teams array', () => {
      expect(getUserOwnTeamId([], UserProfile.SUPERVISOR)).toBeNull();
    });
  });

  describe('getUserOwnTeamId() - Custom Team Codes', () => {
    it('should return custom supervisor code for SUPERVISOR profile', () => {
      const teams = [CUSTOM_CODES.supervisor, 'managed_team'];
      expect(getUserOwnTeamId(teams, UserProfile.SUPERVISOR, CUSTOM_CODES)).toBe(CUSTOM_CODES.supervisor);
    });

    it('should return first managed team for GESTOR profile with custom codes', () => {
      const teams = [CUSTOM_CODES.gestor, 'managed_team1', 'managed_team2'];
      expect(getUserOwnTeamId(teams, UserProfile.GESTOR, CUSTOM_CODES)).toBe('managed_team1');
    });

    it('should return null when custom supervisor code not in teams', () => {
      const teams = [DEFAULT_CODES.supervisor, 'managed_team']; // Has default, not custom
      expect(getUserOwnTeamId(teams, UserProfile.SUPERVISOR, CUSTOM_CODES)).toBeNull();
    });

    it('should return null when custom gestor code not in teams', () => {
      const teams = [DEFAULT_CODES.gestor, 'managed_team']; // Has default, not custom
      expect(getUserOwnTeamId(teams, UserProfile.GESTOR, CUSTOM_CODES)).toBeNull();
    });

    it('should return null for JOGADOR profile with custom codes', () => {
      expect(getUserOwnTeamId(['team1'], UserProfile.JOGADOR, CUSTOM_CODES)).toBeNull();
    });

    it('should return null for DIRETOR profile with custom codes', () => {
      expect(getUserOwnTeamId([CUSTOM_CODES.diretor], UserProfile.DIRETOR, CUSTOM_CODES)).toBeNull();
    });
  });

  describe('getUserOwnTeamId() - Edge Cases', () => {
    it('should handle teams as objects with _id property', () => {
      const teams = [{ _id: DEFAULT_CODES.supervisor }, { _id: 'managed_team' }];
      expect(getUserOwnTeamId(teams, UserProfile.SUPERVISOR)).toBe(DEFAULT_CODES.supervisor);
    });

    it('should handle teams as objects with custom codes', () => {
      const teams = [{ _id: CUSTOM_CODES.gestor }, { _id: 'managed_team' }];
      expect(getUserOwnTeamId(teams, UserProfile.GESTOR, CUSTOM_CODES)).toBe('managed_team');
    });

    it('should handle mixed team formats', () => {
      const teams = [DEFAULT_CODES.supervisor, { _id: 'managed_team' }];
      expect(getUserOwnTeamId(teams, UserProfile.SUPERVISOR)).toBe(DEFAULT_CODES.supervisor);
    });

    it('should return null when supervisor code not found in teams', () => {
      const teams = ['team1', 'team2'];
      expect(getUserOwnTeamId(teams, UserProfile.SUPERVISOR)).toBeNull();
    });

    it('should return null when gestor code not found in teams', () => {
      const teams = ['team1', 'team2'];
      expect(getUserOwnTeamId(teams, UserProfile.GESTOR)).toBeNull();
    });
  });

  describe('getAccessibleTeamIds() - Backward Compatibility (No teamCodes parameter)', () => {
    it('should return empty array for JOGADOR profile', () => {
      expect(getAccessibleTeamIds(['team1', 'team2'], UserProfile.JOGADOR)).toEqual([]);
    });

    it('should return empty array for DIRETOR profile (can see all)', () => {
      expect(getAccessibleTeamIds([DEFAULT_CODES.diretor, 'team1'], UserProfile.DIRETOR)).toEqual([]);
    });

    it('should return empty array for null teams', () => {
      expect(getAccessibleTeamIds(null, UserProfile.SUPERVISOR)).toEqual([]);
    });

    it('should return empty array for undefined teams', () => {
      expect(getAccessibleTeamIds(undefined, UserProfile.GESTOR)).toEqual([]);
    });

    it('should return empty array for empty teams array', () => {
      expect(getAccessibleTeamIds([], UserProfile.SUPERVISOR)).toEqual([]);
    });

    it('should filter out supervisor code for SUPERVISOR profile', () => {
      const teams = [DEFAULT_CODES.supervisor, 'managed_team1', 'managed_team2'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR);
      
      expect(accessible).not.toContain(DEFAULT_CODES.supervisor);
      expect(accessible).toContain('managed_team1');
      expect(accessible).toContain('managed_team2');
      expect(accessible.length).toBe(2);
    });

    it('should filter out gestor code for GESTOR profile', () => {
      const teams = [DEFAULT_CODES.gestor, 'managed_team1', 'managed_team2', 'managed_team3'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR);
      
      expect(accessible).not.toContain(DEFAULT_CODES.gestor);
      expect(accessible).toContain('managed_team1');
      expect(accessible).toContain('managed_team2');
      expect(accessible).toContain('managed_team3');
      expect(accessible.length).toBe(3);
    });
  });

  describe('getAccessibleTeamIds() - Custom Team Codes', () => {
    it('should filter out custom supervisor code for SUPERVISOR profile', () => {
      const teams = [CUSTOM_CODES.supervisor, 'managed_team1', 'managed_team2'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR, CUSTOM_CODES);
      
      expect(accessible).not.toContain(CUSTOM_CODES.supervisor);
      expect(accessible).toContain('managed_team1');
      expect(accessible).toContain('managed_team2');
      expect(accessible.length).toBe(2);
    });

    it('should filter out custom gestor code for GESTOR profile', () => {
      const teams = [CUSTOM_CODES.gestor, 'managed_team1', 'managed_team2'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR, CUSTOM_CODES);
      
      expect(accessible).not.toContain(CUSTOM_CODES.gestor);
      expect(accessible).toContain('managed_team1');
      expect(accessible).toContain('managed_team2');
      expect(accessible.length).toBe(2);
    });

    it('should NOT filter default codes when custom codes are provided', () => {
      // User has default supervisor code, but custom codes are provided
      // The default code should NOT be filtered because it's not the custom supervisor code
      const teams = [DEFAULT_CODES.supervisor, 'managed_team'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR, CUSTOM_CODES);
      
      // Since CUSTOM_CODES.supervisor is not in teams, nothing is filtered
      expect(accessible).toContain(DEFAULT_CODES.supervisor);
      expect(accessible).toContain('managed_team');
      expect(accessible.length).toBe(2);
    });

    it('should return empty array for JOGADOR profile with custom codes', () => {
      expect(getAccessibleTeamIds(['team1'], UserProfile.JOGADOR, CUSTOM_CODES)).toEqual([]);
    });

    it('should return empty array for DIRETOR profile with custom codes', () => {
      expect(getAccessibleTeamIds([CUSTOM_CODES.diretor], UserProfile.DIRETOR, CUSTOM_CODES)).toEqual([]);
    });
  });

  describe('getAccessibleTeamIds() - SUPERVISOR Filtering', () => {
    it('should return managed teams excluding supervisor code', () => {
      const teams = [DEFAULT_CODES.supervisor, 'team_A'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR);
      
      expect(accessible).toEqual(['team_A']);
    });

    it('should return empty array when supervisor only has supervisor code', () => {
      const teams = [DEFAULT_CODES.supervisor];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR);
      
      expect(accessible).toEqual([]);
    });

    it('should return multiple managed teams', () => {
      const teams = [DEFAULT_CODES.supervisor, 'team_A', 'team_B', 'team_C'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR);
      
      expect(accessible.length).toBe(3);
      expect(accessible).toContain('team_A');
      expect(accessible).toContain('team_B');
      expect(accessible).toContain('team_C');
    });

    it('should handle custom supervisor code filtering', () => {
      const teams = [CUSTOM_CODES.supervisor, 'team_X', 'team_Y'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR, CUSTOM_CODES);
      
      expect(accessible).toEqual(['team_X', 'team_Y']);
    });
  });

  describe('getAccessibleTeamIds() - GESTOR Filtering', () => {
    it('should return managed teams excluding gestor code', () => {
      const teams = [DEFAULT_CODES.gestor, 'team_A', 'team_B'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR);
      
      expect(accessible).toEqual(['team_A', 'team_B']);
    });

    it('should return empty array when gestor only has gestor code', () => {
      const teams = [DEFAULT_CODES.gestor];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR);
      
      expect(accessible).toEqual([]);
    });

    it('should return all managed teams for gestor with many teams', () => {
      const teams = [DEFAULT_CODES.gestor, 'team_1', 'team_2', 'team_3', 'team_4', 'team_5'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR);
      
      expect(accessible.length).toBe(5);
      expect(accessible).not.toContain(DEFAULT_CODES.gestor);
    });

    it('should handle custom gestor code filtering', () => {
      const teams = [CUSTOM_CODES.gestor, 'team_X', 'team_Y', 'team_Z'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR, CUSTOM_CODES);
      
      expect(accessible).toEqual(['team_X', 'team_Y', 'team_Z']);
    });
  });

  describe('getAccessibleTeamIds() - Edge Cases', () => {
    it('should handle teams as objects with _id property', () => {
      const teams = [
        { _id: DEFAULT_CODES.supervisor },
        { _id: 'managed_team' }
      ];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR);
      
      expect(accessible).toEqual(['managed_team']);
    });

    it('should handle mixed team formats', () => {
      const teams = [
        DEFAULT_CODES.gestor,
        { _id: 'team_A' },
        'team_B'
      ];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR);
      
      expect(accessible.length).toBe(2);
      expect(accessible).toContain('team_A');
      expect(accessible).toContain('team_B');
    });

    it('should handle null values in teams array', () => {
      const teams = [null, DEFAULT_CODES.supervisor, null, 'managed_team'];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR);
      
      expect(accessible).toEqual(['managed_team']);
    });

    it('should handle undefined values in teams array', () => {
      const teams = [undefined, DEFAULT_CODES.gestor, 'team_A', undefined];
      const accessible = getAccessibleTeamIds(teams, UserProfile.GESTOR);
      
      expect(accessible).toEqual(['team_A']);
    });

    it('should handle objects without _id property', () => {
      const teams = [
        DEFAULT_CODES.supervisor,
        { name: 'No ID' },
        'valid_team'
      ];
      const accessible = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR);
      
      expect(accessible).toEqual(['valid_team']);
    });
  });

  describe('Integration - Profile Determination and Team Access', () => {
    it('should correctly determine profile and accessible teams for supervisor', () => {
      const teams = [DEFAULT_CODES.supervisor, 'managed_team'];
      
      const profile = determineUserProfile(teams);
      const accessible = getAccessibleTeamIds(teams, profile);
      const ownTeam = getUserOwnTeamId(teams, profile);
      
      expect(profile).toBe(UserProfile.SUPERVISOR);
      expect(accessible).toEqual(['managed_team']);
      expect(ownTeam).toBe(DEFAULT_CODES.supervisor);
    });

    it('should correctly determine profile and accessible teams for gestor', () => {
      const teams = [DEFAULT_CODES.gestor, 'team_A', 'team_B'];
      
      const profile = determineUserProfile(teams);
      const accessible = getAccessibleTeamIds(teams, profile);
      const ownTeam = getUserOwnTeamId(teams, profile);
      
      expect(profile).toBe(UserProfile.GESTOR);
      expect(accessible).toEqual(['team_A', 'team_B']);
      expect(ownTeam).toBe('team_A');
    });

    it('should correctly determine profile and accessible teams for diretor', () => {
      const teams = [DEFAULT_CODES.diretor, 'team_A'];
      
      const profile = determineUserProfile(teams);
      const accessible = getAccessibleTeamIds(teams, profile);
      const ownTeam = getUserOwnTeamId(teams, profile);
      
      expect(profile).toBe(UserProfile.DIRETOR);
      expect(accessible).toEqual([]); // Empty means "all"
      expect(ownTeam).toBeNull();
    });

    it('should correctly determine profile and accessible teams for jogador', () => {
      const teams = ['regular_team'];
      
      const profile = determineUserProfile(teams);
      const accessible = getAccessibleTeamIds(teams, profile);
      const ownTeam = getUserOwnTeamId(teams, profile);
      
      expect(profile).toBe(UserProfile.JOGADOR);
      expect(accessible).toEqual([]);
      expect(ownTeam).toBeNull();
    });

    it('should work consistently with custom team codes', () => {
      const teams = [CUSTOM_CODES.gestor, 'team_X', 'team_Y'];
      
      const profile = determineUserProfile(teams, CUSTOM_CODES);
      const accessible = getAccessibleTeamIds(teams, profile, CUSTOM_CODES);
      const ownTeam = getUserOwnTeamId(teams, profile, CUSTOM_CODES);
      
      expect(profile).toBe(UserProfile.GESTOR);
      expect(accessible).toEqual(['team_X', 'team_Y']);
      expect(ownTeam).toBe('team_X');
    });
  });
});
