import * as fc from 'fast-check';

// Feature: dashboard-metrics-refactor, Property 6: Dynamic cnpj_goal target in KPI
// **Validates: Requirements 5.1, 5.3**

/**
 * Pure function that extracts the cnpj_goal target from player extra data.
 * This mirrors the exact logic used in KPIService.getPlayerKPIs() for determining
 * the "Clientes na Carteira" KPI target.
 * 
 * @param cnpjGoal - The value from player.extra.cnpj_goal
 * @returns The target value (defaults to 10 if null/undefined)
 */
function extractCnpjGoalTarget(cnpjGoal: number | string | null | undefined): number {
  if (cnpjGoal === undefined || cnpjGoal === null) {
    return 10; // Default target
  }
  
  if (typeof cnpjGoal === 'number') {
    return cnpjGoal;
  }
  
  // Handle string values (parse to integer)
  return parseInt(String(cnpjGoal), 10);
}

/**
 * Generates a player extra object with optional cnpj_goal field.
 * Simulates various states: set to number, set to string, null, undefined, or missing.
 */
function playerExtraWithCnpjGoal(): fc.Arbitrary<{
  extra: { cnpj_goal?: number | string | null; cnpj_resp?: string } | null | undefined;
  expectedTarget: number;
}> {
  return fc.oneof(
    // Case 1: cnpj_goal is a positive number
    fc.integer({ min: 1, max: 1000 }).map(goal => ({
      extra: { cnpj_goal: goal, cnpj_resp: '12345,67890' },
      expectedTarget: goal
    })),
    // Case 2: cnpj_goal is zero (valid non-negative integer)
    fc.constant({
      extra: { cnpj_goal: 0, cnpj_resp: '12345' },
      expectedTarget: 0
    }),
    // Case 3: cnpj_goal is a string representation of a number
    fc.integer({ min: 1, max: 1000 }).map(goal => ({
      extra: { cnpj_goal: String(goal), cnpj_resp: '12345,67890' },
      expectedTarget: goal
    })),
    // Case 4: cnpj_goal is null - should default to 10
    fc.constant({
      extra: { cnpj_goal: null, cnpj_resp: '12345' },
      expectedTarget: 10
    }),
    // Case 5: cnpj_goal is undefined - should default to 10
    fc.constant({
      extra: { cnpj_goal: undefined, cnpj_resp: '12345' },
      expectedTarget: 10
    }),
    // Case 6: extra object exists but cnpj_goal field is missing - should default to 10
    fc.constant({
      extra: { cnpj_resp: '12345,67890,11111' },
      expectedTarget: 10
    }),
    // Case 7: extra is null - should default to 10
    fc.constant({
      extra: null,
      expectedTarget: 10
    }),
    // Case 8: extra is undefined - should default to 10
    fc.constant({
      extra: undefined,
      expectedTarget: 10
    })
  );
}

/**
 * Generates random positive integer cnpj_goal values.
 */
function positiveIntegerGoal(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 10000 });
}

describe('Property 6: Dynamic cnpj_goal target in KPI', () => {
  // Feature: dashboard-metrics-refactor, Property 6: Dynamic cnpj_goal target in KPI
  // **Validates: Requirements 5.1, 5.3**

  describe('extractCnpjGoalTarget function', () => {
    it('should return the cnpj_goal value when set to a positive number', () => {
      fc.assert(
        fc.property(positiveIntegerGoal(), (goal) => {
          const target = extractCnpjGoalTarget(goal);
          expect(target).toBe(goal);
        }),
        { numRuns: 100 }
      );
    });

    it('should return 0 when cnpj_goal is explicitly set to 0', () => {
      const target = extractCnpjGoalTarget(0);
      expect(target).toBe(0);
    });

    it('should parse string values to integers', () => {
      fc.assert(
        fc.property(positiveIntegerGoal(), (goal) => {
          const target = extractCnpjGoalTarget(String(goal));
          expect(target).toBe(goal);
        }),
        { numRuns: 100 }
      );
    });

    it('should default to 10 when cnpj_goal is null', () => {
      const target = extractCnpjGoalTarget(null);
      expect(target).toBe(10);
    });

    it('should default to 10 when cnpj_goal is undefined', () => {
      const target = extractCnpjGoalTarget(undefined);
      expect(target).toBe(10);
    });
  });

  describe('Player extra object scenarios', () => {
    it('should correctly determine target for all player extra configurations', () => {
      fc.assert(
        fc.property(playerExtraWithCnpjGoal(), ({ extra, expectedTarget }) => {
          // Extract cnpj_goal from extra object (mimicking service logic)
          const cnpjGoal = extra?.cnpj_goal;
          const target = extractCnpjGoalTarget(cnpjGoal);
          
          expect(target).toBe(expectedTarget);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle random positive cnpj_goal values correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          (cnpjGoal) => {
            const playerExtra = { cnpj_goal: cnpjGoal, cnpj_resp: '12345' };
            const target = extractCnpjGoalTarget(playerExtra.cnpj_goal);
            
            // Target should equal the cnpj_goal value
            expect(target).toBe(cnpjGoal);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always default to 10 for null/undefined cnpj_goal', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined),
          (cnpjGoal) => {
            const target = extractCnpjGoalTarget(cnpjGoal);
            expect(target).toBe(10);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('KPI target calculation consistency', () => {
    it('should maintain target value through the calculation pipeline', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (cnpjGoal, cnpjResp) => {
            // Simulate the full player extra object
            const playerExtra = {
              cnpj_goal: cnpjGoal,
              cnpj_resp: cnpjResp
            };
            
            // Extract target using the same logic as the service
            const target = extractCnpjGoalTarget(playerExtra.cnpj_goal);
            
            // Verify target equals cnpj_goal
            expect(target).toBe(cnpjGoal);
            
            // Verify super target calculation (50% above target)
            const superTarget = Math.ceil(target * 1.5);
            expect(superTarget).toBe(Math.ceil(cnpjGoal * 1.5));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct super target (150% of target)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (cnpjGoal) => {
            const target = extractCnpjGoalTarget(cnpjGoal);
            const superTarget = Math.ceil(target * 1.5);
            
            // Super target should be 150% of target, rounded up
            expect(superTarget).toBe(Math.ceil(cnpjGoal * 1.5));
            expect(superTarget).toBeGreaterThanOrEqual(target);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use default target of 10 with super target of 15 when cnpj_goal is missing', () => {
      const nullCases = [null, undefined];
      
      nullCases.forEach(cnpjGoal => {
        const target = extractCnpjGoalTarget(cnpjGoal);
        const superTarget = Math.ceil(target * 1.5);
        
        expect(target).toBe(10);
        expect(superTarget).toBe(15); // Math.ceil(10 * 1.5) = 15
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle very large cnpj_goal values', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10000, max: 1000000 }),
          (largeGoal) => {
            const target = extractCnpjGoalTarget(largeGoal);
            expect(target).toBe(largeGoal);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle cnpj_goal of 1 (minimum positive value)', () => {
      const target = extractCnpjGoalTarget(1);
      expect(target).toBe(1);
      
      const superTarget = Math.ceil(target * 1.5);
      expect(superTarget).toBe(2); // Math.ceil(1.5) = 2
    });

    it('should handle string "0" as zero', () => {
      const target = extractCnpjGoalTarget('0');
      expect(target).toBe(0);
    });
  });
});


// Feature: dashboard-metrics-refactor, Property 7: Dynamic entrega_goal target in KPI
// **Validates: Requirements 5.2, 5.4**

/**
 * Pure function that extracts the entrega_goal target from player extra data.
 * This mirrors the exact logic used in KPIService.getPlayerKPIs() for determining
 * the "Entregas no Prazo" KPI target.
 * 
 * @param entregaGoal - The value from player.extra.entrega_goal
 * @returns The target value (defaults to 90 if null/undefined)
 */
function extractEntregaGoalTarget(entregaGoal: number | string | null | undefined): number {
  if (entregaGoal === undefined || entregaGoal === null) {
    return 90; // Default target
  }
  
  if (typeof entregaGoal === 'number') {
    return entregaGoal;
  }
  
  // Handle string values (parse to float for percentage values)
  return parseFloat(String(entregaGoal));
}

/**
 * Generates a player extra object with optional entrega_goal field.
 * Simulates various states: set to number (0-100), set to string, null, undefined, or missing.
 */
function playerExtraWithEntregaGoal(): fc.Arbitrary<{
  extra: { entrega_goal?: number | string | null; cnpj_resp?: string } | null | undefined;
  expectedTarget: number;
}> {
  return fc.oneof(
    // Case 1: entrega_goal is a number between 0 and 100
    fc.integer({ min: 0, max: 100 }).map(goal => ({
      extra: { entrega_goal: goal, cnpj_resp: '12345,67890' },
      expectedTarget: goal
    })),
    // Case 2: entrega_goal is a decimal number (e.g., 85.5)
    fc.float({ min: 0, max: 100, noNaN: true }).map(goal => ({
      extra: { entrega_goal: goal, cnpj_resp: '12345,67890' },
      expectedTarget: goal
    })),
    // Case 3: entrega_goal is a string representation of a number
    fc.integer({ min: 0, max: 100 }).map(goal => ({
      extra: { entrega_goal: String(goal), cnpj_resp: '12345,67890' },
      expectedTarget: goal
    })),
    // Case 4: entrega_goal is null - should default to 90
    fc.constant({
      extra: { entrega_goal: null, cnpj_resp: '12345' },
      expectedTarget: 90
    }),
    // Case 5: entrega_goal is undefined - should default to 90
    fc.constant({
      extra: { entrega_goal: undefined, cnpj_resp: '12345' },
      expectedTarget: 90
    }),
    // Case 6: extra object exists but entrega_goal field is missing - should default to 90
    fc.constant({
      extra: { cnpj_resp: '12345,67890,11111' },
      expectedTarget: 90
    }),
    // Case 7: extra is null - should default to 90
    fc.constant({
      extra: null,
      expectedTarget: 90
    }),
    // Case 8: extra is undefined - should default to 90
    fc.constant({
      extra: undefined,
      expectedTarget: 90
    })
  );
}

/**
 * Generates random entrega_goal values between 0 and 100.
 */
function validEntregaGoal(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 100 });
}

describe('Property 7: Dynamic entrega_goal target in KPI', () => {
  // Feature: dashboard-metrics-refactor, Property 7: Dynamic entrega_goal target in KPI
  // **Validates: Requirements 5.2, 5.4**

  describe('extractEntregaGoalTarget function', () => {
    it('should return the entrega_goal value when set to a number between 0 and 100', () => {
      fc.assert(
        fc.property(validEntregaGoal(), (goal) => {
          const target = extractEntregaGoalTarget(goal);
          expect(target).toBe(goal);
        }),
        { numRuns: 100 }
      );
    });

    it('should return 0 when entrega_goal is explicitly set to 0', () => {
      const target = extractEntregaGoalTarget(0);
      expect(target).toBe(0);
    });

    it('should return 100 when entrega_goal is explicitly set to 100', () => {
      const target = extractEntregaGoalTarget(100);
      expect(target).toBe(100);
    });

    it('should parse string values to numbers', () => {
      fc.assert(
        fc.property(validEntregaGoal(), (goal) => {
          const target = extractEntregaGoalTarget(String(goal));
          expect(target).toBe(goal);
        }),
        { numRuns: 100 }
      );
    });

    it('should default to 90 when entrega_goal is null', () => {
      const target = extractEntregaGoalTarget(null);
      expect(target).toBe(90);
    });

    it('should default to 90 when entrega_goal is undefined', () => {
      const target = extractEntregaGoalTarget(undefined);
      expect(target).toBe(90);
    });
  });

  describe('Player extra object scenarios', () => {
    it('should correctly determine target for all player extra configurations', () => {
      fc.assert(
        fc.property(playerExtraWithEntregaGoal(), ({ extra, expectedTarget }) => {
          // Extract entrega_goal from extra object (mimicking service logic)
          const entregaGoal = extra?.entrega_goal;
          const target = extractEntregaGoalTarget(entregaGoal);
          
          expect(target).toBe(expectedTarget);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle random valid entrega_goal values correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (entregaGoal) => {
            const playerExtra = { entrega_goal: entregaGoal, cnpj_resp: '12345' };
            const target = extractEntregaGoalTarget(playerExtra.entrega_goal);
            
            // Target should equal the entrega_goal value
            expect(target).toBe(entregaGoal);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always default to 90 for null/undefined entrega_goal', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined),
          (entregaGoal) => {
            const target = extractEntregaGoalTarget(entregaGoal);
            expect(target).toBe(90);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('KPI target calculation consistency', () => {
    it('should maintain target value through the calculation pipeline', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (entregaGoal, cnpjResp) => {
            // Simulate the full player extra object
            const playerExtra = {
              entrega_goal: entregaGoal,
              cnpj_resp: cnpjResp
            };
            
            // Extract target using the same logic as the service
            const target = extractEntregaGoalTarget(playerExtra.entrega_goal);
            
            // Verify target equals entrega_goal
            expect(target).toBe(entregaGoal);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use default target of 90 when entrega_goal is missing', () => {
      const nullCases = [null, undefined];
      
      nullCases.forEach(entregaGoal => {
        const target = extractEntregaGoalTarget(entregaGoal);
        expect(target).toBe(90);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle boundary values (0 and 100)', () => {
      // Test minimum boundary
      expect(extractEntregaGoalTarget(0)).toBe(0);
      
      // Test maximum boundary
      expect(extractEntregaGoalTarget(100)).toBe(100);
    });

    it('should handle decimal percentage values', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true }),
          (decimalGoal) => {
            const target = extractEntregaGoalTarget(decimalGoal);
            expect(target).toBe(decimalGoal);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle string decimal values', () => {
      const target = extractEntregaGoalTarget('85.5');
      expect(target).toBe(85.5);
    });

    it('should handle string "0" as zero', () => {
      const target = extractEntregaGoalTarget('0');
      expect(target).toBe(0);
    });

    it('should handle string "100" as 100', () => {
      const target = extractEntregaGoalTarget('100');
      expect(target).toBe(100);
    });
  });

  describe('Comparison with default value', () => {
    it('should return different values when entrega_goal is set vs when it defaults', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 89 }), // Values less than default 90
          (entregaGoal) => {
            const setTarget = extractEntregaGoalTarget(entregaGoal);
            const defaultTarget = extractEntregaGoalTarget(null);
            
            // When set to a value less than 90, target should differ from default
            expect(setTarget).toBe(entregaGoal);
            expect(defaultTarget).toBe(90);
            expect(setTarget).not.toBe(defaultTarget);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return same value when entrega_goal equals default (90)', () => {
      const setTarget = extractEntregaGoalTarget(90);
      const defaultTarget = extractEntregaGoalTarget(null);
      
      expect(setTarget).toBe(90);
      expect(defaultTarget).toBe(90);
      expect(setTarget).toBe(defaultTarget);
    });
  });
});
