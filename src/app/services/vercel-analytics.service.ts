import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Service to initialize Vercel Analytics
 * This service handles the initialization of Vercel Analytics for tracking page views and visitors
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
   */
  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      // Dynamically import and initialize Vercel Analytics
      import('@vercel/analytics').then((analytics) => {
        analytics.inject();
        this.initialized = true;
        console.log('✅ Vercel Analytics initialized');
      }).catch((error) => {
        console.error('❌ Error loading Vercel Analytics:', error);
      });
    } catch (error) {
      console.error('❌ Error initializing Vercel Analytics:', error);
    }
  }
}

