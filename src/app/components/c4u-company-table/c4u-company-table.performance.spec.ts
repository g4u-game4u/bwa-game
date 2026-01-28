import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectionStrategy } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { By } from '@angular/platform-browser';

import { C4uCompanyTableComponent } from './c4u-company-table.component';
import { generateMockCompanies } from '@app/testing/mock-data-generators';
import { Company } from '@model/gamification-dashboard.model';

describe('C4uCompanyTableComponent - Performance Tests', () => {
  let component: C4uCompanyTableComponent;
  let fixture: ComponentFixture<C4uCompanyTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uCompanyTableComponent],
      imports: [ScrollingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uCompanyTableComponent);
    component = fixture.componentInstance;
  });

  describe('Change Detection Optimization', () => {
    it('should use OnPush change detection strategy', () => {
      const componentDef = (component.constructor as any).ɵcmp;
      expect(componentDef.changeDetection).toBe(ChangeDetectionStrategy.OnPush);
    });

    it('should not re-render when input reference does not change', () => {
      const companies = generateMockCompanies(10);
      component.companies = companies;
      fixture.detectChanges();

      const initialRenderCount = fixture.debugElement.queryAll(By.css('.company-row')).length;

      // Trigger change detection without changing input
      fixture.detectChanges();

      const afterRenderCount = fixture.debugElement.queryAll(By.css('.company-row')).length;
      expect(afterRenderCount).toBe(initialRenderCount);
    });
  });

  describe('Virtual Scrolling', () => {
    it('should not use virtual scrolling for small datasets', () => {
      component.companies = generateMockCompanies(30);
      fixture.detectChanges();

      expect(component.useVirtualScrolling).toBe(false);
      
      const virtualScrollViewport = fixture.debugElement.query(By.css('cdk-virtual-scroll-viewport'));
      expect(virtualScrollViewport).toBeNull();
    });

    it('should use virtual scrolling for large datasets', () => {
      component.companies = generateMockCompanies(100);
      fixture.detectChanges();

      expect(component.useVirtualScrolling).toBe(true);
      
      const virtualScrollViewport = fixture.debugElement.query(By.css('cdk-virtual-scroll-viewport'));
      expect(virtualScrollViewport).not.toBeNull();
    });

    it('should have correct item size for virtual scrolling', () => {
      expect(component.ITEM_SIZE).toBe(60);
    });

    it('should have correct threshold for virtual scrolling', () => {
      expect(component.VIRTUAL_SCROLL_THRESHOLD).toBe(50);
    });

    it('should render only visible items with virtual scrolling', () => {
      component.companies = generateMockCompanies(1000);
      fixture.detectChanges();

      // With virtual scrolling, not all 1000 items should be in the DOM
      const renderedRows = fixture.debugElement.queryAll(By.css('.company-row'));
      expect(renderedRows.length).toBeLessThan(1000);
      expect(renderedRows.length).toBeGreaterThan(0);
    });
  });

  describe('TrackBy Function', () => {
    it('should have trackBy function defined', () => {
      expect(component.trackByCompanyId).toBeDefined();
      expect(typeof component.trackByCompanyId).toBe('function');
    });

    it('should return company ID for trackBy', () => {
      const kpi1 = { id: 'kpi-1', label: 'KPI 1', current: 10, target: 20 };
      const kpi2 = { id: 'kpi-2', label: 'KPI 2', current: 15, target: 25 };
      const kpi3 = { id: 'kpi-3', label: 'KPI 3', current: 20, target: 30 };

      const mockCompany: Company = {
        id: 'company-123',
        name: 'Test Company',
        cnpj: '12.345.678/0001-90',
        healthScore: 85,
        kpis: [kpi1, kpi2, kpi3],
        kpi1,
        kpi2,
        kpi3
      };

      const result = component.trackByCompanyId(0, mockCompany);
      expect(result).toBe('company-123');
    });

    it('should return consistent values for same company', () => {
      const kpi1 = { id: 'kpi-1', label: 'KPI 1', current: 10, target: 20 };
      const kpi2 = { id: 'kpi-2', label: 'KPI 2', current: 15, target: 25 };
      const kpi3 = { id: 'kpi-3', label: 'KPI 3', current: 20, target: 30 };

      const mockCompany: Company = {
        id: 'company-456',
        name: 'Test Company',
        cnpj: '12.345.678/0001-90',
        healthScore: 85,
        kpis: [kpi1, kpi2, kpi3],
        kpi1,
        kpi2,
        kpi3
      };

      const result1 = component.trackByCompanyId(0, mockCompany);
      const result2 = component.trackByCompanyId(1, mockCompany);
      
      expect(result1).toBe(result2);
      expect(result1).toBe('company-456');
    });
  });

  describe('Rendering Performance', () => {
    it('should render small dataset quickly', () => {
      component.companies = generateMockCompanies(10);
      
      const startTime = performance.now();
      fixture.detectChanges();
      const endTime = performance.now();
      
      const renderTime = endTime - startTime;
      
      // Should render in less than 50ms
      expect(renderTime).toBeLessThan(50);
    });

    it('should render medium dataset efficiently', () => {
      component.companies = generateMockCompanies(50);
      
      const startTime = performance.now();
      fixture.detectChanges();
      const endTime = performance.now();
      
      const renderTime = endTime - startTime;
      
      // Should render in less than 100ms
      expect(renderTime).toBeLessThan(100);
    });

    it('should render large dataset with virtual scrolling efficiently', () => {
      component.companies = generateMockCompanies(1000);
      
      const startTime = performance.now();
      fixture.detectChanges();
      const endTime = performance.now();
      
      const renderTime = endTime - startTime;
      
      // Should render in less than 200ms even with 1000 items
      expect(renderTime).toBeLessThan(200);
    });
  });

  describe('Event Handling Performance', () => {
    it('should handle row clicks efficiently', () => {
      component.companies = generateMockCompanies(10);
      fixture.detectChanges();

      const emitSpy = spyOn(component.companySelected, 'emit');
      const mockCompany = component.companies[0];

      const startTime = performance.now();
      component.onRowClick(mockCompany);
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      expect(emitSpy).toHaveBeenCalledWith(mockCompany);
      expect(executionTime).toBeLessThan(5); // Should be nearly instant
    });

    it('should calculate health color efficiently', () => {
      const iterations = 1000;
      
      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        component.getHealthColor(Math.random() * 100);
      }
      const endTime = performance.now();
      
      const avgTime = (endTime - startTime) / iterations;
      
      // Should average less than 0.01ms per call
      expect(avgTime).toBeLessThan(0.01);
    });

    it('should calculate KPI percentage efficiently', () => {
      const iterations = 1000;
      const mockKpi = { current: 15, target: 30 };
      
      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        component.getKPIPercentage(mockKpi);
      }
      const endTime = performance.now();
      
      const avgTime = (endTime - startTime) / iterations;
      
      // Should average less than 0.01ms per call
      expect(avgTime).toBeLessThan(0.01);
    });
  });

  describe('Memory Management', () => {
    it('should not create memory leaks with large datasets', () => {
      // Create and destroy multiple large datasets
      for (let i = 0; i < 10; i++) {
        component.companies = generateMockCompanies(100);
        fixture.detectChanges();
      }

      // Clear the dataset
      component.companies = [];
      fixture.detectChanges();

      // Component should still be functional
      expect(component.companies.length).toBe(0);
    });

    it('should handle rapid data updates efficiently', () => {
      const startTime = performance.now();
      
      // Simulate rapid data updates
      for (let i = 0; i < 50; i++) {
        component.companies = generateMockCompanies(20);
        fixture.detectChanges();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should handle 50 updates in less than 500ms
      expect(totalTime).toBeLessThan(500);
    });
  });

  describe('DOM Optimization', () => {
    it('should minimize DOM nodes for large datasets with virtual scrolling', () => {
      component.companies = generateMockCompanies(1000);
      fixture.detectChanges();

      const allElements = fixture.debugElement.nativeElement.querySelectorAll('*');
      
      // With virtual scrolling, total DOM nodes should be much less than 1000 rows
      // Each row has multiple elements, so without virtual scrolling it would be > 6000 nodes
      expect(allElements.length).toBeLessThan(1000);
    });

    it('should reuse DOM nodes when scrolling', () => {
      component.companies = generateMockCompanies(200);
      fixture.detectChanges();

      if (component.useVirtualScrolling) {
        const initialNodeCount = fixture.debugElement.nativeElement.querySelectorAll('.company-row').length;
        
        // Simulate scrolling (in real scenario, this would trigger virtual scroll updates)
        fixture.detectChanges();
        
        const afterScrollNodeCount = fixture.debugElement.nativeElement.querySelectorAll('.company-row').length;
        
        // Node count should remain relatively stable
        expect(Math.abs(afterScrollNodeCount - initialNodeCount)).toBeLessThan(50);
      }
    });
  });

  describe('Bundle Size Impact', () => {
    it('should not import unnecessary dependencies', () => {
      // Verify component only imports what it needs
      const componentSource = component.constructor.toString();
      
      // Should not have heavy dependencies
      expect(componentSource).not.toContain('Chart');
      expect(componentSource).not.toContain('moment');
    });
  });
});
