import { TestBed } from '@angular/core/testing';
import { AggregateQueryBuilderService, AggregateQuery } from './aggregate-query-builder.service';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for AggregateQueryBuilderService
 * 
 * These tests verify that the query builder produces valid MongoDB aggregate
 * pipeline queries for all possible inputs.
 */
describe('AggregateQueryBuilderService Property-Based Tests', () => {
  let service: AggregateQueryBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AggregateQueryBuilderService);
  });

  /**
   * Property 6: Aggregate Query Structure Validity
   * **Validates: Requirements 12.1, 12.2, 12.3**
   * 
   * For any aggregate query constructed by the query builder, the query should
   * be valid MongoDB aggregate pipeline syntax.
   * 
   * Valid MongoDB aggregate pipeline requirements:
   * 1. Must have an 'aggregate' property that is an array
   * 2. Each stage must be an object with at least one valid operator
   * 3. Valid operators: $match, $group, $project, $sort, $limit, etc.
   * 4. $match stage should come before $group for performance
   * 5. Date filters should use proper structure
   */
  describe('Property 6: Aggregate Query Structure Validity', () => {
    // Arbitrary for generating valid team IDs
    const teamIdArbitrary = fc.string({ minLength: 1, maxLength: 50 });

    // Arbitrary for generating valid dates
    const dateArbitrary = fc.date({
      min: new Date('2020-01-01'),
      max: new Date('2030-12-31')
    });

    // Arbitrary for generating date ranges (start before end)
    const dateRangeArbitrary = fc.tuple(dateArbitrary, dateArbitrary).map(([d1, d2]) => {
      const start = d1 < d2 ? d1 : d2;
      const end = d1 < d2 ? d2 : d1;
      return { start, end };
    });

    it('should always produce queries with aggregate array property', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          (teamId, dateRange) => {
            const queries = [
              service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildProgressAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, 'day'),
              service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, 'week'),
              service.buildCollaboratorListQuery(teamId)
            ];

            queries.forEach(query => {
              expect(query.aggregate).toBeDefined();
              expect(Array.isArray(query.aggregate)).toBe(true);
              expect(query.aggregate.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always have valid MongoDB operators in each stage', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          (teamId, dateRange) => {
            const validOperators = ['$match', '$group', '$project', '$sort', '$limit', '$unwind', '$lookup'];
            
            const queries = [
              service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildProgressAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, 'day'),
              service.buildCollaboratorListQuery(teamId)
            ];

            queries.forEach(query => {
              query.aggregate.forEach(stage => {
                const stageKeys = Object.keys(stage);
                const hasValidOperator = stageKeys.some(key => validOperators.includes(key));
                expect(hasValidOperator).toBe(true);
              });
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always have $match stage before $group stage for performance', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          (teamId, dateRange) => {
            const queries = [
              service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildProgressAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, 'day')
            ];

            queries.forEach(query => {
              const matchIndex = query.aggregate.findIndex(stage => stage.$match !== undefined);
              const groupIndex = query.aggregate.findIndex(stage => stage.$group !== undefined);

              // If both exist, match should come before group
              if (matchIndex !== -1 && groupIndex !== -1) {
                expect(matchIndex).toBeLessThan(groupIndex);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include team filter in $match stage', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          (teamId, dateRange) => {
            const queries = [
              { query: service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end), field: 'extra.team' },
              { query: service.buildProgressAggregateQuery(teamId, dateRange.start, dateRange.end), field: 'attributes.team' },
              { query: service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, 'day'), field: 'attributes.team' },
              { query: service.buildCollaboratorListQuery(teamId), field: 'attributes.team' }
            ];

            queries.forEach(({ query, field }) => {
              const matchStage = query.aggregate.find(stage => stage.$match !== undefined);
              expect(matchStage).toBeDefined();
              expect(matchStage!.$match[field]).toBe(teamId);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include valid date filters in time-based queries', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          (teamId, dateRange) => {
            const queries = [
              service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildProgressAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, 'day')
            ];

            queries.forEach(query => {
              const matchStage = query.aggregate.find(stage => stage.$match !== undefined);
              expect(matchStage).toBeDefined();
              expect(matchStage!.$match.time).toBeDefined();
              expect(matchStage!.$match.time.$gte).toBeDefined();
              expect(matchStage!.$match.time.$lte).toBeDefined();
              
              // Verify date structure
              expect(matchStage!.$match.time.$gte.$date).toBeDefined();
              expect(matchStage!.$match.time.$lte.$date).toBeDefined();
              
              // Verify dates are ISO strings
              expect(typeof matchStage!.$match.time.$gte.$date).toBe('string');
              expect(typeof matchStage!.$match.time.$lte.$date).toBe('string');
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always have proper $group structure with _id and accumulators', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          (teamId, dateRange) => {
            const queries = [
              service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildProgressAggregateQuery(teamId, dateRange.start, dateRange.end),
              service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, 'day'),
              service.buildCollaboratorListQuery(teamId)
            ];

            queries.forEach(query => {
              const groupStage = query.aggregate.find(stage => stage.$group !== undefined);
              if (groupStage) {
                expect(groupStage.$group._id).toBeDefined();
                
                // Should have at least one accumulator besides _id
                const keys = Object.keys(groupStage.$group);
                expect(keys.length).toBeGreaterThan(1);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce consistent query structure for same inputs', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          (teamId, dateRange) => {
            // Call the same method twice with same inputs
            const query1 = service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end);
            const query2 = service.buildPointsAggregateQuery(teamId, dateRange.start, dateRange.end);

            // Should produce identical queries
            expect(JSON.stringify(query1)).toBe(JSON.stringify(query2));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case dates correctly', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          (teamId) => {
            const edgeCases = [
              { start: new Date('1970-01-01'), end: new Date('1970-01-01') }, // Unix epoch
              { start: new Date('2000-01-01'), end: new Date('2000-12-31') }, // Y2K
              { start: new Date('2024-02-29'), end: new Date('2024-02-29') }, // Leap year
              { start: new Date(), end: new Date() } // Same date
            ];

            edgeCases.forEach(({ start, end }) => {
              const query = service.buildPointsAggregateQuery(teamId, start, end);
              
              expect(query.aggregate).toBeDefined();
              expect(query.aggregate.length).toBeGreaterThan(0);
              
              const matchStage = query.aggregate[0];
              expect(matchStage.$match.time.$gte.$date).toBe(start.toISOString());
              expect(matchStage.$match.time.$lte.$date).toBe(end.toISOString());
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle special characters in team names', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          dateRangeArbitrary,
          (teamId, dateRange) => {
            // Test with team names containing special characters
            const specialTeamIds = [
              teamId,
              `${teamId} & Co.`,
              `${teamId} - Department`,
              `${teamId} (Team)`,
              `${teamId}/Division`
            ];

            specialTeamIds.forEach(specialTeamId => {
              const query = service.buildPointsAggregateQuery(specialTeamId, dateRange.start, dateRange.end);
              
              const matchStage = query.aggregate[0];
              expect(matchStage.$match['extra.team']).toBe(specialTeamId);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should produce valid queries for both day and week grouping', () => {
      fc.assert(
        fc.property(
          teamIdArbitrary,
          dateRangeArbitrary,
          fc.constantFrom('day' as const, 'week' as const),
          (teamId, dateRange, groupBy) => {
            const query = service.buildGraphDataQuery(teamId, dateRange.start, dateRange.end, groupBy);

            expect(query.aggregate).toBeDefined();
            
            const projectStage = query.aggregate.find(stage => stage.$project !== undefined);
            expect(projectStage).toBeDefined();
            expect(projectStage!.$project.date).toBeDefined();
            expect(projectStage!.$project.date.$dateToString).toBeDefined();
            
            const expectedFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%U';
            expect(projectStage!.$project.date.$dateToString.format).toBe(expectedFormat);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Relative date expressions', () => {
    it('should always return valid Funifier date expressions', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'currentMonthStart' as const,
            'currentMonthEnd' as const,
            'previousMonthStart' as const,
            'previousMonthEnd' as const,
            'today' as const
          ),
          (type) => {
            const expression = service.getRelativeDateExpression(type);
            
            // Should match Funifier date expression pattern
            expect(expression).toMatch(/^-\d+[Md][+-]$/);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should always return valid days ago expressions', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 365 }),
          (days) => {
            const expression = service.getDaysAgoExpression(days);
            
            // Should match pattern: -Nd-
            expect(expression).toBe(`-${days}d-`);
            expect(expression).toMatch(/^-\d+d-$/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
