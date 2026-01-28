import { TestBed } from '@angular/core/testing';
import { GraphDataProcessorService } from './graph-data-processor.service';
import * as dayjs from 'dayjs';

describe('GraphDataProcessorService', () => {
  let service: GraphDataProcessorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GraphDataProcessorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('groupByDate', () => {
    it('should group data by date and sum counts', () => {
      const data = [
        { _id: { date: '2024-01-15', actionId: 'action1' }, count: 5 },
        { _id: { date: '2024-01-15', actionId: 'action2' }, count: 3 },
        { _id: { date: '2024-01-16', actionId: 'action1' }, count: 2 }
      ];

      const result = service.groupByDate(data);

      expect(result.get('2024-01-15')).toBe(8);
      expect(result.get('2024-01-16')).toBe(2);
    });

    it('should handle empty array', () => {
      const result = service.groupByDate([]);
      expect(result.size).toBe(0);
    });

    it('should handle null or undefined data', () => {
      const result1 = service.groupByDate(null as any);
      const result2 = service.groupByDate(undefined as any);
      
      expect(result1.size).toBe(0);
      expect(result2.size).toBe(0);
    });

    it('should handle items with missing count', () => {
      const data = [
        { _id: { date: '2024-01-15', actionId: 'action1' } }
      ];

      const result = service.groupByDate(data);
      expect(result.get('2024-01-15')).toBe(0);
    });
  });

  describe('fillMissingDates', () => {
    it('should fill all dates in range with data or zeros', () => {
      const data = new Map([
        ['2024-01-15', 5],
        ['2024-01-17', 3]
      ]);
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-17');

      const result = service.fillMissingDates(data, startDate, endDate);

      expect(result.length).toBe(3);
      expect(result[0].value).toBe(5); // 2024-01-15
      expect(result[1].value).toBe(0); // 2024-01-16 (missing)
      expect(result[2].value).toBe(3); // 2024-01-17
    });

    it('should create correct date objects', () => {
      const data = new Map([['2024-01-15', 5]]);
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-15');

      const result = service.fillMissingDates(data, startDate, endDate);

      expect(result.length).toBe(1);
      expect(result[0].date).toBeInstanceOf(Date);
      expect(dayjs(result[0].date).format('YYYY-MM-DD')).toBe('2024-01-15');
    });

    it('should handle empty data map', () => {
      const data = new Map<string, number>();
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-17');

      const result = service.fillMissingDates(data, startDate, endDate);

      expect(result.length).toBe(3);
      expect(result.every(point => point.value === 0)).toBe(true);
    });

    it('should handle single day range', () => {
      const data = new Map([['2024-01-15', 10]]);
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-15');

      const result = service.fillMissingDates(data, startDate, endDate);

      expect(result.length).toBe(1);
      expect(result[0].value).toBe(10);
    });
  });

  describe('processGraphData', () => {
    it('should process aggregate result and fill missing dates', () => {
      const aggregateResult = [
        { _id: { date: dayjs().format('YYYY-MM-DD'), actionId: 'action1' }, count: 5 }
      ];
      const period = 7;

      const result = service.processGraphData(aggregateResult, period);

      // Should have period + 1 days (inclusive)
      expect(result.length).toBe(period + 1);
      expect(result.every(point => point.date instanceof Date)).toBe(true);
      expect(result.every(point => typeof point.value === 'number')).toBe(true);
    });

    it('should handle empty aggregate result', () => {
      const result = service.processGraphData([], 7);

      expect(result.length).toBe(8); // 7 days + today
      expect(result.every(point => point.value === 0)).toBe(true);
    });
  });

  describe('createChartDatasets', () => {
    it('should create Chart.js dataset with correct structure', () => {
      const data = [
        { date: new Date('2024-01-15'), value: 5 },
        { date: new Date('2024-01-16'), value: 3 }
      ];
      const metrics = ['Completed Tasks'];

      const result = service.createChartDatasets(data, metrics);

      expect(result.length).toBe(1);
      expect(result[0].label).toBe('Completed Tasks');
      expect(result[0].data).toEqual([5, 3]);
      expect(result[0].borderColor).toBeDefined();
      expect(result[0].backgroundColor).toBeDefined();
      expect(result[0].fill).toBe(false);
    });

    it('should create multiple datasets with different colors', () => {
      const data = [
        { date: new Date('2024-01-15'), value: 5 }
      ];
      const metrics = ['Metric 1', 'Metric 2', 'Metric 3'];

      const result = service.createChartDatasets(data, metrics);

      expect(result.length).toBe(3);
      expect(result[0].borderColor).not.toBe(result[1].borderColor);
      expect(result[1].borderColor).not.toBe(result[2].borderColor);
    });

    it('should handle empty data array', () => {
      const result = service.createChartDatasets([], ['Metric']);

      expect(result.length).toBe(1);
      expect(result[0].data).toEqual([]);
    });
  });

  describe('createMultipleDatasets', () => {
    it('should create separate datasets for each actionId', () => {
      const aggregateResult = [
        { _id: { date: dayjs().format('YYYY-MM-DD'), actionId: 'completed' }, count: 5 },
        { _id: { date: dayjs().format('YYYY-MM-DD'), actionId: 'pending' }, count: 2 }
      ];
      const period = 7;

      const result = service.createMultipleDatasets(aggregateResult, period);

      expect(result.length).toBe(2);
      expect(result.some(ds => ds.label.includes('Completed'))).toBe(true);
      expect(result.some(ds => ds.label.includes('Pending'))).toBe(true);
    });

    it('should fill missing dates for each dataset', () => {
      const aggregateResult = [
        { _id: { date: dayjs().format('YYYY-MM-DD'), actionId: 'completed' }, count: 5 }
      ];
      const period = 7;

      const result = service.createMultipleDatasets(aggregateResult, period);

      expect(result.length).toBe(1);
      expect(result[0].data.length).toBe(period + 1);
    });

    it('should handle empty aggregate result', () => {
      const result = service.createMultipleDatasets([], 7);
      expect(result.length).toBe(0);
    });
  });

  describe('getDateLabels', () => {
    it('should generate date labels for specified period', () => {
      const period = 7;
      const result = service.getDateLabels(period);

      expect(result.length).toBe(period + 1);
      expect(result.every(label => /^\d{2}\/\d{2}$/.test(label))).toBe(true);
    });

    it('should use custom format when provided', () => {
      const period = 3;
      const result = service.getDateLabels(period, 'YYYY-MM-DD');

      expect(result.length).toBe(period + 1);
      expect(result.every(label => /^\d{4}-\d{2}-\d{2}$/.test(label))).toBe(true);
    });

    it('should generate labels in chronological order', () => {
      const result = service.getDateLabels(3, 'YYYY-MM-DD');
      
      for (let i = 1; i < result.length; i++) {
        const prev = dayjs(result[i - 1]);
        const curr = dayjs(result[i]);
        expect(curr.isAfter(prev)).toBe(true);
      }
    });
  });

  describe('color palette', () => {
    it('should cycle through colors when index exceeds palette size', () => {
      const data = [{ date: new Date(), value: 1 }];
      const metrics = Array(10).fill('Metric').map((m, i) => `${m} ${i}`);

      const result = service.createChartDatasets(data, metrics);

      // Should have 10 datasets with colors cycling through palette
      expect(result.length).toBe(10);
      expect(result[0].borderColor).toBe(result[6].borderColor); // Palette has 6 colors
    });
  });

  describe('edge cases', () => {
    it('should handle aggregate result with different date formats', () => {
      const aggregateResult = [
        { _id: { date: '2024-01-15', actionId: 'action1' }, count: 5 },
        { _id: { date: new Date('2024-01-15'), actionId: 'action2' }, count: 3 }
      ];

      const grouped = service.groupByDate(aggregateResult);
      expect(grouped.get('2024-01-15')).toBe(8);
    });

    it('should handle very large periods', () => {
      const result = service.processGraphData([], 365);
      expect(result.length).toBe(366); // 365 days + today
    });

    it('should handle zero period', () => {
      const result = service.processGraphData([], 0);
      expect(result.length).toBe(1); // Just today
    });
  });
});
