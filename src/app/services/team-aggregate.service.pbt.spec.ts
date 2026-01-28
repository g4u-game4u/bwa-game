import { TestBed } from '@angular/core/testing';
import * as fc from 'fast-check';
import { TeamAggregateService, TeamSeasonPoints } from './team-aggregate.service';
import { FunifierApiService } from './funifier-api.service';
import { AggregateQueryBuilderService } from './aggregate-query-builder.service';
import { of } from 'rxjs';

/**
 * Property-Based Tests for TeamAggregateService
 * 
 * These tests verify universal properties that should hold for all inputs,
 * using fast-check to generate random test cases.
 */
describe('TeamAggregateService Property-Based Tests', () => {
  let service: TeamAggregateService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;
  let queryBuilderSpy: jasmine.SpyObj<AggregateQueryBuilderService>;

  beforeEach(() => {
    const funifierSpy = jasmine.createSpyObj('FunifierApiService', ['post']);
    const builderSpy = jasmine.createSpyObj('AggregateQueryBuilderService', [
      'buildPointsAggregateQuery',
      'buildProgressAggregateQuery',
      'buildCollaboratorListQuery'
    ]);

    TestBed.configureTestingModule({
      providers: [
        TeamAggregateService,
        { provide: FunifierApiService, useValue: funifierSpy },
        { provide: AggregateQueryBuilderService, useValue: builderSpy }
      ]
    });

    service = TestBed.inject(TeamAggregateService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
    queryBuilderSpy = TestBed.inject(AggregateQueryBuilderService) as jasmine.SpyObj<AggregateQueryBuilderService>;
  });

  /**
   * Property 1: Team Points Aggregation Accuracy
   * **Validates: Requirements 4.2, 4.3**
   * 
   * For any team with members who have earned points, the sum of displayed
   * team points should equal the sum of all individual member points within
   * the selected time period.
   * 
   * This property verifies that:
   * 1. Total points = sum of all point values
   * 2. Blocked points = sum of locked_points only
   * 3. Unlocked points = sum of unlocked_points only
   * 4. Total points = blocked points + unlocked points
   */
  describe('Property 1: Team Points Aggregation Accuracy', () => {
    it('should correctly aggregate team points for any set of achievements', (done) => {
      fc.assert(
        fc.asyncProperty(
          // Generate array of achievement records
          fc.array(
            fc.record({
              player: fc.emailAddress(),
              total: fc.integer({ min: 0, max: 1000 }),
              item: fc.constantFrom('locked_points', 'unlocked_points'),
              type: fc.constant(0)
            }),
            { minLength: 0, maxLength: 50 }
          ),
          async (achievements) => {
            // Calculate expected values
            const expectedTotal = achievements.reduce((sum, a) => sum + a.total, 0);
            const expectedBlocked = achievements
              .filter(a => a.item === 'locked_points')
              .reduce((sum, a) => sum + a.total, 0);
            const expectedUnlocked = achievements
              .filter(a => a.item === 'unlocked_points')
              .reduce((sum, a) => sum + a.total, 0);

            // Mock API response
            const mockResponse = {
              result: achievements.length > 0 ? [
                {
                  _id: null,
                  totalPoints: expectedTotal,
                  blockedPoints: expectedBlocked,
                  unlockedPoints: expectedUnlocked
                }
              ] : []
            };

            queryBuilderSpy.buildPointsAggregateQuery.and.returnValue({ aggregate: [] });
            funifierApiSpy.post.and.returnValue(of(mockResponse));

            // Clear cache to ensure fresh data
            service.clearCache();

            // Execute service method
            const result = await service.getTeamSeasonPoints(
              'Test Team',
              new Date('2024-01-01'),
              new Date('2024-01-31')
            ).toPromise();

            // Verify properties
            expect(result!.total).toBe(expectedTotal);
            expect(result!.bloqueados).toBe(expectedBlocked);
            expect(result!.desbloqueados).toBe(expectedUnlocked);
            
            // Verify that total equals sum of blocked and unlocked
            expect(result!.total).toBe(result!.bloqueados + result!.desbloqueados);
          }
        ),
        { numRuns: 100 }
      ).then(() => done());
    });

    it('should handle zero points correctly', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              player: fc.emailAddress(),
              total: fc.constant(0),
              item: fc.constantFrom('locked_points', 'unlocked_points'),
              type: fc.constant(0)
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (achievements) => {
            const mockResponse = {
              result: [
                {
                  _id: null,
                  totalPoints: 0,
                  blockedPoints: 0,
                  unlockedPoints: 0
                }
              ]
            };

            queryBuilderSpy.buildPointsAggregateQuery.and.returnValue({ aggregate: [] });
            funifierApiSpy.post.and.returnValue(of(mockResponse));

            service.clearCache();

            const result = await service.getTeamSeasonPoints(
              'Test Team',
              new Date('2024-01-01'),
              new Date('2024-01-31')
            ).toPromise();

            expect(result!.total).toBe(0);
            expect(result!.bloqueados).toBe(0);
            expect(result!.desbloqueados).toBe(0);
          }
        ),
        { numRuns: 50 }
      ).then(() => done());
    });

    it('should maintain point type separation', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            // Generate locked points
            fc.array(
              fc.record({
                player: fc.emailAddress(),
                total: fc.integer({ min: 1, max: 500 }),
                item: fc.constant('locked_points'),
                type: fc.constant(0)
              }),
              { minLength: 1, maxLength: 20 }
            ),
            // Generate unlocked points
            fc.array(
              fc.record({
                player: fc.emailAddress(),
                total: fc.integer({ min: 1, max: 500 }),
                item: fc.constant('unlocked_points'),
                type: fc.constant(0)
              }),
              { minLength: 1, maxLength: 20 }
            )
          ),
          async ([lockedAchievements, unlockedAchievements]) => {
            const allAchievements = [...lockedAchievements, ...unlockedAchievements];
            
            const expectedTotal = allAchievements.reduce((sum, a) => sum + a.total, 0);
            const expectedBlocked = lockedAchievements.reduce((sum, a) => sum + a.total, 0);
            const expectedUnlocked = unlockedAchievements.reduce((sum, a) => sum + a.total, 0);

            const mockResponse = {
              result: [
                {
                  _id: null,
                  totalPoints: expectedTotal,
                  blockedPoints: expectedBlocked,
                  unlockedPoints: expectedUnlocked
                }
              ]
            };

            queryBuilderSpy.buildPointsAggregateQuery.and.returnValue({ aggregate: [] });
            funifierApiSpy.post.and.returnValue(of(mockResponse));

            service.clearCache();

            const result = await service.getTeamSeasonPoints(
              'Test Team',
              new Date('2024-01-01'),
              new Date('2024-01-31')
            ).toPromise();

            // Verify that blocked and unlocked are correctly separated
            expect(result!.bloqueados).toBe(expectedBlocked);
            expect(result!.desbloqueados).toBe(expectedUnlocked);
            expect(result!.bloqueados).toBeGreaterThan(0);
            expect(result!.desbloqueados).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      ).then(() => done());
    });
  });

  /**
   * Property 3: Date Range Filtering Consistency
   * **Validates: Requirements 6.2, 6.3, 11.4**
   * 
   * For any selected month or time period, all aggregate queries should use
   * the same start and end dates for filtering.
   */
  describe('Property 3: Date Range Filtering Consistency', () => {
    it('should use consistent date ranges across all query types', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            teamId: fc.string({ minLength: 1, maxLength: 50 }),
            startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
            endDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') })
          }).filter(({ startDate, endDate }) => startDate <= endDate),
          async ({ teamId, startDate, endDate }) => {
            const mockQuery = { aggregate: [] };
            const mockResponse = { result: [] };

            queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
            queryBuilderSpy.buildProgressAggregateQuery.and.returnValue(mockQuery);
            funifierApiSpy.post.and.returnValue(of(mockResponse));

            service.clearCache();

            // Execute both queries
            await service.getTeamSeasonPoints(teamId, startDate, endDate).toPromise();
            await service.getTeamProgressMetrics(teamId, startDate, endDate).toPromise();

            // Verify both queries were called with same parameters
            expect(queryBuilderSpy.buildPointsAggregateQuery).toHaveBeenCalledWith(
              teamId,
              startDate,
              endDate
            );
            expect(queryBuilderSpy.buildProgressAggregateQuery).toHaveBeenCalledWith(
              teamId,
              startDate,
              endDate
            );
          }
        ),
        { numRuns: 50 }
      ).then(() => done());
    });

    it('should maintain date range integrity for any valid date pair', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.date({ min: new Date('2020-01-01'), max: new Date('2024-06-30') }),
            fc.integer({ min: 1, max: 365 })
          ),
          async ([startDate, daysToAdd]) => {
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + daysToAdd);

            const mockQuery = { aggregate: [] };
            const mockResponse = { result: [] };

            queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
            funifierApiSpy.post.and.returnValue(of(mockResponse));

            service.clearCache();

            await service.getTeamSeasonPoints('Test Team', startDate, endDate).toPromise();

            const callArgs = queryBuilderSpy.buildPointsAggregateQuery.calls.mostRecent().args;
            
            // Verify dates are passed correctly
            expect(callArgs[1]).toEqual(startDate);
            expect(callArgs[2]).toEqual(endDate);
            expect(callArgs[1].getTime()).toBeLessThanOrEqual(callArgs[2].getTime());
          }
        ),
        { numRuns: 50 }
      ).then(() => done());
    });
  });

  /**
   * Additional property: Non-negative points invariant
   * 
   * Points should never be negative in any scenario.
   */
  describe('Additional Property: Non-negative Points Invariant', () => {
    it('should never return negative point values', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              player: fc.emailAddress(),
              total: fc.integer({ min: 0, max: 10000 }),
              item: fc.constantFrom('locked_points', 'unlocked_points'),
              type: fc.constant(0)
            }),
            { minLength: 0, maxLength: 100 }
          ),
          async (achievements) => {
            const expectedTotal = achievements.reduce((sum, a) => sum + a.total, 0);
            const expectedBlocked = achievements
              .filter(a => a.item === 'locked_points')
              .reduce((sum, a) => sum + a.total, 0);
            const expectedUnlocked = achievements
              .filter(a => a.item === 'unlocked_points')
              .reduce((sum, a) => sum + a.total, 0);

            const mockResponse = {
              result: achievements.length > 0 ? [
                {
                  _id: null,
                  totalPoints: expectedTotal,
                  blockedPoints: expectedBlocked,
                  unlockedPoints: expectedUnlocked
                }
              ] : []
            };

            queryBuilderSpy.buildPointsAggregateQuery.and.returnValue({ aggregate: [] });
            funifierApiSpy.post.and.returnValue(of(mockResponse));

            service.clearCache();

            const result = await service.getTeamSeasonPoints(
              'Test Team',
              new Date('2024-01-01'),
              new Date('2024-01-31')
            ).toPromise();

            // All point values must be non-negative
            expect(result!.total).toBeGreaterThanOrEqual(0);
            expect(result!.bloqueados).toBeGreaterThanOrEqual(0);
            expect(result!.desbloqueados).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      ).then(() => done());
    });
  });
});
