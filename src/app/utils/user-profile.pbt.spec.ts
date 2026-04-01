import * as fc from 'fast-check';
import {
  UserProfile,
  determineUserProfile,
  getAccessibleTeamIds,
} from './user-profile';
import { TeamCodes } from '../services/team-code.service';

/**
 * Property-Based Tests for User Profile Determination
 * 
 * **Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * These tests verify that for any user teams array and any valid team code configuration,
 * the `determineUserProfile` function correctly determines the user's profile following
 * the priority rules: DIRETOR > GESTOR > SUPERVISOR > JOGADOR.
 */
describe('User Profile Property-Based Tests', () => {
  // Configure fast-check for 100 runs as specified in the design document
  const propertyTestConfig = { numRuns: 100 };

  /**
   * Arbitrary for generating valid team codes (3 unique non-empty strings)
   * Team codes must be non-empty, non-whitespace strings
   */
  const validTeamCodeArbitrary = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0)
      .map(s => s.trim());

  /**
   * Arbitrary for generating unique team code configurations
   * Ensures supervisor, gestor, and diretor codes are all different
   */
  const teamCodesArbitrary = (): fc.Arbitrary<TeamCodes> =>
    fc.tuple(
      validTeamCodeArbitrary(),
      validTeamCodeArbitrary(),
      validTeamCodeArbitrary()
    )
      .filter(([sup, ges, dir]) => 
        sup !== ges && sup !== dir && ges !== dir
      )
      .map(([supervisor, gestor, diretor]) => ({
        supervisor,
        gestor,
        diretor
      }));

  /**
   * Arbitrary for generating random team IDs (non-management teams)
   */
  const randomTeamIdArbitrary = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 15 })
      .filter(s => s.trim().length > 0)
      .map(s => `team_${s.trim()}`);

  /**
   * Arbitrary for generating arrays of random team IDs
   */
  const randomTeamsArbitrary = (minLen: number = 0, maxLen: number = 10): fc.Arbitrary<string[]> =>
    fc.array(randomTeamIdArbitrary(), { minLength: minLen, maxLength: maxLen });

  /**
   * Property 2: Profile Determination with Configured Codes
   * **Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  describe('Property 2: Profile Determination with Configured Codes', () => {

    describe('Priority Rule: DIRETOR has highest priority', () => {
      /**
       * Requirement 3.1: Return DIRETOR if teams contain the configured diretorTeamCode
       * For any valid team code configuration and any teams array containing the diretor code,
       * determineUserProfile should return DIRETOR regardless of other codes present.
       */
      it('should return DIRETOR when teams contain diretorTeamCode, regardless of other codes', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 5),
            fc.boolean(), // include gestor
            fc.boolean(), // include supervisor
            (teamCodes, otherTeams, includeGestor, includeSupervisor) => {
              // Build teams array with diretor code and optionally other management codes
              const teams = [...otherTeams, teamCodes.diretor];
              if (includeGestor) teams.push(teamCodes.gestor);
              if (includeSupervisor) teams.push(teamCodes.supervisor);

              const profile = determineUserProfile(teams, teamCodes);
              
              expect(profile).withContext(
                `Expected DIRETOR for teams containing diretor code '${teamCodes.diretor}'`
              ).toBe(UserProfile.DIRETOR);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * DIRETOR should be returned even when diretor code appears at any position in the array
       */
      it('should return DIRETOR regardless of diretor code position in teams array', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(1, 8),
            fc.integer({ min: 0, max: 9 }),
            (teamCodes, otherTeams, insertPosition) => {
              // Insert diretor code at a random position
              const teams = [...otherTeams];
              const actualPosition = Math.min(insertPosition, teams.length);
              teams.splice(actualPosition, 0, teamCodes.diretor);

              const profile = determineUserProfile(teams, teamCodes);
              
              expect(profile).withContext(
                `Expected DIRETOR when diretor code at position ${actualPosition}`
              ).toBe(UserProfile.DIRETOR);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Priority Rule: GESTOR has second highest priority', () => {
      /**
       * Requirement 3.2: Return GESTOR if teams contain gestorTeamCode (and not diretor)
       * For any valid team code configuration and teams containing gestor but not diretor,
       * determineUserProfile should return GESTOR.
       */
      it('should return GESTOR when teams contain gestorTeamCode but not diretorTeamCode', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 5),
            fc.boolean(), // include supervisor
            (teamCodes, otherTeams, includeSupervisor) => {
              // Build teams array with gestor code, optionally supervisor, but NOT diretor
              const teams = otherTeams.filter(t => t !== teamCodes.diretor);
              teams.push(teamCodes.gestor);
              if (includeSupervisor) teams.push(teamCodes.supervisor);

              const profile = determineUserProfile(teams, teamCodes);
              
              expect(profile).withContext(
                `Expected GESTOR for teams containing gestor code '${teamCodes.gestor}' without diretor`
              ).toBe(UserProfile.GESTOR);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * GESTOR should take priority over SUPERVISOR when both are present (without DIRETOR)
       */
      it('should return GESTOR over SUPERVISOR when both present without DIRETOR', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 5),
            (teamCodes, otherTeams) => {
              // Build teams with both gestor and supervisor, but not diretor
              const teams = otherTeams.filter(t => t !== teamCodes.diretor);
              teams.push(teamCodes.gestor);
              teams.push(teamCodes.supervisor);

              const profile = determineUserProfile(teams, teamCodes);
              
              expect(profile).withContext(
                `Expected GESTOR to take priority over SUPERVISOR`
              ).toBe(UserProfile.GESTOR);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Priority Rule: SUPERVISOR has third priority', () => {
      /**
       * Requirement 3.3: Return SUPERVISOR if teams contain supervisorTeamCode (and not diretor/gestor)
       * For any valid team code configuration and teams containing only supervisor management code,
       * determineUserProfile should return SUPERVISOR.
       */
      it('should return SUPERVISOR when teams contain supervisorTeamCode but not diretorTeamCode or gestorTeamCode', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 5),
            (teamCodes, otherTeams) => {
              // Build teams with supervisor code only (no diretor or gestor)
              const teams = otherTeams.filter(t => 
                t !== teamCodes.diretor && t !== teamCodes.gestor
              );
              teams.push(teamCodes.supervisor);

              const profile = determineUserProfile(teams, teamCodes);
              
              expect(profile).withContext(
                `Expected SUPERVISOR for teams containing only supervisor code '${teamCodes.supervisor}'`
              ).toBe(UserProfile.SUPERVISOR);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Priority Rule: JOGADOR is the default', () => {
      /**
       * Requirement 3.4: Return JOGADOR if teams contain none of the configured management codes
       * For any valid team code configuration and teams without any management codes,
       * determineUserProfile should return JOGADOR.
       */
      it('should return JOGADOR when teams contain none of the configured management codes', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 10),
            (teamCodes, teams) => {
              // Filter out any management codes that might have been generated
              const nonManagementTeams = teams.filter(t => 
                t !== teamCodes.diretor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.supervisor
              );

              const profile = determineUserProfile(nonManagementTeams, teamCodes);
              
              expect(profile).withContext(
                `Expected JOGADOR for teams without any management codes`
              ).toBe(UserProfile.JOGADOR);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * JOGADOR should be returned for empty teams array
       */
      it('should return JOGADOR for empty teams array', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            (teamCodes) => {
              const profile = determineUserProfile([], teamCodes);
              
              expect(profile).withContext(
                `Expected JOGADOR for empty teams array`
              ).toBe(UserProfile.JOGADOR);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * JOGADOR should be returned for null teams
       */
      it('should return JOGADOR for null teams', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            (teamCodes) => {
              const profile = determineUserProfile(null, teamCodes);
              
              expect(profile).withContext(
                `Expected JOGADOR for null teams`
              ).toBe(UserProfile.JOGADOR);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * JOGADOR should be returned for undefined teams
       */
      it('should return JOGADOR for undefined teams', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            (teamCodes) => {
              const profile = determineUserProfile(undefined, teamCodes);
              
              expect(profile).withContext(
                `Expected JOGADOR for undefined teams`
              ).toBe(UserProfile.JOGADOR);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Profile determination works correctly with any valid team code configuration', () => {
      /**
       * Profile determination should work with any valid unique team code configuration
       */
      it('should correctly determine all profile types with any valid team code configuration', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.integer({ min: 0, max: 3 }), // 0=JOGADOR, 1=SUPERVISOR, 2=GESTOR, 3=DIRETOR
            randomTeamsArbitrary(0, 5),
            (teamCodes, profileType, otherTeams) => {
              // Build teams based on expected profile type
              const teams = otherTeams.filter(t => 
                t !== teamCodes.diretor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.supervisor
              );

              let expectedProfile: UserProfile;
              switch (profileType) {
                case 3:
                  teams.push(teamCodes.diretor);
                  expectedProfile = UserProfile.DIRETOR;
                  break;
                case 2:
                  teams.push(teamCodes.gestor);
                  expectedProfile = UserProfile.GESTOR;
                  break;
                case 1:
                  teams.push(teamCodes.supervisor);
                  expectedProfile = UserProfile.SUPERVISOR;
                  break;
                default:
                  expectedProfile = UserProfile.JOGADOR;
              }

              const profile = determineUserProfile(teams, teamCodes);
              
              expect(profile).withContext(
                `Expected ${expectedProfile} for profile type ${profileType}`
              ).toBe(expectedProfile);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Profile determination is deterministic', () => {
      /**
       * Same input should always produce the same output
       */
      it('should return the same profile for the same teams and teamCodes across multiple calls', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 10),
            fc.integer({ min: 2, max: 10 }), // number of calls
            (teamCodes, teams, numCalls) => {
              const results: UserProfile[] = [];
              
              for (let i = 0; i < numCalls; i++) {
                results.push(determineUserProfile(teams, teamCodes));
              }
              
              const firstResult = results[0];
              expect(results.every(r => r === firstResult)).withContext(
                `Expected all ${numCalls} calls to return '${firstResult}'`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Order of teams in array should not affect the result
       */
      it('should return the same profile regardless of team order in array', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(1, 8),
            fc.integer({ min: 0, max: 3 }), // profile type to test
            (teamCodes, baseTeams, profileType) => {
              // Build teams with a specific management code
              const teams = baseTeams.filter(t => 
                t !== teamCodes.diretor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.supervisor
              );

              // Add management code based on profile type
              if (profileType >= 1) teams.push(teamCodes.supervisor);
              if (profileType >= 2) teams.push(teamCodes.gestor);
              if (profileType >= 3) teams.push(teamCodes.diretor);

              // Get profile with original order
              const originalProfile = determineUserProfile(teams, teamCodes);
              
              // Shuffle the teams array
              const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
              const shuffledProfile = determineUserProfile(shuffledTeams, teamCodes);
              
              expect(shuffledProfile).withContext(
                `Expected same profile for shuffled teams`
              ).toBe(originalProfile);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Profile determination handles team objects with _id property', () => {
      /**
       * Teams can be objects with _id property instead of strings
       */
      it('should correctly determine profile when teams are objects with _id property', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.integer({ min: 0, max: 3 }), // profile type
            randomTeamsArbitrary(0, 5),
            (teamCodes, profileType, otherTeamIds) => {
              // Convert team IDs to objects with _id property
              const otherTeams = otherTeamIds
                .filter(t => 
                  t !== teamCodes.diretor && 
                  t !== teamCodes.gestor && 
                  t !== teamCodes.supervisor
                )
                .map(id => ({ _id: id, name: `Team ${id}` }));

              let expectedProfile: UserProfile;
              switch (profileType) {
                case 3:
                  otherTeams.push({ _id: teamCodes.diretor, name: 'Direção' });
                  expectedProfile = UserProfile.DIRETOR;
                  break;
                case 2:
                  otherTeams.push({ _id: teamCodes.gestor, name: 'Gestão' });
                  expectedProfile = UserProfile.GESTOR;
                  break;
                case 1:
                  otherTeams.push({ _id: teamCodes.supervisor, name: 'Supervisão' });
                  expectedProfile = UserProfile.SUPERVISOR;
                  break;
                default:
                  expectedProfile = UserProfile.JOGADOR;
              }

              const profile = determineUserProfile(otherTeams, teamCodes);
              
              expect(profile).withContext(
                `Expected ${expectedProfile} for teams as objects`
              ).toBe(expectedProfile);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Mixed format (strings and objects) should work correctly
       */
      it('should correctly determine profile with mixed team formats (strings and objects)', () => {
        // Feature: configurable-team-codes, Property 2: Profile Determination with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.integer({ min: 0, max: 3 }), // profile type
            randomTeamsArbitrary(1, 4),
            fc.boolean(), // use object format for management code
            (teamCodes, profileType, otherTeamIds, useObjectFormat) => {
              // Create mixed format teams
              const teams: any[] = otherTeamIds
                .filter(t => 
                  t !== teamCodes.diretor && 
                  t !== teamCodes.gestor && 
                  t !== teamCodes.supervisor
                )
                .map((id, index) => index % 2 === 0 ? id : { _id: id });

              let expectedProfile: UserProfile;
              let managementCode: string | { _id: string } | null = null;
              
              switch (profileType) {
                case 3:
                  managementCode = useObjectFormat 
                    ? { _id: teamCodes.diretor } 
                    : teamCodes.diretor;
                  expectedProfile = UserProfile.DIRETOR;
                  break;
                case 2:
                  managementCode = useObjectFormat 
                    ? { _id: teamCodes.gestor } 
                    : teamCodes.gestor;
                  expectedProfile = UserProfile.GESTOR;
                  break;
                case 1:
                  managementCode = useObjectFormat 
                    ? { _id: teamCodes.supervisor } 
                    : teamCodes.supervisor;
                  expectedProfile = UserProfile.SUPERVISOR;
                  break;
                default:
                  expectedProfile = UserProfile.JOGADOR;
              }

              if (managementCode !== null) {
                teams.push(managementCode);
              }

              const profile = determineUserProfile(teams, teamCodes);
              
              expect(profile).withContext(
                `Expected ${expectedProfile} for mixed format teams`
              ).toBe(expectedProfile);
            }
          ),
          propertyTestConfig
        );
      });
    });
  });
});


/**
 * Property-Based Tests for Team Access Filtering
 * 
 * **Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes**
 * **Validates: Requirements 4.1, 4.2, 4.3**
 * 
 * These tests verify that for any user with a management profile (SUPERVISOR or GESTOR)
 * and any valid team code configuration, the `getAccessibleTeamIds` function correctly
 * filters out the management team codes and returns only the teams the user can access.
 */
describe('Team Access Filtering Property-Based Tests', () => {
  // Configure fast-check for 100 runs as specified in the design document
  const propertyTestConfig = { numRuns: 100 };

  /**
   * Arbitrary for generating valid team codes (3 unique non-empty strings)
   * Team codes must be non-empty, non-whitespace strings
   */
  const validTeamCodeArbitrary = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0)
      .map(s => s.trim());

  /**
   * Arbitrary for generating unique team code configurations
   * Ensures supervisor, gestor, and diretor codes are all different
   */
  const teamCodesArbitrary = (): fc.Arbitrary<TeamCodes> =>
    fc.tuple(
      validTeamCodeArbitrary(),
      validTeamCodeArbitrary(),
      validTeamCodeArbitrary()
    )
      .filter(([sup, ges, dir]) => 
        sup !== ges && sup !== dir && ges !== dir
      )
      .map(([supervisor, gestor, diretor]) => ({
        supervisor,
        gestor,
        diretor
      }));

  /**
   * Arbitrary for generating random team IDs (non-management teams)
   * Uses a prefix to avoid collisions with management codes
   */
  const randomTeamIdArbitrary = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 15 })
      .filter(s => s.trim().length > 0)
      .map(s => `managed_team_${s.trim()}`);

  /**
   * Arbitrary for generating arrays of random team IDs
   */
  const randomTeamsArbitrary = (minLen: number = 0, maxLen: number = 10): fc.Arbitrary<string[]> =>
    fc.array(randomTeamIdArbitrary(), { minLength: minLen, maxLength: maxLen });

  /**
   * Property 3: Team Access Filtering with Configured Codes
   * **Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   */
  describe('Property 3: Team Access Filtering with Configured Codes', () => {

    describe('SUPERVISOR filtering - accessible teams exclude supervisor code', () => {
      /**
       * Requirement 4.2: For SUPERVISOR, getAccessibleTeamIds should return all user teams 
       * except the configured supervisorTeamCode
       */
      it('should return all teams except supervisorTeamCode for SUPERVISOR profile', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(1, 8),
            (teamCodes, managedTeams) => {
              // Build teams array: supervisor code + managed teams
              // Ensure managed teams don't include any management codes
              const filteredManagedTeams = managedTeams.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              const teams = [teamCodes.supervisor, ...filteredManagedTeams];
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR, teamCodes);
              
              // Should not include supervisor code
              expect(accessibleTeams).withContext(
                `Accessible teams should not include supervisor code '${teamCodes.supervisor}'`
              ).not.toContain(teamCodes.supervisor);
              
              // Should include all managed teams
              for (const managedTeam of filteredManagedTeams) {
                expect(accessibleTeams).withContext(
                  `Accessible teams should include managed team '${managedTeam}'`
                ).toContain(managedTeam);
              }
              
              // Length should match filtered managed teams
              expect(accessibleTeams.length).withContext(
                `Accessible teams length should equal managed teams count`
              ).toBe(filteredManagedTeams.length);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * SUPERVISOR filtering should work regardless of supervisor code position in array
       */
      it('should filter supervisor code regardless of its position in teams array', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(1, 6),
            fc.integer({ min: 0, max: 7 }),
            (teamCodes, managedTeams, insertPosition) => {
              // Filter managed teams to exclude management codes
              const filteredManagedTeams = managedTeams.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              // Insert supervisor code at random position
              const teams = [...filteredManagedTeams];
              const actualPosition = Math.min(insertPosition, teams.length);
              teams.splice(actualPosition, 0, teamCodes.supervisor);
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR, teamCodes);
              
              // Should not include supervisor code
              expect(accessibleTeams).withContext(
                `Supervisor code at position ${actualPosition} should be filtered out`
              ).not.toContain(teamCodes.supervisor);
              
              // Should include all managed teams
              expect(accessibleTeams.length).withContext(
                `Should have ${filteredManagedTeams.length} accessible teams`
              ).toBe(filteredManagedTeams.length);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * SUPERVISOR with only supervisor code should return empty array
       */
      it('should return empty array when SUPERVISOR has only supervisor code', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            (teamCodes) => {
              const teams = [teamCodes.supervisor];
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.SUPERVISOR, teamCodes);
              
              expect(accessibleTeams).withContext(
                `SUPERVISOR with only supervisor code should have no accessible teams`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('GESTOR filtering - accessible teams exclude gestor code', () => {
      /**
       * Requirement 4.3: For GESTOR, getAccessibleTeamIds should return all user teams 
       * except the configured gestorTeamCode
       */
      it('should return all teams except gestorTeamCode for GESTOR profile', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(1, 8),
            (teamCodes, managedTeams) => {
              // Build teams array: gestor code + managed teams
              // Ensure managed teams don't include any management codes
              const filteredManagedTeams = managedTeams.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              const teams = [teamCodes.gestor, ...filteredManagedTeams];
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.GESTOR, teamCodes);
              
              // Should not include gestor code
              expect(accessibleTeams).withContext(
                `Accessible teams should not include gestor code '${teamCodes.gestor}'`
              ).not.toContain(teamCodes.gestor);
              
              // Should include all managed teams
              for (const managedTeam of filteredManagedTeams) {
                expect(accessibleTeams).withContext(
                  `Accessible teams should include managed team '${managedTeam}'`
                ).toContain(managedTeam);
              }
              
              // Length should match filtered managed teams
              expect(accessibleTeams.length).withContext(
                `Accessible teams length should equal managed teams count`
              ).toBe(filteredManagedTeams.length);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * GESTOR filtering should work regardless of gestor code position in array
       */
      it('should filter gestor code regardless of its position in teams array', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(1, 6),
            fc.integer({ min: 0, max: 7 }),
            (teamCodes, managedTeams, insertPosition) => {
              // Filter managed teams to exclude management codes
              const filteredManagedTeams = managedTeams.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              // Insert gestor code at random position
              const teams = [...filteredManagedTeams];
              const actualPosition = Math.min(insertPosition, teams.length);
              teams.splice(actualPosition, 0, teamCodes.gestor);
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.GESTOR, teamCodes);
              
              // Should not include gestor code
              expect(accessibleTeams).withContext(
                `Gestor code at position ${actualPosition} should be filtered out`
              ).not.toContain(teamCodes.gestor);
              
              // Should include all managed teams
              expect(accessibleTeams.length).withContext(
                `Should have ${filteredManagedTeams.length} accessible teams`
              ).toBe(filteredManagedTeams.length);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * GESTOR with only gestor code should return empty array
       */
      it('should return empty array when GESTOR has only gestor code', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            (teamCodes) => {
              const teams = [teamCodes.gestor];
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.GESTOR, teamCodes);
              
              expect(accessibleTeams).withContext(
                `GESTOR with only gestor code should have no accessible teams`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('JOGADOR returns empty array', () => {
      /**
       * JOGADOR profile should always return empty array regardless of teams
       */
      it('should return empty array for JOGADOR profile regardless of teams', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 10),
            (teamCodes, teams) => {
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.JOGADOR, teamCodes);
              
              expect(accessibleTeams).withContext(
                `JOGADOR should always have empty accessible teams`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * JOGADOR with management codes in teams should still return empty array
       */
      it('should return empty array for JOGADOR even with management codes in teams', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 5),
            fc.boolean(),
            fc.boolean(),
            fc.boolean(),
            (teamCodes, otherTeams, includeSupervisor, includeGestor, includeDiretor) => {
              const teams = [...otherTeams];
              if (includeSupervisor) teams.push(teamCodes.supervisor);
              if (includeGestor) teams.push(teamCodes.gestor);
              if (includeDiretor) teams.push(teamCodes.diretor);
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.JOGADOR, teamCodes);
              
              expect(accessibleTeams).withContext(
                `JOGADOR should have empty accessible teams even with management codes`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('DIRETOR returns empty array (can see all)', () => {
      /**
       * DIRETOR profile should always return empty array (indicating access to all teams)
       */
      it('should return empty array for DIRETOR profile (indicating all access)', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(0, 10),
            (teamCodes, teams) => {
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.DIRETOR, teamCodes);
              
              expect(accessibleTeams).withContext(
                `DIRETOR should return empty array indicating all access`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * DIRETOR with diretor code and other teams should still return empty array
       */
      it('should return empty array for DIRETOR even with diretor code and managed teams', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            randomTeamsArbitrary(1, 8),
            (teamCodes, managedTeams) => {
              const teams = [teamCodes.diretor, ...managedTeams];
              
              const accessibleTeams = getAccessibleTeamIds(teams, UserProfile.DIRETOR, teamCodes);
              
              expect(accessibleTeams).withContext(
                `DIRETOR should return empty array regardless of teams`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Filtering works correctly with any valid team code configuration', () => {
      /**
       * Requirement 4.1: getAccessibleTeamIds should use configured team codes to identify management teams
       * Filtering should work with any valid unique team code configuration
       */
      it('should correctly filter management codes with any valid configuration', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.SUPERVISOR, UserProfile.GESTOR),
            randomTeamsArbitrary(1, 8),
            (teamCodes, profile, managedTeams) => {
              // Filter managed teams to exclude management codes
              const filteredManagedTeams = managedTeams.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              // Build teams based on profile
              const managementCode = profile === UserProfile.SUPERVISOR 
                ? teamCodes.supervisor 
                : teamCodes.gestor;
              const teams = [managementCode, ...filteredManagedTeams];
              
              const accessibleTeams = getAccessibleTeamIds(teams, profile, teamCodes);
              
              // Should not include the management code for this profile
              expect(accessibleTeams).withContext(
                `Should not include management code '${managementCode}' for ${profile}`
              ).not.toContain(managementCode);
              
              // Should include all managed teams
              expect(accessibleTeams.length).withContext(
                `Should have ${filteredManagedTeams.length} accessible teams for ${profile}`
              ).toBe(filteredManagedTeams.length);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Different team code configurations should produce consistent filtering behavior
       */
      it('should produce consistent filtering with different team code configurations', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.SUPERVISOR, UserProfile.GESTOR),
            randomTeamsArbitrary(2, 6),
            (teamCodes1, teamCodes2, profile, baseManagedTeams) => {
              // Use base managed teams that don't conflict with either configuration
              const managedTeams = baseManagedTeams.filter(t => 
                t !== teamCodes1.supervisor && t !== teamCodes1.gestor && t !== teamCodes1.diretor &&
                t !== teamCodes2.supervisor && t !== teamCodes2.gestor && t !== teamCodes2.diretor
              );
              
              // Skip if no valid managed teams - return true to pass the property
              if (managedTeams.length === 0) {
                return;
              }
              
              // Build teams for config 1
              const managementCode1 = profile === UserProfile.SUPERVISOR 
                ? teamCodes1.supervisor 
                : teamCodes1.gestor;
              const teams1 = [managementCode1, ...managedTeams];
              
              // Build teams for config 2
              const managementCode2 = profile === UserProfile.SUPERVISOR 
                ? teamCodes2.supervisor 
                : teamCodes2.gestor;
              const teams2 = [managementCode2, ...managedTeams];
              
              const accessibleTeams1 = getAccessibleTeamIds(teams1, profile, teamCodes1);
              const accessibleTeams2 = getAccessibleTeamIds(teams2, profile, teamCodes2);
              
              // Both should return the same managed teams (just the management code differs)
              expect(accessibleTeams1.sort()).withContext(
                `Both configurations should return same managed teams`
              ).toEqual(accessibleTeams2.sort());
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Team access filtering handles team objects with _id property', () => {
      /**
       * Teams can be objects with _id property instead of strings
       */
      it('should correctly filter when teams are objects with _id property', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.SUPERVISOR, UserProfile.GESTOR),
            randomTeamsArbitrary(1, 6),
            (teamCodes, profile, managedTeamIds) => {
              // Filter managed teams to exclude management codes
              const filteredManagedTeamIds = managedTeamIds.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              // Convert to objects with _id property
              const managedTeamObjects = filteredManagedTeamIds.map(id => ({ 
                _id: id, 
                name: `Team ${id}` 
              }));
              
              // Build teams based on profile
              const managementCode = profile === UserProfile.SUPERVISOR 
                ? teamCodes.supervisor 
                : teamCodes.gestor;
              const teams = [
                { _id: managementCode, name: 'Management Team' },
                ...managedTeamObjects
              ];
              
              const accessibleTeams = getAccessibleTeamIds(teams, profile, teamCodes);
              
              // Should not include the management code
              expect(accessibleTeams).withContext(
                `Should not include management code '${managementCode}'`
              ).not.toContain(managementCode);
              
              // Should include all managed team IDs
              for (const teamId of filteredManagedTeamIds) {
                expect(accessibleTeams).withContext(
                  `Should include managed team '${teamId}'`
                ).toContain(teamId);
              }
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Mixed format (strings and objects) should work correctly for filtering
       */
      it('should correctly filter with mixed team formats (strings and objects)', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.SUPERVISOR, UserProfile.GESTOR),
            randomTeamsArbitrary(2, 6),
            fc.boolean(), // use object format for management code
            (teamCodes, profile, managedTeamIds, useObjectForManagement) => {
              // Filter managed teams to exclude management codes
              const filteredManagedTeamIds = managedTeamIds.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              // Create mixed format teams (alternating strings and objects)
              const mixedManagedTeams = filteredManagedTeamIds.map((id, index) => 
                index % 2 === 0 ? id : { _id: id, name: `Team ${id}` }
              );
              
              // Build teams based on profile
              const managementCode = profile === UserProfile.SUPERVISOR 
                ? teamCodes.supervisor 
                : teamCodes.gestor;
              const managementTeam = useObjectForManagement 
                ? { _id: managementCode, name: 'Management' }
                : managementCode;
              
              const teams = [managementTeam, ...mixedManagedTeams];
              
              const accessibleTeams = getAccessibleTeamIds(teams, profile, teamCodes);
              
              // Should not include the management code
              expect(accessibleTeams).withContext(
                `Should not include management code with mixed formats`
              ).not.toContain(managementCode);
              
              // Should have correct count
              expect(accessibleTeams.length).withContext(
                `Should have ${filteredManagedTeamIds.length} accessible teams`
              ).toBe(filteredManagedTeamIds.length);
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Team access filtering is deterministic', () => {
      /**
       * Same input should always produce the same output
       */
      it('should return the same accessible teams for the same inputs across multiple calls', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.SUPERVISOR, UserProfile.GESTOR),
            randomTeamsArbitrary(1, 8),
            fc.integer({ min: 2, max: 10 }),
            (teamCodes, profile, managedTeams, numCalls) => {
              // Filter managed teams to exclude management codes
              const filteredManagedTeams = managedTeams.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              const managementCode = profile === UserProfile.SUPERVISOR 
                ? teamCodes.supervisor 
                : teamCodes.gestor;
              const teams = [managementCode, ...filteredManagedTeams];
              
              const results: string[][] = [];
              
              for (let i = 0; i < numCalls; i++) {
                results.push(getAccessibleTeamIds(teams, profile, teamCodes));
              }
              
              const firstResult = JSON.stringify(results[0].sort());
              expect(results.every(r => JSON.stringify(r.sort()) === firstResult)).withContext(
                `Expected all ${numCalls} calls to return the same result`
              ).toBeTrue();
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Order of teams in array should not affect the result set (may affect order)
       */
      it('should return the same set of accessible teams regardless of input order', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.SUPERVISOR, UserProfile.GESTOR),
            randomTeamsArbitrary(2, 8),
            (teamCodes, profile, managedTeams) => {
              // Filter managed teams to exclude management codes
              const filteredManagedTeams = managedTeams.filter(t => 
                t !== teamCodes.supervisor && 
                t !== teamCodes.gestor && 
                t !== teamCodes.diretor
              );
              
              const managementCode = profile === UserProfile.SUPERVISOR 
                ? teamCodes.supervisor 
                : teamCodes.gestor;
              const teams = [managementCode, ...filteredManagedTeams];
              
              // Get result with original order
              const originalResult = getAccessibleTeamIds(teams, profile, teamCodes);
              
              // Shuffle the teams array
              const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
              const shuffledResult = getAccessibleTeamIds(shuffledTeams, profile, teamCodes);
              
              // Results should contain the same elements (order may differ)
              expect(shuffledResult.sort()).withContext(
                `Shuffled teams should produce same accessible teams set`
              ).toEqual(originalResult.sort());
            }
          ),
          propertyTestConfig
        );
      });
    });

    describe('Edge cases for team access filtering', () => {
      /**
       * Empty teams array should return empty array for all profiles
       */
      it('should return empty array for empty teams regardless of profile', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.JOGADOR, UserProfile.SUPERVISOR, UserProfile.GESTOR, UserProfile.DIRETOR),
            (teamCodes, profile) => {
              const accessibleTeams = getAccessibleTeamIds([], profile, teamCodes);
              
              expect(accessibleTeams).withContext(
                `Empty teams should return empty accessible teams for ${profile}`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Null teams should return empty array for all profiles
       */
      it('should return empty array for null teams regardless of profile', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.JOGADOR, UserProfile.SUPERVISOR, UserProfile.GESTOR, UserProfile.DIRETOR),
            (teamCodes, profile) => {
              const accessibleTeams = getAccessibleTeamIds(null, profile, teamCodes);
              
              expect(accessibleTeams).withContext(
                `Null teams should return empty accessible teams for ${profile}`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });

      /**
       * Undefined teams should return empty array for all profiles
       */
      it('should return empty array for undefined teams regardless of profile', () => {
        // Feature: configurable-team-codes, Property 3: Team Access Filtering with Configured Codes
        fc.assert(
          fc.property(
            teamCodesArbitrary(),
            fc.constantFrom(UserProfile.JOGADOR, UserProfile.SUPERVISOR, UserProfile.GESTOR, UserProfile.DIRETOR),
            (teamCodes, profile) => {
              const accessibleTeams = getAccessibleTeamIds(undefined, profile, teamCodes);
              
              expect(accessibleTeams).withContext(
                `Undefined teams should return empty accessible teams for ${profile}`
              ).toEqual([]);
            }
          ),
          propertyTestConfig
        );
      });
    });
  });
});
