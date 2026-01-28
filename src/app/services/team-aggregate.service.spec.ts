import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TeamAggregateService, TeamSeasonPoints, TeamProgressMetrics, Collaborator } from './team-aggregate.service';
import { FunifierApiService } from './funifier-api.service';
import { AggregateQueryBuilderService } from './aggregate-query-builder.service';

describe('TeamAggregateService', () => {
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

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getTeamSeasonPoints', () => {
    const teamId = 'Departamento Pessoal';
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const mockQuery = { aggregate: [{ $match: {} }] };

    it('should return correct structure for team season points', (done) => {
      const mockResponse = {
        result: [
          {
            _id: null,
            totalPoints: 1000,
            blockedPoints: 600,
            unlockedPoints: 400
          }
        ]
      };

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(points => {
        expect(points.total).toBe(1000);
        expect(points.bloqueados).toBe(600);
        expect(points.desbloqueados).toBe(400);
        expect(queryBuilderSpy.buildPointsAggregateQuery).toHaveBeenCalledWith(teamId, startDate, endDate);
        done();
      });
    });

    it('should return zero values when no data is available', (done) => {
      const mockResponse = { result: [] };

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(points => {
        expect(points.total).toBe(0);
        expect(points.bloqueados).toBe(0);
        expect(points.desbloqueados).toBe(0);
        done();
      });
    });

    it('should handle missing point fields gracefully', (done) => {
      const mockResponse = {
        result: [
          {
            _id: null,
            totalPoints: 500
            // blockedPoints and unlockedPoints missing
          }
        ]
      };

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(points => {
        expect(points.total).toBe(500);
        expect(points.bloqueados).toBe(0);
        expect(points.desbloqueados).toBe(0);
        done();
      });
    });

    it('should handle errors from API', (done) => {
      const mockError = new Error('API Error');

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(throwError(() => mockError));

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe({
        next: () => fail('Should have thrown error'),
        error: (error) => {
          expect(error).toBeTruthy();
          done();
        }
      });
    });
  });

  describe('getTeamProgressMetrics', () => {
    const teamId = 'Departamento Pessoal';
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const mockQuery = { aggregate: [{ $match: {} }] };

    it('should process progress data correctly', (done) => {
      const mockResponse = {
        result: [
          { _id: 'processo_incompleto', count: 5 },
          { _id: 'atividade_finalizada', count: 20 },
          { _id: 'processo_finalizado', count: 10 }
        ]
      };

      queryBuilderSpy.buildProgressAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamProgressMetrics(teamId, startDate, endDate).subscribe(metrics => {
        expect(metrics.processosIncompletos).toBe(5);
        expect(metrics.atividadesFinalizadas).toBe(20);
        expect(metrics.processosFinalizados).toBe(10);
        expect(queryBuilderSpy.buildProgressAggregateQuery).toHaveBeenCalledWith(teamId, startDate, endDate);
        done();
      });
    });

    it('should return zero metrics when no data is available', (done) => {
      const mockResponse = { result: [] };

      queryBuilderSpy.buildProgressAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamProgressMetrics(teamId, startDate, endDate).subscribe(metrics => {
        expect(metrics.processosIncompletos).toBe(0);
        expect(metrics.atividadesFinalizadas).toBe(0);
        expect(metrics.processosFinalizados).toBe(0);
        done();
      });
    });

    it('should handle unknown action IDs by counting as activities', (done) => {
      const mockResponse = {
        result: [
          { _id: 'unknown_action', count: 15 },
          { _id: 'another_action', count: 8 }
        ]
      };

      queryBuilderSpy.buildProgressAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamProgressMetrics(teamId, startDate, endDate).subscribe(metrics => {
        expect(metrics.atividadesFinalizadas).toBe(23); // 15 + 8
        done();
      });
    });

    it('should handle English action IDs', (done) => {
      const mockResponse = {
        result: [
          { _id: 'incomplete_process', count: 3 },
          { _id: 'completed_activity', count: 12 },
          { _id: 'completed_process', count: 7 }
        ]
      };

      queryBuilderSpy.buildProgressAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamProgressMetrics(teamId, startDate, endDate).subscribe(metrics => {
        expect(metrics.processosIncompletos).toBe(3);
        expect(metrics.atividadesFinalizadas).toBe(12);
        expect(metrics.processosFinalizados).toBe(7);
        done();
      });
    });
  });

  describe('getTeamMembers', () => {
    const teamId = 'Departamento Pessoal';
    const mockQuery = { aggregate: [{ $match: {} }] };

    it('should return list of collaborators', (done) => {
      const mockResponse = {
        result: [
          { _id: 'user1@example.com', count: 10 },
          { _id: 'user2@example.com', count: 15 },
          { _id: 'user3@example.com', count: 8 }
        ]
      };

      queryBuilderSpy.buildCollaboratorListQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamMembers(teamId).subscribe(members => {
        expect(members.length).toBe(3);
        expect(members[0].userId).toBe('user1@example.com');
        expect(members[0].email).toBe('user1@example.com');
        expect(members[1].userId).toBe('user2@example.com');
        expect(members[2].userId).toBe('user3@example.com');
        expect(queryBuilderSpy.buildCollaboratorListQuery).toHaveBeenCalledWith(teamId);
        done();
      });
    });

    it('should return empty array when no members found', (done) => {
      const mockResponse = { result: [] };

      queryBuilderSpy.buildCollaboratorListQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getTeamMembers(teamId).subscribe(members => {
        expect(members.length).toBe(0);
        done();
      });
    });
  });

  describe('getCollaboratorData', () => {
    const userId = 'user@example.com';
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    it('should return collaborator-specific data', (done) => {
      const mockResponse = {
        result: [
          { _id: 'action1', count: 5 },
          { _id: 'action2', count: 10 }
        ]
      };

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getCollaboratorData(userId, startDate, endDate).subscribe(data => {
        expect(data.length).toBe(2);
        expect(data[0]._id).toBe('action1');
        expect(data[0].count).toBe(5);
        done();
      });
    });

    it('should build query with userId filter', (done) => {
      const mockResponse = { result: [] };

      funifierApiSpy.post.and.returnValue(of(mockResponse));

      service.getCollaboratorData(userId, startDate, endDate).subscribe(() => {
        expect(funifierApiSpy.post).toHaveBeenCalled();
        const callArgs = funifierApiSpy.post.calls.mostRecent().args;
        const query = callArgs[1];
        expect(query.aggregate[0].$match.userId).toBe(userId);
        done();
      });
    });
  });

  describe('caching mechanism', () => {
    const teamId = 'Departamento Pessoal';
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const mockQuery = { aggregate: [{ $match: {} }] };

    it('should cache results and return cached data on subsequent calls', (done) => {
      const mockResponse = {
        result: [
          {
            _id: null,
            totalPoints: 1000,
            blockedPoints: 600,
            unlockedPoints: 400
          }
        ]
      };

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call - should hit API
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(points1 => {
        expect(points1.total).toBe(1000);
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(points2 => {
          expect(points2.total).toBe(1000);
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(1); // Still only 1 call
          done();
        });
      });
    });

    it('should clear all cache when clearCache is called', (done) => {
      const mockResponse = {
        result: [
          {
            _id: null,
            totalPoints: 1000,
            blockedPoints: 600,
            unlockedPoints: 400
          }
        ]
      };

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // First call
      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(() => {
        expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);

        // Clear cache
        service.clearCache();

        // Second call - should hit API again
        service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it('should clear only team-specific cache when clearTeamCache is called', (done) => {
      const team1 = 'Team 1';
      const team2 = 'Team 2';
      const mockResponse = {
        result: [
          {
            _id: null,
            totalPoints: 1000,
            blockedPoints: 600,
            unlockedPoints: 400
          }
        ]
      };

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse));

      // Cache data for both teams
      service.getTeamSeasonPoints(team1, startDate, endDate).subscribe(() => {
        service.getTeamSeasonPoints(team2, startDate, endDate).subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(2);

          // Clear only team1 cache
          service.clearTeamCache(team1);

          // Team1 should hit API, Team2 should use cache
          service.getTeamSeasonPoints(team1, startDate, endDate).subscribe(() => {
            expect(funifierApiSpy.post).toHaveBeenCalledTimes(3);

            service.getTeamSeasonPoints(team2, startDate, endDate).subscribe(() => {
              expect(funifierApiSpy.post).toHaveBeenCalledTimes(3); // Still 3, used cache
              done();
            });
          });
        });
      });
    });
  });

  describe('error handling', () => {
    const teamId = 'Departamento Pessoal';
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const mockQuery = { aggregate: [{ $match: {} }] };

    it('should handle API errors gracefully', (done) => {
      const mockError = new Error('Network error');

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(throwError(() => mockError));

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe({
        next: () => fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Network error');
          done();
        }
      });
    });

    it('should handle malformed API responses', (done) => {
      const mockResponse = null; // Malformed response

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse as any));

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(points => {
        // Should return default values
        expect(points.total).toBe(0);
        expect(points.bloqueados).toBe(0);
        expect(points.desbloqueados).toBe(0);
        done();
      });
    });

    it('should handle response without result property', (done) => {
      const mockResponse = [
        {
          _id: null,
          totalPoints: 500,
          blockedPoints: 300,
          unlockedPoints: 200
        }
      ];

      queryBuilderSpy.buildPointsAggregateQuery.and.returnValue(mockQuery);
      funifierApiSpy.post.and.returnValue(of(mockResponse as any));

      service.getTeamSeasonPoints(teamId, startDate, endDate).subscribe(points => {
        expect(points.total).toBe(500);
        expect(points.bloqueados).toBe(300);
        expect(points.desbloqueados).toBe(200);
        done();
      });
    });
  });
});
