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
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TEAM_KPI_VISIBILITY, DEFAULT_VISIBLE_KPIS } from '@app/constants/kpi-targets.constants';

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
      imports: [BrowserAnimationsModule, HttpClientTestingModule],
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
   * Feature: kpi-bars-revision, Property 5: Valor-concedido finance-only visibility
   *
   * For any user profile, if the user belongs to Finance_Team (team_id '6' or
   * team name containing "financeiro"), then enabledKPIs SHALL include an item
   * with id === 'valor-concedido'. For any user profile where the user does NOT
   * belong to Finance_Team, enabledKPIs SHALL contain zero items with
   * id === 'valor-concedido'.
   *
   * **Validates: Requirements 2.1, 2.3, 2.4**
   */
  describe('Property 5: Valor-concedido finance-only visibility', () => {
    // Generator: finance team configs (either by ID '6' or name containing 'financeiro')
    const financeTeamArb: fc.Arbitrary<{ id: string; name: string }> = fc.oneof(
      // Finance by ID
      fc.record({
        id: fc.constant('6'),
        name: fc.string({ minLength: 1, maxLength: 30 })
      }),
      // Finance by name (contains 'financeiro' case-insensitive)
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }).filter(id => id !== '6'),
        name: fc.string({ minLength: 0, maxLength: 10 }).map(
          s => s.slice(0, 5) + 'financeiro' + s.slice(0, 3)
        )
      })
    );

    // Generator: non-finance team configs (id !== '6' and name does NOT contain 'financeiro')
    const nonFinanceTeamArb: fc.Arbitrary<{ id: string; name: string }> = fc.record({
      id: fc.string({ minLength: 1, maxLength: 10 }).filter(id => id !== '6'),
      name: fc.string({ minLength: 1, maxLength: 30 }).filter(
        n => !n.toLowerCase().includes('financeiro')
      )
    });

    // Helper: build a KPIData array that includes valor-concedido
    function buildKpisWithValorConcedido(): any[] {
      return [
        { id: 'entregas-prazo', label: 'Entregas no prazo', current: 80, target: 100, unit: '%', color: 'green', percentage: 80 },
        { id: 'valor-concedido', label: 'Valor concedido', current: 50000, target: 100000, unit: 'R$', color: 'yellow', percentage: 50 },
        { id: 'meta-protocolo', label: 'Meta de protocolo', current: 500000, target: 1000000, unit: 'R$', color: 'yellow', percentage: 50 },
        { id: 'aposentadorias-concedidas', label: 'Aposentadorias concedidas', current: 100, target: 220, unit: 'concedidos', color: 'yellow', percentage: 45 }
      ];
    }

    it('should include valor-concedido in enabledKPIs when team is finance', () => {
      fc.assert(
        fc.property(
          financeTeamArb,
          (teamConfig) => {
            // Set up component with finance team
            component.teamKPIs = buildKpisWithValorConcedido();
            component.selectedTeamId = teamConfig.id;
            component.teams = [{ id: teamConfig.id, name: teamConfig.name, memberCount: 5 }];
            component.displayTeamName = teamConfig.name;

            const enabled = component.enabledKPIs;
            const hasValorConcedido = enabled.some((kpi: any) => kpi.id === 'valor-concedido');

            // Property: finance team MUST see valor-concedido
            expect(hasValorConcedido).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should exclude valor-concedido from enabledKPIs when team is NOT finance', () => {
      fc.assert(
        fc.property(
          nonFinanceTeamArb,
          (teamConfig) => {
            // Set up component with non-finance team
            component.teamKPIs = buildKpisWithValorConcedido();
            component.selectedTeamId = teamConfig.id;
            component.teams = [{ id: teamConfig.id, name: teamConfig.name, memberCount: 5 }];
            component.displayTeamName = teamConfig.name;

            const enabled = component.enabledKPIs;
            const hasValorConcedido = enabled.some((kpi: any) => kpi.id === 'valor-concedido');

            // Property: non-finance team MUST NOT see valor-concedido
            expect(hasValorConcedido).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include valor-concedido iff team is finance (bidirectional)', () => {
      fc.assert(
        fc.property(
          fc.oneof(financeTeamArb, nonFinanceTeamArb) as fc.Arbitrary<{ id: string; name: string }>,
          (teamConfig) => {
            component.teamKPIs = buildKpisWithValorConcedido();
            component.selectedTeamId = teamConfig.id;
            component.teams = [{ id: teamConfig.id, name: teamConfig.name, memberCount: 5 }];
            component.displayTeamName = teamConfig.name;

            const isFinance =
              teamConfig.id === '6' ||
              teamConfig.name.toLowerCase().includes('financeiro');

            const enabled = component.enabledKPIs;
            const hasValorConcedido = enabled.some((kpi: any) => kpi.id === 'valor-concedido');

            // Bidirectional property: valor-concedido present iff finance team
            expect(hasValorConcedido).toBe(isFinance);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: kpi-bars-revision, Property 7: Team-specific KPI visibility filtering
   *
   * For any team with a configured visibility list in TEAM_KPI_VISIBILITY,
   * the enabledKPIs getter SHALL return only KPIs whose id appears in that
   * team's visibility list (minus numero-empresas which is always excluded).
   * For any team without a configured visibility list, the enabledKPIs getter
   * SHALL return all KPIs in DEFAULT_VISIBLE_KPIS (plus valor-concedido if
   * finance team).
   *
   * **Validates: Requirements 6.2, 6.4**
   */
  describe('Property 7: Team-specific KPI visibility filtering', () => {
    const ALL_KPI_IDS = ['entregas-prazo', 'meta-protocolo', 'aposentadorias-concedidas', 'valor-concedido', 'numero-empresas'];

    // Prototype property names that must be excluded from generated team IDs
    // to avoid collisions with Object.prototype methods
    const PROTO_KEYS = new Set([
      '__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty',
      'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__',
      '__defineSetter__', '__lookupGetter__', '__lookupSetter__'
    ]);

    // Generator: random team ID (non-finance, non-empty, safe from prototype collisions)
    const teamIdArb = fc.array(
      fc.constantFrom('a','b','c','d','e','f','g','0','1','2','3','4','5','7','8','9','-','_'),
      { minLength: 1, maxLength: 15 }
    ).map(chars => chars.join('')).filter(
      id => id !== '6' && !PROTO_KEYS.has(id) && id.trim().length > 0
    );

    // Generator: random visibility list (subset of KPI IDs excluding numero-empresas)
    const visibilityListArb = fc.subarray(
      ['entregas-prazo', 'meta-protocolo', 'aposentadorias-concedidas', 'valor-concedido'],
      { minLength: 0 }
    );

    // Generator: random KPIData array from ALL_KPI_IDS
    const kpiDataArrayArb = fc.subarray(ALL_KPI_IDS, { minLength: 1 }).map(ids =>
      ids.map(id => ({
        id,
        label: `Label for ${id}`,
        current: 50,
        target: 100,
        unit: id === 'valor-concedido' || id === 'meta-protocolo' ? 'R$' : '%',
        color: 'yellow' as const,
        percentage: 50
      }))
    );

    // Helper: build a non-finance team name
    function nonFinanceName(): string {
      return 'Departamento Pessoal';
    }

    afterEach(() => {
      // Clean up any keys added to the shared mutable TEAM_KPI_VISIBILITY
      for (const key of Object.keys(TEAM_KPI_VISIBILITY)) {
        delete TEAM_KPI_VISIBILITY[key];
      }
    });

    it('should return only KPIs in the team visibility list when config exists', () => {
      fc.assert(
        fc.property(
          teamIdArb,
          visibilityListArb,
          kpiDataArrayArb,
          (teamId, visibilityList, kpiData) => {
            // Set up team-specific visibility config
            TEAM_KPI_VISIBILITY[teamId] = visibilityList;

            // Configure component with non-finance team
            component.teamKPIs = kpiData;
            component.selectedTeamId = teamId;
            component.teams = [{ id: teamId, name: nonFinanceName(), memberCount: 5 }];
            component.displayTeamName = nonFinanceName();

            const enabled = component.enabledKPIs;

            // Property: every enabled KPI must be in the visibility list
            for (const kpi of enabled) {
              expect(visibilityList).toContain(kpi.id);
            }

            // Property: numero-empresas is always excluded
            expect(enabled.some((kpi: any) => kpi.id === 'numero-empresas')).toBe(false);

            // Property: every KPI in the input that IS in the visibility list
            // (and is not numero-empresas or valor-concedido for non-finance)
            // should appear in enabled
            for (const kpi of kpiData) {
              if (kpi.id === 'numero-empresas') continue;
              if (kpi.id === 'valor-concedido') continue; // non-finance team, always excluded
              if (visibilityList.includes(kpi.id)) {
                expect(enabled.some((e: any) => e.id === kpi.id)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return DEFAULT_VISIBLE_KPIS when no team-specific config exists', () => {
      fc.assert(
        fc.property(
          teamIdArb,
          kpiDataArrayArb,
          (teamId, kpiData) => {
            // Ensure no config exists for this team
            delete TEAM_KPI_VISIBILITY[teamId];

            // Configure component with non-finance team
            component.teamKPIs = kpiData;
            component.selectedTeamId = teamId;
            component.teams = [{ id: teamId, name: nonFinanceName(), memberCount: 5 }];
            component.displayTeamName = nonFinanceName();

            const enabled = component.enabledKPIs;

            // Property: every enabled KPI must be in DEFAULT_VISIBLE_KPIS
            // (valor-concedido is excluded for non-finance teams by the
            //  isSelectedFinanceTeam check, even though isKpiVisibleForTeam
            //  allows it in the default path)
            for (const kpi of enabled) {
              expect(DEFAULT_VISIBLE_KPIS).toContain(kpi.id);
            }

            // Property: numero-empresas is always excluded
            expect(enabled.some((kpi: any) => kpi.id === 'numero-empresas')).toBe(false);

            // Property: valor-concedido excluded for non-finance
            expect(enabled.some((kpi: any) => kpi.id === 'valor-concedido')).toBe(false);

            // Property: KPIs in DEFAULT_VISIBLE_KPIS that are in the input should appear
            for (const kpi of kpiData) {
              if (DEFAULT_VISIBLE_KPIS.includes(kpi.id)) {
                expect(enabled.some((e: any) => e.id === kpi.id)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include valor-concedido for finance team when in visibility list', () => {
      fc.assert(
        fc.property(
          visibilityListArb.filter(list => list.includes('valor-concedido')),
          kpiDataArrayArb.filter(kpis => kpis.some(k => k.id === 'valor-concedido')),
          (visibilityList, kpiData) => {
            const financeTeamId = '6';
            TEAM_KPI_VISIBILITY[financeTeamId] = visibilityList;

            // Configure component with finance team
            component.teamKPIs = kpiData;
            component.selectedTeamId = financeTeamId;
            component.teams = [{ id: financeTeamId, name: 'Financeiro', memberCount: 5 }];
            component.displayTeamName = 'Financeiro';

            const enabled = component.enabledKPIs;

            // Property: finance team with valor-concedido in visibility list should see it
            expect(enabled.some((kpi: any) => kpi.id === 'valor-concedido')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should exclude valor-concedido for non-finance team even when in visibility list', () => {
      fc.assert(
        fc.property(
          teamIdArb,
          kpiDataArrayArb.filter(kpis => kpis.some(k => k.id === 'valor-concedido')),
          (teamId, kpiData) => {
            // Put valor-concedido in the visibility list
            TEAM_KPI_VISIBILITY[teamId] = ['entregas-prazo', 'valor-concedido', 'meta-protocolo'];

            // Configure component with non-finance team
            component.teamKPIs = kpiData;
            component.selectedTeamId = teamId;
            component.teams = [{ id: teamId, name: nonFinanceName(), memberCount: 5 }];
            component.displayTeamName = nonFinanceName();

            const enabled = component.enabledKPIs;

            // Property: non-finance team MUST NOT see valor-concedido
            // even if it's in the team visibility config
            expect(enabled.some((kpi: any) => kpi.id === 'valor-concedido')).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty visibility list by showing no KPIs', () => {
      fc.assert(
        fc.property(
          teamIdArb,
          kpiDataArrayArb,
          (teamId, kpiData) => {
            // Set empty visibility list
            TEAM_KPI_VISIBILITY[teamId] = [];

            component.teamKPIs = kpiData;
            component.selectedTeamId = teamId;
            component.teams = [{ id: teamId, name: nonFinanceName(), memberCount: 5 }];
            component.displayTeamName = nonFinanceName();

            const enabled = component.enabledKPIs;

            // Property: empty visibility list means no KPIs pass the filter
            expect(enabled.length).toBe(0);
          }
        ),
        { numRuns: 100 }
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
