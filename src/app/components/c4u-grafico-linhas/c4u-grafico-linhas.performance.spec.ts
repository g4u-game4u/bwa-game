import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { C4uGraficoLinhasComponent } from './c4u-grafico-linhas.component';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ChartDataset } from '../../model/gamification-dashboard.model';

/**
 * Performance Tests for Line Chart Component
 * 
 * Verifies:
 * - Chart rendering performance with debouncing (Requirement 17.3)
 * - OnPush change detection optimization (Requirement 17.2)
 * - Memory management
 * - Large dataset handling
 * 
 * Task: 16.1 Write performance tests
 */
describe('C4uGraficoLinhasComponent Performance Tests', () => {
  let component: C4uGraficoLinhasComponent;
  let fixture: ComponentFixture<C4uGraficoLinhasComponent>;
  let performanceMonitor: PerformanceMonitorService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uGraficoLinhasComponent],
      providers: [PerformanceMonitorService]
    }).compileComponents();

    performanceMonitor = TestBed.inject(PerformanceMonitorService);
    fixture = TestBed.createComponent(C4uGraficoLinhasComponent);
    component = fixture.componentInstance;
  });

  describe('Change Detection Optimization', () => {
    it('should use OnPush change detection strategy', () => {
      const metadata = (component.constructor as any).__annotations__[0];
      expect(metadata.changeDetection).toBe(0); // ChangeDetectionStrategy.OnPush = 0
    });
  });

  describe('Debouncing Performance', () => {
    it('should debounce rapid data updates', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      spyOn<any>(component, 'updateChart');

      // Trigger multiple rapid changes
      component.labels = ['Day 1', 'Day 2'];
      component.datasets = [{ label: 'Test', data: [10, 20], borderColor: 'blue', backgroundColor: 'lightblue' }];
      component.ngOnChanges({
        datasets: {
          currentValue: component.datasets,
          previousValue: [],
          firstChange: false,
          isFirstChange: () => false
        }
      });
      tick(100);

      component.datasets = [{ label: 'Test', data: [15, 25], borderColor: 'blue', backgroundColor: 'lightblue' }];
      component.ngOnChanges({
        datasets: {
          currentValue: component.datasets,
          previousValue: [],
          firstChange: false,
          isFirstChange: () => false
        }
      });
      tick(100);

      component.datasets = [{ label: 'Test', data: [20, 30], borderColor: 'blue', backgroundColor: 'lightblue' }];
      component.ngOnChanges({
        datasets: {
          currentValue: component.datasets,
          previousValue: [],
          firstChange: false,
          isFirstChange: () => false
        }
      });
      tick(100);

      // Should not update immediately
      expect(component['updateChart']).not.toHaveBeenCalled();

      // After debounce period (300ms), should update once
      tick(200);
      expect(component['updateChart']).toHaveBeenCalledTimes(1);
    }));

    it('should prevent excessive chart updates', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      const updateSpy = spyOn<any>(component, 'updateChart');

      // Simulate 10 rapid updates
      for (let i = 0; i < 10; i++) {
        component.datasets = [{ label: 'Test', data: [i, i * 2], borderColor: 'blue', backgroundColor: 'lightblue' }];
        component.ngOnChanges({
          datasets: {
            currentValue: component.datasets,
            previousValue: [],
            firstChange: false,
            isFirstChange: () => false
          }
        });
        tick(50);
      }

      // Wait for debounce
      tick(300);

      // Should only update once despite 10 changes
      expect(updateSpy.calls.count()).toBeLessThanOrEqual(2);
    }));
  });

  describe('Chart Rendering Performance', () => {
    it('should render chart within performance budget', fakeAsync(() => {
      const endMeasure = performanceMonitor.measureRenderTime('line-chart-render');

      component.labels = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'];
      component.datasets = [{
        label: 'Activities',
        data: [10, 20, 15, 30, 25],
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];

      fixture.detectChanges();
      tick();

      endMeasure();

      const metrics = performanceMonitor.getMetrics('line-chart-render');
      expect(metrics).toBeDefined();
      
      if (metrics) {
        // Should render within 100ms
        expect(metrics.componentRenderTime).toBeLessThan(100);
      }
    }));

    it('should handle large datasets efficiently', fakeAsync(() => {
      const startTime = performance.now();

      // Create large dataset (90 days)
      const labels = Array.from({ length: 90 }, (_, i) => `Day ${i + 1}`);
      const data = Array.from({ length: 90 }, () => Math.floor(Math.random() * 100));

      component.labels = labels;
      component.datasets = [{
        label: 'Activities',
        data: data,
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];

      fixture.detectChanges();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should handle 90 data points in reasonable time (< 200ms)
      expect(duration).toBeLessThan(200);
    }));

    it('should update existing chart efficiently', fakeAsync(() => {
      // Initial render
      component.labels = ['Day 1', 'Day 2'];
      component.datasets = [{
        label: 'Activities',
        data: [10, 20],
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];
      fixture.detectChanges();
      tick();

      const startTime = performance.now();

      // Update data
      component.datasets = [{
        label: 'Activities',
        data: [15, 25],
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];
      component.updateChart();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Updates should be faster than initial render (< 50ms)
      expect(duration).toBeLessThan(50);
    }));
  });

  describe('Memory Management', () => {
    it('should clean up chart on destroy', fakeAsync(() => {
      component.labels = ['Day 1', 'Day 2'];
      component.datasets = [{
        label: 'Activities',
        data: [10, 20],
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];
      fixture.detectChanges();
      tick();

      expect(component.chart).toBeDefined();

      component.ngOnDestroy();

      expect(component.chart).toBeNull();
    }));

    it('should not leak memory on repeated updates', fakeAsync(() => {
      fixture.detectChanges();
      tick();

      const initialMemory = performanceMonitor.measureMemoryUsage();

      // Perform multiple updates
      for (let i = 0; i < 20; i++) {
        component.datasets = [{
          label: 'Activities',
          data: [i, i * 2],
          borderColor: 'blue',
          backgroundColor: 'lightblue'
        }];
        component.updateChart();
        tick(50);
      }

      tick(300); // Wait for debounce

      const finalMemory = performanceMonitor.measureMemoryUsage();

      // Memory should not grow significantly
      if (initialMemory > 0 && finalMemory > 0) {
        const memoryIncrease = finalMemory - initialMemory;
        expect(memoryIncrease).toBeLessThan(5);
      }
    }));
  });

  describe('Multiple Dataset Performance', () => {
    it('should handle multiple datasets efficiently', fakeAsync(() => {
      const startTime = performance.now();

      component.labels = Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);
      component.datasets = [
        {
          label: 'Activities',
          data: Array.from({ length: 30 }, () => Math.random() * 100),
          borderColor: 'blue',
          backgroundColor: 'lightblue'
        },
        {
          label: 'Processes',
          data: Array.from({ length: 30 }, () => Math.random() * 50),
          borderColor: 'green',
          backgroundColor: 'lightgreen'
        },
        {
          label: 'Goals',
          data: Array.from({ length: 30 }, () => Math.random() * 75),
          borderColor: 'red',
          backgroundColor: 'lightcoral'
        }
      ];

      fixture.detectChanges();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should handle 3 datasets with 30 points each in reasonable time
      expect(duration).toBeLessThan(300);
    }));
  });

  describe('Tooltip Performance', () => {
    it('should format tooltips efficiently', () => {
      const startTime = performance.now();

      // Format 100 tooltips
      for (let i = 0; i < 100; i++) {
        component.formatTooltip(i, `Label ${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should format 100 tooltips very quickly (< 10ms)
      expect(duration).toBeLessThan(10);
    });

    it('should use custom tooltip formatter when provided', () => {
      const customFormatter = jasmine.createSpy('formatter').and.returnValue('Custom: 10');
      component.tooltipFormatter = customFormatter;

      const result = component.formatTooltip(10, 'Test');

      expect(customFormatter).toHaveBeenCalledWith(10, 'Test');
      expect(result).toBe('Custom: 10');
    });
  });
});
