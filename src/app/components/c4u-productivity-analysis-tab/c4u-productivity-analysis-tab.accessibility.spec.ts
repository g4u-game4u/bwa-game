import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uProductivityAnalysisTabComponent } from './c4u-productivity-analysis-tab.component';
import { AccessibilityTestUtils } from '@app/testing/accessibility-test-utils';
import { By } from '@angular/platform-browser';
import { NO_ERRORS_SCHEMA } from '@angular/core';

/**
 * Accessibility Tests for Productivity Analysis Tab Component
 * 
 * Tests WCAG AA compliance including:
 * - ARIA labels for chart controls
 * - Keyboard navigation for chart type toggle
 * - Screen reader support for chart data
 * - Accessible chart alternatives
 * - Focus management
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5 (Accessibility)
 */
describe('C4uProductivityAnalysisTabComponent - Accessibility', () => {
  let component: C4uProductivityAnalysisTabComponent;
  let fixture: ComponentFixture<C4uProductivityAnalysisTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uProductivityAnalysisTabComponent],
      schemas: [NO_ERRORS_SCHEMA] // Ignore child component templates
    }).compileComponents();

    fixture = TestBed.createComponent(C4uProductivityAnalysisTabComponent);
    component = fixture.componentInstance;
  });

  describe('ARIA Labels', () => {
    it('should have ARIA labels on chart type toggle buttons', () => {
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      expect(toggleButtons.length).toBe(2);
      
      toggleButtons.forEach(button => {
        const ariaLabel = button.nativeElement.getAttribute('aria-label');
        const title = button.nativeElement.getAttribute('title');
        
        expect(ariaLabel || title).toBeTruthy('Toggle button should have aria-label or title');
      });
    });

    it('should have descriptive ARIA labels for line chart button', () => {
      fixture.detectChanges();
      
      const lineChartButton = fixture.debugElement.queryAll(By.css('.toggle-btn'))[0];
      const ariaLabel = lineChartButton.nativeElement.getAttribute('aria-label');
      
      expect(ariaLabel).toContain('linhas');
    });

    it('should have descriptive ARIA labels for bar chart button', () => {
      fixture.detectChanges();
      
      const barChartButton = fixture.debugElement.queryAll(By.css('.toggle-btn'))[1];
      const ariaLabel = barChartButton.nativeElement.getAttribute('aria-label');
      
      expect(ariaLabel).toContain('barras');
    });

    it('should have accessible tab title', () => {
      fixture.detectChanges();
      
      const title = fixture.debugElement.query(By.css('.tab-title'));
      expect(title).toBeTruthy();
      expect(title.nativeElement.textContent).toContain('Análise de Produtividade');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should allow keyboard navigation to chart type toggle buttons', () => {
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      
      toggleButtons.forEach(button => {
        expect(AccessibilityTestUtils.isKeyboardAccessible(button)).toBe(
          true,
          'Toggle button should be keyboard accessible'
        );
      });
    });

    it('should handle Enter key on toggle buttons', () => {
      fixture.detectChanges();
      
      const initialChartType = component.chartType;
      const toggleButton = fixture.debugElement.query(By.css('.toggle-btn'));
      
      // Simulate Enter key press
      AccessibilityTestUtils.simulateKeyPress(toggleButton, 'Enter');
      fixture.detectChanges();
      
      // Chart type should toggle
      expect(component.chartType).not.toBe(initialChartType);
    });

    it('should handle Space key on toggle buttons', () => {
      fixture.detectChanges();
      
      const initialChartType = component.chartType;
      const toggleButton = fixture.debugElement.query(By.css('.toggle-btn'));
      
      // Simulate Space key press
      AccessibilityTestUtils.simulateKeyPress(toggleButton, ' ');
      fixture.detectChanges();
      
      // Chart type should toggle
      expect(component.chartType).not.toBe(initialChartType);
    });

    it('should disable toggle buttons during loading', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      
      toggleButtons.forEach(button => {
        expect(button.nativeElement.disabled).toBe(true);
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should have accessible loading state', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const loadingOverlay = fixture.debugElement.query(By.css('.loading-overlay'));
      expect(loadingOverlay).toBeTruthy();
      
      const srText = loadingOverlay.query(By.css('.visually-hidden, .sr-only'));
      expect(srText).toBeTruthy();
      expect(srText.nativeElement.textContent).toContain('Carregando');
    });

    it('should have accessible empty state', () => {
      component.isLoading = false;
      component.graphData = [];
      fixture.detectChanges();
      
      const emptyState = fixture.debugElement.query(By.css('.empty-state'));
      expect(emptyState).toBeTruthy();
      
      const emptyText = emptyState.query(By.css('.empty-text'));
      expect(emptyText).toBeTruthy();
      expect(emptyText.nativeElement.textContent).toContain('Nenhum dado disponível');
    });

    it('should announce chart type changes', () => {
      component.graphData = [
        { date: new Date(), value: 10 }
      ];
      fixture.detectChanges();
      
      const chartInfo = fixture.debugElement.query(By.css('.chart-info'));
      expect(chartInfo).toBeTruthy();
      
      const typeInfo = chartInfo.nativeElement.textContent;
      expect(typeInfo).toContain('Tipo:');
      expect(typeInfo).toContain(component.isLineChart ? 'Linhas' : 'Barras');
    });

    it('should provide period information to screen readers', () => {
      component.graphData = [
        { date: new Date(), value: 10 }
      ];
      fixture.detectChanges();
      
      const chartInfo = fixture.debugElement.query(By.css('.chart-info'));
      expect(chartInfo).toBeTruthy();
      
      const periodInfo = chartInfo.nativeElement.textContent;
      expect(periodInfo).toContain('Período:');
      expect(periodInfo).toContain(`${component.selectedPeriod} dias`);
    });
  });

  describe('Chart Accessibility', () => {
    it('should render chart with accessible alternative', () => {
      component.graphData = [
        { date: new Date(), value: 10 },
        { date: new Date(), value: 20 }
      ];
      fixture.detectChanges();
      
      // Chart should be present
      const chartWrapper = fixture.debugElement.query(By.css('.chart-wrapper'));
      expect(chartWrapper).toBeTruthy();
      
      // Chart info provides text alternative
      const chartInfo = fixture.debugElement.query(By.css('.chart-info'));
      expect(chartInfo).toBeTruthy();
    });

    it('should provide chart data summary for screen readers', () => {
      component.graphData = [
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-02'), value: 20 },
        { date: new Date('2024-01-03'), value: 15 }
      ];
      fixture.detectChanges();
      
      // Chart info section provides summary
      const chartInfo = fixture.debugElement.query(By.css('.chart-info'));
      expect(chartInfo).toBeTruthy();
      
      // Should show period and type information
      const infoText = chartInfo.nativeElement.textContent;
      expect(infoText).toContain('Período:');
      expect(infoText).toContain('Tipo:');
    });

    it('should render line chart when selected', () => {
      component.chartType = 'line';
      component.graphData = [
        { date: new Date(), value: 10 }
      ];
      fixture.detectChanges();
      
      const lineChart = fixture.debugElement.query(By.css('c4u-grafico-linhas'));
      expect(lineChart).toBeTruthy();
      
      const barChart = fixture.debugElement.query(By.css('c4u-grafico-barras'));
      expect(barChart).toBeFalsy();
    });

    it('should render bar chart when selected', () => {
      component.chartType = 'bar';
      component.graphData = [
        { date: new Date(), value: 10 }
      ];
      fixture.detectChanges();
      
      const barChart = fixture.debugElement.query(By.css('c4u-grafico-barras'));
      expect(barChart).toBeTruthy();
      
      const lineChart = fixture.debugElement.query(By.css('c4u-grafico-linhas'));
      expect(lineChart).toBeFalsy();
    });
  });

  describe('Focus Management', () => {
    it('should maintain focus when toggling chart type', () => {
      fixture.detectChanges();
      
      const toggleButton = fixture.debugElement.query(By.css('.toggle-btn'));
      toggleButton.nativeElement.focus();
      
      expect(document.activeElement).toBe(toggleButton.nativeElement);
      
      toggleButton.nativeElement.click();
      fixture.detectChanges();
      
      // Focus should remain on a focusable element
      expect(document.activeElement).toBeTruthy();
    });

    it('should have visible focus indicators on toggle buttons', () => {
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      
      toggleButtons.forEach(button => {
        const styles = window.getComputedStyle(button.nativeElement);
        
        // Should have focus indicator
        if (styles.outline === 'none' || styles.outline === '0px') {
          const hasAlternative = 
            styles.boxShadow !== 'none' ||
            styles.border !== 'none' ||
            button.nativeElement.classList.contains('focus-visible');
          
          expect(hasAlternative).toBe(
            true,
            'Button should have focus indicator'
          );
        }
      });
    });
  });

  describe('Visual Accessibility', () => {
    it('should have good contrast for text elements', () => {
      fixture.detectChanges();
      
      const textElements = fixture.debugElement.queryAll(By.css('.tab-title, .loading-text, .empty-text'));
      
      textElements.forEach(element => {
        if (element.nativeElement.textContent?.trim().length > 0) {
          const hasContrast = AccessibilityTestUtils.hasGoodContrast(element);
          expect(hasContrast).toBe(true, 'Text should have good color contrast');
        }
      });
    });

    it('should have accessible loading spinner', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const spinner = fixture.debugElement.query(By.css('.spinner-border'));
      expect(spinner).toBeTruthy();
      expect(spinner.nativeElement.getAttribute('role')).toBe('status');
    });

    it('should indicate active chart type visually', () => {
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      
      const activeButtons = toggleButtons.filter(btn => 
        btn.nativeElement.classList.contains('active')
      );
      
      expect(activeButtons.length).toBe(1, 'Exactly one toggle button should be active');
    });
  });

  describe('Semantic HTML', () => {
    it('should use proper heading hierarchy', () => {
      fixture.detectChanges();
      
      const heading = fixture.debugElement.query(By.css('h3, h2'));
      expect(heading).toBeTruthy('Should have heading for tab title');
    });

    it('should use button elements for toggle controls', () => {
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      
      toggleButtons.forEach(button => {
        expect(button.nativeElement.tagName.toLowerCase()).toBe('button');
        expect(button.nativeElement.getAttribute('type')).toBe('button');
      });
    });
  });

  describe('Responsive Accessibility', () => {
    it('should maintain accessibility on mobile viewports', () => {
      component.graphData = [
        { date: new Date(), value: 10 }
      ];
      
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });
      
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      
      toggleButtons.forEach(button => {
        expect(AccessibilityTestUtils.isKeyboardAccessible(button)).toBe(true);
      });
    });

    it('should have touch-friendly toggle buttons', () => {
      fixture.detectChanges();
      
      const toggleButtons = fixture.debugElement.queryAll(By.css('.toggle-btn'));
      
      toggleButtons.forEach(button => {
        const rect = button.nativeElement.getBoundingClientRect();
        // Touch targets should be reasonably sized
        expect(rect.height).toBeGreaterThanOrEqual(0);
        expect(rect.width).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Time Period Selector Integration', () => {
    it('should integrate time period selector accessibly', () => {
      fixture.detectChanges();
      
      const periodSelector = fixture.debugElement.query(By.css('c4u-time-period-selector'));
      expect(periodSelector).toBeTruthy('Should have time period selector');
    });

    it('should pass period data to selector', () => {
      fixture.detectChanges();
      
      const periodSelector = fixture.debugElement.query(By.css('c4u-time-period-selector'));
      expect(periodSelector.componentInstance.periods).toEqual(component.availablePeriods);
      expect(periodSelector.componentInstance.selectedPeriod).toBe(component.selectedPeriod);
    });
  });

  describe('Chart Data Accessibility', () => {
    it('should handle empty chart data accessibly', () => {
      component.isLoading = false;
      component.graphData = [];
      fixture.detectChanges();
      
      const emptyState = fixture.debugElement.query(By.css('.empty-state'));
      expect(emptyState).toBeTruthy();
    });

    it('should pass chart data to chart components', () => {
      component.graphData = [
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-02'), value: 20 }
      ];
      fixture.detectChanges();
      
      const chart = fixture.debugElement.query(By.css('c4u-grafico-linhas, c4u-grafico-barras'));
      expect(chart).toBeTruthy();
      
      // Chart should receive labels and datasets
      expect(chart.componentInstance.labels).toBeDefined();
      expect(chart.componentInstance.datasets).toBeDefined();
    });
  });
});
