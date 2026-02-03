import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { GraphDataPoint, ChartDataset } from '../../model/gamification-dashboard.model';
import { GraphDataProcessorService } from '../../services/graph-data-processor.service';

/**
 * Productivity Analysis Tab Component
 * 
 * Container component for productivity graphs and time period selector.
 * Displays historical productivity trends using line or bar charts with
 * configurable time periods.
 * 
 * Features:
 * - Time period selection (7, 15, 30, 60, 90 days)
 * - Chart type toggle (line/bar)
 * - Loading state management
 * - Data processing for chart visualization
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
@Component({
  selector: 'c4u-productivity-analysis-tab',
  templateUrl: './c4u-productivity-analysis-tab.component.html',
  styleUrls: ['./c4u-productivity-analysis-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uProductivityAnalysisTabComponent implements OnInit, OnChanges {
  /**
   * Graph data points to display
   */
  @Input() graphData: GraphDataPoint[] = [];

  /**
   * Pre-configured chart datasets (for multiple lines, e.g., one per team member)
   * If provided, this takes precedence over graphData
   */
  @Input() chartDatasetsInput: ChartDataset[] | null = null;

  /**
   * Currently selected time period in days
   */
  @Input() selectedPeriod: number = 30;

  /**
   * Loading state for graph data
   */
  @Input() isLoading: boolean = false;

  /**
   * Event emitted when time period changes
   */
  @Output() periodChanged = new EventEmitter<number>();

  /**
   * Event emitted when chart type changes
   */
  @Output() chartTypeChanged = new EventEmitter<'line' | 'bar'>();

  /**
   * Current chart type (line or bar)
   * Requirement 8.3: Chart type toggle
   */
  chartType: 'line' | 'bar' = 'line';

  /**
   * Available time periods in days
   */
  availablePeriods: number[] = [7, 15, 30, 60, 90];

  /**
   * Chart labels (dates)
   */
  chartLabels: string[] = [];

  /**
   * Chart datasets for Chart.js
   */
  chartDatasets: ChartDataset[] = [];

  /**
   * Subject for debouncing chart data updates
   */
  private chartDataUpdate$ = new Subject<void>();

  constructor(private graphDataProcessor: GraphDataProcessorService) {}

  ngOnInit(): void {
    // Set up debounced chart updates
    this.chartDataUpdate$
      .pipe(debounceTime(300)) // Debounce for 300ms
      .subscribe(() => {
        this.updateChartData();
      });

    // Initial update
    this.updateChartData();
  }

  /**
   * Handle period change from selector
   * Requirement 8.4: Data fetching based on selected period
   * 
   * @param period - New period in days
   */
  onPeriodChange(period: number): void {
    this.selectedPeriod = period;
    this.periodChanged.emit(period);
  }

  /**
   * Toggle between line and bar chart
   * Requirement 8.3: Chart type toggle
   * Property 7: Chart Type Toggle Preservation
   */
  toggleChartType(): void {
    this.chartType = this.chartType === 'line' ? 'bar' : 'line';
    this.chartTypeChanged.emit(this.chartType);
  }

  /**
   * Update chart data when graph data changes
   * Requirement 8.5: Graph data updates
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['graphData'] || changes['selectedPeriod'] || changes['chartDatasetsInput']) {
      // Trigger debounced update
      this.chartDataUpdate$.next();
    }
  }

  /**
   * Process graph data into chart-ready format
   * 
   * Converts GraphDataPoint array into labels and datasets
   * suitable for Chart.js components.
   * If chartDatasetsInput is provided, uses that instead.
   */
  private updateChartData(): void {
    // If pre-configured datasets are provided, use them
    if (this.chartDatasetsInput && this.chartDatasetsInput.length > 0) {
      this.chartLabels = this.graphDataProcessor.getDateLabels(this.selectedPeriod);
      this.chartDatasets = this.chartDatasetsInput;
      return;
    }

    if (!this.graphData || this.graphData.length === 0) {
      this.chartLabels = [];
      this.chartDatasets = [];
      return;
    }

    // Generate date labels
    this.chartLabels = this.graphDataProcessor.getDateLabels(this.selectedPeriod);

    // Create dataset for productivity data
    this.chartDatasets = this.graphDataProcessor.createChartDatasets(
      this.graphData,
      ['Atividades Finalizadas']
    );
  }

  /**
   * Get the appropriate chart component selector
   * 
   * @returns Component selector string
   */
  get chartComponentSelector(): string {
    return this.chartType === 'line' 
      ? 'c4u-grafico-linhas' 
      : 'c4u-grafico-barras';
  }

  /**
   * Check if line chart is active
   */
  get isLineChart(): boolean {
    return this.chartType === 'line';
  }

  /**
   * Check if bar chart is active
   */
  get isBarChart(): boolean {
    return this.chartType === 'bar';
  }

  /**
   * Get dataset labels as comma-separated string
   * Helper method for template to avoid arrow functions in bindings
   */
  getDatasetLabels(): string {
    if (!this.chartDatasets || this.chartDatasets.length === 0) {
      return '';
    }
    return this.chartDatasets.map(d => d.label).join(', ');
  }
}
