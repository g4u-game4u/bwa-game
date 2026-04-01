import * as fc from 'fast-check';
import { getMetricFieldsForProfile } from '@utils/metric-field-selector';
import { UserProfile } from '@utils/user-profile';

// Feature: acl-dashboard-refactor, Property 14: SUPERVISOR cnpj metric comes from extra.cnpj_sup, entrega from extra.entrega_sup
// **Validates: Requirements 10.5, 12.5, 12.6**

const allProfiles = Object.values(UserProfile) as UserProfile[];
const nonSupervisorProfiles = allProfiles.filter(p => p !== UserProfile.SUPERVISOR);

/**
 * Generates a positive numeric string suitable for metric values.
 */
const metricValueArb = fc.double({ min: 0.01, max: 100000, noNaN: true, noDefaultInfinity: true })
  .map(v => String(v));

/**
 * Generates an extra object with both regular and _sup metric fields set to distinct values,
 * so we can verify which field is actually read.
 */
const extraWithDistinctFieldsArb = fc.tuple(metricValueArb, metricValueArb, metricValueArb, metricValueArb)
  .filter(([cnpjSup, cnpj, entregaSup, entrega]) =>
    parseFloat(cnpjSup) !== parseFloat(cnpj) && parseFloat(entregaSup) !== parseFloat(entrega)
  )
  .map(([cnpjSup, cnpj, entregaSup, entrega]) => ({
    cnpj_sup: cnpjSup,
    cnpj: cnpj,
    entrega_sup: entregaSup,
    entrega: entrega,
  }));

describe('Property 14: SUPERVISOR cnpj metric comes from extra.cnpj_sup, entrega from extra.entrega_sup', () => {
  // Feature: acl-dashboard-refactor, Property 14: SUPERVISOR cnpj metric comes from extra.cnpj_sup, entrega from extra.entrega_sup
  // **Validates: Requirements 10.5, 12.5, 12.6**

  it('SUPERVISOR reads cnpj from cnpj_sup and entrega from entrega_sup', () => {
    fc.assert(
      fc.property(extraWithDistinctFieldsArb, (extra) => {
        const result = getMetricFieldsForProfile(UserProfile.SUPERVISOR, extra);
        expect(result.cnpj).toBe(parseFloat(extra.cnpj_sup) || 0);
        expect(result.entrega).toBe(parseFloat(extra.entrega_sup) || 0);
      }),
      { numRuns: 200 }
    );
  });

  it('SUPERVISOR does NOT read from regular cnpj/entrega fields', () => {
    fc.assert(
      fc.property(extraWithDistinctFieldsArb, (extra) => {
        const result = getMetricFieldsForProfile(UserProfile.SUPERVISOR, extra);
        // Since values are distinct, SUPERVISOR result should differ from regular fields
        expect(result.cnpj).not.toBe(parseFloat(extra.cnpj));
        expect(result.entrega).not.toBe(parseFloat(extra.entrega));
      }),
      { numRuns: 200 }
    );
  });

  it('non-SUPERVISOR profiles read from regular cnpj and entrega fields', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonSupervisorProfiles),
        extraWithDistinctFieldsArb,
        (profile, extra) => {
          const result = getMetricFieldsForProfile(profile, extra);
          expect(result.cnpj).toBe(parseFloat(extra.cnpj) || 0);
          expect(result.entrega).toBe(parseFloat(extra.entrega) || 0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('non-SUPERVISOR profiles do NOT read from _sup fields', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonSupervisorProfiles),
        extraWithDistinctFieldsArb,
        (profile, extra) => {
          const result = getMetricFieldsForProfile(profile, extra);
          expect(result.cnpj).not.toBe(parseFloat(extra.cnpj_sup));
          expect(result.entrega).not.toBe(parseFloat(extra.entrega_sup));
        }
      ),
      { numRuns: 200 }
    );
  });

  it('SUPERVISOR returns 0 when cnpj_sup and entrega_sup are missing', () => {
    const extra = { cnpj: '42', entrega: '88' };
    const result = getMetricFieldsForProfile(UserProfile.SUPERVISOR, extra);
    expect(result.cnpj).toBe(0);
    expect(result.entrega).toBe(0);
  });

  it('non-SUPERVISOR returns 0 when cnpj and entrega are missing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonSupervisorProfiles),
        (profile) => {
          const extra = { cnpj_sup: '42', entrega_sup: '88' };
          const result = getMetricFieldsForProfile(profile, extra);
          expect(result.cnpj).toBe(0);
          expect(result.entrega).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});
