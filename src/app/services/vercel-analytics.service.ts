import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { inject } from '@vercel/analytics';
import { environment } from '../../environments/environment';

/**
 * Service to initialize Vercel Analytics
 * This service handles the initialization of Vercel Analytics for tracking page views and visitors
 * Uses the official @vercel/analytics package inject() function
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
   * Uses the official inject() function from @vercel/analytics package
   */
  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    // Only initialize in production or if analytics is explicitly enabled
    if (!environment.production && !environment.enableAnalytics) {
      console.log('📊 Vercel Analytics skipped (development mode)');
      return;
    }

    try {
      // Use the official inject function from @vercel/analytics
      inject({
        mode: environment.production ? 'production' : 'development',
        debug: !environment.production
      });
      
      this.initialized = true;
      console.log('✅ Vercel Analytics initialized successfully', {
        mode: environment.production ? 'production' : 'development',
        debug: !environment.production
      });
    } catch (error) {
      console.error('❌ Error initializing Vercel Analytics:', error);
    }
  }
}
