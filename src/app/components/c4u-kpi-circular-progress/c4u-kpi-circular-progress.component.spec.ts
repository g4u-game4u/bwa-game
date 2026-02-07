import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uKpiCircularProgressComponent } from './c4u-kpi-circular-progress.component';
import { C4uPorcentagemCircularModule } from '../c4u-porcentagem-circular/c4u-porcentagem-circular.module';

describe('C4uKpiCircularProgressComponent', () => {
  let component: C4uKpiCircularProgressComponent;
  let fixture: ComponentFixture<C4uKpiCircularProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uKpiCircularProgressComponent],
      imports: [C4uPorcentagemCircularModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uKpiCircularProgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('percentage calculation', () => {
    it('should calculate percentage correctly', () => {
      component.current = 15;
      component.target = 50;
      expect(component.percentage).toBe(30);
    });

    it('should return 0 when target is 0', () => {
      component.current = 10;
      component.target = 0;
      expect(component.percentage).toBe(0);
    });

    it('should return 100 when current equals target', () => {
      component.current = 50;
      component.target = 50;
      expect(component.percentage).toBe(100);
    });

    it('should return 200 when current is double the target', () => {
      component.current = 100;
      component.target = 50;
      expect(component.percentage).toBe(200);
    });

    it('should round percentage to nearest integer', () => {
      component.current = 33;
      component.target = 100;
      expect(component.percentage).toBe(33);
    });
  });

  describe('color determination', () => {
    it('should return green color for 80%+ completion', () => {
      component.current = 40;
      component.target = 50;
      expect(component.progressColor).toBe('green');
    });

    it('should return green color for exactly 80% completion', () => {
      component.current = 80;
      component.target = 100;
      expect(component.progressColor).toBe('green');
    });

    it('should return gold color for 50-79% completion', () => {
      component.current = 60;
      component.target = 100;
      expect(component.progressColor).toBe('gold');
    });

    it('should return gold color for exactly 50% completion', () => {
      component.current = 50;
      component.target = 100;
      expect(component.progressColor).toBe('gold');
    });

    it('should return red color for <50% completion', () => {
      component.current = 20;
      component.target = 50;
      expect(component.progressColor).toBe('red');
    });

    it('should return red color for 0% completion', () => {
      component.current = 0;
      component.target = 100;
      expect(component.progressColor).toBe('red');
    });
  });

  describe('template rendering', () => {
    it('should display the label', () => {
      component.label = 'KPI 1';
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('.kpi-label').textContent).toContain('KPI 1');
    });

    it('should pass correct values to c4u-porcentagem-circular', () => {
      component.label = 'KPI 2';
      component.current = 25;
      component.target = 100;
      fixture.detectChanges();

      const porcentagemCircular = fixture.nativeElement.querySelector('c4u-porcentagem-circular');
      expect(porcentagemCircular).toBeTruthy();
    });
  });

  describe('size variants', () => {
    it('should have default size of medium', () => {
      expect(component.size).toBe('medium');
    });

    it('should apply size-small class when size is small', () => {
      component.size = 'small';
      fixture.detectChanges();
      const hostElement = fixture.nativeElement;
      expect(hostElement.classList.contains('size-small')).toBe(true);
    });

    it('should apply size-medium class when size is medium', () => {
      component.size = 'medium';
      fixture.detectChanges();
      const hostElement = fixture.nativeElement;
      expect(hostElement.classList.contains('size-medium')).toBe(true);
    });

    it('should apply size-large class when size is large', () => {
      component.size = 'large';
      fixture.detectChanges();
      const hostElement = fixture.nativeElement;
      expect(hostElement.classList.contains('size-large')).toBe(true);
    });

    it('should accept size input from template', () => {
      const testFixture = TestBed.createComponent(C4uKpiCircularProgressComponent);
      const testComponent = testFixture.componentInstance;
      testComponent.size = 'small';
      testFixture.detectChanges();
      
      expect(testComponent.size).toBe('small');
      expect(testFixture.nativeElement.classList.contains('size-small')).toBe(true);
    });

    it('should update host class when size changes', () => {
      component.size = 'small';
      fixture.detectChanges();
      expect(fixture.nativeElement.classList.contains('size-small')).toBe(true);
      
      component.size = 'large';
      fixture.detectChanges();
      expect(fixture.nativeElement.classList.contains('size-large')).toBe(true);
      expect(fixture.nativeElement.classList.contains('size-small')).toBe(false);
    });

    it('should render with small size (60px) correctly', () => {
      component.size = 'small';
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      fixture.detectChanges();

      const hostElement = fixture.nativeElement;
      expect(hostElement.classList.contains('size-small')).toBe(true);
      
      const progressWrapper = hostElement.querySelector('.kpi-progress-wrapper');
      expect(progressWrapper).toBeTruthy();
      
      // Verify label is displayed
      const label = hostElement.querySelector('.kpi-label');
      expect(label.textContent).toContain('Entregas');
      
      // Verify value is displayed
      const value = hostElement.querySelector('.kpi-value');
      expect(value.textContent).toContain('89');
    });

    it('should render with medium size (120px) correctly', () => {
      component.size = 'medium';
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      fixture.detectChanges();

      const hostElement = fixture.nativeElement;
      expect(hostElement.classList.contains('size-medium')).toBe(true);
      
      const progressWrapper = hostElement.querySelector('.kpi-progress-wrapper');
      expect(progressWrapper).toBeTruthy();
    });

    it('should render with large size (160px) correctly', () => {
      component.size = 'large';
      component.label = 'Entregas';
      component.current = 89;
      component.target = 100;
      fixture.detectChanges();

      const hostElement = fixture.nativeElement;
      expect(hostElement.classList.contains('size-large')).toBe(true);
      
      const progressWrapper = hostElement.querySelector('.kpi-progress-wrapper');
      expect(progressWrapper).toBeTruthy();
    });
  });
});
