import { TestBed } from '@angular/core/testing';
import { KPIService } from './kpi.service';
import { FunifierApiService } from './funifier-api.service';
import { KPIMapper } from './kpi-mapper.service';
import { PlayerService } from './player.service';
import { UserActionDashboardService } from './user-action-dashboard.service';
import { GoalsKpiService } from './goals-kpi.service';
import { META_PROTOCOLO_TARGET, APOSENTADORIAS_TARGET } from '../constants/kpi-targets.constants';
import * as fc from 'fast-check';
import { of } from 'rxjs';

describe('KPIService', () => {
  let service: KPIService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;
  let mapperSpy: jasmine.SpyObj<KPIMapper>;
  let playerServiceSpy: jasmine.SpyObj<PlayerService>;
  let goalsKpiServiceSpy: jasmine.SpyObj<GoalsKpiService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('FunifierApiService', ['get']);
    const kpiMapperSpy = jasmine.createSpyObj('KPIMapper', ['toKPIDataArray']);
    const playerSpy = jasmine.createSpyObj('PlayerService', ['getCurrentPlayerData', 'getRawPlayerData']);
    const userActionSpy = jasmine.createSpyObj('UserActionDashboardService', ['getDeliveryCount']);
    const goalsKpiSpy = jasmine.createSpyObj('GoalsKpiService', ['getMetaProtocolo', 'getAposentadoriasConcedidas']);

    userActionSpy.getDeliveryCount.and.returnValue(of(0));
    playerSpy.getRawPlayerData.and.returnValue(of({ _id: 'test-player', extra: {} }));
    playerSpy.getCurrentPlayerData.and.returnValue(of({ _id: 'test-player', extra: {} }));
    // Default: return realistic values from goals API
    goalsKpiSpy.getMetaProtocolo.and.returnValue(Promise.resolve({ current: 500000, target: META_PROTOCOLO_TARGET }));
    goalsKpiSpy.getAposentadoriasConcedidas.and.returnValue(Promise.resolve({ current: 150, target: APOSENTADORIAS_TARGET }));

    TestBed.configureTestingModule({
      providers: [
        KPIService,
        { provide: FunifierApiService, useValue: apiSpy },
        { provide: KPIMapper, useValue: kpiMapperSpy },
        { provide: PlayerService, useValue: playerSpy },
        { provide: UserActionDashboardService, useValue: userActionSpy },
        { provide: GoalsKpiService, useValue: goalsKpiSpy }
      ]
    });

    service = TestBed.inject(KPIService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
    mapperSpy = TestBed.inject(KPIMapper) as jasmine.SpyObj<KPIMapper>;
    playerServiceSpy = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
    goalsKpiServiceSpy = TestBed.inject(GoalsKpiService) as jasmine.SpyObj<GoalsKpiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * Feature: gamification-dashboard, Property 4: KPI Progress Calculation
   * Validates: Requirements 5.2, 5.3
   */
  describe('Property 4: KPI Progress Calculation', () => {
    it('should calculate KPI percentage correctly for all valid inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }), // current
          fc.integer({ min: 1, max: 10000 }), // target (non-zero)
          (current, target) => {
            const percentage = service.calculateKPIProgress(current, target);
            const expected = Math.round((current / target) * 100);
            
            expect(percentage).toBe(expected);
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(percentage)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 for zero target', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }), // current
          (current) => {
            const percentage = service.calculateKPIProgress(current, 0);
            expect(percentage).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle current value exceeding target', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }), // target
          fc.integer({ min: 0, max: 5000 }), // excess amount
          (target, excess) => {
            const current = target + excess;
            const percentage = service.calculateKPIProgress(current, target);
            
            expect(percentage).toBeGreaterThanOrEqual(100);
            expect(Number.isInteger(percentage)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should determine color correctly based on percentage', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // target
          fc.integer({ min: 0, max: 150 }), // current (can exceed target)
          (target, current) => {
            const color = service.getKPIColor(current, target);
            const percentage = (current / target) * 100;
            
            if (percentage >= 80) {
              expect(color).toBe('green');
            } else if (percentage >= 50) {
              expect(color).toBe('yellow');
            } else {
              expect(color).toBe('red');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistency between calculateKPIProgress and getKPIColor', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }), // current
          fc.integer({ min: 1, max: 10000 }), // target
          (current, target) => {
            const percentage = service.calculateKPIProgress(current, target);
            const color = service.getKPIColor(current, target);
            
            // Verify color matches percentage thresholds
            if (percentage >= 80) {
              expect(color).toBe('green');
            } else if (percentage >= 50) {
              expect(color).toBe('yellow');
            } else {
              expect(color).toBe('red');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    it('should calculate 50% progress correctly', () => {
      const result = service.calculateKPIProgress(50, 100);
      expect(result).toBe(50);
    });

    it('should calculate 100% progress correctly', () => {
      const result = service.calculateKPIProgress(100, 100);
      expect(result).toBe(100);
    });

    it('should calculate 0% progress correctly', () => {
      const result = service.calculateKPIProgress(0, 100);
      expect(result).toBe(0);
    });

    it('should calculate over 100% progress correctly', () => {
      const result = service.calculateKPIProgress(150, 100);
      expect(result).toBe(150);
    });

    it('should round percentage to nearest integer', () => {
      const result = service.calculateKPIProgress(33, 100);
      expect(result).toBe(33);
    });

    it('should return green color for 80%+ completion', () => {
      expect(service.getKPIColor(80, 100)).toBe('green');
      expect(service.getKPIColor(90, 100)).toBe('green');
      expect(service.getKPIColor(100, 100)).toBe('green');
    });

    it('should return yellow color for 50-79% completion', () => {
      expect(service.getKPIColor(50, 100)).toBe('yellow');
      expect(service.getKPIColor(60, 100)).toBe('yellow');
      expect(service.getKPIColor(79, 100)).toBe('yellow');
    });

    it('should return red color for <50% completion', () => {
      expect(service.getKPIColor(0, 100)).toBe('red');
      expect(service.getKPIColor(25, 100)).toBe('red');
      expect(service.getKPIColor(49, 100)).toBe('red');
    });

    it('should handle zero target by returning red', () => {
      const color = service.getKPIColor(50, 0);
      expect(color).toBe('red');
    });
  });

  describe('New Metrics from Player Extra Info', () => {
    afterEach(() => {
      service.clearCache();
    });

    it('should NOT return numero-empresas even when player has cnpj data', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          cnpj: '10282,2368,10492',
          entrega: '85'
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const empresasKPI = result.find(kpi => kpi.id === 'numero-empresas');
        expect(empresasKPI).toBeUndefined();
        done();
      });
    });

    it('should extract Entregas no Prazo from player extra.entrega', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          entrega: '85' // 85%
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const entregasKPI = result.find(kpi => kpi.id === 'entregas-prazo');

        expect(entregasKPI).toBeDefined();
        expect(entregasKPI!.label).toBe('Entregas no Prazo');
        expect(entregasKPI!.current).toBe(85);
        expect(entregasKPI!.target).toBe(90);
        expect(entregasKPI!.superTarget).toBe(100);
        expect(entregasKPI!.unit).toBe('%');
        expect(entregasKPI!.color).toBe('red'); // 85 < 90 (below goal)
        done();
      });
    });

    it('should return meta-protocolo with correct label, unit, target', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          entrega: '85'
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));
      goalsKpiServiceSpy.getMetaProtocolo.and.returnValue(Promise.resolve({ current: 500000, target: META_PROTOCOLO_TARGET }));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const metaKPI = result.find(kpi => kpi.id === 'meta-protocolo');

        expect(metaKPI).toBeDefined();
        expect(metaKPI!.label).toBe('Meta de protocolo');
        expect(metaKPI!.unit).toBe('R$');
        expect(metaKPI!.target).toBe(META_PROTOCOLO_TARGET);
        expect(metaKPI!.current).toBe(500000);
        expect(metaKPI!.superTarget).toBe(Math.ceil(META_PROTOCOLO_TARGET * 1.5));
        done();
      });
    });

    it('should return aposentadorias-concedidas with correct label, unit, target', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          entrega: '85'
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));
      goalsKpiServiceSpy.getAposentadoriasConcedidas.and.returnValue(Promise.resolve({ current: 150, target: APOSENTADORIAS_TARGET }));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const aposentKPI = result.find(kpi => kpi.id === 'aposentadorias-concedidas');

        expect(aposentKPI).toBeDefined();
        expect(aposentKPI!.label).toBe('Aposentadorias concedidas');
        expect(aposentKPI!.unit).toBe('concedidos');
        expect(aposentKPI!.target).toBe(APOSENTADORIAS_TARGET);
        expect(aposentKPI!.current).toBe(150);
        expect(aposentKPI!.superTarget).toBe(Math.ceil(APOSENTADORIAS_TARGET * 1.5));
        done();
      });
    });

    it('should handle missing extra info gracefully — still generates meta-protocolo and aposentadorias-concedidas with current=0', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player'
        // No extra field
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));
      // Goals API returns null — fallback to 0 current, hardcoded target
      goalsKpiServiceSpy.getMetaProtocolo.and.returnValue(Promise.resolve(null));
      goalsKpiServiceSpy.getAposentadoriasConcedidas.and.returnValue(Promise.resolve(null));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const metaKPI = result.find(kpi => kpi.id === 'meta-protocolo');
        const aposentKPI = result.find(kpi => kpi.id === 'aposentadorias-concedidas');

        expect(metaKPI).toBeDefined();
        expect(metaKPI!.current).toBe(0);
        expect(aposentKPI).toBeDefined();
        expect(aposentKPI!.current).toBe(0);

        // entregas-prazo should NOT be present (no entrega data)
        const entregasKPI = result.find(kpi => kpi.id === 'entregas-prazo');
        expect(entregasKPI).toBeUndefined();
        done();
      });
    });

    it('should never return numero-empresas regardless of cnpj content', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          cnpj: '', // Empty string
          entrega: '75'
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const empresasKPI = result.find(kpi => kpi.id === 'numero-empresas');
        expect(empresasKPI).toBeUndefined();

        const entregasKPI = result.find(kpi => kpi.id === 'entregas-prazo');
        expect(entregasKPI).toBeDefined();
        done();
      });
    });

    it('should calculate percentage based on target for deliveries', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          entrega: '85' // 85%
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const entregasKPI = result.find(kpi => kpi.id === 'entregas-prazo');

        expect(entregasKPI).toBeDefined();
        expect(entregasKPI!.current).toBe(85);
        expect(entregasKPI!.superTarget).toBe(100);
        // percentage = Math.min(85/100 * 100, 100) = 85
        expect(entregasKPI!.percentage).toBe(85);
        done();
      });
    });

    it('should cap entregas percentage at 100% when exceeding target', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          entrega: '105' // 105%
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const entregasKPI = result.find(kpi => kpi.id === 'entregas-prazo');

        expect(entregasKPI).toBeDefined();
        expect(entregasKPI!.percentage).toBe(100); // Capped at 100%
        done();
      });
    });

    it('should default current to 0 when player extra data is missing meta_protocolo and aposentadorias_concedidas', (done) => {
      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {} // No meta_protocolo or aposentadorias_concedidas
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));
      // Goals API returns null — current defaults to 0
      goalsKpiServiceSpy.getMetaProtocolo.and.returnValue(Promise.resolve(null));
      goalsKpiServiceSpy.getAposentadoriasConcedidas.and.returnValue(Promise.resolve(null));

      service.getPlayerKPIs('test-player').subscribe(result => {
        const metaKPI = result.find(kpi => kpi.id === 'meta-protocolo');
        const aposentKPI = result.find(kpi => kpi.id === 'aposentadorias-concedidas');

        expect(metaKPI).toBeDefined();
        expect(metaKPI!.current).toBe(0);
        expect(aposentKPI).toBeDefined();
        expect(aposentKPI!.current).toBe(0);
        done();
      });
    });
  });

  describe('getPlayerKPIsForDateRange()', () => {
    afterEach(() => {
      service.clearCache();
    });

    it('should NOT return numero-empresas in date range results', (done) => {
      const now = new Date();
      const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {
          cnpj: '10282,2368,10492',
          entrega: '85'
        }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

      service.getPlayerKPIsForDateRange('test-player', rangeStart, rangeEnd).subscribe(result => {
        const empresasKPI = result.find(kpi => kpi.id === 'numero-empresas');
        expect(empresasKPI).toBeUndefined();
        done();
      });
    });

    it('should return meta-protocolo and aposentadorias-concedidas with correct values in date range', (done) => {
      const now = new Date();
      const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: { entrega: '85' }
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));
      goalsKpiServiceSpy.getMetaProtocolo.and.returnValue(Promise.resolve({ current: 500000, target: META_PROTOCOLO_TARGET }));
      goalsKpiServiceSpy.getAposentadoriasConcedidas.and.returnValue(Promise.resolve({ current: 150, target: APOSENTADORIAS_TARGET }));

      service.getPlayerKPIsForDateRange('test-player', rangeStart, rangeEnd).subscribe(result => {
        const metaKPI = result.find(kpi => kpi.id === 'meta-protocolo');
        expect(metaKPI).toBeDefined();
        expect(metaKPI!.label).toBe('Meta de protocolo');
        expect(metaKPI!.unit).toBe('R$');
        expect(metaKPI!.target).toBe(META_PROTOCOLO_TARGET);
        expect(metaKPI!.current).toBe(500000);
        expect(metaKPI!.superTarget).toBe(Math.ceil(META_PROTOCOLO_TARGET * 1.5));

        const aposentKPI = result.find(kpi => kpi.id === 'aposentadorias-concedidas');
        expect(aposentKPI).toBeDefined();
        expect(aposentKPI!.label).toBe('Aposentadorias concedidas');
        expect(aposentKPI!.unit).toBe('concedidos');
        expect(aposentKPI!.target).toBe(APOSENTADORIAS_TARGET);
        expect(aposentKPI!.current).toBe(150);
        expect(aposentKPI!.superTarget).toBe(Math.ceil(APOSENTADORIAS_TARGET * 1.5));
        done();
      });
    });

    it('should default current to 0 in date range when goals API returns null', (done) => {
      const now = new Date();
      const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const mockPlayerStatus = {
        _id: 'test-player',
        name: 'Test Player',
        extra: {}
      };

      playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));
      goalsKpiServiceSpy.getMetaProtocolo.and.returnValue(Promise.resolve(null));
      goalsKpiServiceSpy.getAposentadoriasConcedidas.and.returnValue(Promise.resolve(null));

      service.getPlayerKPIsForDateRange('test-player', rangeStart, rangeEnd).subscribe(result => {
        const metaKPI = result.find(kpi => kpi.id === 'meta-protocolo');
        const aposentKPI = result.find(kpi => kpi.id === 'aposentadorias-concedidas');

        expect(metaKPI).toBeDefined();
        expect(metaKPI!.current).toBe(0);
        expect(aposentKPI).toBeDefined();
        expect(aposentKPI!.current).toBe(0);
        done();
      });
    });
  });

  describe('Goal-based Color System', () => {
    it('should return green for values above super goal', () => {
      expect(service.getKPIColorByGoals(95, 80, 90)).toBe('green'); // Above super goal
      expect(service.getKPIColorByGoals(16, 10, 15)).toBe('green'); // Above super goal
    });

    it('should return yellow for values above goal but below super goal', () => {
      expect(service.getKPIColorByGoals(85, 80, 90)).toBe('yellow'); // Above goal, below super goal
      expect(service.getKPIColorByGoals(12, 10, 15)).toBe('yellow'); // Above goal, below super goal
    });

    it('should return red for values below goal', () => {
      expect(service.getKPIColorByGoals(75, 80, 90)).toBe('red'); // Below goal
      expect(service.getKPIColorByGoals(8, 10, 15)).toBe('red'); // Below goal
    });

    it('should handle edge cases correctly', () => {
      expect(service.getKPIColorByGoals(80, 80, 90)).toBe('yellow'); // Exactly at goal
      expect(service.getKPIColorByGoals(90, 80, 90)).toBe('green'); // Exactly at super goal
      expect(service.getKPIColorByGoals(10, 10, 15)).toBe('yellow'); // Exactly at goal
      expect(service.getKPIColorByGoals(15, 10, 15)).toBe('green'); // Exactly at super goal
    });
  });

  /**
   * Feature: kpi-bars-revision, Property 1: numero-empresas exclusion invariant
   * Validates: Requirements 1.1, 1.3
   */
  describe('Property 1: numero-empresas exclusion invariant', () => {
    // Generator for random player extra data with optional fields that could
    // historically trigger numero-empresas (e.g. cnpj with comma-separated numbers)
    const playerExtraArb = fc.record({
      cnpj: fc.option(
        fc.array(fc.integer({ min: 1000, max: 99999 }), { minLength: 0, maxLength: 10 })
          .map(nums => nums.join(',')),
        { nil: undefined }
      ),
      entrega: fc.option(
        fc.integer({ min: 0, max: 100 }).map(String),
        { nil: undefined }
      ),
      meta_protocolo: fc.option(
        fc.integer({ min: 0, max: 5000000 }).map(String),
        { nil: undefined }
      ),
      aposentadorias_concedidas: fc.option(
        fc.integer({ min: 0, max: 1000 }).map(String),
        { nil: undefined }
      ),
      client_goals: fc.option(
        fc.integer({ min: 0, max: 500 }),
        { nil: undefined }
      ),
    });

    afterEach(() => {
      service.clearCache();
    });

    it('getPlayerKPIs() output never contains id === numero-empresas for any player extra data', (done) => {
      fc.assert(
        fc.asyncProperty(playerExtraArb, async (extra) => {
          service.clearCache();

          const cleanExtra: Record<string, any> = {};
          if (extra.cnpj !== undefined) cleanExtra['cnpj'] = extra.cnpj;
          if (extra.entrega !== undefined) cleanExtra['entrega'] = extra.entrega;
          if (extra.meta_protocolo !== undefined) cleanExtra['meta_protocolo'] = extra.meta_protocolo;
          if (extra.aposentadorias_concedidas !== undefined) cleanExtra['aposentadorias_concedidas'] = extra.aposentadorias_concedidas;
          if (extra.client_goals !== undefined) cleanExtra['client_goals'] = extra.client_goals;

          const mockPlayerStatus = {
            _id: 'pbt-player',
            name: 'PBT Player',
            extra: cleanExtra
          };

          playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

          const result = await service.getPlayerKPIs('pbt-player').toPromise();
          const hasNumeroEmpresas = result!.some(kpi => kpi.id === 'numero-empresas');
          expect(hasNumeroEmpresas).toBe(false);
        }),
        { numRuns: 100 }
      ).then(() => done(), (err) => done.fail(err));
    });

    it('getPlayerKPIsForDateRange() output never contains id === numero-empresas for any player extra data', (done) => {
      const now = new Date();
      const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      fc.assert(
        fc.asyncProperty(playerExtraArb, async (extra) => {
          service.clearCache();

          const cleanExtra: Record<string, any> = {};
          if (extra.cnpj !== undefined) cleanExtra['cnpj'] = extra.cnpj;
          if (extra.entrega !== undefined) cleanExtra['entrega'] = extra.entrega;
          if (extra.meta_protocolo !== undefined) cleanExtra['meta_protocolo'] = extra.meta_protocolo;
          if (extra.aposentadorias_concedidas !== undefined) cleanExtra['aposentadorias_concedidas'] = extra.aposentadorias_concedidas;
          if (extra.client_goals !== undefined) cleanExtra['client_goals'] = extra.client_goals;

          const mockPlayerStatus = {
            _id: 'pbt-player',
            name: 'PBT Player',
            extra: cleanExtra
          };

          playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

          const result = await service.getPlayerKPIsForDateRange('pbt-player', rangeStart, rangeEnd).toPromise();
          const hasNumeroEmpresas = result!.some(kpi => kpi.id === 'numero-empresas');
          expect(hasNumeroEmpresas).toBe(false);
        }),
        { numRuns: 100 }
      ).then(() => done(), (err) => done.fail(err));
    });
  });

  /**
   * Feature: kpi-bars-revision, Property 2: New KPIs structural correctness
   * Validates: Requirements 3.1, 3.2, 4.1, 4.2
   */
  describe('Property 2: New KPIs structural correctness', () => {
    // Reuse the same playerExtraArb generator pattern from Property 1
    const playerExtraArb = fc.record({
      cnpj: fc.option(
        fc.array(fc.integer({ min: 1000, max: 99999 }), { minLength: 0, maxLength: 10 })
          .map(nums => nums.join(',')),
        { nil: undefined }
      ),
      entrega: fc.option(
        fc.integer({ min: 0, max: 100 }).map(String),
        { nil: undefined }
      ),
      meta_protocolo: fc.option(
        fc.integer({ min: 0, max: 5000000 }).map(String),
        { nil: undefined }
      ),
      aposentadorias_concedidas: fc.option(
        fc.integer({ min: 0, max: 1000 }).map(String),
        { nil: undefined }
      ),
      client_goals: fc.option(
        fc.integer({ min: 0, max: 500 }),
        { nil: undefined }
      ),
    });

    afterEach(() => {
      service.clearCache();
    });

    it('getPlayerKPIs() always contains meta-protocolo with correct label, unit, target, and superTarget', (done) => {
      fc.assert(
        fc.asyncProperty(playerExtraArb, async (extra) => {
          service.clearCache();

          const cleanExtra: Record<string, any> = {};
          if (extra.cnpj !== undefined) cleanExtra['cnpj'] = extra.cnpj;
          if (extra.entrega !== undefined) cleanExtra['entrega'] = extra.entrega;
          if (extra.meta_protocolo !== undefined) cleanExtra['meta_protocolo'] = extra.meta_protocolo;
          if (extra.aposentadorias_concedidas !== undefined) cleanExtra['aposentadorias_concedidas'] = extra.aposentadorias_concedidas;
          if (extra.client_goals !== undefined) cleanExtra['client_goals'] = extra.client_goals;

          const mockPlayerStatus = {
            _id: 'pbt-player',
            name: 'PBT Player',
            extra: cleanExtra
          };

          playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

          const result = await service.getPlayerKPIs('pbt-player').toPromise();
          const metaKPI = result!.find(kpi => kpi.id === 'meta-protocolo');

          expect(metaKPI).toBeDefined();
          expect(metaKPI!.label).toBe('Meta de protocolo');
          expect(metaKPI!.unit).toBe('R$');
          expect(metaKPI!.target).toBe(META_PROTOCOLO_TARGET);
          expect(metaKPI!.superTarget).toBe(Math.ceil(META_PROTOCOLO_TARGET * 1.5));
        }),
        { numRuns: 100 }
      ).then(() => done(), (err) => done.fail(err));
    });

    it('getPlayerKPIs() always contains aposentadorias-concedidas with correct label, unit, target, and superTarget', (done) => {
      fc.assert(
        fc.asyncProperty(playerExtraArb, async (extra) => {
          service.clearCache();

          const cleanExtra: Record<string, any> = {};
          if (extra.cnpj !== undefined) cleanExtra['cnpj'] = extra.cnpj;
          if (extra.entrega !== undefined) cleanExtra['entrega'] = extra.entrega;
          if (extra.meta_protocolo !== undefined) cleanExtra['meta_protocolo'] = extra.meta_protocolo;
          if (extra.aposentadorias_concedidas !== undefined) cleanExtra['aposentadorias_concedidas'] = extra.aposentadorias_concedidas;
          if (extra.client_goals !== undefined) cleanExtra['client_goals'] = extra.client_goals;

          const mockPlayerStatus = {
            _id: 'pbt-player',
            name: 'PBT Player',
            extra: cleanExtra
          };

          playerServiceSpy.getRawPlayerData.and.returnValue(of(mockPlayerStatus));

          const result = await service.getPlayerKPIs('pbt-player').toPromise();
          const aposentKPI = result!.find(kpi => kpi.id === 'aposentadorias-concedidas');

          expect(aposentKPI).toBeDefined();
          expect(aposentKPI!.label).toBe('Aposentadorias concedidas');
          expect(aposentKPI!.unit).toBe('concedidos');
          expect(aposentKPI!.target).toBe(APOSENTADORIAS_TARGET);
          expect(aposentKPI!.superTarget).toBe(Math.ceil(APOSENTADORIAS_TARGET * 1.5));
        }),
        { numRuns: 100 }
      ).then(() => done(), (err) => done.fail(err));
    });
  });
});
