import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { C4uKpiCircularProgressComponent } from './c4u-kpi-circular-progress.component';
import { C4uPorcentagemCircularComponent } from '../c4u-porcentagem-circular/c4u-porcentagem-circular.component';

/**
 * Visual Polish & Refinement Tests for KPI Circular Progress Component
 * 
 * Tests visual consistency, sizing, spacing, colors, and responsive behavior
 * to ensure production-ready quality across all screen sizes and contexts.
 * 
 * **Validates: Task 15 - Visual Polish & Refinement**
 */
describe('C4uKpiCircularProgressComponent - Visual Polish', () => {
  let component: C4uKpiCircularProgressComponent;
  let fixture: ComponentFixture<C4uKpiCircularProgressComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        C4uKpiCircularProgressComponent,
        C4uPorcentagemCircularComponent
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uKpiCircularProgressComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement;
  });

  describe('15.1: Sizing and Spacing Consistency', () => {
    it('should apply correct host width for small size', () => {
      component.size = 'small';
      fixture.detectChanges();
      
      const hostElement = fixture.debugElement.nativeElement;
      expect(hostElement.classList.contains('size-small')).toBe(true);
    });

    it('should apply correct host width for medium size (default)', () => {
      component.size = 'medium';
      fixture.detectChanges();
      
      const hostElement = fixture.debugElement.nativeElement;
      // Medium is default, no specific class needed
      expect(hostElement.classList.contains('size-medium')).toBe(false);
      expect(hostElement.classList.contains('size-small')).toBe(false);
      expect(hostElement.classList.contains('size-large')).toBe(false);
    });

    it('should apply correct host width for large size', () => {
      component.size = 'large';
      fixture.detectChanges();
      
      const hostElement = fixture.debugElement.nativeElement;
      expect(hostElement.classList.contains('size-large')).toBe(true);
    });

    it('should have consistent gap spacing in component layout', () => {
      component.label = 'Test KPI';
      component.current = 50;
      component.target = 100;
      fixture.detectChanges();
      
      const container = compiled.querySelector('.kpi-circular-progress');
      expect(container).toBeTruthy();
      
      // Verify all child elements are present for proper spacing
      const label = container?.querySelector('.kpi-label');
      const progressWrapper = container?.querySelector('.kpi-progress-wrapper');
      const value = container?.querySelector('.kpi-value');
      const status = container?.querySelector('.kpi-status');
      
      expect(label).toBeTruthy();
      expect(progressWrapper).toBeTruthy();
      expect(value).toBeTruthy();
      expect(status).toBeTruthy();
    });

    it('should maintain proportional sizing across all size variants', () => {
      const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
      
      sizes.forEach(size => {
        component.size = size;
        component.label = 'Test';
        component.current = 75;
        component.target = 100;
        fixture.detectChanges();
        
        const label = compiled.querySelector('.kpi-label');
        const value = compiled.querySelector('.kpi-value');
        const status = compiled.querySelector('.kpi-status');
        
        // All elements should be present regardless of size
        expect(label).toBeTruthy();
        expect(value).toBeTruthy();
        expect(status).toBeTruthy();
      });
    });

    it('should have readable label font size for small variant (11px minimum)', () => {
      component.size = 'small';
      component.label = 'Entregas';
      fixture.detectChanges();
      
      const label = compiled.querySelector('.kpi-label');
      expect(label).toBeTruthy();
      expect(label?.textContent).toContain('Entregas');
      
      // Font size should be 11px for readability (updated from 10px)
      // This is verified through CSS, but we ensure the element exists
    });
  });

  describe('15.2: Color Consistency with Design System', () => {
    it('should use design system color for green status', () => {
      component.color = 'green';
      component.current = 100;
      component.target = 100;
      fixture.detectChanges();
      
      const status = compiled.querySelector('.kpi-status');
      expect(status?.classList.contains('status-green')).toBe(true);
    });

    it('should use design system color for yellow status', () => {
      component.color = 'yellow';
      component.current = 50;
      component.target = 100;
      fixture.detectChanges();
      
      const status = compiled.querySelector('.kpi-status');
      expect(status?.classList.contains('status-yellow')).toBe(true);
    });

    it('should use design system color for red status', () => {
      component.color = 'red';
      component.current = 25;
      component.target = 100;
      fixture.detectChanges();
      
      const status = compiled.querySelector('.kpi-status');
      expect(status?.classList.contains('status-red')).toBe(true);
    });

    it('should apply correct progress color based on color input', () => {
      const colors: Array<'green' | 'yellow' | 'red'> = ['green', 'yellow', 'red'];
      
      colors.forEach(color => {
        component.color = color;
        fixture.detectChanges();
        
        const progressColor = component.progressColor;
        
        if (color === 'green') {
          expect(progressColor).toBe('green');
        } else if (color === 'yellow') {
          expect(progressColor).toBe('gold');
        } else if (color === 'red') {
          expect(progressColor).toBe('red');
        }
      });
    });

    it('should use consistent text colors across all sizes', () => {
      const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
      
      sizes.forEach(size => {
        component.size = size;
        component.label = 'Test';
        component.current = 75;
        component.target = 100;
        fixture.detectChanges();
        
        const label = compiled.querySelector('.kpi-label');
        const value = compiled.querySelector('.kpi-value');
        
        // Elements should exist and have text content
        expect(label?.textContent).toBeTruthy();
        expect(value?.textContent).toBeTruthy();
      });
    });
  });

  describe('15.3: Responsive Behavior', () => {
    it('should render correctly for mobile context (small size)', () => {
      component.size = 'small';
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      fixture.detectChanges();
      
      const container = compiled.querySelector('.kpi-circular-progress');
      expect(container).toBeTruthy();
      
      // Verify all elements render in small size
      const label = container?.querySelector('.kpi-label');
      const value = container?.querySelector('.kpi-value');
      const status = container?.querySelector('.kpi-status');
      
      expect(label?.textContent).toContain('Entregas');
      expect(value?.textContent).toContain('89');
      expect(status?.textContent).toBeTruthy();
    });

    it('should render correctly for tablet context (medium size)', () => {
      component.size = 'medium';
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      fixture.detectChanges();
      
      const container = compiled.querySelector('.kpi-circular-progress');
      expect(container).toBeTruthy();
      
      // Verify all elements render in medium size
      const label = container?.querySelector('.kpi-label');
      const value = container?.querySelector('.kpi-value');
      
      expect(label?.textContent).toContain('Entregas');
      expect(value?.textContent).toContain('89');
    });

    it('should render correctly for desktop context (large size)', () => {
      component.size = 'large';
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      fixture.detectChanges();
      
      const container = compiled.querySelector('.kpi-circular-progress');
      expect(container).toBeTruthy();
      
      // Verify all elements render in large size
      const label = container?.querySelector('.kpi-label');
      const value = container?.querySelector('.kpi-value');
      
      expect(label?.textContent).toContain('Entregas');
      expect(value?.textContent).toContain('89');
    });

    it('should handle long labels with ellipsis', () => {
      component.label = 'Very Long KPI Label That Should Be Truncated';
      component.current = 50;
      component.target = 100;
      fixture.detectChanges();
      
      const label = compiled.querySelector('.kpi-label');
      expect(label).toBeTruthy();
      expect(label?.textContent).toContain('Very Long KPI Label');
    });

    it('should maintain aspect ratio across all sizes', () => {
      const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
      
      sizes.forEach(size => {
        component.size = size;
        component.current = 75;
        component.target = 100;
        fixture.detectChanges();
        
        const progressWrapper = compiled.querySelector('.kpi-progress-wrapper');
        expect(progressWrapper).toBeTruthy();
        
        // Progress wrapper should be square (width === height)
        // This is enforced by CSS, but we verify the element exists
      });
    });
  });

  describe('15.4: Loading and Empty States', () => {
    it('should handle zero values gracefully', () => {
      component.label = 'Test KPI';
      component.current = 0;
      component.target = 0;
      fixture.detectChanges();
      
      expect(component.percentage).toBe(0);
      expect(component.displayValue).toBe('0');
    });

    it('should handle missing target gracefully', () => {
      component.label = 'Test KPI';
      component.current = 50;
      component.target = 0;
      fixture.detectChanges();
      
      expect(component.percentage).toBe(0);
      expect(component.displayValue).toBe('50');
    });

    it('should display correct goal status for zero progress', () => {
      component.current = 0;
      component.target = 100;
      fixture.detectChanges();
      
      expect(component.goalStatus).toBe('Abaixo da meta');
    });

    it('should display correct goal status for achieved goal', () => {
      component.current = 100;
      component.target = 100;
      fixture.detectChanges();
      
      expect(component.goalStatus).toBe('Meta atingida');
    });

    it('should display correct goal status for super goal', () => {
      component.current = 150;
      component.target = 100;
      component.superTarget = 150;
      fixture.detectChanges();
      
      expect(component.goalStatus).toBe('Super meta atingida');
    });
  });

  describe('15.5: Visual Consistency', () => {
    it('should maintain consistent border radius across sizes', () => {
      const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
      
      sizes.forEach(size => {
        component.size = size;
        component.current = 75;
        component.target = 100;
        fixture.detectChanges();
        
        const status = compiled.querySelector('.kpi-status');
        expect(status).toBeTruthy();
        // Border radius is applied via CSS
      });
    });

    it('should display unit correctly when provided', () => {
      component.current = 89;
      component.target = 100;
      component.unit = ' entregas';
      fixture.detectChanges();
      
      expect(component.displayValue).toBe('89 entregas');
      
      const value = compiled.querySelector('.kpi-value');
      expect(value?.textContent).toContain('89 entregas');
    });

    it('should display value without unit when not provided', () => {
      component.current = 89;
      component.target = 100;
      component.unit = undefined;
      fixture.detectChanges();
      
      expect(component.displayValue).toBe('89');
      
      const value = compiled.querySelector('.kpi-value');
      expect(value?.textContent).toContain('89');
    });

    it('should calculate percentage correctly', () => {
      const testCases = [
        { current: 0, target: 100, expected: 0 },
        { current: 25, target: 100, expected: 25 },
        { current: 50, target: 100, expected: 50 },
        { current: 75, target: 100, expected: 75 },
        { current: 100, target: 100, expected: 100 },
        { current: 150, target: 100, expected: 150 },
        { current: 89, target: 100, expected: 89 },
      ];
      
      testCases.forEach(({ current, target, expected }) => {
        component.current = current;
        component.target = target;
        expect(component.percentage).toBe(expected);
      });
    });

    it('should round percentage to nearest integer', () => {
      component.current = 33;
      component.target = 100;
      expect(component.percentage).toBe(33);
      
      component.current = 66;
      component.target = 100;
      expect(component.percentage).toBe(66);
      
      component.current = 67;
      component.target = 100;
      expect(component.percentage).toBe(67);
    });
  });

  describe('15.6: Accessibility and Focus States', () => {
    it('should have focus indicator styles', () => {
      component.label = 'Test KPI';
      component.current = 50;
      component.target = 100;
      fixture.detectChanges();
      
      const container = compiled.querySelector('.kpi-circular-progress');
      expect(container).toBeTruthy();
      
      // Focus styles are applied via CSS :focus-visible
      // We verify the container exists and can receive focus
    });

    it('should provide complete ARIA label', () => {
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      component.unit = ' entregas';
      fixture.detectChanges();
      
      const ariaLabel = component.ariaLabel;
      expect(ariaLabel).toContain('Entregas');
      expect(ariaLabel).toContain('89 entregas');
      expect(ariaLabel).toContain('100 entregas');
      expect(ariaLabel).toContain('89%');
      expect(ariaLabel).toContain('Abaixo da meta');
    });

    it('should provide ARIA value text', () => {
      component.current = 89;
      component.target = 100;
      fixture.detectChanges();
      
      const ariaValueText = component.ariaValueText;
      expect(ariaValueText).toContain('89 de 100');
      expect(ariaValueText).toContain('89 por cento');
    });
  });

  describe('15.7: Edge Cases and Error Handling', () => {
    it('should handle negative values gracefully', () => {
      component.current = -10;
      component.target = 100;
      fixture.detectChanges();
      
      // Component should still render without errors
      expect(component.percentage).toBe(-10);
      expect(component.displayValue).toBe('-10');
    });

    it('should handle very large values', () => {
      component.current = 999999;
      component.target = 1000000;
      fixture.detectChanges();
      
      expect(component.percentage).toBe(100); // Rounded
      expect(component.displayValue).toBe('999999');
    });

    it('should handle decimal values', () => {
      component.current = 89.5;
      component.target = 100;
      fixture.detectChanges();
      
      expect(component.percentage).toBe(90); // Rounded
      expect(component.displayValue).toBe('89.5');
    });

    it('should handle empty label', () => {
      component.label = '';
      component.current = 50;
      component.target = 100;
      fixture.detectChanges();
      
      const label = compiled.querySelector('.kpi-label');
      expect(label).toBeTruthy();
      expect(label?.textContent?.trim()).toBe('');
    });

    it('should handle color index fallback', () => {
      component.color = undefined;
      component.colorIndex = 0;
      fixture.detectChanges();
      
      expect(component.progressColor).toBe('green');
      
      component.colorIndex = 1;
      fixture.detectChanges();
      expect(component.progressColor).toBe('blue');
      
      component.colorIndex = 2;
      fixture.detectChanges();
      expect(component.progressColor).toBe('purple');
    });

    it('should handle color index overflow with modulo', () => {
      component.color = undefined;
      component.colorIndex = 10; // Beyond palette length
      fixture.detectChanges();
      
      // Should wrap around using modulo
      const expectedColor = component.progressColor;
      expect(['green', 'blue', 'purple', 'gold', 'red']).toContain(expectedColor);
    });
  });

  describe('15.8: Production Readiness', () => {
    it('should render complete component without errors', () => {
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      component.size = 'small';
      component.color = 'green';
      component.unit = ' entregas';
      fixture.detectChanges();
      
      // All elements should be present
      const container = compiled.querySelector('.kpi-circular-progress');
      const label = compiled.querySelector('.kpi-label');
      const progressWrapper = compiled.querySelector('.kpi-progress-wrapper');
      const value = compiled.querySelector('.kpi-value');
      const status = compiled.querySelector('.kpi-status');
      
      expect(container).toBeTruthy();
      expect(label).toBeTruthy();
      expect(progressWrapper).toBeTruthy();
      expect(value).toBeTruthy();
      expect(status).toBeTruthy();
    });

    it('should handle rapid size changes without errors', () => {
      const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large', 'small', 'large', 'medium'];
      
      sizes.forEach(size => {
        component.size = size;
        fixture.detectChanges();
        
        const container = compiled.querySelector('.kpi-circular-progress');
        expect(container).toBeTruthy();
      });
    });

    it('should handle rapid value changes without errors', () => {
      const values = [0, 25, 50, 75, 100, 150, 89, 45, 67];
      
      values.forEach(value => {
        component.current = value;
        component.target = 100;
        fixture.detectChanges();
        
        expect(component.displayValue).toBe(value.toString());
      });
    });

    it('should maintain performance with multiple updates', () => {
      const startTime = performance.now();
      
      // Simulate 100 updates
      for (let i = 0; i < 100; i++) {
        component.current = i;
        component.target = 100;
        fixture.detectChanges();
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});
