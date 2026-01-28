import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TeamRoleGuardService } from './team-role.guard';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ToastService } from '@services/toast.service';
import { ROLES_LIST } from '@utils/constants';
import { Usuario } from '@model/usuario.model';

describe('TeamRoleGuardService', () => {
  let guard: TeamRoleGuardService;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockToastService: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    // Create mock objects
    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: null
    });
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockToastService = jasmine.createSpyObj('ToastService', ['error']);

    TestBed.configureTestingModule({
      providers: [
        TeamRoleGuardService,
        { provide: SessaoProvider, useValue: mockSessaoProvider },
        { provide: Router, useValue: mockRouter },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    guard = TestBed.inject(TeamRoleGuardService);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  describe('hasGestaoRole', () => {
    it('should return true when user has GESTAO role', () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: [ROLES_LIST.ACCESS_TEAM_MANAGEMENT]
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(true);
    });

    it('should return true when user has GESTAO role among other roles', () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: [
          ROLES_LIST.ACCESS_PLAYER_PANEL,
          ROLES_LIST.ACCESS_TEAM_MANAGEMENT,
          ROLES_LIST.ACCESS_MANAGER_PANEL
        ]
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(true);
    });

    it('should return false when user does not have GESTAO role', () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: [ROLES_LIST.ACCESS_PLAYER_PANEL]
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });

    it('should return false when user has no roles', () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: []
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

    it('should return false when user roles is undefined', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: undefined
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      expect(guard.hasGestaoRole()).toBe(false);
    });

    it('should return false when user roles is not an array', () => {
      const mockUser: any = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: 'GESTAO' // Invalid: should be array
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

    it('should return true and allow access when user has GESTAO role', async () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: [ROLES_LIST.ACCESS_TEAM_MANAGEMENT]
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      expect(mockToastService.error).not.toHaveBeenCalled();
    });

    it('should return false and redirect to /dashboard when user does not have GESTAO role', async () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: [ROLES_LIST.ACCESS_PLAYER_PANEL]
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
      expect(mockToastService.error).toHaveBeenCalledWith(
        'Acesso negado. Você não tem permissão para acessar esta página.'
      );
    });

    it('should return false and redirect to /login when user is not authenticated', async () => {
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => null,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
      expect(mockToastService.error).not.toHaveBeenCalled();
    });

    it('should display error message on access denied', async () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: [ROLES_LIST.ACCESS_MANAGER_PANEL]
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      await guard.canActivate(mockRoute, mockState);

      expect(mockToastService.error).toHaveBeenCalledWith(
        'Acesso negado. Você não tem permissão para acessar esta página.'
      );
    });

    it('should handle user with empty roles array', async () => {
      const mockUser: Usuario = {
        email: 'test@example.com',
        full_name: 'Test User',
        roles: []
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
      expect(mockToastService.error).toHaveBeenCalled();
    });

    it('should handle user with multiple roles including GESTAO', async () => {
      const mockUser: Usuario = {
        email: 'admin@example.com',
        full_name: 'Admin User',
        roles: [
          ROLES_LIST.ACCESS_ADMIN_PANEL,
          ROLES_LIST.ACCESS_TEAM_MANAGEMENT,
          ROLES_LIST.ACCESS_PLAYER_PANEL
        ]
      };
      Object.defineProperty(mockSessaoProvider, 'usuario', {
        get: () => mockUser,
        configurable: true
      });

      const result = await guard.canActivate(mockRoute, mockState);

      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      expect(mockToastService.error).not.toHaveBeenCalled();
    });
  });
});
