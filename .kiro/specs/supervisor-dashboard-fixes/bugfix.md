# Bugfix Requirements Document

## Introduction

The Supervisor Dashboard (`/dashboard/supervisor`) has three UI/UX issues that need to be fixed:

1. The left info card layout is wrong — everything above "Metas" (name, points/coins, supervisor's own KPI circles) shouldn't be there. The team averages section (currently below Metas) should be moved up to replace it. The card should show: supervisor name, then team averages (points, clientes, entregas, KPI circles), then goals.
2. The Team Management Dashboard (`/dashboard/team-management`) is missing a back-navigation option to return to the Supervisor Dashboard. The `c4u-dashboard-navigation` component only offers "Meu Painel" and "Gestão de Equipe" — it lacks a "Supervisor" option. This option should only appear for users with the SUPERVISOR profile.
3. The Clientes section at the bottom of the supervisor dashboard only has 2 tabs ("Carteira" and "Participação") but should have 3 tabs. Additionally, the data fetching is wrong — it should follow the same pattern as the regular gamification dashboard (using `playerService.getPlayerCnpjResp()` / `playerService.getPlayerCnpj()` + `cnpjLookupService.enrichCnpjListFull()` + `companyKpiService.enrichFromCnpjResp()`), not `companyService.getCompanies()`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the supervisor dashboard left info card renders THEN the system displays the supervisor's own data above "Metas" (name, points/coins from `pontos_supervisor`, supervisor's own KPI circles from `supervisorKPIs`) AND the team averages section below "Metas" (`averageKPIs`). The layout is inverted — the team averages should be the primary content since the supervisor's metrics are derived from their team(s).

1.2 WHEN the supervisor dashboard left info card renders THEN the system fetches the supervisor's own player data via `loadSupervisorInfoCard()` → `playerService.getRawPlayerData(playerId)` and builds `supervisorKPIs` from the supervisor's own `cnpj_resp` count and `entrega_sup` fields. This data is redundant because it duplicates what the team averages already show.

1.3 WHEN a user navigates from the supervisor dashboard to the Team Management Dashboard via the "Gestão de Equipe" button THEN the system provides no navigation option to return to the Supervisor Dashboard — the `c4u-dashboard-navigation` component only lists "Meu Painel" and "Gestão de Equipe" as options in its `dashboards` array.

1.4 WHEN the supervisor dashboard Clientes section renders THEN the system shows only 2 tabs: "Carteira" (supervisor's own `cnpj_resp` via `companyService.getCompanies(playerId)`) and "Participação" (team players' `extra.cnpj`), missing a team-aggregated carteira tab.

1.5 WHEN the "Carteira" tab is active in the supervisor dashboard THEN the system loads companies from `companyService.getCompanies(playerId)` which is the wrong data source. The regular gamification dashboard uses `playerService.getPlayerCnpjResp()` → `cnpjLookupService.enrichCnpjListFull()` → `companyKpiService.enrichFromCnpjResp()` pipeline instead.

1.6 WHEN the "Participação" tab loads data THEN the system uses a raw aggregate query on `player_status` to extract `extra.cnpj` from each player, instead of using the same `playerService.getPlayerCnpj()` → enrichment pipeline that the regular dashboard uses.

### Expected Behavior (Correct)

2.1 WHEN the supervisor dashboard left info card renders THEN the system SHALL display: (1) supervisor name, (2) team averages section (average points, average clientes, average entregas, average KPI circles from `averageKPIs`), (3) goals summary (Clientes and Entregas goals). The supervisor's own points/coins row and the supervisor's own KPI circles (`supervisorKPIs`) SHALL be removed from the card.

2.2 WHEN the supervisor dashboard loads THEN the system SHALL still fetch the supervisor's own player data to obtain the supervisor name and goals (cnpj_goal, entrega_goal), but SHALL NOT build or display `supervisorKPIs` circles. The `loadSupervisorInfoCard()` method should still run but only populate `supervisorInfo` for name and goals — not for KPI circles.

2.3 WHEN a user with the SUPERVISOR profile is on the Team Management Dashboard THEN the system SHALL include a "Supervisor" option in the `c4u-dashboard-navigation` component that navigates to `/dashboard/supervisor`, allowing the user to return to the supervisor dashboard. This option SHALL only be visible to users where `userProfileService.isSupervisor()` returns true.

2.4 WHEN a user who is NOT a SUPERVISOR (e.g., JOGADOR, GESTOR, DIRETOR) is on the Team Management Dashboard THEN the system SHALL NOT show the "Supervisor" navigation option.

2.5 WHEN the supervisor dashboard Clientes section renders THEN the system SHALL show 3 tabs: "Carteira equipe" (aggregated `cnpj_resp` from all team members), "Participação equipe" (aggregated `cnpj` from all team members), and "Carteira supervisor" (the supervisor's own `cnpj_resp`).

2.6 WHEN the "Carteira equipe" tab is active THEN the system SHALL aggregate `cnpj_resp` from ALL team members (collected from the already-loaded `playerCards` data or via aggregate query), then enrich using the same pipeline as the regular dashboard: `cnpjLookupService.enrichCnpjListFull()` → `companyKpiService.enrichFromCnpjResp()`.

2.7 WHEN the "Participação equipe" tab is active THEN the system SHALL aggregate `cnpj` (extra.cnpj) from ALL team members, then enrich using the same pipeline: `cnpjLookupService.enrichCnpjListFull()` → `companyKpiService.enrichFromCnpjResp()`.

2.8 WHEN the "Carteira supervisor" tab is active THEN the system SHALL load the supervisor's own `cnpj_resp` using `playerService.getPlayerCnpjResp(playerId)` → `cnpjLookupService.enrichCnpjListFull()` → `companyKpiService.enrichFromCnpjResp()` — the same pattern as the regular gamification dashboard's Carteira tab.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the supervisor dashboard loads THEN the system SHALL CONTINUE TO display the supervisor's name in the left info card.

3.2 WHEN the supervisor dashboard loads THEN the system SHALL CONTINUE TO display team average points, clientes, and entregas metrics (calculated from all team players).

3.3 WHEN the supervisor dashboard loads THEN the system SHALL CONTINUE TO display the goals summary (Clientes X/Y and Entregas X%/Y%) using the supervisor's own goal values from `cnpj_goal` and `entrega_goal`.

3.4 WHEN the supervisor dashboard loads THEN the system SHALL CONTINUE TO display player cards/table with correct per-player KPIs, points, and team assignments.

3.5 WHEN the `c4u-dashboard-navigation` component renders for a JOGADOR user THEN the system SHALL CONTINUE TO show only "Meu Painel" without the "Supervisor" option.

3.6 WHEN the `c4u-dashboard-navigation` component renders on the gamification dashboard THEN the system SHALL CONTINUE TO show the existing navigation options without changes.

3.7 WHEN the month filter is changed on the supervisor dashboard THEN the system SHALL CONTINUE TO reload all data (info card, players, clients) and reset the Clientes tabs.

3.8 WHEN the supervisor dashboard loads THEN the system SHALL CONTINUE TO fetch the supervisor's own player data to obtain the supervisor name and goals — only the display of supervisor-specific KPI circles and points/coins is removed from the left card.
