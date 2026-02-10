import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

/**
 * Service to track user login events using Vercel Analytics custom events
 * Tracks login events as custom events in Vercel Analytics dashboard
 */
@Injectable({
  providedIn: 'root'
})
export class LoginLogService {
  private trackFunction: ((eventName: string, data?: any) => void) | null = null;
  private initialized = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    // Initialize track function in browser only
    if (isPlatformBrowser(this.platformId)) {
      this.initializeTrack();
    }
  }

  /**
   * Initialize the track function from @vercel/analytics
   * Uses dynamic import to avoid TypeScript errors
   */
  private async initializeTrack(): Promise<void> {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    // Only initialize in production or if analytics is explicitly enabled
    if (!environment.production && !environment.enableAnalytics) {
      return;
    }

    try {
      // Dynamically import track from @vercel/analytics
      const analytics = await import('@vercel/analytics');
      
      if (analytics && typeof analytics.track === 'function') {
        this.trackFunction = analytics.track;
        this.initialized = true;
        console.log('✅ Vercel Analytics track initialized');
      } else {
        console.warn('⚠️ Vercel Analytics track function not available');
      }
    } catch (error) {
      // Silently fail - don't block login if analytics fails
      console.warn('⚠️ Failed to initialize Vercel Analytics track (non-critical):', error);
    }
  }

  /**
   * Track a user login event as a custom event in Vercel Analytics
   * 
   * This is called client-side after a successful login API response.
   * Although server-side would be ideal for critical events like login,
   * Angular doesn't have server-side capabilities like Next.js, so we use
   * client-side tracking after confirming the login was successful.
   * 
   * @param email User email address
   * @param additionalData Optional additional data to track
   * @returns Promise that resolves when event is tracked (or silently fails)
   */
  async logLogin(email: string, additionalData?: Record<string, any>): Promise<void> {
    // Ensure track is initialized
    if (!this.initialized && isPlatformBrowser(this.platformId)) {
      await this.initializeTrack();
    }

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
      // Retry initialization if track function is not available
      if (!this.trackFunction) {
        console.warn('⚠️ Vercel Analytics track not available, retrying initialization...');
        await this.initializeTrack();
        
        if (!this.trackFunction) {
          console.warn('⚠️ Vercel Analytics track still not available after retry');
          return;
        }
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

      // Track the login event
      // This is a critical event, so we call it after successful API response
      this.trackFunction('login', eventData);
      
      console.log('✅ Login event tracked in Vercel Analytics:', email);
    } catch (error) {
      // Silently fail - don't block login if tracking fails
      console.warn('⚠️ Error tracking login event (non-critical):', error);
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

