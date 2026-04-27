import { TestBed } from '@angular/core/testing';
import { PlayerMapper } from './player-mapper.service';
import * as fc from 'fast-check';

describe('PlayerMapper', () => {
  let mapper: PlayerMapper;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mapper = TestBed.inject(PlayerMapper);
  });

  it('should be created', () => {
    expect(mapper).toBeTruthy();
  });

  /**
   * Feature: gamification-dashboard, Property 1: Season Level Display Consistency
   * Validates: Requirements 1.1, 1.3
   */
  describe('Property 1: Season Level Display Consistency', () => {
    it('should map season level consistently from API response', () => {
      fc.assert(
        fc.property(
          fc.record({
            _id: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1 }),
            email: fc.emailAddress(),
            level: fc.integer({ min: 0, max: 100 }),
            seasonLevel: fc.integer({ min: 0, max: 100 }),
            extra: fc.record({
              seasonLevel: fc.integer({ min: 0, max: 100 }),
              area: fc.string(),
              time: fc.string(),
              squad: fc.string()
            }),
            created: fc.integer({ min: 0 }),
            updated: fc.integer({ min: 0 })
          }),
          (apiResponse) => {
            const playerStatus = mapper.toPlayerStatus(apiResponse);

            // `extra.seasonLevel` pode ser 0 — não usar `||` (0 é válido).
            const esc = apiResponse.extra?.seasonLevel;
            const hasEsc =
              esc !== undefined &&
              esc !== null &&
              `${esc}`.trim() !== '' &&
              Number.isFinite(Number(esc));
            const expectedSeasonLevel = hasEsc ? Number(esc) : Number(apiResponse.level) || 0;

            expect(playerStatus.seasonLevel).toBe(expectedSeasonLevel);
            expect(playerStatus._id).toBe(apiResponse._id);
            expect(playerStatus.name).toBe(String(apiResponse.name).trim());
            expect(playerStatus.email).toBe(apiResponse.email);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle missing extra.seasonLevel by using level field', () => {
      fc.assert(
        fc.property(
          fc.record({
            _id: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1 }),
            email: fc.emailAddress(),
            level: fc.integer({ min: 0, max: 100 }),
            created: fc.integer({ min: 0 }),
            updated: fc.integer({ min: 0 })
          }),
          (apiResponse) => {
            const playerStatus = mapper.toPlayerStatus(apiResponse);
            
            // When extra.seasonLevel is missing, should fall back to level
            expect(playerStatus.seasonLevel).toBe(apiResponse.level);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle level_progress structure from Funifier API', () => {
      fc.assert(
        fc.property(
          fc.record({
            _id: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1 }),
            email: fc.emailAddress(),
            level_progress: fc.record({
              next_level: fc.record({
                position: fc.integer({ min: 0, max: 100 })
              })
            }),
            extra: fc.record({
              seasonLevel: fc.integer({ min: 0, max: 100 }),
              area: fc.string(),
              time: fc.string(),
              squad: fc.string()
            }),
            created: fc.integer({ min: 0 }),
            updated: fc.integer({ min: 0 })
          }),
          (apiResponse) => {
            const playerStatus = mapper.toPlayerStatus(apiResponse);
            
            // level should be extracted from level_progress.next_level.position
            expect(playerStatus.level).toBe(apiResponse.level_progress.next_level.position);
            
            // seasonLevel should come from extra.seasonLevel
            expect(playerStatus.seasonLevel).toBe(apiResponse.extra.seasonLevel);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    it('should map player status with all fields present', () => {
      const apiResponse = {
        _id: 'player123',
        name: 'John Doe',
        email: 'john@example.com',
        level: 5,
        extra: {
          seasonLevel: 10,
          area: 'Sales',
          time: 'Team A',
          squad: 'Squad 1'
        },
        created: 1234567890,
        updated: 1234567900
      };

      const result = mapper.toPlayerStatus(apiResponse);

      expect(result._id).toBe('player123');
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john@example.com');
      expect(result.level).toBe(0); // No level_progress, defaults to 0
      expect(result.seasonLevel).toBe(10);
      expect(result.metadata.area).toBe('Sales');
      expect(result.metadata.time).toBe('Team A');
      expect(result.metadata.squad).toBe('Squad 1');
    });

    it('should handle missing optional fields', () => {
      const apiResponse = {
        _id: 'player456',
        name: 'Jane Doe',
        email: 'jane@example.com'
      };

      const result = mapper.toPlayerStatus(apiResponse);

      expect(result._id).toBe('player456');
      expect(result.name).toBe('Jane Doe');
      expect(result.email).toBe('jane@example.com');
      expect(result.level).toBe(0);
      expect(result.seasonLevel).toBe(0);
      expect(result.metadata.area).toBe('');
      expect(result.metadata.time).toBe('');
      expect(result.metadata.squad).toBe('');
    });

    it('should use full_name when name is absent (/auth/user style)', () => {
      const apiResponse = {
        _id: '507f1f77bcf86cd799439011',
        full_name: 'João da Silva',
        email: 'joao@example.com'
      };
      const result = mapper.toPlayerStatus(apiResponse);
      expect(result.name).toBe('João da Silva');
      expect(result.email).toBe('joao@example.com');
    });

    it('should derive a short label from email when no name fields exist', () => {
      const apiResponse = {
        _id: 'maria.santos@empresa.com'
      };
      const result = mapper.toPlayerStatus(apiResponse);
      expect(result.name).toBe('maria.santos');
      expect(result.email).toBe('maria.santos@empresa.com');
    });
  });
});
