# Team Dashboard Aggregate Query Patterns

This document provides comprehensive documentation on MongoDB aggregate query patterns used in the Team Management Dashboard, including examples, optimization tips, and Funifier-specific date expressions.

## Table of Contents

1. [Overview](#overview)
2. [Funifier Aggregate Endpoint](#funifier-aggregate-endpoint)
3. [Relative Date Expressions](#relative-date-expressions)
4. [Query Patterns](#query-patterns)
5. [Optimization Tips](#optimization-tips)
6. [Common Pitfalls](#common-pitfalls)

## Overview

The Team Management Dashboard uses MongoDB aggregate pipelines to query team performance data from the Funifier API. Aggregate queries allow for powerful data transformations, grouping, and calculations directly on the database, reducing the amount of data transferred and processed on the client side.

### Collections Used

- **achievement**: Stores point awards (locked and unlocked points)
- **action_log**: Stores user actions and activities

### Key Concepts

- **Aggregate Pipeline**: A series of stages that process documents sequentially
- **$match**: Filters documents (like WHERE in SQL)
- **$group**: Groups documents and performs calculations (like GROUP BY in SQL)
- **$project**: Reshapes documents, adds or removes fields
- **$sort**: Orders documents

## Funifier Aggregate Endpoint

### Endpoint Format

```
POST /v3/database/{collection}/aggregate
```

### Request Structure

```json
{
  "aggregate": [
    { "$match": { ... } },
    { "$group": { ... } },
    { "$sort": { ... } }
  ]
}
```

### Response Structure

```json
{
  "result": [
    { "_id": "...", "count": 123, ... }
  ]
}
```

## Relative Date Expressions

Funifier supports special relative date expressions for dynamic date filtering:

### Month-Based Expressions

| Expression | Meaning |
|------------|---------|
| `-0M-` | Start of current month |
| `-0M+` | End of current month |
| `-1M-` | Start of previous month |
| `-1M+` | End of previous month |
| `-2M-` | Start of 2 months ago |

### Day-Based Expressions

| Expression | Meaning |
|------------|---------|
| `-0d-` | Start of today |
| `-0d+` | End of today |
| `-7d-` | 7 days ago |
| `-30d-` | 30 days ago |

### Usage in Queries

```json
{
  "time": {
    "$gte": { "$date": "-30d-" },
    "$lte": { "$date": "-0d+" }
  }
}
```

**Note**: You can also use absolute ISO date strings:
```json
{
  "time": {
    "$gte": { "$date": "2024-01-01T00:00:00.000Z" },
    "$lte": { "$date": "2024-01-31T23:59:59.999Z" }
  }
}
```

## Query Patterns

### 1. Team Points Aggregation

**Purpose**: Calculate total, blocked, and unlocked points for a team.

**Collection**: `achievement`

**Query**:
```json
{
  "aggregate": [
    {
      "$match": {
        "extra.team": "Departamento Pessoal",
        "time": {
          "$gte": { "$date": "-0M-" },
          "$lte": { "$date": "-0M+" }
        },
        "type": 0
      }
    },
    {
      "$group": {
        "_id": null,
        "totalPoints": { "$sum": "$total" },
        "blockedPoints": {
          "$sum": {
            "$cond": [
              { "$eq": ["$item", "locked_points"] },
              "$total",
              0
            ]
          }
        },
        "unlockedPoints": {
          "$sum": {
            "$cond": [
              { "$eq": ["$item", "unlocked_points"] },
              "$total",
              0
            ]
          }
        }
      }
    }
  ]
}
```

**Result**:
```json
{
  "result": [
    {
      "_id": null,
      "totalPoints": 1250,
      "blockedPoints": 800,
      "unlockedPoints": 450
    }
  ]
}
```

**TypeScript Implementation**:
```typescript
buildPointsAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery {
  return {
    aggregate: [
      {
        $match: {
          'extra.team': teamId,
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
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
```

### 2. Team Progress Metrics

**Purpose**: Count actions by type for progress tracking.

**Collection**: `action_log`

**Query**:
```json
{
  "aggregate": [
    {
      "$match": {
        "attributes.team": "Departamento Pessoal",
        "time": {
          "$gte": { "$date": "-0M-" },
          "$lte": { "$date": "-0M+" }
        }
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

**Result**:
```json
{
  "result": [
    { "_id": "processo_finalizado", "count": 45 },
    { "_id": "atividade_finalizada", "count": 230 },
    { "_id": "processo_incompleto", "count": 12 }
  ]
}
```

**TypeScript Implementation**:
```typescript
buildProgressAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery {
  return {
    aggregate: [
      {
        $match: {
          'attributes.team': teamId,
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
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
```

### 3. Historical Graph Data (Daily Grouping)

**Purpose**: Get daily action counts for trend visualization.

**Collection**: `action_log`

**Query**:
```json
{
  "aggregate": [
    {
      "$match": {
        "attributes.team": "Departamento Pessoal",
        "time": {
          "$gte": { "$date": "-30d-" },
          "$lte": { "$date": "-0d+" }
        }
      }
    },
    {
      "$project": {
        "date": {
          "$dateToString": {
            "format": "%Y-%m-%d",
            "date": { "$toDate": "$time" }
          }
        },
        "actionId": 1
      }
    },
    {
      "$group": {
        "_id": {
          "date": "$date",
          "actionId": "$actionId"
        },
        "count": { "$sum": 1 }
      }
    },
    {
      "$sort": { "_id.date": 1 }
    }
  ]
}
```

**Result**:
```json
{
  "result": [
    { "_id": { "date": "2024-01-01", "actionId": "completed" }, "count": 15 },
    { "_id": { "date": "2024-01-01", "actionId": "pending" }, "count": 5 },
    { "_id": { "date": "2024-01-02", "actionId": "completed" }, "count": 18 },
    { "_id": { "date": "2024-01-02", "actionId": "pending" }, "count": 3 }
  ]
}
```

**TypeScript Implementation**:
```typescript
buildGraphDataQuery(
  teamId: string,
  startDate: Date,
  endDate: Date,
  groupBy: 'day' | 'week' = 'day'
): AggregateQuery {
  const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%U';

  return {
    aggregate: [
      {
        $match: {
          'attributes.team': teamId,
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
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
```

### 4. Collaborator List

**Purpose**: Get unique list of team members.

**Collection**: `action_log`

**Query**:
```json
{
  "aggregate": [
    {
      "$match": {
        "attributes.team": "Departamento Pessoal"
      }
    },
    {
      "$group": {
        "_id": "$userId",
        "count": { "$sum": 1 }
      }
    },
    {
      "$sort": { "_id": 1 }
    }
  ]
}
```

**Result**:
```json
{
  "result": [
    { "_id": "user1@example.com", "count": 145 },
    { "_id": "user2@example.com", "count": 98 },
    { "_id": "user3@example.com", "count": 203 }
  ]
}
```

**TypeScript Implementation**:
```typescript
buildCollaboratorListQuery(teamId: string): AggregateQuery {
  return {
    aggregate: [
      {
        $match: {
          'attributes.team': teamId
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]
  };
}
```

### 5. Individual Collaborator Data

**Purpose**: Filter data for a specific team member.

**Collection**: `action_log`

**Query**:
```json
{
  "aggregate": [
    {
      "$match": {
        "userId": "user@example.com",
        "attributes.team": "Departamento Pessoal",
        "time": {
          "$gte": { "$date": "-0M-" },
          "$lte": { "$date": "-0M+" }
        }
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

**Result**:
```json
{
  "result": [
    { "_id": "processo_finalizado", "count": 12 },
    { "_id": "atividade_finalizada", "count": 45 }
  ]
}
```

## Optimization Tips

### 1. Use Indexed Fields in $match

Always filter by indexed fields first to reduce the number of documents processed:

```json
{
  "$match": {
    "time": { "$gte": { "$date": "-30d-" } },  // Indexed
    "attributes.team": "Departamento Pessoal",  // Indexed
    "userId": "user@example.com"                // Indexed
  }
}
```

### 2. Place $match Early in Pipeline

Put $match stages as early as possible to filter documents before expensive operations:

```json
{
  "aggregate": [
    { "$match": { ... } },      // Filter first
    { "$project": { ... } },    // Then transform
    { "$group": { ... } }       // Then aggregate
  ]
}
```

### 3. Limit Result Sets

Use $limit to cap the number of results:

```json
{
  "aggregate": [
    { "$match": { ... } },
    { "$group": { ... } },
    { "$sort": { "count": -1 } },
    { "$limit": 100 }
  ]
}
```

### 4. Use $project to Reduce Data Transfer

Only include fields you need:

```json
{
  "$project": {
    "date": 1,
    "actionId": 1,
    "_id": 0  // Exclude _id if not needed
  }
}
```

### 5. Implement Caching

Cache aggregate results on the client side with appropriate TTL:

```typescript
private cache = new Map<string, { data: any, timestamp: number }>();
private cacheTTL = 5 * 60 * 1000; // 5 minutes

getFromCache<T>(key: string): T | null {
  const cached = this.cache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > this.cacheTTL) {
    this.cache.delete(key);
    return null;
  }
  
  return cached.data as T;
}
```

### 6. Monitor Query Performance

Log slow queries for optimization:

```typescript
const startTime = performance.now();

this.funifierApi.aggregate('action_log', query).subscribe(result => {
  const duration = performance.now() - startTime;
  
  if (duration > 1000) {
    console.warn(`Slow query: ${duration.toFixed(2)}ms`);
  }
});
```

## Common Pitfalls

### 1. Incorrect Date Filtering

**Problem**: Using wrong date format or timezone issues.

**Solution**: Always use ISO strings or Funifier relative expressions:
```typescript
// ✅ Correct
time: { $gte: { $date: date.toISOString() } }

// ❌ Incorrect
time: { $gte: date.getTime() }
```

### 2. Missing Type Filter in Points Query

**Problem**: Including non-point achievements in point calculations.

**Solution**: Always filter by `type: 0` for points:
```json
{
  "$match": {
    "type": 0,  // Points only
    "extra.team": "..."
  }
}
```

### 3. Not Handling Empty Results

**Problem**: Assuming aggregate always returns data.

**Solution**: Always check for empty results:
```typescript
processPointsAggregate(result: any[]): TeamSeasonPoints {
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

### 4. Incorrect Field Paths

**Problem**: Using wrong field paths for nested documents.

**Solution**: Use dot notation for nested fields:
```json
// ✅ Correct
"extra.team": "Departamento Pessoal"
"attributes.team": "Departamento Pessoal"

// ❌ Incorrect
"team": "Departamento Pessoal"
```

### 5. Not Sorting Graph Data

**Problem**: Graph data points in random order.

**Solution**: Always sort by date:
```json
{
  "$sort": { "_id.date": 1 }
}
```

## Testing Aggregate Queries

### Using Funifier API Console

1. Navigate to Funifier API console
2. Select the collection (achievement or action_log)
3. Paste your aggregate query
4. Click "Execute" to see results

### Using Postman

```
POST https://api.funifier.com/v3/database/action_log/aggregate
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "aggregate": [
    { "$match": { "attributes.team": "Departamento Pessoal" } },
    { "$group": { "_id": "$actionId", "count": { "$sum": 1 } } }
  ]
}
```

### Unit Testing

```typescript
describe('AggregateQueryBuilderService', () => {
  it('should build valid points query', () => {
    const query = service.buildPointsAggregateQuery(
      'Departamento Pessoal',
      new Date('2024-01-01'),
      new Date('2024-01-31')
    );
    
    expect(query.aggregate).toBeDefined();
    expect(query.aggregate[0].$match['extra.team']).toBe('Departamento Pessoal');
    expect(query.aggregate[1].$group.totalPoints).toEqual({ $sum: '$total' });
  });
});
```

## Additional Resources

- [MongoDB Aggregation Pipeline Documentation](https://docs.mongodb.com/manual/core/aggregation-pipeline/)
- [Funifier API Documentation](https://funifier.com/docs)
- [AggregateQueryBuilderService Source](../src/app/services/aggregate-query-builder.service.ts)
- [TeamAggregateService Source](../src/app/services/team-aggregate.service.ts)
