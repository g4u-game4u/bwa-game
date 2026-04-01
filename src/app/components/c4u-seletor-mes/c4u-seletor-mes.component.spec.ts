import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { TranslateModule } from '@ngx-translate/core';
import * as fc from 'fast-check';
import * as moment from 'moment';

import { C4uSeletorMesComponent } from './c4u-seletor-mes.component';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { SeasonDatesService } from '@services/season-dates.service';
import { configureTestBed } from '@app/testing/test-fixtures';

describe('C4uSeletorMesComponent', () => {
  let component: C4uSeletorMesComponent;
  let fixture: ComponentFixture<C4uSeletorMesComponent>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;

  beforeEach(async () => {
    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', ['isAdmin']);
    mockSeasonDatesService = jasmine.createSpyObj('SeasonDatesService', ['getMonthsSinceSeasonStart']);
    
    // Default mock behavior
    mockSessaoProvider.isAdmin.and.returnValue(false);
    mockSeasonDatesService.getMonthsSinceSeasonStart.and.returnValue(Promise.resolve(3));

    configureTestBed({
      declarations: [C4uSeletorMesComponent],
      imports: [
        FormsModule,
        NgSelectModule,
        TranslateModule.forRoot()
      ],
      providers: [
        { provide: SessaoProvider, useValue: mockSessaoProvider },
        { provide: SeasonDatesService, useValue: mockSeasonDatesService }
      ]
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
            component.months = Array.from({ length: monthCount }, (_, i) => ({
              id: i,
              name: moment().subtract(i, 'months').format('MMM/YY').toUpperCase()
            }));
            
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
            component.months = Array.from({ length: monthCount }, (_, i) => ({
              id: i,
              name: moment().subtract(i, 'months').format('MMM/YY').toUpperCase()
            }));
            
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
        component.months = [
          { id: 0, name: moment().format('MMM/YY').toUpperCase() },
          { id: 1, name: moment().subtract(1, 'months').format('MMM/YY').toUpperCase() },
          { id: 2, name: moment().subtract(2, 'months').format('MMM/YY').toUpperCase() }
        ];
        component.selected = 0;
        component.prevEnabled = true;

        // Act
        component.goLeft();

        // Assert
        expect(component.selected).toBe(1);
      });

      it('should navigate to next month when goRight is called', () => {
        // Setup: Start at previous month
        component.months = [
          { id: 0, name: moment().format('MMM/YY').toUpperCase() },
          { id: 1, name: moment().subtract(1, 'months').format('MMM/YY').toUpperCase() },
          { id: 2, name: moment().subtract(2, 'months').format('MMM/YY').toUpperCase() }
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
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' },
          { id: 2, name: 'NOV/23' }
        ];
        component.selected = 2; // Oldest month
        component.prevEnabled = false;

        component.goLeft();

        expect(component.selected).toBe(2);
      });

      it('should not navigate right when at current month', () => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' }
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
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' },
          { id: 2, name: 'NOV/23' }
        ];
        component.selected = 0;
        component.prevEnabled = true;

        const prevMonth = component.getPrevMonth();

        expect(prevMonth).toBe('DEZ/23');
      });

      it('should return correct next month name', () => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' },
          { id: 2, name: 'NOV/23' }
        ];
        component.selected = 1;
        component.nextEnabled = true;

        const nextMonth = component.getNextMonth();

        expect(nextMonth).toBe('JAN/24');
      });
    });

    describe('Month Selection Event', () => {
      it('should emit monthSelected event when month changes', (done) => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' }
        ];
        component.selected = 0;

        component.onSelectedMonth.subscribe((selectedIndex: number) => {
          expect(selectedIndex).toBe(1);
          done();
        });

        component.selected = 1;
        component.onChange();
      });

      it('should emit correct index when navigating left', (done) => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' }
        ];
        component.selected = 0;
        component.prevEnabled = true;

        component.onSelectedMonth.subscribe((selectedIndex: number) => {
          expect(selectedIndex).toBe(1);
          done();
        });

        component.goLeft();
      });

      it('should emit correct index when navigating right', (done) => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' }
        ];
        component.selected = 1;
        component.nextEnabled = true;

        component.onSelectedMonth.subscribe((selectedIndex: number) => {
          expect(selectedIndex).toBe(0);
          done();
        });

        component.goRight();
      });
    });

    describe('Button State Management', () => {
      it('should disable previous button at oldest month', () => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' },
          { id: 2, name: 'NOV/23' }
        ];
        component.selected = 2;

        component.onChange();

        expect(component.prevEnabled).toBe(false);
        expect(component.nextEnabled).toBe(true);
      });

      it('should disable next button at current month', () => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' }
        ];
        component.selected = 0;

        component.onChange();

        expect(component.prevEnabled).toBe(true);
        expect(component.nextEnabled).toBe(false);
      });

      it('should enable both buttons for middle months', () => {
        component.months = [
          { id: 0, name: 'JAN/24' },
          { id: 1, name: 'DEZ/23' },
          { id: 2, name: 'NOV/23' }
        ];
        component.selected = 1;

        component.onChange();

        expect(component.prevEnabled).toBe(true);
        expect(component.nextEnabled).toBe(true);
      });
    });

    describe('Initialization', () => {
      it('should initialize with months based on season dates', async () => {
        mockSeasonDatesService.getMonthsSinceSeasonStart.and.returnValue(Promise.resolve(3));
        
        const newComponent = new C4uSeletorMesComponent(mockSessaoProvider, mockSeasonDatesService);
        await newComponent.ngOnInit();

        expect(newComponent.months.length).toBe(3);
      });

      it('should show 6 months for admin users', async () => {
        mockSessaoProvider.isAdmin.and.returnValue(true);
        
        const newComponent = new C4uSeletorMesComponent(mockSessaoProvider, mockSeasonDatesService);
        await newComponent.ngOnInit();

        expect(newComponent.months.length).toBe(6);
      });

      it('should handle initialization errors gracefully', async () => {
        mockSeasonDatesService.getMonthsSinceSeasonStart.and.returnValue(Promise.reject('Error'));
        
        const newComponent = new C4uSeletorMesComponent(mockSessaoProvider, mockSeasonDatesService);
        await newComponent.ngOnInit();

        // Should fallback to at least 1 month
        expect(newComponent.months.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
