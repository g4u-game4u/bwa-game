import { ComponentFixture, TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { C4uSeasonProgressComponent } from './c4u-season-progress.component';
import { SeasonProgress } from '@model/gamification-dashboard.model';

registerLocaleData(localePt, 'pt-BR');

describe('C4uSeasonProgressComponent', () => {
  let component: C4uSeasonProgressComponent;
  let fixture: ComponentFixture<C4uSeasonProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uSeasonProgressComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uSeasonProgressComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display clientes count correctly', () => {
    component.progress = {
      metas: { current: 0, target: 0 },
      clientes: 25,
      tarefasFinalizadas: 0,
      seasonDates: {
        start: new Date('2023-04-11'),
        end: new Date('2023-09-30')
      }
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metricValues = compiled.querySelectorAll('.value');
    const clientesValue = metricValues[0]?.textContent?.trim();

    expect(clientesValue).toBe('25');
  });

  it('should display tarefas finalizadas correctly', () => {
    component.progress = {
      metas: { current: 0, target: 0 },
      clientes: 0,
      tarefasFinalizadas: 150,
      seasonDates: {
        start: new Date('2023-04-11'),
        end: new Date('2023-09-30')
      }
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metricValues = compiled.querySelectorAll('.value');
    const tarefasValue = metricValues[1]?.textContent?.trim();

    expect(tarefasValue).toBe('150');
  });

  it('should format season date range correctly', () => {
    const startDate = new Date(2023, 3, 11); // April 11, 2023 (month is 0-indexed)
    const endDate = new Date(2023, 8, 30); // September 30, 2023
    
    component.progress = {
      metas: { current: 0, target: 0 },
      clientes: 0,
      tarefasFinalizadas: 0,
      seasonDates: {
        start: startDate,
        end: endDate
      }
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const seasonDates = compiled.querySelector('.season-dates');
    
    expect(seasonDates?.textContent?.trim()).toBe('11/4/23 a 30/9/23');
  });

  it('should display metric rows (sem linha Metas)', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('.progress-row');

    expect(rows.length).toBe(2);
  });

  it('should display correct metric labels', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metricLabels = compiled.querySelectorAll('.label');

    expect(metricLabels[0]?.textContent?.trim()).toBe('Clientes');
    expect(metricLabels[1]?.textContent?.trim()).toBe('Tarefas Finalizadas');
  });

  it('should display progress title', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const title = compiled.querySelector('.progress-title');
    
    expect(title?.textContent?.trim()).toBe('Progresso da Temporada');
  });

  it('should handle zero values correctly', () => {
    component.progress = {
      metas: { current: 0, target: 0 },
      clientes: 0,
      tarefasFinalizadas: 0,
      seasonDates: {
        start: new Date('2023-01-01'),
        end: new Date('2023-12-31')
      }
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metricValues = compiled.querySelectorAll('.value');

    expect(metricValues[0]?.textContent?.trim()).toBe('0');
    expect(metricValues[1]?.textContent?.trim()).toBe('0');
  });

  it('should format dates with single digit day and month correctly', () => {
    const startDate = new Date(2023, 0, 5); // January 5, 2023 (month is 0-indexed)
    const endDate = new Date(2023, 2, 9); // March 9, 2023
    
    component.progress = {
      metas: { current: 0, target: 0 },
      clientes: 0,
      tarefasFinalizadas: 0,
      seasonDates: {
        start: startDate,
        end: endDate
      }
    };

    const dateRange = component.seasonDateRange;
    expect(dateRange).toBe('5/1/23 a 9/3/23');
  });

  it('should handle large numbers correctly', () => {
    component.progress = {
      metas: { current: 999, target: 1000 },
      clientes: 5000,
      tarefasFinalizadas: 10000,
      seasonDates: {
        start: new Date('2023-01-01'),
        end: new Date('2023-12-31')
      }
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metricValues = compiled.querySelectorAll('.value');

    expect(metricValues[0]?.textContent).toBeTruthy();
    expect(metricValues[1]?.textContent).toBeTruthy();
  });
});
