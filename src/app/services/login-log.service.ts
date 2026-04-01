import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

/**
 * Service to track user login events using Vercel Analytics custom events
 * 
 * This is called client-side after a successful login API response.
 * Although server-side would be ideal for critical events like login,
 * Angular doesn't have server-side capabilities like Next.js, so we use
 * client-side tracking after confirming the login was successful.
 * 
 * Uses the global window.va function to avoid TypeScript import errors.
 */
@Injectable({
  providedIn: 'root'
})
export class LoginLogService {
  private initialized = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Track a user login event as a custom event in Vercel Analytics
   * 
   * @param email User email address
   * @param additionalData Optional additional data to track
   * @returns Promise that resolves when event is tracked (or silently fails)
   */
  async logLogin(email: string, additionalData?: Record<string, any>): Promise<void> {
    // Only track in browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Only track in production or if analytics is explicitly enabled
    if (!environment.production && !environment.enableAnalytics) {
      console.log('📝 Login event tracking skipped (development mode):', email);
      return;
    }

    try {
      // Wait a bit to ensure Vercel Analytics script is loaded
      await this.waitForVercelAnalytics();

      // Check if Vercel Analytics is available via global window.va
      const va = (window as any).va;
      if (!va || typeof va !== 'function') {
        console.warn('⚠️ Vercel Analytics not available (window.va not found)');
        return;
      }

      // Prepare event data
      // Note: According to Vercel docs, custom data values must be strings, numbers, booleans, or null
      // Nested objects are not supported
      const eventData: Record<string, string | number | boolean | null> = {
        email: email || 'unknown',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent || 'unknown',
        platform: navigator.platform || 'unknown',
        language: navigator.language || 'unknown',
        // Convert any additional data to supported types
        ...(additionalData ? this.sanitizeEventData(additionalData) : {})
      };

      // Track the login event using Vercel Analytics global function
      // Format: va('event', { name: 'eventName', data: {...} })
      va('event', {
        name: 'login',
        data: eventData
      });
      
      console.log('✅ Login event tracked in Vercel Analytics:', email);
    } catch (error) {
      // Silently fail - don't block login if tracking fails
      console.warn('⚠️ Error tracking login event (non-critical):', error);
    }
  }

  /**
   * Wait for Vercel Analytics script to load
   * Retries up to 5 times with 200ms delay between attempts
   */
  private async waitForVercelAnalytics(maxRetries: number = 5, delay: number = 200): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    for (let i = 0; i < maxRetries; i++) {
      const va = (window as any).va;
      if (va && typeof va === 'function') {
        this.initialized = true;
        return;
      }
      
      // Wait before next retry
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Sanitize event data to ensure it conforms to Vercel Analytics requirements
   * Only strings, numbers, booleans, and null are allowed
   * Nested objects are not supported
   */
  private sanitizeEventData(data: Record<string, any>): Record<string, string | number | boolean | null> {
    const sanitized: Record<string, string | number | boolean | null> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        sanitized[key] = null;
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (typeof value === 'object') {
        // Convert objects to JSON strings (Vercel doesn't support nested objects)
        sanitized[key] = JSON.stringify(value);
      } else {
        // Convert other types to strings
        sanitized[key] = String(value);
      }
    }
    
    return sanitized;
  }
}

