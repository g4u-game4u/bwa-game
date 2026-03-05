# Implementation Plan: Configurable Logo

## Overview

This implementation plan covers the creation of a configurable logo feature for the Angular application. The feature enables system administrators to customize the application logo via the `LOGO_URL` environment variable, with graceful fallback to the default logo when the custom logo is not configured or fails to load.

## Tasks

- [x] 1. Create LogoService with URL resolution and caching
  - [x] 1.1 Create LogoService with core functionality
    - Create `src/app/services/logo.service.ts`
    - Implement `DEFAULT_LOGO_URL` constant with value `/assets/images/logo-bwa-white-inteira-full.png`
    - Implement `resolvedLogoUrl` private property for caching
    - Implement `getLogoUrl()` method to return cached logo URL
    - Implement `getDefaultLogoUrl()` method to return default logo URL
    - Implement `isValidLogoUrl()` method for URL validation
    - Implement private `resolveLogoUrl()` method called in constructor
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 1.2 Write unit tests for LogoService
    - Create `src/app/services/logo.service.spec.ts`
    - Test service initializes with default logo when no URL configured
    - Test service returns configured URL when valid URL is set
    - Test service returns default for empty string configuration
    - Test service returns default for whitespace-only configuration
    - Test `isValidLogoUrl()` returns true for valid relative paths
    - Test `isValidLogoUrl()` returns true for valid absolute URLs
    - Test `isValidLogoUrl()` returns false for empty/null/undefined
    - Test `isValidLogoUrl()` returns false for malformed URLs
    - _Requirements: 1.2, 1.3, 3.2, 4.1, 4.3_

  - [x] 1.3 Write property test for URL resolution correctness
    - Create `src/app/services/logo.service.pbt.spec.ts`
    - **Property 1: URL Resolution Correctness**
    - Generate random valid URLs (relative paths starting with `/`, absolute URLs)
    - Verify service returns the configured URL (trimmed)
    - Generate random invalid inputs (empty, whitespace, malformed)
    - Verify service returns default logo URL
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.2, 1.3, 3.2**

  - [x] 1.4 Write property test for URL validation completeness
    - **Property 4: URL Validation Completeness**
    - Generate random strings and verify validation categorizes correctly
    - Relative paths starting with `/` should return true
    - Valid absolute URLs (http://, https://) should return true
    - Empty strings, whitespace-only, null, undefined, malformed URLs should return false
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.2, 3.2**

  - [x] 1.5 Write property test for caching consistency
    - **Property 3: Caching Consistency**
    - Generate random number of sequential calls (1-100)
    - Verify all calls to `getLogoUrl()` return identical value
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 4.3**

- [x] 2. Update environment configuration files
  - [x] 2.1 Add logoUrl property to environment files
    - Update `src/environments/environment.ts` with `logoUrl: ''` (empty for development)
    - Update `src/environments/environment.prod.ts` with `logoUrl` reading from process.env
    - Update `src/environments/environment.homol.ts` with `logoUrl` reading from process.env
    - Support both `LOGO_URL` and `logo_url` environment variable names
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Checkpoint - Verify LogoService implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update LoginComponent to use LogoService
  - [x] 4.1 Integrate LogoService into LoginComponent
    - Inject `LogoService` into LoginComponent constructor
    - Add `bwaLogoUrl` property initialized from `logoService.getLogoUrl()`
    - Implement `onLogoError()` method to handle image load failures
    - Add fallback logic to prevent infinite loops (check if already using default)
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.3_

  - [x] 4.2 Update LoginComponent template
    - Update `<img>` element to use `[src]="bwaLogoUrl"` binding
    - Add `(error)="onLogoError()"` event handler
    - Maintain existing logo positioning and styling
    - _Requirements: 2.1, 2.4, 3.1, 3.3_

  - [x] 4.3 Write unit tests for LoginComponent logo integration
    - Test component initializes with logo URL from LogoService
    - Test `onLogoError()` sets logo URL to default
    - Test template binds logo URL correctly
    - Test error handler is attached to img element
    - _Requirements: 2.1, 2.2, 2.3, 3.1_

  - [x] 4.4 Write property test for error fallback behavior
    - **Property 2: Error Fallback Behavior**
    - Simulate image load error events
    - Verify `onLogoError()` sets logo URL to default logo URL
    - Verify UI never displays broken image state
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 3.1, 3.3**

- [x] 5. Checkpoint - Verify LoginComponent integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integration testing
  - [x] 6.1 Write integration tests for login page logo display
    - Create integration test file for login page logo functionality
    - Test logo displays correctly with custom URL configured
    - Test logo displays correctly with default URL (no configuration)
    - Test fallback works when custom logo fails to load (404, network error)
    - Test logo maintains correct positioning and styling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript following Angular best practices
