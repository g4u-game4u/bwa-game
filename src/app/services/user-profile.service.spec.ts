import { TestBed } from '@angular/core/testing';
import { UserProfileService } from './user-profile.service';
import { TeamCodeService } from './team-code.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfile } from '@utils/user-profile';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let mockTeamCodeService: jasmine.SpyObj<TeamCodeService>;

  // Default team codes (matching TeamCodeService defaults)
  const defaultTeamCodes = {
    supervisor: 'Fkmdmko',
    gestor: 'FkmdnFU',
    diretor: 'FkmdhZ9'
  };

  beforeEach(() => {
    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', ['isAdmin', 'isGerente'], {
      usuario: null
    });
    mockSessaoProvider.isAdmin.and.returnValue(false);
    mockSessaoProvider.isGerente.and.returnValue(false);

    mockTeamCodeService = jasmine.createSpyObj('TeamCodeService', [
      'getTeamCodes',
      'getSupervisorCode',
      'getGestorCode',
      'getDiretorCode'
    ]);
    mockTeamCodeService.getTeamCodes.and.returnValue(defaultTeamCodes);
    mockTeamCodeService.getSupervisorCode.and.returnValue(defaultTeamCodes.supervisor);
    mockTeamCodeService.getGestorCode.and.returnValue(defaultTeamCodes.gestor);
    mockTeamCodeService.getDiretorCode.and.returnValue(defaultTeamCodes.diretor);

    TestBed.configureTestingModule({
      providers: [
        UserProfileService,
        { provide: SessaoProvider, useValue: mockSessaoProvider },
        { provide: TeamCodeService, useValue: mockTeamCodeService }
      ]
    });

    service = TestBed.inject(UserProfileService);
  });

  describe('Service Creation', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should inject TeamCodeService', () => {
      expect(mockTeamCodeService).toBeTruthy();
    });
  });

  describe('getCurrentUserProfile', () => {
    it('should return JOGADOR when user is null', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: null });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.JOGADOR);
    });

    it('should return JOGADOR when user has no teams', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: { teams: [] } });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.JOGADOR);
    });

    it('should return DIRETOR when user has diretor team code', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.diretor] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.DIRETOR);
    });

    it('should return GESTOR when user has gestor team code', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.gestor] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.GESTOR);
    });

    it('should return SUPERVISOR when user has supervisor team code', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.supervisor] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.SUPERVISOR);
    });

    it('should call TeamCodeService.getTeamCodes()', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: ['some-team'] } 
      });
      service.getCurrentUserProfile();
      expect(mockTeamCodeService.getTeamCodes).toHaveBeenCalled();
    });

    it('should use custom team codes from TeamCodeService', () => {
      const customCodes = {
        supervisor: 'CUSTOM_SUP',
        gestor: 'CUSTOM_GES',
        diretor: 'CUSTOM_DIR'
      };
      mockTeamCodeService.getTeamCodes.and.returnValue(customCodes);

      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: ['CUSTOM_DIR'] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.DIRETOR);

      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: ['CUSTOM_GES'] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.GESTOR);

      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: ['CUSTOM_SUP'] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.SUPERVISOR);
    });
  });

  describe('getCurrentUserOwnTeamId', () => {
    it('should return null when user is null', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: null });
      expect(service.getCurrentUserOwnTeamId()).toBeNull();
    });

    it('should call TeamCodeService.getTeamCodes()', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.supervisor, 'team-123'] } 
      });
      service.getCurrentUserOwnTeamId();
      expect(mockTeamCodeService.getTeamCodes).toHaveBeenCalled();
    });

    it('should return supervisor team code for SUPERVISOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.supervisor, 'team-123'] } 
      });
      expect(service.getCurrentUserOwnTeamId()).toBe(defaultTeamCodes.supervisor);
    });

    it('should return gestor team code for GESTOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.gestor, 'team-123'] } 
      });
      expect(service.getCurrentUserOwnTeamId()).toBe(defaultTeamCodes.gestor);
    });
  });

  describe('getAccessibleTeamIds', () => {
    it('should return empty array when user is null', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: null });
      expect(service.getAccessibleTeamIds()).toEqual([]);
    });

    it('should call TeamCodeService.getTeamCodes()', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.supervisor, 'team-123'] } 
      });
      service.getAccessibleTeamIds();
      expect(mockTeamCodeService.getTeamCodes).toHaveBeenCalled();
    });

    it('should filter out supervisor team code for SUPERVISOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.supervisor, 'team-123', 'team-456'] } 
      });
      const result = service.getAccessibleTeamIds();
      expect(result).not.toContain(defaultTeamCodes.supervisor);
      expect(result).toContain('team-123');
      expect(result).toContain('team-456');
    });

    it('should filter out gestor team code for GESTOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.gestor, 'team-123', 'team-456'] } 
      });
      const result = service.getAccessibleTeamIds();
      expect(result).not.toContain(defaultTeamCodes.gestor);
      expect(result).toContain('team-123');
      expect(result).toContain('team-456');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with default team codes (backward compatible)', () => {
      // Test that the service works correctly with default team codes
      // This ensures existing deployments continue to work
      
      // DIRETOR with default code
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: ['FkmdhZ9'] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.DIRETOR);
      expect(service.isDiretor()).toBe(true);

      // GESTOR with default code
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: ['FkmdnFU'] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.GESTOR);
      expect(service.isGestor()).toBe(true);

      // SUPERVISOR with default code
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: ['Fkmdmko'] } 
      });
      expect(service.getCurrentUserProfile()).toBe(UserProfile.SUPERVISOR);
      expect(service.isSupervisor()).toBe(true);
    });
  });

  describe('Helper Methods', () => {
    it('canAccessTeamManagement should return false for JOGADOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: { teams: [] } });
      expect(service.canAccessTeamManagement()).toBe(false);
    });

    it('canAccessTeamManagement should return true for session role ADMIN', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: { teams: [] } });
      mockSessaoProvider.isAdmin.and.returnValue(true);
      expect(service.canAccessTeamManagement()).toBe(true);
      mockSessaoProvider.isAdmin.and.returnValue(false);
    });

    it('canAccessTeamManagement should return true for session role GESTOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: { teams: [] } });
      mockSessaoProvider.isGerente.and.returnValue(true);
      expect(service.canAccessTeamManagement()).toBe(true);
      mockSessaoProvider.isGerente.and.returnValue(false);
    });

    it('canAccessTeamManagement should return true for management profiles', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.supervisor] } 
      });
      expect(service.canAccessTeamManagement()).toBe(true);
    });

    it('canSeeAllTeams should return true only for DIRETOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.diretor] } 
      });
      expect(service.canSeeAllTeams()).toBe(true);

      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.gestor] } 
      });
      expect(service.canSeeAllTeams()).toBe(false);
    });

    it('canOnlySeeOwnTeam should return true only for SUPERVISOR', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.supervisor] } 
      });
      expect(service.canOnlySeeOwnTeam()).toBe(true);

      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.gestor] } 
      });
      expect(service.canOnlySeeOwnTeam()).toBe(false);
    });

    it('isManagementUser should return same as canAccessTeamManagement', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', { value: { teams: [] } });
      expect(service.isManagementUser()).toBe(service.canAccessTeamManagement());

      Object.defineProperty(mockSessaoProvider, 'usuario', { 
        value: { teams: [defaultTeamCodes.gestor] } 
      });
      expect(service.isManagementUser()).toBe(service.canAccessTeamManagement());
    });
  });
});
