import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

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

    // Only initialize in production or if analytics is explicitly enabled
    if (!environment.production && !environment.enableAnalytics) {
      console.log('📊 Vercel Analytics skipped (development mode)');
      return;
    }

    try {
      // Check if script already exists
      if (document.querySelector('script[data-vercel-analytics]')) {
        this.initialized = true;
        console.log('✅ Vercel Analytics already initialized');
        return;
      }

      // Use production script in production, debug script in development
      const scriptUrl = environment.production 
        ? 'https://va.vercel-scripts.com/v1/script.js'
        : 'https://va.vercel-scripts.com/v1/script.debug.js';

      // Create and inject the Vercel Analytics script
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.setAttribute('data-vercel-analytics', 'true');
      script.defer = true;
      script.async = true;
      
      script.onload = () => {
        this.initialized = true;
        console.log('✅ Vercel Analytics initialized successfully', {
          url: scriptUrl,
          production: environment.production
        });
        
        // Verify script loaded correctly
        if (window && (window as any).va) {
          console.log('✅ Vercel Analytics script verified');
        }
      };
      
      script.onerror = (error) => {
        console.error('❌ Error loading Vercel Analytics script:', {
          error,
          url: scriptUrl,
          production: environment.production
        });
      };

      document.head.appendChild(script);
      console.log('📊 Vercel Analytics script injected:', scriptUrl);
    } catch (error) {
      console.error('❌ Error initializing Vercel Analytics:', error);
    }
  }
}

