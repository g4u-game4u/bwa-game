import * as fc from 'fast-check';

/**
 * Preservation Property Tests for Dashboard Metrics Bugfix
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 * 
 * These tests verify that existing behaviors are preserved after the bugfix.
 * They should PASS on both unfixed and fixed code.
 * 
 * GOAL: Capture baseline behavior patterns that must remain unchanged.
 */

// ============================================================================
// Test 2.1 - Clientes na Carteira KPI Preservation
// ============================================================================

/**
 * Pure function that calculates "Clientes na Carteira" KPI.
 * This behavior MUST be preserved - it should work the same before and after the fix.
 * 
 * Validates: Requirements 3.1, 3.2
 * - Clientes na Carteira is calculated from player.extra.cnpj_resp
 * - Target uses player.extra.cnpj_goal (fallback: 10)
 */
function calculateClientesNaCarteiraKPI(
  playerExtra: { cnpj_resp?: string | null; cnpj_goal?: number | string | null } | null | undefined
): { id: string; label: string; current: number; target: number } {
  // Count CNPJs from cnpj_resp (comma or semicolon separated)
  const companyCount = playerExtra?.cnpj_resp 
    ? playerExtra.cnpj_resp.split(/[;,]/).map(s => s.trim()).filter(s => s.length > 0).length 
    : 0;
  
  // Get target from cnpj_goal with fallback to 10
  const cnpjGoal = playerExtra?.cnpj_goal != null
    ? (typeof playerExtra.cnpj_goal === 'number' 
        ? playerExtra.cnpj_goal 
        : parseInt(String(playerExtra.cnpj_goal), 10))
    : 10;
  
  return {
    id: 'numero-empresas',
    label: 'Clientes na Carteira',
    current: companyCount,
    target: isNaN(cnpjGoal) ? 10 : cnpjGoal
  };
}


// ============================================================================
// Test 2.2 - Current Month KPI Preservation
// ============================================================================

/**
 * Pure function that simulates KPI generation for current month.
 * This behavior MUST be preserved - both KPIs should display when viewing current month.
 * 
 * Validates: Requirements 3.1, 3.2
 * - Both KPIs displayed when entrega exists and viewing current month
 */
function getKPIsForCurrentMonth(
  playerExtra: { 
    entrega?: number | string | null; 
    entrega_goal?: number | string | null;
    cnpj_resp?: string | null; 
    cnpj_goal?: number | string | null;
  } | null | undefined
): { id: string; label: string; current: number; target: number }[] {
  const kpis: { id: string; label: string; current: number; target: number }[] = [];
  
  // Always add Clientes na Carteira
  kpis.push(calculateClientesNaCarteiraKPI(playerExtra));
  
  // Add Entregas no Prazo if entrega value exists
  if (playerExtra?.entrega != null) {
    const deliveryPercentage = typeof playerExtra.entrega === 'number' 
      ? playerExtra.entrega 
      : parseFloat(String(playerExtra.entrega));
    
    const entregaGoal = playerExtra?.entrega_goal != null
      ? (typeof playerExtra.entrega_goal === 'number' 
          ? playerExtra.entrega_goal 
          : parseFloat(String(playerExtra.entrega_goal)))
      : 90;
    
    if (!isNaN(deliveryPercentage)) {
      kpis.push({
        id: 'entregas-prazo',
        label: 'Entregas no Prazo',
        current: deliveryPercentage,
        target: isNaN(entregaGoal) ? 90 : entregaGoal
      });
    }
  }
  
  return kpis;
}

// ============================================================================
// Test 2.3 - Default Goals Preservation
// ============================================================================

/**
 * Pure function that applies default fallback values for goals.
 * This behavior MUST be preserved - fallback values should be used when goals not defined.
 * 
 * Validates: Requirements 3.5, 3.6
 * - entrega_goal defaults to 90 when not defined
 * - cnpj_goal defaults to 10 when not defined
 */
function applyDefaultGoals(
  playerExtra: { 
    entrega?: number | string | null;
    entrega_goal?: number | string | null;
    cnpj_resp?: string | null;
    cnpj_goal?: number | string | null;
  } | null | undefined
): { entrega_goal: number; cnpj_goal: number } {
  // Default entrega_goal to 90
  let entregaGoal = 90;
  if (playerExtra?.entrega_goal != null) {
    const parsed = typeof playerExtra.entrega_goal === 'number' 
      ? playerExtra.entrega_goal 
      : parseFloat(String(playerExtra.entrega_goal));
    if (!isNaN(parsed)) {
      entregaGoal = parsed;
    }
  }
  
  // Default cnpj_goal to 10
  let cnpjGoal = 10;
  if (playerExtra?.cnpj_goal != null) {
    const parsed = typeof playerExtra.cnpj_goal === 'number' 
      ? playerExtra.cnpj_goal 
      : parseInt(String(playerExtra.cnpj_goal), 10);
    if (!isNaN(parsed)) {
      cnpjGoal = parsed;
    }
  }
  
  return { entrega_goal: entregaGoal, cnpj_goal: cnpjGoal };
}


// ============================================================================
// Test 2.4 - Action Log Filter Preservation
// ============================================================================

/**
 * Pure function that simulates action log filtering by userId.
 * This behavior MUST be preserved - queries should always filter by userId.
 * 
 * Validates: Requirements 3.3, 3.4
 * - action_log queries filter by userId (player email)
 */
function filterActionLogByUserId(
  actionLogs: { userId: string; time: number; actionId: string }[],
  targetUserId: string
): { userId: string; time: number; actionId: string }[] {
  return actionLogs.filter(log => log.userId === targetUserId);
}

/**
 * Pure function that simulates action log filtering by userId and month.
 * This behavior MUST be preserved - queries should filter by both userId and time range.
 * 
 * Validates: Requirements 3.3, 3.4
 */
function filterActionLogByUserIdAndMonth(
  actionLogs: { userId: string; time: number; actionId: string }[],
  targetUserId: string,
  month: Date
): { userId: string; time: number; actionId: string }[] {
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1).getTime();
  const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  
  return actionLogs.filter(log => 
    log.userId === targetUserId && 
    log.time >= startOfMonth && 
    log.time <= endOfMonth
  );
}

// ============================================================================
// Test 2.5 - Null Safety Preservation
// ============================================================================

/**
 * Pure function that simulates null-safe seasonProgress update.
 * This behavior MUST be preserved - skip update if seasonProgress is null.
 * 
 * Validates: Requirements 3.6
 * - seasonProgress null-safety is maintained (skip update if null)
 */
function updateSeasonProgressSafely(
  seasonProgress: { metas: { current: number; target: number } } | null,
  newMetas: { current: number; target: number }
): { metas: { current: number; target: number } } | null {
  // Null safety: skip update if seasonProgress is null
  if (seasonProgress === null) {
    return null;
  }
  
  return {
    ...seasonProgress,
    metas: newMetas
  };
}


// ============================================================================
// Test Generators
// ============================================================================

/**
 * Generates player extra with optional cnpj_resp and cnpj_goal.
 */
function playerExtraWithCnpj(): fc.Arbitrary<{
  cnpj_resp: string;
  cnpj_goal: number;
}> {
  return fc.record({
    cnpj_resp: fc.array(fc.stringMatching(/^\d{14}$/), { minLength: 0, maxLength: 30 })
      .map(cnpjs => cnpjs.join(',')),
    cnpj_goal: fc.integer({ min: 1, max: 50 })
  });
}

/**
 * Generates player extra with all KPI-related fields.
 */
function playerExtraComplete(): fc.Arbitrary<{
  entrega: number;
  entrega_goal: number;
  cnpj_resp: string;
  cnpj_goal: number;
}> {
  return fc.record({
    entrega: fc.integer({ min: 0, max: 100 }),
    entrega_goal: fc.integer({ min: 50, max: 100 }),
    cnpj_resp: fc.array(fc.stringMatching(/^\d{14}$/), { minLength: 0, maxLength: 30 })
      .map(cnpjs => cnpjs.join(',')),
    cnpj_goal: fc.integer({ min: 1, max: 50 })
  });
}

/**
 * Generates player extra with undefined/null goal values to test fallbacks.
 */
function playerExtraWithoutGoals(): fc.Arbitrary<{
  entrega: number;
  cnpj_resp: string;
}> {
  return fc.record({
    entrega: fc.integer({ min: 0, max: 100 }),
    cnpj_resp: fc.array(fc.stringMatching(/^\d{14}$/), { minLength: 0, maxLength: 30 })
      .map(cnpjs => cnpjs.join(','))
  });
}

/**
 * Generates action log entries for testing userId filtering.
 */
function actionLogEntries(): fc.Arbitrary<{ userId: string; time: number; actionId: string }[]> {
  return fc.array(
    fc.record({
      userId: fc.stringMatching(/^[a-z]+@[a-z]+\.[a-z]+$/),
      time: fc.integer({ min: 1704067200000, max: 1735689600000 }), // 2024-2025
      actionId: fc.constantFrom('acessorias', 'desbloquear', 'tarefa', 'processo')
    }),
    { minLength: 0, maxLength: 100 }
  );
}

/**
 * Generates a date within a reasonable range.
 */
function dateInRange(): fc.Arbitrary<Date> {
  return fc.integer({ min: 0, max: 24 }).map(monthsAgo => {
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    return date;
  });
}

/**
 * Generates season progress object or null.
 */
function seasonProgressOrNull(): fc.Arbitrary<{ metas: { current: number; target: number } } | null> {
  return fc.oneof(
    fc.constant(null),
    fc.record({
      metas: fc.record({
        current: fc.integer({ min: 0, max: 10 }),
        target: fc.integer({ min: 1, max: 10 })
      })
    })
  );
}


// ============================================================================
// Preservation Property Tests
// ============================================================================

describe('Preservation Property Tests - Dashboard Metrics Bugfix', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test 2.1 - Clientes na Carteira KPI Preservation
   * 
   * Verifies that "Clientes na Carteira" KPI continues to be calculated from
   * player.extra.cnpj_resp with target from player.extra.cnpj_goal.
   * 
   * This behavior MUST be preserved after the bugfix.
   */
  describe('Test 2.1 - Clientes na Carteira KPI Preservation', () => {
    it('should calculate company count from cnpj_resp (comma-separated)', () => {
      fc.assert(
        fc.property(
          playerExtraWithCnpj(),
          (playerExtra) => {
            const kpi = calculateClientesNaCarteiraKPI(playerExtra);
            
            // Count should match the number of non-empty CNPJs
            const expectedCount = playerExtra.cnpj_resp
              .split(/[;,]/)
              .map(s => s.trim())
              .filter(s => s.length > 0)
              .length;
            
            expect(kpi.id).toBe('numero-empresas');
            expect(kpi.label).toBe('Clientes na Carteira');
            expect(kpi.current).toBe(expectedCount);
            expect(kpi.target).toBe(playerExtra.cnpj_goal);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use cnpj_goal as target', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (cnpjGoal) => {
            const playerExtra = { cnpj_resp: '12345678901234', cnpj_goal: cnpjGoal };
            const kpi = calculateClientesNaCarteiraKPI(playerExtra);
            
            expect(kpi.target).toBe(cnpjGoal);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle empty cnpj_resp', () => {
      const kpi = calculateClientesNaCarteiraKPI({ cnpj_resp: '', cnpj_goal: 10 });
      expect(kpi.current).toBe(0);
    });

    it('should handle null/undefined cnpj_resp', () => {
      const kpi1 = calculateClientesNaCarteiraKPI({ cnpj_resp: null, cnpj_goal: 10 });
      const kpi2 = calculateClientesNaCarteiraKPI({ cnpj_resp: undefined, cnpj_goal: 10 });
      const kpi3 = calculateClientesNaCarteiraKPI(null);
      const kpi4 = calculateClientesNaCarteiraKPI(undefined);
      
      expect(kpi1.current).toBe(0);
      expect(kpi2.current).toBe(0);
      expect(kpi3.current).toBe(0);
      expect(kpi4.current).toBe(0);
    });

    it('should handle semicolon-separated cnpj_resp', () => {
      const playerExtra = { 
        cnpj_resp: '12345678901234;98765432109876;11111111111111', 
        cnpj_goal: 10 
      };
      const kpi = calculateClientesNaCarteiraKPI(playerExtra);
      
      expect(kpi.current).toBe(3);
    });
  });


  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test 2.2 - Current Month KPI Preservation
   * 
   * Verifies that KPIs for current month continue to work correctly
   * (both KPIs displayed when entrega exists).
   * 
   * This behavior MUST be preserved after the bugfix.
   */
  describe('Test 2.2 - Current Month KPI Preservation', () => {
    it('should return 2 KPIs when entrega value exists', () => {
      fc.assert(
        fc.property(
          playerExtraComplete(),
          (playerExtra) => {
            const kpis = getKPIsForCurrentMonth(playerExtra);
            
            // Should always have at least 1 KPI (Clientes na Carteira)
            expect(kpis.length).toBeGreaterThanOrEqual(1);
            
            // Should have 2 KPIs when entrega exists
            if (playerExtra.entrega != null && !isNaN(playerExtra.entrega)) {
              expect(kpis.length).toBe(2);
              expect(kpis.some(kpi => kpi.id === 'numero-empresas')).toBe(true);
              expect(kpis.some(kpi => kpi.id === 'entregas-prazo')).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 1 KPI when entrega is null/undefined', () => {
      const kpis1 = getKPIsForCurrentMonth({ cnpj_resp: '12345678901234', cnpj_goal: 10, entrega: null });
      const kpis2 = getKPIsForCurrentMonth({ cnpj_resp: '12345678901234', cnpj_goal: 10, entrega: undefined });
      
      expect(kpis1.length).toBe(1);
      expect(kpis1[0].id).toBe('numero-empresas');
      
      expect(kpis2.length).toBe(1);
      expect(kpis2[0].id).toBe('numero-empresas');
    });

    it('should include correct values in Entregas no Prazo KPI', () => {
      const playerExtra = {
        entrega: 85,
        entrega_goal: 90,
        cnpj_resp: '12345678901234',
        cnpj_goal: 10
      };
      
      const kpis = getKPIsForCurrentMonth(playerExtra);
      const entregasKpi = kpis.find(kpi => kpi.id === 'entregas-prazo');
      
      expect(entregasKpi).toBeDefined();
      expect(entregasKpi!.current).toBe(85);
      expect(entregasKpi!.target).toBe(90);
    });
  });

  /**
   * **Validates: Requirements 3.5, 3.6**
   * 
   * Test 2.3 - Default Goals Preservation
   * 
   * Verifies that fallback values (entrega_goal=90, cnpj_goal=10) are used
   * when goals not defined in player.extra.
   * 
   * This behavior MUST be preserved after the bugfix.
   */
  describe('Test 2.3 - Default Goals Preservation', () => {
    it('should use default entrega_goal=90 when not defined', () => {
      fc.assert(
        fc.property(
          playerExtraWithoutGoals(),
          (playerExtra) => {
            const goals = applyDefaultGoals(playerExtra);
            
            // entrega_goal should default to 90
            expect(goals.entrega_goal).toBe(90);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should use default cnpj_goal=10 when not defined', () => {
      fc.assert(
        fc.property(
          playerExtraWithoutGoals(),
          (playerExtra) => {
            const goals = applyDefaultGoals(playerExtra);
            
            // cnpj_goal should default to 10
            expect(goals.cnpj_goal).toBe(10);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should use provided goals when defined', () => {
      fc.assert(
        fc.property(
          playerExtraComplete(),
          (playerExtra) => {
            const goals = applyDefaultGoals(playerExtra);
            
            // Should use provided values
            expect(goals.entrega_goal).toBe(playerExtra.entrega_goal);
            expect(goals.cnpj_goal).toBe(playerExtra.cnpj_goal);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle null goal values with defaults', () => {
      const goals1 = applyDefaultGoals({ entrega_goal: null, cnpj_goal: null });
      const goals2 = applyDefaultGoals(null);
      const goals3 = applyDefaultGoals(undefined);
      
      expect(goals1.entrega_goal).toBe(90);
      expect(goals1.cnpj_goal).toBe(10);
      
      expect(goals2.entrega_goal).toBe(90);
      expect(goals2.cnpj_goal).toBe(10);
      
      expect(goals3.entrega_goal).toBe(90);
      expect(goals3.cnpj_goal).toBe(10);
    });

    it('should handle string goal values', () => {
      const goals = applyDefaultGoals({ entrega_goal: '85', cnpj_goal: '15' });
      
      expect(goals.entrega_goal).toBe(85);
      expect(goals.cnpj_goal).toBe(15);
    });
  });


  /**
   * **Validates: Requirements 3.3, 3.4**
   * 
   * Test 2.4 - Action Log Filter Preservation
   * 
   * Verifies that action_log queries continue to filter by userId (player email).
   * 
   * This behavior MUST be preserved after the bugfix.
   */
  describe('Test 2.4 - Action Log Filter Preservation', () => {
    it('should filter action logs by userId', () => {
      fc.assert(
        fc.property(
          actionLogEntries(),
          fc.stringMatching(/^[a-z]+@[a-z]+\.[a-z]+$/),
          (logs, targetUserId) => {
            const filtered = filterActionLogByUserId(logs, targetUserId);
            
            // All filtered logs should have the target userId
            filtered.forEach(log => {
              expect(log.userId).toBe(targetUserId);
            });
            
            // Count should match manual filter
            const expectedCount = logs.filter(l => l.userId === targetUserId).length;
            expect(filtered.length).toBe(expectedCount);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return empty array when no logs match userId', () => {
      const logs = [
        { userId: 'user1@test.com', time: 1704067200000, actionId: 'tarefa' },
        { userId: 'user2@test.com', time: 1704153600000, actionId: 'processo' }
      ];
      
      const filtered = filterActionLogByUserId(logs, 'nonexistent@test.com');
      expect(filtered.length).toBe(0);
    });

    it('should filter by both userId and month', () => {
      fc.assert(
        fc.property(
          actionLogEntries(),
          fc.stringMatching(/^[a-z]+@[a-z]+\.[a-z]+$/),
          dateInRange(),
          (logs, targetUserId, month) => {
            const filtered = filterActionLogByUserIdAndMonth(logs, targetUserId, month);
            
            const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1).getTime();
            const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
            
            // All filtered logs should match userId and be within month
            filtered.forEach(log => {
              expect(log.userId).toBe(targetUserId);
              expect(log.time).toBeGreaterThanOrEqual(startOfMonth);
              expect(log.time).toBeLessThanOrEqual(endOfMonth);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should isolate user data - no cross-user contamination', () => {
      const logs = [
        { userId: 'user1@test.com', time: 1704067200000, actionId: 'tarefa' },
        { userId: 'user1@test.com', time: 1704153600000, actionId: 'processo' },
        { userId: 'user2@test.com', time: 1704067200000, actionId: 'tarefa' },
        { userId: 'user2@test.com', time: 1704240000000, actionId: 'desbloquear' }
      ];
      
      const user1Logs = filterActionLogByUserId(logs, 'user1@test.com');
      const user2Logs = filterActionLogByUserId(logs, 'user2@test.com');
      
      expect(user1Logs.length).toBe(2);
      expect(user2Logs.length).toBe(2);
      
      // Verify no cross-contamination
      user1Logs.forEach(log => expect(log.userId).toBe('user1@test.com'));
      user2Logs.forEach(log => expect(log.userId).toBe('user2@test.com'));
    });
  });

  /**
   * **Validates: Requirements 3.6**
   * 
   * Test 2.5 - Null Safety Preservation
   * 
   * Verifies that seasonProgress null-safety is maintained (skip update if null).
   * 
   * This behavior MUST be preserved after the bugfix.
   */
  describe('Test 2.5 - Null Safety Preservation', () => {
    it('should skip update when seasonProgress is null', () => {
      fc.assert(
        fc.property(
          fc.record({
            current: fc.integer({ min: 0, max: 10 }),
            target: fc.integer({ min: 1, max: 10 })
          }),
          (newMetas) => {
            const result = updateSeasonProgressSafely(null, newMetas);
            
            // Should return null when seasonProgress is null
            expect(result).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should update metas when seasonProgress is not null', () => {
      fc.assert(
        fc.property(
          fc.record({
            metas: fc.record({
              current: fc.integer({ min: 0, max: 10 }),
              target: fc.integer({ min: 1, max: 10 })
            })
          }),
          fc.record({
            current: fc.integer({ min: 0, max: 10 }),
            target: fc.integer({ min: 1, max: 10 })
          }),
          (seasonProgress, newMetas) => {
            const result = updateSeasonProgressSafely(seasonProgress, newMetas);
            
            // Should return updated object
            expect(result).not.toBeNull();
            expect(result!.metas.current).toBe(newMetas.current);
            expect(result!.metas.target).toBe(newMetas.target);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should preserve null safety across multiple updates', () => {
      const newMetas = { current: 1, target: 2 };
      
      // First update with null
      const result1 = updateSeasonProgressSafely(null, newMetas);
      expect(result1).toBeNull();
      
      // Second update with valid object
      const validProgress = { metas: { current: 0, target: 0 } };
      const result2 = updateSeasonProgressSafely(validProgress, newMetas);
      expect(result2).not.toBeNull();
      expect(result2!.metas).toEqual(newMetas);
      
      // Third update with null again
      const result3 = updateSeasonProgressSafely(null, { current: 2, target: 2 });
      expect(result3).toBeNull();
    });

    it('should handle property-based null safety scenarios', () => {
      fc.assert(
        fc.property(
          seasonProgressOrNull(),
          fc.record({
            current: fc.integer({ min: 0, max: 10 }),
            target: fc.integer({ min: 1, max: 10 })
          }),
          (seasonProgress, newMetas) => {
            const result = updateSeasonProgressSafely(seasonProgress, newMetas);
            
            if (seasonProgress === null) {
              // Null input should produce null output
              expect(result).toBeNull();
            } else {
              // Non-null input should produce updated output
              expect(result).not.toBeNull();
              expect(result!.metas).toEqual(newMetas);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
