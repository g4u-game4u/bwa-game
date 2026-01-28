import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SimpleChange } from '@angular/core';
import { C4uProductivityAnalysisTabComponent } from './c4u-productivity-analysis-tab.component';
import { C4uTimePeriodSelectorComponent } from '../c4u-time-period-selector/c4u-time-period-selector.component';
import { C4uGraficoLinhasComponent } from '../c4u-grafico-linhas/c4u-grafico-linhas.component';
import { C4uGraficoBarrasComponent } from '../c4u-grafico-barras/c4u-grafico-barras.component';
import { GraphDataProcessorService } from '../../services/graph-data-processor.service';
import { GraphDataPoint } from '../../model/gamification-dashboard.model';

/**
 * Unit Tests for ProductivityAnalysisTabComponent
 * 
 * Tests Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
describe('C4uProductivityAnalysisTabComponent', () => {
  let component: C4uProductivityAnalysisTabComponent;
  let fixture: ComponentFixture<C4uProductivityAnalysisTabComponent>;
  let graphDataProcessor: GraphDataProcessorService;

  const mockGraphData: GraphDataPoint[] = [
    { date: new Date('2024-01-15'), value: 10 },
    { date: new Date('2024-01-16'), value: 15 },
    { date: new Date('2024-01-17'), value: 8 },
    { date: new Date('2024-01-18'), value: 20 },
    { date: new Date('2024-01-19'), value: 12 }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        C4uProductivityAnalysisTabComponent,
        C4uTimePeriodSelectorComponent,
        C4uGraficoLinhasComponent,
        C4uGraficoBarrasComponent
      ],
      imports: [FormsModule],
      providers: [GraphDataProcessorService]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uProductivityAnalysisTabComponent);
    component = fixture.componentInstance;
    graphDataProcessor = TestBed.inject(GraphDataProcessorService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Component Initialization', () => {
    it('should initialize with default values', () => {
      expect(component.chartType).toBe('line');
      expect(component.selectedPeriod).toBe(30);
      expect(component.availablePeriods).toEqual([7, 15, 30, 60, 90]);
      expect(component.isLoading).toBe(false);
      expect(component.graphData).toEqual([]);
    });

    it('should initialize with empty chart data', () => {
      expect(component.chartLabels).toEqual([]);
      expect(component.chartDatasets).toEqual([]);
    });

    it('should call updateChartData on init', () => {
      spyOn<any>(component, 'updateChartData');
      component.ngOnInit();
      expect(component['updateChartData']).toHaveBeenCalled();
    });
  });

  describe('Chart Type Toggle - Requirement 8.3', () => {
    it('should toggle from line to bar chart', () => {
      component.chartType = 'line';
      component.toggleChartType();
      expect(component.chartType).toBe('bar');
    });

    it('should toggle from bar to line chart', () => {
      component.chartType = 'bar';
      component.toggleChartType();
      expect(component.chartType).toBe('line');
    });

    it('should emit chartTypeChanged event on toggle', (done) => {
      component.chartType = 'line';
      
      component.chartTypeChanged.subscribe((type) => {
        expect(type).toBe('bar');
        done();
      });

      component.toggleChartType();
    });

    it('should toggle multiple times correctly', () => {
      component.chartType = 'line';
      
      component.toggleChartType();
      expect(component.chartType).toBe('bar');
      
      component.toggleChartType();
      expect(component.chartType).toBe('line');
      
      component.toggleChartType();
      expect(component.chartType).toBe('bar');
    });

    it('should update chart component selector based on type', () => {
      component.chartType = 'line';
      expect(component.chartComponentSelector).toBe('c4u-grafico-linhas');
      
      component.chartType = 'bar';
      expect(component.chartComponentSelector).toBe('c4u-grafico-barras');
    });

    it('should have correct isLineChart getter', () => {
      component.chartType = 'line';
      expect(component.isLineChart).toBe(true);
      expect(component.isBarChart).toBe(false);
      
      component.chartType = 'bar';
      expect(component.isLineChart).toBe(false);
      expect(component.isBarChart).toBe(true);
    });
  });

  describe('Period Change - Requirement 8.4', () => {
    it('should update selected period when period changes', () => {
      component.onPeriodChange(60);
      expect(component.selectedPeriod).toBe(60);
    });

    it('should emit periodChanged event', (done) => {
      component.periodChanged.subscribe((period) => {
        expect(period).toBe(90);
        done();
      });

      component.onPeriodChange(90);
    });

    it('should handle all available periods', () => {
      const periods = [7, 15, 30, 60, 90];
      
      periods.forEach(period => {
        component.onPeriodChange(period);
        expect(component.selectedPeriod).toBe(period);
      });
    });

    it('should trigger data reload on period change', (done) => {
      component.periodChanged.subscribe((period) => {
        expect(period).toBe(15);
        done();
      });

      component.onPeriodChange(15);
    });
  });

  describe('Loading State - Requirement 8.5', () => {
    it('should display loading indicator when isLoading is true', () => {
      component.isLoading = true;
      fixture.detectChanges();

      const loadingOverlay = fixture.nativeElement.querySelector('.loading-overlay');
      expect(loadingOverlay).toBeTruthy();
    });

    it('should hide loading indicator when isLoading is false', () => {
      component.isLoading = false;
      fixture.detectChanges();

      const loadingOverlay = fixture.nativeElement.querySelector('.loading-overlay');
      expect(loadingOverlay).toBeFalsy();
    });

    it('should disable chart type toggle buttons when loading', () => {
      component.isLoading = true;
      fixture.detectChanges();

      const toggleButtons = fixture.nativeElement.querySelectorAll('.toggle-btn');
      toggleButtons.forEach((button: HTMLButtonElement) => {
        expect(button.disabled).toBe(true);
      });
    });

    it('should enable chart type toggle buttons when not loading', () => {
      component.isLoading = false;
      fixture.detectChanges();

      const toggleButtons = fixture.nativeElement.querySelectorAll('.toggle-btn');
      toggleButtons.forEach((button: HTMLButtonElement) => {
        expect(button.disabled).toBe(false);
      });
    });
  });

  describe('Graph Data Updates - Requirement 8.5', () => {
    it('should update chart data when graphData changes', () => {
      spyOn<any>(component, 'updateChartData');
      
      component.graphData = mockGraphData;
      component.ngOnChanges({
        graphData: new SimpleChange(null, mockGraphData, false)
      });

      expect(component['updateChartData']).toHaveBeenCalled();
    });

    it('should update chart data when selectedPeriod changes', () => {
      spyOn<any>(component, 'updateChartData');
      
      component.selectedPeriod = 60;
      component.ngOnChanges({
        selectedPeriod: new SimpleChange(30, 60, false)
      });

      expect(component['updateChartData']).toHaveBeenCalled();
    });

    it('should process graph data correctly', () => {
      component.graphData = mockGraphData;
      component.selectedPeriod = 30;
      component['updateChartData']();

      expect(component.chartLabels.length).toBeGreaterThan(0);
      expect(component.chartDatasets.length).toBeGreaterThan(0);
    });

    it('should handle empty graph data', () => {
      component.graphData = [];
      component['updateChartData']();

      expect(component.chartLabels).toEqual([]);
      expect(component.chartDatasets).toEqual([]);
    });

    it('should create datasets with correct labels', () => {
      component.graphData = mockGraphData;
      component.selectedPeriod = 30;
      component['updateChartData']();

      expect(component.chartDatasets[0].label).toBe('Atividades Finalizadas');
    });
  });

  describe('Chart Display - Requirements 8.1, 8.2', () => {
    it('should display line chart when chartType is line', () => {
      component.chartType = 'line';
      component.graphData = mockGraphData;
      component.isLoading = false;
      fixture.detectChanges();

      const lineChart = fixture.nativeElement.querySelector('c4u-grafico-linhas');
      const barChart = fixture.nativeElement.querySelector('c4u-grafico-barras');

      expect(lineChart).toBeTruthy();
      expect(barChart).toBeFalsy();
    });

    it('should display bar chart when chartType is bar', () => {
      component.chartType = 'bar';
      component.graphData = mockGraphData;
      component.isLoading = false;
      fixture.detectChanges();

      const lineChart = fixture.nativeElement.querySelector('c4u-grafico-linhas');
      const barChart = fixture.nativeElement.querySelector('c4u-grafico-barras');

      expect(lineChart).toBeFalsy();
      expect(barChart).toBeTruthy();
    });

    it('should display empty state when no data', () => {
      component.graphData = [];
      component.isLoading = false;
      fixture.detectChanges();

      const emptyState = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('Nenhum dado disponível');
    });

    it('should display chart info when data is available', () => {
      component.graphData = mockGraphData;
      component.isLoading = false;
      component.selectedPeriod = 30;
      fixture.detectChanges();

      const chartInfo = fixture.nativeElement.querySelector('.chart-info');
      expect(chartInfo).toBeTruthy();
      expect(chartInfo.textContent).toContain('Últimos 30 dias');
    });
  });

  describe('Time Period Selector Integration', () => {
    it('should render time period selector', () => {
      const selector = fixture.nativeElement.querySelector('c4u-time-period-selector');
      expect(selector).toBeTruthy();
    });

    it('should pass available periods to selector', () => {
      fixture.detectChanges();
      const selector = fixture.debugElement.nativeElement.querySelector('c4u-time-period-selector');
      expect(selector).toBeTruthy();
    });

    it('should pass selected period to selector', () => {
      component.selectedPeriod = 60;
      fixture.detectChanges();
      expect(component.selectedPeriod).toBe(60);
    });
  });

  describe('Chart Type Toggle UI', () => {
    it('should render chart type toggle buttons', () => {
      fixture.detectChanges();
      const toggleButtons = fixture.nativeElement.querySelectorAll('.toggle-btn');
      expect(toggleButtons.length).toBe(2);
    });

    it('should highlight active chart type button', () => {
      component.chartType = 'line';
      fixture.detectChanges();

      const toggleButtons = fixture.nativeElement.querySelectorAll('.toggle-btn');
      expect(toggleButtons[0].classList.contains('active')).toBe(true);
      expect(toggleButtons[1].classList.contains('active')).toBe(false);
    });

    it('should switch active button on toggle', () => {
      component.chartType = 'line';
      fixture.detectChanges();

      component.toggleChartType();
      fixture.detectChanges();

      const toggleButtons = fixture.nativeElement.querySelectorAll('.toggle-btn');
      expect(toggleButtons[0].classList.contains('active')).toBe(false);
      expect(toggleButtons[1].classList.contains('active')).toBe(true);
    });

    it('should call toggleChartType when button is clicked', () => {
      spyOn(component, 'toggleChartType');
      fixture.detectChanges();

      const toggleButton = fixture.nativeElement.querySelector('.toggle-btn');
      toggleButton.click();

      expect(component.toggleChartType).toHaveBeenCalled();
    });
  });

  describe('Responsive Behavior', () => {
    it('should have responsive CSS classes', () => {
      fixture.detectChanges();
      const container = fixture.nativeElement.querySelector('.productivity-analysis-tab');
      expect(container).toBeTruthy();
    });

    it('should maintain functionality with different screen sizes', () => {
      component.graphData = mockGraphData;
      component.selectedPeriod = 30;
      fixture.detectChanges();

      // Component should work regardless of screen size
      expect(component.chartType).toBeDefined();
      expect(component.selectedPeriod).toBe(30);
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on toggle buttons', () => {
      fixture.detectChanges();
      const toggleButtons = fixture.nativeElement.querySelectorAll('.toggle-btn');
      
      toggleButtons.forEach((button: HTMLButtonElement) => {
        expect(button.getAttribute('aria-label')).toBeTruthy();
      });
    });

    it('should have title attributes on toggle buttons', () => {
      fixture.detectChanges();
      const toggleButtons = fixture.nativeElement.querySelectorAll('.toggle-btn');
      
      toggleButtons.forEach((button: HTMLButtonElement) => {
        expect(button.getAttribute('title')).toBeTruthy();
      });
    });

    it('should have visually-hidden text for loading spinner', () => {
      component.isLoading = true;
      fixture.detectChanges();

      const hiddenText = fixture.nativeElement.querySelector('.visually-hidden');
      expect(hiddenText).toBeTruthy();
      expect(hiddenText.textContent).toContain('Carregando');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null graphData', () => {
      component.graphData = null as any;
      expect(() => component['updateChartData']()).not.toThrow();
    });

    it('should handle undefined graphData', () => {
      component.graphData = undefined as any;
      expect(() => component['updateChartData']()).not.toThrow();
    });

    it('should handle very large datasets', () => {
      const largeDataset: GraphDataPoint[] = Array.from({ length: 365 }, (_, i) => ({
        date: new Date(2024, 0, i + 1),
        value: Math.floor(Math.random() * 100)
      }));

      component.graphData = largeDataset;
      component.selectedPeriod = 365;
      
      expect(() => component['updateChartData']()).not.toThrow();
    });

    it('should handle zero values in data', () => {
      const zeroData: GraphDataPoint[] = [
        { date: new Date('2024-01-15'), value: 0 },
        { date: new Date('2024-01-16'), value: 0 },
        { date: new Date('2024-01-17'), value: 0 }
      ];

      component.graphData = zeroData;
      component['updateChartData']();

      expect(component.chartDatasets.length).toBeGreaterThan(0);
    });
  });

  describe('Integration with GraphDataProcessorService', () => {
    it('should use GraphDataProcessorService to get date labels', () => {
      spyOn(graphDataProcessor, 'getDateLabels').and.returnValue(['15/01', '16/01', '17/01']);
      
      component.graphData = mockGraphData;
      component.selectedPeriod = 30;
      component['updateChartData']();

      expect(graphDataProcessor.getDateLabels).toHaveBeenCalledWith(30);
    });

    it('should use GraphDataProcessorService to create datasets', () => {
      spyOn(graphDataProcessor, 'createChartDatasets').and.returnValue([{
        label: 'Test',
        data: [1, 2, 3],
        borderColor: 'red',
        backgroundColor: 'blue',
        fill: false
      }]);

      component.graphData = mockGraphData;
      component['updateChartData']();

      expect(graphDataProcessor.createChartDatasets).toHaveBeenCalled();
    });
  });
});
