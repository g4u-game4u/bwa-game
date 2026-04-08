import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController
} from '@angular/common/http/testing';
import { CompanyKpiService, GamificacaoEmpresaRow } from './company-kpi.service';
import { environment } from '../../environments/environment';

const TEST_GAMIFICACAO_URL = 'http://localhost/unit-test-gamificacao';

function row(
  empId: string,
  porcEntregas: string,
  cnpj = '00.020.621/0001-37'
): GamificacaoEmpresaRow {
  return {
    CNPJ: cnpj,
    EmpID: empId,
    porcEntregas,
    procFinalizados: '0',
    procPendentes: '0',
    regime: 'Regime teste',
    data_criacao: '',
    data_processamento: ''
  };
}

describe('CompanyKpiService', () => {
  let service: CompanyKpiService;
  let httpMock: HttpTestingController;
  let prevUrl: string;
  let prevToken: string;

  beforeEach(() => {
    prevUrl = environment.gamificacaoApiUrl;
    prevToken = environment.gamificacaoApiToken;
    environment.gamificacaoApiUrl = TEST_GAMIFICACAO_URL;
    environment.gamificacaoApiToken = 'test-x-api-token';

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CompanyKpiService]
    });

    service = TestBed.inject(CompanyKpiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.clearCache();
    environment.gamificacaoApiUrl = prevUrl;
    environment.gamificacaoApiToken = prevToken;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('extractCnpjId() - Valid Formats', () => {
    it('should extract ID from standard CNPJ format', () => {
      const cnpj = 'RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]';
      expect(service.extractCnpjId(cnpj)).toBe('2000');
    });

    it('should extract ID with spaces', () => {
      const cnpj = 'COMPANY NAME l CODE [ 1234 |SUFFIX]';
      expect(service.extractCnpjId(cnpj)).toBe('1234');
    });
  });

  describe('extractCnpjId() - Invalid Formats', () => {
    it('should return null for empty string', () => {
      expect(service.extractCnpjId('')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(service.extractCnpjId(null as any)).toBeNull();
    });
  });

  describe('parsePorcEntregas', () => {
    it('should parse Brazilian decimal', () => {
      expect(service.parsePorcEntregas('94,81')).toBeCloseTo(94.81, 5);
    });

    it('should parse plain number string', () => {
      expect(service.parsePorcEntregas('89')).toBe(89);
    });
  });

  describe('getKpiData() — API gamificação', () => {
    it('should fetch by EmpID', done => {
      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(1);
        expect(result.get('2000')?.entrega).toBeCloseTo(89, 5);
        done();
      });

      const req = httpMock.expectOne(r => r.url === TEST_GAMIFICACAO_URL);
      expect(req.request.headers.get('x-api-token')).toBe('test-x-api-token');
      req.flush([row('2000', '89,00')]);
    });

    it('should return empty map when URL/token missing', done => {
      environment.gamificacaoApiToken = '';
      service.clearCache();
      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
      httpMock.expectNone(TEST_GAMIFICACAO_URL);
    });

    it('should return empty for empty input', done => {
      service.getKpiData([]).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
      httpMock.expectNone(TEST_GAMIFICACAO_URL);
    });

    it('should handle partial match', done => {
      service.getKpiData(['2000', '9999']).subscribe(result => {
        expect(result.size).toBe(1);
        expect(result.has('2000')).toBeTrue();
        done();
      });
      const req = httpMock.expectOne(TEST_GAMIFICACAO_URL);
      req.flush([row('2000', '50,00')]);
    });

    it('should handle HTTP error', done => {
      service.getKpiData(['2000']).subscribe(result => {
        expect(result.size).toBe(0);
        done();
      });
      const req = httpMock.expectOne(TEST_GAMIFICACAO_URL);
      req.error(new ProgressEvent('network'));
    });
  });

  describe('enrichCompaniesWithKpis()', () => {
    it('should enrich companies with KPI data', done => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5, processCount: 2 },
        { cnpj: 'COMPANY B l 0002 [1218|0002-45]', actionCount: 3, processCount: 1 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result.length).toBe(2);
        expect(result[0].deliveryKpi?.current).toBeCloseTo(89, 5);
        expect(result[1].deliveryKpi?.current).toBeCloseTo(45, 5);
        expect(result[0].deliveryKpi?.label).toBe('Entregas no Prazo');
        done();
      });

      const req = httpMock.expectOne(TEST_GAMIFICACAO_URL);
      req.flush([row('2000', '89,00'), row('1218', '45,00')]);
    });

    it('should handle companies without KPI data', done => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5, processCount: 2 }
      ];

      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi).toBeUndefined();
        done();
      });

      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([]);
    });

    it('should return empty array for empty input', done => {
      service.enrichCompaniesWithKpis([]).subscribe(result => {
        expect(result).toEqual([]);
        done();
      });
      httpMock.expectNone(TEST_GAMIFICACAO_URL);
    });

    it('should match by formatted CNPJ in label when bracket EmpID is absent', done => {
      const companies = [
        {
          cnpj: 'ACME LTDA — 00.020.621/0001-37',
          actionCount: 1,
          processCount: 0
        }
      ];
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.current).toBeCloseTo(91.2, 5);
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([
        row('2477', '91,20', '00.020.621/0001-37')
      ]);
    });

    it('should match EmpID with leading zeros to API row without zeros', done => {
      const companies = [
        { cnpj: 'X [002000|suffix]', actionCount: 1, processCount: 0 }
      ];
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.current).toBeCloseTo(80, 5);
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([row('2000', '80,00')]);
    });

    it('enrichCarteiraFromSupabase should match by emp_id when CNPJ differs from API', done => {
      service
        .enrichCarteiraFromSupabase([
          { cnpj: '001112223334455', empId: '999' }
        ])
        .subscribe(result => {
          expect(result[0].entrega).toBeCloseTo(55.5, 5);
          done();
        });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([
        {
          cnpj: '99.999.999/0001-99',
          empId: 999,
          porcEntregas: '55,50',
          procFinalizados: '0',
          procPendentes: '0',
          regime: 'Simples',
          data_criacao: '',
          data_processamento: ''
        }
      ]);
    });

    it('enrichCarteiraFromSupabase should match Supabase id to API EmpID and parse percEntregas string', done => {
      service
        .enrichCarteiraFromSupabase([{ cnpj: '12345678000199', supabaseId: 2477 }])
        .subscribe(result => {
          expect(result[0].entrega).toBeCloseTo(93.25, 5);
          expect(result[0].deliveryKpi?.current).toBeCloseTo(93.25, 5);
          done();
        });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([
        {
          EmpID: '2477',
          cnpj: '12.345.678/0001-99',
          percEntregas: '93,25',
          procFinalizados: '1',
          procPendentes: '2',
          regime: 'Lucro Real',
          data_criacao: '',
          data_processamento: ''
        }
      ]);
    });
  });

  describe('Caching', () => {
    it('should reuse snapshot for second getKpiData call', done => {
      service.getKpiData(['2000']).subscribe(() => {
        service.getKpiData(['1218']).subscribe(() => {
          done();
        });
        httpMock.expectNone(TEST_GAMIFICACAO_URL);
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([
        row('2000', '10,00'),
        row('1218', '20,00')
      ]);
    });

    it('should refetch after clearCache', done => {
      service.getKpiData(['2000']).subscribe(() => {
        service.clearCache();
        service.getKpiData(['2000']).subscribe(() => done());
        httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([row('2000', '99,00')]);
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([row('2000', '10,00')]);
    });
  });

  describe('enrichFromCnpjResp', () => {
    it('should match EmpID and full CNPJ', done => {
      service.enrichFromCnpjResp(['2477', '00.020.621/0001-37']).subscribe(res => {
        expect(res[0].deliveryKpi?.current).toBeCloseTo(94.81, 5);
        expect(res[1].deliveryKpi?.current).toBeCloseTo(94.81, 5);
        expect(res[0].processCount).toBe(64);
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([
        {
          CNPJ: '00.020.621/0001-37',
          EmpID: '2477',
          porcEntregas: '94,81',
          procFinalizados: '51',
          procPendentes: '13',
          regime: 'Lucro Presumido',
          data_criacao: '2026-04-08 11:02:11',
          data_processamento: '2026-04-08 11:02:11'
        }
      ]);
    });

    it('should match Supabase-style CNPJ (14 digits only, no mask)', done => {
      service.enrichFromCnpjResp(['00020621000137']).subscribe(res => {
        expect(res[0].entrega).toBeCloseTo(88.5, 5);
        expect(res[0].deliveryKpi?.current).toBeCloseTo(88.5, 5);
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([
        row('2477', '88,50', '00.020.621/0001-37')
      ]);
    });

    it('should read empId, cnpj e porcEntregas em camelCase', done => {
      service.enrichFromCnpjResp(['999']).subscribe(res => {
        expect(res[0].entrega).toBeCloseTo(77.25, 5);
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([
        {
          cnpj: '11.222.333/0001-44',
          empId: 999,
          porcEntregas: '77,25',
          procFinalizados: '0',
          procPendentes: '0',
          regime: 'Simples',
          data_criacao: '',
          data_processamento: ''
        }
      ]);
    });
  });

  describe('mapToKpiData / colors (target 90)', () => {
    it('should cap percentage at 100%', done => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5, processCount: 2 }
      ];
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.percentage).toBe(100);
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([row('2000', '150,00')]);
    });

    it('should be red below target', done => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5, processCount: 2 }
      ];
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.color).toBe('red');
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([row('2000', '65,00')]);
    });

    it('should be green at or above target with high ratio', done => {
      const companies = [
        { cnpj: 'COMPANY A l 0001 [2000|0001-60]', actionCount: 5, processCount: 2 }
      ];
      service.enrichCompaniesWithKpis(companies).subscribe(result => {
        expect(result[0].deliveryKpi?.color).toBe('green');
        done();
      });
      httpMock.expectOne(TEST_GAMIFICACAO_URL).flush([row('2000', '95,00')]);
    });
  });
});
