import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { C4uTimePeriodSelectorComponent } from './c4u-time-period-selector.component';

describe('C4uTimePeriodSelectorComponent', () => {
  let component: C4uTimePeriodSelectorComponent;
  let fixture: ComponentFixture<C4uTimePeriodSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uTimePeriodSelectorComponent],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uTimePeriodSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Period Options Display', () => {
    it('should display all period options in dropdown', () => {
      const periods = [7, 15, 30, 60, 90];
      component.periods = periods;
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select');
      const options = select.querySelectorAll('option');

      expect(options.length).toBe(5);
      expect(options[0].textContent.trim()).toBe('Mostrar os últimos 7 dias');
      expect(options[1].textContent.trim()).toBe('Mostrar os últimos 15 dias');
      expect(options[2].textContent.trim()).toBe('Mostrar os últimos 30 dias');
      expect(options[3].textContent.trim()).toBe('Mostrar os últimos 60 dias');
      expect(options[4].textContent.trim()).toBe('Mostrar os últimos 90 dias');
    });

    it('should display custom period options', () => {
      const customPeriods = [14, 21, 45];
      component.periods = customPeriods;
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select');
      const options = select.querySelectorAll('option');

      expect(options.length).toBe(3);
      expect(options[0].textContent.trim()).toBe('Mostrar os últimos 14 dias');
      expect(options[1].textContent.trim()).toBe('Mostrar os últimos 21 dias');
      expect(options[2].textContent.trim()).toBe('Mostrar os últimos 45 dias');
    });
  });

  describe('Period Selection', () => {
    it('should emit correct value when period is selected', (done) => {
      component.periods = [7, 15, 30, 60, 90];
      component.selectedPeriod = 30;
      fixture.detectChanges();

      component.periodSelected.subscribe((period: number) => {
        expect(period).toBe(60);
        done();
      });

      const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
      select.value = '60';
      select.dispatchEvent(new Event('change'));
    });

    it('should update selectedPeriod when period changes', () => {
      component.periods = [7, 15, 30, 60, 90];
      component.selectedPeriod = 30;
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
      select.value = '90';
      select.dispatchEvent(new Event('change'));

      expect(component.selectedPeriod).toBe(90);
    });

    it('should emit number type not string', (done) => {
      component.periods = [7, 15, 30];
      fixture.detectChanges();

      component.periodSelected.subscribe((period: number) => {
        expect(typeof period).toBe('number');
        expect(period).toBe(15);
        done();
      });

      const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
      select.value = '15';
      select.dispatchEvent(new Event('change'));
    });
  });

  describe('Period Formatting', () => {
    it('should format period in Portuguese with correct text', () => {
      component.periods = [7];
      fixture.detectChanges();

      const option = fixture.nativeElement.querySelector('option');
      expect(option.textContent.trim()).toBe('Mostrar os últimos 7 dias');
    });

    it('should use "dias" (plural) for all period values', () => {
      component.periods = [1, 7, 30];
      fixture.detectChanges();

      const options = fixture.nativeElement.querySelectorAll('option');
      expect(options[0].textContent.trim()).toBe('Mostrar os últimos 1 dias');
      expect(options[1].textContent.trim()).toBe('Mostrar os últimos 7 dias');
      expect(options[2].textContent.trim()).toBe('Mostrar os últimos 30 dias');
    });
  });

  describe('Default Period Selection', () => {
    it('should use default period of 30 days', () => {
      expect(component.selectedPeriod).toBe(30);
    });

    it('should use custom default period when provided', () => {
      component.selectedPeriod = 60;
      fixture.detectChanges();

      expect(component.selectedPeriod).toBe(60);
    });

    it('should display selected period in dropdown', () => {
      component.periods = [7, 15, 30, 60, 90];
      component.selectedPeriod = 60;
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
      expect(Number(select.value)).toBe(60);
    });
  });

  describe('Component Initialization', () => {
    it('should initialize with default periods array', () => {
      expect(component.periods).toEqual([7, 15, 30, 60, 90]);
    });

    it('should accept custom periods array', () => {
      const customPeriods = [10, 20, 40];
      component.periods = customPeriods;
      fixture.detectChanges();

      expect(component.periods).toEqual(customPeriods);
    });

    it('should have proper ARIA label for accessibility', () => {
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select');
      expect(select.getAttribute('aria-label')).toBe('Selecionar período de tempo');
    });

    it('should have proper label element', () => {
      fixture.detectChanges();

      const label = fixture.nativeElement.querySelector('label');
      expect(label).toBeTruthy();
      expect(label.textContent.trim()).toBe('Período');
      expect(label.getAttribute('for')).toBe('period-select');
    });
  });

  describe('Styling and CSS Classes', () => {
    it('should have correct CSS classes applied', () => {
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.time-period-selector');
      expect(container).toBeTruthy();

      const select = fixture.nativeElement.querySelector('.period-select');
      expect(select).toBeTruthy();
      expect(select.classList.contains('form-select')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty periods array', () => {
      component.periods = [];
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select');
      const options = select.querySelectorAll('option');

      expect(options.length).toBe(0);
    });

    it('should handle single period option', () => {
      component.periods = [30];
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select');
      const options = select.querySelectorAll('option');

      expect(options.length).toBe(1);
      expect(options[0].textContent.trim()).toBe('Mostrar os últimos 30 dias');
    });

    it('should handle large period values', () => {
      component.periods = [365, 730];
      fixture.detectChanges();

      const options = fixture.nativeElement.querySelectorAll('option');
      expect(options[0].textContent.trim()).toBe('Mostrar os últimos 365 dias');
      expect(options[1].textContent.trim()).toBe('Mostrar os últimos 730 dias');
    });
  });
});
