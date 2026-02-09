import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uActivityProgressComponent } from './c4u-activity-progress.component';
import { ActivityMetrics, ProcessMetrics } from '@model/gamification-dashboard.model';

describe('C4uActivityProgressComponent', () => {
  let component: C4uActivityProgressComponent;
  let fixture: ComponentFixture<C4uActivityProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uActivityProgressComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uActivityProgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('activity metrics display', () => {
    it('should display all activity metrics', () => {
      const activities: ActivityMetrics = {
        pendentes: 5,
        emExecucao: 3,
        finalizadas: 10,
        pontos: 150
      };
      component.activities = activities;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const metricValues = compiled.querySelectorAll('.section:first-child .metric-value');
      
      expect(metricValues[0].textContent.trim()).toBe('5');
      expect(metricValues[1].textContent.trim()).toBe('3');
      expect(metricValues[2].textContent.trim()).toBe('10');
      expect(metricValues[3].textContent.trim()).toBe('150');
    });

    it('should display zero values correctly', () => {
      const activities: ActivityMetrics = {
        pendentes: 0,
        emExecucao: 0,
        finalizadas: 0,
        pontos: 0
      };
      component.activities = activities;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const metricValues = compiled.querySelectorAll('.section:first-child .metric-value');
      
      metricValues.forEach((value: HTMLElement) => {
        expect(value.textContent?.trim()).toBe('0');
      });
    });

    it('should display activity labels correctly', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const labels = compiled.querySelectorAll('.section:first-child .metric-label');
      
      expect(labels[0].textContent.trim()).toBe('Pendentes');
      expect(labels[1].textContent.trim()).toBe('Em execução');
      expect(labels[2].textContent.trim()).toBe('Finalizadas');
      expect(labels[3].textContent.trim()).toBe('Pontos');
    });
  });

  describe('process metrics display', () => {
    it('should display all process metrics', () => {
      const processos: ProcessMetrics = {
        pendentes: 2,
        incompletas: 3,
        finalizadas: 8
      };
      component.processos = processos;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const metricValues = compiled.querySelectorAll('.section:last-child .metric-value');
      
      expect(metricValues[0].textContent.trim()).toBe('5'); // pendentes + incompletas
      expect(metricValues[1].textContent.trim()).toBe('8');
    });

    it('should sum pendentes and incompletas correctly', () => {
      const processos: ProcessMetrics = {
        pendentes: 7,
        incompletas: 4,
        finalizadas: 12
      };
      component.processos = processos;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const firstMetricValue = compiled.querySelector('.section:last-child .metric-value');
      
      expect(firstMetricValue.textContent.trim()).toBe('11');
    });

    it('should display zero values correctly', () => {
      const processos: ProcessMetrics = {
        pendentes: 0,
        incompletas: 0,
        finalizadas: 0
      };
      component.processos = processos;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const metricValues = compiled.querySelectorAll('.section:last-child .metric-value');
      
      expect(metricValues[0].textContent.trim()).toBe('0');
      expect(metricValues[1].textContent.trim()).toBe('0');
    });

    it('should display process labels correctly', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const labels = compiled.querySelectorAll('.section:last-child .metric-label');
      
      expect(labels[0].textContent.trim()).toBe('Pendentes e Incompletos');
      expect(labels[1].textContent.trim()).toBe('Finalizados');
    });
  });

  describe('section titles', () => {
    it('should display section titles', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const titles = compiled.querySelectorAll('.section-title');
      
      expect(titles[0].textContent.trim()).toBe('Tarefas');
      expect(titles[1].textContent.trim()).toBe('Processos');
    });
  });

  describe('default values', () => {
    it('should have default activity values of 0', () => {
      expect(component.activities.pendentes).toBe(0);
      expect(component.activities.emExecucao).toBe(0);
      expect(component.activities.finalizadas).toBe(0);
      expect(component.activities.pontos).toBe(0);
    });

    it('should have default process values of 0', () => {
      expect(component.processos.pendentes).toBe(0);
      expect(component.processos.incompletas).toBe(0);
      expect(component.processos.finalizadas).toBe(0);
    });
  });
});
