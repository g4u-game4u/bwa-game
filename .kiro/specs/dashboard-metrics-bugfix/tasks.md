# Implementation Plan

## Bug Condition Exploration Tests

- [x] 1. Write bug condition exploration tests (BEFORE implementing fix)
  - **Property 1: Bug Condition** - Dashboard Metrics Bugs
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  - **Test 1.1 - KPI Display Bug**: Test that `getPlayerKPIs` returns 2 KPIs when `player.extra.entrega` has a valid value and selectedMonth is a previous month (not current month)
    - Bug condition: `selectedMonth != currentMonth AND player.extra.entrega IS NOT NULL`
    - Expected: Array with 2 KPIs including "Entregas no Prazo"
    - Actual on unfixed code: Array with 1 KPI (missing "Entregas no Prazo")
  - **Test 1.2 - Tarefas Finalizadas Bug**: Test that `loadSeasonProgressDetails` sets `tarefasFinalizadas` to month-specific count, not all-time count
    - Bug condition: Always (implementation ignores selectedMonth)
    - Expected: Count of action_log entries for selected month only
    - Actual on unfixed code: All-time count
  - **Test 1.3 - Metas Calculation Bug**: Test that metas calculation uses `entrega` vs `entrega_goal` and `cnpj_resp count` vs `cnpj_goal`, showing X/2
    - Bug condition: Always (implementation uses KPIs instead of player.extra goals)
    - Expected: X/2 where X = (entrega >= entrega_goal ? 1 : 0) + (cnpj_resp count >= cnpj_goal ? 1 : 0)
    - Actual on unfixed code: Uses KPI-based calculation with variable denominator
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

## Preservation Property Tests

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Dashboard Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - **Test 2.1 - Clientes na Carteira KPI Preservation**: Observe and verify that "Clientes na Carteira" KPI continues to be calculated from `player.extra.cnpj_resp` with target from `player.extra.cnpj_goal`
  - **Test 2.2 - Current Month KPI Preservation**: Observe and verify that KPIs for current month continue to work correctly (both KPIs displayed when entrega exists)
  - **Test 2.3 - Default Goals Preservation**: Observe and verify that fallback values (entrega_goal=90, cnpj_goal=10) are used when goals not defined in player.extra
  - **Test 2.4 - Action Log Filter Preservation**: Observe and verify that action_log queries continue to filter by userId (player email)
  - **Test 2.5 - Null Safety Preservation**: Observe and verify that seasonProgress null-safety is maintained (skip update if null)
  - Write property-based tests capturing observed behavior patterns
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Implementation

- [x] 3. Fix Bug 1 - KPI Display (Entregas no Prazo)

  - [x] 3.1 Remove isCurrentMonth check in kpi.service.ts
    - Locate `getPlayerKPIs` method in `src/app/services/kpi.service.ts`
    - Remove the `if (isCurrentMonth && ...)` condition that wraps the "Entregas no Prazo" KPI creation
    - Keep the check for `playerStatus.extra?.entrega` to ensure KPI only shows when data exists
    - Apply fix in both the actionLogService branch and the fallback branch
    - _Bug_Condition: isBugCondition_KPIDisplay(input) where selectedMonth != currentMonth AND player.extra.entrega IS NOT NULL_
    - _Expected_Behavior: getPlayerKPIs returns array with 2 KPIs including "Entregas no Prazo" when entrega value exists_
    - _Preservation: Clientes na Carteira KPI calculation unchanged, current month behavior unchanged_
    - _Requirements: 2.1, 2.2_

- [x] 4. Fix Bug 2 - Tarefas Finalizadas (Monthly Count)

  - [x] 4.1 Replace method call in gamification-dashboard.component.ts
    - Locate `loadSeasonProgressDetails` method in `src/app/pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts`
    - Change from `this.actionLogService.getCompletedTasksCount(playerId)` to `this.actionLogService.getAtividadesFinalizadas(playerId, this.selectedMonth)`
    - Ensure `this.selectedMonth` is available in the method scope
    - _Bug_Condition: isBugCondition_TarefasFinalizadas(input) - always true (implementation ignores selectedMonth)_
    - _Expected_Behavior: seasonProgress.tarefasFinalizadas equals count of action_log entries for selected month only_
    - _Preservation: Action log userId filtering unchanged, other progress data unchanged_
    - _Requirements: 2.3, 2.4_

- [x] 5. Fix Bug 3 - Metas (Goals-Based Calculation)

  - [x] 5.1 Refactor updateMetasFromKPIs to updateMetasFromPlayerGoals
    - Locate `updateMetasFromKPIs` method in `src/app/pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts`
    - Rename method from `updateMetasFromKPIs` to `updateMetasFromPlayerGoals`
    - Remove KPIs parameter - method should not receive KPIs array
    - Read values from `this.playerStatus.extra`: entrega, entrega_goal, cnpj_resp, cnpj_goal
    - Calculate entrega achievement: `entrega >= entrega_goal` (fallback: 90)
    - Calculate cnpj achievement: `cnpj_resp count >= cnpj_goal` (fallback: 10)
    - Set metas.current = count of achieved goals (0, 1, or 2)
    - Set metas.target = 2 (fixed denominator - duas metas)
    - Update caller in `loadKPIData` to call renamed method without KPIs parameter
    - _Bug_Condition: isBugCondition_MetasCalculation(input) - always true (implementation uses KPIs instead of player.extra goals)_
    - _Expected_Behavior: metas = { current: X, target: 2 } where X = (entrega >= entrega_goal ? 1 : 0) + (cnpj_resp count >= cnpj_goal ? 1 : 0)_
    - _Preservation: Default fallback values (entrega_goal=90, cnpj_goal=10) preserved_
    - _Requirements: 2.5, 2.6_

## Verification

- [x] 6. Verify bug condition exploration tests now pass
  - **Property 1: Expected Behavior** - Dashboard Metrics Fixed
  - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
  - The tests from task 1 encode the expected behavior
  - When these tests pass, it confirms the expected behavior is satisfied
  - Run bug condition exploration tests from step 1
  - **EXPECTED OUTCOME**: Tests PASS (confirms bugs are fixed)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [-] 7. Verify preservation tests still pass
  - **Property 2: Preservation** - Existing Dashboard Behavior
  - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
  - Run preservation property tests from step 2
  - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
  - Confirm all tests still pass after fix (no regressions)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Checkpoint

- [ ] 8. Checkpoint - Ensure all tests pass
  - Run full test suite to verify all tests pass
  - Verify no TypeScript compilation errors
  - Verify no linting errors
  - Ask the user if questions arise
