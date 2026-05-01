# Requirements Document

## Introduction

Revision of the KPI circular progress bars across all dashboards in the gamification application. This feature removes the "Clientes atendidos" KPI bar, adds two new KPI bars ("Meta de protocolo" and "Aposentadorias concedidas"), and fixes a bug where the goals endpoint overwrites the correct meta value with a hardcoded fallback. The changes affect the gamification-dashboard (player view), team-management-dashboard (manager view), and the season progress card.

## Glossary

- **KPI_Service**: The Angular service (`kpi.service.ts`) responsible for generating base KPI data arrays for players, including `numero-empresas` and `entregas-prazo` KPIs.
- **KPI_Circular_Progress_Component**: The reusable Angular component (`c4u-kpi-circular-progress`) that renders a circular progress bar with label, current value, target, superTarget, color, and unit inputs.
- **Gamification_Dashboard**: The main player-facing dashboard component (`gamification-dashboard.component.ts`) that displays KPI bars, season progress, and activity data.
- **Team_Management_Dashboard**: The manager-facing dashboard component (`team-management-dashboard.component.ts`) that displays aggregated team KPI bars and per-collaborator views.
- **Season_Progress_Card**: The `c4u-season-progress` component that displays season-level progress metrics including metas achieved count derived from KPI data.
- **Goals_Receita_Backend_Service**: The service (`goals-receita-backend.service.ts`) that reads meta and accumulated value for "Valor concedido" from the G4U backend via `/goals/logs` and `/goals/templates`.
- **System_Params_Service**: The service that reads team-wide configuration parameters (e.g., `financeiro_monthly_billing_goal`) from the backend.
- **KPIData**: The TypeScript interface defining KPI bar data: id, label, current, target, superTarget, unit, color, percentage, animateProgressFromPercent, progressEvolutionLabel.
- **enabledKPIs**: A getter property on dashboard components that filters the raw KPI array to determine which bars are rendered in the UI.
- **Finance_Team**: The team identified by team_id '6' or team name containing "financeiro", which receives the "Valor concedido" KPI bar.
- **Meta_de_Protocolo**: A new KPI bar tracking financial volume progress in R$ currency (e.g., meta R$ 1.000.000, realizado R$ 446.000).
- **Aposentadorias_Concedidas**: A new KPI bar tracking retirement/concession count (e.g., meta 220 concedidos).
- **metric_targets__c**: The backend database collection queried by KPI_Service.getMetricTargets() that stores KPI names, order, and target values.

## Requirements

### Requirement 1: Remove "Clientes atendidos" KPI bar from all dashboards

**User Story:** As a product owner, I want the "Clientes atendidos" KPI bar removed from all dashboard views, so that the dashboard only displays relevant and current KPIs.

#### Acceptance Criteria

1. WHEN the Gamification_Dashboard loads KPI data, THE KPI_Service SHALL exclude the KPI with id `numero-empresas` from the returned KPIData array.
2. WHEN the Team_Management_Dashboard loads team KPI data, THE Team_Management_Dashboard SHALL exclude the KPI with id `numero-empresas` from the teamKPIs array.
3. WHEN the KPI_Service generates KPIs for a date range (season), THE KPI_Service SHALL exclude the KPI with id `numero-empresas` from the returned KPIData array.
4. WHEN the Season_Progress_Card calculates metas achieved, THE dashboard component SHALL compute the count based only on KPIs that do not include `numero-empresas`.
5. THE enabledKPIs getter on Gamification_Dashboard SHALL return a KPIData array that contains zero items with id `numero-empresas`.
6. THE enabledKPIs getter on Team_Management_Dashboard SHALL return a KPIData array that contains zero items with id `numero-empresas`.

### Requirement 2: Finance team displays only "Valor concedido" after removal

**User Story:** As a finance team member, I want to see only the "Valor concedido" KPI bar after "Clientes atendidos" is removed, so that my dashboard reflects finance-specific metrics.

#### Acceptance Criteria

1. WHILE the logged-in user belongs to Finance_Team, THE Gamification_Dashboard SHALL display the KPI bar with id `valor-concedido` and label "Valor concedido".
2. WHILE the logged-in user belongs to Finance_Team, THE Gamification_Dashboard SHALL display zero KPI bars with id `numero-empresas`.
3. WHILE the selected team is Finance_Team, THE Team_Management_Dashboard SHALL display the KPI bar with id `valor-concedido` and label "Valor concedido".
4. WHILE the selected team is not Finance_Team, THE Team_Management_Dashboard SHALL not display the KPI bar with id `valor-concedido`.

### Requirement 3: Add "Meta de protocolo" KPI bar

**User Story:** As a team member, I want to see a "Meta de protocolo" KPI bar showing financial volume progress in R$ currency, so that I can track protocol-based revenue targets.

#### Acceptance Criteria

1. THE KPI_Service SHALL generate a KPIData item with id `meta-protocolo`, label "Meta de protocolo", and unit `R$`.
2. WHEN the KPI_Service generates the `meta-protocolo` KPI, THE KPI_Service SHALL set the target value to a hardcoded default until dynamic configuration is available.
3. WHEN the KPI_Service generates the `meta-protocolo` KPI, THE KPI_Service SHALL set the current value from the player or team data source.
4. THE KPI_Circular_Progress_Component SHALL render the `meta-protocolo` KPI with R$ currency formatting (e.g., "R$ 446.000").
5. WHEN the Gamification_Dashboard loads KPI data, THE enabledKPIs getter SHALL include the `meta-protocolo` KPI in the rendered array.
6. WHEN the Team_Management_Dashboard loads team KPI data, THE enabledKPIs getter SHALL include the `meta-protocolo` KPI in the rendered array.
7. THE KPI_Service SHALL include a code comment or configuration flag marking the `meta-protocolo` target as a temporary hardcoded value pending future dynamic configuration from metric_targets__c or System_Params_Service.

### Requirement 4: Add "Aposentadorias concedidas" KPI bar

**User Story:** As a team member, I want to see an "Aposentadorias concedidas" KPI bar showing retirement concession count progress, so that I can track concession targets.

#### Acceptance Criteria

1. THE KPI_Service SHALL generate a KPIData item with id `aposentadorias-concedidas`, label "Aposentadorias concedidas", and unit `concedidos`.
2. WHEN the KPI_Service generates the `aposentadorias-concedidas` KPI, THE KPI_Service SHALL set the target value to a hardcoded default until dynamic configuration is available.
3. WHEN the KPI_Service generates the `aposentadorias-concedidas` KPI, THE KPI_Service SHALL set the current value from the player or team data source.
4. THE KPI_Circular_Progress_Component SHALL render the `aposentadorias-concedidas` KPI displaying the count value and target (e.g., "150 de 220 concedidos").
5. WHEN the Gamification_Dashboard loads KPI data, THE enabledKPIs getter SHALL include the `aposentadorias-concedidas` KPI in the rendered array.
6. WHEN the Team_Management_Dashboard loads team KPI data, THE enabledKPIs getter SHALL include the `aposentadorias-concedidas` KPI in the rendered array.
7. THE KPI_Service SHALL include a code comment or configuration flag marking the `aposentadorias-concedidas` target as a temporary hardcoded value pending future dynamic configuration from metric_targets__c or System_Params_Service.

### Requirement 5: Fix hardcoded meta value override in goals endpoint

**User Story:** As a finance team member, I want the "Valor concedido" KPI bar to display the correct meta value from the goals backend, so that my progress tracking is accurate.

#### Acceptance Criteria

1. WHEN the Goals_Receita_Backend_Service parses goal log rows, THE Goals_Receita_Backend_Service SHALL use the `current_goal_value` (or equivalent field) from the most recent log entry as the target value.
2. WHEN the Goals_Receita_Backend_Service returns a target value, THE Gamification_Dashboard SHALL use that target value without overriding it with the System_Params_Service fallback.
3. WHEN the Goals_Receita_Backend_Service returns a target value greater than zero, THE Team_Management_Dashboard SHALL use that target value as-is for the `valor-concedido` KPI bar.
4. IF the Goals_Receita_Backend_Service returns a null or zero target, THEN THE dashboard component SHALL fall back to the `financeiro_monthly_billing_goal` system parameter value.
5. IF both the Goals_Receita_Backend_Service and the System_Params_Service return zero or null targets, THEN THE dashboard component SHALL display the `valor-concedido` KPI bar with target zero and color `red`.
6. WHEN the Goals_Receita_Backend_Service resolves the goal template, THE Goals_Receita_Backend_Service SHALL log a warning if the resolved template ID does not match any log entries, indicating a possible misconfiguration.

### Requirement 6: New KPI bars support team-specific visibility

**User Story:** As a product owner, I want the new KPI bars to support team-specific visibility configuration, so that different teams see only relevant KPIs.

#### Acceptance Criteria

1. THE KPI_Service SHALL accept a team identifier parameter when generating the `meta-protocolo` and `aposentadorias-concedidas` KPIs.
2. WHERE team-specific visibility is configured, THE enabledKPIs getter SHALL filter KPIs based on the team configuration.
3. THE KPI_Service SHALL provide a default configuration that shows both new KPIs for all teams until team-specific rules are defined.
4. THE Team_Management_Dashboard SHALL respect team-specific KPI visibility when rendering KPI bars for the selected team.
