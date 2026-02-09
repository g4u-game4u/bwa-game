import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Service to initialize Vercel Analytics
 * This service handles the initialization of Vercel Analytics for tracking page views and visitors
 * Uses the script-based approach which is compatible with Angular
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
   * Uses script injection approach for Angular compatibility
   */
  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      // Check if script already exists
      if (document.querySelector('script[data-vercel-analytics]')) {
        this.initialized = true;
        return;
      }

      // Create and inject the Vercel Analytics script
      const script = document.createElement('script');
      script.src = 'https://va.vercel-scripts.com/v1/script.debug.js';
      script.setAttribute('data-vercel-analytics', 'true');
      script.defer = true;
      script.async = true;
      
      script.onload = () => {
        this.initialized = true;
        console.log('✅ Vercel Analytics initialized');
      };
      
      script.onerror = (error) => {
        console.error('❌ Error loading Vercel Analytics script:', error);
      };

      document.head.appendChild(script);
    } catch (error) {
      console.error('❌ Error initializing Vercel Analytics:', error);
    }
  }
}

