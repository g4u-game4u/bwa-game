import { TestBed } from '@angular/core/testing';
import { AggregateQueryBuilderService, AggregateQuery } from './aggregate-query-builder.service';

describe('AggregateQueryBuilderService', () => {
  let service: AggregateQueryBuilderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AggregateQueryBuilderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('buildPointsAggregateQuery', () => {
    it('should build correct query structure for points aggregation', () => {
      const teamId = 'Departamento Pessoal';
      const startDate = new Date('2024-01-01T00:00:00.000Z');
      const endDate = new Date('2024-01-31T23:59:59.999Z');

      const query = service.buildPointsAggregateQuery(teamId, startDate, endDate);

      // Verify query structure
      expect(query.aggregate).toBeDefined();
      expect(query.aggregate.length).toBe(2);

      // Verify $match stage
      const matchStage = query.aggregate[0];
      expect(matchStage.$match).toBeDefined();
      expect(matchStage.$match['extra.team']).toBe(teamId);
      expect(matchStage.$match.type).toBe(0);
      expect(matchStage.$match.time).toBeDefined();
      expect(matchStage.$match.time.$gte).toEqual({ $date: startDate.toISOString() });
      expect(matchStage.$match.time.$lte).toEqual({ $date: endDate.toISOString() });

      // Verify $group stage
      const groupStage = query.aggregate[1];
      expect(groupStage.$group).toBeDefined();
      expect(groupStage.$group._id).toBeNull();
      expect(groupStage.$group.totalPoints).toEqual({ $sum: '$total' });
      expect(groupStage.$group.blockedPoints).toBeDefined();
      expect(groupStage.$group.unlockedPoints).toBeDefined();
    });

    it('should filter by locked_points in blockedPoints calculation', () => {
      const query = service.buildPointsAggregateQuery('Team A', new Date(), new Date());
      const groupStage = query.aggregate[1];

      expect(groupStage.$group.blockedPoints.$sum.$cond[0]).toEqual({
        $eq: ['$item', 'locked_points']
      });
    });

    it('should filter by unlocked_points in unlockedPoints calculation', () => {
      const query = service.buildPointsAggregateQuery('Team A', new Date(), new Date());
      const groupStage = query.aggregate[1];

      expect(groupStage.$group.unlockedPoints.$sum.$cond[0]).toEqual({
        $eq: ['$item', 'unlocked_points']
      });
    });
  });

  describe('buildProgressAggregateQuery', () => {
    it('should build correct query structure for progress aggregation', () => {
      const teamId = 'Departamento Pessoal';
      const startDate = new Date('2024-01-01T00:00:00.000Z');
      const endDate = new Date('2024-01-31T23:59:59.999Z');

      const query = service.buildProgressAggregateQuery(teamId, startDate, endDate);

      // Verify query structure
      expect(query.aggregate).toBeDefined();
      expect(query.aggregate.length).toBe(2);

      // Verify $match stage
      const matchStage = query.aggregate[0];
      expect(matchStage.$match).toBeDefined();
      expect(matchStage.$match['attributes.team']).toBe(teamId);
      expect(matchStage.$match.time).toBeDefined();
      expect(matchStage.$match.time.$gte).toEqual({ $date: startDate.toISOString() });
      expect(matchStage.$match.time.$lte).toEqual({ $date: endDate.toISOString() });

      // Verify $group stage
      const groupStage = query.aggregate[1];
      expect(groupStage.$group).toBeDefined();
      expect(groupStage.$group._id).toBe('$actionId');
      expect(groupStage.$group.count).toEqual({ $sum: 1 });
    });

    it('should use attributes.team field for filtering', () => {
      const query = service.buildProgressAggregateQuery('Test Team', new Date(), new Date());
      const matchStage = query.aggregate[0];

      expect(matchStage.$match['attributes.team']).toBe('Test Team');
    });
  });

  describe('buildGraphDataQuery', () => {
    it('should build query with day grouping by default', () => {
      const teamId = 'Departamento Pessoal';
      const startDate = new Date('2024-01-01T00:00:00.000Z');
      const endDate = new Date('2024-01-07T23:59:59.999Z');

      const query = service.buildGraphDataQuery(teamId, startDate, endDate);

      // Verify query structure
      expect(query.aggregate).toBeDefined();
      expect(query.aggregate.length).toBe(4);

      // Verify $match stage
      const matchStage = query.aggregate[0];
      expect(matchStage.$match).toBeDefined();
      expect(matchStage.$match['attributes.team']).toBe(teamId);

      // Verify $project stage with day format
      const projectStage = query.aggregate[1];
      expect(projectStage.$project).toBeDefined();
      expect(projectStage.$project.date.$dateToString.format).toBe('%Y-%m-%d');

      // Verify $group stage
      const groupStage = query.aggregate[2];
      expect(groupStage.$group).toBeDefined();
      expect(groupStage.$group._id.date).toBe('$date');
      expect(groupStage.$group._id.actionId).toBe('$actionId');

      // Verify $sort stage
      const sortStage = query.aggregate[3];
      expect(sortStage.$sort).toBeDefined();
      expect(sortStage.$sort['_id.date']).toBe(1);
    });

    it('should build query with week grouping when specified', () => {
      const query = service.buildGraphDataQuery('Team A', new Date(), new Date(), 'week');

      const projectStage = query.aggregate[1];
      expect(projectStage.$project.date.$dateToString.format).toBe('%Y-%U');
    });

    it('should include actionId in projection', () => {
      const query = service.buildGraphDataQuery('Team A', new Date(), new Date());

      const projectStage = query.aggregate[1];
      expect(projectStage.$project.actionId).toBe(1);
    });

    it('should sort results by date ascending', () => {
      const query = service.buildGraphDataQuery('Team A', new Date(), new Date());

      const sortStage = query.aggregate[3];
      expect(sortStage.$sort['_id.date']).toBe(1);
    });
  });

  describe('buildCollaboratorListQuery', () => {
    it('should build correct query structure for collaborator list', () => {
      const teamId = 'Departamento Pessoal';

      const query = service.buildCollaboratorListQuery(teamId);

      // Verify query structure
      expect(query.aggregate).toBeDefined();
      expect(query.aggregate.length).toBe(3);

      // Verify $match stage
      const matchStage = query.aggregate[0];
      expect(matchStage.$match).toBeDefined();
      expect(matchStage.$match['attributes.team']).toBe(teamId);

      // Verify $group stage
      const groupStage = query.aggregate[1];
      expect(groupStage.$group).toBeDefined();
      expect(groupStage.$group._id).toBe('$userId');
      expect(groupStage.$group.count).toEqual({ $sum: 1 });

      // Verify $sort stage
      const sortStage = query.aggregate[2];
      expect(sortStage.$sort).toBeDefined();
      expect(sortStage.$sort._id).toBe(1);
    });

    it('should group by userId', () => {
      const query = service.buildCollaboratorListQuery('Team A');

      const groupStage = query.aggregate[1];
      expect(groupStage.$group._id).toBe('$userId');
    });

    it('should sort collaborators alphabetically', () => {
      const query = service.buildCollaboratorListQuery('Team A');

      const sortStage = query.aggregate[2];
      expect(sortStage.$sort._id).toBe(1);
    });
  });

  describe('date formatting utilities', () => {
    it('should format dates as ISO strings', () => {
      const date = new Date('2024-01-15T12:30:00.000Z');
      const query = service.buildPointsAggregateQuery('Team A', date, date);

      const matchStage = query.aggregate[0];
      expect(matchStage.$match.time.$gte.$date).toBe('2024-01-15T12:30:00.000Z');
    });

    it('should handle different date inputs correctly', () => {
      const startDate = new Date('2024-01-01T00:00:00.000Z');
      const endDate = new Date('2024-12-31T23:59:59.999Z');

      const query = service.buildPointsAggregateQuery('Team A', startDate, endDate);

      const matchStage = query.aggregate[0];
      expect(matchStage.$match.time.$gte.$date).toBe(startDate.toISOString());
      expect(matchStage.$match.time.$lte.$date).toBe(endDate.toISOString());
    });
  });

  describe('getRelativeDateExpression', () => {
    it('should return correct expression for current month start', () => {
      expect(service.getRelativeDateExpression('currentMonthStart')).toBe('-0M-');
    });

    it('should return correct expression for current month end', () => {
      expect(service.getRelativeDateExpression('currentMonthEnd')).toBe('-0M+');
    });

    it('should return correct expression for previous month start', () => {
      expect(service.getRelativeDateExpression('previousMonthStart')).toBe('-1M-');
    });

    it('should return correct expression for previous month end', () => {
      expect(service.getRelativeDateExpression('previousMonthEnd')).toBe('-1M+');
    });

    it('should return correct expression for today', () => {
      expect(service.getRelativeDateExpression('today')).toBe('-0d+');
    });
  });

  describe('getDaysAgoExpression', () => {
    it('should return correct expression for 7 days ago', () => {
      expect(service.getDaysAgoExpression(7)).toBe('-7d-');
    });

    it('should return correct expression for 30 days ago', () => {
      expect(service.getDaysAgoExpression(30)).toBe('-30d-');
    });

    it('should return correct expression for 90 days ago', () => {
      expect(service.getDaysAgoExpression(90)).toBe('-90d-');
    });

    it('should handle single digit days', () => {
      expect(service.getDaysAgoExpression(1)).toBe('-1d-');
    });
  });

  describe('query validation', () => {
    it('should produce valid MongoDB aggregate pipeline syntax', () => {
      const queries = [
        service.buildPointsAggregateQuery('Team A', new Date(), new Date()),
        service.buildProgressAggregateQuery('Team A', new Date(), new Date()),
        service.buildGraphDataQuery('Team A', new Date(), new Date()),
        service.buildCollaboratorListQuery('Team A')
      ];

      queries.forEach(query => {
        expect(query.aggregate).toBeDefined();
        expect(Array.isArray(query.aggregate)).toBe(true);
        expect(query.aggregate.length).toBeGreaterThan(0);

        // Each stage should have at least one valid operator
        query.aggregate.forEach(stage => {
          const operators = ['$match', '$group', '$project', '$sort', '$limit'];
          const hasValidOperator = operators.some(op => stage.hasOwnProperty(op));
          expect(hasValidOperator).toBe(true);
        });
      });
    });
  });
});
