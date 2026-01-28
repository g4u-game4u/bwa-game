import { TestBed } from '@angular/core/testing';
import { GraphDataProcessorService } from './graph-data-processor.service';
import * as fc from 'fast-check';
import * as dayjs from 'dayjs';

/**
 * Property-Based Tests for GraphDataProcessorService
 * 
 * These tests verify that the graph data processor correctly handles all
 * possible inputs and maintains data integrity across transformations.
 */
describe('GraphDataProcessorService Property-Based Tests', () => {
  let service: GraphDataProcessorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GraphDataProcessorService);
  });

  /**
   * Property 4: Graph Data Completeness
   * **Validates: Requirements 9.1, 9.5, 10.5**
   * 
   * For any time period selection, the graph should display data points for
   * all dates in the range, filling missing dates with zero values.
   * 
   * This ensures:
   * 1. No gaps in the time series
   * 2. Consistent data point count
   * 3. Chronological ordering
   * 4. All dates are valid Date objects
   */
  describe('Property 4: Graph Data Completeness', () => {
    // Arbitrary for generating periods (1 to 90 days)
    const periodArbitrary = fc.integer({ min: 1, max: 90 });

    // Arbitrary for generating sparse data (some dates may be missing)
    const sparseDataArbitrary = fc.array(
      fc.record({
        date: fc.date({
          min: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          max: new Date()
        }),
        value: fc.integer({ min: 0, max: 100 })
      }),
      { maxLength: 50 }
    );

    it('should fill all dates in range with data or zeros', () => {
      fc.assert(
        fc.property(
          periodArbitrary,
          sparseDataArbitrary,
          (period, sparseData) => {
            const endDate = new Date();
            const startDate = dayjs(endDate).subtract(period, 'day').toDate();
            
            // Convert sparse data to Map
            const dataMap = new Map<string, number>();
            sparseData.forEach(item => {
              const dateStr = dayjs(item.date).format('YYYY-MM-DD');
              dataMap.set(dateStr, item.value);
            });
            
            const result = service.fillMissingDates(dataMap, startDate, endDate);
            
            // Should have exactly period + 1 data points (inclusive)
            expect(result.length).toBe(period + 1);
            
            // All dates should be in sequence (1 day apart)
            for (let i = 1; i < result.length; i++) {
              const prevDate = dayjs(result[i - 1].date);
              const currDate = dayjs(result[i].date);
              const diff = currDate.diff(prevDate, 'day');
              expect(diff).toBe(1);
            }
            
            // All values should be non-negative numbers
            expect(result.every(point => typeof point.value === 'number' && point.value >= 0)).toBe(true);
            
            // All dates should be valid Date objects
            expect(result.every(point => point.date instanceof Date)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain data values for existing dates', () => {
      fc.assert(
        fc.property(
          periodArbitrary,
          fc.array(
            fc.record({
              daysAgo: fc.integer({ min: 0, max: 90 }),
              value: fc.integer({ min: 1, max: 1000 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (period, dataPoints) => {
            const endDate = new Date();
            const startDate = dayjs(endDate).subtract(period, 'day').toDate();
            
            // Create data map with known values
            const dataMap = new Map<string, number>();
            dataPoints.forEach(point => {
              const date = dayjs(endDate).subtract(point.daysAgo, 'day');
              if (point.daysAgo <= period) {
                dataMap.set(date.format('YYYY-MM-DD'), point.value);
              }
            });
            
            const result = service.fillMissingDates(dataMap, startDate, endDate);
            
            // Verify that known values are preserved
            dataPoints.forEach(point => {
              if (point.daysAgo <= period) {
                const date = dayjs(endDate).subtract(point.daysAgo, 'day');
                const dateStr = date.format('YYYY-MM-DD');
                const resultPoint = result.find(p => 
                  dayjs(p.date).format('YYYY-MM-DD') === dateStr
                );
                expect(resultPoint?.value).toBe(point.value);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty data by filling all dates with zeros', () => {
      fc.assert(
        fc.property(
          periodArbitrary,
          (period) => {
            const endDate = new Date();
            const startDate = dayjs(endDate).subtract(period, 'day').toDate();
            const emptyData = new Map<string, number>();
            
            const result = service.fillMissingDates(emptyData, startDate, endDate);
            
            expect(result.length).toBe(period + 1);
            expect(result.every(point => point.value === 0)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Time Period Selector Boundary
   * **Validates: Requirements 11.3, 11.4**
   * 
   * For any time period selection, the calculated date range should be
   * exactly N days before the current date, where N is the selected period.
   * 
   * This ensures:
   * 1. Correct date range calculation
   * 2. Inclusive of start and end dates
   * 3. Consistent behavior across all periods
   */
  describe('Property 10: Time Period Selector Boundary', () => {
    // Arbitrary for valid period selections
    const validPeriodArbitrary = fc.constantFrom(7, 15, 30, 60, 90);

    it('should calculate correct date range for any period', () => {
      fc.assert(
        fc.property(
          validPeriodArbitrary,
          (period) => {
            const endDate = dayjs();
            const startDate = endDate.subtract(period, 'day');
            
            // Process empty data to get date range
            const result = service.processGraphData([], period);
            
            // Should have exactly period + 1 data points
            expect(result.length).toBe(period + 1);
            
            // First date should be period days ago
            const firstDate = dayjs(result[0].date);
            const lastDate = dayjs(result[result.length - 1].date);
            
            const actualDiff = lastDate.diff(firstDate, 'day');
            expect(actualDiff).toBe(period);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include both start and end dates in range', () => {
      fc.assert(
        fc.property(
          validPeriodArbitrary,
          (period) => {
            const result = service.processGraphData([], period);
            
            // Should have period + 1 points (inclusive of both ends)
            expect(result.length).toBe(period + 1);
            
            // First and last dates should be exactly period days apart
            const firstDate = dayjs(result[0].date);
            const lastDate = dayjs(result[result.length - 1].date);
            expect(lastDate.diff(firstDate, 'day')).toBe(period);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate correct date labels for any period', () => {
      fc.assert(
        fc.property(
          validPeriodArbitrary,
          (period) => {
            const labels = service.getDateLabels(period);
            
            // Should have period + 1 labels
            expect(labels.length).toBe(period + 1);
            
            // All labels should be valid date strings
            expect(labels.every(label => /^\d{2}\/\d{2}$/.test(label))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional Property: Data Aggregation Consistency
   * 
   * For any aggregate result with multiple entries per date, the groupByDate
   * method should correctly sum all counts for each date.
   */
  describe('Property: Data Aggregation Consistency', () => {
    // Arbitrary for generating aggregate results
    const aggregateResultArbitrary = fc.array(
      fc.record({
        _id: fc.record({
          date: fc.date({
            min: new Date('2024-01-01'),
            max: new Date('2024-12-31')
          }).map(d => dayjs(d).format('YYYY-MM-DD')),
          actionId: fc.constantFrom('action1', 'action2', 'action3')
        }),
        count: fc.integer({ min: 0, max: 100 })
      }),
      { maxLength: 100 }
    );

    it('should correctly sum counts for each date', () => {
      fc.assert(
        fc.property(
          aggregateResultArbitrary,
          (aggregateResult) => {
            const grouped = service.groupByDate(aggregateResult);
            
            // Manually calculate expected sums
            const expected = new Map<string, number>();
            aggregateResult.forEach(item => {
              const date = item._id.date;
              expected.set(date, (expected.get(date) || 0) + item.count);
            });
            
            // Verify all dates match
            expect(grouped.size).toBe(expected.size);
            
            // Verify all sums match
            expected.forEach((expectedSum, date) => {
              expect(grouped.get(date)).toBe(expectedSum);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle duplicate dates with different actionIds', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 10 }),
          (date, counts) => {
            // Create multiple entries for same date with different actionIds
            const aggregateResult = counts.map((count, index) => ({
              _id: { date, actionId: `action${index}` },
              count
            }));
            
            const grouped = service.groupByDate(aggregateResult);
            
            // Should sum all counts for the date
            const expectedSum = counts.reduce((sum, count) => sum + count, 0);
            expect(grouped.get(date)).toBe(expectedSum);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional Property: Chart Dataset Color Consistency
   * 
   * For any number of datasets, colors should be assigned consistently
   * and cycle through the palette.
   */
  describe('Property: Chart Dataset Color Consistency', () => {
    it('should assign unique colors up to palette size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }), // Palette has 6 colors
          fc.array(fc.record({
            date: fc.date(),
            value: fc.integer({ min: 0, max: 100 })
          }), { minLength: 1, maxLength: 10 }),
          (numMetrics, data) => {
            const metrics = Array(numMetrics).fill('Metric').map((m, i) => `${m} ${i}`);
            const datasets = service.createChartDatasets(data, metrics);
            
            expect(datasets.length).toBe(numMetrics);
            
            // All datasets should have colors
            expect(datasets.every(ds => ds.borderColor && ds.backgroundColor)).toBe(true);
            
            // Colors should be unique within palette size
            const colors = datasets.map(ds => ds.borderColor);
            const uniqueColors = new Set(colors);
            expect(uniqueColors.size).toBe(Math.min(numMetrics, 6));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should cycle colors when exceeding palette size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 7, max: 20 }),
          (numMetrics) => {
            const data = [{ date: new Date(), value: 1 }];
            const metrics = Array(numMetrics).fill('Metric').map((m, i) => `${m} ${i}`);
            const datasets = service.createChartDatasets(data, metrics);
            
            // First and 7th dataset should have same color (palette size is 6)
            expect(datasets[0].borderColor).toBe(datasets[6].borderColor);
            
            // Second and 8th dataset should have same color
            if (numMetrics >= 8) {
              expect(datasets[1].borderColor).toBe(datasets[7].borderColor);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional Property: Multiple Dataset Creation
   * 
   * For any aggregate result with multiple actionIds, createMultipleDatasets
   * should create one dataset per unique actionId with complete date ranges.
   */
  describe('Property: Multiple Dataset Creation', () => {
    it('should create one dataset per unique actionId', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 90 }),
          fc.array(
            fc.constantFrom('completed', 'pending', 'in_progress', 'blocked'),
            { minLength: 1, maxLength: 4 }
          ),
          (period, actionIds) => {
            const uniqueActionIds = [...new Set(actionIds)];
            const today = dayjs().format('YYYY-MM-DD');
            
            // Create aggregate result with different actionIds
            const aggregateResult = uniqueActionIds.map(actionId => ({
              _id: { date: today, actionId },
              count: 5
            }));
            
            const datasets = service.createMultipleDatasets(aggregateResult, period);
            
            // Should have one dataset per unique actionId
            expect(datasets.length).toBe(uniqueActionIds.length);
            
            // Each dataset should have period + 1 data points
            expect(datasets.every(ds => ds.data.length === period + 1)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
