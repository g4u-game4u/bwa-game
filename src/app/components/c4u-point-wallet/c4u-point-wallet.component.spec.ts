import { ComponentFixture, TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { C4uPointWalletComponent } from './c4u-point-wallet.component';
import { PointWallet } from '@model/gamification-dashboard.model';

registerLocaleData(localePt, 'pt-BR');

describe('C4uPointWalletComponent', () => {
  let component: C4uPointWalletComponent;
  let fixture: ComponentFixture<C4uPointWalletComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uPointWalletComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uPointWalletComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display all three point categories', () => {
    component.points = {
      bloqueados: 1000,
      desbloqueados: 2500,
      moedas: 500
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const categories = compiled.querySelectorAll('.point-category');
    expect(categories.length).toBe(3);
  });

  it('should display bloqueados points correctly', () => {
    component.points = {
      bloqueados: 1234,
      desbloqueados: 0,
      moedas: 0
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const categoryValues = compiled.querySelectorAll('.category-value');
    const bloqueadosValue = categoryValues[0]?.textContent?.trim();
    
    // The number pipe formats with locale, so we check for the number
    expect(bloqueadosValue).toContain('1');
    expect(bloqueadosValue).toContain('234');
  });

  it('should display desbloqueados points correctly', () => {
    component.points = {
      bloqueados: 0,
      desbloqueados: 5678,
      moedas: 0
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const categoryValues = compiled.querySelectorAll('.category-value');
    const desbloqueadosValue = categoryValues[1]?.textContent?.trim();
    
    expect(desbloqueadosValue).toContain('5');
    expect(desbloqueadosValue).toContain('678');
  });

  it('should display moedas points correctly', () => {
    component.points = {
      bloqueados: 0,
      desbloqueados: 0,
      moedas: 999
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const categoryValues = compiled.querySelectorAll('.category-value');
    const moedasValue = categoryValues[2]?.textContent?.trim();
    
    expect(moedasValue).toBe('999');
  });

  it('should display zero values correctly', () => {
    component.points = {
      bloqueados: 0,
      desbloqueados: 0,
      moedas: 0
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const categoryValues = compiled.querySelectorAll('.category-value');
    
    expect(categoryValues[0]?.textContent?.trim()).toBe('0');
    expect(categoryValues[1]?.textContent?.trim()).toBe('0');
    expect(categoryValues[2]?.textContent?.trim()).toBe('0');
  });

  it('should display category labels correctly', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const categoryLabels = compiled.querySelectorAll('.category-label');
    
    expect(categoryLabels[0]?.textContent?.trim()).toBe('Bloqueados');
    expect(categoryLabels[1]?.textContent?.trim()).toBe('Desbloqueados');
    expect(categoryLabels[2]?.textContent?.trim()).toBe('Moedas');
  });

  it('should display wallet title', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const title = compiled.querySelector('.wallet-title');
    expect(title?.textContent?.trim()).toBe('Carteira de Pontos');
  });

  it('should handle large point values', () => {
    component.points = {
      bloqueados: 1000000,
      desbloqueados: 999999,
      moedas: 500000
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const categoryValues = compiled.querySelectorAll('.category-value');
    
    // Check that values are rendered (formatting may vary)
    expect(categoryValues[0]?.textContent).toBeTruthy();
    expect(categoryValues[1]?.textContent).toBeTruthy();
    expect(categoryValues[2]?.textContent).toBeTruthy();
  });

  it('should have correct icon classes for each category', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const icons = compiled.querySelectorAll('.category-icon');
    
    expect(icons[0]?.classList.contains('bloqueados')).toBe(true);
    expect(icons[1]?.classList.contains('desbloqueados')).toBe(true);
    expect(icons[2]?.classList.contains('moedas')).toBe(true);
  });
});
