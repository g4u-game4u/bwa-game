import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CnpjLookupService } from './cnpj-lookup.service';
import { environment } from '../../environments/environment';

describe('CnpjLookupService', () => {
  let service: CnpjLookupService;
  let httpMock: HttpTestingController;
  let savedBackend: string;

  beforeEach(() => {
    savedBackend = environment.backend_url_base;
    environment.backend_url_base = 'https://api.test';

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CnpjLookupService]
    });

    service = TestBed.inject(CnpjLookupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    environment.backend_url_base = savedBackend;
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
      expect(service.extractEmpid('123456789')).toBeNull();
    });

    it('should handle whitespace', () => {
      expect(service.extractEmpid('  1748  ')).toBe(1748);
      expect(service.extractEmpid('  [10010|0001-76]  ')).toBe(10010);
    });
  });

  describe('getCompanyName', () => {
    it('should return original key when aggregate path yields no rows (client aggregate desativado)', done => {
      service.getCompanyName('1748').subscribe(name => {
        expect(name).toBe('1748');
        done();
      });
    });

    it('should return original label for pattern when sem dados', done => {
      const input = 'INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]';
      service.getCompanyName(input).subscribe(name => {
        expect(name).toBe(input);
        done();
      });
    });

    it('should return original CNPJ if empid not found in database', done => {
      service.getCompanyName('99999').subscribe(name => {
        expect(name).toBe('99999');
        done();
      });
    });

    it('should return original CNPJ if extraction fails', done => {
      service.getCompanyName('INVALID FORMAT').subscribe(name => {
        expect(name).toBe('INVALID FORMAT');
        done();
      });
    });
  });

  describe('enrichCnpjList', () => {
    it('should map keys to themselves when sem enriquecimento', done => {
      const cnpjList = [
        '1748',
        'INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]',
        '10380'
      ];

      service.enrichCnpjList(cnpjList).subscribe(result => {
        expect(result.size).toBe(3);
        expect(result.get('1748')).toBe('1748');
        expect(result.get('INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]')).toBe(
          'INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]'
        );
        expect(result.get('10380')).toBe('10380');
        done();
      });
    });

    it('should handle empty list', done => {
      service.enrichCnpjList([]).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
    });

    it('should fallback to original for unknown empids', done => {
      const cnpjList = ['1748', '99999', 'INVALID'];

      service.enrichCnpjList(cnpjList).subscribe(result => {
        expect(result.size).toBe(3);
        expect(result.get('1748')).toBe('1748');
        expect(result.get('99999')).toBe('99999');
        expect(result.get('INVALID')).toBe('INVALID');
        done();
      });
    });
  });

  describe('clearCache', () => {
    it('should not throw when clearing cache', done => {
      service.clearCache();
      service.getCompanyName('1748').subscribe(() => {
        done();
      });
    });
  });
});
