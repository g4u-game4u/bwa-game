import {Component, Input, OnInit, ViewChild, OnChanges, SimpleChanges, OnDestroy, AfterViewInit, ChangeDetectionStrategy} from '@angular/core';
import {Chart, ChartConfiguration, ChartOptions} from "chart.js";
import {translate} from "../../providers/translate.provider";
import { ChartDataset } from '../../model/gamification-dashboard.model';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

/**
 * Bar Chart Component with Chart.js integration.
 * 
 * Supports two input modes:
 * 1. Legacy mode: labels + values (for backward compatibility)
 * 2. New mode: labels + datasets (ChartDataset interface)
 * 
 * Features:
 * - Responsive chart sizing
 * - Tooltip formatting
 * - Dynamic data updates
 * - Multiple dataset support (grouped bars)
 * - Gradient backgrounds
 * - Customizable legend display
 */
@Component({
  selector: 'c4u-grafico-barras',
  templateUrl: './c4u-grafico-barras.component.html',
  styleUrls: ['./c4u-grafico-barras.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uGraficoBarrasComponent implements AfterViewInit, OnChanges, OnDestroy {
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

  private colors = [
    'rgba(255, 255, 255)',
    'rgba(255, 0, 0)',
    'rgba(0, 0, 255)',
    'rgba(255, 255, 0)',
    'rgba(255, 192, 203)',
    'rgba(128, 0, 128)',
    'rgba(0, 128, 0)'];
  private colorsTransparent = [
    'rgba(255, 255, 255, 0.25)',
    'rgba(255, 0, 0, 0.25)',
    'rgba(0, 0, 255, 0.25)',
    'rgba(255, 255, 0, 0.25)',
    'rgba(255, 192, 203, 0.25)',
    'rgba(128, 0, 128, 0.25)',
    'rgba(0, 128, 0, 0.25)'];

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
    const formattedLabels = this.formatLabels(this.labels);

    const config: ChartConfiguration = {
      type: "bar",
      data: {
        labels: formattedLabels,
        datasets: dataSetsChart
      },
      options: this.getChartOptions()
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
    const formattedLabels = this.formatLabels(this.labels);

    this.chart.data.labels = formattedLabels;
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
      const max = this.getMaxValue(this.datasets);
      
      return this.datasets.map((dataset, index) => {
        // Check if backgroundColor is an array (for per-bar colors)
        const isBackgroundColorArray = Array.isArray(dataset.backgroundColor);
        const isBorderColorArray = Array.isArray(dataset.borderColor);
        
        return {
          label: dataset.label,
          data: dataset.data,
          borderWidth: dataset.borderWidth || 1,
          borderColor: isBorderColorArray ? dataset.borderColor : "transparent",
          backgroundColor: isBackgroundColorArray 
            ? dataset.backgroundColor 
            : (context: any) => {
                return this.createGradient(
                  context, 
                  max, 
                  typeof dataset.borderColor === 'string' ? dataset.borderColor : "transparent",
                  typeof dataset.backgroundColor === 'string' ? dataset.backgroundColor : "transparent",
                  index
                );
              },
          borderRadius: {
            topLeft: 4,
            topRight: 4
          }
        };
      });
    }

    // Fall back to legacy values format
    const max = this.getMaxValueLegacy();
    const dataSetsChart = [];

    for (let i = 0; i < this.values.length; i++) {
      let value = this.values[i];
      dataSetsChart.push({
        label: value.label,
        data: value.valueList,
        borderWidth: 1,
        borderColor: "transparent",
        backgroundColor: (context: any) => {
          return this.createGradientLegacy(context, max, i);
        },
        borderRadius: {
          topLeft: 4,
          topRight: 4
        },
      })
    }

    return dataSetsChart;
  }

  /**
   * Get Chart.js options configuration.
   */
  private getChartOptions(): ChartOptions {
    return {
      datasets: {
        line: {
          fill: true
        }
      },
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
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
   * Create gradient for bar background (new datasets format).
   */
  private createGradient(context: any, max: number, borderColor: string, backgroundColor: string, index: number): string {
    if (context.chart.chartArea) {
      const h = context.chart.chartArea.bottom;
      const elh = Number(context.raw) * h / max;
      const gradient = this.chartCanvas.nativeElement.getContext('2d').createLinearGradient(
        0, h - elh, 0, h);
      
      // Use provided colors or fall back to default palette
      const topColor = borderColor || this.getColor(this.colors, index);
      const bottomColor = backgroundColor || this.getColor(this.colorsTransparent, index);
      
      gradient.addColorStop(0, topColor);
      gradient.addColorStop(1, bottomColor);
      return gradient;
    }

    return 'white';
  }

  /**
   * Create gradient for bar background (legacy format).
   */
  private createGradientLegacy(context: any, max: number, index: number): string {
    if (context.chart.chartArea) {
      const h = context.chart.chartArea.bottom;
      const elh = Number(context.raw) * h / max;
      const gradient = this.chartCanvas.nativeElement.getContext('2d').createLinearGradient(
        0, h - elh, 0, h);
      gradient.addColorStop(0, this.getColor(this.colors, index));
      gradient.addColorStop(1, this.getColor(this.colorsTransparent, index));
      return gradient;
    }

    return 'white';
  }

  /**
   * Get maximum value from datasets.
   */
  private getMaxValue(datasets: ChartDataset[]): number {
    let max = 0;
    datasets.forEach(dataset => {
      const datasetMax = Math.max(...dataset.data);
      if (datasetMax > max) {
        max = datasetMax;
      }
    });
    return max || 1;
  }

  /**
   * Get maximum value from legacy values format.
   */
  private getMaxValueLegacy(): number {
    if (this.values.length === 0 || this.values[0].valueList.length === 0) {
      return 1;
    }
    return Math.max(...this.values[0].valueList) || 1;
  }

  /**
   * Format labels (convert emails to names if needed).
   */
  private formatLabels(labels: string[]): string[] {
    return labels.map(label => {
      if (label.includes('@')) {
        return this.formatEmailToName(label);
      }
      return label;
    });
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

  private getColor(listaCores: Array<string>, index: number) {
    if (index >= listaCores.length) {
      do {
        index = index - listaCores.length
      } while (index >= listaCores.length)
    }
    return listaCores[index];
  }
}
