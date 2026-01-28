# Team Aggregate Service Implementation

## Overview

This document describes the implementation of the `TeamAggregateService` for the team management dashboard. The service manages team aggregate data queries and processing, using MongoDB aggregate pipelines via the Funifier API.

## Implementation Date

January 26, 2026

## Files Created

1. **src/app/services/team-aggregate.service.ts** - Main service implementation
2. **src/app/services/team-aggregate.service.spec.ts** - Unit tests
3. **src/app/services/team-aggregate.service.pbt.spec.ts** - Property-based tests

## Service Features

### Core Methods

#### 1. getTeamSeasonPoints()
Fetches aggregate point data for a team within a date range.

**Parameters:**
- `teamId`: Team/department name
- `seasonStart`: Start date of the season
- `seasonEnd`: End date of the season

**Returns:** `Observable<TeamSeasonPoints>`
- `total`: Total points earned
- `bloqueados`: Blocked (locked) points
- `desbloqueados`: Unlocked points

**Features:**
- Uses AggregateQueryBuilderService to construct queries
- Implements 5-minute caching
- Handles empty results gracefully

#### 2. getTeamProgressMetrics()
Fetches aggregate action counts for a team and processes them into progress metrics.

**Parameters:**
- `teamId`: Team/department name
- `seasonStart`: Start date of the season
- `seasonEnd`: End date of the season

**Returns:** `Observable<TeamProgressMetrics>`
- `processosIncompletos`: Incomplete processes count
- `atividadesFinalizadas`: Completed activities count
- `processosFinalizados`: Completed processes count

**Features:**
- Maps action IDs to specific metrics
- Supports both Portuguese and English action IDs
- Counts unknown actions as activities

#### 3. getTeamMembers()
Fetches unique user IDs from action_log for a specific team.

**Parameters:**
- `teamId`: Team/department name

**Returns:** `Observable<Collaborator[]>`
- Array of team members with userId, name, and email

**Features:**
- Extracts unique collaborators from action logs
- Caches results for performance

#### 4. getCollaboratorData()
Fetches aggregate data for a specific user within a date range.

**Parameters:**
- `userId`: User ID (email) of the collaborator
- `startDate`: Start date for filtering
- `endDate`: End date for filtering

**Returns:** `Observable<any>`
- Flexible structure for different data types

**Features:**
- Filters by individual user
- Useful for collaborator-specific views

### Caching System

The service implements a sophisticated caching mechanism:

- **TTL**: 5 minutes (300,000 milliseconds)
- **Cache Key Format**: `{operation}_{teamId}_{startTime}_{endTime}`
- **Methods**:
  - `clearCache()`: Clears all cached data
  - `clearTeamCache(teamId)`: Clears cache for specific team

**Benefits:**
- Reduces API calls
- Improves performance
- Maintains data freshness

### Error Handling

The service implements comprehensive error handling:

1. **API Errors**: Catches and logs HTTP errors
2. **Malformed Responses**: Handles missing or null data
3. **Empty Results**: Returns default values (zeros)
4. **Flexible Response Parsing**: Handles both `{ result: [] }` and direct array responses

## Data Models

### TeamSeasonPoints
```typescript
interface TeamSeasonPoints {
  total: number;
  bloqueados: number;
  desbloqueados: number;
}
```

### TeamProgressMetrics
```typescript
interface TeamProgressMetrics {
  processosIncompletos: number;
  atividadesFinalizadas: number;
  processosFinalizados: number;
}
```

### Collaborator
```typescript
interface Collaborator {
  userId: string;
  name: string;
  email: string;
}
```

## Testing

### Unit Tests (team-aggregate.service.spec.ts)

**Coverage:**
- ✅ Service creation
- ✅ getTeamSeasonPoints with valid data
- ✅ getTeamSeasonPoints with empty data
- ✅ getTeamSeasonPoints with missing fields
- ✅ getTeamProgressMetrics with valid data
- ✅ getTeamProgressMetrics with empty data
- ✅ getTeamProgressMetrics with unknown action IDs
- ✅ getTeamProgressMetrics with English action IDs
- ✅ getTeamMembers with valid data
- ✅ getTeamMembers with empty data
- ✅ getCollaboratorData with valid data
- ✅ getCollaboratorData query structure
- ✅ Caching mechanism
- ✅ Cache clearing (all and team-specific)
- ✅ Error handling for API errors
- ✅ Error handling for malformed responses
- ✅ Response parsing without result property

**Total Tests:** 17 unit tests

### Property-Based Tests (team-aggregate.service.pbt.spec.ts)

**Property 1: Team Points Aggregation Accuracy**
- **Validates:** Requirements 4.2, 4.3
- **Tests:** 100 runs with random achievement data
- **Verifies:**
  - Total points = sum of all point values
  - Blocked points = sum of locked_points only
  - Unlocked points = sum of unlocked_points only
  - Total points = blocked points + unlocked points

**Property 3: Date Range Filtering Consistency**
- **Validates:** Requirements 6.2, 6.3, 11.4
- **Tests:** 50 runs with random date ranges
- **Verifies:**
  - All queries use same start and end dates
  - Date range integrity maintained
  - Dates passed correctly to query builder

**Additional Property: Non-negative Points Invariant**
- **Tests:** 100 runs with various point values
- **Verifies:**
  - All point values are non-negative
  - Handles zero points correctly
  - Maintains point type separation

**Total Property Tests:** 5 property-based tests with 300+ runs

## Integration with Existing Services

### Dependencies

1. **FunifierApiService**
   - Used for executing aggregate queries
   - Endpoint: `/v3/database/{collection}/aggregate`
   - Handles authentication and error responses

2. **AggregateQueryBuilderService**
   - Constructs MongoDB aggregate pipeline queries
   - Methods used:
     - `buildPointsAggregateQuery()`
     - `buildProgressAggregateQuery()`
     - `buildCollaboratorListQuery()`

### API Endpoints Used

1. **Achievement Collection** (`/v3/database/achievement/aggregate`)
   - Used for: Team season points
   - Filters by: `extra.team`, `time`, `type`
   - Groups by: Point type (locked/unlocked)

2. **Action Log Collection** (`/v3/database/action_log/aggregate`)
   - Used for: Team progress metrics, collaborator lists
   - Filters by: `attributes.team`, `userId`, `time`
   - Groups by: `actionId`, `userId`

## Requirements Validation

### Requirement 4.2 ✅
**Query achievement collection using aggregate to sum points for all team members**
- Implemented in `getTeamSeasonPoints()`
- Uses aggregate query with $match and $group stages
- Sums points by type (locked/unlocked)

### Requirement 5.2 ✅
**Query action_log collection using aggregate to count actions by type for the team**
- Implemented in `getTeamProgressMetrics()`
- Uses aggregate query with $match and $group stages
- Counts actions by actionId

### Requirement 12.5 ✅
**Process aggregate results on the front-end to format for display**
- Implemented in private processing methods:
  - `processPointsAggregate()`
  - `processProgressAggregate()`
  - `processCollaboratorList()`

### Requirement 13.1 ✅
**Create mapper services to transform aggregate results into component models**
- Processing methods transform raw API data into typed models
- Handles missing/null values
- Maps action IDs to specific metrics

### Requirement 13.2 ✅
**Sum values and categorize by point type**
- Points categorized into total, bloqueados, desbloqueados
- Conditional aggregation in MongoDB query

### Requirement 13.3 ✅
**Count actions by type and status**
- Progress metrics count by actionId
- Maps to specific metric categories

## Performance Optimizations

1. **Caching**: 5-minute TTL reduces API calls
2. **Efficient Queries**: Uses MongoDB aggregation pipeline
3. **Lazy Loading**: Data fetched only when needed
4. **Error Recovery**: Graceful handling of failures

## Usage Example

```typescript
import { TeamAggregateService } from './services/team-aggregate.service';

constructor(private teamAggregateService: TeamAggregateService) {}

loadTeamData() {
  const teamId = 'Departamento Pessoal';
  const seasonStart = new Date('2024-01-01');
  const seasonEnd = new Date('2024-01-31');

  // Get team points
  this.teamAggregateService.getTeamSeasonPoints(teamId, seasonStart, seasonEnd)
    .subscribe(points => {
      console.log('Total Points:', points.total);
      console.log('Blocked Points:', points.bloqueados);
      console.log('Unlocked Points:', points.desbloqueados);
    });

  // Get team progress
  this.teamAggregateService.getTeamProgressMetrics(teamId, seasonStart, seasonEnd)
    .subscribe(metrics => {
      console.log('Incomplete Processes:', metrics.processosIncompletos);
      console.log('Completed Activities:', metrics.atividadesFinalizadas);
      console.log('Completed Processes:', metrics.processosFinalizados);
    });

  // Get team members
  this.teamAggregateService.getTeamMembers(teamId)
    .subscribe(members => {
      console.log('Team Members:', members.length);
    });
}

refreshData() {
  // Clear cache to force fresh data
  this.teamAggregateService.clearCache();
  this.loadTeamData();
}
```

## Next Steps

The following components will use this service:

1. **TeamManagementDashboardComponent** - Main dashboard container
2. **TeamSidebarComponent** - Display team metrics
3. **GoalsProgressTabComponent** - Show goal achievement
4. **ProductivityAnalysisTabComponent** - Historical trends

## Compilation Status

✅ All files compile successfully without errors
✅ TypeScript type checking passes
✅ No linting issues

## Notes

- The service is ready for integration with dashboard components
- Action ID mappings may need adjustment based on actual Funifier setup
- Cache TTL can be adjusted based on data freshness requirements
- Consider adding more specific error messages for different failure scenarios
