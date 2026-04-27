import { TestBed } from '@angular/core/testing';
import { KPIService } from './kpi.service';
import { FunifierApiService } from './funifier-api.service';
import { KPIMapper } from './kpi-mapper.service';
import { PlayerService } from './player.service';
import { CompanyService } from './company.service';
import * as fc from 'fast-check';
import { of } from 'rxjs';
import { Company } from '@model/gamification-dashboard.model';

describe('KPIService', () => {
  let service: KPIService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;
  let mapperSpy: jasmine.SpyObj<KPIMapper>;
  let playerServiceSpy: jasmine.SpyObj<PlayerService>;
  let companyServiceSpy: jasmine.SpyObj<CompanyService>;

  function mockCompanies(n: number): Company[] {
    return Array.from({ length: n }, (_, i) => ({
      id: String(i + 1),
      name: `Empresa ${i}`,
      cnpj: `${i + 1}.000.000/0001-00`,
      healthScore: 80,
      kpis: []
    }));
  }

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('FunifierApiService', ['get', 'post']);
    const kpiMapperSpy = jasmine.createSpyObj('KPIMapper', ['toKPIDataArray']);
    const playerSpy = jasmine.createSpyObj('PlayerService', ['getRawPlayerData']);
    const companySpy = jasmine.createSpyObj('CompanyService', ['getCompanies']);

    companySpy.getCompanies.and.returnValue(of(mockCompanies(6)));

    TestBed.configureTestingModule({
      providers: [
        KPIService,
        { provide: FunifierApiService, useValue: apiSpy },
        { provide: KPIMapper, useValue: kpiMapperSpy },
        { provide: PlayerService, useValue: playerSpy },
        { provide: CompanyService, useValue: companySpy }
      ]
    });

    service = TestBed.inject(KPIService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
    mapperSpy = TestBed.inject(KPIMapper) as jasmine.SpyObj<KPIMapper>;
    playerServiceSpy = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
    companyServiceSpy = TestBed.inject(CompanyService) as jasmine.SpyObj<CompanyService>;
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
            entrega_goal: 90
          }
        } as any)
      );
    });

    it('should use CompanyService portfolio count for clientes na carteira', done => {
      companyServiceSpy.getCompanies.and.returnValue(of(mockCompanies(4)));

      service.getPlayerKPIs('player@x.com').subscribe(kpis => {
        const carteira = kpis.find(k => k.id === 'numero-empresas');
        expect(carteira?.current).toBe(4);
        expect(companyServiceSpy.getCompanies).toHaveBeenCalledWith('player@x.com');
        done();
      });
    });
  });
});
