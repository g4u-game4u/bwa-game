import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { environment } from '../../environments/environment';

/**
 * Service to initialize Vercel Speed Insights
 * This service handles the initialization of Vercel Speed Insights for tracking page performance
 * Uses the official @vercel/speed-insights package (framework-agnostic, no React/Next.js dependencies)
 */
@Injectable({
  providedIn: 'root'
})
export class VercelAnalyticsService {
  private initialized = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Initialize Vercel Speed Insights
   * Only runs in the browser (not during SSR)
   * Uses the official injectSpeedInsights() function from @vercel/speed-insights package
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
      // Use the official injectSpeedInsights function from @vercel/speed-insights
      injectSpeedInsights({
        framework: 'angular',
        debug: !environment.production
      });
      
      this.initialized = true;
    } catch (error) {
      console.error('❌ Error initializing Vercel Speed Insights:', error);
    }
  }
}
