import { hasLiderCelulaRole, LIDER_CELULA_ROLE } from './lider-celula-role';

describe('lider-celula-role', () => {
  it('should detect LIDER_CELULA role', () => {
    expect(hasLiderCelulaRole([LIDER_CELULA_ROLE])).toBe(true);
  });

  it('should detect LIDER-CELULA variant', () => {
    expect(hasLiderCelulaRole(['LIDER-CELULA'])).toBe(true);
  });

  it('should return false for empty or unrelated roles', () => {
    expect(hasLiderCelulaRole(null)).toBe(false);
    expect(hasLiderCelulaRole([])).toBe(false);
    expect(hasLiderCelulaRole(['JOGADOR', 'GESTOR'])).toBe(false);
  });
});
