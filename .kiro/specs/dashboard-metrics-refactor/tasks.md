# Implementation Plan: Dashboard Metrics Refactor

## Overview

Refactor dashboard metrics and cards across the Angular application: remove Processos cards, migrate CNPJ data source to `cnpj_resp`, add goal setting for supervisors/gestors, feed dynamic goals into KPI circular components, and simplify activity counts. Tasks are ordered to handle data-layer changes first (CNPJ migration, activity simplification), then UI removals, then new features (goal setting, dynamic goals), and finally wiring and integration.

## Tasks

- [x] 1. Migrate CNPJ data source from `extra.cnpj` to `extra.cnpj_resp`
  - [x] 1.1 Update `kpi.service.ts` to read `extra.cnpj_resp` instead of `extra.cnpj`
    - In `getPlayerKPIs()`, replace all reads of `playerStatus.extra?.cnpj` with `playerStatus.extra?.cnpj_resp` (main path, error path, fallback path)
    - Ensure the split logic `split(/[;,]/).map(s => s.trim()).filter(s => s.length > 0)` is preserved
    - If `cnpj_resp` is null or empty, return company count of zero
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 1.2 Update `company.service.ts` to read `extra.cnpj_resp` instead of `extra.companies` and `extra.cnpj`
    - In `getCompanies()`, replace `playerResponse?.extra?.companies` with `playerResponse?.extra?.cnpj_resp`
    - Remove all references to `player.extra.cnpj` and `player.extra.companies`
    - _Requirements: 2.3, 2.5_

  - [x] 1.3 Update `team-management-dashboard.component.ts` to read `cnpj_resp` from player_status extra data
    - In `loadTeamKPIs()`, replace reads of `extra.cnpj` with `extra.cnpj_resp` for "Clientes na Carteira" metric calculation
    - Update any comments referencing `extra.cnpj` to `extra.cnpj_resp`
    - _Requirements: 3.1, 3.4, 3.5_

  - [x] 1.4 Write property test: CNPJ parsing from cnpj_resp produces correct count
    - **Property 1: CNPJ parsing from cnpj_resp produces correct count**
    - Use `fast-check` to generate random comma/semicolon-separated strings
    - Verify split/trim/filter count matches expected non-empty entries
    - Test edge cases: null, undefined, empty string, whitespace-only → count 0
    - **Validates: Requirements 2.2, 2.4**

  - [x] 1.5 Write property test: Player CNPJ lookups use cnpj_resp exclusively
    - **Property 2: Player CNPJ lookups use cnpj_resp exclusively**
    - Use `fast-check` to generate player objects with both `cnpj` and `cnpj_resp` fields
    - Verify the service reads from `cnpj_resp` and ignores `cnpj`
    - **Validates: Requirements 2.1, 2.3, 3.1, 3.4**

- [x] 2. Verify action_log queries preserve `attributes.cnpj` field
  - Confirm `action-log.service.ts` uses `attributes.cnpj` in action_log query filters (no change needed, just verify)
  - Confirm `team-aggregate.service.ts` uses `attributes.cnpj` in aggregate query filters (no change needed, just verify)
  - _Requirements: 3.2, 3.3_

- [x] 3. Simplify activity count in carteira table
  - [x] 3.1 Remove processCount query from `action-log.service.ts`
    - In `getPlayerCnpjListWithCount()`, remove the separate aggregate query that counts distinct `delivery_id` values per CNPJ
    - Update return type to `Observable<{ cnpj: string; actionCount: number }[]>` (remove `processCount`)
    - _Requirements: 6.1, 6.4_

  - [x] 3.2 Remove `uniqueProcesses` and `processCount` from `team-aggregate.service.ts`
    - In `getTeamCnpjListWithCount()`, remove `uniqueProcesses: { $addToSet: '$attributes.delivery_id' }` from `$group`
    - Remove `processCount: { $size: '$uniqueProcesses' }` from `$project`
    - Update return type to remove `processCount`
    - _Requirements: 6.2, 6.5_

  - [x] 3.3 Update carteira table template to show only action_log count with "tarefas" label
    - Remove the `{{ cliente.processCount }} processos` span from the template
    - Ensure `{{ cliente.actionCount }} tarefas` is displayed
    - Update `CompanyDisplay` interface to remove `processCount` field
    - _Requirements: 6.3_

  - [x] 3.4 Verify month filter constrains action_log counts
    - Confirm that `getPlayerCnpjListWithCount` and `getTeamCnpjListWithCount` filter by the selected month date range
    - _Requirements: 6.6_

  - [x] 3.5 Write property test: Activity count equals total action_log entries
    - **Property 10: Activity count equals total action_log entries**
    - Use `fast-check` to generate random action_log datasets with varying `delivery_id` values
    - Verify the returned count equals total entries, not distinct `delivery_id` count
    - **Validates: Requirements 6.1, 6.2**

  - [x] 3.6 Write property test: Month filter constrains action_log counts
    - **Property 11: Month filter constrains action_log counts**
    - Use `fast-check` to generate action_log entries across multiple months
    - Verify only entries within the selected month are counted
    - **Validates: Requirements 6.6**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Remove Processos cards from all views
  - [x] 5.1 Remove processInfo panel from `dados-mes-atual` component
    - In `dados-mes-atual.component.html`, remove the second `<c4u-painel-info>` that renders `processInfo`
    - In `dados-mes-atual.component.ts`, remove the `processInfo` array population in `defineDadosMesAtual()`
    - Remove the `processInfo` entry from `dataModal.types` in `abreModal`
    - _Requirements: 1.1, 1.3_

  - [x] 5.2 Remove processInfo panel from `dados-mes-anterior` component
    - In `dados-mes-anterior.component.html`, remove the second `<c4u-painel-info>` that renders `processInfo`
    - In `dados-mes-anterior.component.ts`, remove the `processInfo` array population in `defineDadosMesAnterior()`
    - Remove the `processInfo` entry from `dataModal.types` in `abreModal`
    - _Requirements: 1.2, 1.4_

  - [x] 5.3 Remove Processos section from `c4u-activity-progress` component
    - In `c4u-activity-progress.component.html`, remove the entire "Processos" `<div class="section">` block
    - Keep the `processos` `@Input()` in the TypeScript file for backward compatibility
    - _Requirements: 1.5_

- [x] 6. Implement goal setting for SUPERVISOR and GESTOR
  - [x] 6.1 Expand goal form in `team-management-dashboard.component.ts`
    - Rename `metaConfig` to include both goals: `{ selectedCollaborator: string; cnpjGoalValue: number | null; entregaGoalValue: number | null }`
    - Rename `saveClientesMeta()` → `saveGoals()` to save both `cnpj_goal` and `entrega_goal`
    - Rename `updatePlayerClientesTarget()` → `updatePlayerGoals()` to PUT both fields
    - Add validation: `cnpj_goal` ≥ 0 integer, `entrega_goal` 0–100
    - For "Todos os Colaboradores", iterate and send individual PUT requests per collaborator
    - Show success toast on save, error toast per collaborator on failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.2 Update goal form template in `team-management-dashboard.component.html`
    - Update section title from "Configurar Meta de Clientes" to "Configurar Metas"
    - Add second input field for `entrega_goal` with label "Meta de Entregas no Prazo (%)"
    - Set input attributes: `type="number"`, `min="0"`, `max="100"` for entrega_goal; `type="number"`, `min="0"`, `step="1"` for cnpj_goal
    - Disable submit button when form is invalid
    - Update form submission to call `saveGoals()`
    - _Requirements: 4.1, 4.7_

  - [x] 6.3 Write property test: Goal save API payload structure
    - **Property 3: Goal save API payload structure**
    - Use `fast-check` to generate valid `cnpj_goal` and `entrega_goal` values
    - Verify PUT request body matches `{"extra": {"cnpj_goal": value}}` and `{"extra": {"entrega_goal": value}}`
    - **Validates: Requirements 4.2, 4.3**

  - [x] 6.4 Write property test: Bulk goal save sends one request per collaborator
    - **Property 4: Bulk goal save sends one request per collaborator**
    - Use `fast-check` to generate random team sizes (1–50)
    - Verify exactly N PUT requests are issued for N collaborators
    - **Validates: Requirements 4.4**

  - [x] 6.5 Write property test: Goal form validation
    - **Property 5: Goal form validation**
    - Use `fast-check` to generate random numbers (integers, floats, negatives, out-of-range)
    - Verify `cnpj_goal` accepts only non-negative integers, `entrega_goal` accepts only 0–100
    - **Validates: Requirements 4.7**

- [x] 7. Feed dynamic goals into existing KPI circular components
  - [x] 7.1 Update `kpi.service.ts` to read `cnpj_goal` and `entrega_goal` from player extra
    - Replace reads of `extra.client_goals` with `extra.cnpj_goal` for "Clientes na Carteira" target
    - Replace hardcoded `90` with `extra.entrega_goal` for "Entregas no Prazo" target
    - Default `cnpj_goal` to 10 if null/undefined, default `entrega_goal` to 90 if null/undefined
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 7.2 Update `loadTeamKPIs()` in `team-management-dashboard.component.ts` for dynamic team goals
    - Aggregate `extra.cnpj_goal` (sum) for team-level "Clientes na Carteira" target, defaulting each member to 10
    - Aggregate `extra.entrega_goal` (average) for team-level "Entregas no Prazo" target, defaulting each member to 90
    - Replace reads of `extra.client_goals` and hardcoded 90
    - _Requirements: 5.5, 5.6_

  - [x] 7.3 Write property test: Dynamic cnpj_goal target in KPI
    - **Property 6: Dynamic cnpj_goal target in KPI**
    - Use `fast-check` to generate player objects with/without `cnpj_goal`
    - Verify KPI target equals `cnpj_goal` when set, defaults to 10 when null/undefined
    - **Validates: Requirements 5.1, 5.3**

  - [x] 7.4 Write property test: Dynamic entrega_goal target in KPI
    - **Property 7: Dynamic entrega_goal target in KPI**
    - Use `fast-check` to generate player objects with/without `entrega_goal`
    - Verify KPI target equals `entrega_goal` when set, defaults to 90 when null/undefined
    - **Validates: Requirements 5.2, 5.4**

  - [x] 7.5 Write property test: Team cnpj_goal target is sum of members
    - **Property 8: Team cnpj_goal target is sum of members**
    - Use `fast-check` to generate teams with random `cnpj_goal` values (some null)
    - Verify team target equals sum of all individual goals (defaulting nulls to 10)
    - **Validates: Requirements 5.5**

  - [x] 7.6 Write property test: Team entrega_goal target is average of members
    - **Property 9: Team entrega_goal target is average of members**
    - Use `fast-check` to generate teams with random `entrega_goal` values (some null)
    - Verify team target equals arithmetic mean of all individual goals (defaulting nulls to 90)
    - **Validates: Requirements 5.6**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Verify c4u-kpi-circular-progress component requires no changes
  - Confirm the component already accepts `target` as an `@Input()` and renders the goal display
  - No new goal display UI is created
  - _Requirements: 5.7_

- [x] 10. Final integration and cleanup
  - [x] 10.1 Verify zero references to `player.extra.cnpj` remain in the codebase
    - Search all services, components, and templates for `extra.cnpj` (excluding `extra.cnpj_resp`, `extra.cnpj_goal`, and `attributes.cnpj`)
    - Remove or update any remaining references
    - _Requirements: 2.5, 3.5_

  - [x] 10.2 Verify zero references to `extra.client_goals` remain in the codebase
    - Search all services and components for `client_goals`
    - Remove or update any remaining references
    - _Requirements: 5.1, 5.2_

  - [x] 10.3 Verify zero references to `extra.companies` remain in the codebase
    - Search all services and components for `extra.companies`
    - Remove or update any remaining references
    - _Requirements: 2.3_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check`
- The `c4u-kpi-circular-progress` component requires no code changes — it already accepts dynamic `target` input
- Action_log queries retain `attributes.cnpj` unchanged — only player-level CNPJ lookups migrate to `cnpj_resp`
