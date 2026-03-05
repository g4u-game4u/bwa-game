# Implementation Plan: Configurable Team Codes

## Overview

This implementation makes team codes for Supervisor, Gestor, and Diretor roles configurable via environment variables, following the established `LogoService` pattern. The implementation adds team code properties to environment files, creates a `TeamCodeService`, and updates `user-profile.ts` to use the service instead of hardcoded constants.

## Tasks

- [x] 1. Add team code properties to environment files
  - [x] 1.1 Add team code properties to `src/environments/environment.ts`
    - Add `supervisorTeamCode`, `gestorTeamCode`, `diretorTeamCode` with hardcoded default values
    - Default values: SUPERVISAO='Fkmdmko', GESTAO='FkmdnFU', DIRECAO='FkmdhZ9'
    - _Requirements: 5.1, 2.1, 2.2, 2.3_
  
  - [x] 1.2 Add team code properties to `src/environments/environment.prod.ts`
    - Read from `process.env` with uppercase and lowercase support
    - Fallback to default values when env vars not set
    - _Requirements: 5.2, 5.4, 1.4, 1.5, 1.6_
  
  - [x] 1.3 Add team code properties to `src/environments/environment.homol.ts`
    - Read from `process.env` with uppercase and lowercase support
    - Fallback to default values when env vars not set
    - _Requirements: 5.3, 5.4, 1.4, 1.5, 1.6_

- [x] 2. Create TeamCodeService
  - [x] 2.1 Create `src/app/services/team-code.service.ts`
    - Follow `LogoService` pattern with `@Injectable({ providedIn: 'root' })`
    - Implement `getTeamCodes()`, `getSupervisorCode()`, `getGestorCode()`, `getDiretorCode()`
    - Implement `isValidTeamCode()` validation method
    - Implement private `resolveTeamCodes()` with fallback to defaults
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_
  
  - [x] 2.2 Create unit tests `src/app/services/team-code.service.spec.ts`
    - Test service instantiation with default values
    - Test `getTeamCodes()` returns correct structure
    - Test individual getter methods
    - Test `isValidTeamCode()` edge cases: empty string, whitespace, null, undefined, valid strings
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_
  
  - [x] 2.3 Write property test for default values consistency
    - **Property 1: Default Values Consistency**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  
  - [x] 2.4 Write property test for team code validation
    - **Property 4: Team Code Validation**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 3. Checkpoint - Ensure TeamCodeService tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update user-profile.ts to use TeamCodeService
  - [x] 4.1 Update `src/app/utils/user-profile.ts`
    - Add optional `TeamCodes` parameter to `determineUserProfile()`, `getUserOwnTeamId()`, `getAccessibleTeamIds()`
    - Use configured team codes instead of hardcoded `MANAGEMENT_TEAM_IDS`
    - Maintain backward compatibility with default values when parameter not provided
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_
  
  - [x] 4.2 Update unit tests for user-profile.ts
    - Test `determineUserProfile()` with custom team codes
    - Test `getUserOwnTeamId()` with custom team codes
    - Test `getAccessibleTeamIds()` with custom team codes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_
  
  - [x] 4.3 Write property test for profile determination
    - **Property 2: Profile Determination with Configured Codes**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
  
  - [x] 4.4 Write property test for team access filtering
    - **Property 3: Team Access Filtering with Configured Codes**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Integration and wiring
  - [x] 6.1 Wire TeamCodeService to user-profile utility consumers
    - Update any components/services that call user-profile functions to pass team codes from TeamCodeService
    - Verify backward compatibility with existing code
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.4_
  
  - [x] 6.2 Write integration tests
    - Test end-to-end profile determination flow with custom team codes
    - Test backward compatibility with default values
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation follows the established `LogoService` pattern for consistency
