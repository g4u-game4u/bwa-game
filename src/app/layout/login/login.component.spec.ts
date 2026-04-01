import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';

import { LoginComponent } from './login.component';
import { LogoService } from '@services/logo.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { LoadingProvider } from '@providers/loading.provider';
import { ToastService } from '@services/toast.service';
import { SystemParamsService } from '@services/system-params.service';
import { AuthProvider } from '@providers/auth/auth.provider';
import { LoginLogService } from '@services/login-log.service';

/**
 * Unit tests for LoginComponent logo integration
 * 
 * Tests cover:
 * - Component initializes with logo URL from LogoService
 * - onLogoError() sets logo URL to default
 * - Template binds logo URL correctly
 * - Error handler is attached to img element
 * 
 * Requirements: 2.1, 2.2, 2.3, 3.1
 */
describe('LoginComponent - Logo Integration', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let logoServiceMock: jasmine.SpyObj<LogoService>;
  let sessaoProviderMock: jasmine.SpyObj<SessaoProvider>;
  let toastServiceMock: jasmine.SpyObj<ToastService>;
  let systemParamsServiceMock: jasmine.SpyObj<SystemParamsService>;
  let authProviderMock: jasmine.SpyObj<AuthProvider>;
  let loginLogServiceMock: jasmine.SpyObj<LoginLogService>;
  let loadingProviderMock: jasmine.SpyObj<LoadingProvider>;

  const DEFAULT_LOGO_URL = '/assets/images/logo-bwa-white-inteira-full.png';
  const CUSTOM_LOGO_URL = 'https://example.com/custom-logo.png';

  beforeEach(async () => {
    // Create mock for LogoService
    logoServiceMock = jasmine.createSpyObj('LogoService', ['getLogoUrl', 'getDefaultLogoUrl']);
    logoServiceMock.getLogoUrl.and.returnValue(CUSTOM_LOGO_URL);
    logoServiceMock.getDefaultLogoUrl.and.returnValue(DEFAULT_LOGO_URL);

    // Create mock for SessaoProvider
    sessaoProviderMock = jasmine.createSpyObj('SessaoProvider', ['login']);
    sessaoProviderMock.login.and.returnValue(Promise.resolve(false));

    // Create mock for ToastService
    toastServiceMock = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']);

    // Create mock for SystemParamsService
    systemParamsServiceMock = jasmine.createSpyObj('SystemParamsService', ['initializeSystemParams', 'getParam']);
    systemParamsServiceMock.initializeSystemParams.and.returnValue(Promise.resolve({} as any));
    systemParamsServiceMock.getParam.and.returnValue(Promise.resolve(null));

    // Create mock for AuthProvider
    authProviderMock = jasmine.createSpyObj('AuthProvider', ['requestPasswordReset', 'resetPassword']);

    // Create mock for LoginLogService
    loginLogServiceMock = jasmine.createSpyObj('LoginLogService', ['logLogin']);
    loginLogServiceMock.logLogin.and.returnValue(Promise.resolve());

    // Create mock for LoadingProvider
    loadingProviderMock = jasmine.createSpyObj('LoadingProvider', ['show', 'hide']);

    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule,
        HttpClientTestingModule,
        ReactiveFormsModule,
        TranslateModule.forRoot()
      ],
      declarations: [LoginComponent],
      providers: [
        { provide: LogoService, useValue: logoServiceMock },
        { provide: SessaoProvider, useValue: sessaoProviderMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: SystemParamsService, useValue: systemParamsServiceMock },
        { provide: AuthProvider, useValue: authProviderMock },
        { provide: LoginLogService, useValue: loginLogServiceMock },
        { provide: LoadingProvider, useValue: loadingProviderMock }
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });

  describe('Component Creation', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('Logo Initialization - Requirement 2.1', () => {
    it('should initialize bwaLogoUrl from LogoService.getLogoUrl()', () => {
      // The constructor should call logoService.getLogoUrl()
      expect(logoServiceMock.getLogoUrl).toHaveBeenCalled();
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);
    });

    it('should initialize with custom logo URL when configured', () => {
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);
    });

    it('should initialize with default logo URL when no custom URL is configured', () => {
      // Reset and reconfigure with default logo
      logoServiceMock.getLogoUrl.and.returnValue(DEFAULT_LOGO_URL);
      
      // Create a new component instance
      const newFixture = TestBed.createComponent(LoginComponent);
      const newComponent = newFixture.componentInstance;
      
      expect(newComponent.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should call LogoService.getLogoUrl() exactly once during construction', () => {
      // Reset the spy call count
      logoServiceMock.getLogoUrl.calls.reset();
      
      // Create a new component
      const newFixture = TestBed.createComponent(LoginComponent);
      
      expect(logoServiceMock.getLogoUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('onLogoError() - Requirement 3.1', () => {
    it('should set bwaLogoUrl to default logo URL when called', () => {
      // Initially set to custom URL
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);
      
      // Simulate error
      component.onLogoError();
      
      // Should now be default
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should call LogoService.getDefaultLogoUrl() when error occurs', () => {
      component.onLogoError();
      
      expect(logoServiceMock.getDefaultLogoUrl).toHaveBeenCalled();
    });

    it('should not change logo URL if already using default (prevent infinite loop)', () => {
      // Set to default first
      component.bwaLogoUrl = DEFAULT_LOGO_URL;
      logoServiceMock.getDefaultLogoUrl.calls.reset();
      
      // Call onLogoError
      component.onLogoError();
      
      // Should still be default and not trigger another change
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      // getDefaultLogoUrl is called to check, but no assignment should happen
      expect(logoServiceMock.getDefaultLogoUrl).toHaveBeenCalled();
    });

    it('should handle multiple error calls gracefully', () => {
      // First error - should change to default
      component.onLogoError();
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      
      // Second error - should remain default (no infinite loop)
      component.onLogoError();
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      
      // Third error - should remain default
      component.onLogoError();
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });
  });

  describe('Template Binding - Requirement 2.2, 2.3', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should bind bwaLogoUrl to img src attribute', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      expect(imgElement).toBeTruthy();
      expect(imgElement.nativeElement.src).toContain(CUSTOM_LOGO_URL.replace('https://', ''));
    });

    it('should update img src when bwaLogoUrl changes', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      // Initial value
      expect(imgElement.nativeElement.src).toContain('example.com/custom-logo.png');
      
      // Change the logo URL
      component.bwaLogoUrl = DEFAULT_LOGO_URL;
      fixture.detectChanges();
      
      // Should reflect the new value
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');
    });

    it('should display custom logo when Custom_Logo_URL is configured', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      expect(imgElement).toBeTruthy();
      expect(imgElement.nativeElement.src).toContain('custom-logo.png');
    });

    it('should display default logo when no Custom_Logo_URL is configured', () => {
      // Reconfigure with default logo
      component.bwaLogoUrl = DEFAULT_LOGO_URL;
      fixture.detectChanges();
      
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      expect(imgElement).toBeTruthy();
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');
    });

    it('should have correct alt attribute on logo image', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      expect(imgElement.nativeElement.alt).toBe('BWA Global');
    });

    it('should have bwa-logo class on the logo image', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      expect(imgElement).toBeTruthy();
      expect(imgElement.nativeElement.classList.contains('bwa-logo')).toBeTrue();
    });

    it('should have draggable="false" attribute on logo image', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      expect(imgElement.nativeElement.draggable).toBeFalse();
    });
  });

  describe('Error Handler Attachment - Requirement 3.1, 3.3', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should have error event handler attached to img element', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      // Check that the element exists
      expect(imgElement).toBeTruthy();
      
      // The error handler should be bound via (error)="onLogoError()"
      // We can verify by triggering the error event
      spyOn(component, 'onLogoError');
      
      imgElement.triggerEventHandler('error', new Event('error'));
      
      expect(component.onLogoError).toHaveBeenCalled();
    });

    it('should call onLogoError when image fails to load', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      spyOn(component, 'onLogoError').and.callThrough();
      
      // Trigger error event
      imgElement.triggerEventHandler('error', new Event('error'));
      
      expect(component.onLogoError).toHaveBeenCalledTimes(1);
    });

    it('should fallback to default logo when error event is triggered', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      // Initially custom logo
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);
      
      // Trigger error event
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();
      
      // Should now be default logo
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should update template after error fallback', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      // Trigger error event
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();
      
      // Template should reflect the default logo
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');
    });

    it('should not display broken image icon (always has valid src)', () => {
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      // Trigger error to simulate broken custom logo
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();
      
      // Should have a valid src (the default logo)
      expect(imgElement.nativeElement.src).toBeTruthy();
      expect(imgElement.nativeElement.src.length).toBeGreaterThan(0);
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');
    });
  });

  describe('Integration with LogoService', () => {
    it('should use LogoService for initial logo URL', () => {
      expect(logoServiceMock.getLogoUrl).toHaveBeenCalled();
    });

    it('should use LogoService for fallback logo URL', () => {
      component.onLogoError();
      
      expect(logoServiceMock.getDefaultLogoUrl).toHaveBeenCalled();
    });

    it('should not call getLogoUrl after initialization', () => {
      logoServiceMock.getLogoUrl.calls.reset();
      
      // Trigger various actions
      fixture.detectChanges();
      component.onLogoError();
      fixture.detectChanges();
      
      // getLogoUrl should not be called again
      expect(logoServiceMock.getLogoUrl).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle component with default logo from start', () => {
      // Reset and create component with default logo
      logoServiceMock.getLogoUrl.and.returnValue(DEFAULT_LOGO_URL);
      
      const newFixture = TestBed.createComponent(LoginComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();
      
      expect(newComponent.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      
      // Error should not change anything
      newComponent.onLogoError();
      expect(newComponent.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should handle rapid successive error events', () => {
      fixture.detectChanges();
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      // Trigger multiple rapid errors
      for (let i = 0; i < 5; i++) {
        imgElement.triggerEventHandler('error', new Event('error'));
      }
      fixture.detectChanges();
      
      // Should still be default logo
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should maintain logo URL type as string', () => {
      expect(typeof component.bwaLogoUrl).toBe('string');
      
      component.onLogoError();
      
      expect(typeof component.bwaLogoUrl).toBe('string');
    });
  });
});
