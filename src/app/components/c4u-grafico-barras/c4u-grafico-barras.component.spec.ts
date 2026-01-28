import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uGraficoBarrasComponent } from './c4u-grafico-barras.component';
import { ChartDataset } from '../../model/gamification-dashboard.model';

/**
 * Unit tests for BarChartComponent (C4uGraficoBarrasComponent).
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */
describe('C4uGraficoBarrasComponent', () => {
  let component: C4uGraficoBarrasComponent;
  let fixture: ComponentFixture<C4uGraficoBarrasComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [C4uGraficoBarrasComponent]
    });
    fixture = TestBed.createComponent(C4uGraficoBarrasComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    if (component.chart) {
      component.chart.destroy();
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render bar chart with legacy values format', () => {
    component.labels = ['Day 1', 'Day 2', 'Day 3'];
    component.values = [
      { label: 'Completed Tasks', valueList: [5, 8, 12] }
    ];

    fixture.detectChanges();

    expect(component.chart).toBeTruthy();
    expect(component.chart?.data.labels).toEqual(['Day 1', 'Day 2', 'Day 3']);
    expect(component.chart?.data.datasets.length).toBe(1);
    expect(component.chart?.data.datasets[0].data).toEqual([5, 8, 12]);
  });

  it('should render bar chart with new datasets format', () => {
    component.labels = ['Day 1', 'Day 2', 'Day 3'];
    component.datasets = [
      {
        label: 'Completed Activities',
        data: [5, 8, 12],
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: false
      }
    ];

    fixture.detectChanges();

    expect(component.chart).toBeTruthy();
    expect(component.chart?.data.datasets.length).toBe(1);
    expect(component.chart?.data.datasets[0].label).toBe('Completed Activities');
  });

  it('should support grouped bars for multiple metrics', () => {
    component.labels = ['Day 1', 'Day 2', 'Day 3'];
    component.datasets = [
      {
        label: 'Metric 1',
        data: [5, 8, 12],
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: false
      },
      {
        label: 'Metric 2',
        data: [3, 6, 9],
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        fill: false
      }
    ];

    fixture.detectChanges();

    expect(component.chart?.data.datasets.length).toBe(2);
    expect(component.chart?.data.datasets[0].label).toBe('Metric 1');
    expect(component.chart?.data.datasets[1].label).toBe('Metric 2');
  });

  it('should update chart when data changes', () => {
    component.labels = ['Day 1', 'Day 2'];
    component.datasets = [
      {
        label: 'Tasks',
        data: [5, 8],
        borderColor: 'white',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        fill: false
      }
    ];
    fixture.detectChanges();

    const initialChart = component.chart;
    
    component.labels = ['Day 1', 'Day 2', 'Day 3'];
    component.datasets = [
      {
        label: 'Tasks',
        data: [5, 8, 12],
        borderColor: 'white',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        fill: false
      }
    ];
    component.updateChart();

    expect(component.chart).toBe(initialChart);
    expect(component.chart?.data.datasets[0].data).toEqual([5, 8, 12]);
  });

  it('should handle zero values by showing empty bars', () => {
    component.labels = ['Day 1', 'Day 2', 'Day 3'];
    component.datasets = [
      {
        label: 'Tasks',
        data: [0, 5, 0],
        borderColor: 'white',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        fill: false
      }
    ];

    fixture.detectChanges();

    expect(component.chart).toBeTruthy();
    expect(component.chart?.data.datasets[0].data).toEqual([0, 5, 0]);
  });

  it('should format tooltip with default formatter', () => {
    const formatted = component.formatTooltip(42, 'Tasks');
    expect(formatted).toBe('Tasks: 42');
  });

  it('should use custom tooltip formatter when provided', () => {
    component.tooltipFormatter = (value: number, label: string) => {
      return `${label}: ${value} items completed`;
    };

    const formatted = component.formatTooltip(42, 'Tasks');
    expect(formatted).toBe('Tasks: 42 items completed');
  });

  it('should have responsive option enabled', () => {
    component.labels = ['Day 1'];
    component.values = [{ label: 'Tasks', valueList: [5] }];

    fixture.detectChanges();

    const options = component.chart?.options as any;
    expect(options.responsive).toBe(true);
    expect(options.maintainAspectRatio).toBe(false);
  });

  it('should destroy chart on component destroy', () => {
    component.labels = ['Day 1'];
    component.values = [{ label: 'Tasks', valueList: [5] }];
    fixture.detectChanges();

    expect(component.chart).toBeTruthy();

    component.ngOnDestroy();

    expect(component.chart).toBeNull();
  });

  it('should format email addresses to readable names', () => {
    component.labels = ['john.doe@example.com', 'jane.smith@example.com'];
    component.values = [{ label: 'Tasks', valueList: [5, 8] }];

    fixture.detectChanges();

    expect(component.chart?.data.labels).toEqual(['John Doe', 'Jane Smith']);
  });
});
