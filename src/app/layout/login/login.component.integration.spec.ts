import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
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
import { environment } from '../../../environments/environment';

/**
 * Integration tests for Login Page Logo Display
 * 
 * These tests verify the complete flow from LogoService through LoginComponent
 * to the rendered template, ensuring all components work together correctly.
 * 
 * Test scenarios:
 * - Logo displays correctly with custom URL configured
 * - Logo displays correctly with default URL (no configuration)
 * - Fallback works when custom logo fails to load (404, network error)
 * - Logo maintains correct positioning and styling
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3
 */
describe('LoginComponent - Logo Integration Tests', () => {
  const DEFAULT_LOGO_URL = '/assets/images/logo-bwa-white-inteira-full.png';
  const CUSTOM_LOGO_URL = 'https://cdn.example.com/custom-logo.png';

  // Store original environment value
  let originalLogoUrl: string | undefined;

  // Mock providers that are not part of the logo integration
  let sessaoProviderMock: jasmine.SpyObj<SessaoProvider>;
  let toastServiceMock: jasmine.SpyObj<ToastService>;
  let systemParamsServiceMock: jasmine.SpyObj<SystemParamsService>;
  let authProviderMock: jasmine.SpyObj<AuthProvider>;
  let loginLogServiceMock: jasmine.SpyObj<LoginLogService>;
  let loadingProviderMock: jasmine.SpyObj<LoadingProvider>;

  /**
   * Helper function to configure TestBed with a specific logo URL
   * This simulates different environment configurations
   */
  async function configureTestBedWithLogoUrl(logoUrl: string | undefined): Promise<{
    fixture: ComponentFixture<LoginComponent>;
    component: LoginComponent;
    logoService: LogoService;
  }> {
    // Set environment logoUrl before creating the service
    (environment as any).logoUrl = logoUrl;

    // Reset TestBed to ensure fresh service instances
    TestBed.resetTestingModule();

    // Create mocks for non-logo related services
    sessaoProviderMock = jasmine.createSpyObj('SessaoProvider', ['login']);
    sessaoProviderMock.login.and.returnValue(Promise.resolve(false));

    toastServiceMock = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']);

    systemParamsServiceMock = jasmine.createSpyObj('SystemParamsService', ['initializeSystemParams', 'getParam']);
    systemParamsServiceMock.initializeSystemParams.and.returnValue(Promise.resolve({} as any));
    systemParamsServiceMock.getParam.and.returnValue(Promise.resolve(null));

    authProviderMock = jasmine.createSpyObj('AuthProvider', ['requestPasswordReset', 'resetPassword']);

    loginLogServiceMock = jasmine.createSpyObj('LoginLogService', ['logLogin']);
    loginLogServiceMock.logLogin.and.returnValue(Promise.resolve());

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
        LogoService, // Use real LogoService for integration tests
        { provide: SessaoProvider, useValue: sessaoProviderMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: SystemParamsService, useValue: systemParamsServiceMock },
        { provide: AuthProvider, useValue: authProviderMock },
        { provide: LoginLogService, useValue: loginLogServiceMock },
        { provide: LoadingProvider, useValue: loadingProviderMock }
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA]
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const logoService = TestBed.inject(LogoService);

    return { fixture, component, logoService };
  }

  beforeAll(() => {
    // Store original environment value
    originalLogoUrl = (environment as any).logoUrl;
  });

  afterAll(() => {
    // Restore original environment value
    (environment as any).logoUrl = originalLogoUrl;
  });

  afterEach(() => {
    // Reset environment after each test
    (environment as any).logoUrl = originalLogoUrl;
  });

  describe('Integration Flow: Custom Logo URL Configured - Requirements 2.1, 2.2', () => {
    it('should display custom logo when LOGO_URL environment variable is set', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      // Verify LogoService resolves the custom URL
      expect(logoService.getLogoUrl()).toBe(CUSTOM_LOGO_URL);

      // Verify LoginComponent receives the custom URL
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);

      // Verify template renders the custom URL
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      expect(imgElement).toBeTruthy();
      expect(imgElement.nativeElement.src).toContain('cdn.example.com/custom-logo.png');
    });

    it('should handle relative path custom logo URL', async () => {
      const relativePath = '/assets/images/client-logo.png';
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(relativePath);
      fixture.detectChanges();

      // Verify the full flow with relative path
      expect(logoService.getLogoUrl()).toBe(relativePath);
      expect(component.bwaLogoUrl).toBe(relativePath);

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      expect(imgElement.nativeElement.src).toContain('client-logo.png');
    });

    it('should trim whitespace from custom logo URL', async () => {
      const urlWithWhitespace = '  https://example.com/logo.png  ';
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(urlWithWhitespace);
      fixture.detectChanges();

      // Verify URL is trimmed throughout the flow
      expect(logoService.getLogoUrl()).toBe('https://example.com/logo.png');
      expect(component.bwaLogoUrl).toBe('https://example.com/logo.png');
    });
  });

  describe('Integration Flow: Default Logo (No Configuration) - Requirements 2.1, 2.3', () => {
    it('should display default logo when LOGO_URL is empty string', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl('');
      fixture.detectChanges();

      // Verify LogoService falls back to default
      expect(logoService.getLogoUrl()).toBe(DEFAULT_LOGO_URL);

      // Verify LoginComponent uses default
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);

      // Verify template renders default logo
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      expect(imgElement).toBeTruthy();
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');
    });

    it('should display default logo when LOGO_URL is undefined', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(undefined);
      fixture.detectChanges();

      expect(logoService.getLogoUrl()).toBe(DEFAULT_LOGO_URL);
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should display default logo when LOGO_URL is whitespace only', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl('   ');
      fixture.detectChanges();

      expect(logoService.getLogoUrl()).toBe(DEFAULT_LOGO_URL);
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should display default logo when LOGO_URL is invalid format', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl('not-a-valid-url');
      fixture.detectChanges();

      // Invalid URL should fall back to default
      expect(logoService.getLogoUrl()).toBe(DEFAULT_LOGO_URL);
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });
  });


  describe('Integration Flow: Error Fallback - Requirements 3.1, 3.3', () => {
    it('should fallback to default logo when custom logo fails to load (simulated 404)', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      // Initially shows custom logo
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);

      // Simulate image load error (404)
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();

      // Verify fallback to default logo
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');
    });

    it('should fallback to default logo when custom logo fails to load (simulated network error)', async () => {
      const { fixture, component } = await configureTestBedWithLogoUrl('https://unreachable-server.invalid/logo.png');
      fixture.detectChanges();

      // Simulate network error
      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      const networkError = new ErrorEvent('error', {
        message: 'Network request failed'
      });
      imgElement.triggerEventHandler('error', networkError);
      fixture.detectChanges();

      // Verify fallback to default logo
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should prevent infinite loop when default logo also fails', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));

      // First error - fallback to default
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);

      // Second error (default logo fails) - should not change
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);

      // Multiple subsequent errors - should remain stable
      for (let i = 0; i < 5; i++) {
        imgElement.triggerEventHandler('error', new Event('error'));
        fixture.detectChanges();
      }
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should never display broken image icon (always has valid src)', async () => {
      const { fixture, component } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));

      // Trigger error
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();

      // Verify src is always valid (not empty, not broken)
      const src = imgElement.nativeElement.src;
      expect(src).toBeTruthy();
      expect(src.length).toBeGreaterThan(0);
      expect(src).not.toBe('');
      expect(src).toContain('logo-bwa-white-inteira-full.png');
    });

    it('should use LogoService.getDefaultLogoUrl() for fallback', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();

      // Verify the fallback URL matches what LogoService provides
      expect(component.bwaLogoUrl).toBe(logoService.getDefaultLogoUrl());
    });
  });

  describe('Integration Flow: Logo Positioning and Styling - Requirement 2.4', () => {
    it('should maintain bwa-logo class on the logo image', async () => {
      const { fixture } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      expect(imgElement).toBeTruthy();
      expect(imgElement.nativeElement.classList.contains('bwa-logo')).toBeTrue();
    });

    it('should maintain correct alt attribute for accessibility', async () => {
      const { fixture } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      expect(imgElement.nativeElement.alt).toBe('BWA Global');
    });

    it('should have draggable="false" attribute', async () => {
      const { fixture } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      expect(imgElement.nativeElement.draggable).toBeFalse();
    });

    it('should maintain styling after error fallback', async () => {
      const { fixture } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));

      // Trigger error
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();

      // Verify styling is maintained
      expect(imgElement.nativeElement.classList.contains('bwa-logo')).toBeTrue();
      expect(imgElement.nativeElement.alt).toBe('BWA Global');
      expect(imgElement.nativeElement.draggable).toBeFalse();
    });

    it('should render logo in correct position within login content', async () => {
      const { fixture } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      // Verify logo is within the expected container structure
      const loginContent = fixture.debugElement.query(By.css('.login-content'));
      expect(loginContent).toBeTruthy();

      const logoImg = loginContent.query(By.css('img.bwa-logo'));
      expect(logoImg).toBeTruthy();
    });
  });

  describe('Integration Flow: Service Caching - Requirement 4.3', () => {
    it('should use cached logo URL from LogoService', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      // Get URL multiple times
      const url1 = logoService.getLogoUrl();
      const url2 = logoService.getLogoUrl();
      const url3 = logoService.getLogoUrl();

      // All should be identical (cached)
      expect(url1).toBe(url2);
      expect(url2).toBe(url3);
      expect(url1).toBe(CUSTOM_LOGO_URL);
    });

    it('should not re-resolve logo URL after component initialization', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const initialUrl = component.bwaLogoUrl;

      // Simulate component lifecycle events
      fixture.detectChanges();
      fixture.detectChanges();

      // URL should remain the same
      expect(component.bwaLogoUrl).toBe(initialUrl);
    });
  });

  describe('Integration Flow: Complete End-to-End Scenarios', () => {
    it('should handle complete flow: custom URL -> error -> fallback -> stable', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));

      // Step 1: Initial state with custom URL
      expect(logoService.getLogoUrl()).toBe(CUSTOM_LOGO_URL);
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);
      expect(imgElement.nativeElement.src).toContain('custom-logo.png');

      // Step 2: Error occurs
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();

      // Step 3: Fallback to default
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');

      // Step 4: Stable state (no more changes)
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });

    it('should handle complete flow: default URL -> stable (no errors)', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl('');
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));

      // Initial state with default URL
      expect(logoService.getLogoUrl()).toBe(DEFAULT_LOGO_URL);
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');

      // Simulate multiple renders - should remain stable
      for (let i = 0; i < 3; i++) {
        fixture.detectChanges();
        expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
      }
    });

    it('should handle complete flow: invalid URL -> default -> stable', async () => {
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl('invalid-url-format');
      fixture.detectChanges();

      // Invalid URL should immediately resolve to default
      expect(logoService.getLogoUrl()).toBe(DEFAULT_LOGO_URL);
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      expect(imgElement.nativeElement.src).toContain('logo-bwa-white-inteira-full.png');
    });
  });

  describe('Integration Flow: URL Validation Through Full Stack', () => {
    it('should validate and accept HTTPS URLs through full flow', async () => {
      const httpsUrl = 'https://secure.example.com/logo.png';
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(httpsUrl);
      fixture.detectChanges();

      expect(logoService.isValidLogoUrl(httpsUrl)).toBeTrue();
      expect(logoService.getLogoUrl()).toBe(httpsUrl);
      expect(component.bwaLogoUrl).toBe(httpsUrl);
    });

    it('should validate and accept HTTP URLs through full flow', async () => {
      const httpUrl = 'http://example.com/logo.png';
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(httpUrl);
      fixture.detectChanges();

      expect(logoService.isValidLogoUrl(httpUrl)).toBeTrue();
      expect(logoService.getLogoUrl()).toBe(httpUrl);
      expect(component.bwaLogoUrl).toBe(httpUrl);
    });

    it('should validate and accept relative paths through full flow', async () => {
      const relativePath = '/custom/path/to/logo.svg';
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(relativePath);
      fixture.detectChanges();

      expect(logoService.isValidLogoUrl(relativePath)).toBeTrue();
      expect(logoService.getLogoUrl()).toBe(relativePath);
      expect(component.bwaLogoUrl).toBe(relativePath);
    });

    it('should reject and fallback for paths without leading slash', async () => {
      const invalidPath = 'assets/logo.png';
      const { fixture, component, logoService } = await configureTestBedWithLogoUrl(invalidPath);
      fixture.detectChanges();

      expect(logoService.isValidLogoUrl(invalidPath)).toBeFalse();
      expect(logoService.getLogoUrl()).toBe(DEFAULT_LOGO_URL);
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });
  });

  describe('Integration Flow: Error Handler Binding', () => {
    it('should have error handler properly bound in template', async () => {
      const { fixture, component } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));
      
      // Spy on onLogoError
      spyOn(component, 'onLogoError').and.callThrough();

      // Trigger error event
      imgElement.triggerEventHandler('error', new Event('error'));

      // Verify handler was called
      expect(component.onLogoError).toHaveBeenCalled();
    });

    it('should trigger fallback through template error binding', async () => {
      const { fixture, component } = await configureTestBedWithLogoUrl(CUSTOM_LOGO_URL);
      fixture.detectChanges();

      const imgElement = fixture.debugElement.query(By.css('img.bwa-logo'));

      // Initial state
      expect(component.bwaLogoUrl).toBe(CUSTOM_LOGO_URL);

      // Trigger error through template binding
      imgElement.triggerEventHandler('error', new Event('error'));
      fixture.detectChanges();

      // Verify fallback occurred
      expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
    });
  });
});
