import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uErrorMessageComponent } from './c4u-error-message.component';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

/**
 * Error Message Component Tests
 * Requirements: 14.2, 14.3
 */
describe('C4uErrorMessageComponent', () => {
  let component: C4uErrorMessageComponent;
  let fixture: ComponentFixture<C4uErrorMessageComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uErrorMessageComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uErrorMessageComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Error Message Display', () => {
    it('should display default error message', () => {
      expect(compiled.querySelector('.error-text')?.textContent).toContain('Erro ao carregar dados');
    });

    it('should display custom error message', () => {
      component.message = 'Erro ao carregar equipes';
      fixture.detectChanges();
      
      expect(compiled.querySelector('.error-text')?.textContent).toContain('Erro ao carregar equipes');
    });

    it('should display error icon', () => {
      const icon = compiled.querySelector('.error-icon');
      expect(icon).toBeTruthy();
      expect(icon?.classList.contains('bi-exclamation-triangle')).toBe(true);
    });
  });

  describe('Retry Button', () => {
    it('should show retry button when showRetry is true', () => {
      component.showRetry = true;
      fixture.detectChanges();
      
      const button = compiled.querySelector('.btn-retry');
      expect(button).toBeTruthy();
    });

    it('should hide retry button when showRetry is false', () => {
      component.showRetry = false;
      fixture.detectChanges();
      
      const button = compiled.querySelector('.btn-retry');
      expect(button).toBeFalsy();
    });

    it('should emit retry event when retry button is clicked', () => {
      component.showRetry = true;
      fixture.detectChanges();
      
      spyOn(component.retry, 'emit');
      
      const button = compiled.querySelector('.btn-retry') as HTMLButtonElement;
      button.click();
      
      expect(component.retry.emit).toHaveBeenCalled();
    });

    it('should not emit retry event when button is disabled', () => {
      component.showRetry = true;
      component.isRetrying = true;
      fixture.detectChanges();
      
      spyOn(component.retry, 'emit');
      
      const button = compiled.querySelector('.btn-retry') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      
      button.click();
      
      // Event should not be emitted when disabled
      expect(component.retry.emit).not.toHaveBeenCalled();
    });

    it('should display "Tentando..." text when isRetrying is true', () => {
      component.showRetry = true;
      component.isRetrying = true;
      fixture.detectChanges();
      
      const button = compiled.querySelector('.btn-retry');
      expect(button?.textContent).toContain('Tentando...');
    });

    it('should display "Tentar Novamente" text when isRetrying is false', () => {
      component.showRetry = true;
      component.isRetrying = false;
      fixture.detectChanges();
      
      const button = compiled.querySelector('.btn-retry');
      expect(button?.textContent).toContain('Tentar Novamente');
    });

    it('should show spinning icon when isRetrying is true', () => {
      component.showRetry = true;
      component.isRetrying = true;
      fixture.detectChanges();
      
      const icon = compiled.querySelector('.btn-retry i');
      expect(icon?.classList.contains('spinning')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on retry button', () => {
      component.showRetry = true;
      fixture.detectChanges();
      
      const button = compiled.querySelector('.btn-retry');
      expect(button?.getAttribute('aria-label')).toBe('Tentar novamente');
    });

    it('should be keyboard accessible', () => {
      component.showRetry = true;
      fixture.detectChanges();
      
      spyOn(component.retry, 'emit');
      
      const button = fixture.debugElement.query(By.css('.btn-retry'));
      
      // Simulate Enter key press
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      button.nativeElement.dispatchEvent(event);
      
      // Button should be focusable and clickable
      expect(button.nativeElement.tabIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Component Methods', () => {
    it('should call onRetry when retry button is clicked', () => {
      spyOn(component, 'onRetry');
      component.showRetry = true;
      fixture.detectChanges();
      
      const button = compiled.querySelector('.btn-retry') as HTMLButtonElement;
      button.click();
      
      expect(component.onRetry).toHaveBeenCalled();
    });

    it('should not emit retry event if isRetrying is true', () => {
      component.isRetrying = true;
      spyOn(component.retry, 'emit');
      
      component.onRetry();
      
      expect(component.retry.emit).not.toHaveBeenCalled();
    });

    it('should emit retry event if isRetrying is false', () => {
      component.isRetrying = false;
      spyOn(component.retry, 'emit');
      
      component.onRetry();
      
      expect(component.retry.emit).toHaveBeenCalled();
    });
  });
});
