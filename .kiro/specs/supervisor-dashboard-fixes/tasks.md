# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Supervisor Dashboard Layout, Navigation, and Data Fetching Bugs
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three bugs exist
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases:
    - Bug 1 (Layout): The supervisor dashboard HTML contains `supervisorKPIs` circles and points/coins wallet rows in the left info card, AND team averages appear below goals instead of above
    - Bug 2 (Navigation): The `c4u-dashboard-navigation` component's `dashboards` array does NOT contain a "Supervisor" option with route `/dashboard/supervisor`
    - Bug 3 (Tabs/Data): The `clientesActiveTab` type only allows 2 values (`'carteira' | 'participacao'`), missing a third tab; `loadClientList()` uses `companyService.getCompanies()` instead of the enrichment pipeline
  - Test assertions for expected behavior:
    - The HTML template should NOT contain `supervisorKPIs` section or points/coins wallet rows
    - The HTML template should show team averages section BEFORE the goals section
    - The `dashboards` array should include a "Supervisor" option filtered to SUPERVISOR users only
    - The `clientesActiveTab` type should support 3 tab values
    - Data fetching should use `playerService.getPlayerCnpjResp()` → `cnpjLookupService.enrichCnpjListFull()` → `companyKpiService.enrichFromCnpjResp()` pipeline
  - Run test on UNFIXED code - expect FAILURE (this confirms the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Supervisor Dashboard Preserved Behaviors
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: Supervisor name is displayed in the left info card from `supervisorInfo.name`
    - Observe: Team average points, clientes, entregas are calculated correctly from `playerCards` via `calculateAverages()`
    - Observe: Goals summary displays `supervisorInfo.cnpjMetric / cnpjGoal` and `supervisorInfo.entregaMetric / entregaGoal`
    - Observe: Player cards/table render with correct per-player KPIs, points, and team assignments
    - Observe: `c4u-dashboard-navigation` shows "Meu Painel" for JOGADOR users only
    - Observe: `c4u-dashboard-navigation` shows "Gestão de Equipe" for management users
    - Observe: Month filter change triggers reload of info card, players, and clients
    - Observe: `loadSupervisorInfoCard()` fetches supervisor name and goals from `playerService.getRawPlayerData()`
  - Write property-based tests capturing observed behavior patterns:
    - For all supervisor dashboard loads, `supervisorInfo.name` is populated from player data
    - For all non-empty `playerCards`, `averagePoints === sum(points) / count` (arithmetic mean)
    - For all `playerCards`, `averageCnpjMetric === sum(cnpjMetric) / count`
    - For all JOGADOR users, navigation shows "Meu Painel" and NOT "Supervisor"
    - For all non-SUPERVISOR management users (GESTOR, DIRETOR), navigation does NOT show "Supervisor"
    - For all month changes, `loadSupervisorInfoCard()`, `loadTeamPlayers()`, and client data reload
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix supervisor dashboard left info card layout

  - [x] 3.1 Remove supervisor points/coins and KPI circles from the left info card HTML
    - In `dashboard-supervisor.component.html`, remove the "Points & Coins" `wallet-section` div (the rows showing `supervisorInfo.points` and `supervisorInfo.coins`)
    - Remove the `kpi-section` div that renders `supervisorKPIs` via `c4u-kpi-circular-progress` components
    - Move the `averages-section` (team averages) to appear ABOVE the `goals-section` in the card layout
    - Keep the supervisor name display (`supervisor-name` div) at the top
    - Keep the goals summary (`goals-section`) at the bottom
    - Final card order: Name → Team Averages (points, clientes, entregas, KPI circles) → Goals
    - _Bug_Condition: isBugCondition(template) where template contains supervisorKPIs section AND wallet-section with points/coins AND averages-section is below goals-section_
    - _Expected_Behavior: Template shows Name → Team Averages → Goals without supervisor-specific KPI circles or points/coins_
    - _Preservation: Supervisor name, team averages calculation, and goals display remain unchanged_
    - _Requirements: 2.1_

  - [x] 3.2 Remove `supervisorKPIs` property and `buildSupervisorKPIs()` method from the component TypeScript
    - In `dashboard-supervisor.component.ts`, remove the `supervisorKPIs: KPIData[] = []` property declaration
    - Remove the `buildSupervisorKPIs()` private method entirely
    - Remove the line `this.supervisorKPIs = this.buildSupervisorKPIs(...)` from `loadSupervisorInfoCard()`
    - Keep `loadSupervisorInfoCard()` — it still needs to populate `supervisorInfo` for name and goals
    - Keep `supervisorInfo` interface and its population (name, cnpjMetric, entregaMetric, cnpjGoal, entregaGoal)
    - Optionally remove `points` and `coins` from `SupervisorInfoCard` interface since they are no longer displayed
    - _Bug_Condition: Component has supervisorKPIs property and buildSupervisorKPIs method_
    - _Expected_Behavior: supervisorKPIs removed; loadSupervisorInfoCard only populates name and goals_
    - _Preservation: supervisorInfo.name and goals still populated correctly_
    - _Requirements: 2.2, 3.1, 3.3, 3.8_

  - [x] 3.3 Inject `CompanyKpiService` and rewrite Clientes section to 3 tabs with enrichment pipeline
    - In `dashboard-supervisor.component.ts`, inject `CompanyKpiService` in the constructor
    - Change `clientesActiveTab` type from `'carteira' | 'participacao'` to `'carteira-equipe' | 'participacao-equipe' | 'carteira-supervisor'`
    - Add new properties: `carteiraEquipeClientes: CompanyDisplay[]`, `participacaoEquipeClientes: CompanyDisplay[]`, `carteiraSupervisorClientes: CompanyDisplay[]` with corresponding loading flags
    - Add shared maps: `cnpjNameMap`, `cnpjStatusMap`, `cnpjNumberMap` (same pattern as gamification dashboard)
    - Rewrite `loadClientList()` → `loadCarteiraSupervisor()`: use `playerService.getPlayerCnpjResp(playerId)` → `cnpjLookupService.enrichCnpjListFull()` → `companyKpiService.enrichFromCnpjResp()` (same pipeline as gamification dashboard's `loadClientesData()`)
    - Add `loadCarteiraEquipe()`: aggregate `cnpj_resp` from all `playerCards` (or re-fetch via aggregate), deduplicate, then enrich with same pipeline
    - Rewrite `loadParticipacaoData()` → `loadParticipacaoEquipe()`: aggregate `cnpj` (extra.cnpj) from all team players, then enrich with `cnpjLookupService.enrichCnpjListFull()` → `companyKpiService.enrichFromCnpjResp()` (instead of raw aggregate + manual enrichment)
    - Update `switchClientesTab()` to handle 3 tab values and trigger lazy loading for each
    - Remove old `clientRows: SupervisorClientRow[]` and `participacaoCnpjs` properties (replaced by new CompanyDisplay arrays)
    - _Bug_Condition: clientesActiveTab only supports 2 values; loadClientList uses companyService.getCompanies(); loadParticipacaoData uses raw aggregate_
    - _Expected_Behavior: 3 tabs with enrichment pipeline matching gamification dashboard pattern_
    - _Preservation: Month filter reset still works; client data still loads correctly_
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 3.7_

  - [x] 3.4 Update the HTML template for the 3-tab Clientes section
    - In `dashboard-supervisor.component.html`, update the Clientes sub-tabs to show 3 buttons: "Carteira equipe", "Participação equipe", "Carteira supervisor"
    - Update each tab's `*ngIf` conditions to match the new `clientesActiveTab` values (`'carteira-equipe'`, `'participacao-equipe'`, `'carteira-supervisor'`)
    - Update table columns to display `CompanyDisplay` data (empresa name from `cnpjNameMap`, CNPJ number from `cnpjNumberMap`, entregas from `deliveryKpi`, classificação)
    - Add loading/empty states for each tab using the new loading flags
    - _Requirements: 2.5, 2.6, 2.7, 2.8_

  - [x] 3.5 Add "Supervisor" option to `c4u-dashboard-navigation` component
    - In `c4u-dashboard-navigation.component.ts`, add a new entry to the `dashboards` array:
      ```typescript
      {
        label: 'Supervisor',
        route: '/dashboard/supervisor',
        icon: 'ri-user-star-line',
        requiresRole: ROLES_LIST.ACCESS_TEAM_MANAGEMENT
      }
      ```
    - Update `filterAvailableDashboards()` to filter the "Supervisor" option so it only appears when `userProfileService.isSupervisor()` returns true
    - The filtering logic: for the "Supervisor" dashboard option, check `this.userProfileService.isSupervisor()` — if false, exclude it
    - Ensure "Meu Painel" continues to show only for JOGADOR, "Gestão de Equipe" continues to show for management users
    - _Bug_Condition: dashboards array does not contain "Supervisor" option_
    - _Expected_Behavior: "Supervisor" option appears for SUPERVISOR users only, navigates to /dashboard/supervisor_
    - _Preservation: Existing "Meu Painel" and "Gestão de Equipe" filtering unchanged_
    - _Requirements: 2.3, 2.4, 3.5, 3.6_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Supervisor Dashboard Layout, Navigation, and Data Fetching Fixes
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied:
      - HTML no longer contains supervisorKPIs section or points/coins wallet rows
      - Team averages appear before goals in the left info card
      - Navigation includes "Supervisor" option for SUPERVISOR users
      - Clientes section supports 3 tabs with correct enrichment pipeline
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Supervisor Dashboard Preserved Behaviors
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix:
      - Supervisor name still displayed
      - Team averages still calculated correctly
      - Goals summary still shows correct values
      - Player cards/table still render correctly
      - Navigation for JOGADOR/GESTOR/DIRETOR unchanged
      - Month filter still triggers full reload

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to verify no regressions
  - Verify supervisor dashboard renders correctly with new layout
  - Verify navigation component shows "Supervisor" option only for SUPERVISOR users
  - Verify all 3 Clientes tabs load data using the enrichment pipeline
  - Ensure all tests pass, ask the user if questions arise
