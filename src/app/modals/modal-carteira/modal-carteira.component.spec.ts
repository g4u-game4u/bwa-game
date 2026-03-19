import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ModalCarteiraComponent } from './modal-carteira.component';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('ModalCarteiraComponent', () => {
  let component: ModalCarteiraComponent;
  let fixture: ComponentFixture<ModalCarteiraComponent>;
  let actionLogServiceSpy: jasmine.SpyObj<ActionLogService>;
  let companyKpiServiceSpy: jasmine.SpyObj<CompanyKpiService>;
  let cnpjLookupServiceSpy: jasmine.SpyObj<CnpjLookupService>;

  beforeEach(async () => {
    const actionLogSpy = jasmine.createSpyObj('ActionLogService', [
      'getPlayerCnpjListWithCount',
      'getActionsByCnpj'
    ]);
    const companyKpiSpy = jasmine.createSpyObj('CompanyKpiService', ['enrichCompaniesWithKpis']);
    const cnpjLookupSpy = jasmine.createSpyObj('CnpjLookupService', ['enrichCnpjList']);

    await TestBed.configureTestingModule({
      declarations: [ModalCarteiraComponent],
      providers: [
        { provide: ActionLogService, useValue: actionLogSpy },
        { provide: CompanyKpiService, useValue: companyKpiSpy },
        { provide: CnpjLookupService, useValue: cnpjLookupSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    actionLogServiceSpy = TestBed.inject(ActionLogService) as jasmine.SpyObj<ActionLogService>;
    companyKpiServiceSpy = TestBed.inject(CompanyKpiService) as jasmine.SpyObj<CompanyKpiService>;
    cnpjLookupServiceSpy = TestBed.inject(CnpjLookupService) as jasmine.SpyObj<CnpjLookupService>;

    fixture = TestBed.createComponent(ModalCarteiraComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('loadClientes', () => {
    it('should load and enrich clientes with CNPJ names', (done) => {
      const mockClientes = [
        { cnpj: '1748', actionCount: 5, processCount: 2 },
        { cnpj: 'INCENSE [10010|0001-76]', actionCount: 3, processCount: 1 }
      ];

      const mockEnrichedClientes = [
        { cnpj: '1748', actionCount: 5, processCount: 2, deliveryKpi: null },
        { cnpj: 'INCENSE [10010|0001-76]', actionCount: 3, processCount: 1, deliveryKpi: null }
      ];

      const mockCnpjNames = new Map([
        ['1748', 'JLUZ COMERCIO DE ROUPAS LTDA'],
        ['INCENSE [10010|0001-76]', 'INCENSE PERFUMARIA E COSMETICOS LTDA. EPP']
      ]);

      actionLogServiceSpy.getPlayerCnpjListWithCount.and.returnValue(of(mockClientes));
      companyKpiServiceSpy.enrichCompaniesWithKpis.and.returnValue(of(mockEnrichedClientes));
      cnpjLookupServiceSpy.enrichCnpjList.and.returnValue(of(mockCnpjNames));

      component.playerId = 'test@example.com';
      component.ngOnInit();

      setTimeout(() => {
        expect(component.clientes.length).toBe(2);
        expect(component.cnpjNameMap.size).toBe(2);
        expect(component.cnpjNameMap.get('1748')).toBe('JLUZ COMERCIO DE ROUPAS LTDA');
        expect(component.isLoading).toBe(false);
        done();
      }, 100);
    });

    it('should handle errors gracefully', (done) => {
      actionLogServiceSpy.getPlayerCnpjListWithCount.and.returnValue(
        throwError(() => new Error('API Error'))
      );

      component.playerId = 'test@example.com';
      component.ngOnInit();

      setTimeout(() => {
        expect(component.isLoading).toBe(false);
        expect(component.clientes.length).toBe(0);
        done();
      }, 100);
    });
  });

  describe('getCompanyDisplayName', () => {
    it('should return enriched name from map', () => {
      component.cnpjNameMap.set('1748', 'JLUZ COMERCIO DE ROUPAS LTDA');
      expect(component.getCompanyDisplayName('1748')).toBe('JLUZ COMERCIO DE ROUPAS LTDA');
    });

    it('should fallback to original CNPJ if not in map', () => {
      expect(component.getCompanyDisplayName('99999')).toBe('99999');
    });

    it('should handle empty CNPJ', () => {
      expect(component.getCompanyDisplayName('')).toBe('');
    });
  });

  describe('selectCliente', () => {
    it('should load actions for selected CNPJ', (done) => {
      const mockActions = [
        { id: '1', title: 'Action 1', player: 'user@example.com', created: Date.now() }
      ];

      actionLogServiceSpy.getActionsByCnpj.and.returnValue(of(mockActions));

      component.selectCliente('1748');

      setTimeout(() => {
        expect(component.selectedCnpj).toBe('1748');
        expect(component.selectedClienteActions.length).toBe(1);
        expect(component.isLoadingActions).toBe(false);
        done();
      }, 100);
    });

    it('should collapse if same CNPJ is selected', () => {
      component.selectedCnpj = '1748';
      component.selectCliente('1748');

      expect(component.selectedCnpj).toBeNull();
      expect(component.selectedClienteActions.length).toBe(0);
    });
  });

  describe('formatDate', () => {
    it('should format timestamp correctly', () => {
      const timestamp = new Date('2026-02-09').getTime();
      const formatted = component.formatDate(timestamp);
      expect(formatted).toBe('09/02/2026');
    });

    it('should handle $date object format', () => {
      const dateObj = { $date: '2026-02-09T00:00:00.000Z' };
      const formatted = component.formatDate(dateObj);
      expect(formatted).toBe('09/02/2026');
    });

    it('should handle invalid dates', () => {
      expect(component.formatDate(undefined)).toBe('');
      expect(component.formatDate(NaN)).toBe('');
    });
  });
});
