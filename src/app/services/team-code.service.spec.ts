import { TestBed } from '@angular/core/testing';
import { TeamCodeService, TeamCodes } from './team-code.service';

/**
 * Unit tests for TeamCodeService
 * 
 * Tests cover:
 * - Service instantiation with default values
 * - getTeamCodes() returns correct structure
 * - Individual getter methods return correct values
 * - isValidTeamCode() edge cases: empty string, whitespace, null, undefined, valid strings
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */
describe('TeamCodeService', () => {
  // Default values as defined in the service
  const DEFAULT_SUPERVISOR_CODE = 'Fkmdmko';
  const DEFAULT_GESTOR_CODE = 'FkmdnFU';
  const DEFAULT_DIRETOR_CODE = 'FkmdhZ9';

  describe('Service Instantiation', () => {
    it('should be created', () => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      const service = TestBed.inject(TeamCodeService);
      expect(service).toBeTruthy();
    });

    it('should initialize with default team codes when no custom codes configured', () => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      const service = TestBed.inject(TeamCodeService);
      
      const codes = service.getTeamCodes();
      expect(codes.supervisor).toBe(DEFAULT_SUPERVISOR_CODE);
      expect(codes.gestor).toBe(DEFAULT_GESTOR_CODE);
      expect(codes.diretor).toBe(DEFAULT_DIRETOR_CODE);
    });
  });

  describe('getTeamCodes() - Structure and Values', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should return an object with supervisor, gestor, and diretor properties', () => {
      const codes = service.getTeamCodes();
      
      expect(codes).toBeDefined();
      expect(typeof codes).toBe('object');
      expect('supervisor' in codes).toBeTrue();
      expect('gestor' in codes).toBeTrue();
      expect('diretor' in codes).toBeTrue();
    });

    it('should return correct default supervisor code', () => {
      const codes = service.getTeamCodes();
      expect(codes.supervisor).toBe(DEFAULT_SUPERVISOR_CODE);
    });

    it('should return correct default gestor code', () => {
      const codes = service.getTeamCodes();
      expect(codes.gestor).toBe(DEFAULT_GESTOR_CODE);
    });

    it('should return correct default diretor code', () => {
      const codes = service.getTeamCodes();
      expect(codes.diretor).toBe(DEFAULT_DIRETOR_CODE);
    });

    it('should return the same object on multiple calls (caching)', () => {
      const firstCall = service.getTeamCodes();
      const secondCall = service.getTeamCodes();
      const thirdCall = service.getTeamCodes();

      expect(firstCall).toBe(secondCall);
      expect(secondCall).toBe(thirdCall);
    });

    it('should cache the resolved codes at initialization', () => {
      const results: TeamCodes[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(service.getTeamCodes());
      }

      const allSame = results.every(codes => codes === results[0]);
      expect(allSame).toBeTrue();
    });
  });

  describe('Individual Getter Methods', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('getSupervisorCode() should return the default supervisor code', () => {
      expect(service.getSupervisorCode()).toBe(DEFAULT_SUPERVISOR_CODE);
    });

    it('getGestorCode() should return the default gestor code', () => {
      expect(service.getGestorCode()).toBe(DEFAULT_GESTOR_CODE);
    });

    it('getDiretorCode() should return the default diretor code', () => {
      expect(service.getDiretorCode()).toBe(DEFAULT_DIRETOR_CODE);
    });

    it('individual getters should match getTeamCodes() values', () => {
      const codes = service.getTeamCodes();
      
      expect(service.getSupervisorCode()).toBe(codes.supervisor);
      expect(service.getGestorCode()).toBe(codes.gestor);
      expect(service.getDiretorCode()).toBe(codes.diretor);
    });

    it('getSupervisorCode() should return consistent value on multiple calls', () => {
      const results: string[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(service.getSupervisorCode());
      }
      expect(results.every(code => code === results[0])).toBeTrue();
    });

    it('getGestorCode() should return consistent value on multiple calls', () => {
      const results: string[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(service.getGestorCode());
      }
      expect(results.every(code => code === results[0])).toBeTrue();
    });

    it('getDiretorCode() should return consistent value on multiple calls', () => {
      const results: string[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(service.getDiretorCode());
      }
      expect(results.every(code => code === results[0])).toBeTrue();
    });
  });

  describe('isValidTeamCode() - Empty String', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should return false for empty string', () => {
      expect(service.isValidTeamCode('')).toBeFalse();
    });
  });

  describe('isValidTeamCode() - Whitespace', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should return false for single space', () => {
      expect(service.isValidTeamCode(' ')).toBeFalse();
    });

    it('should return false for multiple spaces', () => {
      expect(service.isValidTeamCode('   ')).toBeFalse();
    });

    it('should return false for tab character', () => {
      expect(service.isValidTeamCode('\t')).toBeFalse();
    });

    it('should return false for multiple tabs', () => {
      expect(service.isValidTeamCode('\t\t')).toBeFalse();
    });

    it('should return false for newline character', () => {
      expect(service.isValidTeamCode('\n')).toBeFalse();
    });

    it('should return false for multiple newlines', () => {
      expect(service.isValidTeamCode('\n\n')).toBeFalse();
    });

    it('should return false for mixed whitespace', () => {
      expect(service.isValidTeamCode(' \t\n ')).toBeFalse();
    });

    it('should return false for carriage return', () => {
      expect(service.isValidTeamCode('\r')).toBeFalse();
    });

    it('should return false for carriage return and newline', () => {
      expect(service.isValidTeamCode('\r\n')).toBeFalse();
    });
  });

  describe('isValidTeamCode() - Null', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should return false for null', () => {
      expect(service.isValidTeamCode(null)).toBeFalse();
    });
  });

  describe('isValidTeamCode() - Undefined', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should return false for undefined', () => {
      expect(service.isValidTeamCode(undefined)).toBeFalse();
    });
  });

  describe('isValidTeamCode() - Valid Strings', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should return true for simple alphanumeric string', () => {
      expect(service.isValidTeamCode('ABC123')).toBeTrue();
    });

    it('should return true for the default supervisor code', () => {
      expect(service.isValidTeamCode(DEFAULT_SUPERVISOR_CODE)).toBeTrue();
    });

    it('should return true for the default gestor code', () => {
      expect(service.isValidTeamCode(DEFAULT_GESTOR_CODE)).toBeTrue();
    });

    it('should return true for the default diretor code', () => {
      expect(service.isValidTeamCode(DEFAULT_DIRETOR_CODE)).toBeTrue();
    });

    it('should return true for single character', () => {
      expect(service.isValidTeamCode('A')).toBeTrue();
    });

    it('should return true for string with leading/trailing spaces (content is valid)', () => {
      expect(service.isValidTeamCode('  ABC123  ')).toBeTrue();
    });

    it('should return true for string with numbers only', () => {
      expect(service.isValidTeamCode('12345')).toBeTrue();
    });

    it('should return true for string with special characters', () => {
      expect(service.isValidTeamCode('ABC-123_XYZ')).toBeTrue();
    });

    it('should return true for long string', () => {
      expect(service.isValidTeamCode('a'.repeat(100))).toBeTrue();
    });

    it('should return true for string with unicode characters', () => {
      expect(service.isValidTeamCode('équipe123')).toBeTrue();
    });

    it('should return true for mixed case string', () => {
      expect(service.isValidTeamCode('AbCdEf')).toBeTrue();
    });
  });

  describe('isValidTeamCode() - Type Safety', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should return false for number type', () => {
      expect(service.isValidTeamCode(123 as any)).toBeFalse();
    });

    it('should return false for object type', () => {
      expect(service.isValidTeamCode({} as any)).toBeFalse();
    });

    it('should return false for array type', () => {
      expect(service.isValidTeamCode([] as any)).toBeFalse();
    });

    it('should return false for boolean true', () => {
      expect(service.isValidTeamCode(true as any)).toBeFalse();
    });

    it('should return false for boolean false', () => {
      expect(service.isValidTeamCode(false as any)).toBeFalse();
    });

    it('should return false for function type', () => {
      expect(service.isValidTeamCode((() => {}) as any)).toBeFalse();
    });

    it('should return false for NaN', () => {
      expect(service.isValidTeamCode(NaN as any)).toBeFalse();
    });

    it('should return false for zero', () => {
      expect(service.isValidTeamCode(0 as any)).toBeFalse();
    });
  });

  describe('Default Values Consistency', () => {
    let service: TeamCodeService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [TeamCodeService]
      });
      service = TestBed.inject(TeamCodeService);
    });

    it('should have all three default codes as non-empty strings', () => {
      const codes = service.getTeamCodes();
      
      expect(typeof codes.supervisor).toBe('string');
      expect(typeof codes.gestor).toBe('string');
      expect(typeof codes.diretor).toBe('string');
      
      expect(codes.supervisor.length).toBeGreaterThan(0);
      expect(codes.gestor.length).toBeGreaterThan(0);
      expect(codes.diretor.length).toBeGreaterThan(0);
    });

    it('should have unique default codes for each role', () => {
      const codes = service.getTeamCodes();
      
      expect(codes.supervisor).not.toBe(codes.gestor);
      expect(codes.supervisor).not.toBe(codes.diretor);
      expect(codes.gestor).not.toBe(codes.diretor);
    });

    it('should return valid team codes for all defaults', () => {
      const codes = service.getTeamCodes();
      
      expect(service.isValidTeamCode(codes.supervisor)).toBeTrue();
      expect(service.isValidTeamCode(codes.gestor)).toBeTrue();
      expect(service.isValidTeamCode(codes.diretor)).toBeTrue();
    });
  });
});
