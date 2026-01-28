import {AfterViewInit, Component, Input, ViewChild, OnChanges, SimpleChanges, OnDestroy, ChangeDetectionStrategy} from '@angular/core';
import {Chart, ChartConfiguration, ChartOptions} from "chart.js";
import {translate} from "../../providers/translate.provider";
import { ChartDataset } from '../../model/gamification-dashboard.model';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

/**
 * Line Chart Component with Chart.js integration.
 * 
 * Supports two input modes:
 * 1. Legacy mode: labels + values (for backward compatibility)
 * 2. New mode: labels + datasets (ChartDataset interface)
 * 
 * Features:
 * - Responsive chart sizing
 * - Tooltip formatting
 * - Dynamic data updates
 * - Multiple dataset support
 * - Customizable legend display
 */
@Component({
  selector: 'c4u-grafico-linhas',
  templateUrl: './c4u-grafico-linhas.component.html',
  styleUrls: ['./c4u-grafico-linhas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uGraficoLinhasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chart', {static: true})
  chartCanvas: any;

  chart: Chart | null = null;

  @Input()
  labels: Array<string> = [];

  @Input()
  values: Array<{ valueList: Array<number>, label: string }> = [];

  /**
   * New input for ChartDataset interface support.
   * If provided, this takes precedence over the legacy 'values' input.
   */
  @Input()
  datasets: ChartDataset[] = [];

  @Input()
  showLegend = false;

  /**
   * Custom tooltip formatter function.
   * If provided, will be used to format tooltip values.
   */
  @Input()
  tooltipFormatter?: (value: number, label: string) => string;

  /**
   * Accessible data table for screen readers.
   * Provides text alternative to visual chart.
   */
  @Input()
  showAccessibleTable = false;

  private colors = ["white", "red", "blue", "yellow", "pink", "purple", "green"];
  private pointStyle = ["circle", "rect", "rectRot", "star", "triangle", "rectRounded", "cross", "crossRot", "dash", "line"];
  
  private isInitialized = false;
  private chartUpdate$ = new Subject<void>();

  ngOnChanges(changes: SimpleChanges): void {
    // Update chart when data changes after initialization
    if (this.isInitialized && (changes['labels'] || changes['values'] || changes['datasets'])) {
      // Trigger debounced update
      this.chartUpdate$.next();
    }
  }

  ngAfterViewInit(): void {
    // Set up debounced chart updates
    this.chartUpdate$
      .pipe(debounceTime(300)) // Debounce for 300ms
      .subscribe(() => {
        this.updateChart();
      });

    this.createChart();
    this.isInitialized = true;
  }

  ngOnDestroy(): void {
    this.chartUpdate$.complete();
    this.destroy();
  }

  /**
   * Create the chart with current data.
   * Uses datasets input if available, otherwise falls back to legacy values input.
   */
  private createChart(): void {
    const dataSetsChart = this.prepareDatasets();
    const sortedLabels = this.sortLabelsChronologically(this.labels);

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels: sortedLabels,
        datasets: dataSetsChart
      },
      options: this.getChartOptions(),
      plugins: [plugin],
    };

    this.chart = new Chart(this.chartCanvas.nativeElement, config);
  }

  /**
   * Update chart with new data.
   * Efficiently updates existing chart instead of recreating it.
   */
  updateChart(): void {
    if (!this.chart) {
      this.createChart();
      return;
    }

    const dataSetsChart = this.prepareDatasets();
    const sortedLabels = this.sortLabelsChronologically(this.labels);

    this.chart.data.labels = sortedLabels;
    this.chart.data.datasets = dataSetsChart;
    this.chart.update();
  }

  /**
   * Prepare datasets for Chart.js.
   * Supports both new ChartDataset interface and legacy values format.
   */
  private prepareDatasets(): any[] {
    // Use new datasets input if provided
    if (this.datasets && this.datasets.length > 0) {
      return this.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.data,
        borderWidth: 2,
        pointStyle: this.getPointStyle(index),
        borderColor: dataset.borderColor,
        backgroundColor: dataset.backgroundColor,
        pointBackgroundColor: dataset.borderColor,
        fill: dataset.fill !== undefined ? dataset.fill : false
      }));
    }

    // Fall back to legacy values format
    const dataSetsChart = [];
    for (let i = 0; i < this.values.length; i++) {
      let value = this.values[i];
      const formattedLabel = value.label.includes('@') 
        ? this.formatEmailToName(value.label)
        : value.label;

      dataSetsChart.push({
        label: formattedLabel,
        data: value.valueList,
        borderWidth: 2,
        pointStyle: this.getPointStyle(i),
        borderColor: this.getColor(i),
        pointBackgroundColor: this.getColor(i)
      });
    }

    return dataSetsChart;
  }

  /**
   * Get Chart.js options configuration.
   */
  private getChartOptions(): ChartOptions {
    return {
      layout: {
        padding: {
          left: 0,
          right: 0,
          top: 30,
          bottom: 0
        }
      },
      datasets: {
        line: {
          fill: true
        }
      },
      maintainAspectRatio: false,
      responsive: true,
      plugins: <any>{
        legend: {
          display: this.showLegend,
          align: 'start',
          title: {
            text: translate("LABEL_LEGEND"),
            display: true,
            position: 'start'
          },
          labels: {
            padding: 20,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              
              // Use custom formatter if provided
              if (this.tooltipFormatter) {
                return this.tooltipFormatter(value, label);
              }
              
              // Default formatting
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            display: false,
          }
        },
        x: {
          grid: {
            color: "rgba(238, 238, 238, 0.25)",
            drawTicks: false
          },
          ticks: {
            color: this.getTickColors()
          },
          border: {
            dash: [2, 2]
          }
        }
      }
    };
  }

  /**
   * Get tick colors based on data values.
   * Dims ticks for zero values.
   */
  private getTickColors(): string | string[] {
    if (this.datasets && this.datasets.length > 0 && this.datasets[0].data) {
      return this.datasets[0].data.map(v => v <= 0 ? 'rgba(238, 238, 238, 0.5)' : '#EEEEEE');
    }
    
    if (this.values && this.values.length > 0 && this.values[0].valueList) {
      return this.values[0].valueList.map(v => v <= 0 ? 'rgba(238, 238, 238, 0.5)' : '#EEEEEE');
    }
    
    return '#EEEEEE';
  }

  /**
   * Format tooltip value.
   * Can be overridden via tooltipFormatter input.
   */
  formatTooltip(value: number, label: string): string {
    if (this.tooltipFormatter) {
      return this.tooltipFormatter(value, label);
    }
    return `${label}: ${value}`;
  }

  /**
   * Destroy chart instance.
   * Should be called in ngOnDestroy to prevent memory leaks.
   */
  destroy(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  private formatEmailToName(email: string): string {
    // Remove domain part
    const namePart = email.split('@')[0];
    // Split by dots and underscores
    const nameParts = namePart.split(/[._]/);
    // Capitalize each part and join with space
    return nameParts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private sortLabelsChronologically(labels: string[]): string[] {
    return [...labels].sort((a, b) => {
      // Extract day numbers from labels (assuming format like "Dia 1", "Dia 2", etc.)
      const dayA = parseInt(a.replace(/\D/g, ''));
      const dayB = parseInt(b.replace(/\D/g, ''));
      return dayA - dayB;
    });
  }

  private getPointStyle(index: number) {
    if (index >= this.pointStyle.length) {
      do {
        index = index - this.pointStyle.length
      } while (index >= this.pointStyle.length)
    }
    return this.pointStyle[index];
  }

  getColor(index: number) {
    if (index >= this.colors.length) {
      do {
        index = index - this.colors.length
      } while (index >= this.colors.length)
    }
    return this.colors[index];
  }

}

const plugin = {
  id: 'pluginPaddingLegenda',
  beforeInit(chart: any) {
    // Get a reference to the original fit function
    const originalFit = chart.legend.fit;

    // Override the fit function
    chart.legend.fit = function fit() {
      // Call the original function and bind scope in order to use `this` correctly inside it
      originalFit.bind(chart.legend)();
      // Change the height as suggested in other answers
      this.height += 20;
    }
  }
}
