import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uTeamSidebarComponent } from './c4u-team-sidebar.component';
import { NumberFormatPipe } from '../../pipes/number-format.pipe';

describe('C4uTeamSidebarComponent', () => {
  let component: C4uTeamSidebarComponent;
  let fixture: ComponentFixture<C4uTeamSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uTeamSidebarComponent, NumberFormatPipe]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uTeamSidebarComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display team name correctly', () => {
    component.teamName = 'Departamento Pessoal';
    fixture.detectChanges();

    const teamNameElement = fixture.nativeElement.querySelector('.team-name');
    expect(teamNameElement.textContent).toContain('Departamento Pessoal');
  });

  it('should display season date range', () => {
    component.seasonDates = {
      start: new Date('2024-01-01'),
      end: new Date('2024-12-31')
    };
    fixture.detectChanges();

    const dateRangeElement = fixture.nativeElement.querySelector('.season-dates');
    expect(dateRangeElement).toBeTruthy();
  });

  it('should render season points with correct values', () => {
    component.seasonPoints = {
      total: 15000,
      bloqueados: 5000,
      desbloqueados: 10000
    };
    fixture.detectChanges();

    const pointsSection = fixture.nativeElement.querySelector('.season-points');
    expect(pointsSection).toBeTruthy();
    
    const totalElement = fixture.nativeElement.querySelector('[data-testid="total-points"]');
    expect(totalElement.textContent).toContain('15.000');
  });

  it('should render progress metrics with correct values', () => {
    component.progressMetrics = {
      processosIncompletos: 25,
      atividadesFinalizadas: 150,
      processosFinalizados: 75
    };
    fixture.detectChanges();

    const metricsSection = fixture.nativeElement.querySelector('.progress-metrics');
    expect(metricsSection).toBeTruthy();

    const incompletosElement = fixture.nativeElement.querySelector('[data-testid="processos-incompletos"]');
    expect(incompletosElement.textContent).toContain('25');

    const atividadesElement = fixture.nativeElement.querySelector('[data-testid="atividades-finalizadas"]');
    expect(atividadesElement.textContent).toContain('150');

    const finalizadosElement = fixture.nativeElement.querySelector('[data-testid="processos-finalizados"]');
    expect(finalizadosElement.textContent).toContain('75');
  });

  it('should handle zero values in season points', () => {
    component.seasonPoints = {
      total: 0,
      bloqueados: 0,
      desbloqueados: 0
    };
    fixture.detectChanges();

    const totalElement = fixture.nativeElement.querySelector('[data-testid="total-points"]');
    expect(totalElement.textContent).toContain('0');
  });

  it('should handle zero values in progress metrics', () => {
    component.progressMetrics = {
      processosIncompletos: 0,
      atividadesFinalizadas: 0,
      processosFinalizados: 0
    };
    fixture.detectChanges();

    const incompletosElement = fixture.nativeElement.querySelector('[data-testid="processos-incompletos"]');
    expect(incompletosElement.textContent).toContain('0');
  });

  it('should apply responsive layout class on mobile', () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375
    });

    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('.team-sidebar');
    expect(sidebar).toBeTruthy();
  });

  it('should display icons for each metric', () => {
    component.seasonPoints = {
      total: 1000,
      bloqueados: 500,
      desbloqueados: 500
    };
    component.progressMetrics = {
      processosIncompletos: 10,
      atividadesFinalizadas: 50,
      processosFinalizados: 40
    };
    fixture.detectChanges();

    const icons = fixture.nativeElement.querySelectorAll('.metric-icon');
    expect(icons.length).toBeGreaterThan(0);
  });
});
