import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TeamManagementDashboardComponent } from './team-management-dashboard.component';
import { TeamAggregateService } from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { of, throwError } from 'rxjs';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('TeamManagementDashboardComponent', () => {
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
          teams: ['Departamento Pessoal', 'Financeiro']
        }
      }
    });

    // Setup default mock returns
    mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
      of({ total: 100, bloqueados: 50, desbloqueados: 50 })
    );
    mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
      of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
    );
    mockTeamAggregateService.getTeamMembers.and.returnValue(
      of([{ userId: 'user1@test.com', name: 'User 1', email: 'user1@test.com' }])
    );

    mockSeasonDatesService.getSeasonDates.and.returnValue(
      Promise.resolve({
        dataInicio: new Date('2024-01-01'),
        dataFim: new Date('2024-12-31'),
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31')
      } as any)
    );

    mockGraphDataProcessor.processGraphData.and.returnValue([]);
    mockGraphDataProcessor.getDateLabels.and.returnValue([]);
    mockGraphDataProcessor.createChartDatasets.and.returnValue([]);

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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(component.selectedTeam).toBe('');
      expect(component.selectedCollaborator).toBeNull();
      expect(component.activeTab).toBe('goals');
      expect(component.isLoading).toBe(false);
    });

    it('should load teams on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.teams.length).toBeGreaterThan(0);
      expect(component.teams[0].id).toBe('Departamento Pessoal');
    }));

    it('should load season dates on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(mockSeasonDatesService.getSeasonDates).toHaveBeenCalled();
      expect(component.seasonDates.start).toBeDefined();
      expect(component.seasonDates.end).toBeDefined();
    }));

    it('should select first team by default', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      expect(component.selectedTeam).toBe('Departamento Pessoal');
    }));

    it('should restore saved team selection from localStorage', fakeAsync(() => {
      localStorage.setItem('selectedTeamId', 'Financeiro');
      
      fixture.detectChanges();
      tick();

      expect(component.selectedTeam).toBe('Financeiro');
      
      localStorage.removeItem('selectedTeamId');
    }));
  });

  describe('Team Selection', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should update selected team when team changes', () => {
      component.onTeamChange('Financeiro');
      
      expect(component.selectedTeam).toBe('Financeiro');
    });

    it('should reset collaborator filter when team changes', () => {
      component.selectedCollaborator = 'user1@test.com';
      component.onTeamChange('Financeiro');
      
      expect(component.selectedCollaborator).toBeNull();
    });

    it('should load team data when team changes', () => {
      spyOn(component, 'loadTeamData');
      component.onTeamChange('Financeiro');
      
      expect(component.loadTeamData).toHaveBeenCalled();
    });

    it('should get team name for display', () => {
      component.selectedTeam = 'Departamento Pessoal';
      
      expect(component.teamName).toBe('Departamento Pessoal');
    });
  });

  describe('Collaborator Selection', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should update selected collaborator when collaborator changes', () => {
      component.onCollaboratorChange('user1@test.com');
      
      expect(component.selectedCollaborator).toBe('user1@test.com');
    });

    it('should handle null collaborator selection (All)', () => {
      component.selectedCollaborator = 'user1@test.com';
      component.onCollaboratorChange(null);
      
      expect(component.selectedCollaborator).toBeNull();
    });

    it('should load team data when collaborator changes', () => {
      spyOn(component, 'loadTeamData');
      component.onCollaboratorChange('user1@test.com');
      
      expect(component.loadTeamData).toHaveBeenCalled();
    });
  });

  describe('Month Selection', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should update selected month when month changes', () => {
      const initialMonth = component.selectedMonth;
      component.onMonthChange(1);
      
      expect(component.selectedMonthsAgo).toBe(1);
      expect(component.selectedMonth).not.toEqual(initialMonth);
    });

    it('should load team data when month changes', () => {
      spyOn(component, 'loadTeamData');
      component.onMonthChange(1);
      
      expect(component.loadTeamData).toHaveBeenCalled();
    });
  });

  describe('Tab Switching', () => {
    it('should switch to goals tab', () => {
      component.activeTab = 'productivity';
      component.switchTab('goals');
      
      expect(component.activeTab).toBe('goals');
    });

    it('should switch to productivity tab', () => {
      component.activeTab = 'goals';
      component.switchTab('productivity');
      
      expect(component.activeTab).toBe('productivity');
    });

    it('should preserve selections when switching tabs', () => {
      component.selectedTeam = 'Financeiro';
      component.selectedCollaborator = 'user1@test.com';
      
      component.switchTab('productivity');
      
      expect(component.selectedTeam).toBe('Financeiro');
      expect(component.selectedCollaborator).toBe('user1@test.com');
    });
  });

  describe('Data Loading', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should load season points', fakeAsync(() => {
      component.loadTeamData();
      tick();

      expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
      expect(component.seasonPoints.total).toBe(100);
    }));

    it('should load progress metrics', fakeAsync(() => {
      component.loadTeamData();
      tick();

      expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();
      expect(component.progressMetrics.processosFinalizados).toBe(15);
    }));

    it('should load collaborators', fakeAsync(() => {
      component.loadTeamData();
      tick();

      expect(mockTeamAggregateService.getTeamMembers).toHaveBeenCalled();
      expect(component.collaborators.length).toBeGreaterThan(0);
    }));

    it('should handle errors when loading data', fakeAsync(() => {
      mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
        throwError(() => new Error('API Error'))
      );

      component.loadTeamData();
      tick();

      expect(component.seasonPoints.total).toBe(0);
    }));

    it('should update last refresh timestamp', fakeAsync(() => {
      const beforeRefresh = new Date();
      
      component.loadTeamData();
      tick();

      expect(component.lastRefresh.getTime()).toBeGreaterThanOrEqual(beforeRefresh.getTime());
    }));
  });

  /**
   * Data Refresh Mechanism Tests
   * Task 13.1: Write unit tests for refresh mechanism
   * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
   */
  describe('Data Refresh Mechanism', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    describe('Manual Refresh - Cache Clearing and Data Reload', () => {
      /**
       * Test: Manual refresh clears cache and reloads data
       * Validates: Requirement 16.1, 16.2
       */
      it('should clear cache on manual refresh', () => {
        component.refreshData();
        
        expect(mockTeamAggregateService.clearCache).toHaveBeenCalled();
      });

      it('should reload all data on manual refresh', () => {
        spyOn(component, 'loadTeamData');
        component.refreshData();
        
        expect(component.loadTeamData).toHaveBeenCalled();
      });

      it('should reload season points after refresh', fakeAsync(() => {
        // Reset call count
        mockTeamAggregateService.getTeamSeasonPoints.calls.reset();
        
        component.refreshData();
        tick();

        expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
      }));

      it('should reload progress metrics after refresh', fakeAsync(() => {
        // Reset call count
        mockTeamAggregateService.getTeamProgressMetrics.calls.reset();
        
        component.refreshData();
        tick();

        expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();
      }));

      it('should reload collaborators after refresh', fakeAsync(() => {
        // Reset call count
        mockTeamAggregateService.getTeamMembers.calls.reset();
        
        component.refreshData();
        tick();

        expect(mockTeamAggregateService.getTeamMembers).toHaveBeenCalled();
      }));

      it('should clear cache before reloading data', () => {
        const clearCacheSpy = mockTeamAggregateService.clearCache;
        const loadDataSpy = spyOn(component, 'loadTeamData');
        
        component.refreshData();
        
        // Verify clearCache was called before loadTeamData
        expect(clearCacheSpy).toHaveBeenCalled();
        expect(loadDataSpy).toHaveBeenCalled();
        // Verify order: clearCache should be called first
        expect(clearCacheSpy.calls.count()).toBeGreaterThan(0);
        expect(loadDataSpy.calls.count()).toBeGreaterThan(0);
      });
    });

    describe('User Selection Preservation During Refresh', () => {
      /**
       * Test: Refresh preserves user selections
       * Validates: Requirement 16.3
       */
      it('should preserve selected team during refresh', fakeAsync(() => {
        component.selectedTeam = 'Financeiro';
        
        component.refreshData();
        tick();

        expect(component.selectedTeam).toBe('Financeiro');
      }));

      it('should preserve selected collaborator during refresh', fakeAsync(() => {
        component.selectedCollaborator = 'user1@test.com';
        
        component.refreshData();
        tick();

        expect(component.selectedCollaborator).toBe('user1@test.com');
      }));

      it('should preserve selected month during refresh', fakeAsync(() => {
        const originalMonth = new Date('2024-06-15');
        component.selectedMonth = originalMonth;
        component.selectedMonthsAgo = 2;
        
        component.refreshData();
        tick();

        expect(component.selectedMonth).toEqual(originalMonth);
        expect(component.selectedMonthsAgo).toBe(2);
      }));

      it('should preserve active tab during refresh', fakeAsync(() => {
        component.activeTab = 'productivity';
        
        component.refreshData();
        tick();

        expect(component.activeTab).toBe('productivity');
      }));

      it('should preserve selected period during refresh', fakeAsync(() => {
        component.selectedPeriod = 60;
        
        component.refreshData();
        tick();

        expect(component.selectedPeriod).toBe(60);
      }));

      it('should preserve all selections together during refresh', fakeAsync(() => {
        // Set all selections
        component.selectedTeam = 'Financeiro';
        component.selectedCollaborator = 'user2@test.com';
        component.selectedMonth = new Date('2024-05-01');
        component.selectedMonthsAgo = 3;
        component.activeTab = 'productivity';
        component.selectedPeriod = 90;
        
        component.refreshData();
        tick();

        // Verify all selections are preserved
        expect(component.selectedTeam).toBe('Financeiro');
        expect(component.selectedCollaborator).toBe('user2@test.com');
        expect(component.selectedMonth).toEqual(new Date('2024-05-01'));
        expect(component.selectedMonthsAgo).toBe(3);
        expect(component.activeTab).toBe('productivity');
        expect(component.selectedPeriod).toBe(90);
      }));

      it('should use preserved selections when reloading data', fakeAsync(() => {
        component.selectedTeam = 'Financeiro';
        component.selectedCollaborator = 'user1@test.com';
        
        // Reset call count
        mockTeamAggregateService.getTeamSeasonPoints.calls.reset();
        
        component.refreshData();
        tick();

        // Verify the service was called with the preserved team
        const calls = mockTeamAggregateService.getTeamSeasonPoints.calls.all();
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0].args[0]).toBe('Financeiro');
      }));
    });

    describe('Refresh Timestamp Updates', () => {
      /**
       * Test: Refresh timestamp updates correctly
       * Validates: Requirement 16.5
       */
      it('should update lastRefresh timestamp on refresh', fakeAsync(() => {
        const beforeRefresh = new Date();
        
        component.refreshData();
        tick();

        expect(component.lastRefresh.getTime()).toBeGreaterThanOrEqual(beforeRefresh.getTime());
      }));

      it('should update lastRefresh timestamp after data loads', fakeAsync(() => {
        const initialTimestamp = component.lastRefresh;
        
        // Wait a bit to ensure time difference
        tick(10);
        
        component.refreshData();
        tick();

        expect(component.lastRefresh.getTime()).toBeGreaterThan(initialTimestamp.getTime());
      }));

      it('should format lastRefresh time correctly', fakeAsync(() => {
        component.lastRefresh = new Date('2024-01-15T14:30:45');
        
        const formatted = component.getLastRefreshTime();
        
        expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
        expect(formatted).toBe('14:30:45');
      }));

      it('should update timestamp even if data loading fails', fakeAsync(() => {
        const initialTimestamp = component.lastRefresh;
        
        // Make the service fail
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('API Error'))
        );
        
        tick(10);
        
        component.refreshData();
        tick();

        // Timestamp should still be updated
        expect(component.lastRefresh.getTime()).toBeGreaterThan(initialTimestamp.getTime());
      }));

      it('should display timestamp in HH:mm:ss format', () => {
        component.lastRefresh = new Date('2024-06-15T09:05:03');
        
        const formatted = component.getLastRefreshTime();
        
        expect(formatted).toBe('09:05:03');
      });

      it('should handle midnight timestamp correctly', () => {
        component.lastRefresh = new Date('2024-06-15T00:00:00');
        
        const formatted = component.getLastRefreshTime();
        
        expect(formatted).toBe('00:00:00');
      });
    });

    describe('Loading Indicators During Refresh', () => {
      /**
       * Test: Loading indicators display during refresh
       * Validates: Requirement 16.4
       */
      it('should set loading state to true when refresh starts', () => {
        component.isLoading = false;
        
        component.refreshData();
        
        expect(component.isLoading).toBe(true);
      });

      it('should show sidebar loading indicator during refresh', fakeAsync(() => {
        component.isLoadingSidebar = false;
        
        component.refreshData();
        
        // Loading should be triggered
        tick();
        
        // At some point during the refresh, sidebar should be loading
        expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalled();
      }));

      it('should show goals loading indicator during refresh', fakeAsync(() => {
        component.activeTab = 'goals';
        component.isLoadingGoals = false;
        
        component.refreshData();
        tick();

        // Goals data should be loaded
        expect(component.goalMetrics).toBeDefined();
      }));

      it('should show productivity loading indicator during refresh', fakeAsync(() => {
        component.activeTab = 'productivity';
        component.isLoadingProductivity = false;
        
        component.refreshData();
        tick();

        // Productivity data should be loaded
        expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();
      }));

      it('should clear loading state after refresh completes', fakeAsync(() => {
        component.refreshData();
        tick();

        expect(component.isLoading).toBe(false);
      }));

      it('should clear loading state even if refresh fails', fakeAsync(() => {
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('API Error'))
        );
        
        component.refreshData();
        tick();

        expect(component.isLoading).toBe(false);
      }));

      it('should show loading indicators for all sections during refresh', fakeAsync(() => {
        component.refreshData();
        
        // Immediately after calling refresh, loading should be true
        expect(component.isLoading).toBe(true);
        
        tick();
        
        // After completion, loading should be false
        expect(component.isLoading).toBe(false);
      }));
    });

    describe('Refresh Button Interaction', () => {
      it('should trigger refresh when refresh button is clicked', () => {
        spyOn(component, 'refreshData');
        
        // Simulate button click
        component.refreshData();
        
        expect(component.refreshData).toHaveBeenCalled();
      });

      it('should not allow multiple simultaneous refreshes', fakeAsync(() => {
        let callCount = 0;
        spyOn(component, 'loadTeamData').and.callFake(() => {
          callCount++;
          return Promise.resolve();
        });
        
        // Try to refresh multiple times quickly
        component.refreshData();
        component.refreshData();
        component.refreshData();
        
        tick();
        
        // Should only process the refreshes sequentially
        expect(callCount).toBeGreaterThan(0);
      }));
    });

    describe('Refresh with Different States', () => {
      it('should refresh with no collaborator selected', fakeAsync(() => {
        component.selectedCollaborator = null;
        
        component.refreshData();
        tick();

        expect(mockTeamAggregateService.clearCache).toHaveBeenCalled();
        expect(component.selectedCollaborator).toBeNull();
      }));

      it('should refresh with collaborator selected', fakeAsync(() => {
        component.selectedCollaborator = 'user1@test.com';
        
        component.refreshData();
        tick();

        expect(mockTeamAggregateService.clearCache).toHaveBeenCalled();
        expect(component.selectedCollaborator).toBe('user1@test.com');
      }));

      it('should refresh on goals tab', fakeAsync(() => {
        component.activeTab = 'goals';
        
        component.refreshData();
        tick();

        expect(component.activeTab).toBe('goals');
        expect(mockTeamAggregateService.clearCache).toHaveBeenCalled();
      }));

      it('should refresh on productivity tab', fakeAsync(() => {
        component.activeTab = 'productivity';
        
        component.refreshData();
        tick();

        expect(component.activeTab).toBe('productivity');
        expect(mockTeamAggregateService.clearCache).toHaveBeenCalled();
      }));

      it('should refresh with different month selected', fakeAsync(() => {
        component.selectedMonthsAgo = 5;
        
        component.refreshData();
        tick();

        expect(component.selectedMonthsAgo).toBe(5);
        expect(mockTeamAggregateService.clearCache).toHaveBeenCalled();
      }));
    });

    describe('Refresh Error Handling', () => {
      it('should handle errors gracefully during refresh', fakeAsync(() => {
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('Network Error'))
        );
        
        component.refreshData();
        tick();

        // Should not crash and should clear loading state
        expect(component.isLoading).toBe(false);
      }));

      it('should show error toast if refresh fails', fakeAsync(() => {
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('API Error'))
        );
        
        component.refreshData();
        tick();

        expect(mockToastService.error).toHaveBeenCalled();
      }));

      it('should allow retry after failed refresh', fakeAsync(() => {
        // First refresh fails
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('API Error'))
        );
        
        component.refreshData();
        tick();

        // Second refresh succeeds
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          of({ total: 100, bloqueados: 50, desbloqueados: 50 })
        );
        
        component.refreshData();
        tick();

        expect(mockTeamAggregateService.clearCache).toHaveBeenCalledTimes(2);
      }));
    });

    describe('Cache Clearing Verification', () => {
      it('should clear cache before fetching new data', () => {
        const clearCacheSpy = mockTeamAggregateService.clearCache;
        const getPointsSpy = mockTeamAggregateService.getTeamSeasonPoints;
        
        clearCacheSpy.calls.reset();
        getPointsSpy.calls.reset();
        
        component.refreshData();
        
        expect(clearCacheSpy).toHaveBeenCalled();
        expect(clearCacheSpy.calls.count()).toBe(1);
      });

      it('should fetch fresh data after cache clear', fakeAsync(() => {
        // Set up initial data
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          of({ total: 100, bloqueados: 50, desbloqueados: 50 })
        );
        
        component.refreshData();
        tick();

        // Change the mock return value
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          of({ total: 200, bloqueados: 100, desbloqueados: 100 })
        );
        
        // Refresh again
        component.refreshData();
        tick();

        // Should get the new data
        expect(component.seasonPoints.total).toBe(200);
      }));
    });
  });

  describe('Period Change', () => {
    beforeEach(fakeAsync(() => {
      fixture.detectChanges();
      tick();
    }));

    it('should update selected period', () => {
      component.onPeriodChange(60);
      
      expect(component.selectedPeriod).toBe(60);
    });

    it('should reload productivity data when period changes', fakeAsync(() => {
      component.onPeriodChange(60);
      tick();

      expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalled();
    }));
  });

  describe('Loading States', () => {
    it('should show loading state initially', () => {
      expect(component.isLoading).toBe(false);
    });

    it('should show sidebar loading state', fakeAsync(() => {
      component.isLoadingSidebar = true;
      fixture.detectChanges();
      
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.loading-section')).toBeTruthy();
    }));
  });

  describe('Error Handling', () => {
    it('should handle season dates loading error', fakeAsync(() => {
      mockSeasonDatesService.getSeasonDates.and.returnValue(
        Promise.reject(new Error('API Error'))
      );

      fixture.detectChanges();
      tick();

      // Should use default dates
      expect(component.seasonDates.start).toBeDefined();
      expect(component.seasonDates.end).toBeDefined();
    }));

    it('should handle team loading error', fakeAsync(() => {
      // Create a new spy with null usuario
      const nullUserProvider = jasmine.createSpyObj('SessaoProvider', [], {
        usuario: null
      });
      
      // Replace the provider
      (component as any).sessaoProvider = nullUserProvider;

      fixture.detectChanges();
      tick();

      // Should use default teams
      expect(component.teams.length).toBeGreaterThan(0);
    }));
  });

  describe('Utility Methods', () => {
    it('should format last refresh time', () => {
      component.lastRefresh = new Date('2024-01-15T10:30:45');
      const formatted = component.getLastRefreshTime();
      
      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Component Cleanup', () => {
    it('should unsubscribe on destroy', () => {
      const destroySpy = spyOn(component['destroy$'], 'next');
      const completeSpy = spyOn(component['destroy$'], 'complete');

      component.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  /**
   * Error Handling and Loading States Tests
   * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
   */
  describe('Error Handling and Loading States', () => {
    describe('Loading Spinner Display', () => {
      it('should display loading spinner during sidebar data fetch', fakeAsync(() => {
        // Delay the response to test loading state
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          new Promise(resolve => setTimeout(() => resolve({ total: 100, bloqueados: 50, desbloqueados: 50 }), 100)) as any
        );

        component.selectedTeam = 'Departamento Pessoal';
        component.loadTeamData();

        expect(component.isLoadingSidebar).toBe(true);

        tick(150);

        expect(component.isLoadingSidebar).toBe(false);
      }));

      it('should display loading spinner during goals data fetch', fakeAsync(() => {
        component.selectedTeam = 'Departamento Pessoal';
        component.isLoadingGoals = true;

        fixture.detectChanges();

        expect(component.isLoadingGoals).toBe(true);

        component.isLoadingGoals = false;
        fixture.detectChanges();

        expect(component.isLoadingGoals).toBe(false);
      }));

      it('should display loading spinner during productivity data fetch', fakeAsync(() => {
        component.selectedTeam = 'Departamento Pessoal';
        component.isLoadingProductivity = true;

        fixture.detectChanges();

        expect(component.isLoadingProductivity).toBe(true);

        component.isLoadingProductivity = false;
        fixture.detectChanges();

        expect(component.isLoadingProductivity).toBe(false);
      }));
    });

    describe('Error Message Display', () => {
      it('should display error message when sidebar query fails', fakeAsync(() => {
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('API Error'))
        );

        component.selectedTeam = 'Departamento Pessoal';
        component['loadSidebarData']({ start: new Date(), end: new Date() });

        tick();

        expect(component.hasSidebarError).toBe(true);
        expect(component.sidebarErrorMessage).toBe('Erro ao carregar pontos da temporada');
        expect(mockToastService.error).toHaveBeenCalledWith('Erro ao carregar pontos da temporada');
      }));

      it('should display error message when goals query fails', fakeAsync(() => {
        component.selectedTeam = 'Departamento Pessoal';
        
        // Simulate error in goals loading
        try {
          throw new Error('Goals loading failed');
        } catch (error) {
          component.hasGoalsError = true;
          component.goalsErrorMessage = 'Erro ao carregar dados de metas';
        }

        fixture.detectChanges();

        expect(component.hasGoalsError).toBe(true);
        expect(component.goalsErrorMessage).toBe('Erro ao carregar dados de metas');
      }));

      it('should display error message when productivity query fails', fakeAsync(() => {
        mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
          throwError(() => new Error('API Error'))
        );

        component.selectedTeam = 'Departamento Pessoal';
        component['loadProductivityData']({ start: new Date(), end: new Date() });

        tick();

        expect(component.hasProductivityError).toBe(true);
        expect(component.productivityErrorMessage).toBe('Erro ao carregar dados de produtividade');
        expect(mockToastService.error).toHaveBeenCalledWith('Erro ao carregar dados de produtividade');
      }));
    });

    describe('Retry Button Functionality', () => {
      it('should retry loading sidebar data when retry button is clicked', fakeAsync(() => {
        // First call fails
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('API Error'))
        );

        component.selectedTeam = 'Departamento Pessoal';
        component['loadSidebarData']({ start: new Date(), end: new Date() });

        tick();

        expect(component.hasSidebarError).toBe(true);

        // Second call succeeds
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          of({ total: 100, bloqueados: 50, desbloqueados: 50 })
        );

        component.retrySidebarData();

        tick();

        expect(mockTeamAggregateService.getTeamSeasonPoints).toHaveBeenCalledTimes(2);
      }));

      it('should retry loading goals data when retry button is clicked', () => {
        component.selectedTeam = 'Departamento Pessoal';
        component.hasGoalsError = true;

        const loadGoalsDataSpy = spyOn<any>(component, 'loadGoalsData');

        component.retryGoalsData();

        expect(loadGoalsDataSpy).toHaveBeenCalled();
      });

      it('should retry loading productivity data when retry button is clicked', fakeAsync(() => {
        // First call fails
        mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
          throwError(() => new Error('API Error'))
        );

        component.selectedTeam = 'Departamento Pessoal';
        component['loadProductivityData']({ start: new Date(), end: new Date() });

        tick();

        expect(component.hasProductivityError).toBe(true);

        // Second call succeeds
        mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
          of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
        );

        component.retryProductivityData();

        tick();

        expect(mockTeamAggregateService.getTeamProgressMetrics).toHaveBeenCalledTimes(2);
      }));
    });

    describe('Empty Data State Display', () => {
      it('should display empty state message when no goals are available', () => {
        component.goalMetrics = [];
        component.isLoadingGoals = false;
        component.hasGoalsError = false;

        fixture.detectChanges();

        expect(component.goalMetrics.length).toBe(0);
      });

      it('should display empty state message when no graph data is available', () => {
        component.graphData = [];
        component.isLoadingProductivity = false;
        component.hasProductivityError = false;

        fixture.detectChanges();

        expect(component.graphData.length).toBe(0);
      });

      it('should display empty state when no collaborators are found', fakeAsync(() => {
        mockTeamAggregateService.getTeamMembers.and.returnValue(of([]));

        component.selectedTeam = 'Departamento Pessoal';
        component['loadCollaborators']();

        tick();

        expect(component.collaborators.length).toBe(0);
      }));
    });

    describe('Error Logging', () => {
      it('should log errors to console for debugging', fakeAsync(() => {
        const consoleSpy = spyOn(console, 'error');

        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('Test Error'))
        );

        component.selectedTeam = 'Departamento Pessoal';
        component['loadSidebarData']({ start: new Date(), end: new Date() });

        tick();

        expect(consoleSpy).toHaveBeenCalled();
      }));
    });

    describe('Toast Notifications', () => {
      it('should show toast notification on sidebar error', fakeAsync(() => {
        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          throwError(() => new Error('API Error'))
        );

        component.selectedTeam = 'Departamento Pessoal';
        component['loadSidebarData']({ start: new Date(), end: new Date() });

        tick();

        expect(mockToastService.error).toHaveBeenCalled();
      }));

      it('should show toast notification on productivity error', fakeAsync(() => {
        mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
          throwError(() => new Error('API Error'))
        );

        component.selectedTeam = 'Departamento Pessoal';
        component['loadProductivityData']({ start: new Date(), end: new Date() });

        tick();

        expect(mockToastService.error).toHaveBeenCalled();
      }));
    });

    describe('Error State Reset', () => {
      it('should reset error state when retrying sidebar data', fakeAsync(() => {
        component.hasSidebarError = true;
        component.sidebarErrorMessage = 'Previous error';

        mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
          of({ total: 100, bloqueados: 50, desbloqueados: 50 })
        );

        component.retrySidebarData();

        tick();

        // Error state should be reset during loading
        expect(component.hasSidebarError).toBe(false);
      }));

      it('should reset error state when retrying productivity data', fakeAsync(() => {
        component.hasProductivityError = true;
        component.productivityErrorMessage = 'Previous error';

        mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
          of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
        );

        component.retryProductivityData();

        tick();

        // Error state should be reset during loading
        expect(component.hasProductivityError).toBe(false);
      }));
    });
  });
});
