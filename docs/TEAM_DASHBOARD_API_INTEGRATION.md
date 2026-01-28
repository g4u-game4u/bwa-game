# Team Dashboard API Integration Patterns

This document describes the API integration patterns used in the Team Management Dashboard, including request/response formats, error handling, and caching strategies.

## Table of Contents

1. [Overview](#overview)
2. [Funifier API Endpoints](#funifier-api-endpoints)
3. [Request Patterns](#request-patterns)
4. [Response Handling](#response-handling)
5. [Error Handling](#error-handling)
6. [Caching Strategy](#caching-strategy)
7. [Performance Monitoring](#performance-monitoring)
8. [Authentication](#authentication)
9. [Rate Limiting](#rate-limiting)
10. [Best Practices](#best-practices)

## Overview

The Team Management Dashboard integrates with the Funifier API to fetch team performance data using MongoDB aggregate queries. The integration follows RESTful principles and implements robust error handling, caching, and performance monitoring.

### Key Services

- **FunifierApiService**: Base HTTP client for Funifier API
- **TeamAggregateService**: Team-specific aggregate queries
- **AggregateQueryBuilderService**: Query construction
- **GraphDataProcessorService**: Response processing

### Architecture

```
Component
    ↓
TeamAggregateService (caching, error handling)
    ↓
FunifierApiService (HTTP client)
    ↓
AuthInterceptor (authentication)
    ↓
Funifier API
```

## Funifier API Endpoints

### Base URL

```
Production: https://api.funifier.com
Staging: https://staging-api.funifier.com
```

### Aggregate Endpoint

```
POST /v3/database/{collection}/aggregate
```

**Collections**:
- `achievement`: Point awards and achievements
- `action_log`: User actions and activities

### Player Endpoint

```
GET /v3/player/{userId}
```

Used for fetching user roles and metadata.

## Request Patterns

### Basic Aggregate Request

```typescript
const endpoint = '/v3/database/achievement/aggregate';
const query = {
  aggregate: [
    { $match: { 'extra.team': 'Departamento Pessoal' } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]
};

this.http.post(endpoint, query).subscribe(response => {
  console.log(response.result);
});
```

### With Headers

```typescript
const headers = new HttpHeaders({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`
});

this.http.post(endpoint, query, { headers }).subscribe();
```

### With Error Handling

```typescript
this.http.post(endpoint, query).pipe(
  retry({ count: 2, delay: 1000 }),
  catchError(error => {
    console.error('API Error:', error);
    return of({ result: [] });
  })
).subscribe();
```

### TeamAggregateService Pattern

```typescript
getTeamSeasonPoints(
  teamId: string,
  seasonStart: Date,
  seasonEnd: Date
): Observable<TeamSeasonPoints> {
  // 1. Check cache
  const cacheKey = `points_${teamId}_${seasonStart.getTime()}_${seasonEnd.getTime()}`;
  const cached = this.getFromCache<TeamSeasonPoints>(cacheKey);
  if (cached) {
    return of(cached);
  }
  
  // 2. Build query
  const query = this.queryBuilder.buildPointsAggregateQuery(
    teamId,
    seasonStart,
    seasonEnd
  );
  
  // 3. Execute with error handling
  return this.executeAggregateQuery<any>('achievement', query).pipe(
    map(result => this.processPointsAggregate(result)),
    tap(data => this.setCache(cacheKey, data)),
    catchError(error => this.handleAggregateError('getTeamSeasonPoints', error))
  );
}
```

## Response Handling

### Standard Response Format

```json
{
  "result": [
    { "_id": "...", "count": 123 }
  ]
}
```

### Response Processing

```typescript
private executeAggregateQuery<T>(
  collection: string,
  query: AggregateQuery
): Observable<T[]> {
  const endpoint = `/v3/database/${collection}/aggregate`;
  
  return this.funifierApi.post<{ result: T[] }>(endpoint, query).pipe(
    map(response => {
      // Handle different response formats
      if (response && Array.isArray(response.result)) {
        return response.result;
      }
      if (Array.isArray(response)) {
        return response;
      }
      return [];
    })
  );
}
```

### Empty Result Handling

```typescript
private processPointsAggregate(result: any[]): TeamSeasonPoints {
  // Always check for empty results
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

### Null/Undefined Field Handling

```typescript
// Always provide defaults for optional fields
const metrics: TeamProgressMetrics = {
  processosIncompletos: data.incomplete || 0,
  atividadesFinalizadas: data.activities || 0,
  processosFinalizados: data.completed || 0
};
```

## Error Handling

### Error Types

1. **Network Errors**: Connection issues, timeouts
2. **HTTP Errors**: 400, 401, 403, 404, 500
3. **Data Errors**: Invalid response format, missing fields
4. **Query Errors**: Invalid aggregate syntax

### Error Handling Pattern

```typescript
private handleAggregateError(
  methodName: string,
  error: any
): Observable<never> {
  console.error(`TeamAggregateService.${methodName} error:`, error);
  
  let errorMessage = 'Erro ao carregar dados da equipe';
  
  // HTTP error codes
  if (error.status === 400) {
    errorMessage = 'Consulta inválida. Verifique os filtros selecionados.';
  } else if (error.status === 401) {
    errorMessage = 'Sessão expirada. Faça login novamente.';
  } else if (error.status === 403) {
    errorMessage = 'Acesso negado. Você não tem permissão para visualizar estes dados.';
  } else if (error.status === 404) {
    errorMessage = 'Dados não encontrados.';
  } else if (error.status >= 500) {
    errorMessage = 'Erro no servidor. Tente novamente mais tarde.';
  }
  
  // Show user-friendly message
  this.toastService.error(errorMessage);
  
  return throwError(() => new Error(errorMessage));
}
```

### Retry Logic

```typescript
this.http.post(endpoint, query).pipe(
  retry({
    count: 2,           // Retry up to 2 times
    delay: 1000,        // Wait 1 second between retries
    resetOnSuccess: true
  }),
  catchError(error => {
    // Handle error after retries exhausted
    return this.handleError(error);
  })
).subscribe();
```

### Timeout Handling

```typescript
import { timeout } from 'rxjs/operators';

this.http.post(endpoint, query).pipe(
  timeout(30000), // 30 second timeout
  catchError(error => {
    if (error.name === 'TimeoutError') {
      this.toastService.error('Requisição expirou. Tente novamente.');
    }
    return of({ result: [] });
  })
).subscribe();
```

### Component-Level Error Handling

```typescript
loadSidebarData(dateRange: { start: Date; end: Date }): void {
  this.isLoadingSidebar = true;
  this.hasSidebarError = false;
  
  this.teamAggregateService
    .getTeamSeasonPoints(this.selectedTeam, dateRange.start, dateRange.end)
    .pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoadingSidebar = false)
    )
    .subscribe({
      next: (points) => {
        this.seasonPoints = points;
        this.hasSidebarError = false;
      },
      error: (error) => {
        console.error('Error loading season points:', error);
        this.seasonPoints = { total: 0, bloqueados: 0, desbloqueados: 0 };
        this.hasSidebarError = true;
        this.sidebarErrorMessage = 'Erro ao carregar pontos da temporada';
      }
    });
}
```

## Caching Strategy

### Cache Implementation

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

private cache = new Map<string, CacheEntry<any>>();
private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
```

### Cache Key Generation

```typescript
// Include all query parameters in cache key
const cacheKey = `points_${teamId}_${seasonStart.getTime()}_${seasonEnd.getTime()}`;
```

### Get from Cache

```typescript
private getFromCache<T>(key: string): T | null {
  const cached = this.cache.get(key);
  
  if (!cached) {
    return null;
  }
  
  // Check if cache entry is still valid
  const now = Date.now();
  if (now - cached.timestamp > this.cacheTTL) {
    this.cache.delete(key);
    return null;
  }
  
  return cached.data as T;
}
```

### Set Cache

```typescript
private setCache<T>(key: string, data: T): void {
  this.cache.set(key, {
    data,
    timestamp: Date.now()
  });
}
```

### Clear Cache

```typescript
// Clear all cache
clearCache(): void {
  this.cache.clear();
}

// Clear specific team cache
clearTeamCache(teamId: string): void {
  const keysToDelete: string[] = [];
  
  this.cache.forEach((_, key) => {
    if (key.includes(teamId)) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => this.cache.delete(key));
}
```

### Cache Benefits

- **Reduced API Calls**: Fewer requests to Funifier API
- **Faster Response**: Instant data for cached queries
- **Lower Costs**: Reduced API usage and bandwidth
- **Better UX**: Smoother user experience

### Cache Invalidation

Cache is invalidated:
1. After TTL expires (5 minutes)
2. On manual refresh (user clicks refresh button)
3. On team change
4. On collaborator filter change

## Performance Monitoring

### Measure Query Time

```typescript
private executeAggregateQuery<T>(
  collection: string,
  query: AggregateQuery
): Observable<T[]> {
  const startTime = performance.now();
  
  return this.funifierApi.post<{ result: T[] }>(endpoint, query).pipe(
    tap(() => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Log slow queries (> 1 second)
      if (duration > 1000) {
        console.warn(`Slow aggregate query on ${collection}: ${duration.toFixed(2)}ms`);
      }
    })
  );
}
```

### Performance Monitor Service

```typescript
@Injectable({ providedIn: 'root' })
export class PerformanceMonitorService {
  measureRenderTime(componentName: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`${componentName} render time: ${duration.toFixed(2)}ms`);
      
      // Send to analytics if needed
      if (duration > 1000) {
        this.reportSlowRender(componentName, duration);
      }
    };
  }
}
```

### Usage in Service

```typescript
const endMeasure = this.performanceMonitor.measureRenderTime(`aggregate_${collection}`);

return this.funifierApi.post(endpoint, query).pipe(
  tap(() => endMeasure())
);
```

## Authentication

### Auth Interceptor

```typescript
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get API key from environment or session
    const apiKey = environment.apiKey || this.getStoredApiKey();
    
    // Clone request and add authorization header
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    
    return next.handle(authReq).pipe(
      catchError(error => {
        if (error.status === 401) {
          // Handle unauthorized - redirect to login
          this.router.navigate(['/login']);
        }
        return throwError(() => error);
      })
    );
  }
}
```

### API Key Storage

```typescript
// Store in environment file (recommended for production)
export const environment = {
  production: true,
  apiUrl: 'https://api.funifier.com',
  apiKey: 'your-api-key-here'
};

// Or store in session (for user-specific keys)
sessionStorage.setItem('funifier_api_key', apiKey);
```

## Rate Limiting

### Funifier API Limits

- **Rate Limit**: 100 requests per minute per API key
- **Burst Limit**: 20 requests per second
- **Daily Limit**: 10,000 requests per day

### Handling Rate Limits

```typescript
private handleRateLimitError(error: any): Observable<any> {
  if (error.status === 429) {
    const retryAfter = error.headers.get('Retry-After') || 60;
    
    this.toastService.warning(
      `Limite de requisições atingido. Aguarde ${retryAfter} segundos.`
    );
    
    // Retry after specified time
    return timer(retryAfter * 1000).pipe(
      switchMap(() => this.retryRequest())
    );
  }
  
  return throwError(() => error);
}
```

### Request Throttling

```typescript
import { throttleTime } from 'rxjs/operators';

// Throttle requests to max 1 per second
this.searchInput$.pipe(
  throttleTime(1000),
  switchMap(query => this.searchTeams(query))
).subscribe();
```

### Request Debouncing

```typescript
import { debounceTime } from 'rxjs/operators';

// Wait 300ms after user stops typing
this.searchInput$.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(query => this.searchTeams(query))
).subscribe();
```

## Best Practices

### 1. Always Use Caching

```typescript
// ✅ Good: Check cache first
const cached = this.getFromCache(key);
if (cached) return of(cached);

// ❌ Bad: Always hit API
return this.http.post(endpoint, query);
```

### 2. Handle All Error Cases

```typescript
// ✅ Good: Comprehensive error handling
.pipe(
  retry({ count: 2, delay: 1000 }),
  catchError(error => {
    this.handleError(error);
    return of(defaultValue);
  })
)

// ❌ Bad: No error handling
.subscribe(data => this.data = data);
```

### 3. Provide Loading States

```typescript
// ✅ Good: Show loading indicator
this.isLoading = true;
this.service.getData().pipe(
  finalize(() => this.isLoading = false)
).subscribe();

// ❌ Bad: No loading feedback
this.service.getData().subscribe();
```

### 4. Use Typed Responses

```typescript
// ✅ Good: Strongly typed
interface PointsResponse {
  result: Array<{
    _id: null;
    totalPoints: number;
    blockedPoints: number;
    unlockedPoints: number;
  }>;
}

this.http.post<PointsResponse>(endpoint, query);

// ❌ Bad: Untyped
this.http.post(endpoint, query);
```

### 5. Unsubscribe from Observables

```typescript
// ✅ Good: Proper cleanup
private destroy$ = new Subject<void>();

ngOnInit() {
  this.service.getData()
    .pipe(takeUntil(this.destroy$))
    .subscribe();
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}

// ❌ Bad: Memory leak
ngOnInit() {
  this.service.getData().subscribe();
}
```

### 6. Batch Related Requests

```typescript
// ✅ Good: Parallel requests
forkJoin({
  points: this.getTeamPoints(teamId),
  progress: this.getTeamProgress(teamId),
  members: this.getTeamMembers(teamId)
}).subscribe(({ points, progress, members }) => {
  // All data loaded
});

// ❌ Bad: Sequential requests
this.getTeamPoints(teamId).subscribe(points => {
  this.getTeamProgress(teamId).subscribe(progress => {
    this.getTeamMembers(teamId).subscribe(members => {
      // Slow!
    });
  });
});
```

### 7. Monitor Performance

```typescript
// ✅ Good: Track slow queries
const start = performance.now();
this.http.post(endpoint, query).pipe(
  tap(() => {
    const duration = performance.now() - start;
    if (duration > 1000) {
      console.warn(`Slow query: ${duration}ms`);
    }
  })
).subscribe();
```

### 8. Use Environment Variables

```typescript
// ✅ Good: Environment-specific config
const apiUrl = environment.apiUrl;
const apiKey = environment.apiKey;

// ❌ Bad: Hardcoded values
const apiUrl = 'https://api.funifier.com';
const apiKey = 'abc123';
```

## Testing API Integration

### Mock Service

```typescript
class MockTeamAggregateService {
  getTeamSeasonPoints(): Observable<TeamSeasonPoints> {
    return of({ total: 1000, bloqueados: 600, desbloqueados: 400 });
  }
}

// In test
TestBed.configureTestingModule({
  providers: [
    { provide: TeamAggregateService, useClass: MockTeamAggregateService }
  ]
});
```

### HTTP Testing

```typescript
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

describe('TeamAggregateService', () => {
  let service: TeamAggregateService;
  let httpMock: HttpTestingController;
  
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TeamAggregateService]
    });
    
    service = TestBed.inject(TeamAggregateService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  
  it('should fetch team points', () => {
    const mockResponse = {
      result: [{ _id: null, totalPoints: 1000 }]
    };
    
    service.getTeamSeasonPoints('Team1', new Date(), new Date())
      .subscribe(points => {
        expect(points.total).toBe(1000);
      });
    
    const req = httpMock.expectOne(req => 
      req.url.includes('/aggregate')
    );
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);
  });
  
  afterEach(() => {
    httpMock.verify();
  });
});
```

## Additional Resources

- [Aggregate Query Patterns](TEAM_DASHBOARD_AGGREGATE_QUERIES.md)
- [Troubleshooting Guide](TEAM_DASHBOARD_TROUBLESHOOTING.md)
- [Funifier API Documentation](https://funifier.com/docs)
- [RxJS Documentation](https://rxjs.dev)

---

**Last Updated**: January 2024  
**Version**: 1.0  
**For**: Game4U Team Management Dashboard
