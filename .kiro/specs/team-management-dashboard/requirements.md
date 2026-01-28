# Requirements Document

## Introduction

This document defines the requirements for a team management dashboard view accessible only to users with the GESTAO (management) role. The dashboard provides aggregate team performance metrics, historical trend analysis, and individual team member tracking through data queried from the Funifier API using aggregate queries and processed on the front-end.

The management dashboard serves as a supervisory interface for managers to monitor team progress, identify performance trends, analyze productivity patterns, and track goal achievement across their department or team.

## Glossary

- **GESTAO Role**: Management role that grants access to team-level aggregate data
- **Team/Department** (Time/Departamento): A group of players managed by a supervisor
- **Aggregate Data**: Combined metrics calculated from multiple team members' data
- **Collaborator** (Colaborador): Individual team member whose data can be filtered
- **Season Points**: Total points earned by the team during the current season
- **Progress Metrics**: Incomplete processes, completed activities, and completed processes
- **Productivity Analysis** (Análise de produtividade): Historical data visualization showing trends
- **Goals and Progress** (Metas e progresso): Current goal achievement metrics
- **Time Period Filter**: Date range selector for historical data (last 7 days, 15 days, 30 days, etc.)

## Data Schemas

### action_log Collection (for aggregate queries)

```json
{
  "_id": "6954183c5785ce669cc33a8f",
  "actionId": "acessorias",
  "userId": "user@example.com",
  "time": 1767118908877,
  "attributes": {
    "delivery_title": "[DP] ADMISSÃO - GISELE",
    "delivery_id": 463262,
    "acao": "Conferir Documentação da Admissão",
    "cnpj": "COMPANY NAME [10010|0001-76]",
    "integration_id": 2114667,
    "team": "Departamento Pessoal",
    "department": "Departamento Pessoal"
  }
}
```

### achievement Collection (for points aggregation)

```json
{
  "_id": "696e242a5785ce669ccc07e7",
  "player": "Joyce.carla@bwa.global",
  "total": 63,
  "type": 0,
  "item": "locked_points",
  "time": 1768825898626,
  "extra": {
    "acao": "ADMISSÃO",
    "team": "Departamento Pessoal"
  }
}
```

### Aggregate Query Examples

**Team Points Aggregation:**
```json
{
  "aggregate": [
    {
      "$match": {
        "extra.team": "Departamento Pessoal",
        "time": { "$gte": { "$date": "-0M-" }, "$lte": { "$date": "-0M+" } }
      }
    },
    {
      "$group": {
        "_id": null,
        "totalPoints": { "$sum": "$total" },
        "blockedPoints": {
          "$sum": { "$cond": [{ "$eq": ["$item", "locked_points"] }, "$total", 0] }
        },
        "unlockedPoints": {
          "$sum": { "$cond": [{ "$eq": ["$item", "unlocked_points"] }, "$total", 0] }
        }
      }
    }
  ]
}
```

**Team Progress Aggregation:**
```json
{
  "aggregate": [
    {
      "$match": {
        "attributes.team": "Departamento Pessoal",
        "time": { "$gte": { "$date": "-0M-" }, "$lte": { "$date": "-0M+" } }
      }
    },
    {
      "$group": {
        "_id": "$actionId",
        "count": { "$sum": 1 }
      }
    }
  ]
}
```

## Requirements

### Requirement 1: Role-Based Access Control

**User Story:** As a system administrator, I want only users with the GESTAO role to access the team management dashboard, so that sensitive team data is protected.

#### Acceptance Criteria

1. WHEN a user without GESTAO role attempts to access the management dashboard THEN the system SHALL redirect them to the regular dashboard
2. WHEN a user with GESTAO role logs in THEN the system SHALL display a navigation option to access the management dashboard
3. THE system SHALL verify the user's role on every route navigation to the management dashboard
4. WHEN role verification fails THEN the system SHALL display an "Access Denied" message
5. THE system SHALL fetch user roles from the authentication service or Funifier API

### Requirement 2: Team/Department Selection

**User Story:** As a manager, I want to select which team or department to view, so that I can monitor different groups under my supervision.

#### Acceptance Criteria

1. WHEN the management dashboard loads THEN the system SHALL display a dropdown with available teams/departments
2. THE system SHALL fetch the list of teams from the user's metadata or Funifier API
3. WHEN a manager selects a team THEN the system SHALL load aggregate data for that team
4. THE system SHALL remember the last selected team across sessions
5. WHEN no team is selected THEN the system SHALL default to the first available team

### Requirement 3: Individual Collaborator Filter

**User Story:** As a manager, I want to filter data by individual team members, so that I can analyze specific collaborator performance.

#### Acceptance Criteria

1. WHEN a team is selected THEN the system SHALL display a dropdown with team members (collaborators)
2. THE system SHALL fetch the list of collaborators from aggregate queries on action_log filtered by team
3. WHEN a collaborator is selected THEN the system SHALL filter all metrics to show only that person's data
4. WHEN "All" or no collaborator is selected THEN the system SHALL show aggregate team data
5. THE system SHALL display the collaborator's name in the format shown in the data

### Requirement 4: Season Points Display (Team Aggregate)

**User Story:** As a manager, I want to see the total season points earned by my team, so that I can track overall team performance.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the system SHALL display three point categories: Total, Bloqueados (Blocked), and Desbloqueados (Unlocked)
2. THE system SHALL query the achievement collection using aggregate to sum points for all team members
3. WHEN displaying point values THEN the system SHALL format numbers with appropriate separators
4. THE system SHALL filter points by the current season date range
5. WHEN a collaborator is selected THEN the system SHALL show that individual's points instead of team aggregate

### Requirement 5: Team Progress Metrics

**User Story:** As a manager, I want to see aggregate progress metrics for my team, so that I can understand workflow status.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the system SHALL display three progress metrics: Processos incompletos, Atividades finalizadas, and Processos finalizados
2. THE system SHALL query action_log collection using aggregate to count actions by type for the team
3. WHEN displaying metrics THEN the system SHALL show count values with appropriate icons and colors
4. THE system SHALL filter metrics by the current season date range
5. WHEN a collaborator is selected THEN the system SHALL show that individual's metrics

### Requirement 6: Month Selector for Historical Data

**User Story:** As a manager, I want to select different months to view historical team performance, so that I can track trends over time.

#### Acceptance Criteria

1. THE system SHALL display a month selector with previous, current, and next month navigation
2. WHEN a user clicks the previous month button THEN the system SHALL load data for the previous month
3. WHEN a user clicks the next month button THEN the system SHALL load data for the next month
4. THE system SHALL display the selected month in JAN/26 format (Portuguese month abbreviation/year)
5. WHEN month data is loading THEN the system SHALL display a loading indicator

### Requirement 7: Goals and Progress Tab

**User Story:** As a manager, I want to view current goal achievement metrics, so that I can assess team performance against targets.

#### Acceptance Criteria

1. WHEN the "Metas e progresso" tab is selected THEN the system SHALL display goal metrics
2. THE system SHALL show circular progress indicators for key goals (e.g., "Processos finalizados")
3. WHEN displaying goals THEN the system SHALL show current value, target value, and completion percentage
4. THE system SHALL query aggregate data to calculate goal progress
5. THE system SHALL color-code progress indicators based on completion status

### Requirement 8: Productivity Analysis Tab

**User Story:** As a manager, I want to view historical productivity trends in graphs, so that I can identify patterns and anomalies.

#### Acceptance Criteria

1. WHEN the "Análise de produtividade" tab is selected THEN the system SHALL display productivity graphs
2. THE system SHALL provide a time period selector (7 days, 15 days, 30 days, custom)
3. THE system SHALL display a toggle between line chart and bar chart visualization
4. WHEN displaying graphs THEN the system SHALL show historical data aggregated by day or week
5. THE system SHALL query action_log using aggregate with date grouping to generate graph data

### Requirement 9: Line Chart Visualization

**User Story:** As a manager, I want to see productivity trends as a line chart, so that I can identify upward or downward trends over time.

#### Acceptance Criteria

1. WHEN line chart is selected THEN the system SHALL display a line graph with time on X-axis and metric value on Y-axis
2. THE system SHALL support multiple lines for different metrics (e.g., completed activities, completed processes)
3. WHEN hovering over data points THEN the system SHALL display a tooltip with exact values and dates
4. THE system SHALL use appropriate colors and line styles for different metrics
5. THE system SHALL handle empty data points gracefully

### Requirement 10: Bar Chart Visualization

**User Story:** As a manager, I want to see productivity data as a bar chart, so that I can compare values across different time periods.

#### Acceptance Criteria

1. WHEN bar chart is selected THEN the system SHALL display a bar graph with time periods on X-axis and metric value on Y-axis
2. THE system SHALL support grouped bars for comparing multiple metrics
3. WHEN hovering over bars THEN the system SHALL display a tooltip with exact values
4. THE system SHALL use appropriate colors for different metrics
5. THE system SHALL handle zero values by showing empty bars

### Requirement 11: Time Period Filter

**User Story:** As a manager, I want to select different time periods for graph data, so that I can analyze short-term and long-term trends.

#### Acceptance Criteria

1. THE system SHALL provide a dropdown with options: "7 dias", "15 dias", "30 dias", "60 dias", "90 dias"
2. WHEN a time period is selected THEN the system SHALL reload graph data for that period
3. THE system SHALL calculate the date range based on the selected period from the current date
4. WHEN loading new data THEN the system SHALL display a loading indicator on the graph
5. THE system SHALL use Funifier relative date expressions in aggregate queries

### Requirement 12: Aggregate Query Processing

**User Story:** As a developer, I want to use Funifier aggregate queries to fetch team data efficiently, so that the dashboard performs well with large datasets.

#### Acceptance Criteria

1. THE system SHALL use MongoDB aggregate pipeline syntax in Funifier API calls
2. WHEN querying team data THEN the system SHALL filter by team/department in the $match stage
3. WHEN calculating totals THEN the system SHALL use $group stage with appropriate accumulators
4. THE system SHALL use Funifier relative date expressions (e.g., "-0M-", "-7d-") for date filtering
5. THE system SHALL process aggregate results on the front-end to format for display

### Requirement 13: Front-End Data Processing

**User Story:** As a developer, I want to process aggregate query results on the front-end, so that I can transform raw data into display-ready formats.

#### Acceptance Criteria

1. THE system SHALL create mapper services to transform aggregate results into component models
2. WHEN processing point data THEN the system SHALL sum values and categorize by point type
3. WHEN processing progress data THEN the system SHALL count actions by type and status
4. WHEN processing graph data THEN the system SHALL group by date and calculate daily/weekly totals
5. THE system SHALL handle missing or null values in aggregate results

### Requirement 14: Loading States and Error Handling

**User Story:** As a manager, I want to see loading indicators and error messages, so that I understand when data is being fetched or if something went wrong.

#### Acceptance Criteria

1. WHEN data is loading THEN the system SHALL display loading spinners on affected sections
2. WHEN an aggregate query fails THEN the system SHALL display an error message
3. THE system SHALL implement retry logic for failed queries
4. WHEN no data is available THEN the system SHALL display a "No data available" message
5. THE system SHALL log errors for debugging purposes

### Requirement 15: Responsive Design for Management View

**User Story:** As a manager, I want the management dashboard to work on different screen sizes, so that I can access it from various devices.

#### Acceptance Criteria

1. THE system SHALL render correctly on desktop screens (1920x1080 and above)
2. THE system SHALL adapt layout for tablet screens (768px to 1024px)
3. THE system SHALL provide a mobile-friendly layout for screens below 768px
4. WHEN the screen size changes THEN the system SHALL adjust graph sizes and sidebar layout
5. THE system SHALL maintain readability and usability across all screen sizes

### Requirement 16: Data Refresh Mechanism

**User Story:** As a manager, I want to manually refresh dashboard data, so that I can see the most current information.

#### Acceptance Criteria

1. THE system SHALL provide a refresh button in the dashboard header
2. WHEN the refresh button is clicked THEN the system SHALL reload all aggregate queries
3. THE system SHALL preserve user selections (team, collaborator, month, tab) during refresh
4. WHEN data is refreshing THEN the system SHALL display loading indicators
5. THE system SHALL display the last refresh timestamp

### Requirement 17: Performance Optimization for Aggregates

**User Story:** As a developer, I want to optimize aggregate query performance, so that the dashboard loads quickly even with large datasets.

#### Acceptance Criteria

1. THE system SHALL implement caching for aggregate results with appropriate TTL (5 minutes)
2. WHEN the same query is made within the cache period THEN the system SHALL return cached results
3. THE system SHALL use indexed fields in aggregate $match stages
4. THE system SHALL limit result sets to reasonable sizes (e.g., max 1000 documents)
5. THE system SHALL implement pagination for large result sets if needed

### Requirement 18: Navigation Between Dashboards

**User Story:** As a user with GESTAO role, I want to easily switch between my personal dashboard and the team management dashboard, so that I can view both perspectives.

#### Acceptance Criteria

1. THE system SHALL display a navigation menu or toggle to switch between dashboards
2. WHEN switching dashboards THEN the system SHALL preserve authentication state
3. THE system SHALL display the current dashboard name in the header
4. WHEN navigating THEN the system SHALL use Angular routing
5. THE system SHALL remember the last visited dashboard across sessions
