import { Injectable } from '@angular/core';
import * as dayjs from 'dayjs';
import { GraphDataPoint, ChartDataset } from '../model/gamification-dashboard.model';

/**
 * Service for processing aggregate query results into chart-ready data.
 * 
 * This service transforms raw aggregate results from Funifier API into
 * formatted data structures suitable for Chart.js visualization. It handles:
 * - Date grouping and aggregation
 * - Filling missing dates with zero values
 * - Creating Chart.js dataset configurations
 * - Color palette management for multiple datasets
 * 
 * Uses dayjs for date manipulation to maintain consistency with the project.
 */
@Injectable({
  providedIn: 'root'
})
export class GraphDataProcessorService {
  
  /**
   * Color palette for chart datasets.
   * Provides consistent colors with transparency support for backgrounds.
   */
  private readonly colorPalette = [
    { border: 'rgba(75, 192, 192, 1)', background: 'rgba(75, 192, 192, 0.2)' },
    { border: 'rgba(255, 99, 132, 1)', background: 'rgba(255, 99, 132, 0.2)' },
    { border: 'rgba(54, 162, 235, 1)', background: 'rgba(54, 162, 235, 0.2)' },
    { border: 'rgba(255, 206, 86, 1)', background: 'rgba(255, 206, 86, 0.2)' },
    { border: 'rgba(153, 102, 255, 1)', background: 'rgba(153, 102, 255, 0.2)' },
    { border: 'rgba(255, 159, 64, 1)', background: 'rgba(255, 159, 64, 0.2)' }
  ];

  constructor() { }

  /**
   * Process aggregate query results into graph data points.
   * 
   * Takes raw aggregate results with date grouping and transforms them into
   * a complete time series with all dates filled in. Missing dates are filled
   * with zero values to ensure continuous graph visualization.
   * 
   * @param aggregateResult - Raw aggregate result from Funifier API with structure:
   *   [{ _id: { date: '2024-01-15', actionId: 'action1' }, count: 5 }, ...]
   * @param period - Number of days to include in the graph
   * @returns Array of GraphDataPoint with complete date range
   * 
   * @example
   * const result = [
   *   { _id: { date: '2024-01-15', actionId: 'completed' }, count: 5 },
   *   { _id: { date: '2024-01-16', actionId: 'completed' }, count: 3 }
   * ];
   * const points = processGraphData(result, 7);
   * // Returns 7 data points with dates filled in
   */
  processGraphData(aggregateResult: any[], period: number): GraphDataPoint[] {
    const endDate = dayjs();
    const startDate = endDate.subtract(period, 'day');
    
    // Group by date and sum counts
    const grouped = this.groupByDate(aggregateResult);
    
    // Fill missing dates with zero values
    return this.fillMissingDates(grouped, startDate.toDate(), endDate.toDate());
  }

  /**
   * Group aggregate results by date, summing counts for each date.
   * 
   * Takes aggregate results that may have multiple entries per date (different
   * actionIds) and combines them into a single count per date.
   * 
   * @param data - Raw aggregate result array
   * @returns Map of date string to total count
   * 
   * @example
   * const data = [
   *   { _id: { date: '2024-01-15', actionId: 'action1' }, count: 5 },
   *   { _id: { date: '2024-01-15', actionId: 'action2' }, count: 3 }
   * ];
   * const grouped = groupByDate(data);
   * // Returns Map { '2024-01-15' => 8 }
   */
  groupByDate(data: any[]): Map<string, number> {
    const grouped = new Map<string, number>();
    
    if (!data || data.length === 0) {
      return grouped;
    }
    
    data.forEach(item => {
      // Handle different possible structures
      const date = item._id?.date || item._id || item.date;
      const count = item.count || 0;
      
      if (date) {
        const dateStr = this.normalizeDateString(date);
        grouped.set(dateStr, (grouped.get(dateStr) || 0) + count);
      }
    });
    
    return grouped;
  }

  /**
   * Fill missing dates in the range with zero values.
   * 
   * Ensures that the graph has a data point for every date in the specified
   * range, even if no data exists for that date. This creates a continuous
   * time series suitable for line and bar charts.
   * 
   * @param data - Map of date strings to values
   * @param startDate - Start date of the range
   * @param endDate - End date of the range
   * @returns Array of GraphDataPoint with all dates filled
   * 
   * @example
   * const data = new Map([['2024-01-15', 5], ['2024-01-17', 3]]);
   * const filled = fillMissingDates(data, new Date('2024-01-15'), new Date('2024-01-17'));
   * // Returns 3 points: [15: 5, 16: 0, 17: 3]
   */
  fillMissingDates(
    data: Map<string, number>,
    startDate: Date,
    endDate: Date
  ): GraphDataPoint[] {
    const result: GraphDataPoint[] = [];
    let currentDate = dayjs(startDate);
    const end = dayjs(endDate);
    
    // Iterate through each day in the range
    while (currentDate.isBefore(end) || currentDate.isSame(end, 'day')) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      
      result.push({
        date: currentDate.toDate(),
        value: data.get(dateStr) || 0
      });
      
      currentDate = currentDate.add(1, 'day');
    }
    
    return result;
  }

  /**
   * Create Chart.js dataset configurations from graph data.
   * 
   * Transforms GraphDataPoint arrays into Chart.js dataset format with
   * appropriate colors, labels, and styling. Supports multiple datasets
   * for comparing different metrics on the same chart.
   * 
   * @param data - Array of GraphDataPoint
   * @param metrics - Array of metric labels (one per dataset)
   * @returns Array of ChartDataset ready for Chart.js
   * 
   * @example
   * const data = [
   *   { date: new Date('2024-01-15'), value: 5 },
   *   { date: new Date('2024-01-16'), value: 3 }
   * ];
   * const datasets = createChartDatasets(data, ['Completed Tasks']);
   * // Returns Chart.js dataset with colors and data
   */
  createChartDatasets(
    data: GraphDataPoint[],
    metrics: string[]
  ): ChartDataset[] {
    return metrics.map((metric, index) => {
      const colors = this.getColor(index);
      
      return {
        label: metric,
        data: data.map(point => point.value),
        borderColor: colors.border,
        backgroundColor: colors.background,
        fill: false
      };
    });
  }

  /**
   * Create multiple datasets from grouped data.
   * 
   * When aggregate results contain multiple actionIds, this method creates
   * separate datasets for each action type, allowing comparison of different
   * metrics on the same chart.
   * 
   * @param aggregateResult - Raw aggregate result with actionId grouping
   * @param period - Number of days to include
   * @returns Array of ChartDataset, one per unique actionId
   * 
   * @example
   * const result = [
   *   { _id: { date: '2024-01-15', actionId: 'completed' }, count: 5 },
   *   { _id: { date: '2024-01-15', actionId: 'pending' }, count: 2 }
   * ];
   * const datasets = createMultipleDatasets(result, 7);
   * // Returns 2 datasets: one for 'completed', one for 'pending'
   */
  createMultipleDatasets(
    aggregateResult: any[],
    period: number
  ): ChartDataset[] {
    const endDate = dayjs();
    const startDate = endDate.subtract(period, 'day');
    
    // Group by actionId
    const byAction = new Map<string, Map<string, number>>();
    
    aggregateResult.forEach(item => {
      const actionId = item._id?.actionId || 'default';
      const date = item._id?.date;
      const count = item.count || 0;
      
      if (!byAction.has(actionId)) {
        byAction.set(actionId, new Map<string, number>());
      }
      
      const dateStr = this.normalizeDateString(date);
      const actionMap = byAction.get(actionId)!;
      actionMap.set(dateStr, (actionMap.get(dateStr) || 0) + count);
    });
    
    // Create dataset for each action
    const datasets: ChartDataset[] = [];
    let colorIndex = 0;
    
    byAction.forEach((dateMap, actionId) => {
      const dataPoints = this.fillMissingDates(dateMap, startDate.toDate(), endDate.toDate());
      const colors = this.getColor(colorIndex);
      
      datasets.push({
        label: this.formatActionLabel(actionId),
        data: dataPoints.map(point => point.value),
        borderColor: colors.border,
        backgroundColor: colors.background,
        fill: false
      });
      
      colorIndex++;
    });
    
    return datasets;
  }

  /**
   * Get color configuration for a dataset by index.
   * 
   * Cycles through the color palette, wrapping around if more datasets
   * than colors are requested.
   * 
   * @param index - Dataset index
   * @returns Object with border and background colors
   */
  private getColor(index: number): { border: string; background: string } {
    return this.colorPalette[index % this.colorPalette.length];
  }

  /**
   * Normalize date string to YYYY-MM-DD format.
   * 
   * Handles various date formats that might come from aggregate queries
   * and normalizes them to a consistent format for comparison.
   * 
   * @param date - Date in various formats (string, Date object, etc.)
   * @returns Normalized date string in YYYY-MM-DD format
   */
  private normalizeDateString(date: any): string {
    if (!date) {
      return dayjs().format('YYYY-MM-DD');
    }
    
    // If already a string in YYYY-MM-DD format, return as-is
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    
    // Parse and format using dayjs
    return dayjs(date).format('YYYY-MM-DD');
  }

  /**
   * Format action ID into a human-readable label.
   * 
   * Converts snake_case or camelCase action IDs into readable labels
   * for chart legends.
   * 
   * @param actionId - Action ID from aggregate result
   * @returns Formatted label
   * 
   * @example
   * formatActionLabel('completed_tasks') // Returns 'Completed Tasks'
   * formatActionLabel('pendingItems') // Returns 'Pending Items'
   */
  private formatActionLabel(actionId: string): string {
    if (!actionId || actionId === 'default') {
      return 'Total';
    }
    
    // Convert snake_case or camelCase to Title Case
    return actionId
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  /**
   * Get date labels for chart X-axis.
   * 
   * Generates formatted date labels for the specified period.
   * 
   * @param period - Number of days
   * @param format - Date format string (default: 'DD/MM')
   * @returns Array of formatted date strings
   * 
   * @example
   * getDateLabels(7) // Returns ['15/01', '16/01', '17/01', ...]
   */
  getDateLabels(period: number, format: string = 'DD/MM'): string[] {
    const labels: string[] = [];
    const endDate = dayjs();
    const startDate = endDate.subtract(period, 'day');
    
    let currentDate = startDate;
    
    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      labels.push(currentDate.format(format));
      currentDate = currentDate.add(1, 'day');
    }
    
    return labels;
  }
}
