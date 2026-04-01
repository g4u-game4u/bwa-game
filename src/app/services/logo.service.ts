import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * LogoService handles logo URL resolution and caching.
 * 
 * This service provides a centralized way to manage the application logo,
 * supporting configuration via environment variables with graceful fallback
 * to the default logo when no custom logo is configured or when the URL is invalid.
 * 
 * @example
 * ```typescript
 * constructor(private logoService: LogoService) {
 *   const logoUrl = this.logoService.getLogoUrl();
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class LogoService {
  /**
   * The default logo URL used as fallback when no custom logo is configured
   * or when the custom logo URL is invalid.
   */
  private readonly DEFAULT_LOGO_URL = '/assets/images/logo-bwa-white-inteira-full.png';

  /**
   * Cached resolved logo URL. This is set once during service initialization
   * and remains constant throughout the application lifecycle.
   */
  private resolvedLogoUrl: string;

  constructor() {
    this.resolvedLogoUrl = this.resolveLogoUrl();
  }

  /**
   * Returns the resolved logo URL.
   * Returns the custom logo URL if configured and valid, otherwise the default logo.
   * 
   * @returns The resolved logo URL (cached value)
   */
  getLogoUrl(): string {
    return this.resolvedLogoUrl;
  }

  /**
   * Returns the default logo URL for fallback scenarios.
   * Use this method when the custom logo fails to load.
   * 
   * @returns The default logo URL
   */
  getDefaultLogoUrl(): string {
    return this.DEFAULT_LOGO_URL;
  }

  /**
   * Validates if a URL is a valid format for a logo.
   * 
   * A URL is considered valid if:
   * - It is a non-empty string after trimming
   * - It is either a relative path starting with '/' or a valid absolute URL
   * 
   * @param url - The URL to validate
   * @returns true if the URL is valid, false otherwise
   */
  isValidLogoUrl(url: string | undefined | null): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    const trimmed = url.trim();
    
    if (trimmed === '') {
      return false;
    }
    
    // Accept relative paths starting with /
    if (trimmed.startsWith('/')) {
      return true;
    }
    
    // Validate absolute URLs
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves the logo URL from environment configuration.
   * 
   * This method is called once during service initialization.
   * It reads the logoUrl from the environment configuration and validates it.
   * If the configured URL is valid, it returns the trimmed URL.
   * Otherwise, it returns the default logo URL.
   * 
   * @returns The resolved logo URL
   */
  private resolveLogoUrl(): string {
    const configuredUrl = (environment as any).logoUrl;
    return this.isValidLogoUrl(configuredUrl) ? configuredUrl!.trim() : this.DEFAULT_LOGO_URL;
  }
}
