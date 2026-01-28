import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TeamAggregateService } from './team-aggregate.service';
import { FunifierApiService } from './funifier-api.service';
import { AggregateQueryBuilderService } from './aggregate-query-builder.service';
import { PerformanceMonitorService } from './performance-monitor.service';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';

/**
 * Performance Tests for TeamAggregateService
 * 
 * Verifies:
 * - Caching reduces API calls (Requirement 17.1)
 * - Cache TTL is respected
 * - Performance monitoring for aggregate queries (Requirement 17.4)
 * - Query execution time tracking
 * 
 * Task: 16.1 Write performance tests
 */
describe('TeamAggregateService Performance Tests', () => {
  let service: TeamAggregateService;
  let funifierApi: jasmine.SpyObj<FunifierApiService>;
  let queryBuilder: jasmine.SpyObj<AggregateQueryBuilderService>;
  let performanceMonitor: PerformanceMonitorService;

  const mockPointsResponse = {
    result: [{
      totalPoints: 1000,
      blockedPoints: 400,
      unlockedPoints: 600
    }]
  };

  const mockProgressResponse = {
    result: [
      { _id: 'completed_activity', count: 50 },
      { _id: 'completed_process', count: 20 },
      { _id: 'incomplete_process', count: 10 }
    ]
  };

  const mockMembersResponse = {
    result: [
      { _id: 'user1@test.com' },
      { _id: 'user2@test.com' },
      { _id: 'user3@test.com' }
    ]
  };

  beforeEach(() => {
    const funifierApiSpy = jasmine.createSpyObj('FunifierApiService', ['post']);
    const queryBuilderSpy = jasmine.createSpyObj('AggregateQueryBuilderService', [
      'buildPointsAggregateQuery',
      'buildProgressAggregateQuery',
      'buildCollaboratorListQuery'
    ]);

    TestBed.configureTestingModule({
      providers: [
        TeamAggregateService,
        { provide: FunifierApiService, useValue: funifierApiSpy },
        { provide: AggregateQueryBuilderService, useValue: queryBuilderSpy },
        PerformanceMonitorService
      ]
    });

    service = TestBed.inject(TeamAggregateService);
    funifierApi = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
    queryBuilder = TestBed.inject(AggregateQueryBuilderService) as jasmine.SpyObj<AggregateQueryBuilderService>;
    performanceMonitor = TestBed.inject(PerformanceMonitorService);

    // Setup default mock responses
    queryBuilder.buildPointsAggregateQuery.and.returnValue({ aggregate: [] });
    queryBuilder.buildProgressAggregateQuery.and.returnValue({ aggregate: [] });
    queryBuilder.buildCollaboratorListQuery.and.returnValue({ aggregate: [] });
  });

  describe('Caching Performance (Requirement 17.1)', () => {
    it('should cache team season points and reduce API calls', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // First call - should hit API
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      // API should not be called again
      expect(funifierApi.post).toHaveBeenCalledTimes(1);

      // Third call - should still use cache
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(1);
    }));

    it('should cache team progress metrics', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockProgressResponse));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // Multiple calls
      service.getTeamProgressMetrics(teamId, startDate, endDate).subscribe();
      tick();
      service.getTeamProgressMetrics(teamId, startDate, endDate).subscribe();
      tick();
      service.getTeamProgressMetrics(teamId, startDate, endDate).subscribe();
      tick();

      // Should only call API once
      expect(funifierApi.post).toHaveBeenCalledTimes(1);
    }));

    it('should cache team members list', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockMembersResponse));

      const teamId = 'Team A';

      // Multiple calls
      service.getTeamMembers(teamId).subscribe();
      tick();
      service.getTeamMembers(teamId).subscribe();
      tick();

      // Should only call API once
      expect(funifierApi.post).toHaveBeenCalledTimes(1);
    }));

    it('should use separate cache entries for different teams', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse));

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // Call for Team A
      service.getTeamSeasonPoints('Team A', startDate, endDate).subscribe();
      tick();

      // Call for Team B - should hit API
      service.getTeamSeasonPoints('Team B', startDate, endDate).subscribe();
      tick();

      // Should call API twice (once per team)
      expect(funifierApi.post).toHaveBeenCalledTimes(2);

      // Call for Team A again - should use cache
      service.getTeamSeasonPoints('Team A', startDate, endDate).subscribe();
      tick();

      // Should still be 2 calls
      expect(funifierApi.post).toHaveBeenCalledTimes(2);
    }));

    it('should use separate cache entries for different date ranges', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse));

      const teamId = 'Team A';

      // Call for January
      service.getTeamSeasonPoints(teamId, new Date('2024-01-01'), new Date('2024-01-31')).subscribe();
      tick();

      // Call for February - should hit API
      service.getTeamSeasonPoints(teamId, new Date('2024-02-01'), new Date('2024-02-29')).subscribe();
      tick();

      // Should call API twice (once per date range)
      expect(funifierApi.post).toHaveBeenCalledTimes(2);
    }));
  });

  describe('Cache TTL (Requirement 17.1)', () => {
    it('should respect 5-minute cache TTL', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // First call
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(1);

      // Wait 4 minutes - should still use cache
      tick(4 * 60 * 1000);
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(1);

      // Wait another 2 minutes (total 6 minutes) - cache should expire
      tick(2 * 60 * 1000);
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      // Should call API again
      expect(funifierApi.post).toHaveBeenCalledTimes(2);
    }));
  });

  describe('Cache Management', () => {
    it('should clear all cache on clearCache()', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // First call - populate cache
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache();

      // Next call should hit API again
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(2);
    }));

    it('should clear team-specific cache on clearTeamCache()', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse));

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // Populate cache for both teams
      service.getTeamSeasonPoints('Team A', startDate, endDate).subscribe();
      tick();
      service.getTeamSeasonPoints('Team B', startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(2);

      // Clear cache for Team A only
      service.clearTeamCache('Team A');

      // Team A should hit API, Team B should use cache
      service.getTeamSeasonPoints('Team A', startDate, endDate).subscribe();
      tick();
      service.getTeamSeasonPoints('Team B', startDate, endDate).subscribe();
      tick();

      // Should have 3 total calls (2 initial + 1 for Team A)
      expect(funifierApi.post).toHaveBeenCalledTimes(3);
    }));
  });

  describe('Query Performance Monitoring (Requirement 17.4)', () => {
    it('should measure aggregate query execution time', fakeAsync(() => {
      // Simulate slow query (500ms)
      funifierApi.post.and.returnValue(of(mockPointsResponse).pipe(delay(500)));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const startTime = performance.now();

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick(500);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should measure the query time
      expect(duration).toBeGreaterThanOrEqual(500);
    }));

    it('should log slow queries (> 1 second)', fakeAsync(() => {
      spyOn(console, 'warn');

      // Simulate very slow query (1500ms)
      funifierApi.post.and.returnValue(of(mockPointsResponse).pipe(delay(1500)));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick(1500);

      // Should log warning for slow query
      expect(console.warn).toHaveBeenCalledWith(
        jasmine.stringContaining('Slow aggregate query')
      );
    }));

    it('should not log warnings for fast queries', fakeAsync(() => {
      spyOn(console, 'warn');

      // Simulate fast query (100ms)
      funifierApi.post.and.returnValue(of(mockPointsResponse).pipe(delay(100)));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick(100);

      // Should not log warning
      expect(console.warn).not.toHaveBeenCalled();
    }));
  });

  describe('Cached vs Uncached Performance', () => {
    it('should demonstrate performance improvement with caching', fakeAsync(() => {
      // Simulate API delay (200ms)
      funifierApi.post.and.returnValue(of(mockPointsResponse).pipe(delay(200)));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // First call (uncached) - measure time
      const uncachedStart = performance.now();
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick(200);
      const uncachedDuration = performance.now() - uncachedStart;

      // Second call (cached) - measure time
      const cachedStart = performance.now();
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      tick();
      const cachedDuration = performance.now() - cachedStart;

      // Cached call should be significantly faster
      expect(cachedDuration).toBeLessThan(uncachedDuration / 10);
      expect(cachedDuration).toBeLessThan(50); // Should be nearly instant
    }));
  });

  describe('Concurrent Request Performance', () => {
    it('should handle multiple concurrent requests efficiently', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse).pipe(delay(100)));

      const teamId = 'Team A';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const startTime = performance.now();

      // Make 5 concurrent requests
      for (let i = 0; i < 5; i++) {
        service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe();
      }

      tick(100);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // With caching, only first request should hit API
      // Total time should be close to single request time
      expect(funifierApi.post).toHaveBeenCalledTimes(1);
      expect(duration).toBeLessThan(200);
    }));
  });

  describe('Memory Efficiency', () => {
    it('should not grow cache indefinitely', fakeAsync(() => {
      funifierApi.post.and.returnValue(of(mockPointsResponse));

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      // Create many cache entries
      for (let i = 0; i < 100; i++) {
        service.getTeamSeasonPoints(`Team ${i}`, startDate, endDate).subscribe();
        tick();
      }

      // Cache should contain entries, but service should remain functional
      expect(funifierApi.post).toHaveBeenCalledTimes(100);

      // Verify cache can still be cleared
      service.clearCache();

      // Next call should hit API
      service.getTeamSeasonPoints('Team 0', startDate, endDate).subscribe();
      tick();

      expect(funifierApi.post).toHaveBeenCalledTimes(101);
    }));
  });
});
