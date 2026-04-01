import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import * as fc from 'fast-check';

import { LoginComponent } from './login.component';
import { LogoService } from '@services/logo.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { LoadingProvider } from '@providers/loading.provider';
import { ToastService } from '@services/toast.service';
import { SystemParamsService } from '@services/system-params.service';
import { AuthProvider } from '@providers/auth/auth.provider';
import { LoginLogService } from '@services/login-log.service';

/**
 * Property-Based Tests for LoginComponent Error Fallback Behavior
 * 
 * Property 2: Error Fallback Behavior
 * **Validates: Requirements 3.1, 3.3**
 * 
 * For any image load error event on the logo element, the LoginComponent.onLogoError()
 * handler should set the logo URL to the default logo URL, ensuring the UI never
 * displays a broken image.
 */
describe('LoginComponent Property-Based Tests - Error Fallback Behavior', () => {
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
  const propertyTestConfig = { numRuns: 100 };

  beforeEach(async () => {
    // Create mock for LogoService
    logoServiceMock = jasmine.createSpyObj('LogoService', ['getLogoUrl', 'getDefaultLogoUrl']);
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
  });

  /**
   * Property 2: Error Fallback Behavior
   * **Validates: Requirements 3.1, 3.3**
   * 
   * For any image load error event on the logo element, the LoginComponent.onLogoError()
   * handler should set the logo URL to the default logo URL, ensuring the UI never
   * displays a broken image.
   */
  describe('Property 2: Error Fallback Behavior', () => {

    describe('Error Handler Sets Default Logo URL', () => {
      /**
       * For any custom logo URL, after an error event, the logo URL should be set
       * to the default logo URL.
       */
      it('should set logo URL to default for any custom URL after error', () => {
        fc.assert(
          fc.property(
            // Generate random custom logo URLs
            fc.oneof(
              fc.webUrl(),
              fc.constant('/custom/logo.png'),
              fc.constant('/assets/custom-brand.svg'),
              fc.constant('https://cdn.example.com/logo.png'),
              fc.constant('http://images.company.com/brand.jpg'),
              fc.string({ minLength: 1, maxLength: 100 }).map(s => `https://example.com/${s.replace(/[^a-zA-Z0-9]/g, '')}.png`)
            ),
            (customLogoUrl) => {
              // Configure mock to return custom URL
              logoServiceMock.getLogoUrl.and.returnValue(customLogoUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Verify initial state
              expect(component.bwaLogoUrl).toBe(customLogoUrl);
              
              // Simulate error
              component.onLogoError();
              
              // Verify fallback to default
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * For any sequence of error events, the logo URL should always end up
       * as the default logo URL.
       */
      it('should always result in default logo URL after any number of error events', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              // Random custom URL
              fc.oneof(
                fc.webUrl(),
                fc.constant('/custom/logo.png'),
                fc.constant('https://cdn.example.com/logo.png')
              ),
              // Random number of error events (1-50)
              fc.integer({ min: 1, max: 50 })
            ),
            ([customLogoUrl, numErrors]) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(customLogoUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Simulate multiple error events
              for (let i = 0; i < numErrors; i++) {
                component.onLogoError();
              }
              
              // Should always be default logo
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Infinite Loop Prevention', () => {
      /**
       * When already using default logo, onLogoError should not change the URL
       * (prevents infinite loops if default logo also fails).
       */
      it('should not change URL when already using default logo', () => {
        fc.assert(
          fc.property(
            // Random number of error calls when already at default
            fc.integer({ min: 1, max: 100 }),
            (numErrors) => {
              // Configure mock to return default URL
              logoServiceMock.getLogoUrl.and.returnValue(DEFAULT_LOGO_URL);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Verify initial state is default
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
              
              // Simulate multiple error events
              for (let i = 0; i < numErrors; i++) {
                component.onLogoError();
              }
              
              // Should still be default logo (no change)
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * After transitioning to default logo, subsequent errors should not
       * cause any state changes.
       */
      it('should maintain default logo state after transition regardless of subsequent errors', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              // Random custom URL
              fc.webUrl(),
              // Errors before transition
              fc.integer({ min: 1, max: 10 }),
              // Errors after transition
              fc.integer({ min: 1, max: 50 })
            ),
            ([customLogoUrl, errorsBefore, errorsAfter]) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(customLogoUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // First batch of errors (causes transition)
              for (let i = 0; i < errorsBefore; i++) {
                component.onLogoError();
              }
              
              // Should now be default
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
              
              // Second batch of errors (should not change anything)
              for (let i = 0; i < errorsAfter; i++) {
                component.onLogoError();
              }
              
              // Should still be default
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('UI Never Displays Broken Image State', () => {
      /**
       * For any initial logo URL and any sequence of error events,
       * the bwaLogoUrl should always be a valid, non-empty string.
       */
      it('should always have a valid non-empty logo URL after any error sequence', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              // Random initial URL (could be valid or invalid)
              fc.oneof(
                fc.webUrl(),
                fc.constant('/custom/logo.png'),
                fc.constant('https://broken-url.example.com/404.png'),
                fc.constant('/nonexistent/path.svg')
              ),
              // Random number of errors
              fc.integer({ min: 0, max: 50 })
            ),
            ([initialUrl, numErrors]) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(initialUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Simulate errors
              for (let i = 0; i < numErrors; i++) {
                component.onLogoError();
              }
              
              // Logo URL should always be valid (non-empty string)
              expect(component.bwaLogoUrl).toBeTruthy();
              expect(typeof component.bwaLogoUrl).toBe('string');
              expect(component.bwaLogoUrl.length).toBeGreaterThan(0);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * After any error event, the logo URL should be either the original
       * custom URL (if no error yet) or the default URL (after error).
       */
      it('should only have custom URL or default URL as valid states', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.webUrl(),
              fc.boolean() // whether to trigger error
            ),
            ([customUrl, triggerError]) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(customUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              if (triggerError) {
                component.onLogoError();
                expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
              } else {
                expect(component.bwaLogoUrl).toBe(customUrl);
              }
              
              // In either case, URL should be valid
              expect(component.bwaLogoUrl).toBeTruthy();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The logo URL should never be null, undefined, or empty string
       * regardless of the error sequence.
       */
      it('should never have null, undefined, or empty logo URL', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.oneof(
                fc.webUrl(),
                fc.constant('/assets/logo.png'),
                fc.constant(DEFAULT_LOGO_URL)
              ),
              fc.array(fc.boolean(), { minLength: 0, maxLength: 100 }) // error pattern
            ),
            ([initialUrl, errorPattern]) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(initialUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Apply error pattern
              for (const shouldError of errorPattern) {
                if (shouldError) {
                  component.onLogoError();
                }
                
                // After each step, verify URL is never invalid
                expect(component.bwaLogoUrl).not.toBeNull();
                expect(component.bwaLogoUrl).not.toBeUndefined();
                expect(component.bwaLogoUrl).not.toBe('');
              }
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Error Handler Idempotency', () => {
      /**
       * Calling onLogoError multiple times should be idempotent -
       * the result should be the same as calling it once.
       */
      it('should be idempotent - multiple calls produce same result as single call', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.webUrl(),
              fc.integer({ min: 1, max: 100 })
            ),
            ([customUrl, numCalls]) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(customUrl);
              
              // Create first component - single call
              fixture = TestBed.createComponent(LoginComponent);
              const component1 = fixture.componentInstance;
              component1.onLogoError();
              const resultAfterOneCall = component1.bwaLogoUrl;
              
              // Create second component - multiple calls
              fixture = TestBed.createComponent(LoginComponent);
              const component2 = fixture.componentInstance;
              for (let i = 0; i < numCalls; i++) {
                component2.onLogoError();
              }
              const resultAfterManyCalls = component2.bwaLogoUrl;
              
              // Results should be identical
              expect(resultAfterManyCalls).toBe(resultAfterOneCall);
              expect(resultAfterManyCalls).toBe(DEFAULT_LOGO_URL);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Service Integration', () => {
      /**
       * onLogoError should always call logoService.getDefaultLogoUrl()
       * when transitioning from custom to default.
       */
      it('should call getDefaultLogoUrl when transitioning from custom URL', () => {
        fc.assert(
          fc.property(
            fc.webUrl(),
            (customUrl) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(customUrl);
              logoServiceMock.getDefaultLogoUrl.calls.reset();
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Trigger error
              component.onLogoError();
              
              // Should have called getDefaultLogoUrl
              expect(logoServiceMock.getDefaultLogoUrl).toHaveBeenCalled();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * The default URL returned by the service should be used exactly.
       */
      it('should use exact default URL from service', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.webUrl(),
              // Generate various default URLs the service might return
              fc.oneof(
                fc.constant(DEFAULT_LOGO_URL),
                fc.constant('/assets/fallback.png'),
                fc.constant('/images/default-brand.svg')
              )
            ),
            ([customUrl, serviceDefaultUrl]) => {
              // Configure mock with specific default URL
              logoServiceMock.getLogoUrl.and.returnValue(customUrl);
              logoServiceMock.getDefaultLogoUrl.and.returnValue(serviceDefaultUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Trigger error
              component.onLogoError();
              
              // Should use exact URL from service
              expect(component.bwaLogoUrl).toBe(serviceDefaultUrl);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Edge Cases', () => {
      /**
       * Error handling should work correctly with URLs containing special characters.
       */
      it('should handle URLs with special characters correctly', () => {
        fc.assert(
          fc.property(
            fc.oneof(
              fc.constant('https://example.com/logo%20with%20spaces.png'),
              fc.constant('https://example.com/logo?v=1&t=2'),
              fc.constant('https://example.com/logo#section'),
              fc.constant('/assets/logo-émoji-🎨.png'),
              fc.constant('https://example.com/логотип.png')
            ),
            (specialUrl) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(specialUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Verify initial state
              expect(component.bwaLogoUrl).toBe(specialUrl);
              
              // Trigger error
              component.onLogoError();
              
              // Should fallback to default
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Error handling should work with very long URLs.
       */
      it('should handle very long URLs correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 100, max: 500 }).map(length => 
              `https://example.com/${'a'.repeat(length)}.png`
            ),
            (longUrl) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(longUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Trigger error
              component.onLogoError();
              
              // Should fallback to default
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
            }
          ),
          { numRuns: 50 }
        );
      });

      /**
       * Rapid successive error events should be handled gracefully.
       */
      it('should handle rapid successive error events gracefully', () => {
        fc.assert(
          fc.property(
            fc.tuple(
              fc.webUrl(),
              fc.integer({ min: 10, max: 100 })
            ),
            ([customUrl, numRapidErrors]) => {
              // Configure mock
              logoServiceMock.getLogoUrl.and.returnValue(customUrl);
              
              // Create component
              fixture = TestBed.createComponent(LoginComponent);
              component = fixture.componentInstance;
              
              // Rapid fire errors
              const startTime = Date.now();
              for (let i = 0; i < numRapidErrors; i++) {
                component.onLogoError();
              }
              const endTime = Date.now();
              
              // Should complete quickly (no infinite loops)
              expect(endTime - startTime).toBeLessThan(1000);
              
              // Should be at default
              expect(component.bwaLogoUrl).toBe(DEFAULT_LOGO_URL);
            }
          ),
          propertyTestConfig
        );
      });
    });
  });
});
