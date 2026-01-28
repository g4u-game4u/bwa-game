# Design Document

## Overview

This document outlines the technical design for a team management dashboard accessible to users with the GESTAO role. The system displays aggregate team performance metrics, historical trend analysis, and productivity graphs by querying the Funifier API using MongoDB aggregate pipelines and processing results on the front-end.

The dashboard follows the same modular component architecture as the existing gamification dashboard, with additional services for aggregate query construction and result processing.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Management  │  │   Graph      │  │   Shared     │      │
│  │  Dashboard   │  │  Components  │  │  Components  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Team       │  │  Aggregate   │  │   Graph      │      │
│  │   Service    │  │   Query      │  │   Service    │      │
│  │              │  │   Builder    │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                       API Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Funifier   │  │   Aggregate  │  │    Auth      │      │
│  │   API Client │  │   Endpoint   │  │  Interceptor │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────────────┐
                    │   Funifier    │
                    │   REST API    │
                    │  /aggregate   │
                    └───────────────┘
```

### Technology Stack

- **Framework**: Angular 15+ (existing)
- **Language**: TypeScript 4.8+
- **State Management**: RxJS Observables and BehaviorSubjects
- **HTTP Client**: Angular HttpClient
- **Styling**: SCSS with Bootstrap 5 utilities (existing)
- **Charts**: Chart.js for line and bar charts
- **Date Handling**: date-fns (existing)

## Components and Interfaces

### Core Components

#### 1. TeamManagementDashboardComponent
Main container component for the management dashboard view.

**Responsibilities:**
- Layout management for sidebar and main content
- Team and collaborator selection coordination
- Month selection state management
- Tab switching between goals and productivity analysis

**Inputs:** None (route component)

**Outputs:**
- `teamChanged: EventEmitter<string>` - Emits when team selection changes
- `collaboratorChanged: EventEmitter<string>` - Emits when collaborator filter changes

**Key Methods:**
```typescript
ngOnInit(): void
loadTeamData(): void
onTeamChange(teamId: string): void
onCollaboratorChange(userId: string): void
onMonthChange(date: Date): void
refreshData(): void
```

**State:**
```typescript
selectedTeam: string;
selectedCollaborator: string | null;
selectedMonth: Date;
activeTab: 'goals' | 'productivity';
isLoading: boolean;
```

#### 2. TeamSidebarComponent
Displays team information and aggregate metrics in the left sidebar.

**Inputs:**
- `teamName: string` - Selected team/department name
- `seasonPoints: TeamSeasonPoints` - Aggregate point totals
- `progressMetrics: TeamProgressMetrics` - Aggregate progress counts
- `seasonDates: { start: Date, end: Date }` - Current season period

**Interfaces:**
```typescript
interface TeamSeasonPoints {
  total: number;
  bloqueados: number;
  desbloqueados: number;
}

interface TeamProgressMetrics {
  processosIncompletos: number;
  atividadesFinalizadas: number;
  processosFinalizados: number;
}
```

#### 3. TeamSelectorComponent
Dropdown for selecting team/department.

**Inputs:**
- `teams: Team[]` - Available teams
- `selectedTeam: string` - Currently selected team ID

**Outputs:**
- `teamSelected: EventEmitter<string>` - Emits when team is selected

**Interface:**
```typescript
interface Team {
  id: string;
  name: string;
  memberCount: number;
}
```

#### 4. CollaboratorSelectorComponent
Dropdown for filtering by individual team member.

**Inputs:**
- `collaborators: Collaborator[]` - Team members
- `selectedCollaborator: string | null` - Currently selected collaborator

**Outputs:**
- `collaboratorSelected: EventEmitter<string | null>` - Emits when collaborator is selected

**Interface:**
```typescript
interface Collaborator {
  userId: string;
  name: string;
  email: string;
}
```

#### 5. GoalsProgressTabComponent
Displays current goal achievement metrics with circular progress indicators.

**Inputs:**
- `goals: GoalMetric[]` - Goal data with current and target values

**Interface:**
```typescript
interface GoalMetric {
  id: string;
  label: string;
  current: number;
  target: number;
  unit?: string;
}
```

#### 6. ProductivityAnalysisTabComponent
Container for productivity graphs and time period selector.

**Inputs:**
- `graphData: GraphDataPoint[]` - Historical data points
- `selectedPeriod: number` - Selected time period in days

**Outputs:**
- `periodChanged: EventEmitter<number>` - Emits when time period changes
- `chartTypeChanged: EventEmitter<'line' | 'bar'>` - Emits when chart type toggles

**State:**
```typescript
chartType: 'line' | 'bar' = 'line';
availablePeriods: number[] = [7, 15, 30, 60, 90];
```

#### 7. LineChartComponent
Reusable line chart component using Chart.js.

**Inputs:**
- `data: GraphDataPoint[]` - Data points to plot
- `labels: string[]` - X-axis labels (dates)
- `datasets: ChartDataset[]` - Multiple line datasets

**Interface:**
```typescript
interface GraphDataPoint {
  date: Date;
  value: number;
  label?: string;
}

interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
}
```

#### 8. BarChartComponent
Reusable bar chart component using Chart.js.

**Inputs:**
- `data: GraphDataPoint[]` - Data points to plot
- `labels: string[]` - X-axis labels (dates)
- `datasets: ChartDataset[]` - Multiple bar datasets

**Key Methods:**
```typescript
updateChart(data: GraphDataPoint[]): void
formatTooltip(value: number, label: string): string
```

#### 9. TimePeriodSelectorComponent
Dropdown for selecting graph time period.

**Inputs:**
- `periods: number[]` - Available periods in days
- `selectedPeriod: number` - Currently selected period

**Outputs:**
- `periodSelected: EventEmitter<number>` - Emits when period changes

**Template:**
```html
<select (change)="onPeriodChange($event)">
  <option *ngFor="let period of periods" [value]="period">
    Mostrar os últimos {{ period }} dias
  </option>
</select>
```

### Service Layer

#### TeamAggregateService
Manages team aggregate data queries and processing.

**Methods:**
```typescript
getTeamSeasonPoints(teamId: string, seasonStart: Date, seasonEnd: Date): Observable<TeamSeasonPoints>
getTeamProgressMetrics(teamId: string, seasonStart: Date, seasonEnd: Date): Observable<TeamProgressMetrics>
getTeamMembers(teamId: string): Observable<Collaborator[]>
getCollaboratorData(userId: string, startDate: Date, endDate: Date): Observable<any>
```

**Implementation Example:**
```typescript
getTeamSeasonPoints(teamId: string, seasonStart: Date, seasonEnd: Date): Observable<TeamSeasonPoints> {
  const query = this.queryBuilder.buildPointsAggregateQuery(teamId, seasonStart, seasonEnd);
  
  return this.funifierApi.aggregate('achievement', query).pipe(
    map(result => this.processPointsAggregate(result)),
    catchError(error => this.handleError(error))
  );
}

private processPointsAggregate(result: any[]): TeamSeasonPoints {
  if (!result || result.length === 0) {
    return { total: 0, bloqueados: 0, desbloqueados: 0 };
  }
  
  const data = result[0];
  return {
    total: data.totalPoints || 0,
    bloqueados: data.blockedPoints || 0,
    desbloqueados: data.unlockedPoints || 0
  };
}
```

#### AggregateQueryBuilderService
Constructs MongoDB aggregate pipeline queries for Funifier API.

**Methods:**
```typescript
buildPointsAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery
buildProgressAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery
buildGraphDataQuery(teamId: string, startDate: Date, endDate: Date, groupBy: 'day' | 'week'): AggregateQuery
buildCollaboratorListQuery(teamId: string): AggregateQuery
```

**Implementation Example:**
```typescript
buildPointsAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery {
  return {
    aggregate: [
      {
        $match: {
          'extra.team': teamId,
          time: {
            $gte: { $date: this.formatDate(startDate) },
            $lte: { $date: this.formatDate(endDate) }
          },
          type: 0 // points only
        }
      },
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$total' },
          blockedPoints: {
            $sum: {
              $cond: [
                { $eq: ['$item', 'locked_points'] },
                '$total',
                0
              ]
            }
          },
          unlockedPoints: {
            $sum: {
              $cond: [
                { $eq: ['$item', 'unlocked_points'] },
                '$total',
                0
              ]
            }
          }
        }
      }
    ]
  };
}

buildProgressAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery {
  return {
    aggregate: [
      {
        $match: {
          'attributes.team': teamId,
          time: {
            $gte: { $date: this.formatDate(startDate) },
            $lte: { $date: this.formatDate(endDate) }
          }
        }
      },
      {
        $group: {
          _id: '$actionId',
          count: { $sum: 1 }
        }
      }
    ]
  };
}

buildGraphDataQuery(teamId: string, startDate: Date, endDate: Date, groupBy: 'day' | 'week'): AggregateQuery {
  const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%U';
  
  return {
    aggregate: [
      {
        $match: {
          'attributes.team': teamId,
          time: {
            $gte: { $date: this.formatDate(startDate) },
            $lte: { $date: this.formatDate(endDate) }
          }
        }
      },
      {
        $project: {
          date: {
            $dateToString: {
              format: dateFormat,
              date: { $toDate: '$time' }
            }
          },
          actionId: 1
        }
      },
      {
        $group: {
          _id: {
            date: '$date',
            actionId: '$actionId'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]
  };
}

private formatDate(date: Date): string {
  // Convert to Funifier relative date format or ISO string
  return date.toISOString();
}
```

#### GraphDataProcessorService
Processes aggregate query results into chart-ready data.

**Methods:**
```typescript
processGraphData(aggregateResult: any[], period: number): GraphDataPoint[]
groupByDate(data: any[], groupBy: 'day' | 'week'): Map<string, number>
fillMissingDates(data: Map<string, number>, startDate: Date, endDate: Date): GraphDataPoint[]
createChartDatasets(data: GraphDataPoint[], metrics: string[]): ChartDataset[]
```

**Implementation Example:**
```typescript
processGraphData(aggregateResult: any[], period: number): GraphDataPoint[] {
  const endDate = new Date();
  const startDate = subDays(endDate, period);
  
  // Group by date
  const grouped = new Map<string, number>();
  aggregateResult.forEach(item => {
    const date = item._id.date;
    const count = item.count;
    grouped.set(date, (grouped.get(date) || 0) + count);
  });
  
  // Fill missing dates with zero values
  return this.fillMissingDates(grouped, startDate, endDate);
}

fillMissingDates(data: Map<string, number>, startDate: Date, endDate: Date): GraphDataPoint[] {
  const result: GraphDataPoint[] = [];
  let currentDate = startDate;
  
  while (currentDate <= endDate) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    result.push({
      date: new Date(currentDate),
      value: data.get(dateStr) || 0
    });
    currentDate = addDays(currentDate, 1);
  }
  
  return result;
}

createChartDatasets(data: GraphDataPoint[], metrics: string[]): ChartDataset[] {
  return metrics.map((metric, index) => ({
    label: metric,
    data: data.map(point => point.value),
    borderColor: this.getColor(index),
    backgroundColor: this.getColor(index, 0.2)
  }));
}

private getColor(index: number, alpha: number = 1): string {
  const colors = [
    `rgba(75, 192, 192, ${alpha})`,
    `rgba(255, 99, 132, ${alpha})`,
    `rgba(54, 162, 235, ${alpha})`,
    `rgba(255, 206, 86, ${alpha})`
  ];
  return colors[index % colors.length];
}
```

#### TeamRoleGuardService
Route guard to restrict access to GESTAO role users.

**Methods:**
```typescript
canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean>
hasGestaoRole(): Observable<boolean>
```

**Implementation:**
```typescript
canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
  return this.hasGestaoRole().pipe(
    tap(hasRole => {
      if (!hasRole) {
        this.router.navigate(['/dashboard']);
        this.toastService.error('Acesso negado. Você não tem permissão para acessar esta página.');
      }
    })
  );
}

hasGestaoRole(): Observable<boolean> {
  return this.authService.getCurrentUser().pipe(
    map(user => {
      const roles = user?.extra?.roles || [];
      return roles.includes('GESTAO');
    })
  );
}
```

## Data Models

### Core Models

```typescript
// Team Models
interface Team {
  id: string;
  name: string;
  memberCount: number;
  department?: string;
}

interface Collaborator {
  userId: string;
  name: string;
  email: string;
  team: string;
}

// Aggregate Result Models
interface TeamSeasonPoints {
  total: number;
  bloqueados: number;
  desbloqueados: number;
}

interface TeamProgressMetrics {
  processosIncompletos: number;
  atividadesFinalizadas: number;
  processosFinalizados: number;
}

// Goal Models
interface GoalMetric {
  id: string;
  label: string;
  current: number;
  target: number;
  unit?: string;
  percentage: number;
}

// Graph Models
interface GraphDataPoint {
  date: Date;
  value: number;
  label?: string;
}

interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  fill?: boolean;
}

interface GraphConfig {
  type: 'line' | 'bar';
  period: number;
  metrics: string[];
}

// Aggregate Query Models
interface AggregateQuery {
  aggregate: AggregateStage[];
}

interface AggregateStage {
  $match?: any;
  $group?: any;
  $project?: any;
  $sort?: any;
  $limit?: number;
}

// Dashboard State Models
interface TeamDashboardState {
  selectedTeam: string;
  selectedCollaborator: string | null;
  selectedMonth: Date;
  activeTab: 'goals' | 'productivity';
  graphConfig: GraphConfig;
  isLoading: boolean;
  lastRefresh: Date;
}
```

## Correctness Properties

### Property 1: Team Points Aggregation Accuracy
*For any* team with members who have earned points, the sum of displayed team points should equal the sum of all individual member points within the selected time period.
**Validates: Requirements 4.2, 4.3**

### Property 2: Collaborator Filter Isolation
*For any* selected collaborator, the displayed metrics should only include data from that collaborator's actions, not from other team members.
**Validates: Requirements 3.3, 3.4**

### Property 3: Date Range Filtering Consistency
*For any* selected month or time period, all aggregate queries should use the same start and end dates for filtering.
**Validates: Requirements 6.2, 6.3, 11.4**

### Property 4: Graph Data Completeness
*For any* time period selection, the graph should display data points for all dates in the range, filling missing dates with zero values.
**Validates: Requirements 9.1, 9.5, 10.5**

### Property 5: Role-Based Access Enforcement
*For any* user without GESTAO role, attempting to access the team management dashboard should result in redirection to the regular dashboard.
**Validates: Requirements 1.1, 1.3, 1.4**

### Property 6: Aggregate Query Structure Validity
*For any* aggregate query constructed by the query builder, the query should be valid MongoDB aggregate pipeline syntax.
**Validates: Requirements 12.1, 12.2, 12.3**

### Property 7: Chart Type Toggle Preservation
*For any* chart type selection (line or bar), switching between tabs or refreshing data should preserve the selected chart type.
**Validates: Requirements 8.3, 16.3**

### Property 8: Team Selection Persistence
*For any* team selection, the selected team should be remembered across page refreshes and stored in local storage.
**Validates: Requirements 2.4, 18.5**

### Property 9: Progress Metric Calculation
*For any* team progress data, the sum of processos incompletos and processos finalizados should equal the total number of unique processes.
**Validates: Requirements 5.2, 5.3**

### Property 10: Time Period Selector Boundary
*For any* time period selection, the calculated date range should be exactly N days before the current date, where N is the selected period.
**Validates: Requirements 11.3, 11.4**

## API Integration

### Funifier Aggregate Endpoint

The Funifier API provides an aggregate endpoint for running MongoDB aggregate queries:

**Endpoint:** `POST /v3/aggregate/{collection}`

**Request Body:**
```json
{
  "aggregate": [
    { "$match": { ... } },
    { "$group": { ... } },
    { "$sort": { ... } }
  ]
}
```

**Response:**
```json
{
  "result": [
    { "_id": "...", "count": 123, ... }
  ]
}
```

### Example API Calls

**1. Get Team Points:**
```typescript
const query = {
  aggregate: [
    {
      $match: {
        'extra.team': 'Departamento Pessoal',
        time: { $gte: { $date: '-0M-' }, $lte: { $date: '-0M+' } },
        type: 0
      }
    },
    {
      $group: {
        _id: null,
        totalPoints: { $sum: '$total' },
        blockedPoints: {
          $sum: { $cond: [{ $eq: ['$item', 'locked_points'] }, '$total', 0] }
        },
        unlockedPoints: {
          $sum: { $cond: [{ $eq: ['$item', 'unlocked_points'] }, '$total', 0] }
        }
      }
    }
  ]
};

this.http.post('/v3/aggregate/achievement', query);
```

**2. Get Team Progress:**
```typescript
const query = {
  aggregate: [
    {
      $match: {
        'attributes.team': 'Departamento Pessoal',
        time: { $gte: { $date: '-0M-' }, $lte: { $date: '-0M+' } }
      }
    },
    {
      $group: {
        _id: '$actionId',
        count: { $sum: 1 }
      }
    }
  ]
};

this.http.post('/v3/aggregate/action_log', query);
```

**3. Get Graph Data:**
```typescript
const query = {
  aggregate: [
    {
      $match: {
        'attributes.team': 'Departamento Pessoal',
        time: { $gte: { $date: '-7d-' }, $lte: { $date: '-0d+' } }
      }
    },
    {
      $project: {
        date: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $toDate: '$time' }
          }
        },
        actionId: 1
      }
    },
    {
      $group: {
        _id: { date: '$date', actionId: '$actionId' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]
};

this.http.post('/v3/aggregate/action_log', query);
```

## Error Handling

### Aggregate Query Error Handling

```typescript
executeAggregateQuery<T>(collection: string, query: AggregateQuery): Observable<T[]> {
  return this.http.post<{ result: T[] }>(`/v3/aggregate/${collection}`, query).pipe(
    map(response => response.result || []),
    retry({ count: 2, delay: 1000 }),
    catchError((error: HttpErrorResponse) => {
      console.error('Aggregate query failed:', error);
      
      if (error.status === 400) {
        this.toastService.error('Consulta inválida. Verifique os filtros selecionados.');
      } else if (error.status === 403) {
        this.toastService.error('Acesso negado. Você não tem permissão para visualizar estes dados.');
      } else {
        this.toastService.error('Erro ao carregar dados. Tente novamente.');
      }
      
      return of([]);
    })
  );
}
```

## Testing Strategy

### Property-Based Testing Examples

```typescript
import * as fc from 'fast-check';

describe('Team Management Dashboard Property Tests', () => {
  /**
   * Property 1: Team Points Aggregation Accuracy
   * Validates: Requirements 4.2, 4.3
   */
  it('should aggregate team points correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          player: fc.string(),
          total: fc.integer({ min: 0, max: 1000 }),
          item: fc.constantFrom('locked_points', 'unlocked_points')
        })),
        (achievements) => {
          const result = processPointsAggregate(achievements);
          
          const expectedTotal = achievements.reduce((sum, a) => sum + a.total, 0);
          const expectedBlocked = achievements
            .filter(a => a.item === 'locked_points')
            .reduce((sum, a) => sum + a.total, 0);
          const expectedUnlocked = achievements
            .filter(a => a.item === 'unlocked_points')
            .reduce((sum, a) => sum + a.total, 0);
          
          expect(result.total).toBe(expectedTotal);
          expect(result.bloqueados).toBe(expectedBlocked);
          expect(result.desbloqueados).toBe(expectedUnlocked);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Graph Data Completeness
   * Validates: Requirements 9.1, 9.5, 10.5
   */
  it('should fill all dates in range with data or zeros', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 90 }), // period in days
        fc.array(fc.record({
          date: fc.date(),
          value: fc.integer({ min: 0, max: 100 })
        })),
        (period, sparseData) => {
          const endDate = new Date();
          const startDate = subDays(endDate, period);
          
          const result = fillMissingDates(sparseData, startDate, endDate);
          
          // Should have exactly period + 1 data points
          expect(result.length).toBe(period + 1);
          
          // All dates should be in sequence
          for (let i = 1; i < result.length; i++) {
            const diff = differenceInDays(result[i].date, result[i - 1].date);
            expect(diff).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: Time Period Selector Boundary
   * Validates: Requirements 11.3, 11.4
   */
  it('should calculate correct date range for any period', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(7, 15, 30, 60, 90),
        (period) => {
          const endDate = new Date();
          const startDate = calculateStartDate(period, endDate);
          
          const actualDiff = differenceInDays(endDate, startDate);
          expect(actualDiff).toBe(period);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

## Performance Considerations

### Caching Strategy

```typescript
@Injectable()
export class TeamAggregateService {
  private cache = new Map<string, { data: any, timestamp: number }>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  getTeamSeasonPoints(teamId: string, seasonStart: Date, seasonEnd: Date): Observable<TeamSeasonPoints> {
    const cacheKey = `points_${teamId}_${seasonStart.getTime()}_${seasonEnd.getTime()}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return of(cached.data);
    }
    
    const query = this.queryBuilder.buildPointsAggregateQuery(teamId, seasonStart, seasonEnd);
    
    return this.funifierApi.aggregate('achievement', query).pipe(
      map(result => this.processPointsAggregate(result)),
      tap(data => {
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
      })
    );
  }
}
```

### Query Optimization

1. **Use Indexed Fields**: Always filter by indexed fields in $match stage (time, userId, attributes.team)
2. **Limit Early**: Apply $match before $group to reduce documents processed
3. **Project Only Needed Fields**: Use $project to reduce data transfer
4. **Avoid Large Result Sets**: Limit aggregate results to reasonable sizes

## Routing Configuration

```typescript
const routes: Routes = [
  {
    path: 'team-management',
    component: TeamManagementDashboardComponent,
    canActivate: [TeamRoleGuardService],
    data: { title: 'Gestão de Equipe' }
  }
];
```

## Deployment Considerations

- Same deployment strategy as existing gamification dashboard
- No additional infrastructure required
- Uses existing Funifier API authentication
- Shares same Angular build pipeline
