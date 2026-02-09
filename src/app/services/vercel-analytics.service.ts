import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { inject } from '@vercel/analytics';

/**
 * Service to initialize Vercel Analytics
 * This service handles the initialization of Vercel Analytics for tracking page views and visitors
 * Uses the @vercel/analytics package for proper integration
 */
@Injectable({
  providedIn: 'root'
})
export class VercelAnalyticsService {
  private initialized = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Initialize Vercel Analytics
   * Only runs in the browser (not during SSR)
   * Uses the inject function from @vercel/analytics package
   */
  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      // Initialize Vercel Analytics using the inject function
      inject();
      this.initialized = true;
      console.log('✅ Vercel Analytics initialized');
    } catch (error) {
      console.error('❌ Error initializing Vercel Analytics:', error);
    }
  }
}

