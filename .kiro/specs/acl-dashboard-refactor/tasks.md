# Implementation Plan: ACL Dashboard Refactor

## Overview

Refactor the ACL system from team-based to Virtual Good-based access control, add the SUPERVISOR_TECNICO profile, redesign the SUPERVISOR dashboard with Card/Table views and Player Detail Modal, create a read-only secondary dashboard for SUPERVISOR_TECNICO, enhance the Month Filter with "Toda temporada", and differentiate points fields by profile. Tasks are ordered: foundation (ACL service, profile enum), then routing/guards, then new dashboard components, then existing dashboard integration, then Month Filter enhancement, and finally wiring and cleanup.

## Tasks

- [x] 1. Create ACL Service and update UserProfile enum
  - [x] 1.1 Add SUPERVISOR_TECNICO to UserProfile enum and update `determineUserProfile()`
    - In `src/app/utils/user-profile.ts`, add `SUPERVISOR_TECNICO = 'SUPERVISOR_TECNICO'` to the `UserProfile` enum
    - Add `SUPERVISAO_TECNICA: 'Fn2lrg3'` to `MANAGEMENT_TEAM_IDS`
    - Update `determineUserProfile()` to check for Fn2lrg3 with priority below SUPERVISOR (Fkmdmko) but above JOGADOR
    - Update `getAccessibleTeamIds()` to handle SUPERVISOR_TECNICO (same logic as GESTOR — filter out role team)
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 1.2 Update `UserProfileService` with SUPERVISOR_TECNICO methods
    - In `src/app/services/user-profile.service.ts`, add `isSupervisorTecnico(): boolean` method
    - Update `canAccessTeamManagement()` to include SUPERVISOR_TECNICO
    - _Requirements: 2.2, 5.3_

  - [x] 1.3 Create ACL Service for Virtual Good-based access control
    - Create `src/app/services/acl.service.ts`
    - Inject `FunifierApiService` and `SessaoProvider`
    - Implement `getPlayerCatalogItems(playerId: string): Observable<Record<string, { quantity: number; item: string }>>` — calls `GET /v3/player/:id/status` and extracts `catalog_items`
    - Implement `getAccessibleTeamIds(playerId: string): Observable<string[]>` — returns Virtual Good IDs where `quantity > 0`
    - Implement `hasTeamAccess(playerId: string, teamId: string): Observable<boolean>` — checks if specific Virtual Good has `quantity > 0`
    - Treat IDs as case-sensitive, treat missing or `quantity <= 0` items as no access
    - Cache results for 5 minutes using a simple in-memory cache with timestamp
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 15.5_

  - [x] 1.4 Implement ACL Metadata lookup in ACL Service
    - Add `getAclMetadata(): Observable<AclMetadata[]>` — fetches from `acl__c` custom collection
    - Define `AclMetadata` interface: `{ team_name: string; team_id: string; virtual_good_name: string; virtual_good_id: string }`
    - On error, fall back to raw IDs and log warning
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 1.5 Implement error handling in ACL Service
    - If Player Status API fails, log error and return empty access (deny management features)
    - If `catalog_items` is missing or malformed, treat as no Virtual Good access and log warning
    - If `acl__c` query fails, continue with raw IDs and log error
    - Display user-friendly notification on ACL verification error via `ToastService`
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 1.6 Write property test: Virtual Good possession determines team access
    - **Property 1: Virtual Good quantity > 0 grants access, quantity <= 0 or absent denies access**
    - Use `fast-check` to generate random `catalog_items` objects with varying quantities
    - Verify `getAccessibleTeamIds` returns only IDs with `quantity > 0`
    - **Validates: Requirements 1.2, 1.3, 1.4**

  - [x] 1.7 Write property test: Role determination priority
    - **Property 2: Role priority is DIRETOR > GESTOR > SUPERVISOR > SUPERVISOR_TECNICO > JOGADOR**
    - Use `fast-check` to generate random teams arrays with combinations of role team IDs
    - Verify `determineUserProfile` returns the highest-priority role present
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

  - [x] 1.8 Write property test: Case-sensitive Virtual Good ID matching
    - **Property 3: Virtual Good IDs are matched case-sensitively**
    - Use `fast-check` to generate ID strings with mixed case variations
    - Verify only exact case matches grant access
    - **Validates: Requirements 1.5**

  - [x] 1.9 Write property test: ACL cache returns same results within TTL
    - **Property 4: Cached ACL results are returned within 5-minute TTL**
    - Use `fast-check` to generate random catalog_items and timestamps
    - Verify cache hit within TTL, cache miss after TTL
    - **Validates: Requirements 15.5**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Update routing and dashboard redirect guard
  - [x] 3.1 Update `DashboardRedirectGuard` for new profiles and routes
    - In `src/app/guards/dashboard-redirect.guard.ts`, update the redirect logic:
    - JOGADOR → `/dashboard` (regular player dashboard, unchanged)
    - SUPERVISOR → `/dashboard/supervisor` (new supervisor dashboard)
    - SUPERVISOR_TECNICO → `/dashboard` (regular player dashboard with nav button to secondary)
    - GESTOR → `/dashboard/team-management` (existing, unchanged)
    - DIRETOR → `/dashboard/team-management` (existing, unchanged)
    - Block JOGADOR from accessing management dashboard URLs
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 3.2 Add new routes in `pages.routing.ts`
    - Add `supervisor` route: lazy-load new `DashboardSupervisorModule`
    - Add `supervisor-tecnico` route: lazy-load new `DashboardSupervisorTecnicoModule`
    - Keep existing `team-management` route unchanged
    - _Requirements: 14.2, 14.3_

  - [x] 3.3 Write property test: Profile-to-route mapping is deterministic
    - **Property 5: Each UserProfile maps to exactly one default route**
    - Use `fast-check` to generate all UserProfile enum values
    - Verify each profile always redirects to the same route
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5**

- [x] 4. Implement Dashboard Supervisor component (Card View and Table View)
  - [x] 4.1 Create Dashboard Supervisor module and component scaffold
    - Create `src/app/pages/dashboard/dashboard-supervisor/` directory
    - Create `dashboard-supervisor.module.ts` with lazy-loading setup
    - Create `dashboard-supervisor.component.ts` with basic structure: inject ACL Service, Player Service, Action Log Service
    - Create `dashboard-supervisor.component.html` with layout skeleton (left info card, main content area, client list section)
    - Create `dashboard-supervisor.component.scss`
    - _Requirements: 7.1, 10.1_

  - [x] 4.2 Implement left info card for SUPERVISOR's own metrics
    - In the dashboard-supervisor component, fetch SUPERVISOR's own player status
    - Display: SUPERVISOR name, points from `pontos_supervisor` field, coins from `coins` field, goals
    - Fetch cnpj metric from `extra.cnpj_sup` and entrega metric from `extra.entrega_sup` (not `extra.cnpj`/`extra.entrega`)
    - Apply Month Filter to the SUPERVISOR's own metrics
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 16.1_

  - [x] 4.3 Implement Card View (default view) for team players
    - Fetch players from all Operational Teams the SUPERVISOR has Virtual Good access to (via ACL Service)
    - Display one card per player: player name, current metrics and goals, assigned teams, points total
    - Deduplicate players appearing in multiple teams — show player once with all teams listed
    - Apply Month Filter to all player metrics
    - Set Card View as the default view on load
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.4 Implement Table View as alternative layout
    - Add toggle to switch between Card View and Table View
    - Display one row per player with columns: player name, metrics, goals, points total
    - Use the same data source and Month Filter as Card View
    - Preserve Month Filter selection and loaded data when switching views
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 4.5 Implement Player Detail Modal
    - Create modal component (or reuse `c4u-modal` pattern) for player detail
    - Open modal on card click (Card View) or row click (Table View)
    - Tab 1: Detailed player data + table of all CNPJs from `cnpj_resp` with metrics per CNPJ
    - Tab 2: All actions from Action_Log with columns: action name (`attributes.acao`), company (cross-ref `attributes.cnpj` with `empid_cnpj__c`), metrics, date, points (achievements)
    - On CNPJ row click, open the same company detail modal as the Clientes/Carteira table
    - Apply Month Filter to modal data; "Toda temporada" shows unfiltered data
    - Close on close button or outside click
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 8.3_

  - [x] 4.6 Implement SUPERVISOR metrics calculation (averages)
    - Calculate SUPERVISOR's points as arithmetic mean of all players' points across accessible teams
    - Calculate SUPERVISOR's KPI metrics as arithmetic mean of all players' KPI values
    - Exclude teams with zero players from average calculation (avoid division by zero)
    - Apply Month Filter to average calculations
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 4.7 Implement navigation button to legacy management dashboard
    - Add button on Dashboard Supervisor to navigate to `/dashboard/team-management`
    - The legacy dashboard uses Virtual Good-based ACL (consistent with new system)
    - Add return button on legacy dashboard to navigate back to `/dashboard/supervisor`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 4.8 Implement client list section at bottom of Dashboard Supervisor
    - Fetch SUPERVISOR's own clients from `cnpj_resp` on player status
    - Cross-reference with `empid_cnpj__c` for company names and individual metrics
    - Position below the Card View / Table View section
    - Apply Month Filter; "Toda temporada" shows unfiltered data
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 4.9 Write property test: Player deduplication across teams
    - **Property 6: Players appearing in multiple teams are shown once with all teams listed**
    - Use `fast-check` to generate player lists with overlapping team memberships
    - Verify each player appears exactly once in the output with all teams aggregated
    - **Validates: Requirements 7.3**

  - [x] 4.10 Write property test: SUPERVISOR average metrics exclude empty teams
    - **Property 7: Average calculation excludes teams with zero players**
    - Use `fast-check` to generate team sets with varying player counts (including zero)
    - Verify average is computed only over teams with players > 0
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [x] 4.11 Write property test: SUPERVISOR reads pontos_supervisor not points
    - **Property 8: SUPERVISOR points come from pontos_supervisor field**
    - Use `fast-check` to generate player objects with both `pontos_supervisor` and `points` fields
    - Verify the dashboard reads `pontos_supervisor` for SUPERVISOR profile
    - **Validates: Requirements 10.1, 10.4, 16.1**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Dashboard Supervisor Técnico (secondary read-only dashboard)
  - [x] 6.1 Create Dashboard Supervisor Técnico module and component
    - Create `src/app/pages/dashboard/dashboard-supervisor-tecnico/` directory
    - Create `dashboard-supervisor-tecnico.module.ts` with lazy-loading setup
    - Create `dashboard-supervisor-tecnico.component.ts` — similar to GESTOR dashboard but read-only
    - Create `dashboard-supervisor-tecnico.component.html` — display team KPIs, player lists, performance data
    - Create `dashboard-supervisor-tecnico.component.scss`
    - _Requirements: 6.1, 6.2_

  - [x] 6.2 Implement read-only team data display
    - Fetch visible teams via ACL Service (Virtual Good-based)
    - Display team KPIs, player lists, and performance data (same as GESTOR dashboard)
    - Remove all metric goal input fields (cnpj_goal, entrega_goal) — view is read-only
    - Show same KPI and progress information as GESTOR, excluding goal-setting controls
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

  - [x] 6.3 Add navigation between main dashboard and secondary dashboard
    - On Dashboard Colaborador (main view for SUPERVISOR_TECNICO), add button to navigate to `/dashboard/supervisor-tecnico`
    - On Dashboard Supervisor Técnico, add button to return to `/dashboard` (Dashboard Colaborador)
    - _Requirements: 5.3, 6.1, 6.5_

  - [x] 6.4 Write property test: SUPERVISOR_TECNICO dashboard has no goal inputs
    - **Property 9: Dashboard Supervisor Técnico never renders goal input fields**
    - Use `fast-check` to generate random team/player data configurations
    - Verify the rendered component contains no input elements for cnpj_goal or entrega_goal
    - **Validates: Requirements 6.3**

- [x] 7. Integrate Virtual Good ACL into existing GESTOR and DIRETOR dashboards
  - [x] 7.1 Update team-management-dashboard to use ACL Service for team visibility
    - In `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.component.ts`
    - Replace current team-based ACL logic with calls to ACL Service `getAccessibleTeamIds()`
    - For GESTOR: show teams where user has Virtual Good with `quantity > 0`
    - For DIRETOR: show all teams (existing behavior, but verify through Virtual Goods)
    - For SUPERVISOR accessing legacy dashboard: use same Virtual Good ACL
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 11.3_

  - [x] 7.2 Update player data loading to use Virtual Good-based team membership
    - In team-management-dashboard, load players belonging to Operational Teams for which user has Virtual Good access
    - Replace any `getAccessibleTeamIds()` calls from `UserProfileService` with ACL Service calls
    - _Requirements: 4.4_

  - [x] 7.3 Write property test: GESTOR/DIRETOR see only Virtual Good-authorized teams
    - **Property 10: Dashboard shows only teams where user has Virtual Good quantity > 0**
    - Use `fast-check` to generate catalog_items with mixed quantities
    - Verify only teams with `quantity > 0` appear in the dashboard
    - **Validates: Requirements 4.3, 4.4**

- [x] 8. Enhance Month Filter with "Toda temporada" option
  - [x] 8.1 Update `c4u-seletor-mes` component to include "Toda temporada"
    - In `src/app/components/c4u-seletor-mes/`, add a "Toda temporada" option to the month navigation
    - When "Toda temporada" is selected, emit `null` or a season-wide date range
    - When a specific month is selected, emit the month's start and end date range (existing behavior)
    - Default to current month on load
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 8.2 Ensure Month Filter is displayed on all dashboard views
    - Verify `c4u-seletor-mes` is present on: Dashboard Supervisor, Dashboard Supervisor Técnico, Dashboard Gestor, Dashboard Diretor, Dashboard Colaborador
    - Add the component to any dashboard template where it's missing
    - Ensure JOGADOR users also see the "Toda temporada" option
    - _Requirements: 13.5, 13.6_

  - [x] 8.3 Write property test: Month Filter emits correct date ranges
    - **Property 11: Specific month emits start/end of that month; "Toda temporada" emits null**
    - Use `fast-check` to generate random month selections
    - Verify date range boundaries are correct (first day 00:00 to last day 23:59)
    - **Validates: Requirements 13.2, 13.3**

- [x] 9. Implement points field differentiation by profile
  - [x] 9.1 Update points display logic across all dashboards
    - SUPERVISOR: read from `pontos_supervisor` field on player object
    - JOGADOR, GESTOR, DIRETOR, SUPERVISOR_TECNICO: read from `points` field
    - All profiles: read coins from `coins` field
    - Remove any display of locked points ("pontos bloqueados") from all dashboards
    - Update `src/app/services/kpi.service.ts` or relevant mapper to branch on UserProfile
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 9.2 Update SUPERVISOR-specific metric fields
    - Ensure Dashboard Supervisor reads `extra.cnpj_sup` for cnpj metric (not `extra.cnpj`)
    - Ensure Dashboard Supervisor reads `extra.entrega_sup` for entrega metric (not `extra.entrega`)
    - _Requirements: 12.5, 12.6, 10.5_

  - [x] 9.3 Write property test: Points field selection by profile
    - **Property 12: SUPERVISOR reads pontos_supervisor, others read points**
    - Use `fast-check` to generate player objects with both fields and random UserProfile values
    - Verify correct field is selected per profile
    - **Validates: Requirements 16.1, 16.2**

  - [x] 9.4 Write property test: No locked points displayed
    - **Property 13: No dashboard renders locked_points for any profile**
    - Use `fast-check` to generate player objects with `locked_points` field present
    - Verify the display output never includes locked_points
    - **Validates: Requirements 16.4**

  - [x] 9.5 Write property test: SUPERVISOR metrics use cnpj_sup and entrega_sup
    - **Property 14: SUPERVISOR cnpj metric comes from extra.cnpj_sup, entrega from extra.entrega_sup**
    - Use `fast-check` to generate player objects with both regular and _sup fields
    - Verify SUPERVISOR reads from _sup fields exclusively
    - **Validates: Requirements 10.5, 12.5, 12.6**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Final integration and wiring
  - [x] 11.1 Wire ACL Service into all dashboard components
    - Verify Dashboard Supervisor, Dashboard Supervisor Técnico, Dashboard Gestor, Dashboard Diretor all use ACL Service for team visibility
    - Verify no dashboard still uses the old team-membership-based ACL for data visibility
    - _Requirements: 1.1, 1.6, 4.3, 6.4_

  - [x] 11.2 Verify routing and navigation flows end-to-end
    - JOGADOR → Dashboard Colaborador (no management access)
    - SUPERVISOR → Dashboard Supervisor (Card/Table) → legacy dashboard → back
    - SUPERVISOR_TECNICO → Dashboard Colaborador → Dashboard Supervisor Técnico → back
    - GESTOR → Dashboard Gestor (team management)
    - DIRETOR → Dashboard Diretor (all teams)
    - Unauthenticated → login redirect
    - JOGADOR accessing management URL → redirect to player dashboard
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 11.3 Verify Month Filter integration across all dashboards
    - Confirm "Toda temporada" works on all 5 dashboard views
    - Confirm month selection filters data correctly on all views
    - _Requirements: 13.1, 13.5, 13.6_

  - [x] 11.4 Write property test: ACL Service is sole source of team visibility
    - **Property 15: All dashboard components derive team visibility from ACL Service, not team membership**
    - Use `fast-check` to generate user configurations where team membership and Virtual Good access differ
    - Verify dashboards show teams based on Virtual Good access, not team membership
    - **Validates: Requirements 1.1, 1.6, 2.7**

  - [x] 11.5 Write property test: Month Filter "Toda temporada" returns unfiltered data
    - **Property 16: When "Toda temporada" is selected, all data is returned without date filtering**
    - Use `fast-check` to generate datasets spanning multiple months
    - Verify all records are included when "Toda temporada" is active
    - **Validates: Requirements 7.6, 9.6, 13.3**

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check`
- The project is Angular/TypeScript with existing `fast-check` test infrastructure
- ACL Service caches results for 5 minutes to reduce API calls
- Zero_Mapping architecture means team_id = virtual_good_id (no conversion tables needed)
- SUPERVISOR uses `pontos_supervisor` for points and `extra.cnpj_sup`/`extra.entrega_sup` for metrics
