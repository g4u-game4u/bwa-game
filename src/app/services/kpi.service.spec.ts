import { TestBed } from '@angular/core/testing';
import { KPIService } from './kpi.service';
import { BackendApiService } from './backend-api.service';
import { KPIMapper } from './kpi-mapper.service';
import { PlayerService } from './player.service';
import * as fc from 'fast-check';
import { of } from 'rxjs';

describe('KPIService', () => {
  let service: KPIService;
  let backendApiSpy: jasmine.SpyObj<BackendApiService>;
  let mapperSpy: jasmine.SpyObj<KPIMapper>;
  let playerServiceSpy: jasmine.SpyObj<PlayerService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('BackendApiService', ['get', 'post']);
    const kpiMapperSpy = jasmine.createSpyObj('KPIMapper', ['toKPIDataArray']);
    const playerSpy = jasmine.createSpyObj('PlayerService', ['getRawPlayerData']);

    TestBed.configureTestingModule({
      providers: [
        KPIService,
        { provide: BackendApiService, useValue: apiSpy },
        { provide: KPIMapper, useValue: kpiMapperSpy },
        { provide: PlayerService, useValue: playerSpy }
      ]
    });

    service = TestBed.inject(KPIService);
    backendApiSpy = TestBed.inject(BackendApiService) as jasmine.SpyObj<BackendApiService>;
    mapperSpy = TestBed.inject(KPIMapper) as jasmine.SpyObj<KPIMapper>;
    playerServiceSpy = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
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
  });

  describe('getPlayerKPIs', () => {
    beforeEach(() => {
      playerServiceSpy.getRawPlayerData.and.returnValue(
        of({
          extra: {
            client_goals: 100,
            entrega: '85',
            entrega_goal: 90,
            companies: 'a;b;c;d'
          }
        } as any)
      );
    });

    it('should count clientes na carteira from player extra.companies', done => {
      service.getPlayerKPIs('player@x.com').subscribe(kpis => {
        const carteira = kpis.find(k => k.id === 'numero-empresas');
        expect(carteira?.current).toBe(4);
        expect(playerServiceSpy.getRawPlayerData).toHaveBeenCalledWith('player@x.com');
        done();
      });
    });
  });
});
