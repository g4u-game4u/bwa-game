import { ComponentFixture, TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { C4uPointWalletComponent } from './c4u-point-wallet.component';
import { PointWallet } from '@model/gamification-dashboard.model';
import { C4uInfoButtonModule } from '../c4u-info-button/c4u-info-button.module';

registerLocaleData(localePt, 'pt-BR');

describe('C4uPointWalletComponent', () => {
  let component: C4uPointWalletComponent;
  let fixture: ComponentFixture<C4uPointWalletComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uPointWalletComponent],
      imports: [C4uInfoButtonModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uPointWalletComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display only Pontos and Moedas rows (no Bloqueados)', () => {
    component.points = {
      bloqueados: 1000,
      desbloqueados: 2500,
      moedas: 500
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('.point-row');
    // Should have 2 rows: Pontos (desbloqueados) and Moedas — no Bloqueados row
    expect(rows.length).toBe(2);
  });

  it('should not display bloqueados label anywhere', () => {
    component.points = {
      bloqueados: 1234,
      desbloqueados: 5678,
      moedas: 999
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const labels = compiled.querySelectorAll('.label');
    const labelTexts = Array.from(labels).map(l => l.textContent?.trim());
    expect(labelTexts).not.toContain('Bloqueados');
  });

  it('should display desbloqueados as "Pontos"', () => {
    component.points = {
      bloqueados: 0,
      desbloqueados: 5678,
      moedas: 0
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const labels = compiled.querySelectorAll('.label');
    expect(labels[0]?.textContent?.trim()).toBe('Pontos');
  });

  it('should display moedas correctly', () => {
    component.points = {
      bloqueados: 0,
      desbloqueados: 0,
      moedas: 999
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const labels = compiled.querySelectorAll('.label');
    expect(labels[1]?.textContent?.trim()).toBe('Moedas');
  });

  it('should display wallet title', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const title = compiled.querySelector('.wallet-title');
    expect(title?.textContent?.trim()).toBe('Carteira de Pontos');
  });

  it('should show mediaPontos row when provided', () => {
    component.points = {
      bloqueados: 0,
      desbloqueados: 100,
      moedas: 50
    };
    component.mediaPontos = 75;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('.point-row');
    // 3 rows: Pontos, Moedas, Média de Pontos
    expect(rows.length).toBe(3);
    const labels = compiled.querySelectorAll('.label');
    expect(labels[2]?.textContent?.trim()).toBe('Média de Pontos');
  });

  it('should not show mediaPontos row when not provided', () => {
    component.points = {
      bloqueados: 0,
      desbloqueados: 100,
      moedas: 50
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('.point-row');
    expect(rows.length).toBe(2);
  });
});
