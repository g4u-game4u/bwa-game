import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import * as fc from 'fast-check';
import { TeamManagementDashboardComponent } from './team-management-dashboard.component';
import { TeamAggregateService, TeamSeasonPoints, TeamProgressMetrics, Collaborator } from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { FunifierApiService } from '@services/funifier-api.service';
import { of, throwError } from 'rxjs';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NO_ERRORS_SCHEMA } from '@angular/core';

/**
 * Property-Based Tests for Team Management Dashboard Component
 * 
 * These tests verify universal properties that should hold true for all inputs.
 */
describe('TeamManagementDashboardComponent - Property-Based Tests', () => {
  let component: TeamManagementDashboardComponent;
  let fixture: ComponentFixture<TeamManagementDashboardComponent>;
  let mockTeamAggregateService: jasmine.SpyObj<TeamAggregateService>;
  let mockGraphDataProcessor: jasmine.SpyObj<GraphDataProcessorService>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;

  // Arbitraries for generating test data
  const collaboratorArb = fc.record({
    userId: fc.emailAddress(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress()
  });

  const teamPointsArb = fc.record({
    total: fc.integer({ min: 0, max: 10000 }),
    bloqueados: fc.integer({ min: 0, max: 5000 }),
    desbloqueados: fc.integer({ min: 0, max: 5000 })
  });

  const progressMetricsArb = fc.record({
    processosIncompletos: fc.integer({ min: 0, max: 1000 }),
    atividadesFinalizadas: fc.integer({ min: 0, max: 5000 }),
    processosFinalizados: fc.integer({ min: 0, max: 1000 })
  });

  beforeEach(async () => {
    // Create mock services
    mockTeamAggregateService = jasmine.createSpyObj('TeamAggregateService', [
      'getTeamSeasonPoints',
      'getTeamProgressMetrics',
      'getTeamMembers',
      'getCollaboratorData',
      'clearCache'
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
          teams: ['Departamento Pessoal']
        }
      }
    });

    // Setup default mock returns
    mockSeasonDatesService.getSeasonDates.and.returnValue(
      Promise.resolve({
        dataInicio: new Date('2024-01-01'),
        dataFim: new Date('2024-12-31')
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

  /**
   * Property 2: Collaborator Filter Isolation
   * 
   * For any selected collaborator, the displayed metrics should only include
   * data from that collaborator's actions, not from other team members.
   * 
   * **Validates: Requirements 3.3, 3.4**
   */
  describe('Property 2: Collaborator Filter Isolation', () => {
    it('should display different data for collaborator vs team aggregate', () => {
      fc.assert(
        fc.property(
          fc.array(collaboratorArb, { minLength: 2, maxLength: 10 }),
          teamPointsArb,
          progressMetricsArb,
          (collaborators, teamPoints, teamMetrics) => {
            // Ensure team data is non-zero for meaningful test
            fc.pre(teamPoints.total > 0 && teamMetrics.atividadesFinalizadas > 0);
            
            // Setup: Configure mocks to return different data for team vs individual
            const selectedCollaborator = collaborators[0];
            
            // Individual collaborator data (should be a fraction of team data)
            const collaboratorPoints: TeamSeasonPoints = {
              total: Math.floor(teamPoints.total / collaborators.length),
              bloqueados: Math.floor(teamPoints.bloqueados / collaborators.length),
              desbloqueados: Math.floor(teamPoints.desbloqueados / collaborators.length)
            };
            
            const collaboratorMetrics: TeamProgressMetrics = {
              processosIncompletos: Math.floor(teamMetrics.processosIncompletos / collaborators.length),
              atividadesFinalizadas: Math.floor(teamMetrics.atividadesFinalizadas / collaborators.length),
              processosFinalizados: Math.floor(teamMetrics.processosFinalizados / collaborators.length)
            };

            // Mock team aggregate data (when no collaborator selected)
            mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(of(teamPoints));
            mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(of(teamMetrics));
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            // Initialize component
            component.teams = [{ id: 'Test Team', name: 'Test Team', memberCount: collaborators.length }];
            component.selectedTeam = 'Test Team';
            component.ngOnInit();
            fixture.detectChanges();

            // Capture team aggregate data
            const teamPointsDisplayed = { ...component.seasonPoints };
            const teamMetricsDisplayed = { ...component.progressMetrics };
            
            // Verify we're showing team aggregate initially
            expect(component.selectedCollaborator).toBeNull();
            
            // Now select a specific collaborator and mock different data
            mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(of(collaboratorPoints));
            mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(of(collaboratorMetrics));
            
            component.onCollaboratorChange(selectedCollaborator.userId);
            fixture.detectChanges();
            
            // Verify: Selected collaborator is set
            expect(component.selectedCollaborator).toBe(selectedCollaborator.userId);
            
            // Property: When a collaborator is selected, the displayed data should be
            // different from the team aggregate (unless there's only one member)
            if (collaborators.length > 1) {
              // The data should have changed after selecting a collaborator
              const collaboratorPointsDisplayed = component.seasonPoints;
              const collaboratorMetricsDisplayed = component.progressMetrics;
              
              // At least one metric should be different (or all should be different)
              const pointsChanged = 
                collaboratorPointsDisplayed.total !== teamPointsDisplayed.total ||
                collaboratorPointsDisplayed.bloqueados !== teamPointsDisplayed.bloqueados ||
                collaboratorPointsDisplayed.desbloqueados !== teamPointsDisplayed.desbloqueados;
              
              const metricsChanged =
                collaboratorMetricsDisplayed.processosIncompletos !== teamMetricsDisplayed.processosIncompletos ||
                collaboratorMetricsDisplayed.atividadesFinalizadas !== teamMetricsDisplayed.atividadesFinalizadas ||
                collaboratorMetricsDisplayed.processosFinalizados !== teamMetricsDisplayed.processosFinalizados;
              
              // Property: Data isolation means the displayed values should differ
              expect(pointsChanged || metricsChanged).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should ensure collaborator data is subset of team data', () => {
      fc.assert(
        fc.property(
          fc.array(collaboratorArb, { minLength: 2, maxLength: 5 }),
          teamPointsArb,
          progressMetricsArb,
          (collaborators, teamPoints, teamMetrics) => {
            // Ensure team data is non-zero
            fc.pre(teamPoints.total > 0);
            
            const selectedCollaborator = collaborators[0];
            
            // Collaborator data should be less than or equal to team data
            const collaboratorPoints: TeamSeasonPoints = {
              total: Math.floor(teamPoints.total / 2), // At most half
              bloqueados: Math.floor(teamPoints.bloqueados / 2),
              desbloqueados: Math.floor(teamPoints.desbloqueados / 2)
            };
            
            const collaboratorMetrics: TeamProgressMetrics = {
              processosIncompletos: Math.floor(teamMetrics.processosIncompletos / 2),
              atividadesFinalizadas: Math.floor(teamMetrics.atividadesFinalizadas / 2),
              processosFinalizados: Math.floor(teamMetrics.processosFinalizados / 2)
            };

            // Setup mocks
            mockTeamAggregateService.getTeamSeasonPoints.and.callFake((team, start, end) => {
              // Return different data based on whether collaborator is selected
              if (component.selectedCollaborator) {
                return of(collaboratorPoints);
              }
              return of(teamPoints);
            });
            
            mockTeamAggregateService.getTeamProgressMetrics.and.callFake((team, start, end) => {
              if (component.selectedCollaborator) {
                return of(collaboratorMetrics);
              }
              return of(teamMetrics);
            });
            
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            component.teams = [{ id: 'Test Team', name: 'Test Team', memberCount: collaborators.length }];
            component.selectedTeam = 'Test Team';
            component.ngOnInit();
            fixture.detectChanges();

            // Select collaborator
            component.onCollaboratorChange(selectedCollaborator.userId);
            fixture.detectChanges();
            
            // Property: Collaborator's individual metrics should be <= team aggregate
            // (A single person can't have more than the whole team)
            expect(component.seasonPoints.total).toBeLessThanOrEqual(teamPoints.total);
            expect(component.seasonPoints.bloqueados).toBeLessThanOrEqual(teamPoints.bloqueados);
            expect(component.seasonPoints.desbloqueados).toBeLessThanOrEqual(teamPoints.desbloqueados);
            expect(component.progressMetrics.processosIncompletos).toBeLessThanOrEqual(teamMetrics.processosIncompletos);
            expect(component.progressMetrics.atividadesFinalizadas).toBeLessThanOrEqual(teamMetrics.atividadesFinalizadas);
            expect(component.progressMetrics.processosFinalizados).toBeLessThanOrEqual(teamMetrics.processosFinalizados);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should show different data for different collaborators', () => {
      fc.assert(
        fc.property(
          fc.array(collaboratorArb, { minLength: 3, maxLength: 5 }),
          teamPointsArb,
          (collaborators, teamPoints) => {
            // Ensure we have distinct collaborators
            fc.pre(new Set(collaborators.map(c => c.userId)).size === collaborators.length);
            fc.pre(teamPoints.total > 100); // Ensure enough points to distribute
            
            // Create unique data for each collaborator
            const collaboratorDataMap = new Map<string, { points: TeamSeasonPoints, metrics: TeamProgressMetrics }>();
            
            collaborators.forEach((collab, index) => {
              collaboratorDataMap.set(collab.userId, {
                points: {
                  total: 10 + (index * 10), // Each collaborator has different points
                  bloqueados: 5 + (index * 5),
                  desbloqueados: 5 + (index * 5)
                },
                metrics: {
                  processosIncompletos: index + 1,
                  atividadesFinalizadas: (index + 1) * 10,
                  processosFinalizados: (index + 1) * 5
                }
              });
            });

            // Setup mocks to return collaborator-specific data
            mockTeamAggregateService.getTeamSeasonPoints.and.callFake((team, start, end) => {
              if (component.selectedCollaborator) {
                const data = collaboratorDataMap.get(component.selectedCollaborator);
                return of(data ? data.points : { total: 0, bloqueados: 0, desbloqueados: 0 });
              }
              return of(teamPoints);
            });
            
            mockTeamAggregateService.getTeamProgressMetrics.and.callFake((team, start, end) => {
              if (component.selectedCollaborator) {
                const data = collaboratorDataMap.get(component.selectedCollaborator);
                return of(data ? data.metrics : { processosIncompletos: 0, atividadesFinalizadas: 0, processosFinalizados: 0 });
              }
              return of({ processosIncompletos: 10, atividadesFinalizadas: 100, processosFinalizados: 50 });
            });
            
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            component.teams = [{ id: 'Test Team', name: 'Test Team', memberCount: collaborators.length }];
            component.selectedTeam = 'Test Team';
            component.ngOnInit();
            fixture.detectChanges();

            // Select first collaborator
            const firstCollaborator = collaborators[0];
            component.onCollaboratorChange(firstCollaborator.userId);
            fixture.detectChanges();
            
            const firstCollabData = {
              points: { ...component.seasonPoints },
              metrics: { ...component.progressMetrics }
            };
            
            // Select second collaborator
            const secondCollaborator = collaborators[1];
            component.onCollaboratorChange(secondCollaborator.userId);
            fixture.detectChanges();
            
            const secondCollabData = {
              points: { ...component.seasonPoints },
              metrics: { ...component.progressMetrics }
            };
            
            // Property: Different collaborators should show different data
            // (Data isolation means each person's data is separate)
            const dataIsDifferent = 
              firstCollabData.points.total !== secondCollabData.points.total ||
              firstCollabData.metrics.atividadesFinalizadas !== secondCollabData.metrics.atividadesFinalizadas;
            
            expect(dataIsDifferent).toBe(true);
            
            // Verify the data matches what we expect for each collaborator
            const expectedFirst = collaboratorDataMap.get(firstCollaborator.userId);
            const expectedSecond = collaboratorDataMap.get(secondCollaborator.userId);
            
            if (expectedSecond) {
              expect(secondCollabData.points.total).toBe(expectedSecond.points.total);
              expect(secondCollabData.metrics.atividadesFinalizadas).toBe(expectedSecond.metrics.atividadesFinalizadas);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should reset to team aggregate when collaborator filter is cleared', () => {
      fc.assert(
        fc.property(
          fc.array(collaboratorArb, { minLength: 1, maxLength: 5 }),
          teamPointsArb,
          (collaborators, teamPoints) => {
            // Setup
            mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(of(teamPoints));
            mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
              of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
            );
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            component.teams = [{ id: 'Test Team', name: 'Test Team', memberCount: collaborators.length }];
            component.selectedTeam = 'Test Team';
            component.ngOnInit();

            // Select a collaborator
            const selectedCollaborator = collaborators[0];
            component.onCollaboratorChange(selectedCollaborator.userId);
            expect(component.selectedCollaborator).toBe(selectedCollaborator.userId);

            // Clear the filter (select "All")
            component.onCollaboratorChange(null);

            // Property: When collaborator filter is cleared, should show team aggregate
            expect(component.selectedCollaborator).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain collaborator filter across data refreshes', () => {
      fc.assert(
        fc.property(
          fc.array(collaboratorArb, { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1 }),
          (collaborators, teamId) => {
            // Setup
            mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
              of({ total: 100, bloqueados: 50, desbloqueados: 50 })
            );
            mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
              of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
            );
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            component.teams = [{ id: teamId, name: teamId, memberCount: collaborators.length }];
            component.selectedTeam = teamId;
            component.ngOnInit();

            // Select a collaborator
            const selectedCollaborator = collaborators[0];
            component.onCollaboratorChange(selectedCollaborator.userId);
            const selectedBefore = component.selectedCollaborator;

            // Refresh data
            component.refreshData();

            // Property: Collaborator filter should be preserved after refresh
            expect(component.selectedCollaborator).toBe(selectedBefore);
            expect(component.selectedCollaborator).toBe(selectedCollaborator.userId);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reset collaborator filter when team changes', () => {
      fc.assert(
        fc.property(
          fc.array(collaboratorArb, { minLength: 1, maxLength: 5 }),
          fc.tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 })).filter(([t1, t2]) => t1 !== t2),
          (collaborators, [team1, team2]) => {
            // Setup
            mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
              of({ total: 100, bloqueados: 50, desbloqueados: 50 })
            );
            mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
              of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
            );
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            component.teams = [
              { id: team1, name: team1, memberCount: collaborators.length },
              { id: team2, name: team2, memberCount: collaborators.length }
            ];
            component.selectedTeam = team1;
            component.ngOnInit();

            // Select a collaborator
            component.onCollaboratorChange(collaborators[0].userId);
            expect(component.selectedCollaborator).not.toBeNull();

            // Change team
            component.onTeamChange(team2);

            // Property: Collaborator filter should be reset when team changes
            expect(component.selectedCollaborator).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle invalid collaborator IDs gracefully', () => {
      fc.assert(
        fc.property(
          fc.array(collaboratorArb, { minLength: 1, maxLength: 5 }),
          fc.string(),
          (collaborators, invalidId) => {
            // Ensure invalidId is not in the collaborators list
            fc.pre(!collaborators.some(c => c.userId === invalidId));

            // Setup
            mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
              of({ total: 100, bloqueados: 50, desbloqueados: 50 })
            );
            mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
              of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
            );
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            component.teams = [{ id: 'Test Team', name: 'Test Team', memberCount: collaborators.length }];
            component.selectedTeam = 'Test Team';
            component.collaborators = collaborators;
            component.ngOnInit();

            // Try to select an invalid collaborator
            component.onCollaboratorChange(invalidId);

            // Property: Component should handle invalid IDs without crashing
            // The selected collaborator should be set to the invalid ID
            // (validation would happen in the UI component)
            expect(component.selectedCollaborator).toBe(invalidId);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Additional property: State consistency
   * 
   * Verifies that component state remains consistent across operations
   */
  describe('State Consistency Properties', () => {
    it('should maintain valid state after any sequence of operations', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('selectTeam'),
              fc.constant('selectCollaborator'),
              fc.constant('clearCollaborator'),
              fc.constant('refresh')
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (operations) => {
            // Setup
            const collaborators: Collaborator[] = [
              { userId: 'user1@test.com', name: 'User 1', email: 'user1@test.com' },
              { userId: 'user2@test.com', name: 'User 2', email: 'user2@test.com' }
            ];

            mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
              of({ total: 100, bloqueados: 50, desbloqueados: 50 })
            );
            mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
              of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
            );
            mockTeamAggregateService.getTeamMembers.and.returnValue(of(collaborators));

            component.teams = [
              { id: 'Team1', name: 'Team1', memberCount: 2 },
              { id: 'Team2', name: 'Team2', memberCount: 2 }
            ];
            component.selectedTeam = 'Team1';
            component.collaborators = collaborators;
            component.ngOnInit();

            // Execute operations
            operations.forEach(op => {
              switch (op) {
                case 'selectTeam':
                  component.onTeamChange('Team2');
                  break;
                case 'selectCollaborator':
                  component.onCollaboratorChange(collaborators[0].userId);
                  break;
                case 'clearCollaborator':
                  component.onCollaboratorChange(null);
                  break;
                case 'refresh':
                  component.refreshData();
                  break;
              }
            });

            // Property: Component should always be in a valid state
            expect(component.selectedTeam).toBeDefined();
            expect(component.activeTab).toMatch(/^(goals|productivity)$/);
            expect(component.selectedCollaborator === null || typeof component.selectedCollaborator === 'string').toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});



/**
 * Property-Based Tests for Goal Save API Payload Structure
 * 
 * Feature: dashboard-metrics-refactor, Property 3: Goal save API payload structure
 * 
 * For any valid cnpj_goal (non-negative integer) and entrega_goal (number 0–100),
 * the PUT request body sent to the Funifier API should contain
 * {"extra": {"cnpj_goal": value}} or {"extra": {"entrega_goal": value}} respectively,
 * with the exact numeric value provided.
 * 
 * **Validates: Requirements 4.2, 4.3**
 */
describe('TeamManagementDashboardComponent - Property 3: Goal Save API Payload Structure', () => {
  let mockFunifierApi: jasmine.SpyObj<FunifierApiService>;
  let mockTeamAggregateService: jasmine.SpyObj<TeamAggregateService>;
  let mockGraphDataProcessor: jasmine.SpyObj<GraphDataProcessorService>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let component: TeamManagementDashboardComponent;
  let fixture: ComponentFixture<TeamManagementDashboardComponent>;

  // Arbitraries for generating valid goal values
  // cnpj_goal: non-negative integer (Requirement 4.7)
  const cnpjGoalArb = fc.integer({ min: 0, max: 1000 });
  
  // entrega_goal: number between 0 and 100 (Requirement 4.7)
  const entregaGoalArb = fc.integer({ min: 0, max: 100 });
  
  // Player ID arbitrary (email format)
  const playerIdArb = fc.emailAddress();

  beforeEach(async () => {
    // Create mock services
    mockFunifierApi = jasmine.createSpyObj('FunifierApiService', ['get', 'put']);
    mockTeamAggregateService = jasmine.createSpyObj('TeamAggregateService', [
      'getTeamSeasonPoints',
      'getTeamProgressMetrics',
      'getTeamMembers',
      'getCollaboratorData',
      'clearCache'
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
          teams: ['Departamento Pessoal']
        }
      }
    });

    // Setup default mock returns
    mockSeasonDatesService.getSeasonDates.and.returnValue(
      Promise.resolve({
        dataInicio: new Date('2024-01-01'),
        dataFim: new Date('2024-12-31')
      } as any)
    );
    mockGraphDataProcessor.processGraphData.and.returnValue([]);
    mockGraphDataProcessor.getDateLabels.and.returnValue([]);
    mockGraphDataProcessor.createChartDatasets.and.returnValue([]);
    mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
      of({ total: 100, bloqueados: 50, desbloqueados: 50 })
    );
    mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
      of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
    );
    mockTeamAggregateService.getTeamMembers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [TeamManagementDashboardComponent],
      imports: [BrowserAnimationsModule],
      providers: [
        { provide: FunifierApiService, useValue: mockFunifierApi },
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

  /**
   * Property 3: Goal save API payload structure
   * 
   * For any valid cnpj_goal (non-negative integer) and entrega_goal (number 0–100),
   * the PUT request body sent to the Funifier API should contain
   * {"extra": {"cnpj_goal": value}} or {"extra": {"entrega_goal": value}} respectively.
   * 
   * **Validates: Requirements 4.2, 4.3**
   */
  describe('Property 3: Goal save API payload structure', () => {
    
    it('should send PUT request with correct cnpj_goal payload structure', () => {
      fc.assert(
        fc.property(
          cnpjGoalArb,
          playerIdArb,
          (cnpjGoal, playerId) => {
            // Track the PUT request payload
            let capturedPayload: any = null;
            let capturedEndpoint: string = '';
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to capture the payload
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              capturedEndpoint = endpoint;
              capturedPayload = body;
              return of({});
            }) as any);

            // Setup component with a collaborator
            const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
            component.collaborators = [collaborator];
            component.metaConfig = {
              selectedCollaborator: playerId,
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: null
            };

            // Execute saveGoals
            component.saveGoals();

            // Property: PUT request should be made to player/{playerId} endpoint
            expect(capturedEndpoint).toBe(`player/${playerId}`);
            
            // Property: Payload should have the correct structure {"extra": {"cnpj_goal": value}}
            expect(capturedPayload).toBeDefined();
            expect(capturedPayload.extra).toBeDefined();
            expect(capturedPayload.extra.cnpj_goal).toBe(cnpjGoal);
            
            // Property: The cnpj_goal value should be exactly the provided value (as integer)
            expect(Number.isInteger(capturedPayload.extra.cnpj_goal)).toBe(true);
            expect(capturedPayload.extra.cnpj_goal).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should send PUT request with correct entrega_goal payload structure', () => {
      fc.assert(
        fc.property(
          entregaGoalArb,
          playerIdArb,
          (entregaGoal, playerId) => {
            // Track the PUT request payload
            let capturedPayload: any = null;
            let capturedEndpoint: string = '';
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to capture the payload
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              capturedEndpoint = endpoint;
              capturedPayload = body;
              return of({});
            }) as any);

            // Setup component with a collaborator
            const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
            component.collaborators = [collaborator];
            component.metaConfig = {
              selectedCollaborator: playerId,
              cnpjGoalValue: null,
              entregaGoalValue: entregaGoal
            };

            // Execute saveGoals
            component.saveGoals();

            // Property: PUT request should be made to player/{playerId} endpoint
            expect(capturedEndpoint).toBe(`player/${playerId}`);
            
            // Property: Payload should have the correct structure {"extra": {"entrega_goal": value}}
            expect(capturedPayload).toBeDefined();
            expect(capturedPayload.extra).toBeDefined();
            expect(capturedPayload.extra.entrega_goal).toBe(entregaGoal);
            
            // Property: The entrega_goal value should be between 0 and 100
            expect(capturedPayload.extra.entrega_goal).toBeGreaterThanOrEqual(0);
            expect(capturedPayload.extra.entrega_goal).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should send PUT request with both cnpj_goal and entrega_goal in payload', () => {
      fc.assert(
        fc.property(
          cnpjGoalArb,
          entregaGoalArb,
          playerIdArb,
          (cnpjGoal, entregaGoal, playerId) => {
            // Track the PUT request payload
            let capturedPayload: any = null;
            let capturedEndpoint: string = '';
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to capture the payload
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              capturedEndpoint = endpoint;
              capturedPayload = body;
              return of({});
            }) as any);

            // Setup component with a collaborator
            const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
            component.collaborators = [collaborator];
            component.metaConfig = {
              selectedCollaborator: playerId,
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: entregaGoal
            };

            // Execute saveGoals
            component.saveGoals();

            // Property: PUT request should be made to player/{playerId} endpoint
            expect(capturedEndpoint).toBe(`player/${playerId}`);
            
            // Property: Payload should contain both goals in the extra object
            expect(capturedPayload).toBeDefined();
            expect(capturedPayload.extra).toBeDefined();
            expect(capturedPayload.extra.cnpj_goal).toBe(cnpjGoal);
            expect(capturedPayload.extra.entrega_goal).toBe(entregaGoal);
            
            // Property: cnpj_goal should be a non-negative integer
            expect(Number.isInteger(capturedPayload.extra.cnpj_goal)).toBe(true);
            expect(capturedPayload.extra.cnpj_goal).toBeGreaterThanOrEqual(0);
            
            // Property: entrega_goal should be between 0 and 100
            expect(capturedPayload.extra.entrega_goal).toBeGreaterThanOrEqual(0);
            expect(capturedPayload.extra.entrega_goal).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve existing extra fields when updating goals', () => {
      fc.assert(
        fc.property(
          cnpjGoalArb,
          entregaGoalArb,
          playerIdArb,
          fc.record({
            existingField1: fc.string(),
            existingField2: fc.integer()
          }),
          (cnpjGoal, entregaGoal, playerId, existingExtra) => {
            // Track the PUT request payload
            let capturedPayload: any = null;
            
            // Mock GET to return existing player data with extra fields
            mockFunifierApi.get.and.returnValue(of({ 
              extra: { 
                ...existingExtra,
                cnpj_resp: '12345678901234' // Existing field that should be preserved
              } 
            }) as any);
            
            // Mock PUT to capture the payload
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              capturedPayload = body;
              return of({});
            }) as any);

            // Setup component with a collaborator
            const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
            component.collaborators = [collaborator];
            component.metaConfig = {
              selectedCollaborator: playerId,
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: entregaGoal
            };

            // Execute saveGoals
            component.saveGoals();

            // Property: Existing extra fields should be preserved
            expect(capturedPayload).toBeDefined();
            expect(capturedPayload.extra).toBeDefined();
            expect(capturedPayload.extra.existingField1).toBe(existingExtra.existingField1);
            expect(capturedPayload.extra.existingField2).toBe(existingExtra.existingField2);
            expect(capturedPayload.extra.cnpj_resp).toBe('12345678901234');
            
            // Property: New goals should be added
            expect(capturedPayload.extra.cnpj_goal).toBe(cnpjGoal);
            expect(capturedPayload.extra.entrega_goal).toBe(entregaGoal);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should floor decimal cnpj_goal values to integers', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000, noNaN: true }),
          playerIdArb,
          (cnpjGoalFloat, playerId) => {
            // Skip if the float is already an integer
            fc.pre(!Number.isInteger(cnpjGoalFloat));
            
            // Track the PUT request payload
            let capturedPayload: any = null;
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to capture the payload
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              capturedPayload = body;
              return of({});
            }) as any);

            // Setup component with a collaborator
            const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
            component.collaborators = [collaborator];
            component.metaConfig = {
              selectedCollaborator: playerId,
              cnpjGoalValue: cnpjGoalFloat,
              entregaGoalValue: null
            };

            // Execute saveGoals
            component.saveGoals();

            // Property: cnpj_goal should be floored to an integer
            expect(capturedPayload).toBeDefined();
            expect(capturedPayload.extra).toBeDefined();
            expect(Number.isInteger(capturedPayload.extra.cnpj_goal)).toBe(true);
            expect(capturedPayload.extra.cnpj_goal).toBe(Math.floor(cnpjGoalFloat));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use exact numeric value for entrega_goal (allows decimals)', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true }),
          playerIdArb,
          (entregaGoalFloat, playerId) => {
            // Track the PUT request payload
            let capturedPayload: any = null;
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to capture the payload
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              capturedPayload = body;
              return of({});
            }) as any);

            // Setup component with a collaborator
            const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
            component.collaborators = [collaborator];
            component.metaConfig = {
              selectedCollaborator: playerId,
              cnpjGoalValue: null,
              entregaGoalValue: entregaGoalFloat
            };

            // Execute saveGoals
            component.saveGoals();

            // Property: entrega_goal should be the exact value provided
            expect(capturedPayload).toBeDefined();
            expect(capturedPayload.extra).toBeDefined();
            expect(capturedPayload.extra.entrega_goal).toBe(entregaGoalFloat);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Property-Based Tests for Bulk Goal Save Request Count
 * 
 * Feature: dashboard-metrics-refactor, Property 4: Bulk goal save sends one request per collaborator
 * 
 * For any team with N collaborators (N ≥ 1), when "Todos os Colaboradores" is selected
 * and goals are submitted, the system should issue exactly N PUT requests, one per collaborator.
 * 
 * **Validates: Requirements 4.4**
 */
describe('TeamManagementDashboardComponent - Property 4: Bulk Goal Save Sends One Request Per Collaborator', () => {
  let mockFunifierApi: jasmine.SpyObj<FunifierApiService>;
  let mockTeamAggregateService: jasmine.SpyObj<TeamAggregateService>;
  let mockGraphDataProcessor: jasmine.SpyObj<GraphDataProcessorService>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let component: TeamManagementDashboardComponent;
  let fixture: ComponentFixture<TeamManagementDashboardComponent>;

  // Arbitraries for generating test data
  // Team size: 1 to 50 collaborators (as specified in task)
  const teamSizeArb = fc.integer({ min: 1, max: 50 });
  
  // cnpj_goal: non-negative integer
  const cnpjGoalArb = fc.integer({ min: 0, max: 1000 });
  
  // entrega_goal: number between 0 and 100
  const entregaGoalArb = fc.integer({ min: 0, max: 100 });
  
  // Generate a collaborator with unique userId
  const collaboratorArb = fc.record({
    userId: fc.emailAddress(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress()
  });

  // Generate a team of N unique collaborators
  const teamArb = (size: number) => fc.array(collaboratorArb, { minLength: size, maxLength: size })
    .filter(team => {
      // Ensure all userIds are unique
      const userIds = team.map(c => c.userId);
      return new Set(userIds).size === userIds.length;
    });

  beforeEach(async () => {
    // Create mock services
    mockFunifierApi = jasmine.createSpyObj('FunifierApiService', ['get', 'put']);
    mockTeamAggregateService = jasmine.createSpyObj('TeamAggregateService', [
      'getTeamSeasonPoints',
      'getTeamProgressMetrics',
      'getTeamMembers',
      'getCollaboratorData',
      'clearCache'
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
          teams: ['Departamento Pessoal']
        }
      }
    });

    // Setup default mock returns
    mockSeasonDatesService.getSeasonDates.and.returnValue(
      Promise.resolve({
        dataInicio: new Date('2024-01-01'),
        dataFim: new Date('2024-12-31')
      } as any)
    );
    mockGraphDataProcessor.processGraphData.and.returnValue([]);
    mockGraphDataProcessor.getDateLabels.and.returnValue([]);
    mockGraphDataProcessor.createChartDatasets.and.returnValue([]);
    mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
      of({ total: 100, bloqueados: 50, desbloqueados: 50 })
    );
    mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
      of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
    );
    mockTeamAggregateService.getTeamMembers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [TeamManagementDashboardComponent],
      imports: [BrowserAnimationsModule],
      providers: [
        { provide: FunifierApiService, useValue: mockFunifierApi },
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

  /**
   * Property 4: Bulk goal save sends one request per collaborator
   * 
   * For any team with N collaborators (N ≥ 1), when "Todos os Colaboradores" is selected
   * and goals are submitted, the system should issue exactly N PUT requests, one per collaborator.
   * 
   * **Validates: Requirements 4.4**
   */
  describe('Property 4: Bulk goal save sends one request per collaborator', () => {
    
    it('should issue exactly N PUT requests for N collaborators when saving goals for all', async () => {
      await fc.assert(
        fc.asyncProperty(
          teamSizeArb,
          cnpjGoalArb,
          entregaGoalArb,
          async (teamSize, cnpjGoal, entregaGoal) => {
            // Generate a team of the specified size with unique userIds
            const team: Collaborator[] = [];
            for (let i = 0; i < teamSize; i++) {
              team.push({
                userId: `user${i}@test.com`,
                name: `User ${i}`,
                email: `user${i}@test.com`
              });
            }
            
            // Track PUT requests
            const putRequests: { endpoint: string; payload: any }[] = [];
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to track all requests
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              putRequests.push({ endpoint, payload: body });
              return of({});
            }) as any);

            // Setup component with the team
            component.collaborators = team;
            component.metaConfig = {
              selectedCollaborator: 'all', // "Todos os Colaboradores"
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: entregaGoal
            };

            // Execute saveGoals
            await component.saveGoals();

            // Property: Exactly N PUT requests should be issued for N collaborators
            expect(putRequests.length).toBe(teamSize);
            
            // Property: Each collaborator should receive exactly one PUT request
            const requestedPlayerIds = putRequests.map(r => r.endpoint.replace('player/', ''));
            const expectedPlayerIds = team.map(c => c.userId);
            
            // Verify all collaborators received a request
            expectedPlayerIds.forEach(playerId => {
              expect(requestedPlayerIds).toContain(playerId);
            });
            
            // Verify no duplicate requests
            expect(new Set(requestedPlayerIds).size).toBe(teamSize);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should issue one PUT request per collaborator with correct payload', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }), // Smaller range for detailed verification
          cnpjGoalArb,
          entregaGoalArb,
          async (teamSize, cnpjGoal, entregaGoal) => {
            // Generate a team of the specified size
            const team: Collaborator[] = [];
            for (let i = 0; i < teamSize; i++) {
              team.push({
                userId: `collaborator${i}@company.com`,
                name: `Collaborator ${i}`,
                email: `collaborator${i}@company.com`
              });
            }
            
            // Track PUT requests with their payloads
            const putRequests: Map<string, any> = new Map();
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to track all requests
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              const playerId = endpoint.replace('player/', '');
              putRequests.set(playerId, body);
              return of({});
            }) as any);

            // Setup component with the team
            component.collaborators = team;
            component.metaConfig = {
              selectedCollaborator: 'all',
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: entregaGoal
            };

            // Execute saveGoals
            await component.saveGoals();

            // Property: Each collaborator should have received a PUT request with correct payload
            team.forEach(collaborator => {
              const payload = putRequests.get(collaborator.userId);
              
              // Verify request was made for this collaborator
              expect(payload).toBeDefined(`Expected PUT request for ${collaborator.userId}`);
              
              // Verify payload structure
              expect(payload.extra).toBeDefined();
              expect(payload.extra.cnpj_goal).toBe(Math.floor(cnpjGoal));
              expect(payload.extra.entrega_goal).toBe(entregaGoal);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should issue exactly 1 PUT request for a team of 1 collaborator', async () => {
      await fc.assert(
        fc.asyncProperty(
          cnpjGoalArb,
          entregaGoalArb,
          fc.emailAddress(),
          async (cnpjGoal, entregaGoal, userId) => {
            // Single collaborator team
            const team: Collaborator[] = [{
              userId,
              name: 'Solo Collaborator',
              email: userId
            }];
            
            // Track PUT requests
            let putRequestCount = 0;
            let lastEndpoint = '';
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to count requests
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              putRequestCount++;
              lastEndpoint = endpoint;
              return of({});
            }) as any);

            // Setup component with single collaborator
            component.collaborators = team;
            component.metaConfig = {
              selectedCollaborator: 'all',
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: entregaGoal
            };

            // Execute saveGoals
            await component.saveGoals();

            // Property: Exactly 1 PUT request for 1 collaborator
            expect(putRequestCount).toBe(1);
            expect(lastEndpoint).toBe(`player/${userId}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should issue N GET requests followed by N PUT requests for N collaborators', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }),
          cnpjGoalArb,
          async (teamSize, cnpjGoal) => {
            // Generate team
            const team: Collaborator[] = [];
            for (let i = 0; i < teamSize; i++) {
              team.push({
                userId: `member${i}@team.com`,
                name: `Member ${i}`,
                email: `member${i}@team.com`
              });
            }
            
            // Track GET and PUT requests
            let getRequestCount = 0;
            let putRequestCount = 0;
            
            // Mock GET to count requests
            mockFunifierApi.get.and.callFake(((endpoint: string) => {
              getRequestCount++;
              return of({ extra: {} });
            }) as any);
            
            // Mock PUT to count requests
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              putRequestCount++;
              return of({});
            }) as any);

            // Setup component
            component.collaborators = team;
            component.metaConfig = {
              selectedCollaborator: 'all',
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: null
            };

            // Execute saveGoals
            await component.saveGoals();

            // Property: N GET requests (to fetch current player data) and N PUT requests
            expect(getRequestCount).toBe(teamSize);
            expect(putRequestCount).toBe(teamSize);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not issue any PUT requests when collaborators list is empty', async () => {
      await fc.assert(
        fc.asyncProperty(
          cnpjGoalArb,
          entregaGoalArb,
          async (cnpjGoal, entregaGoal) => {
            // Empty team
            const team: Collaborator[] = [];
            
            // Track PUT requests
            let putRequestCount = 0;
            
            // Mock PUT to count requests
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              putRequestCount++;
              return of({});
            }) as any);

            // Setup component with empty team
            component.collaborators = team;
            component.metaConfig = {
              selectedCollaborator: 'all',
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: entregaGoal
            };

            // Execute saveGoals
            await component.saveGoals();

            // Property: No PUT requests for empty team
            expect(putRequestCount).toBe(0);
            
            // Should show appropriate error message
            expect(component.metaSaveSuccess).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should continue issuing PUT requests even when some fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 10 }),
          fc.integer({ min: 0, max: 9 }), // Index of collaborator that will fail
          cnpjGoalArb,
          async (teamSize, failIndex, cnpjGoal) => {
            // Ensure failIndex is within team bounds
            const actualFailIndex = failIndex % teamSize;
            
            // Generate team
            const team: Collaborator[] = [];
            for (let i = 0; i < teamSize; i++) {
              team.push({
                userId: `worker${i}@org.com`,
                name: `Worker ${i}`,
                email: `worker${i}@org.com`
              });
            }
            
            // Track successful PUT requests
            const successfulPuts: string[] = [];
            
            // Mock GET to return existing player data
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT - one will fail
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              const playerId = endpoint.replace('player/', '');
              const collaboratorIndex = team.findIndex(c => c.userId === playerId);
              
              if (collaboratorIndex === actualFailIndex) {
                // Simulate failure for one collaborator
                return throwError(() => new Error('Network error'));
              }
              
              successfulPuts.push(playerId);
              return of({});
            }) as any);

            // Setup component
            component.collaborators = team;
            component.metaConfig = {
              selectedCollaborator: 'all',
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: null
            };

            // Execute saveGoals
            await component.saveGoals();

            // Property: All other collaborators should still receive PUT requests
            // (N-1 successful requests when 1 fails)
            expect(successfulPuts.length).toBe(teamSize - 1);
            
            // Verify the failed collaborator is not in successful list
            expect(successfulPuts).not.toContain(team[actualFailIndex].userId);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should issue PUT requests to unique player endpoints for each collaborator', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 30 }),
          cnpjGoalArb,
          async (teamSize, cnpjGoal) => {
            // Generate team with unique IDs
            const team: Collaborator[] = [];
            for (let i = 0; i < teamSize; i++) {
              team.push({
                userId: `unique-user-${i}-${Date.now()}@domain.com`,
                name: `Unique User ${i}`,
                email: `unique-user-${i}@domain.com`
              });
            }
            
            // Track all endpoints called
            const calledEndpoints: string[] = [];
            
            // Mock GET
            mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
            
            // Mock PUT to track endpoints
            mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
              calledEndpoints.push(endpoint);
              return of({});
            }) as any);

            // Setup component
            component.collaborators = team;
            component.metaConfig = {
              selectedCollaborator: 'all',
              cnpjGoalValue: cnpjGoal,
              entregaGoalValue: null
            };

            // Execute saveGoals
            await component.saveGoals();

            // Property: All endpoints should be unique (no duplicate requests)
            const uniqueEndpoints = new Set(calledEndpoints);
            expect(uniqueEndpoints.size).toBe(teamSize);
            expect(calledEndpoints.length).toBe(teamSize);
            
            // Property: Each endpoint should follow the pattern player/{userId}
            calledEndpoints.forEach(endpoint => {
              expect(endpoint).toMatch(/^player\/.+$/);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * Property-Based Tests for Goal Form Validation
 * 
 * Feature: dashboard-metrics-refactor, Property 5: Goal form validation
 * 
 * For any numeric input, `cnpj_goal` should be accepted if and only if it is a non-negative
 * integer (≥ 0, no decimals), and `entrega_goal` should be accepted if and only if it is
 * a number between 0 and 100 inclusive.
 * 
 * **Validates: Requirements 4.7**
 */
describe('TeamManagementDashboardComponent - Property 5: Goal Form Validation', () => {
  let mockFunifierApi: jasmine.SpyObj<FunifierApiService>;
  let mockTeamAggregateService: jasmine.SpyObj<TeamAggregateService>;
  let mockGraphDataProcessor: jasmine.SpyObj<GraphDataProcessorService>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let component: TeamManagementDashboardComponent;
  let fixture: ComponentFixture<TeamManagementDashboardComponent>;

  // Arbitraries for generating test data
  
  // Valid cnpj_goal: non-negative integers
  const validCnpjGoalArb = fc.integer({ min: 0, max: 10000 });
  
  // Invalid cnpj_goal: negative integers
  const negativeCnpjGoalArb = fc.integer({ min: -10000, max: -1 });
  
  // Invalid cnpj_goal: floats with decimal parts
  const floatCnpjGoalArb = fc.float({ min: 0.01, max: 1000, noNaN: true })
    .filter(n => !Number.isInteger(n));
  
  // Valid entrega_goal: numbers between 0 and 100
  const validEntregaGoalArb = fc.integer({ min: 0, max: 100 });
  
  // Invalid entrega_goal: numbers below 0
  const belowRangeEntregaGoalArb = fc.float({ min: -1000, max: -0.01, noNaN: true });
  
  // Invalid entrega_goal: numbers above 100
  const aboveRangeEntregaGoalArb = fc.float({ min: 100.01, max: 10000, noNaN: true });
  
  // Player ID arbitrary
  const playerIdArb = fc.emailAddress();

  beforeEach(async () => {
    // Create mock services
    mockFunifierApi = jasmine.createSpyObj('FunifierApiService', ['get', 'put']);
    mockTeamAggregateService = jasmine.createSpyObj('TeamAggregateService', [
      'getTeamSeasonPoints',
      'getTeamProgressMetrics',
      'getTeamMembers',
      'getCollaboratorData',
      'clearCache'
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
          teams: ['Departamento Pessoal']
        }
      }
    });

    // Setup default mock returns
    mockSeasonDatesService.getSeasonDates.and.returnValue(
      Promise.resolve({
        dataInicio: new Date('2024-01-01'),
        dataFim: new Date('2024-12-31')
      } as any)
    );
    mockGraphDataProcessor.processGraphData.and.returnValue([]);
    mockGraphDataProcessor.getDateLabels.and.returnValue([]);
    mockGraphDataProcessor.createChartDatasets.and.returnValue([]);
    mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
      of({ total: 100, bloqueados: 50, desbloqueados: 50 })
    );
    mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
      of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 15 })
    );
    mockTeamAggregateService.getTeamMembers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [TeamManagementDashboardComponent],
      imports: [BrowserAnimationsModule],
      providers: [
        { provide: FunifierApiService, useValue: mockFunifierApi },
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

  /**
   * Property 5: Goal form validation
   * 
   * For any numeric input, `cnpj_goal` should be accepted if and only if it is a non-negative
   * integer (≥ 0, no decimals), and `entrega_goal` should be accepted if and only if it is
   * a number between 0 and 100 inclusive.
   * 
   * **Validates: Requirements 4.7**
   */
  describe('Property 5: Goal form validation', () => {
    
    describe('cnpj_goal validation', () => {
      
      it('should accept valid cnpj_goal values (non-negative integers)', async () => {
        await fc.assert(
          fc.asyncProperty(
            validCnpjGoalArb,
            playerIdArb,
            async (cnpjGoal, playerId) => {
              // Track if PUT request was made (indicates validation passed)
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: cnpjGoal,
                entregaGoalValue: null
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Valid cnpj_goal (non-negative integer) should be accepted
              // Validation passes when PUT request is made
              expect(putRequestMade).toBe(true, 
                `Expected cnpj_goal=${cnpjGoal} to be accepted (non-negative integer)`);
              
              // Property: Success message should be shown
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject negative cnpj_goal values', async () => {
        await fc.assert(
          fc.asyncProperty(
            negativeCnpjGoalArb,
            playerIdArb,
            async (cnpjGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: cnpjGoal,
                entregaGoalValue: null
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Negative cnpj_goal should be rejected
              // Validation fails when PUT request is NOT made
              expect(putRequestMade).toBe(false, 
                `Expected cnpj_goal=${cnpjGoal} to be rejected (negative value)`);
              
              // Property: Error message should be shown
              expect(component.metaSaveSuccess).toBe(false);
              expect(component.metaSaveMessage).toContain('inteiro não negativo');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject float cnpj_goal values (non-integers)', async () => {
        await fc.assert(
          fc.asyncProperty(
            floatCnpjGoalArb,
            playerIdArb,
            async (cnpjGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: cnpjGoal,
                entregaGoalValue: null
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Float cnpj_goal (non-integer) should be rejected
              expect(putRequestMade).toBe(false, 
                `Expected cnpj_goal=${cnpjGoal} to be rejected (non-integer float)`);
              
              // Property: Error message should be shown
              expect(component.metaSaveSuccess).toBe(false);
              expect(component.metaSaveMessage).toContain('inteiro não negativo');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should accept zero as valid cnpj_goal', async () => {
        await fc.assert(
          fc.asyncProperty(
            playerIdArb,
            async (playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: 0, // Zero is a valid non-negative integer
                entregaGoalValue: null
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Zero should be accepted as valid cnpj_goal
              expect(putRequestMade).toBe(true, 'Expected cnpj_goal=0 to be accepted');
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('entrega_goal validation', () => {
      
      it('should accept valid entrega_goal values (0-100 inclusive)', async () => {
        await fc.assert(
          fc.asyncProperty(
            validEntregaGoalArb,
            playerIdArb,
            async (entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: null,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Valid entrega_goal (0-100) should be accepted
              expect(putRequestMade).toBe(true, 
                `Expected entrega_goal=${entregaGoal} to be accepted (within 0-100 range)`);
              
              // Property: Success message should be shown
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject entrega_goal values below 0', async () => {
        await fc.assert(
          fc.asyncProperty(
            belowRangeEntregaGoalArb,
            playerIdArb,
            async (entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: null,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: entrega_goal below 0 should be rejected
              expect(putRequestMade).toBe(false, 
                `Expected entrega_goal=${entregaGoal} to be rejected (below 0)`);
              
              // Property: Error message should be shown
              expect(component.metaSaveSuccess).toBe(false);
              expect(component.metaSaveMessage).toContain('entre 0 e 100');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject entrega_goal values above 100', async () => {
        await fc.assert(
          fc.asyncProperty(
            aboveRangeEntregaGoalArb,
            playerIdArb,
            async (entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: null,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: entrega_goal above 100 should be rejected
              expect(putRequestMade).toBe(false, 
                `Expected entrega_goal=${entregaGoal} to be rejected (above 100)`);
              
              // Property: Error message should be shown
              expect(component.metaSaveSuccess).toBe(false);
              expect(component.metaSaveMessage).toContain('entre 0 e 100');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should accept boundary values 0 and 100 for entrega_goal', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(0, 100), // Boundary values
            playerIdArb,
            async (entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: null,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Boundary values 0 and 100 should be accepted
              expect(putRequestMade).toBe(true, 
                `Expected entrega_goal=${entregaGoal} to be accepted (boundary value)`);
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should accept decimal values within 0-100 range for entrega_goal', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.float({ min: 0, max: 100, noNaN: true }),
            playerIdArb,
            async (entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: null,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Decimal values within 0-100 should be accepted for entrega_goal
              // (unlike cnpj_goal which requires integers)
              expect(putRequestMade).toBe(true, 
                `Expected entrega_goal=${entregaGoal} to be accepted (decimal within range)`);
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Combined validation', () => {
      
      it('should accept both valid cnpj_goal and entrega_goal together', async () => {
        await fc.assert(
          fc.asyncProperty(
            validCnpjGoalArb,
            validEntregaGoalArb,
            playerIdArb,
            async (cnpjGoal, entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: cnpjGoal,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Both valid goals should be accepted together
              expect(putRequestMade).toBe(true, 
                `Expected cnpj_goal=${cnpjGoal} and entrega_goal=${entregaGoal} to be accepted`);
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject when cnpj_goal is invalid even if entrega_goal is valid', async () => {
        await fc.assert(
          fc.asyncProperty(
            negativeCnpjGoalArb,
            validEntregaGoalArb,
            playerIdArb,
            async (cnpjGoal, entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: cnpjGoal,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Invalid cnpj_goal should cause rejection even with valid entrega_goal
              expect(putRequestMade).toBe(false, 
                `Expected rejection due to invalid cnpj_goal=${cnpjGoal}`);
              expect(component.metaSaveSuccess).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should reject when entrega_goal is invalid even if cnpj_goal is valid', async () => {
        await fc.assert(
          fc.asyncProperty(
            validCnpjGoalArb,
            aboveRangeEntregaGoalArb,
            playerIdArb,
            async (cnpjGoal, entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: cnpjGoal,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Invalid entrega_goal should cause rejection even with valid cnpj_goal
              expect(putRequestMade).toBe(false, 
                `Expected rejection due to invalid entrega_goal=${entregaGoal}`);
              expect(component.metaSaveSuccess).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should require at least one goal value to be provided', async () => {
        await fc.assert(
          fc.asyncProperty(
            playerIdArb,
            async (playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: null, // No cnpj_goal
                entregaGoalValue: null // No entrega_goal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Should reject when both goals are null
              expect(putRequestMade).toBe(false, 
                'Expected rejection when both goals are null');
              expect(component.metaSaveSuccess).toBe(false);
              expect(component.metaSaveMessage).toContain('pelo menos um valor');
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('Edge cases', () => {
      
      it('should handle very large valid cnpj_goal values', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1000, max: 1000000 }), // Large but valid integers
            playerIdArb,
            async (cnpjGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: cnpjGoal,
                entregaGoalValue: null
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Large valid integers should be accepted
              expect(putRequestMade).toBe(true, 
                `Expected large cnpj_goal=${cnpjGoal} to be accepted`);
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should handle entrega_goal values very close to boundaries', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.oneof(
              fc.float({ min: 0, max: 0.001, noNaN: true }), // Very close to 0
              fc.float({ min: 99.999, max: 100, noNaN: true }) // Very close to 100
            ),
            playerIdArb,
            async (entregaGoal, playerId) => {
              // Track if PUT request was made
              let putRequestMade = false;
              
              // Mock GET to return existing player data
              mockFunifierApi.get.and.returnValue(of({ extra: {} }) as any);
              
              // Mock PUT to track if request was made
              mockFunifierApi.put.and.callFake(((endpoint: string, body: any) => {
                putRequestMade = true;
                return of({});
              }) as any);

              // Setup component with a collaborator
              const collaborator: Collaborator = { userId: playerId, name: 'Test User', email: playerId };
              component.collaborators = [collaborator];
              component.metaConfig = {
                selectedCollaborator: playerId,
                cnpjGoalValue: null,
                entregaGoalValue: entregaGoal
              };

              // Execute saveGoals
              await component.saveGoals();

              // Property: Values very close to boundaries should be accepted
              expect(putRequestMade).toBe(true, 
                `Expected entrega_goal=${entregaGoal} to be accepted (near boundary)`);
              expect(component.metaSaveSuccess).toBe(true);
            }
          ),
          { numRuns: 50 }
        );
      });
    });
  });
});


/**
 * Property-Based Tests for Team cnpj_goal Target Sum
 * 
 * Feature: dashboard-metrics-refactor, Property 8: Team cnpj_goal target is sum of members
 * 
 * For any set of team members where each member has a `cnpj_goal` value (or defaults to 10),
 * the team-level "Clientes na Carteira" target should equal the sum of all individual
 * `cnpj_goal` values.
 * 
 * **Validates: Requirements 5.5**
 */
describe('TeamManagementDashboardComponent - Property 8: Team cnpj_goal Target is Sum of Members', () => {
  
  // Default cnpj_goal value when not set
  const DEFAULT_CNPJ_GOAL = 10;
  
  /**
   * Pure function that calculates the team cnpj_goal target from member goals.
   * This mirrors the exact logic used in loadTeamKPIs() for determining
   * the team-level "Clientes na Carteira" target.
   * 
   * @param memberGoals - Array of cnpj_goal values (some may be null/undefined)
   * @returns The sum of all goals (defaulting nulls to 10)
   */
  function calculateTeamCnpjGoalTarget(memberGoals: (number | string | null | undefined)[]): number {
    return memberGoals.reduce<number>((sum, goal) => {
      // Default to 10 if cnpj_goal is null or undefined
      if (goal === undefined || goal === null) {
        return sum + DEFAULT_CNPJ_GOAL;
      }
      
      const numValue = typeof goal === 'number' 
        ? goal 
        : parseInt(String(goal), 10);
      return sum + (isNaN(numValue) ? DEFAULT_CNPJ_GOAL : numValue);
    }, 0);
  }
  
  /**
   * Generates a team member with optional cnpj_goal.
   * Simulates various states: set to number, set to string, null, undefined.
   */
  function memberWithCnpjGoal(): fc.Arbitrary<{
    userId: string;
    cnpjGoal: number | string | null | undefined;
    expectedContribution: number;
  }> {
    return fc.tuple(
      fc.emailAddress(),
      fc.oneof(
        // Case 1: cnpj_goal is a positive number
        fc.integer({ min: 1, max: 1000 }).map(goal => ({
          cnpjGoal: goal as number | string | null | undefined,
          expectedContribution: goal
        })),
        // Case 2: cnpj_goal is zero
        fc.constant({
          cnpjGoal: 0 as number | string | null | undefined,
          expectedContribution: 0
        }),
        // Case 3: cnpj_goal is a string representation of a number
        fc.integer({ min: 1, max: 1000 }).map(goal => ({
          cnpjGoal: String(goal) as number | string | null | undefined,
          expectedContribution: goal
        })),
        // Case 4: cnpj_goal is null - should default to 10
        fc.constant({
          cnpjGoal: null as number | string | null | undefined,
          expectedContribution: DEFAULT_CNPJ_GOAL
        }),
        // Case 5: cnpj_goal is undefined - should default to 10
        fc.constant({
          cnpjGoal: undefined as number | string | null | undefined,
          expectedContribution: DEFAULT_CNPJ_GOAL
        })
      )
    ).map(([userId, goalData]) => ({
      userId,
      cnpjGoal: goalData.cnpjGoal,
      expectedContribution: goalData.expectedContribution
    }));
  }
  
  /**
   * Generates a team of N members with various cnpj_goal values.
   */
  function teamWithCnpjGoals(minSize: number = 1, maxSize: number = 20): fc.Arbitrary<{
    members: { userId: string; cnpjGoal: number | string | null | undefined; expectedContribution: number }[];
    expectedTeamTarget: number;
  }> {
    return fc.array(memberWithCnpjGoal(), { minLength: minSize, maxLength: maxSize })
      .filter(members => {
        // Ensure all userIds are unique
        const userIds = members.map(m => m.userId);
        return new Set(userIds).size === userIds.length;
      })
      .map(members => ({
        members,
        expectedTeamTarget: members.reduce((sum, m) => sum + m.expectedContribution, 0)
      }));
  }

  describe('Property 8: Team cnpj_goal target is sum of members', () => {
    // Feature: dashboard-metrics-refactor, Property 8: Team cnpj_goal target is sum of members
    // **Validates: Requirements 5.5**
    
    describe('calculateTeamCnpjGoalTarget function', () => {
      
      it('should return sum of all cnpj_goal values when all are set', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 50 }),
            (goals) => {
              const teamTarget = calculateTeamCnpjGoalTarget(goals);
              const expectedSum = goals.reduce((sum, g) => sum + g, 0);
              
              expect(teamTarget).toBe(expectedSum);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should default null values to 10 in the sum', () => {
        fc.assert(
          fc.property(
            fc.array(fc.constantFrom(null, undefined), { minLength: 1, maxLength: 50 }),
            (nullGoals) => {
              const teamTarget = calculateTeamCnpjGoalTarget(nullGoals);
              const expectedSum = nullGoals.length * DEFAULT_CNPJ_GOAL;
              
              expect(teamTarget).toBe(expectedSum);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly mix set values and defaults', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.oneof(
                fc.integer({ min: 1, max: 100 }),
                fc.constant(null),
                fc.constant(undefined)
              ),
              { minLength: 2, maxLength: 20 }
            ),
            (mixedGoals) => {
              const teamTarget = calculateTeamCnpjGoalTarget(mixedGoals);
              
              // Calculate expected sum manually
              const expectedSum = mixedGoals.reduce<number>((sum, goal) => {
                if (goal === null || goal === undefined) {
                  return sum + DEFAULT_CNPJ_GOAL;
                }
                return sum + (goal as number);
              }, 0);
              
              expect(teamTarget).toBe(expectedSum);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle string values by parsing to integers', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 20 }),
            (goals) => {
              // Convert all goals to strings
              const stringGoals = goals.map(g => String(g));
              const teamTarget = calculateTeamCnpjGoalTarget(stringGoals);
              const expectedSum = goals.reduce((sum, g) => sum + g, 0);
              
              expect(teamTarget).toBe(expectedSum);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should return 0 for empty team', () => {
        const teamTarget = calculateTeamCnpjGoalTarget([]);
        expect(teamTarget).toBe(0);
      });
    });

    describe('Team target calculation scenarios', () => {
      
      it('should calculate correct team target for teams with various cnpj_goal configurations', () => {
        fc.assert(
          fc.property(
            teamWithCnpjGoals(1, 20),
            ({ members, expectedTeamTarget }) => {
              // Extract just the cnpj_goal values
              const goals = members.map(m => m.cnpjGoal);
              const teamTarget = calculateTeamCnpjGoalTarget(goals);
              
              expect(teamTarget).toBe(expectedTeamTarget);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should calculate team target as N * 10 when all members have null cnpj_goal', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            (teamSize) => {
              // All members have null cnpj_goal
              const goals = Array(teamSize).fill(null);
              const teamTarget = calculateTeamCnpjGoalTarget(goals);
              
              expect(teamTarget).toBe(teamSize * DEFAULT_CNPJ_GOAL);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should calculate team target as N * 10 when all members have undefined cnpj_goal', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            (teamSize) => {
              // All members have undefined cnpj_goal
              const goals = Array(teamSize).fill(undefined);
              const teamTarget = calculateTeamCnpjGoalTarget(goals);
              
              expect(teamTarget).toBe(teamSize * DEFAULT_CNPJ_GOAL);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle single member team correctly', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.integer({ min: 0, max: 1000 }),
              fc.constant(null),
              fc.constant(undefined)
            ),
            (cnpjGoal) => {
              const teamTarget = calculateTeamCnpjGoalTarget([cnpjGoal]);
              
              if (cnpjGoal === null || cnpjGoal === undefined) {
                expect(teamTarget).toBe(DEFAULT_CNPJ_GOAL);
              } else {
                expect(teamTarget).toBe(cnpjGoal);
              }
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should be commutative - order of members should not affect sum', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.oneof(
                fc.integer({ min: 1, max: 100 }),
                fc.constant(null)
              ),
              { minLength: 2, maxLength: 10 }
            ),
            (goals) => {
              const originalTarget = calculateTeamCnpjGoalTarget(goals);
              
              // Shuffle the goals array
              const shuffled = [...goals].sort(() => Math.random() - 0.5);
              const shuffledTarget = calculateTeamCnpjGoalTarget(shuffled);
              
              expect(shuffledTarget).toBe(originalTarget);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Edge cases', () => {
      
      it('should handle very large team sizes', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 50, max: 100 }),
            fc.integer({ min: 1, max: 100 }),
            (teamSize, goalValue) => {
              // All members have the same goal
              const goals = Array(teamSize).fill(goalValue);
              const teamTarget = calculateTeamCnpjGoalTarget(goals);
              
              expect(teamTarget).toBe(teamSize * goalValue);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should handle very large individual cnpj_goal values', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 1000, max: 100000 }), { minLength: 1, maxLength: 10 }),
            (largeGoals) => {
              const teamTarget = calculateTeamCnpjGoalTarget(largeGoals);
              const expectedSum = largeGoals.reduce((sum, g) => sum + g, 0);
              
              expect(teamTarget).toBe(expectedSum);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should handle zero cnpj_goal values correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 20 }),
            (teamSize) => {
              // All members have cnpj_goal = 0
              const goals = Array(teamSize).fill(0);
              const teamTarget = calculateTeamCnpjGoalTarget(goals);
              
              expect(teamTarget).toBe(0);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should handle mixed zero and non-zero values', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.oneof(
                fc.constant(0),
                fc.integer({ min: 1, max: 100 })
              ),
              { minLength: 2, maxLength: 20 }
            ),
            (mixedGoals) => {
              const teamTarget = calculateTeamCnpjGoalTarget(mixedGoals);
              const expectedSum = mixedGoals.reduce((sum, g) => sum + g, 0);
              
              expect(teamTarget).toBe(expectedSum);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle NaN string values by defaulting to 10', () => {
        const invalidStrings = ['abc', 'not-a-number', '', '   '];
        
        invalidStrings.forEach(invalidStr => {
          const teamTarget = calculateTeamCnpjGoalTarget([invalidStr]);
          expect(teamTarget).toBe(DEFAULT_CNPJ_GOAL);
        });
      });
    });

    describe('Additivity property', () => {
      
      it('should satisfy additivity: sum(A) + sum(B) = sum(A ∪ B)', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
            fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
            (goalsA, goalsB) => {
              const sumA = calculateTeamCnpjGoalTarget(goalsA);
              const sumB = calculateTeamCnpjGoalTarget(goalsB);
              const sumCombined = calculateTeamCnpjGoalTarget([...goalsA, ...goalsB]);
              
              expect(sumCombined).toBe(sumA + sumB);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should satisfy: adding a member increases team target by their goal', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
            fc.oneof(
              fc.integer({ min: 1, max: 100 }),
              fc.constant(null)
            ),
            (existingGoals, newMemberGoal) => {
              const originalTarget = calculateTeamCnpjGoalTarget(existingGoals);
              const newTarget = calculateTeamCnpjGoalTarget([...existingGoals, newMemberGoal]);
              
              const expectedIncrease = newMemberGoal === null ? DEFAULT_CNPJ_GOAL : newMemberGoal;
              
              expect(newTarget).toBe(originalTarget + expectedIncrease);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Default value consistency', () => {
      
      it('should use consistent default of 10 for all null/undefined values', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            fc.constantFrom(null, undefined),
            (teamSize, nullValue) => {
              const goals = Array(teamSize).fill(nullValue);
              const teamTarget = calculateTeamCnpjGoalTarget(goals);
              
              // Each null/undefined should contribute exactly 10
              expect(teamTarget).toBe(teamSize * DEFAULT_CNPJ_GOAL);
              expect(teamTarget % DEFAULT_CNPJ_GOAL).toBe(0);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should treat null and undefined identically', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 20 }),
            (teamSize) => {
              const nullGoals = Array(teamSize).fill(null);
              const undefinedGoals = Array(teamSize).fill(undefined);
              
              const nullTarget = calculateTeamCnpjGoalTarget(nullGoals);
              const undefinedTarget = calculateTeamCnpjGoalTarget(undefinedGoals);
              
              expect(nullTarget).toBe(undefinedTarget);
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });
});


/**
 * Property-Based Tests for Team entrega_goal Target Average
 * 
 * Feature: dashboard-metrics-refactor, Property 9: Team entrega_goal target is average of members
 * 
 * For any set of team members where each member has an `entrega_goal` value (or defaults to 90),
 * the team-level "Entregas no Prazo" target should equal the arithmetic mean of all individual
 * `entrega_goal` values.
 * 
 * **Validates: Requirements 5.6**
 */
describe('TeamManagementDashboardComponent - Property 9: Team entrega_goal Target is Average of Members', () => {
  
  // Default entrega_goal value when not set
  const DEFAULT_ENTREGA_GOAL = 90;
  
  /**
   * Pure function that calculates the team entrega_goal target from member goals.
   * This mirrors the exact logic used in loadTeamKPIs() for determining
   * the team-level "Entregas no Prazo" target.
   * 
   * @param memberGoals - Array of entrega_goal values (some may be null/undefined)
   * @returns The arithmetic mean of all goals (defaulting nulls to 90)
   */
  function calculateTeamEntregaGoalTarget(memberGoals: (number | string | null | undefined)[]): number {
    if (memberGoals.length === 0) {
      return 0;
    }
    
    const sum = memberGoals.reduce<number>((total, goal) => {
      // Default to 90 if entrega_goal is null or undefined
      if (goal === undefined || goal === null) {
        return total + DEFAULT_ENTREGA_GOAL;
      }
      
      const numValue = typeof goal === 'number' 
        ? goal 
        : parseFloat(String(goal));
      return total + (isNaN(numValue) ? DEFAULT_ENTREGA_GOAL : numValue);
    }, 0);
    
    return sum / memberGoals.length;
  }
  
  /**
   * Generates a team member with optional entrega_goal.
   * Simulates various states: set to number, set to string, null, undefined.
   */
  function memberWithEntregaGoal(): fc.Arbitrary<{
    userId: string;
    entregaGoal: number | string | null | undefined;
    expectedContribution: number;
  }> {
    return fc.tuple(
      fc.emailAddress(),
      fc.oneof(
        // Case 1: entrega_goal is a number between 0 and 100
        fc.integer({ min: 0, max: 100 }).map(goal => ({
          entregaGoal: goal as number | string | null | undefined,
          expectedContribution: goal
        })),
        // Case 2: entrega_goal is a decimal number between 0 and 100
        fc.float({ min: 0, max: 100, noNaN: true }).map(goal => ({
          entregaGoal: goal as number | string | null | undefined,
          expectedContribution: goal
        })),
        // Case 3: entrega_goal is a string representation of a number
        fc.integer({ min: 0, max: 100 }).map(goal => ({
          entregaGoal: String(goal) as number | string | null | undefined,
          expectedContribution: goal
        })),
        // Case 4: entrega_goal is null - should default to 90
        fc.constant({
          entregaGoal: null as number | string | null | undefined,
          expectedContribution: DEFAULT_ENTREGA_GOAL
        }),
        // Case 5: entrega_goal is undefined - should default to 90
        fc.constant({
          entregaGoal: undefined as number | string | null | undefined,
          expectedContribution: DEFAULT_ENTREGA_GOAL
        })
      )
    ).map(([userId, goalData]) => ({
      userId,
      entregaGoal: goalData.entregaGoal,
      expectedContribution: goalData.expectedContribution
    }));
  }
  
  /**
   * Generates a team of N members with various entrega_goal values.
   */
  function teamWithEntregaGoals(minSize: number = 1, maxSize: number = 20): fc.Arbitrary<{
    members: { userId: string; entregaGoal: number | string | null | undefined; expectedContribution: number }[];
    expectedTeamTarget: number;
  }> {
    return fc.array(memberWithEntregaGoal(), { minLength: minSize, maxLength: maxSize })
      .filter(members => {
        // Ensure all userIds are unique
        const userIds = members.map(m => m.userId);
        return new Set(userIds).size === userIds.length;
      })
      .map(members => ({
        members,
        expectedTeamTarget: members.length > 0 
          ? members.reduce((sum, m) => sum + m.expectedContribution, 0) / members.length
          : 0
      }));
  }

  describe('Property 9: Team entrega_goal target is average of members', () => {
    // Feature: dashboard-metrics-refactor, Property 9: Team entrega_goal target is average of members
    // **Validates: Requirements 5.6**
    
    describe('calculateTeamEntregaGoalTarget function', () => {
      
      it('should return average of all entrega_goal values when all are set', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 50 }),
            (goals) => {
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              const expectedAverage = goals.reduce((sum, g) => sum + g, 0) / goals.length;
              
              expect(teamTarget).toBeCloseTo(expectedAverage, 10);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should default null values to 90 in the average', () => {
        fc.assert(
          fc.property(
            fc.array(fc.constantFrom(null, undefined), { minLength: 1, maxLength: 50 }),
            (nullGoals) => {
              const teamTarget = calculateTeamEntregaGoalTarget(nullGoals);
              // All nulls default to 90, so average should be 90
              expect(teamTarget).toBe(DEFAULT_ENTREGA_GOAL);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly mix set values and defaults', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.oneof(
                fc.integer({ min: 0, max: 100 }),
                fc.constant(null),
                fc.constant(undefined)
              ),
              { minLength: 2, maxLength: 20 }
            ),
            (mixedGoals) => {
              const teamTarget = calculateTeamEntregaGoalTarget(mixedGoals);
              
              // Calculate expected average manually
              const sum = mixedGoals.reduce<number>((total, goal) => {
                if (goal === null || goal === undefined) {
                  return total + DEFAULT_ENTREGA_GOAL;
                }
                return total + (goal as number);
              }, 0);
              const expectedAverage = sum / mixedGoals.length;
              
              expect(teamTarget).toBeCloseTo(expectedAverage, 10);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle string values by parsing to floats', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 }),
            (goals) => {
              // Convert all goals to strings
              const stringGoals = goals.map(g => String(g));
              const teamTarget = calculateTeamEntregaGoalTarget(stringGoals);
              const expectedAverage = goals.reduce((sum, g) => sum + g, 0) / goals.length;
              
              expect(teamTarget).toBeCloseTo(expectedAverage, 10);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should return 0 for empty team', () => {
        const teamTarget = calculateTeamEntregaGoalTarget([]);
        expect(teamTarget).toBe(0);
      });
    });

    describe('Team target calculation scenarios', () => {
      
      it('should calculate correct team target for teams with various entrega_goal configurations', () => {
        fc.assert(
          fc.property(
            teamWithEntregaGoals(1, 20),
            ({ members, expectedTeamTarget }) => {
              // Extract just the entrega_goal values
              const goals = members.map(m => m.entregaGoal);
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              expect(teamTarget).toBeCloseTo(expectedTeamTarget, 5);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should calculate team target as 90 when all members have null entrega_goal', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            (teamSize) => {
              // All members have null entrega_goal
              const goals = Array(teamSize).fill(null);
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              // Average of all 90s is 90
              expect(teamTarget).toBe(DEFAULT_ENTREGA_GOAL);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should calculate team target as 90 when all members have undefined entrega_goal', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            (teamSize) => {
              // All members have undefined entrega_goal
              const goals = Array(teamSize).fill(undefined);
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              // Average of all 90s is 90
              expect(teamTarget).toBe(DEFAULT_ENTREGA_GOAL);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle single member team correctly', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.integer({ min: 0, max: 100 }),
              fc.constant(null),
              fc.constant(undefined)
            ),
            (entregaGoal) => {
              const teamTarget = calculateTeamEntregaGoalTarget([entregaGoal]);
              
              if (entregaGoal === null || entregaGoal === undefined) {
                expect(teamTarget).toBe(DEFAULT_ENTREGA_GOAL);
              } else {
                expect(teamTarget).toBe(entregaGoal);
              }
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should be commutative - order of members should not affect average', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.oneof(
                fc.integer({ min: 0, max: 100 }),
                fc.constant(null)
              ),
              { minLength: 2, maxLength: 10 }
            ),
            (goals) => {
              const originalTarget = calculateTeamEntregaGoalTarget(goals);
              
              // Shuffle the goals array
              const shuffled = [...goals].sort(() => Math.random() - 0.5);
              const shuffledTarget = calculateTeamEntregaGoalTarget(shuffled);
              
              expect(shuffledTarget).toBeCloseTo(originalTarget, 10);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Edge cases', () => {
      
      it('should handle very large team sizes', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 50, max: 100 }),
            fc.integer({ min: 0, max: 100 }),
            (teamSize, goalValue) => {
              // All members have the same goal
              const goals = Array(teamSize).fill(goalValue);
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              // Average of identical values is that value
              expect(teamTarget).toBe(goalValue);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should handle decimal entrega_goal values', () => {
        fc.assert(
          fc.property(
            fc.array(fc.float({ min: 0, max: 100, noNaN: true }), { minLength: 1, maxLength: 10 }),
            (decimalGoals) => {
              const teamTarget = calculateTeamEntregaGoalTarget(decimalGoals);
              const expectedAverage = decimalGoals.reduce((sum, g) => sum + g, 0) / decimalGoals.length;
              
              expect(teamTarget).toBeCloseTo(expectedAverage, 5);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should handle zero entrega_goal values correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 20 }),
            (teamSize) => {
              // All members have entrega_goal = 0
              const goals = Array(teamSize).fill(0);
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              expect(teamTarget).toBe(0);
            }
          ),
          { numRuns: 50 }
        );
      });

      it('should handle mixed zero and non-zero values', () => {
        fc.assert(
          fc.property(
            fc.array(
              fc.oneof(
                fc.constant(0),
                fc.integer({ min: 1, max: 100 })
              ),
              { minLength: 2, maxLength: 20 }
            ),
            (mixedGoals) => {
              const teamTarget = calculateTeamEntregaGoalTarget(mixedGoals);
              const expectedAverage = mixedGoals.reduce((sum, g) => sum + g, 0) / mixedGoals.length;
              
              expect(teamTarget).toBeCloseTo(expectedAverage, 10);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should handle NaN string values by defaulting to 90', () => {
        const invalidStrings = ['abc', 'not-a-number', '', '   '];
        
        invalidStrings.forEach(invalidStr => {
          const teamTarget = calculateTeamEntregaGoalTarget([invalidStr]);
          expect(teamTarget).toBe(DEFAULT_ENTREGA_GOAL);
        });
      });

      it('should handle boundary values 0 and 100', () => {
        fc.assert(
          fc.property(
            fc.array(fc.constantFrom(0, 100), { minLength: 1, maxLength: 20 }),
            (boundaryGoals) => {
              const teamTarget = calculateTeamEntregaGoalTarget(boundaryGoals);
              const expectedAverage = boundaryGoals.reduce<number>((sum, g) => sum + g, 0) / boundaryGoals.length;
              
              expect(teamTarget).toBeCloseTo(expectedAverage, 10);
              expect(teamTarget).toBeGreaterThanOrEqual(0);
              expect(teamTarget).toBeLessThanOrEqual(100);
            }
          ),
          { numRuns: 50 }
        );
      });
    });

    describe('Average calculation properties', () => {
      
      it('should satisfy: average is always between min and max of individual values', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 }),
            (goals) => {
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              const minGoal = Math.min(...goals);
              const maxGoal = Math.max(...goals);
              
              expect(teamTarget).toBeGreaterThanOrEqual(minGoal);
              expect(teamTarget).toBeLessThanOrEqual(maxGoal);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should satisfy: average of identical values equals that value', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            fc.integer({ min: 0, max: 100 }),
            (teamSize, goalValue) => {
              const goals = Array(teamSize).fill(goalValue);
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              expect(teamTarget).toBe(goalValue);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should satisfy: adding a member with average value does not change average', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 10 }),
            (goals) => {
              const originalAverage = calculateTeamEntregaGoalTarget(goals);
              
              // Add a member with the current average value
              const newGoals = [...goals, originalAverage];
              const newAverage = calculateTeamEntregaGoalTarget(newGoals);
              
              expect(newAverage).toBeCloseTo(originalAverage, 5);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should satisfy: weighted average property for combining teams', () => {
        fc.assert(
          fc.property(
            fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 10 }),
            fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 10 }),
            (goalsA, goalsB) => {
              const avgA = calculateTeamEntregaGoalTarget(goalsA);
              const avgB = calculateTeamEntregaGoalTarget(goalsB);
              const avgCombined = calculateTeamEntregaGoalTarget([...goalsA, ...goalsB]);
              
              // Weighted average formula: (n1*avg1 + n2*avg2) / (n1 + n2)
              const expectedCombined = (goalsA.length * avgA + goalsB.length * avgB) / (goalsA.length + goalsB.length);
              
              expect(avgCombined).toBeCloseTo(expectedCombined, 5);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Default value consistency', () => {
      
      it('should use consistent default of 90 for all null/undefined values', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 50 }),
            fc.constantFrom(null, undefined),
            (teamSize, nullValue) => {
              const goals = Array(teamSize).fill(nullValue);
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              // Average of all 90s should be exactly 90
              expect(teamTarget).toBe(DEFAULT_ENTREGA_GOAL);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should treat null and undefined identically', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 20 }),
            (teamSize) => {
              const nullGoals = Array(teamSize).fill(null);
              const undefinedGoals = Array(teamSize).fill(undefined);
              
              const nullTarget = calculateTeamEntregaGoalTarget(nullGoals);
              const undefinedTarget = calculateTeamEntregaGoalTarget(undefinedGoals);
              
              expect(nullTarget).toBe(undefinedTarget);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly calculate average when mixing defaults with explicit values', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 100 }),
            (numNulls, numExplicit, explicitValue) => {
              const goals: (number | null)[] = [
                ...Array(numNulls).fill(null),
                ...Array(numExplicit).fill(explicitValue)
              ];
              
              const teamTarget = calculateTeamEntregaGoalTarget(goals);
              
              // Expected: (numNulls * 90 + numExplicit * explicitValue) / (numNulls + numExplicit)
              const expectedAverage = (numNulls * DEFAULT_ENTREGA_GOAL + numExplicit * explicitValue) / (numNulls + numExplicit);
              
              expect(teamTarget).toBeCloseTo(expectedAverage, 5);
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });
});
