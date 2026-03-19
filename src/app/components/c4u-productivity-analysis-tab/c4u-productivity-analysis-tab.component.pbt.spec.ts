import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uProductivityAnalysisTabComponent } from './c4u-productivity-analysis-tab.component';
import { C4uTimePeriodSelectorComponent } from '../c4u-time-period-selector/c4u-time-period-selector.component';
import { C4uGraficoLinhasComponent } from '../c4u-grafico-linhas/c4u-grafico-linhas.component';
import { C4uGraficoBarrasComponent } from '../c4u-grafico-barras/c4u-grafico-barras.component';
import { FormsModule } from '@angular/forms';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for ProductivityAnalysisTabComponent
 * 
 * These tests verify universal properties that should hold true for all
 * possible inputs and state transitions.
 */
describe('C4uProductivityAnalysisTabComponent - Property-Based Tests', () => {
  let component: C4uProductivityAnalysisTabComponent;
  let fixture: ComponentFixture<C4uProductivityAnalysisTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        C4uProductivityAnalysisTabComponent,
        C4uTimePeriodSelectorComponent,
        C4uGraficoLinhasComponent,
        C4uGraficoBarrasComponent
      ],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uProductivityAnalysisTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /**
   * Property 7: Chart Type Toggle Preservation
   * **Validates: Requirements 8.3, 16.3**
   * 
   * For any chart type selection (line or bar), switching between tabs or
   * refreshing data should preserve the selected chart type.
   * 
   * This property ensures that user preferences are maintained across
   * different operations, providing a consistent user experience.
   */
  describe('Property 7: Chart Type Toggle Preservation', () => {
    it('should preserve chart type across data refreshes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          fc.array(fc.record({
            date: fc.date(),
            value: fc.integer({ min: 0, max: 1000 })
          }), { minLength: 1, maxLength: 90 }),
          fc.integer({ min: 1, max: 10 }), // number of refreshes
          (chartType, graphData, refreshCount) => {
            // Set initial chart type
            component.chartType = chartType;
            fixture.detectChanges();

            // Verify initial state
            expect(component.chartType).toBe(chartType);

            // Simulate multiple data refreshes
            for (let i = 0; i < refreshCount; i++) {
              component.graphData = [...graphData];
              fixture.detectChanges();
            }

            // Chart type should remain unchanged after refreshes
            expect(component.chartType).toBe(chartType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve chart type when period changes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          fc.array(fc.constantFrom(7, 15, 30, 60, 90), { minLength: 2, maxLength: 5 }),
          (chartType, periods) => {
            // Set initial chart type
            component.chartType = chartType;
            fixture.detectChanges();

            // Change periods multiple times
            periods.forEach(period => {
              component.onPeriodChange(period);
              fixture.detectChanges();
            });

            // Chart type should remain unchanged after period changes
            expect(component.chartType).toBe(chartType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve chart type across toggle operations', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          fc.integer({ min: 1, max: 20 }), // number of toggles
          (initialChartType, toggleCount) => {
            // Set initial chart type
            component.chartType = initialChartType;
            fixture.detectChanges();

            // Perform multiple toggles
            for (let i = 0; i < toggleCount; i++) {
              component.toggleChartType();
              fixture.detectChanges();
            }

            // After even number of toggles, should return to initial type
            // After odd number of toggles, should be opposite type
            const expectedType = toggleCount % 2 === 0 
              ? initialChartType 
              : (initialChartType === 'line' ? 'bar' : 'line');
            
            expect(component.chartType).toBe(expectedType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should emit correct chart type on toggle', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          (initialChartType) => {
            // Set initial chart type
            component.chartType = initialChartType;
            fixture.detectChanges();

            // Track emitted values
            const emittedValues: ('line' | 'bar')[] = [];
            component.chartTypeChanged.subscribe(type => {
              emittedValues.push(type);
            });

            // Toggle chart type
            component.toggleChartType();
            fixture.detectChanges();

            // Should emit the new chart type
            const expectedType = initialChartType === 'line' ? 'bar' : 'line';
            expect(emittedValues.length).toBe(1);
            expect(emittedValues[0]).toBe(expectedType);
            expect(component.chartType).toBe(expectedType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain chart type consistency with loading state', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          fc.boolean(),
          (chartType, isLoading) => {
            // Set chart type and loading state
            component.chartType = chartType;
            component.isLoading = isLoading;
            fixture.detectChanges();

            // Chart type should be independent of loading state
            expect(component.chartType).toBe(chartType);
            expect(component.isLoading).toBe(isLoading);

            // Toggle loading state
            component.isLoading = !isLoading;
            fixture.detectChanges();

            // Chart type should remain unchanged
            expect(component.chartType).toBe(chartType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve chart type with empty data', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          (chartType) => {
            // Set chart type with empty data
            component.chartType = chartType;
            component.graphData = [];
            fixture.detectChanges();

            // Chart type should be preserved even with empty data
            expect(component.chartType).toBe(chartType);
            expect(component.graphData.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve chart type across component lifecycle', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          fc.array(fc.record({
            date: fc.date(),
            value: fc.integer({ min: 0, max: 1000 })
          }), { minLength: 1, maxLength: 30 }),
          (chartType, graphData) => {
            // Set initial state
            component.chartType = chartType;
            component.graphData = graphData;
            fixture.detectChanges();

            // Simulate ngOnInit
            component.ngOnInit();
            fixture.detectChanges();

            // Chart type should be preserved after initialization
            expect(component.chartType).toBe(chartType);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Chart type toggle is bijective
   * 
   * Toggling twice should always return to the original state.
   * This ensures the toggle operation is reversible.
   */
  describe('Chart Type Toggle Bijectivity', () => {
    it('should return to original type after two toggles', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('line' as const, 'bar' as const),
          (initialType) => {
            component.chartType = initialType;
            fixture.detectChanges();

            // Toggle twice
            component.toggleChartType();
            component.toggleChartType();
            fixture.detectChanges();

            // Should return to initial type
            expect(component.chartType).toBe(initialType);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Chart type is always valid
   * 
   * The chart type should always be either 'line' or 'bar', never undefined
   * or any other value.
   */
  describe('Chart Type Validity', () => {
    it('should always have a valid chart type', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // arbitrary operations
          (operations) => {
            // Perform random operations
            for (let i = 0; i < operations; i++) {
              if (i % 2 === 0) {
                component.toggleChartType();
              } else {
                component.onPeriodChange(30);
              }
              fixture.detectChanges();
            }

            // Chart type should always be valid
            expect(['line', 'bar']).toContain(component.chartType);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
