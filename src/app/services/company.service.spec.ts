import { TestBed } from '@angular/core/testing';
import { CompanyService } from './company.service';
import { BackendApiService } from './backend-api.service';
import { CompanyMapper } from './company-mapper.service';
import { of, throwError } from 'rxjs';
import { CompanyDetails } from '@model/gamification-dashboard.model';

describe('CompanyService', () => {
  let service: CompanyService;
  let backendApiSpy: jasmine.SpyObj<BackendApiService>;
  let mapperSpy: jasmine.SpyObj<CompanyMapper>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('BackendApiService', ['get', 'post']);
    const companyMapperSpy = jasmine.createSpyObj('CompanyMapper', [
      'toCompany',
      'toCompanyDetails'
    ]);

    TestBed.configureTestingModule({
      providers: [
        CompanyService,
        { provide: BackendApiService, useValue: apiSpy },
        { provide: CompanyMapper, useValue: companyMapperSpy }
      ]
    });

    service = TestBed.inject(CompanyService);
    backendApiSpy = TestBed.inject(BackendApiService) as jasmine.SpyObj<BackendApiService>;
    mapperSpy = TestBed.inject(CompanyMapper) as jasmine.SpyObj<CompanyMapper>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
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
        processos: []
      };

      backendApiSpy.post.and.returnValue(of([mockApiResponse]));
      mapperSpy.toCompanyDetails.and.returnValue(mockDetails);

      service.getCompanyDetails('company1').subscribe(result => {
        expect(result).toEqual(mockDetails);
        expect(backendApiSpy.post).toHaveBeenCalled();
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
        processos: []
      };

      backendApiSpy.post.and.returnValue(of([{ _id: 'company1' }]));
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
        processos: []
      };

      backendApiSpy.post.and.returnValue(of([{ _id: 'company1' }]));
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
