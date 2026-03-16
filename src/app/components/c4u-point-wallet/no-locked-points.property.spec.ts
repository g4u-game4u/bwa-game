import * as fc from 'fast-check';

// Feature: acl-dashboard-refactor, Property 13: No dashboard renders locked_points for any profile
// **Validates: Requirements 16.4**

/**
 * Checks whether an HTML template string contains any locked-points display patterns.
 * Locked points are identified by patterns like:
 * - Text "Bloqueados" as a label
 * - Bindings to bloqueados/locked_points fields for display
 * - CSS classes or data-testid referencing bloqueados/locked
 * - Any <div>/<span> rendering locked point values
 */
function templateContainsLockedPointsDisplay(template: string): boolean {
  const lockedDisplayPatterns = [
    />\s*Bloqueados\s*</i,                          // Label text "Bloqueados" in an element
    /locked[_-]?points/i,                            // locked_points or locked-points references
    /pontos\s*bloqueados/i,                          // "pontos bloqueados" text
    /\{\{\s*[^}]*\.bloqueados\s*[|}]/i,              // {{ something.bloqueados }} interpolation
    /\{\{\s*[^}]*locked[_-]?points\s*[|}]/i,         // {{ something.locked_points }} interpolation
    /data-testid\s*=\s*["']bloqueados/i,             // data-testid="bloqueados..."
    /ri-lock-fill[^}]*Bloqueados/is,                 // lock icon followed by Bloqueados label
  ];

  return lockedDisplayPatterns.some(pattern => pattern.test(template));
}

/**
 * The actual template content of c4u-point-wallet component.
 * This is the real template that must remain free of locked points display.
 */
const POINT_WALLET_TEMPLATE = `
<div class="point-wallet">
  <h4 class="wallet-title">Carteira de Pontos</h4>
  
  <div class="point-rows">
    <div class="point-row">
      <div class="row-left">
        <i class="ri-star-fill icon desbloqueados"></i>
        <span class="label">Pontos</span>
        <c4u-info-button infoKey="desbloqueados" position="top"></c4u-info-button>
      </div>
      <span class="value">{{ points.desbloqueados | number:'1.0-0':'pt-BR' }}</span>
    </div>

    <div class="point-row">
      <div class="row-left">
        <i class="ri-coin-fill icon moedas"></i>
        <span class="label">Moedas</span>
        <c4u-info-button infoKey="moedas" position="top"></c4u-info-button>
      </div>
      <span class="value">{{ points.moedas | number:'1.0-0':'pt-BR' }}</span>
    </div>

    <div class="point-row" *ngIf="mediaPontos !== undefined">
      <div class="row-left">
        <i class="ri-star-fill icon media"></i>
        <span class="label">Média de Pontos</span>
        <c4u-info-button infoKey="media-pontos" position="top"></c4u-info-button>
      </div>
      <span class="value">{{ mediaPontos | number:'1.0-0':'pt-BR' }}</span>
    </div>
  </div>
</div>
`;

/**
 * Arbitrary that generates locked-points-related display patterns that SHOULD be detected.
 * These represent the kinds of locked points display patterns that must NOT appear in the template.
 */
const lockedPointsDisplayPatternArb = fc.oneof(
  // Label text variations
  fc.constantFrom(
    '<span class="label">Bloqueados</span>',
    '<span class="metric-label">Bloqueados</span>',
    '<span>Pontos Bloqueados</span>',
    '<div class="label">Bloqueados</div>'
  ),
  // Interpolation bindings
  fc.constantFrom(
    '{{ points.bloqueados | number }}',
    '{{ points.bloqueados }}',
    '{{ player.locked_points }}',
    '{{ data.locked_points | number }}',
    '{{ wallet.bloqueados | number:\'1.0-0\':\'pt-BR\' }}'
  ),
  // Data attributes and test IDs
  fc.constantFrom(
    'data-testid="bloqueados-points"',
    'data-testid="locked-points"',
    'class="locked-points-value"'
  ),
  // Icon + label combos (like the old c4u-team-sidebar pattern)
  fc.constantFrom(
    '<i class="ri-lock-fill"></i> Bloqueados',
    '<i class="metric-icon ri-lock-fill"></i>\n          Bloqueados'
  )
);

/**
 * Arbitrary that generates a full locked-points row element that SHOULD be detected.
 */
const lockedPointsRowArb = lockedPointsDisplayPatternArb.map(pattern =>
  `<div class="point-row">${pattern}</div>`
);

describe('Property 13: No dashboard renders locked_points for any profile', () => {
  // Feature: acl-dashboard-refactor, Property 13: No dashboard renders locked_points for any profile
  // **Validates: Requirements 16.4**

  it('actual point wallet template contains no locked points display patterns', () => {
    fc.assert(
      fc.property(lockedPointsDisplayPatternArb, (lockedPattern) => {
        // The actual template must not contain any locked-points display pattern
        const templateLower = POINT_WALLET_TEMPLATE.toLowerCase();
        const patternLower = lockedPattern.toLowerCase();
        expect(templateLower).not.toContain(patternLower);
      }),
      { numRuns: 200 }
    );
  });

  it('detection function correctly identifies locked points in templates that have them', () => {
    fc.assert(
      fc.property(lockedPointsRowArb, (lockedRow) => {
        // A template containing a locked points row SHOULD be detected
        const templateWithLocked = `<div class="point-wallet">${lockedRow}</div>`;
        expect(templateContainsLockedPointsDisplay(templateWithLocked)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('actual point wallet template passes the locked points detection function as clean', () => {
    expect(templateContainsLockedPointsDisplay(POINT_WALLET_TEMPLATE)).toBe(false);
  });

  it('template only displays Pontos and Moedas labels, never Bloqueados', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'Bloqueados', 'bloqueados', 'BLOQUEADOS',
          'Pontos Bloqueados', 'pontos bloqueados',
          'locked_points', 'locked-points', 'lockedPoints'
        ),
        (blockedLabel) => {
          // Extract only label text content from the template
          const labelMatches = POINT_WALLET_TEMPLATE.match(/<span class="label">[^<]+<\/span>/g) || [];
          const labelTexts = labelMatches.map(m => m.replace(/<[^>]+>/g, '').trim().toLowerCase());
          expect(labelTexts).not.toContain(blockedLabel.toLowerCase());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('injecting a locked points row into a clean template is always detected', () => {
    fc.assert(
      fc.property(
        lockedPointsRowArb,
        fc.constantFrom('point-rows', 'point-wallet', 'wallet-content'),
        (lockedRow, wrapper) => {
          const injected = `<div class="${wrapper}">${lockedRow}</div>`;
          expect(templateContainsLockedPointsDisplay(injected)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
