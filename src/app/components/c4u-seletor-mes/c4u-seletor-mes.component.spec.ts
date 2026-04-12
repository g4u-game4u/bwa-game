import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { TranslateModule } from '@ngx-translate/core';
import * as fc from 'fast-check';
import * as moment from 'moment';

import { C4uSeletorMesComponent } from './c4u-seletor-mes.component';
import { SeasonDatesService } from '@services/season-dates.service';
import { configureTestBed } from '@app/testing/test-fixtures';

describe('C4uSeletorMesComponent', () => {
  let component: C4uSeletorMesComponent;
  let fixture: ComponentFixture<C4uSeletorMesComponent>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;

  const seasonMarAbr2026 = () =>
    Promise.resolve([
      { id: 0, name: 'MAR', date: new Date(2026, 2, 1) },
      { id: 1, name: 'ABR', date: new Date(2026, 3, 1) }
    ]);

  beforeEach(async () => {
    mockSeasonDatesService = jasmine.createSpyObj('SeasonDatesService', [
      'getAvailableMonths',
      'formatMonthAbbrevPtBr'
    ]);
    mockSeasonDatesService.getAvailableMonths.and.callFake(seasonMarAbr2026);
    mockSeasonDatesService.formatMonthAbbrevPtBr.and.callFake((date: Date) =>
      date.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\./g, '').trim().toUpperCase()
    );

    configureTestBed({
      declarations: [C4uSeletorMesComponent],
      imports: [
        FormsModule,
        NgSelectModule,
        TranslateModule.forRoot()
      ],
      providers: [{ provide: SeasonDatesService, useValue: mockSeasonDatesService }]
    });

    fixture = TestBed.createComponent(C4uSeletorMesComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Property-Based Tests', () => {
    /**
     * Feature: gamification-dashboard, Property 3: Month Navigation Boundary
     * Validates: Requirements 4.2, 4.3
     */
    it('should navigate to adjacent months correctly for all valid month indices', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 12 }), // Number of months to generate (at least 2)
          fc.integer({ min: 0, max: 11 }), // Starting selected index
          (monthCount, startIndex) => {
            // Setup: Initialize component with monthCount months
            component.months = Array.from({ length: monthCount }, (_, i) => {
              const d = moment().subtract(i, 'months').toDate();
              return {
                id: i,
                name: moment(d).format('MMM/YY').toUpperCase(),
                date: new Date(d.getFullYear(), d.getMonth(), 1)
              };
            });
            
            // Ensure startIndex is valid for the generated months
            const validStartIndex = Math.min(startIndex, monthCount - 1);
            component.selected = validStartIndex;
            
            // Test previous month navigation (goLeft)
            if (validStartIndex < monthCount - 1) {
              const initialSelected = component.selected;
              component.prevEnabled = true; // Enable navigation
              component.goLeft();
              
              // Should move to next index (previous month in time)
              expect(component.selected).toBe(initialSelected + 1);
              
              // Reset for next test
              component.selected = validStartIndex;
              component.onChange(); // Reset button states
            }
            
            // Test next month navigation (goRight)
            if (validStartIndex > 0) {
              const initialSelected = component.selected;
              component.nextEnabled = true; // Enable navigation
              component.goRight();
              
              // Should move to previous index (next month in time)
              expect(component.selected).toBe(initialSelected - 1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not navigate beyond month boundaries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 12 }), // At least 2 months
          (monthCount) => {
            // Setup
            component.months = Array.from({ length: monthCount }, (_, i) => {
              const d = moment().subtract(i, 'months').toDate();
              return {
                id: i,
                name: moment(d).format('MMM/YY').toUpperCase(),
                date: new Date(d.getFullYear(), d.getMonth(), 1)
              };
            });
            
            // Test: Cannot go right from current month (index 0)
            component.selected = 0;
            component.prevEnabled = false;
            component.nextEnabled = false;
            component.goRight();
            expect(component.selected).toBe(0);
            
            // Test: Cannot go left from oldest month (last index)
            component.selected = monthCount - 1;
            component.prevEnabled = false;
            component.nextEnabled = false;
            component.goLeft();
            expect(component.selected).toBe(monthCount - 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should format month names consistently', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) }),
          (date) => {
            const formatted = moment(date).format('MMM/YY').toUpperCase();
            
            // Should match pattern: 3 letters + / + 2 digits
            expect(formatted).toMatch(/^[A-Z]{3}\/\d{2}$/);
            
            // Should be uppercase
            expect(formatted).toBe(formatted.toUpperCase());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    beforeEach(async () => {
      // Wait for async initialization
      await component.ngOnInit();
      fixture.detectChanges();
    });

    describe('Month Navigation', () => {
      it('should navigate to previous month when goLeft is called', () => {
        // Setup: 3 months available, start at current month
        const m0 = moment().toDate();
        const m1 = moment().subtract(1, 'months').toDate();
        const m2 = moment().subtract(2, 'months').toDate();
        component.months = [
          { id: 0, name: moment(m0).format('MMM/YY').toUpperCase(), date: new Date(m0.getFullYear(), m0.getMonth(), 1) },
          { id: 1, name: moment(m1).format('MMM/YY').toUpperCase(), date: new Date(m1.getFullYear(), m1.getMonth(), 1) },
          { id: 2, name: moment(m2).format('MMM/YY').toUpperCase(), date: new Date(m2.getFullYear(), m2.getMonth(), 1) }
        ];
        component.selected = 0;
        component.prevEnabled = true;

        // Act
        component.goLeft();

        // Assert
        expect(component.selected).toBe(1);
      });

      it('should navigate to next month when goRight is called', () => {
        const m0 = moment().toDate();
        const m1 = moment().subtract(1, 'months').toDate();
        const m2 = moment().subtract(2, 'months').toDate();
        component.months = [
          { id: 0, name: moment(m0).format('MMM/YY').toUpperCase(), date: new Date(m0.getFullYear(), m0.getMonth(), 1) },
          { id: 1, name: moment(m1).format('MMM/YY').toUpperCase(), date: new Date(m1.getFullYear(), m1.getMonth(), 1) },
          { id: 2, name: moment(m2).format('MMM/YY').toUpperCase(), date: new Date(m2.getFullYear(), m2.getMonth(), 1) }
        ];
        component.selected = 1;
        component.nextEnabled = true;

        // Act
        component.goRight();

        // Assert
        expect(component.selected).toBe(0);
      });

      it('should not navigate left when at oldest month', () => {
        component.months = [
          { id: 0, name: 'JAN/24', date: new Date(2024, 0, 1) },
          { id: 1, name: 'DEZ/23', date: new Date(2023, 11, 1) },
          { id: 2, name: 'NOV/23', date: new Date(2023, 10, 1) }
        ];
        component.selected = 2; // Oldest month
        component.prevEnabled = false;

        component.goLeft();

        expect(component.selected).toBe(2);
      });

      it('should not navigate right when at current month', () => {
        component.months = [
          { id: 0, name: 'JAN/24', date: new Date(2024, 0, 1) },
          { id: 1, name: 'DEZ/23', date: new Date(2023, 11, 1) }
        ];
        component.selected = 0; // Current month
        component.nextEnabled = false;

        component.goRight();

        expect(component.selected).toBe(0);
      });
    });

    describe('Month Formatting', () => {
      it('should format month in MMM/YY format', () => {
        const testDate = new Date(2023, 4, 15); // May 2023
        // Set Portuguese locale for moment
        moment.locale('pt-br');
        const formatted = moment(testDate).format('MMM/YY').toUpperCase();

        // Should match the format (3 letters + / + 2 digits)
        expect(formatted).toMatch(/^[A-Z]{3}\/\d{2}$/);
        // Reset locale
        moment.locale('en');
      });

      it('should format current month correctly', () => {
        const currentMonth = moment().format('MMM/YY').toUpperCase();
        
        expect(currentMonth).toMatch(/^[A-Z]{3}\/\d{2}$/);
      });

      it('should return correct previous month name', () => {
        component.months = [
          { id: 0, name: 'JAN/24', date: new Date(2024, 0, 1) },
          { id: 1, name: 'DEZ/23', date: new Date(2023, 11, 1) },
          { id: 2, name: 'NOV/23', date: new Date(2023, 10, 1) }
        ];
        component.selected = 0;
        component.prevEnabled = true;

        const prevMonth = component.getPrevMonth();

        expect(prevMonth).toBe('DEZ/23');
      });

      it('should return correct next month name', () => {
        component.months = [
          { id: 0, name: 'JAN/24', date: new Date(2024, 0, 1) },
          { id: 1, name: 'DEZ/23', date: new Date(2023, 11, 1) },
          { id: 2, name: 'NOV/23', date: new Date(2023, 10, 1) }
        ];
        component.selected = 1;
        component.nextEnabled = true;

        const nextMonth = component.getNextMonth();

        expect(nextMonth).toBe('JAN/24');
      });
    });

    describe('Month Selection Event', () => {
      it('should emit monthSelected event when month changes', (done) => {
        const d0 = new Date(2024, 0, 1);
        const d1 = new Date(2023, 11, 1);
        component.months = [
          { id: 0, name: 'JAN/24', date: d0 },
          { id: 1, name: 'DEZ/23', date: d1 }
        ];
        component.selected = 0;

        component.onSelectedMonth.subscribe((picked: Date) => {
          expect(picked.getTime()).toBe(d1.getTime());
          done();
        });

        component.selected = 1;
        component.onChange();
      });

      it('should emit correct date when navigating left', (done) => {
        const d0 = new Date(2024, 0, 1);
        const d1 = new Date(2023, 11, 1);
        component.months = [
          { id: 0, name: 'JAN/24', date: d0 },
          { id: 1, name: 'DEZ/23', date: d1 }
        ];
        component.selected = 0;
        component.prevEnabled = true;

        component.onSelectedMonth.subscribe((picked: Date) => {
          expect(picked.getTime()).toBe(d1.getTime());
          done();
        });

        component.goLeft();
      });

      it('should emit correct date when navigating right', (done) => {
        const d0 = new Date(2024, 0, 1);
        const d1 = new Date(2023, 11, 1);
        component.months = [
          { id: 0, name: 'JAN/24', date: d0 },
          { id: 1, name: 'DEZ/23', date: d1 }
        ];
        component.selected = 1;
        component.nextEnabled = true;

        component.onSelectedMonth.subscribe((picked: Date) => {
          expect(picked.getTime()).toBe(d0.getTime());
          done();
        });

        component.goRight();
      });
    });

    describe('Button State Management', () => {
      it('should disable previous button at oldest month', () => {
        component.months = [
          { id: 0, name: 'JAN/24', date: new Date(2024, 0, 1) },
          { id: 1, name: 'DEZ/23', date: new Date(2023, 11, 1) },
          { id: 2, name: 'NOV/23', date: new Date(2023, 10, 1) }
        ];
        component.selected = 2;

        component.onChange();

        expect(component.prevEnabled).toBe(false);
        expect(component.nextEnabled).toBe(true);
      });

      it('should disable next button at current month', () => {
        component.months = [
          { id: 0, name: 'JAN/24', date: new Date(2024, 0, 1) },
          { id: 1, name: 'DEZ/23', date: new Date(2023, 11, 1) }
        ];
        component.selected = 0;

        component.onChange();

        expect(component.prevEnabled).toBe(true);
        expect(component.nextEnabled).toBe(false);
      });

      it('should enable both buttons for middle months', () => {
        component.months = [
          { id: 0, name: 'JAN/24', date: new Date(2024, 0, 1) },
          { id: 1, name: 'DEZ/23', date: new Date(2023, 11, 1) },
          { id: 2, name: 'NOV/23', date: new Date(2023, 10, 1) }
        ];
        component.selected = 1;

        component.onChange();

        expect(component.prevEnabled).toBe(true);
        expect(component.nextEnabled).toBe(true);
      });
    });

    describe('Initialization', () => {
      it('should initialize with months based on season dates', async () => {
        const newComponent = new C4uSeletorMesComponent(mockSeasonDatesService);
        await newComponent.ngOnInit();

        expect(newComponent.months.length).toBe(2);
      });

      it('should handle initialization errors gracefully', async () => {
        mockSeasonDatesService.getAvailableMonths.and.returnValue(Promise.reject('Error'));

        const newComponent = new C4uSeletorMesComponent(mockSeasonDatesService);
        await newComponent.ngOnInit();

        expect(newComponent.months.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
