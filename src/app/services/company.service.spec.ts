import { TestBed } from '@angular/core/testing';
import { CompanyService } from './company.service';
import { FunifierApiService } from './funifier-api.service';
import { CompanyMapper } from './company-mapper.service';
import { of, throwError } from 'rxjs';
import { Company, CompanyDetails } from '@model/gamification-dashboard.model';

describe('CompanyService', () => {
  let service: CompanyService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;
  let mapperSpy: jasmine.SpyObj<CompanyMapper>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('FunifierApiService', ['get']);
    const companyMapperSpy = jasmine.createSpyObj('CompanyMapper', [
      'toCompany',
      'toCompanyDetails'
    ]);

    TestBed.configureTestingModule({
      providers: [
        CompanyService,
        { provide: FunifierApiService, useValue: apiSpy },
        { provide: CompanyMapper, useValue: companyMapperSpy }
      ]
    });

    service = TestBed.inject(CompanyService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
    mapperSpy = TestBed.inject(CompanyMapper) as jasmine.SpyObj<CompanyMapper>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getCompanies', () => {
    it('should fetch and map companies correctly', (done) => {
      const mockApiResponse = [
        { _id: 'company1', name: 'Company A', cnpj: '12345678000190' },
        { _id: 'company2', name: 'Company B', cnpj: '98765432000100' }
      ];

      const kpi1_1 = { id: '1', label: 'KPI 1', current: 50, target: 100 };
      const kpi2_1 = { id: '2', label: 'KPI 2', current: 60, target: 100 };
      const kpi3_1 = { id: '3', label: 'KPI 3', current: 70, target: 100 };

      const kpi1_2 = { id: '1', label: 'KPI 1', current: 80, target: 100 };
      const kpi2_2 = { id: '2', label: 'KPI 2', current: 85, target: 100 };
      const kpi3_2 = { id: '3', label: 'KPI 3', current: 90, target: 100 };

      const mockCompanies: Company[] = [
        {
          id: 'company1',
          name: 'Company A',
          cnpj: '12345678000190',
          healthScore: 80,
          kpis: [kpi1_1, kpi2_1, kpi3_1],
          kpi1: kpi1_1,
          kpi2: kpi2_1,
          kpi3: kpi3_1
        },
        {
          id: 'company2',
          name: 'Company B',
          cnpj: '98765432000100',
          healthScore: 90,
          kpis: [kpi1_2, kpi2_2, kpi3_2],
          kpi1: kpi1_2,
          kpi2: kpi2_2,
          kpi3: kpi3_2
        }
      ];

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toCompany.and.returnValues(mockCompanies[0], mockCompanies[1]);

      service.getCompanies('player123').subscribe(result => {
        expect(result).toEqual(mockCompanies);
        expect(funifierApiSpy.get).toHaveBeenCalledWith('/v3/player/player123/companies');
        done();
      });
    });

    it('should filter companies by search term', (done) => {
      const mockApiResponse = [
        { _id: 'company1', name: 'Alpha Corp', cnpj: '12345678000190' },
        { _id: 'company2', name: 'Beta Inc', cnpj: '98765432000100' }
      ];

      const kpi1_1 = { id: '1', label: 'KPI 1', current: 50, target: 100 };
      const kpi2_1 = { id: '2', label: 'KPI 2', current: 60, target: 100 };
      const kpi3_1 = { id: '3', label: 'KPI 3', current: 70, target: 100 };

      const kpi1_2 = { id: '1', label: 'KPI 1', current: 80, target: 100 };
      const kpi2_2 = { id: '2', label: 'KPI 2', current: 85, target: 100 };
      const kpi3_2 = { id: '3', label: 'KPI 3', current: 90, target: 100 };

      const mockCompanies: Company[] = [
        {
          id: 'company1',
          name: 'Alpha Corp',
          cnpj: '12345678000190',
          healthScore: 80,
          kpis: [kpi1_1, kpi2_1, kpi3_1],
          kpi1: kpi1_1,
          kpi2: kpi2_1,
          kpi3: kpi3_1
        },
        {
          id: 'company2',
          name: 'Beta Inc',
          cnpj: '98765432000100',
          healthScore: 90,
          kpis: [kpi1_2, kpi2_2, kpi3_2],
          kpi1: kpi1_2,
          kpi2: kpi2_2,
          kpi3: kpi3_2
        }
      ];

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toCompany.and.returnValues(mockCompanies[0], mockCompanies[1]);

      service.getCompanies('player123', { search: 'Alpha' }).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('Alpha Corp');
        done();
      });
    });

    it('should filter companies by minimum health score', (done) => {
      const mockApiResponse = [
        { _id: 'company1', name: 'Company A', healthScore: 70 },
        { _id: 'company2', name: 'Company B', healthScore: 90 }
      ];

      const kpi1_1 = { id: '1', label: 'KPI 1', current: 50, target: 100 };
      const kpi2_1 = { id: '2', label: 'KPI 2', current: 60, target: 100 };
      const kpi3_1 = { id: '3', label: 'KPI 3', current: 70, target: 100 };

      const kpi1_2 = { id: '1', label: 'KPI 1', current: 80, target: 100 };
      const kpi2_2 = { id: '2', label: 'KPI 2', current: 85, target: 100 };
      const kpi3_2 = { id: '3', label: 'KPI 3', current: 90, target: 100 };

      const mockCompanies: Company[] = [
        {
          id: 'company1',
          name: 'Company A',
          cnpj: '12345678000190',
          healthScore: 70,
          kpis: [kpi1_1, kpi2_1, kpi3_1],
          kpi1: kpi1_1,
          kpi2: kpi2_1,
          kpi3: kpi3_1
        },
        {
          id: 'company2',
          name: 'Company B',
          cnpj: '98765432000100',
          healthScore: 90,
          kpis: [kpi1_2, kpi2_2, kpi3_2],
          kpi1: kpi1_2,
          kpi2: kpi2_2,
          kpi3: kpi3_2
        }
      ];

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toCompany.and.returnValues(mockCompanies[0], mockCompanies[1]);

      service.getCompanies('player123', { minHealth: 80 }).subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].healthScore).toBe(90);
        done();
      });
    });

    it('should handle API errors', (done) => {
      funifierApiSpy.get.and.returnValue(throwError(() => new Error('API error')));

      service.getCompanies('player123').subscribe({
        error: (error) => {
          expect(error.message).toBe('API error');
          done();
        }
      });
    });
  });

  describe('getCompanyDetails', () => {
    it('should fetch and map company details correctly', (done) => {
      const mockApiResponse = {
        _id: 'company1',
        name: 'Company A',
        processes: [],
        activities: [],
        macros: []
      };

      const kpi1 = { id: '1', label: 'KPI 1', current: 50, target: 100 };
      const kpi2 = { id: '2', label: 'KPI 2', current: 60, target: 100 };
      const kpi3 = { id: '3', label: 'KPI 3', current: 70, target: 100 };

      const mockDetails: CompanyDetails = {
        id: 'company1',
        name: 'Company A',
        cnpj: '12345678000190',
        healthScore: 80,
        kpis: [kpi1, kpi2, kpi3],
        kpi1,
        kpi2,
        kpi3,
        processes: [],
        activities: [],
        macros: []
      };

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toCompanyDetails.and.returnValue(mockDetails);

      service.getCompanyDetails('company1').subscribe(result => {
        expect(result).toEqual(mockDetails);
        expect(funifierApiSpy.get).toHaveBeenCalledWith('/v3/company/company1');
        done();
      });
    });
  });

  describe('getCompanyProcesses', () => {
    it('should filter incomplete macros', (done) => {
      const kpi1 = { id: '1', label: 'KPI 1', current: 50, target: 100 };
      const kpi2 = { id: '2', label: 'KPI 2', current: 60, target: 100 };
      const kpi3 = { id: '3', label: 'KPI 3', current: 70, target: 100 };

      const mockDetails: CompanyDetails = {
        id: 'company1',
        name: 'Company A',
        cnpj: '12345678000190',
        healthScore: 80,
        kpis: [kpi1, kpi2, kpi3],
        kpi1,
        kpi2,
        kpi3,
        processes: [
          { id: '1', name: 'Process 1', status: 'pending', tasks: [] },
          { id: '2', name: 'Process 2', status: 'in-progress', tasks: [] },
          { id: '3', name: 'Process 3', status: 'completed', tasks: [] }
        ],
        activities: [],
        macros: []
      };

      funifierApiSpy.get.and.returnValue(of({}));
      mapperSpy.toCompanyDetails.and.returnValue(mockDetails);

      service.getCompanyProcesses('company1', 'macros-incompletas').subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].status).toBe('pending');
        expect(result[1].status).toBe('in-progress');
        done();
      });
    });

    it('should filter completed macros', (done) => {
      const kpi1 = { id: '1', label: 'KPI 1', current: 50, target: 100 };
      const kpi2 = { id: '2', label: 'KPI 2', current: 60, target: 100 };
      const kpi3 = { id: '3', label: 'KPI 3', current: 70, target: 100 };

      const mockDetails: CompanyDetails = {
        id: 'company1',
        name: 'Company A',
        cnpj: '12345678000190',
        healthScore: 80,
        kpis: [kpi1, kpi2, kpi3],
        kpi1,
        kpi2,
        kpi3,
        processes: [
          { id: '1', name: 'Process 1', status: 'pending', tasks: [] },
          { id: '2', name: 'Process 2', status: 'completed', tasks: [] }
        ],
        activities: [],
        macros: []
      };

      funifierApiSpy.get.and.returnValue(of({}));
      mapperSpy.toCompanyDetails.and.returnValue(mockDetails);

      service.getCompanyProcesses('company1', 'macros-finalizadas').subscribe(result => {
        expect(result.length).toBe(1);
        expect(result[0].status).toBe('completed');
        done();
      });
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', () => {
      service.clearCache();
      expect(service).toBeTruthy();
    });

    it('should clear cache for specific company', () => {
      service.clearCompanyCache('company1');
      expect(service).toBeTruthy();
    });
  });
});
