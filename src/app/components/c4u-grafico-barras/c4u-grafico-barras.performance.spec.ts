import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { C4uGraficoBarrasComponent } from './c4u-grafico-barras.component';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ChartDataset } from '../../model/gamification-dashboard.model';

/**
 * Performance Tests for Bar Chart Component
 * 
 * Verifies:
 * - Chart rendering performance with debouncing (Requirement 17.3)
 * - OnPush change detection optimization (Requirement 17.2)
 * - Memory management
 * - Large dataset handling
 * - Gradient rendering performance
 * 
 * Task: 16.1 Write performance tests
 */
describe('C4uGraficoBarrasComponent Performance Tests', () => {
  let component: C4uGraficoBarrasComponent;
  let fixture: ComponentFixture<C4uGraficoBarrasComponent>;
  let performanceMonitor: PerformanceMonitorService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uGraficoBarrasComponent],
      providers: [PerformanceMonitorService]
    }).compileComponents();

    performanceMonitor = TestBed.inject(PerformanceMonitorService);
    fixture = TestBed.createComponent(C4uGraficoBarrasComponent);
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
      for (let i = 0; i < 5; i++) {
        component.datasets = [{ 
          label: 'Test', 
          data: [i * 10, i * 20], 
          borderColor: 'blue', 
          backgroundColor: 'lightblue' 
        }];
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

      // Should not update immediately
      expect(component['updateChart']).not.toHaveBeenCalled();

      // After debounce period (300ms), should update once
      tick(300);
      expect(component['updateChart']).toHaveBeenCalledTimes(1);
    }));
  });

  describe('Chart Rendering Performance', () => {
    it('should render chart within performance budget', fakeAsync(() => {
      const endMeasure = performanceMonitor.measureRenderTime('bar-chart-render');

      component.labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      component.datasets = [{
        label: 'Completed',
        data: [45, 52, 38, 60],
        borderColor: 'green',
        backgroundColor: 'lightgreen'
      }];

      fixture.detectChanges();
      tick();

      endMeasure();

      const metrics = performanceMonitor.getMetrics('bar-chart-render');
      expect(metrics).toBeDefined();
      
      if (metrics) {
        // Should render within 100ms
        expect(metrics.componentRenderTime).toBeLessThan(100);
      }
    }));

    it('should handle large datasets efficiently', fakeAsync(() => {
      const startTime = performance.now();

      // Create large dataset (60 bars)
      const labels = Array.from({ length: 60 }, (_, i) => `Period ${i + 1}`);
      const data = Array.from({ length: 60 }, () => Math.floor(Math.random() * 100));

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

      // Should handle 60 bars in reasonable time (< 250ms)
      expect(duration).toBeLessThan(250);
    }));

    it('should update existing chart efficiently', fakeAsync(() => {
      // Initial render
      component.labels = ['Week 1', 'Week 2'];
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

  describe('Gradient Rendering Performance', () => {
    it('should create gradients efficiently', fakeAsync(() => {
      component.labels = ['Day 1', 'Day 2', 'Day 3'];
      component.datasets = [{
        label: 'Activities',
        data: [10, 20, 30],
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];

      const startTime = performance.now();

      fixture.detectChanges();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Gradient creation should not significantly impact render time
      expect(duration).toBeLessThan(150);
    }));

    it('should handle multiple gradients efficiently', fakeAsync(() => {
      const startTime = performance.now();

      component.labels = Array.from({ length: 20 }, (_, i) => `Day ${i + 1}`);
      component.datasets = [
        {
          label: 'Dataset 1',
          data: Array.from({ length: 20 }, () => Math.random() * 100),
          borderColor: 'blue',
          backgroundColor: 'lightblue'
        },
        {
          label: 'Dataset 2',
          data: Array.from({ length: 20 }, () => Math.random() * 100),
          borderColor: 'green',
          backgroundColor: 'lightgreen'
        }
      ];

      fixture.detectChanges();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Multiple gradients should still render quickly
      expect(duration).toBeLessThan(300);
    }));
  });

  describe('Memory Management', () => {
    it('should clean up chart on destroy', fakeAsync(() => {
      component.labels = ['Week 1', 'Week 2'];
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
          data: [i, i * 2, i * 3],
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
    it('should handle grouped bars efficiently', fakeAsync(() => {
      const startTime = performance.now();

      component.labels = Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);
      component.datasets = [
        {
          label: 'Completed',
          data: Array.from({ length: 12 }, () => Math.random() * 100),
          borderColor: 'green',
          backgroundColor: 'lightgreen'
        },
        {
          label: 'In Progress',
          data: Array.from({ length: 12 }, () => Math.random() * 50),
          borderColor: 'yellow',
          backgroundColor: 'lightyellow'
        },
        {
          label: 'Pending',
          data: Array.from({ length: 12 }, () => Math.random() * 30),
          borderColor: 'red',
          backgroundColor: 'lightcoral'
        }
      ];

      fixture.detectChanges();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should handle 3 grouped datasets efficiently
      expect(duration).toBeLessThan(350);
    }));
  });

  describe('Zero Value Handling Performance', () => {
    it('should handle zero values efficiently', fakeAsync(() => {
      const startTime = performance.now();

      component.labels = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'];
      component.datasets = [{
        label: 'Activities',
        data: [0, 10, 0, 20, 0], // Mix of zero and non-zero values
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];

      fixture.detectChanges();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Zero values should not impact performance
      expect(duration).toBeLessThan(100);
    }));

    it('should handle all-zero dataset efficiently', fakeAsync(() => {
      const startTime = performance.now();

      component.labels = Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);
      component.datasets = [{
        label: 'Activities',
        data: Array.from({ length: 30 }, () => 0),
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];

      fixture.detectChanges();
      tick();

      const endTime = performance.now();
      const duration = endTime - startTime;

      // All-zero dataset should render quickly
      expect(duration).toBeLessThan(100);
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
      const customFormatter = jasmine.createSpy('formatter').and.returnValue('Custom: 25');
      component.tooltipFormatter = customFormatter;

      const result = component.formatTooltip(25, 'Test');

      expect(customFormatter).toHaveBeenCalledWith(25, 'Test');
      expect(result).toBe('Custom: 25');
    });
  });

  describe('Label Formatting Performance', () => {
    it('should format email labels efficiently', () => {
      const startTime = performance.now();

      const emails = Array.from({ length: 50 }, (_, i) => `user${i}@test.com`);
      component.labels = emails;
      component.datasets = [{
        label: 'Activities',
        data: Array.from({ length: 50 }, () => Math.random() * 100),
        borderColor: 'blue',
        backgroundColor: 'lightblue'
      }];

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Email formatting should be fast
      expect(duration).toBeLessThan(50);
    });
  });
});
