import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TeamRoleGuardService } from './team-role.guard';
import { SessaoProvider } from '@providers/sessao/sessao.provider';

describe('TeamRoleGuardService', () => {
  let guard: TeamRoleGuardService;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(() => {
    // Create mock objects
    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: null
    });
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        TeamRoleGuardService,
        { provide: SessaoProvider, useValue: mockSessaoProvider },
        { provide: Router, useValue: mockRouter }
      ]
    });

    guard = TestBed.inject(TeamRoleGuardService);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  describe('hasGestaoRole', () => {
    it('should return true when user belongs to GESTAO team (FkgMSNO)', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: ['FkgMSNO', 'other-team']
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(true);
    });

    it('should return true when user belongs only to GESTAO team', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: ['FkgMSNO']
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(true);
    });

    it('should return false when user does not belong to GESTAO team', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: ['other-team-1', 'other-team-2']
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });

    it('should return false when user has no teams', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: []
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });

    it('should return false when user is null', () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => null,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });

    it('should return false when user teams is undefined', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: undefined
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });

    it('should return false when user teams is not an array', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: 'FkgMSNO' // Invalid: should be array
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });

    it('should return false when teams array contains non-string values', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: [null, undefined, 123, { _id: 'FkgMSNO' }] // Invalid values
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });
  });

  describe('canActivate', () => {
    const mockRoute: any = {};
    const mockState: any = { url: '/dashboard/team-management' };

    it('should return true and allow access when user belongs to GESTAO team', async () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: ['FkgMSNO']
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should return false and redirect to /dashboard when user does not belong to GESTAO team', async () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: ['other-team']
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should return false and redirect to /login when user is not authenticated', async () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => null,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should handle user with empty teams array', async () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        teams: []
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should handle user with multiple teams including GESTAO', async () => {
      const mockUser: any = {
        email: 'admin@example.com',
        full_name: 'Admin User',
        teams: ['team-1', 'FkgMSNO', 'team-2']
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should return false when user has teams but none is GESTAO', async () => {
      const mockUser: any = {
        email: 'user@example.com',
        full_name: 'Regular User',
        teams: ['team-a', 'team-b', 'team-c']
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });
});
