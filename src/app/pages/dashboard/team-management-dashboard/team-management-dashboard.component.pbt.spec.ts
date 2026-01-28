import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import * as fc from 'fast-check';
import { TeamManagementDashboardComponent } from './team-management-dashboard.component';
import { TeamAggregateService, TeamSeasonPoints, TeamProgressMetrics, Collaborator } from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { of } from 'rxjs';
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
