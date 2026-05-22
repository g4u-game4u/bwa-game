import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

/**
 * Service to initialize Vercel Analytics
 * Currently disabled to avoid false positive security warnings from Vercel scanner
 * Can be re-enabled when Vercel provides a truly framework-agnostic analytics package
 */
@Injectable({
  providedIn: 'root'
})
export class VercelAnalyticsService {
  private initialized = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Initialize Vercel Analytics
   * Currently disabled to avoid false positive security warnings
   */
  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    // Only initialize in production or if analytics is explicitly enabled
    if (!environment.production && !environment.enableAnalytics) {
      return;
    }

    try {
      // Analytics disabled to avoid Vercel false positive security warnings
      // Vercel's scanner detects optional peer dependencies (Next.js) even when not installed
      console.log('ℹ️ Vercel Analytics disabled to avoid false positive security warnings');
      
      this.initialized = true;
    } catch (error) {
      console.error('❌ Error initializing Vercel Analytics:', error);
    }
  }
}
