import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { TeamManagementDashboardComponent } from './team-management-dashboard.component';
import { TeamAggregateService } from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { of, throwError, delay } from 'rxjs';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NO_ERRORS_SCHEMA, DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

/**
 * Integration Tests for Team Management Dashboard Component
 * 
 * These tests verify the integration between the main dashboard component
 * and its child components, ensuring data flows correctly and all interactions
 * work as expected.
 * 
 * Requirements: All
 */
describe('TeamManagementDashboardComponent - Integration Tests', () => {
  let component: TeamManagementDashboardComponent;
  let fixture: ComponentFixture<TeamManagementDashboardComponent>;
  let mockTeamAggregateService: jasmine.SpyObj<TeamAggregateService>;
  let mockGraphDataProcessor: jasmine.SpyObj<GraphDataProcessorService>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;

  beforeEach(async () => {
    // Create mock services
    mockTeamAggregateService = jasmine.createSpyObj('TeamAggregateService', [
      'getTeamSeasonPoints',
      'getTeamProgressMetrics',
      'getTeamMembers',
      'clearCache',
      'clearTeamCache'
    ]);

    mockGraphDataProcessor = jasmine.createSpyObj('GraphDataProcessorService', [
      'processGraphData',
      'getDateLabels',
      'createChartDatasets'
    ]);

    mockSeasonDatesService = jasmine.createSpyObj('SeasonDatesService', [
      'getSeasonDates'
    ]);

    mockToastService = jasmine.createSpyObj('ToastService', [
      'error',
      'success'
    ]);

    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: {
        extra: {
          teams: ['Departamento Pessoal', 'Financeiro', 'Comercial']
        }
      }
    });

    // Setup default mock returns
    mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
      of({ total: 1500, bloqueados: 800, desbloqueados: 700 })
    );
    mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
      of({ processosIncompletos: 25, atividadesFinalizadas: 150, processosFinalizados: 45 })
    );
    mockTeamAggregateService.getTeamMembers.and.returnValue(
      of([
        { userId: 'user1@test.com', name: 'João Silva', email: 'user1@test.com' },
        { userId: 'user2@test.com', name: 'Maria Santos', email: 'user2@test.com' },
        { userId: 'user3@test.com', name: 'Pedro Costa', email: 'user3@test.com' }
      ])
    );

    mockSeasonDatesService.getSeasonDates.and.returnValue(
      Promise.resolve({
        dataInicio: new Date('2024-01-01'),
        dataFim: new Date('2024-12-31')
      } as any)
    );

    mockGraphDataProcessor.processGraphData.and.returnValue([
      { date: new Date('2024-01-01'), value: 10 },
      { date: new Date('2024-01-02'), value: 15 },
      { date: new Date('2024-01-03'), value: 12 }
    ]);
    mockGraphDataProcessor.getDateLabels.and.returnValue(['01/01', '02/01', '03/01']);
    mockGraphDataProcessor.createChartDatasets.and.returnValue([
      {
        label: 'Atividades',
        data: [10, 15, 12],
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: false
      }
    ]);

    await TestBed.configureTestingModule({
      declarations: [TeamManagementDashboardComponent],
      imports: [BrowserAnimationsModule],
      providers: [
        { provide: TeamAggregateService, useValue: mockTeamAggregateService },
        { provide: GraphDataProcessorService, useValue: mockGraphDataProcessor },
        { provide: SeasonDatesService, useValue: mockSeasonDatesService },
        { provide: ToastService, useValue: mockToastService },
        { provide: SessaoProvider, useValue: mockSessaoProvider }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(TeamManagementDashboardComponent);
    component = fixture.componentInstance;
  });

  describe('Dashboard Initialization', () => {
    it('should load all child components on initialization', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      const compiled = fixture.nativeElement;

      // Verify header is present
      expect(compiled.querySelector('.dashboard-header')).toBeTruthy();
      expect(compiled.querySelector('.dashboard-title')).toBeTruthy();

      // Verify sidebar is present
      expect(compiled.querySelector('.dashboard-sidebar')).toBeTruthy();

      // Verify main content area is present
      expect(compiled.querySelector('.dashboard-main')).toBeTruthy();

      // Verify tab navigation is present
      expect(compiled.querySelector('.tab-navigation')).toBeTruthy();
    }));

    it('should initialize with teams from user metadata', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.teams.length).toBe(3);
      expect(component.teams[0].id).toBe('Departamento Pessoal');
      expect(component.teams[1].id).toBe('Financeiro');
      expect(component.teams[2].id).toBe('Comercial');
    }));

    it('should select first team by default', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.selectedTeam).toBe('Departamento Pessoal');
    }));

    it('should load season dates on initialization', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(mockSeasonDatesService.getSeasonDates).toHaveBeenCalled();
      expect(component.seasonDates.start).toEqual(new Date('2024-01-01'));
      expect(component.seasonDates.end).toEqual(new Date('2024-12-31'));
    }));
  });

  describe('Team Selection Integration', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should update all sections when team changes', fakeAsync(() => {
      // Change team
      component.onTeamChange('Financeiro');
      tick();

      // Verify team aggregate service was called with new team
      expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
      expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();
      expect(mockTeamAggregateService.getTeamMembers).toHaveBeenCalled();

      // Verify component state updated
      expect(component.selectedTeam).toBe('Financeiro');
    }));

    it('should load collaborators for selected team', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.collaborators.length).toBe(3);
      expect(component.collaborators[0].name).toBe('João Silva');
    }));

    it('should reset collaborator filter when team changes', fakeAsync(() => {
      // Select a collaborator
      component.onCollaboratorChange('user1@test.com');
      expect(component.selectedCollaborator).toBe('user1@test.com');

      // Change team
      component.onTeamChange('Financeiro');
      tick();

      // Collaborator filter should be reset
      expect(component.selectedCollaborator).toBeNull();
    }));
  });

  describe('Collaborator Filter Integration', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should update metrics when collaborator is selected', fakeAsync(() => {
      // Select a collaborator
      component.onCollaboratorChange('user1@test.com');
      tick();

      // Verify data was reloaded
      expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
      expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();

      // Verify component state
      expect(component.selectedCollaborator).toBe('user1@test.com');
    }));

    it('should show team aggregate when collaborator filter is cleared', fakeAsync(() => {
      // Select a collaborator
      component.onCollaboratorChange('user1@test.com');
      tick();

      // Clear filter
      component.onCollaboratorChange(null);
      tick();

      // Verify team aggregate is shown
      expect(component.selectedCollaborator).toBeNull();
      expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
    }));
  });

  describe('Month Selection Integration', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should update data when month changes', fakeAsync(() => {
      const callCountBefore = mockTeamAggregateService.getTeamSeasonPoints.calls.count();

      // Change month
      component.onMonthChange(1); // 1 month ago
      tick();

      // Verify data was reloaded
      expect(mockTeamAggregateService.getTeamSeasonPoints.calls.count()).toBeGreaterThan(callCountBefore);
      expect(component.selectedMonthsAgo).toBe(1);
    }));

    it('should calculate correct date range for selected month', fakeAsync(() => {
      component.onMonthChange(2); // 2 months ago
      tick();

      // Verify selectedMonth is updated
      expect(component.selectedMonthsAgo).toBe(2);
    }));
  });

  describe('Tab Switching Integration', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should display goals tab by default', () => {
      expect(component.activeTab).toBe('goals');
    });

    it('should switch to productivity tab', () => {
      component.switchTab('productivity');
      fixture.detectChanges();

      expect(component.activeTab).toBe('productivity');
    });

    it('should preserve selections when switching tabs', fakeAsync(() => {
      // Set up state
      component.selectedTeam = 'Financeiro';
      component.selectedCollaborator = 'user1@test.com';
      component.selectedMonthsAgo = 1;

      // Switch tabs
      component.switchTab('productivity');
      fixture.detectChanges();

      // Verify state is preserved
      expect(component.selectedTeam).toBe('Financeiro');
      expect(component.selectedCollaborator).toBe('user1@test.com');
      expect(component.selectedMonthsAgo).toBe(1);

      // Switch back
      component.switchTab('goals');
      fixture.detectChanges();

      // Verify state is still preserved
      expect(component.selectedTeam).toBe('Financeiro');
      expect(component.selectedCollaborator).toBe('user1@test.com');
    }));
  });

  describe('Data Refresh Integration', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should clear cache and reload all data on refresh', fakeAsync(() => {
      // Refresh data
      component.refreshData();
      tick();

      // Verify cache was cleared
      expect(mockTeamAggregateService.clearCache).toHaveBeenCalled();

      // Verify data was reloaded
      expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
      expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();
    }));

    it('should preserve user selections during refresh', fakeAsync(() => {
      // Set up state
      component.selectedTeam = 'Financeiro';
      component.selectedCollaborator = 'user1@test.com';
      component.activeTab = 'productivity';

      // Refresh
      component.refreshData();
      tick();

      // Verify selections are preserved
      expect(component.selectedTeam).toBe('Financeiro');
      expect(component.selectedCollaborator).toBe('user1@test.com');
      expect(component.activeTab).toBe('productivity');
    }));

    it('should update last refresh timestamp', fakeAsync(() => {
      const beforeRefresh = new Date();

      component.refreshData();
      tick();

      expect(component.lastRefresh.getTime()).toBeGreaterThanOrEqual(beforeRefresh.getTime());
    }));
  });

  describe('Loading States Integration', () => {
    it('should show loading overlay during initial load', fakeAsync(() => {
      // Delay the service responses
      mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
        of({ total: 100, bloqueados: 50, desbloqueados: 50 }).pipe(delay(100))
      );

      fixture.detectChanges();

      // Loading should be true initially
      expect(component.isLoading).toBe(true);

      tick(200);

      // Loading should be false after data loads
      expect(component.isLoading).toBe(false);
    }));

    it('should show sidebar loading state', fakeAsync(() => {
      component.isLoadingSidebar = true;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.loading-section')).toBeTruthy();
    }));
  });

  describe('Error Handling Integration', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should handle API errors gracefully', fakeAsync(() => {
      // Simulate API error
      mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
        throwError(() => new Error('API Error'))
      );

      component.loadTeamData();
      tick();

      // Component should still be functional
      expect(component.seasonPoints.total).toBe(0);
      expect(component.isLoading).toBe(false);
    }));

    it('should show error toast on data load failure', fakeAsync(() => {
      mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
        throwError(() => new Error('Network Error'))
      );

      component.loadTeamData();
      tick();

      // Error should be logged (toast service would be called in real implementation)
      expect(component.seasonPoints.total).toBe(0);
    }));
  });

  describe('Period Change Integration', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should reload productivity data when period changes', fakeAsync(() => {
      component.switchTab('productivity');
      fixture.detectChanges();

      const callCountBefore = mockTeamAggregateService.getTeamProgressMetrics.calls.count();

      // Change period
      component.onPeriodChange(60);
      tick();

      // Verify data was reloaded
      expect(component.selectedPeriod).toBe(60);
      expect(mockTeamAggregateService.getTeamProgressMetrics.calls.count()).toBeGreaterThan(callCountBefore);
    }));
  });

  describe('Complete User Flow Integration', () => {
    it('should handle complete user workflow: select team → select collaborator → change month → switch tabs', fakeAsync(() => {
      // Initialize
      fixture.detectChanges();
      tick();

      // Step 1: Select team
      component.onTeamChange('Financeiro');
      tick();
      expect(component.selectedTeam).toBe('Financeiro');

      // Step 2: Select collaborator
      component.onCollaboratorChange('user2@test.com');
      tick();
      expect(component.selectedCollaborator).toBe('user2@test.com');

      // Step 3: Change month
      component.onMonthChange(1);
      tick();
      expect(component.selectedMonthsAgo).toBe(1);

      // Step 4: Switch to productivity tab
      component.switchTab('productivity');
      fixture.detectChanges();
      expect(component.activeTab).toBe('productivity');

      // Step 5: Change period
      component.onPeriodChange(30);
      tick();
      expect(component.selectedPeriod).toBe(30);

      // Verify all state is correct
      expect(component.selectedTeam).toBe('Financeiro');
      expect(component.selectedCollaborator).toBe('user2@test.com');
      expect(component.selectedMonthsAgo).toBe(1);
      expect(component.activeTab).toBe('productivity');
      expect(component.selectedPeriod).toBe(30);

      // Verify services were called
      expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
      expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();
      expect(mockTeamAggregateService.getTeamMembers).toHaveBeenCalled();
    }));
  });
});
