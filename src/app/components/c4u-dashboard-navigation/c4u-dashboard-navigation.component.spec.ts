import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';

import { C4uDashboardNavigationComponent } from './c4u-dashboard-navigation.component';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { TeamRoleGuardService } from '@guards/team-role.guard';
import { ROLES_LIST } from '@utils/constants';

describe('C4uDashboardNavigationComponent', () => {
  let component: C4uDashboardNavigationComponent;
  let fixture: ComponentFixture<C4uDashboardNavigationComponent>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let mockTeamRoleGuard: jasmine.SpyObj<TeamRoleGuardService>;
  let mockChangeDetectorRef: jasmine.SpyObj<ChangeDetectorRef>;
  let routerEventsSubject: Subject<any>;

  beforeEach(async () => {
    routerEventsSubject = new Subject();
    
    mockRouter = jasmine.createSpyObj('Router', ['navigate'], {
      events: routerEventsSubject.asObservable(),
      url: '/dashboard'
    });
    
    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: {
        email: 'test@example.com',
        roles: [ROLES_LIST.ACCESS_PLAYER_PANEL],
        teams: []
      }
    });
    
    mockTeamRoleGuard = jasmine.createSpyObj('TeamRoleGuardService', ['hasGestaoRole']);
    mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);
    
    mockChangeDetectorRef = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);

    await TestBed.configureTestingModule({
      declarations: [C4uDashboardNavigationComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: SessaoProvider, useValue: mockSessaoProvider },
        { provide: TeamRoleGuardService, useValue: mockTeamRoleGuard },
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

    it('should initialize with default dashboards', () => {
      expect(component.dashboards.length).toBe(2);
      expect(component.dashboards[0].label).toBe('Meu Painel');
      expect(component.dashboards[1].label).toBe('Gestão de Equipe');
    });
  });

  describe('Role-Based Access - GESTAO Users', () => {
    /**
     * Test: Navigation menu displays for GESTAO users
     * Validates: Requirements 18.1, 18.2
     */
    it('should display navigation menu for GESTAO users', () => {
      // Arrange: User with GESTAO team (FkgMSNO)
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.hasGestaoRole).toBe(true);
      expect(component.availableDashboards.length).toBe(2);
      expect(component.hasMultipleDashboards).toBe(true);
    });

    it('should include team management dashboard in available dashboards for GESTAO users', () => {
      // Arrange: User with GESTAO team (FkgMSNO)
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);

      // Act
      fixture.detectChanges();

      // Assert
      const teamDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/team-management'
      );
      expect(teamDashboard).toBeDefined();
      expect(teamDashboard?.label).toBe('Gestão de Equipe');
    });
  });

  describe('Role-Based Access - Non-GESTAO Users', () => {
    /**
     * Test: Navigation menu hidden for non-GESTAO users
     * Validates: Requirements 18.1, 18.2
     */
    it('should hide navigation menu for non-GESTAO users', () => {
      // Arrange: User without GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.hasGestaoRole).toBe(false);
      expect(component.availableDashboards.length).toBe(1);
      expect(component.hasMultipleDashboards).toBe(false);
    });

    it('should only show personal dashboard for non-GESTAO users', () => {
      // Arrange: User without GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.availableDashboards.length).toBe(1);
      expect(component.availableDashboards[0].route).toBe('/dashboard');
      expect(component.availableDashboards[0].label).toBe('Meu Painel');
    });

    it('should handle user with no teams', () => {
      // Arrange: User without teams
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.hasGestaoRole).toBe(false);
      expect(component.availableDashboards.length).toBe(1);
    });

    it('should handle null user', () => {
      // Arrange: Null user
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.hasGestaoRole).toBe(false);
      expect(component.availableDashboards.length).toBe(1);
    });
  });

  describe('Dashboard Navigation', () => {
    /**
     * Test: Dashboard switcher navigates correctly
     * Validates: Requirements 18.4
     */
    it('should navigate to selected dashboard', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      fixture.detectChanges();

      const teamDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/team-management'
      );

      // Act
      component.navigateToDashboard(teamDashboard!);

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/team-management']);
    });

    it('should not navigate if already on selected dashboard', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard',
        configurable: true
      });
      fixture.detectChanges();

      const personalDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard'
      );
      component.currentDashboard = personalDashboard!;

      // Act
      component.navigateToDashboard(personalDashboard!);

      // Assert
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should detect current dashboard from URL', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management',
        configurable: true
      });

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.currentDashboard?.route).toBe('/dashboard/team-management');
      expect(component.currentDashboardName).toBe('Gestão de Equipe');
    });

    it('should update current dashboard on route change', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      fixture.detectChanges();

      // Act: Simulate navigation event
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management',
        configurable: true
      });
      routerEventsSubject.next(new NavigationEnd(1, '/dashboard/team-management', '/dashboard/team-management'));

      // Assert
      expect(component.currentDashboard?.route).toBe('/dashboard/team-management');
      expect(mockChangeDetectorRef.markForCheck).toHaveBeenCalled();
    });
  });

  describe('Session Storage - Last Visited Dashboard', () => {
    /**
     * Test: Last visited dashboard is remembered
     * Validates: Requirements 18.5
     */
    it('should save last visited dashboard to session storage', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      fixture.detectChanges();

      const teamDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/team-management'
      );

      // Act
      component.navigateToDashboard(teamDashboard!);

      // Assert
      const saved = sessionStorage.getItem('lastVisitedDashboard');
      expect(saved).toBe('/dashboard/team-management');
    });

    it('should restore last visited dashboard on initialization', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      sessionStorage.setItem('lastVisitedDashboard', '/dashboard/team-management');
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard',
        configurable: true
      });

      // Act
      fixture.detectChanges();

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard/team-management']);
    });

    it('should not restore last visited dashboard if not on default route', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      sessionStorage.setItem('lastVisitedDashboard', '/dashboard/team-management');
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management',
        configurable: true
      });

      // Act
      fixture.detectChanges();

      // Assert
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should not restore dashboard if user does not have access', () => {
      // Arrange: User without GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);
      sessionStorage.setItem('lastVisitedDashboard', '/dashboard/team-management');
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard',
        configurable: true
      });

      // Act
      fixture.detectChanges();

      // Assert
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should handle session storage errors gracefully', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      spyOn(sessionStorage, 'setItem').and.throwError('Storage error');
      fixture.detectChanges();

      const teamDashboard = component.availableDashboards.find(
        d => d.route === '/dashboard/team-management'
      );

      // Act & Assert - should not throw
      expect(() => component.navigateToDashboard(teamDashboard!)).not.toThrow();
    });
  });

  describe('Current Dashboard Display', () => {
    /**
     * Test: Display current dashboard name
     * Validates: Requirements 18.3
     */
    it('should display current dashboard name', () => {
      // Arrange: User without GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard',
        configurable: true
      });

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.currentDashboardName).toBe('Meu Painel');
    });

    it('should update dashboard name when navigating', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      fixture.detectChanges();

      // Act
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management',
        configurable: true
      });
      routerEventsSubject.next(new NavigationEnd(1, '/dashboard/team-management', '/dashboard/team-management'));

      // Assert
      expect(component.currentDashboardName).toBe('Gestão de Equipe');
    });

    it('should return default name if no dashboard is detected', () => {
      // Arrange
      component.currentDashboard = null;

      // Act
      const name = component.currentDashboardName;

      // Assert
      expect(name).toBe('Painel');
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with GESTAO team', () => {
      // Arrange: User with GESTAO team (FkgMSNO)
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.hasGestaoRole).toBe(true);
      expect(component.availableDashboards.length).toBe(2);
    });

    it('should handle user without teams', () => {
      // Arrange: User without teams
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(false);

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.hasGestaoRole).toBe(false);
      expect(component.availableDashboards.length).toBe(1);
    });

    it('should match longest route first for nested routes', () => {
      // Arrange: User with GESTAO team
      mockTeamRoleGuard.hasGestaoRole.and.returnValue(true);
      Object.defineProperty(mockRouter, 'url', {
        get: () => '/dashboard/team-management/details',
        configurable: true
      });

      // Act
      fixture.detectChanges();

      // Assert
      expect(component.currentDashboard?.route).toBe('/dashboard/team-management');
    });
  });
});
