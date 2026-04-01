import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Represents the configured team codes for management roles
 */
export interface TeamCodes {
  /** Team code for Supervisão role */
  supervisor: string;
  /** Team code for Gestão role */
  gestor: string;
  /** Team code for Direção/Admin role */
  diretor: string;
}

/**
 * TeamCodeService handles team code resolution and caching.
 * 
 * This service provides a centralized way to manage team codes for management roles,
 * supporting configuration via environment variables with graceful fallback
 * to default values when no custom codes are configured or when the codes are invalid.
 * 
 * @example
 * ```typescript
 * constructor(private teamCodeService: TeamCodeService) {
 *   const codes = this.teamCodeService.getTeamCodes();
 *   const supervisorCode = this.teamCodeService.getSupervisorCode();
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class TeamCodeService {
  /**
   * Default team code for Supervisão role.
   * Used as fallback when no custom code is configured or when the code is invalid.
   */
  private readonly DEFAULT_SUPERVISOR_CODE = 'Fkmdmko';

  /**
   * Default team code for Gestão role.
   * Used as fallback when no custom code is configured or when the code is invalid.
   */
  private readonly DEFAULT_GESTOR_CODE = 'FkmdnFU';

  /**
   * Default team code for Direção/Admin role.
   * Used as fallback when no custom code is configured or when the code is invalid.
   */
  private readonly DEFAULT_DIRETOR_CODE = 'FkmdhZ9';

  /**
   * Cached resolved team codes. These are set once during service initialization
   * and remain constant throughout the application lifecycle.
   */
  private resolvedCodes: TeamCodes;

  constructor() {
    this.resolvedCodes = this.resolveTeamCodes();
  }

  /**
   * Returns all resolved team codes.
   * Returns the custom codes if configured and valid, otherwise the defaults.
   * 
   * @returns The resolved team codes object (cached value)
   */
  getTeamCodes(): TeamCodes {
    return this.resolvedCodes;
  }

  /**
   * Returns the resolved Supervisor team code.
   * 
   * @returns The Supervisor team code (cached value)
   */
  getSupervisorCode(): string {
    return this.resolvedCodes.supervisor;
  }

  /**
   * Returns the resolved Gestor team code.
   * 
   * @returns The Gestor team code (cached value)
   */
  getGestorCode(): string {
    return this.resolvedCodes.gestor;
  }

  /**
   * Returns the resolved Diretor team code.
   * 
   * @returns The Diretor team code (cached value)
   */
  getDiretorCode(): string {
    return this.resolvedCodes.diretor;
  }

  /**
   * Validates if a string is a valid team code.
   * 
   * A team code is considered valid if:
   * - It is a non-null, non-undefined string
   * - It is not empty after trimming whitespace
   * 
   * @param code - The code to validate
   * @returns true if the code is valid, false otherwise
   */
  isValidTeamCode(code: string | undefined | null): boolean {
    if (!code || typeof code !== 'string') {
      return false;
    }
    return code.trim().length > 0;
  }

  /**
   * Resolves team codes from environment configuration.
   * 
   * This method is called once during service initialization.
   * It reads team codes from the environment configuration and validates them.
   * If a configured code is valid, it returns the trimmed code.
   * Otherwise, it returns the default code for that role.
   * 
   * @returns The resolved team codes
   */
  private resolveTeamCodes(): TeamCodes {
    const envSupervisor = (environment as any).supervisorTeamCode;
    const envGestor = (environment as any).gestorTeamCode;
    const envDiretor = (environment as any).diretorTeamCode;

    return {
      supervisor: this.isValidTeamCode(envSupervisor) ? envSupervisor.trim() : this.DEFAULT_SUPERVISOR_CODE,
      gestor: this.isValidTeamCode(envGestor) ? envGestor.trim() : this.DEFAULT_GESTOR_CODE,
      diretor: this.isValidTeamCode(envDiretor) ? envDiretor.trim() : this.DEFAULT_DIRETOR_CODE
    };
  }
}
