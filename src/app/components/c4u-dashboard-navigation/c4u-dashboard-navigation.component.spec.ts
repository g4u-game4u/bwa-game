import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';

import { C4uDashboardNavigationComponent } from './c4u-dashboard-navigation.component';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserProfileService } from '@services/user-profile.service';
import { ROLES_LIST } from '@utils/constants';

describe('C4uDashboardNavigationComponent', () => {
  let component: C4uDashboardNavigationComponent;
  let fixture: ComponentFixture<C4uDashboardNavigationComponent>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockSessaoProvider: any;
  let mockUserProfileService: jasmine.SpyObj<UserProfileService>;
  let mockChangeDetectorRef: jasmine.SpyObj<ChangeDetectorRef>;
  let routerEventsSubject: Subject<any>;

  function configureForJogador() {
    mockUserProfileService.canAccessTeamManagement.and.returnValue(false);
    mockUserProfileService.isJogador.and.returnValue(true);
    mockUserProfileService.isSupervisor.and.returnValue(false);
    mockUserProfileService.getCurrentUserProfile.and.returnValue('JOGADOR' as any);
  }

  function configureForSupervisor() {
    mockUserProfileService.canAccessTeamManagement.and.returnValue(true);
    mockUserProfileService.isJogador.and.returnValue(false);
    mockUserProfileService.isSupervisor.and.returnValue(true);
    mockUserProfileService.getCurrentUserProfile.and.returnValue('SUPERVISOR' as any);
  }

  function configureForGestor() {
    mockUserProfileService.canAccessTeamManagement.and.returnValue(true);
    mockUserProfileService.isJogador.and.returnValue(false);
    mockUserProfileService.isSupervisor.and.returnValue(false);
    mockUserProfileService.getCurrentUserProfile.and.returnValue('GESTOR' as any);
  }

  function configureForDiretor() {
    mockUserProfileService.canAccessTeamManagement.and.returnValue(true);
    mockUserProfileService.isJogador.and.returnValue(false);
    mockUserProfileService.isSupervisor.and.returnValue(false);
    mockUserProfileService.getCurrentUserProfile.and.returnValue('DIRETOR' as any);
  }

  beforeEach(async () => {
    routerEventsSubject = new Subject();
    
    mockRouter = jasmine.createSpyObj('Router', ['navigate'], {
      events: routerEventsSubject.asObservable(),
      url: '/dashboard'
    });
    
    mockSessaoProvider = {
      usuario: {
        email: 'test@example.com',
        roles: [ROLES_LIST.ACCESS_PLAYER_PANEL],
        teams: []
      }
    };
    
    mockUserProfileService = jasmine.createSpyObj('UserProfileService', [
      'getCurrentUserProfile',
      'canAccessTeamManagement',
      'isJogador',
      'isSupervisor',
      'isGestor',
      'isDiretor',
      'isManagementUser'
    ]);
    
    // Default: JOGADOR
    configureForJogador();
    
    mockChangeDetectorRef = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);

    await TestBed.configureTestingModule({
      declarations: [C4uDashboardNavigationComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: SessaoProvider, useValue: mockSessaoProvider },
        { provide: UserProfileService, useValue: mockUserProfileService },
        { provide: ChangeDetectorRef, useValue: mockChangeDetectorRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uDashboardNavigationComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with 3 dashboard options in the array', () => {
      expect(component.dashboards.length).toBe(3);
      expect(component.dashboards[0].label).toBe('Meu Painel');
      expect(component.dashboards[1].label).toBe('Gestão de Equipe');
      expect(component.dashboards[2].label).toBe('Supervisor');
    });

    it('should have Supervisor option with correct route and icon', () => {
      const supervisorDashboard = component.dashboards.find(d => d.label === 'Supervisor');
      expect(supervisorDashboard).toBeDefined();
      expect(supervisorDashboard!.route).toBe('/dashboard/supervisor');
      expect(supervisorDashboard!.icon).toBe('ri-user-star-line');
      expect(supervisorDashboard!.requiresRole).toBe(ROLES_LIST.ACCESS_TEAM_MANAGEMENT);
    });
  });

  describe('Role-Based Access - JOGADOR Users', () => {
    it('should show only "Meu Painel" for JOGADOR users', () => {
      configureForJogador();
      fixture.detectChanges();

      expect(component.availableDashboards.length).toBe(1);
      expect(component.availableDashboards[0].label).toBe('Meu Painel');
      expect(component.hasMultipleDashboards).toBe(false);
    });

    it('should NOT show "Supervisor" option for JOGADOR users', () => {
      configureForJogador();
      fixture.detectChanges();

      const supervisorOption = component.availableDashboards.find(d => d.label === 'Supervisor');
      expect(supervisorOption).toBeUndefined();
    });

    it('should NOT show "Gestão de Equipe" for JOGADOR users', () => {
      configureForJogador();
      fixture.detectChanges();

      const gestaoOption = component.availableDashboards.find(d => d.label === 'Gestão de Equipe');
      expect(gestaoOption).toBeUndefined();
    });
  });

  describe('Role-Based Access - SUPERVISOR Users', () => {
    it('should show "Supervisor" and "Gestão de Equipe" for SUPERVISOR users', () => {
      configureForSupervisor();
      fixture.detectChanges();

      expect(component.hasGestaoRole).toBe(true);
      expect(component.availableDashboards.length).toBe(2);

      const labels = component.availableDashboards.map(d => d.label);
      expect(labels).toContain('Gestão de Equipe');
      expect(labels).toContain('Supervisor');
    });

    it('should NOT show "Meu Painel" for SUPERVISOR users', () => {
      configureForSupervisor();
      fixture.detectChanges();

      const meuPainel = component.availableDashboards.find(d => d.label === 'Meu Painel');
      expect(meuPainel).toBeUndefined();
    });

    it('should have Supervisor option navigating to /dashboard/supervisor', () => {
      configureForSupervisor();
      fixture.detectChanges();

      const supervisorOption = component.availableDashboards.find(d => d.label === 'Supervisor');
      expect(supervisorOption).toBeDefined();
      expect(supervisorOption!.route).toBe('/dashboard/supervisor');
    });
  });

  describe('Role-Based Access - GESTOR Users', () => {
    it('should show only "Gestão de Equipe" for GESTOR users (no Supervisor)', () => {
      configureForGestor();
      fixture.detectChanges();

      expect(component.hasGestaoRole).toBe(true);
      expect(component.availableDashboards.length).toBe(1);
      expect(component.availableDashboards[0].label).toBe('Gestão de Equipe');
    });

    it('should NOT show "Supervisor" option for GESTOR users', () => {
      configureForGestor();
      fixture.detectChanges();

      const supervisorOption = component.availableDashboards.find(d => d.label === 'Supervisor');
      expect(supervisorOption).toBeUndefined();
    });
  });

  describe('Role-Based Access - DIRETOR Users', () => {
    it('should show only "Gestão de Equipe" for DIRETOR users (no Supervisor)', () => {
      configureForDiretor();
      fixture.detectChanges();

      expect(component.hasGestaoRole).toBe(true);
      expect(component.availableDashboards.length).toBe(1);
      expect(component.availableDashboards[0].label).toBe('Gestão de Equipe');
    });

    it('should NOT show "Supervisor" option for DIRETOR users', () => {
      configureForDiretor();
      fixture.detectChanges();

      const supervisorOption = component.availableDashboards.find(d => d.label === 'Supervisor');
      expect(supervisorOption).toBeUndefined();
    });
  });

  describe('Dashboard Navigation', () => {
    it('should navigate to selected dashboard', () => {
      configureForSupervisor();
      // Set URL to supervisor dashboard so current dashboard is supervisor
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/supervisor',
        configurable: true
      });
      fixture.detectChanges();

      const teamDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/team-management'
      );

      component.navigateToDashboard(teamDashboard!);

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/team-management']);
    });

    it('should navigate to supervisor dashboard', () => {
      configureForSupervisor();
      fixture.detectChanges();

      const supervisorDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/supervisor'
      );

      component.navigateToDashboard(supervisorDashboard!);

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/supervisor']);
    });

    it('should not navigate if already on selected dashboard', () => {
      configureForSupervisor();
      fixture.detectChanges();

      const supervisorDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/supervisor'
      );
      component.currentDashboard = supervisorDashboard!;

      component.navigateToDashboard(supervisorDashboard!);

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should detect current dashboard from URL', () => {
      configureForGestor();
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management',
        configurable: true
      });

      fixture.detectChanges();

      expect(component.currentDashboard?.route).toBe('/dashboard/team-management');
      expect(component.currentDashboardName).toBe('Gestão de Equipe');
    });

    it('should detect supervisor dashboard from URL', () => {
      configureForSupervisor();
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/supervisor',
        configurable: true
      });

      fixture.detectChanges();

      expect(component.currentDashboard?.route).toBe('/dashboard/supervisor');
      expect(component.currentDashboardName).toBe('Supervisor');
    });

    it('should update current dashboard on route change', () => {
      configureForSupervisor();
      fixture.detectChanges();

      // Spy on the component's actual ChangeDetectorRef (Angular provides its own)
      const cdr = (component as any).cdr;
      const markForCheckSpy = spyOn(cdr, 'markForCheck').and.callThrough();

      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management',
        configurable: true
      });
      routerEventsSubject.next(new NavigationEnd(1, '/dashboard/team-management', '/dashboard/team-management'));

      expect(component.currentDashboard?.route).toBe('/dashboard/team-management');
      expect(markForCheckSpy).toHaveBeenCalled();
    });
  });

  describe('Session Storage - Last Visited Dashboard', () => {
    it('should save last visited dashboard to session storage', () => {
      configureForSupervisor();
      // Set URL to supervisor dashboard so current dashboard is supervisor
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/supervisor',
        configurable: true
      });
      fixture.detectChanges();

      const teamDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/team-management'
      );

      component.navigateToDashboard(teamDashboard!);

      const saved = sessionStorage.getItem('lastVisitedDashboard');
      expect(saved).toBe('/dashboard/team-management');
    });

    it('should restore last visited dashboard on initialization', () => {
      configureForGestor();
      sessionStorage.setItem('lastVisitedDashboard', '/dashboard/team-management');
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard',
        configurable: true
      });

      fixture.detectChanges();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/team-management']);
    });

    it('should not restore last visited dashboard if not on default route', () => {
      configureForGestor();
      sessionStorage.setItem('lastVisitedDashboard', '/dashboard/team-management');
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management',
        configurable: true
      });

      fixture.detectChanges();

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should not restore dashboard if user does not have access', () => {
      configureForJogador();
      sessionStorage.setItem('lastVisitedDashboard', '/dashboard/team-management');
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard',
        configurable: true
      });

      fixture.detectChanges();

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should handle session storage errors gracefully', () => {
      configureForSupervisor();
      spyOn(sessionStorage, 'setItem').and.throwError('Storage error');
      fixture.detectChanges();

      const teamDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/team-management'
      );

      expect(() => component.navigateToDashboard(teamDashboard!)).not.toThrow();
    });
  });

  describe('Current Dashboard Display', () => {
    it('should display current dashboard name for JOGADOR', () => {
      configureForJogador();
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard',
        configurable: true
      });

      fixture.detectChanges();

      expect(component.currentDashboardName).toBe('Meu Painel');
    });

    it('should return default name if no dashboard is detected', () => {
      component.currentDashboard = null;

      const name = component.currentDashboardName;

      expect(name).toBe('Painel');
    });
  });

  describe('Edge Cases', () => {
    it('should match longest route first for nested routes', () => {
      configureForGestor();
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management/details',
        configurable: true
      });

      fixture.detectChanges();

      expect(component.currentDashboard?.route).toBe('/dashboard/team-management');
    });

    it('should match supervisor route correctly over base dashboard route', () => {
      configureForSupervisor();
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/supervisor',
        configurable: true
      });

      fixture.detectChanges();

      expect(component.currentDashboard?.route).toBe('/dashboard/supervisor');
      expect(component.currentDashboard?.label).toBe('Supervisor');
    });
  });
});
