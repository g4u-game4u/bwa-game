# Requirements Document

## Introduction

This document defines the requirements for a gamification dashboard front-end application that displays player performance metrics, KPIs, progress tracking, and company portfolio management. The system integrates with the Funifier API to fetch and display gamification data in an engaging, visually appealing interface based on provided Figma designs.

The dashboard serves as the primary interface for players to track their seasonal progress, view their point wallet, monitor KPI achievements, and manage their company portfolio with detailed task tracking.

## Glossary

- **Dashboard**: The main interface displaying player statistics, progress, and company portfolio
- **Player**: A user participating in the gamification system (synonymous with "Jogador")
- **Season** (Temporada): A time-bound period for tracking player progress and achievements
- **KPI**: Key Performance Indicator - measurable values demonstrating player effectiveness
- **Carteira**: Portfolio or wallet section displaying companies and their associated KPIs
- **Macro**: A collection of related tasks or activities within a process
- **Process** (Processo): A workflow containing multiple tasks (Tarefas)
- **Task** (Tarefa): An individual activity that can be completed by a player
- **Point Wallet**: Collection of different point types (Bloqueados, Desbloqueados, Moedas)
- **Funifier API**: The backend service providing gamification data and functionality
- **Modal**: An overlay dialog displaying detailed information about a selected company

## Data Schemas

### action_log Collection

The `action_log` collection stores all player actions in the gamification system.

```json
{
  "_id": "6954183c5785ce669cc33a8f",
  "actionId": "acessorias",           // Action type identifier (e.g., 'acessorias', 'desbloquear')
  "userId": "user@example.com",       // User's email (NOT 'player')
  "time": 1767118908877,              // Timestamp in milliseconds (NOT 'created')
  "attributes": {
    "delivery_title": "[DP] ADMISSÃO - GISELE",  // Macro title
    "delivery_id": 463262,                        // Macro ID (number, NOT string)
    "acao": "Conferir Documentação da Admissão", // Action title to display
    "cnpj": "COMPANY NAME [10010|0001-76]",      // Client CNPJ
    "integration_id": 2114667
  },
  "extra": {
    "processed": true,
    "processed_at": 1768832533529
  }
}
```

**Important Field Notes:**
- Use `userId` field for player matching (NOT `player`)
- Use `time` field for timestamps (NOT `created`)
- `attributes.delivery_id` is a number (NOT string)
- `attributes.acao` contains the action title to display
- `attributes.delivery_title` contains the macro title
- For "desbloquear" actions, `attributes.delivery` matches the `delivery_id` of the finalized macro

### achievement Collection

The `achievement` collection stores points earned by players.

```json
{
  "_id": "696e242a5785ce669ccc07e7",
  "player": "Joyce.carla@bwa.global",
  "total": 63,
  "type": 0,                    // type 0 = points
  "item": "locked_points",
  "time": 1768825898626,        // Timestamp (use 'time', not 'created')
  "extra": {
    "acao": "ADMISSÃO"
  }
}
```

### Funifier Relative Date Expressions

Funifier supports relative date expressions in aggregate queries, avoiding manual timestamp calculations:

**Syntax:**
- `-0d-` / `-0d+` → start/end of current day
- `-1d-` / `-1d+` → start/end of yesterday
- `-0w-` / `-0w+` → start/end of current week
- `-0M-` / `-0M+` → start/end of current month
- `-1M-` / `-1M+` → start/end of previous month
- `-0y-` / `-0y+` → start/end of current year

**Usage in queries:**
```json
{
  "$match": {
    "time": {
      "$gte": { "$date": "-0M-" },
      "$lte": { "$date": "-0M+" }
    }
  }
}
```

## Requirements

### Requirement 1: Season Level Display

**User Story:** As a player, I want to see my current season level prominently displayed, so that I can quickly understand my overall progress in the gamification system.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the system SHALL display the current season level number in a circular badge
2. WHEN the season level is displayed THEN the system SHALL show the player's name and associated metadata (Area/Time/Squad)
3. THE system SHALL fetch season level data from the Funifier API player status endpoint
4. WHEN season data is unavailable THEN the system SHALL display a loading state or default value
5. THE system SHALL update the season level display when player status changes

### Requirement 2: Point Wallet Management

**User Story:** As a player, I want to view my different point categories and their values, so that I can track my earned and available points.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the system SHALL display three point categories: Bloqueados, Desbloqueados, and Moedas
2. THE system SHALL fetch point data from the Funifier API player status endpoint
3. WHEN displaying point values THEN the system SHALL format numbers with appropriate separators
4. THE system SHALL display point category icons alongside their values
5. WHEN point values update THEN the system SHALL reflect changes in real-time or on page refresh

### Requirement 3: Season Progress Tracking

**User Story:** As a player, I want to see my progress toward season goals, so that I can understand how close I am to achieving targets.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the system SHALL display progress metrics for Metas, Clientes, and Tarefas finalizadas
2. THE system SHALL show the current season date range (e.g., "11/4/23 to 30/9/23")
3. WHEN displaying progress THEN the system SHALL show both current values and target values
4. THE system SHALL fetch progress data from the Funifier API
5. WHEN the season period ends THEN the system SHALL update to show the new season period

### Requirement 4: Month Selector and Visualization

**User Story:** As a player, I want to select different months to view historical data, so that I can track my performance over time.

#### Acceptance Criteria

1. THE system SHALL display a month selector with previous, current, and next month navigation
2. WHEN a user clicks the previous month button THEN the system SHALL load data for the previous month
3. WHEN a user clicks the next month button THEN the system SHALL load data for the next month
4. THE system SHALL display the selected month in MAI/23 format (Portuguese month abbreviation/year)
5. WHEN month data is loading THEN the system SHALL display a loading indicator

### Requirement 5: KPI Circular Progress Indicators

**User Story:** As a player, I want to see my KPI progress in visual circular indicators, so that I can quickly assess my performance against targets.

#### Acceptance Criteria

1. WHEN the "Minha Carteira" section loads THEN the system SHALL display three KPI circular progress indicators
2. WHEN displaying each KPI THEN the system SHALL show the current value, target value, and completion percentage
3. THE system SHALL color-code progress indicators based on completion status (red for low, green for complete)
4. THE system SHALL fetch KPI data from the Funifier API
5. WHEN KPI values are zero THEN the system SHALL display "0 de [target]" format

### Requirement 6: Activity and Macro Progress Display

**User Story:** As a player, I want to see my activity and macro completion statistics, so that I can understand my task completion rates.

#### Acceptance Criteria

1. WHEN the "Meu progresso" section loads THEN the system SHALL display two subsections: Atividades and Macros
2. THE system SHALL show four metrics for activities: Pendentes, Em execução, Finalizadas, and Tempos
3. THE system SHALL show two metrics for macros: Pendentes and Incompletas, and Finalizadas
4. WHEN displaying metrics THEN the system SHALL show count values with appropriate icons
5. THE system SHALL fetch activity and macro data from the Funifier API

### Requirement 7: Company Portfolio Table

**User Story:** As a player, I want to view a list of companies in my portfolio with their KPI scores, so that I can identify which companies need attention.

#### Acceptance Criteria

1. WHEN the "Carteira" section loads THEN the system SHALL display a table of companies
2. WHEN displaying each company THEN the system SHALL show company name, CNPJ, health indicator, and three KPI scores
3. THE system SHALL make company rows clickable to open detailed views
4. THE system SHALL fetch company data from the Funifier API
5. WHEN the table has many entries THEN the system SHALL implement scrolling or pagination

### Requirement 8: Company Detail Modal

**User Story:** As a player, I want to open a detailed view of a selected company, so that I can see comprehensive information about processes and tasks.

#### Acceptance Criteria

1. WHEN a user clicks a company row THEN the system SHALL open a modal displaying company details
2. WHEN the modal opens THEN the system SHALL display the company name and three KPI circular indicators
3. THE system SHALL provide three tabs: Macros incompletas, Atividades finalizadas, and Macros finalizadas
4. WHEN a tab is selected THEN the system SHALL display the corresponding content
5. WHEN the user clicks the close button THEN the system SHALL close the modal

### Requirement 9: Process and Task Accordion

**User Story:** As a player, I want to expand and collapse processes to view their associated tasks, so that I can manage my work efficiently.

#### Acceptance Criteria

1. WHEN the modal displays processes THEN the system SHALL show them in an expandable accordion format
2. WHEN a user clicks a process header THEN the system SHALL expand to show associated tasks
3. WHEN displaying tasks THEN the system SHALL show task name, responsible person, and status
4. THE system SHALL allow multiple processes to be expanded simultaneously
5. WHEN a process is collapsed THEN the system SHALL hide its tasks

### Requirement 10: Responsive Design

**User Story:** As a player, I want the dashboard to work on different screen sizes, so that I can access it from various devices.

#### Acceptance Criteria

1. THE system SHALL render correctly on desktop screens (1920x1080 and above)
2. THE system SHALL adapt layout for tablet screens (768px to 1024px)
3. THE system SHALL provide a mobile-friendly layout for screens below 768px
4. WHEN the screen size changes THEN the system SHALL adjust component layouts accordingly
5. THE system SHALL maintain readability and usability across all screen sizes

### Requirement 11: API Integration and Error Handling

**User Story:** As a player, I want the system to handle API errors gracefully, so that I can continue using the dashboard even when data is temporarily unavailable.

#### Acceptance Criteria

1. THE system SHALL authenticate with the Funifier API using provided credentials
2. WHEN an API request fails THEN the system SHALL display an appropriate error message
3. WHEN data is loading THEN the system SHALL display loading indicators
4. THE system SHALL implement retry logic for failed API requests
5. WHEN the API is unavailable THEN the system SHALL display cached data or fallback content

### Requirement 12: Data Refresh and Real-time Updates

**User Story:** As a player, I want my dashboard data to stay current, so that I always see accurate information.

#### Acceptance Criteria

1. THE system SHALL provide a manual refresh mechanism for updating dashboard data
2. WHEN data is refreshed THEN the system SHALL fetch the latest information from the Funifier API
3. THE system SHALL implement automatic data refresh at configurable intervals
4. WHEN new data is loaded THEN the system SHALL update all affected components
5. THE system SHALL preserve user context (selected month, open modals) during refresh
