import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DashboardRedirectGuardService } from './dashboard-redirect.guard';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfileService } from '@services/user-profile.service';
import { UserProfile } from '@utils/user-profile';

describe('DashboardRedirectGuardService', () => {
  let guard: DashboardRedirectGuardService;
  let mockSessaoProvider: any;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockUserProfileService: jasmine.SpyObj<UserProfileService>;

  const mockRoute: any = {};

  function createMockState(url: string): any {
    return { url };
  }

  beforeEach(() => {
    mockSessaoProvider = { usuario: null, token: null };
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockRouter.navigate.and.returnValue(Promise.resolve(true));
    mockUserProfileService = jasmine.createSpyObj('UserProfileService', [
      'getCurrentUserProfile',
      'canAccessTeamManagement'
    ]);

    TestBed.configureTestingModule({
      providers: [
        DashboardRedirectGuardService,
        { provide: SessaoProvider, useValue: mockSessaoProvider },
        { provide: Router, useValue: mockRouter },
        { provide: UserProfileService, useValue: mockUserProfileService }
      ]
    });

    guard = TestBed.inject(DashboardRedirectGuardService);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  describe('unauthenticated user', () => {
    it('should redirect to /login when user is not authenticated', async () => {
      mockSessaoProvider.usuario = null;
      mockSessaoProvider.token = null;

      const result = await guard.canActivate(mockRoute, createMockState('/dashboard'));

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('JOGADOR profile', () => {
    beforeEach(() => {
      mockSessaoProvider.usuario = { email: 'jogador@test.com', teams: [] };
      mockUserProfileService.getCurrentUserProfile.and.returnValue(UserProfile.JOGADOR);
    });

    it('should allow access to /dashboard', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard'));
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should redirect from /dashboard/team-management to /dashboard', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/team-management'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should redirect from /dashboard/supervisor to /dashboard', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/supervisor'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should redirect from /dashboard/supervisor-tecnico to /dashboard', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/supervisor-tecnico'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  describe('SUPERVISOR profile', () => {
    beforeEach(() => {
      mockSessaoProvider.usuario = { email: 'supervisor@test.com', teams: ['Fkmdmko'] };
      mockUserProfileService.getCurrentUserProfile.and.returnValue(UserProfile.SUPERVISOR);
    });

    it('should redirect from /dashboard to /dashboard/supervisor', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/supervisor']);
    });

    it('should allow access to /dashboard/supervisor', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/supervisor'));
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('SUPERVISOR_TECNICO profile', () => {
    beforeEach(() => {
      mockSessaoProvider.usuario = { email: 'suptec@test.com', teams: ['Fn2lrg3'] };
      mockUserProfileService.getCurrentUserProfile.and.returnValue(UserProfile.SUPERVISOR_TECNICO);
    });

    it('should allow access to /dashboard (regular player dashboard)', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard'));
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should redirect from /dashboard/team-management to /dashboard', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/team-management'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should redirect from /dashboard/supervisor to /dashboard', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/supervisor'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should allow access to /dashboard/supervisor-tecnico (secondary dashboard)', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/supervisor-tecnico'));
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('GESTOR profile', () => {
    beforeEach(() => {
      mockSessaoProvider.usuario = { email: 'gestor@test.com', teams: ['FkmdnFU'] };
      mockUserProfileService.getCurrentUserProfile.and.returnValue(UserProfile.GESTOR);
    });

    it('should redirect from /dashboard to /dashboard/team-management', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/team-management']);
    });

    it('should allow access to /dashboard/team-management', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/team-management'));
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('DIRETOR profile', () => {
    beforeEach(() => {
      mockSessaoProvider.usuario = { email: 'diretor@test.com', teams: ['FkmdhZ9'] };
      mockUserProfileService.getCurrentUserProfile.and.returnValue(UserProfile.DIRETOR);
    });

    it('should redirect from /dashboard to /dashboard/team-management', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard'));
      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/team-management']);
    });

    it('should allow access to /dashboard/team-management', async () => {
      const result = await guard.canActivate(mockRoute, createMockState('/dashboard/team-management'));
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });
});
