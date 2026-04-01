/**
 * Integration tests for UserProfileService with TeamCodeService
 * 
 * Feature: configurable-team-codes
 * 
 * These tests verify that the UserProfileService correctly integrates with
 * TeamCodeService to determine user profiles based on configurable team codes.
 */
import { TestBed } from '@angular/core/testing';
import { UserProfileService } from './user-profile.service';
import { TeamCodeService } from './team-code.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfile } from '@utils/user-profile';

describe('UserProfileService Integration Tests', () => {
  let userProfileService: UserProfileService;
  let teamCodeService: TeamCodeService;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;

  beforeEach(() => {
    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: null
    });

    TestBed.configureTestingModule({
      providers: [
        UserProfileService,
        TeamCodeService,
        { provide: SessaoProvider, useValue: mockSessaoProvider }
      ]
    });

    userProfileService = TestBed.inject(UserProfileService);
    teamCodeService = TestBed.inject(TeamCodeService);
  });

  describe('Integration with TeamCodeService', () => {
    it('should use TeamCodeService to get team codes', () => {
      const teamCodes = teamCodeService.getTeamCodes();
      expect(teamCodes).toBeDefined();
      expect(teamCodes.supervisor).toBeDefined();
      expect(teamCodes.gestor).toBeDefined();
      expect(teamCodes.diretor).toBeDefined();
    });

    it('should return JOGADOR when user has no teams', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [] })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.JOGADOR);
    });

    it('should return JOGADOR when user is null', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => null
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.JOGADOR);
      expect(userProfileService.isJogador()).toBe(true);
    });

    it('should return DIRETOR when user has diretor team code', () => {
      const diretorCode = teamCodeService.getDiretorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [diretorCode, 'other-team'] })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.DIRETOR);
      expect(userProfileService.isDiretor()).toBe(true);
      expect(userProfileService.canSeeAllTeams()).toBe(true);
    });

    it('should return GESTOR when user has gestor team code', () => {
      const gestorCode = teamCodeService.getGestorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [gestorCode, 'team-1', 'team-2'] })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.GESTOR);
      expect(userProfileService.isGestor()).toBe(true);
    });

    it('should return SUPERVISOR when user has supervisor team code', () => {
      const supervisorCode = teamCodeService.getSupervisorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [supervisorCode, 'managed-team'] })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.SUPERVISOR);
      expect(userProfileService.isSupervisor()).toBe(true);
    });

    it('should prioritize DIRETOR over GESTOR when user has both', () => {
      const diretorCode = teamCodeService.getDiretorCode();
      const gestorCode = teamCodeService.getGestorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [gestorCode, diretorCode] })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.DIRETOR);
    });

    it('should prioritize GESTOR over SUPERVISOR when user has both', () => {
      const gestorCode = teamCodeService.getGestorCode();
      const supervisorCode = teamCodeService.getSupervisorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [supervisorCode, gestorCode] })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.GESTOR);
    });
  });

  describe('Team Access with Configured Codes', () => {
    it('should return empty array for JOGADOR accessible teams', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: ['regular-team'] })
      });

      expect(userProfileService.getAccessibleTeamIds()).toEqual([]);
    });

    it('should return empty array for DIRETOR (indicates all teams)', () => {
      const diretorCode = teamCodeService.getDiretorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [diretorCode, 'team-1', 'team-2'] })
      });

      expect(userProfileService.getAccessibleTeamIds()).toEqual([]);
      expect(userProfileService.canSeeAllTeams()).toBe(true);
    });

    it('should filter out supervisor code from accessible teams', () => {
      const supervisorCode = teamCodeService.getSupervisorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [supervisorCode, 'managed-team-1'] })
      });

      const accessibleTeams = userProfileService.getAccessibleTeamIds();
      expect(accessibleTeams).not.toContain(supervisorCode);
      expect(accessibleTeams).toContain('managed-team-1');
    });

    it('should filter out gestor code from accessible teams', () => {
      const gestorCode = teamCodeService.getGestorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [gestorCode, 'team-1', 'team-2', 'team-3'] })
      });

      const accessibleTeams = userProfileService.getAccessibleTeamIds();
      expect(accessibleTeams).not.toContain(gestorCode);
      expect(accessibleTeams).toContain('team-1');
      expect(accessibleTeams).toContain('team-2');
      expect(accessibleTeams).toContain('team-3');
    });
  });

  describe('Own Team ID with Configured Codes', () => {
    it('should return null for JOGADOR own team', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: ['regular-team'] })
      });

      expect(userProfileService.getCurrentUserOwnTeamId()).toBeNull();
    });

    it('should return null for DIRETOR own team', () => {
      const diretorCode = teamCodeService.getDiretorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [diretorCode] })
      });

      expect(userProfileService.getCurrentUserOwnTeamId()).toBeNull();
    });

    it('should return supervisor code for SUPERVISOR own team', () => {
      const supervisorCode = teamCodeService.getSupervisorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [supervisorCode, 'managed-team'] })
      });

      expect(userProfileService.getCurrentUserOwnTeamId()).toBe(supervisorCode);
    });

    it('should return gestor code for GESTOR own team', () => {
      const gestorCode = teamCodeService.getGestorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [gestorCode, 'team-1', 'team-2'] })
      });

      expect(userProfileService.getCurrentUserOwnTeamId()).toBe(gestorCode);
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with default team codes', () => {
      // Default codes from TeamCodeService
      const expectedDefaults = {
        supervisor: 'Fkmdmko',
        gestor: 'FkmdnFU',
        diretor: 'FkmdhZ9'
      };

      const teamCodes = teamCodeService.getTeamCodes();
      
      // Verify defaults are used (unless environment overrides them)
      expect(teamCodes.supervisor).toBeDefined();
      expect(teamCodes.gestor).toBeDefined();
      expect(teamCodes.diretor).toBeDefined();
    });

    it('should handle teams as objects with _id property', () => {
      const supervisorCode = teamCodeService.getSupervisorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({
          teams: [
            { _id: supervisorCode, name: 'Supervisão' },
            { _id: 'managed-team', name: 'Team A' }
          ]
        })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.SUPERVISOR);
      expect(userProfileService.isSupervisor()).toBe(true);
    });

    it('should handle mixed team formats (strings and objects)', () => {
      const gestorCode = teamCodeService.getGestorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({
          teams: [
            gestorCode,
            { _id: 'team-1', name: 'Team 1' },
            'team-2'
          ]
        })
      });

      expect(userProfileService.getCurrentUserProfile()).toBe(UserProfile.GESTOR);
      const accessibleTeams = userProfileService.getAccessibleTeamIds();
      expect(accessibleTeams).toContain('team-1');
      expect(accessibleTeams).toContain('team-2');
    });
  });

  describe('Management Access Checks', () => {
    it('should allow team management access for SUPERVISOR', () => {
      const supervisorCode = teamCodeService.getSupervisorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [supervisorCode] })
      });

      expect(userProfileService.canAccessTeamManagement()).toBe(true);
      expect(userProfileService.isManagementUser()).toBe(true);
    });

    it('should allow team management access for GESTOR', () => {
      const gestorCode = teamCodeService.getGestorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [gestorCode] })
      });

      expect(userProfileService.canAccessTeamManagement()).toBe(true);
      expect(userProfileService.isManagementUser()).toBe(true);
    });

    it('should allow team management access for DIRETOR', () => {
      const diretorCode = teamCodeService.getDiretorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [diretorCode] })
      });

      expect(userProfileService.canAccessTeamManagement()).toBe(true);
      expect(userProfileService.isManagementUser()).toBe(true);
    });

    it('should deny team management access for JOGADOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: ['regular-team'] })
      });

      expect(userProfileService.canAccessTeamManagement()).toBe(false);
      expect(userProfileService.isManagementUser()).toBe(false);
    });

    it('should indicate SUPERVISOR can only see own team', () => {
      const supervisorCode = teamCodeService.getSupervisorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [supervisorCode, 'managed-team'] })
      });

      expect(userProfileService.canOnlySeeOwnTeam()).toBe(true);
    });

    it('should indicate GESTOR cannot only see own team', () => {
      const gestorCode = teamCodeService.getGestorCode();
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => ({ teams: [gestorCode, 'team-1', 'team-2'] })
      });

      expect(userProfileService.canOnlySeeOwnTeam()).toBe(false);
    });
  });
});
