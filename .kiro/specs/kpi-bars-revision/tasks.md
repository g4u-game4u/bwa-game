# Implementation Plan: KPI Bars Revision

## Overview

This plan implements the KPI bars revision across the gamification dashboards. The work is organized into: (1) creating shared constants and the team-visibility configuration, (2) modifying `KPI_Service` to remove `numero-empresas` and add the two new KPIs, (3) updating both dashboard components' `enabledKPIs` getters with team-visibility filtering, (4) fixing the goals meta value override bug, and (5) updating tests. All changes use TypeScript in the existing Angular project structure.

## Tasks

- [x] 1. Create KPI constants and team-visibility configuration
  - [x] 1.1 Create `src/app/constants/kpi-targets.constants.ts` with hardcoded target values and team-visibility map
    - Define `META_PROTOCOLO_TARGET = 1_000_000` (R$ 1.000.000) with `// TODO: migrate to metric_targets__c or System_Params_Service` comment
    - Define `APOSENTADORIAS_TARGET = 220` (220 concedidos) with same TODO comment
    - Define `TEAM_KPI_VISIBILITY: Record<string, string[]>` map (initially empty — all teams see defaults)
    - Define `DEFAULT_VISIBLE_KPIS = ['entregas-prazo', 'meta-protocolo', 'aposentadorias-concedidas']`
    - Export `isKpiVisibleForTeam(kpiId: string, teamId?: string): boolean` helper function
    - _Requirements: 3.2, 3.7, 4.2, 4.7, 6.1, 6.2, 6.3_

  - [x] 1.2 Write unit tests for `kpi-targets.constants.ts`
    - Test `isKpiVisibleForTeam` returns true for default KPIs when no team config exists
    - Test `isKpiVisibleForTeam` respects team-specific config when present
    - Test `isKpiVisibleForTeam` handles null/undefined teamId gracefully
    - _Requirements: 6.2, 6.3_

- [x] 2. Modify KPI_Service to remove numero-empresas and add new KPIs
  - [x] 2.1 Remove `numero-empresas` KPI generation from `KPI_Service.getPlayerKPIs()`
    - Remove all code blocks that create `{ id: 'numero-empresas', ... }` KPIData objects in the `selectedMonth` branch (delivery count path) and the `else` branch (extra.cnpj fallback path)
    - Remove the `numero-empresas` KPI from the error handler `catchError` blocks
    - Keep the `userActionDashboard.getDeliveryCount()` call only if other code depends on it; otherwise remove it
    - _Requirements: 1.1, 1.3_

  - [x] 2.2 Remove `numero-empresas` KPI generation from `KPI_Service.getPlayerKPIsForDateRange()`
    - Remove all code blocks that create `{ id: 'numero-empresas', ... }` KPIData objects in the main path and error handler
    - Keep the `userActionDashboard.getDeliveryCountInRange()` call only if other code depends on it; otherwise remove it
    - _Requirements: 1.1, 1.3_

  - [x] 2.3 Add `meta-protocolo` and `aposentadorias-concedidas` KPI generation to `KPI_Service.getPlayerKPIs()`
    - Import `META_PROTOCOLO_TARGET` and `APOSENTADORIAS_TARGET` from `kpi-targets.constants.ts`
    - After the existing `entregas-prazo` KPI push, add `meta-protocolo` KPI using `playerStatus.extra` fields for current value (fallback to 0)
    - Add `aposentadorias-concedidas` KPI using `playerStatus.extra` fields for current value (fallback to 0)
    - Use `this.getKPIColorByGoals()` for color calculation
    - Compute `superTarget` as `Math.ceil(target * 1.5)` for both
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

  - [x] 2.4 Add `meta-protocolo` and `aposentadorias-concedidas` KPI generation to `KPI_Service.getPlayerKPIsForDateRange()`
    - Mirror the same new KPI generation logic from 2.3 into the date-range method
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

  - [x] 2.5 Write unit tests for KPI_Service changes
    - Test `getPlayerKPIs()` returns zero items with `id === 'numero-empresas'`
    - Test `getPlayerKPIs()` returns items with `id === 'meta-protocolo'` and correct label, unit, target
    - Test `getPlayerKPIs()` returns items with `id === 'aposentadorias-concedidas'` and correct label, unit, target
    - Test `getPlayerKPIsForDateRange()` mirrors the same behavior
    - Test current values default to 0 when player extra data is missing
    - _Requirements: 1.1, 1.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

  - [x] 2.6 Write property test: numero-empresas exclusion invariant
    - **Property 1: numero-empresas exclusion invariant**
    - Generate random player extra data objects; assert `getPlayerKPIs()` output never contains `id === 'numero-empresas'`
    - **Validates: Requirements 1.1, 1.3**

  - [x] 2.7 Write property test: new KPIs structural correctness
    - **Property 2: New KPIs structural correctness**
    - Generate random player extra data; assert output contains `meta-protocolo` with correct label/unit/target and `aposentadorias-concedidas` with correct label/unit/target
    - **Validates: Requirements 3.1, 3.2, 4.1, 4.2**

- [x] 3. Checkpoint - Ensure KPI_Service changes compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update Gamification Dashboard enabledKPIs and team visibility
  - [x] 4.1 Update `enabledKPIs` getter in `gamification-dashboard.component.ts`
    - Import `isKpiVisibleForTeam` from `kpi-targets.constants.ts`
    - Replace the current pass-through getter with filtering logic:
      - Filter out `numero-empresas` (defensive, already removed at source)
      - Filter out `valor-concedido` for non-finance team members (using existing `isFinanceTeamMember()`)
      - Apply `isKpiVisibleForTeam(kpi.id)` for team-specific visibility
    - _Requirements: 1.5, 2.1, 2.2, 3.5, 4.5, 6.2_

  - [x] 4.2 Write unit tests for Gamification Dashboard enabledKPIs
    - Test that `enabledKPIs` excludes `numero-empresas`
    - Test that `enabledKPIs` includes `valor-concedido` only for finance team members
    - Test that `enabledKPIs` includes `meta-protocolo` and `aposentadorias-concedidas`
    - _Requirements: 1.5, 2.1, 2.2, 3.5, 4.5_

- [x] 5. Update Team Management Dashboard enabledKPIs and team visibility
  - [x] 5.1 Update `enabledKPIs` getter in `team-management-dashboard.component.ts`
    - Import `isKpiVisibleForTeam` from `kpi-targets.constants.ts`
    - Update the existing filter to also call `isKpiVisibleForTeam(kpi.id, this.selectedTeamId)` for team-specific visibility of new KPIs
    - Keep existing `numero-empresas` and `valor-concedido` filtering logic
    - _Requirements: 1.6, 2.3, 2.4, 3.6, 4.6, 6.4_

  - [x] 5.2 Write unit tests for Team Management Dashboard enabledKPIs
    - Test that `enabledKPIs` excludes `numero-empresas`
    - Test that `enabledKPIs` includes `valor-concedido` only for finance team
    - Test that `enabledKPIs` includes `meta-protocolo` and `aposentadorias-concedidas` for non-finance teams
    - Test team-specific visibility filtering with custom `TEAM_KPI_VISIBILITY` config
    - _Requirements: 1.6, 2.3, 2.4, 3.6, 4.6, 6.4_

  - [x] 5.3 Write property test: valor-concedido finance-only visibility
    - **Property 5: Valor-concedido finance-only visibility**
    - Generate random user profiles (finance/non-finance); assert `enabledKPIs` includes `valor-concedido` iff user is finance team
    - **Validates: Requirements 2.1, 2.3, 2.4**

  - [x] 5.4 Write property test: team-specific KPI visibility filtering
    - **Property 7: Team-specific KPI visibility filtering**
    - Generate random `TEAM_KPI_VISIBILITY` configs and random KPIData arrays; assert `enabledKPIs` returns only KPIs in the team's visibility list (or defaults when no config)
    - **Validates: Requirements 6.2, 6.4**

- [x] 6. Checkpoint - Ensure dashboard changes compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Fix goals meta value override bug
  - [x] 7.1 Investigate and fix `loadFinanceBillingKpiLikeTeamManagement()` in `gamification-dashboard.component.ts`
    - Review the `goalsKpi != null` branch: ensure that when `goalsKpi.target > 0`, the value is used directly and `paramTarget` does NOT override it
    - Review the `else` branch (Omie fallback): ensure `paramTarget` is only used as fallback when goals backend returns null
    - Add a console.warn log when goals backend returns null or zero target, indicating fallback to system param
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 7.2 Apply the same goals meta fix in `appendFinanceValorConcedidoKpiIfFinance()` in `team-management-dashboard.component.ts`
    - Ensure the same target resolution logic: goals backend target takes priority over `financeiro_monthly_billing_goal` param
    - When both goals backend and system param return 0, display with target 0 and color `red`
    - _Requirements: 5.3, 5.4, 5.5_

  - [x] 7.3 Add warning log in `GoalsReceitaBackendService` when template ID mismatch occurs
    - In `tryGetReceitaConcedidaKpi()`, if the resolved template ID does not match any log entries, log a warning indicating possible misconfiguration
    - _Requirements: 5.6_

  - [x] 7.4 Write unit tests for goals meta fix
    - Test that when `goalsKpi.target > 0`, the dashboard uses it directly (not overridden by system param)
    - Test that when `goalsKpi` is null, the dashboard falls back to `financeiro_monthly_billing_goal`
    - Test that when both return 0, the KPI bar shows target 0 and color `red`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.5 Write property test: goals target resolution with correct fallback
    - **Property 6: Goals target resolution with correct fallback**
    - Generate random `goalsKpi` results (null, zero target, positive target) and random `paramTarget` values; assert `targetBilling` equals `goalsKpi.target` when > 0, else equals `paramTarget`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `c4u-kpi-circular-progress` component already supports R$ currency formatting and count display — no component changes are needed
- The `src/app/constants/` directory is new and will be created with task 1.1
- Hardcoded targets include TODO comments for future migration to `metric_targets__c` or `System_Params_Service`
