import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import * as fc from 'fast-check';
import { C4uCompanyTableComponent } from './c4u-company-table.component';
import { Company, KPIData } from '@model/gamification-dashboard.model';
import { createMockCompany, createMockKPIData } from '@app/testing/mock-data-generators';
import { QueryHelper, click } from '@app/testing/test-utils';

describe('C4uCompanyTableComponent', () => {
  let component: C4uCompanyTableComponent;
  let fixture: ComponentFixture<C4uCompanyTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uCompanyTableComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uCompanyTableComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Property Tests', () => {
    /**
     * Feature: gamification-dashboard, Property 5: Company Table Row Clickability
     * Validates: Requirements 7.3, 8.1
     * 
     * For any company row in the portfolio table, clicking the row should open 
     * the company detail modal with the correct company data loaded.
     */
    it('should emit correct company when any row is clicked', () => {
      fc.assert(
        fc.property(
          // Generate random company data
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            cnpj: fc.string({ minLength: 14, maxLength: 18 }),
            healthScore: fc.integer({ min: 0, max: 100 }),
            kpi1Current: fc.integer({ min: 0, max: 1000 }),
            kpi1Target: fc.integer({ min: 1, max: 1000 }),
            kpi2Current: fc.integer({ min: 0, max: 1000 }),
            kpi2Target: fc.integer({ min: 1, max: 1000 }),
            kpi3Current: fc.integer({ min: 0, max: 1000 }),
            kpi3Target: fc.integer({ min: 1, max: 1000 })
          }),
          (companyData) => {
            // Create company object
            const kpi1 = {
              id: 'kpi-1',
              label: 'KPI 1',
              current: companyData.kpi1Current,
              target: companyData.kpi1Target
            };
            const kpi2 = {
              id: 'kpi-2',
              label: 'KPI 2',
              current: companyData.kpi2Current,
              target: companyData.kpi2Target
            };
            const kpi3 = {
              id: 'kpi-3',
              label: 'KPI 3',
              current: companyData.kpi3Current,
              target: companyData.kpi3Target
            };
            
            const company: Company = {
              id: companyData.id,
              name: companyData.name,
              cnpj: companyData.cnpj,
              healthScore: companyData.healthScore,
              kpis: [kpi1, kpi2, kpi3],
              kpi1,
              kpi2,
              kpi3
            };

            // Set up component
            component.companies = [company];
            fixture.detectChanges();

            // Set up spy
            let emittedCompany: Company | undefined;
            component.companySelected.subscribe((c: Company) => {
              emittedCompany = c;
            });

            // Find and click the row
            const row = fixture.debugElement.query(By.css('.company-row'));
            expect(row).toBeTruthy();
            
            click(row);

            // Verify the correct company was emitted
            expect(emittedCompany).toBeDefined();
            expect(emittedCompany?.id).toBe(company.id);
            expect(emittedCompany?.name).toBe(company.name);
            expect(emittedCompany?.cnpj).toBe(company.cnpj);
            expect(emittedCompany?.healthScore).toBe(company.healthScore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    describe('Table Rendering', () => {
      it('should render all companies in the table', () => {
        const companies: Company[] = [
          createMockCompany({ id: '1', name: 'Company 1' }),
          createMockCompany({ id: '2', name: 'Company 2' }),
          createMockCompany({ id: '3', name: 'Company 3' })
        ];

        component.companies = companies;
        fixture.detectChanges();

        const rows = QueryHelper.findAllByCss(fixture, '.company-row');
        expect(rows.length).toBe(3);
      });

      it('should display company name and CNPJ', () => {
        const company = createMockCompany({
          name: 'Test Company',
          cnpj: '12.345.678/0001-90'
        });

        component.companies = [company];
        fixture.detectChanges();

        const nameCell = QueryHelper.findByCss(fixture, '.company-name');
        const cnpjCell = QueryHelper.findByCss(fixture, '.company-cnpj');

        expect(nameCell.nativeElement.textContent).toContain('Test Company');
        expect(cnpjCell.nativeElement.textContent).toContain('12.345.678/0001-90');
      });

      it('should display health indicator with correct value', () => {
        const company = createMockCompany({ healthScore: 85 });

        component.companies = [company];
        fixture.detectChanges();

        const healthIndicator = QueryHelper.findByCss(fixture, '.health-indicator');
        expect(healthIndicator.nativeElement.textContent).toContain('85%');
      });

      it('should display KPI scores in correct format', () => {
        const company = createMockCompany({
          kpi1: createMockKPIData({ current: 30, target: 50 }),
          kpi2: createMockKPIData({ current: 40, target: 50 }),
          kpi3: createMockKPIData({ current: 45, target: 50 })
        });

        component.companies = [company];
        fixture.detectChanges();

        const kpiScores = QueryHelper.findAllByCss(fixture, '.kpi-score');
        expect(kpiScores[0].nativeElement.textContent).toContain('30 / 50');
        expect(kpiScores[1].nativeElement.textContent).toContain('40 / 50');
        expect(kpiScores[2].nativeElement.textContent).toContain('45 / 50');
      });

      it('should show empty state when no companies', () => {
        component.companies = [];
        fixture.detectChanges();

        const emptyState = QueryHelper.findByCss(fixture, '.empty-state');
        expect(emptyState).toBeTruthy();
        expect(emptyState.nativeElement.textContent).toContain('Nenhuma empresa encontrada');
      });
    });

    describe('Row Click Behavior', () => {
      it('should emit correct company when row is clicked', () => {
        const company = createMockCompany({ id: 'test-123', name: 'Test Company' });
        component.companies = [company];
        fixture.detectChanges();

        let emittedCompany: Company | undefined;
        component.companySelected.subscribe((c: Company) => {
          emittedCompany = c;
        });

        const row = QueryHelper.findByCss(fixture, '.company-row');
        click(row);

        expect(emittedCompany).toBeDefined();
        expect(emittedCompany?.id).toBe('test-123');
        expect(emittedCompany?.name).toBe('Test Company');
      });

      it('should emit different companies when different rows are clicked', () => {
        const companies = [
          createMockCompany({ id: '1', name: 'Company 1' }),
          createMockCompany({ id: '2', name: 'Company 2' })
        ];
        component.companies = companies;
        fixture.detectChanges();

        const emittedCompanies: Company[] = [];
        component.companySelected.subscribe((c: Company) => {
          emittedCompanies.push(c);
        });

        const rows = QueryHelper.findAllByCss(fixture, '.company-row');
        click(rows[0]);
        click(rows[1]);

        expect(emittedCompanies.length).toBe(2);
        expect(emittedCompanies[0].id).toBe('1');
        expect(emittedCompanies[1].id).toBe('2');
      });
    });

    describe('KPI Display Formatting', () => {
      it('should calculate KPI percentage correctly', () => {
        expect(component.getKPIPercentage({ current: 30, target: 50 })).toBe(60);
        expect(component.getKPIPercentage({ current: 50, target: 50 })).toBe(100);
        expect(component.getKPIPercentage({ current: 0, target: 50 })).toBe(0);
      });

      it('should handle zero target gracefully', () => {
        expect(component.getKPIPercentage({ current: 10, target: 0 })).toBe(0);
      });

      it('should apply correct color class based on KPI percentage', () => {
        expect(component.getKPIColor(90)).toBe('success');
        expect(component.getKPIColor(80)).toBe('success');
        expect(component.getKPIColor(60)).toBe('warning');
        expect(component.getKPIColor(50)).toBe('warning');
        expect(component.getKPIColor(30)).toBe('danger');
      });

      it('should apply correct health color class', () => {
        expect(component.getHealthColor(90)).toBe('success');
        expect(component.getHealthColor(80)).toBe('success');
        expect(component.getHealthColor(60)).toBe('warning');
        expect(component.getHealthColor(50)).toBe('warning');
        expect(component.getHealthColor(30)).toBe('danger');
      });
    });

    describe('Scrolling Behavior', () => {
      it('should render scrollable container for long lists', () => {
        const companies = Array.from({ length: 20 }, (_, i) =>
          createMockCompany({ id: `company-${i}`, name: `Company ${i}` })
        );

        component.companies = companies;
        fixture.detectChanges();

        const scrollContainer = QueryHelper.findByCss(fixture, '.table-responsive');
        expect(scrollContainer).toBeTruthy();
        
        const rows = QueryHelper.findAllByCss(fixture, '.company-row');
        expect(rows.length).toBe(20);
      });

      it('should maintain table structure with many companies', () => {
        const companies = Array.from({ length: 50 }, (_, i) =>
          createMockCompany({ id: `company-${i}` })
        );

        component.companies = companies;
        fixture.detectChanges();

        const table = QueryHelper.findByCss(fixture, '.company-table');
        expect(table).toBeTruthy();
        
        const rows = QueryHelper.findAllByCss(fixture, '.company-row');
        expect(rows.length).toBe(50);
      });
    });

    describe('Accessibility', () => {
      it('should have proper ARIA labels on rows', () => {
        const company = createMockCompany({ name: 'Test Company' });
        component.companies = [company];
        fixture.detectChanges();

        const row = QueryHelper.findByCss(fixture, '.company-row');
        const ariaLabel = row.nativeElement.getAttribute('aria-label');
        expect(ariaLabel).toContain('Ver detalhes de Test Company');
      });

      it('should have role="button" on clickable rows', () => {
        const company = createMockCompany();
        component.companies = [company];
        fixture.detectChanges();

        const row = QueryHelper.findByCss(fixture, '.company-row');
        expect(row.nativeElement.getAttribute('role')).toBe('button');
      });

      it('should have tabindex for keyboard navigation', () => {
        const company = createMockCompany();
        component.companies = [company];
        fixture.detectChanges();

        const row = QueryHelper.findByCss(fixture, '.company-row');
        expect(row.nativeElement.getAttribute('tabindex')).toBe('0');
      });
    });
  });
});
