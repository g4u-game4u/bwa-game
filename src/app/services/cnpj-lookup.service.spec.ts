import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CnpjLookupService, CnpjEntry } from './cnpj-lookup.service';
import { FunifierApiService } from './funifier-api.service';

describe('CnpjLookupService', () => {
  let service: CnpjLookupService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;

  const mockCnpjData: CnpjEntry[] = [
    { _id: 1748, cnpj: '29.170.984/0002-11', empresa: '29.170.984/0002-11JLUZ COMERCIO DE ROUPAS LTDA' },
    { _id: 10380, cnpj: '48.465.297/0001-97', empresa: '2A MEDEIROS LTDA' },
    { _id: 10010, cnpj: '12.345.678/0001-76', empresa: 'INCENSE PERFUMARIA E COSMETICOS LTDA. EPP' }
  ];

  beforeEach(() => {
    const spy = jasmine.createSpyObj('FunifierApiService', ['get']);

    TestBed.configureTestingModule({
      providers: [
        CnpjLookupService,
        { provide: FunifierApiService, useValue: spy }
      ]
    });

    service = TestBed.inject(CnpjLookupService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('extractEmpid', () => {
    it('should extract empid from simple numeric string (≤ 8 digits)', () => {
      expect(service.extractEmpid('1748')).toBe(1748);
      expect(service.extractEmpid('10380')).toBe(10380);
      expect(service.extractEmpid('12345678')).toBe(12345678);
    });

    it('should extract empid from pattern [empid|...]', () => {
      expect(service.extractEmpid('INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]')).toBe(10010);
      expect(service.extractEmpid('SOME COMPANY NAME [12345|9999-99]')).toBe(12345);
      expect(service.extractEmpid('[1748|0002-11]')).toBe(1748);
    });

    it('should return null for invalid formats', () => {
      expect(service.extractEmpid('')).toBeNull();
      expect(service.extractEmpid('invalid')).toBeNull();
      expect(service.extractEmpid('COMPANY NAME WITHOUT PATTERN')).toBeNull();
      expect(service.extractEmpid('123456789')).toBeNull(); // > 8 digits without pattern
    });

    it('should handle whitespace', () => {
      expect(service.extractEmpid('  1748  ')).toBe(1748);
      expect(service.extractEmpid('  [10010|0001-76]  ')).toBe(10010);
    });
  });

  describe('getCompanyName', () => {
    beforeEach(() => {
      funifierApiSpy.get.and.returnValue(of(mockCnpjData));
    });

    it('should return empresa name for simple empid', (done) => {
      service.getCompanyName('1748').subscribe(name => {
        expect(name).toBe('29.170.984/0002-11JLUZ COMERCIO DE ROUPAS LTDA');
        done();
      });
    });

    it('should return empresa name for pattern [empid|...]', (done) => {
      service.getCompanyName('INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]').subscribe(name => {
        expect(name).toBe('INCENSE PERFUMARIA E COSMETICOS LTDA. EPP');
        done();
      });
    });

    it('should return original CNPJ if empid not found in database', (done) => {
      service.getCompanyName('99999').subscribe(name => {
        expect(name).toBe('99999');
        done();
      });
    });

    it('should return original CNPJ if extraction fails', (done) => {
      service.getCompanyName('INVALID FORMAT').subscribe(name => {
        expect(name).toBe('INVALID FORMAT');
        done();
      });
    });

    it('should cache database requests', (done) => {
      // First call
      service.getCompanyName('1748').subscribe(() => {
        // Second call should use cache
        service.getCompanyName('10380').subscribe(name => {
          expect(name).toBe('2A MEDEIROS LTDA');
          // API should only be called once
          expect(funifierApiSpy.get).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });

    it('should handle API errors gracefully', (done) => {
      funifierApiSpy.get.and.returnValue(throwError(() => new Error('API Error')));
      
      service.getCompanyName('1748').subscribe(name => {
        expect(name).toBe('1748'); // Fallback to original
        done();
      });
    });
  });

  describe('enrichCnpjList', () => {
    beforeEach(() => {
      funifierApiSpy.get.and.returnValue(of(mockCnpjData));
    });

    it('should enrich multiple CNPJs', (done) => {
      const cnpjList = [
        '1748',
        'INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]',
        '10380'
      ];

      service.enrichCnpjList(cnpjList).subscribe(result => {
        expect(result.size).toBe(3);
        expect(result.get('1748')).toBe('29.170.984/0002-11JLUZ COMERCIO DE ROUPAS LTDA');
        expect(result.get('INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]')).toBe('INCENSE PERFUMARIA E COSMETICOS LTDA. EPP');
        expect(result.get('10380')).toBe('2A MEDEIROS LTDA');
        done();
      });
    });

    it('should handle empty list', (done) => {
      service.enrichCnpjList([]).subscribe(result => {
        expect(result.size).toBe(0);
        expect(funifierApiSpy.get).not.toHaveBeenCalled();
        done();
      });
    });

    it('should fallback to original for unknown empids', (done) => {
      const cnpjList = ['1748', '99999', 'INVALID'];

      service.enrichCnpjList(cnpjList).subscribe(result => {
        expect(result.size).toBe(3);
        expect(result.get('1748')).toBe('29.170.984/0002-11JLUZ COMERCIO DE ROUPAS LTDA');
        expect(result.get('99999')).toBe('99999');
        expect(result.get('INVALID')).toBe('INVALID');
        done();
      });
    });
  });

  describe('clearCache', () => {
    it('should clear cache and force new API call', (done) => {
      funifierApiSpy.get.and.returnValue(of(mockCnpjData));

      // First call
      service.getCompanyName('1748').subscribe(() => {
        expect(funifierApiSpy.get).toHaveBeenCalledTimes(1);

        // Clear cache
        service.clearCache();

        // Second call should hit API again
        service.getCompanyName('1748').subscribe(() => {
          expect(funifierApiSpy.get).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });
  });
});
