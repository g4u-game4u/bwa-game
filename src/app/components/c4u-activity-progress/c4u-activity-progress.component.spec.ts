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
    it('should display finalizadas and pontos metrics', () => {
      const activities: ActivityMetrics = {
        pendentes: 5,
        emExecucao: 3,
        finalizadas: 10,
        pontos: 150
      };
      component.activities = activities;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const metricValues = compiled.querySelectorAll('.metric-value');
      
      // Only finalizadas and pontos are displayed in the template
      expect(metricValues[0].textContent.trim()).toBe('10');
      expect(metricValues[1].textContent.trim()).toBe('150');
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
      const metricValues = compiled.querySelectorAll('.metric-value');
      
      metricValues.forEach((value: HTMLElement) => {
        expect(value.textContent?.trim()).toBe('0');
      });
    });

    it('should display activity labels correctly', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const labels = compiled.querySelectorAll('.metric-label');
      
      // Only Finalizadas and Pontos are displayed after Processos removal
      expect(labels[0].textContent.trim()).toBe('Finalizadas');
      expect(labels[1].textContent.trim()).toBe('Pontos');
    });
  });

  describe('processos section removal (Requirement 1.5)', () => {
    it('should NOT display Processos section in the template', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const titles = compiled.querySelectorAll('.section-title');
      
      // Only Tarefas section should exist
      expect(titles.length).toBe(1);
      expect(titles[0].textContent.trim()).toBe('Tarefas');
    });

    it('should NOT render any processos metrics in the template', () => {
      const processos: ProcessMetrics = {
        pendentes: 2,
        incompletas: 3,
        finalizadas: 8
      };
      component.processos = processos;
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const allText = compiled.textContent;
      
      // Processos-related labels should not appear
      expect(allText).not.toContain('Pendentes e Incompletos');
      expect(allText).not.toContain('Processos');
    });

    it('should keep processos @Input() for backward compatibility', () => {
      // The processos input should still exist and accept values
      const processos: ProcessMetrics = {
        pendentes: 5,
        incompletas: 3,
        finalizadas: 10
      };
      component.processos = processos;
      
      // Should not throw and values should be stored
      expect(component.processos.pendentes).toBe(5);
      expect(component.processos.incompletas).toBe(3);
      expect(component.processos.finalizadas).toBe(10);
    });
  });

  describe('section titles', () => {
    it('should display only Tarefas section title', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const titles = compiled.querySelectorAll('.section-title');
      
      expect(titles.length).toBe(1);
      expect(titles[0].textContent.trim()).toBe('Tarefas');
    });
  });

  describe('default values', () => {
    it('should have default activity values of 0', () => {
      expect(component.activities.pendentes).toBe(0);
      expect(component.activities.emExecucao).toBe(0);
      expect(component.activities.finalizadas).toBe(0);
      expect(component.activities.pontos).toBe(0);
    });

    it('should have default process values of 0 (backward compatibility)', () => {
      expect(component.processos.pendentes).toBe(0);
      expect(component.processos.incompletas).toBe(0);
      expect(component.processos.finalizadas).toBe(0);
    });
  });

  describe('card click events', () => {
    it('should emit cardClicked event when atividades-finalizadas is clicked', () => {
      spyOn(component.cardClicked, 'emit');
      fixture.detectChanges();
      
      const compiled = fixture.nativeElement;
      const finalizadasButton = compiled.querySelector('.metric-button');
      finalizadasButton.click();
      
      expect(component.cardClicked.emit).toHaveBeenCalledWith('atividades-finalizadas');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers in PT-BR format', () => {
      expect(component.formatNumber(1234)).toBe('1.234');
      expect(component.formatNumber(1000000)).toBe('1.000.000');
      expect(component.formatNumber(0)).toBe('0');
    });
  });
});
