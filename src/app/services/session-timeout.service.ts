import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const SESSION_LOGIN_TIMESTAMP_KEY = 'session_login_timestamp';
const SESSION_MAX_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

/**
 * Service to manage session timeout.
 * 
 * After 12 hours of being logged in, the user will be prompted
 * to re-login to ensure fresh data and security.
 */
@Injectable({
  providedIn: 'root'
})
export class SessionTimeoutService {
  private checkSubscription: Subscription | null = null;
  private destroy$ = new Subject<void>();
  
  /** Emits when session has expired */
  public sessionExpired$ = new Subject<void>();

  constructor(
    private router: Router,
    private ngZone: NgZone
  ) {}

  /**
   * Start session tracking when user logs in.
   * Records the login timestamp and starts the timeout checker.
   */
  startSession(): void {
    const now = Date.now();
    localStorage.setItem(SESSION_LOGIN_TIMESTAMP_KEY, now.toString());
    console.log('🕐 Session started at:', new Date(now).toISOString());
    
    this.startTimeoutChecker();
  }

  /**
   * End session tracking when user logs out.
   */
  endSession(): void {
    localStorage.removeItem(SESSION_LOGIN_TIMESTAMP_KEY);
    this.stopTimeoutChecker();
    console.log('🕐 Session ended');
  }

  /**
   * Check if the current session has expired.
   */
  isSessionExpired(): boolean {
    const loginTimestamp = this.getLoginTimestamp();
    if (!loginTimestamp) {
      return false; // No session to expire
    }
    
    const elapsed = Date.now() - loginTimestamp;
    return elapsed >= SESSION_MAX_DURATION_MS;
  }

  /**
   * Get remaining session time in milliseconds.
   */
  getRemainingTime(): number {
    const loginTimestamp = this.getLoginTimestamp();
    if (!loginTimestamp) {
      return 0;
    }
    
    const elapsed = Date.now() - loginTimestamp;
    const remaining = SESSION_MAX_DURATION_MS - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Get remaining session time formatted as HH:MM.
   */
  getRemainingTimeFormatted(): string {
    const remaining = this.getRemainingTime();
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Initialize the service - call this on app startup.
   * Checks if there's an existing session and starts monitoring.
   */
  initialize(): void {
    const loginTimestamp = this.getLoginTimestamp();
    if (loginTimestamp) {
      // There's an existing session, check if it's expired
      if (this.isSessionExpired()) {
        console.log('🕐 Session expired on app load');
        this.handleSessionExpired();
      } else {
        // Resume monitoring
        this.startTimeoutChecker();
        console.log('🕐 Resuming session monitoring, remaining:', this.getRemainingTimeFormatted());
      }
    }
  }

  private getLoginTimestamp(): number | null {
    const stored = localStorage.getItem(SESSION_LOGIN_TIMESTAMP_KEY);
    if (!stored) {
      return null;
    }
    
    const timestamp = parseInt(stored, 10);
    return isNaN(timestamp) ? null : timestamp;
  }

  private startTimeoutChecker(): void {
    this.stopTimeoutChecker(); // Clear any existing checker
    
    // Run outside Angular zone to avoid triggering change detection
    this.ngZone.runOutsideAngular(() => {
      this.checkSubscription = interval(CHECK_INTERVAL_MS)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          if (this.isSessionExpired()) {
            this.ngZone.run(() => {
              this.handleSessionExpired();
            });
          }
        });
    });
  }

  private stopTimeoutChecker(): void {
    if (this.checkSubscription) {
      this.checkSubscription.unsubscribe();
      this.checkSubscription = null;
    }
  }

  private handleSessionExpired(): void {
    console.log('🕐 Session expired - requiring re-login');
    this.sessionExpired$.next();
    this.endSession();
    
    // Navigate to login with a message
    this.router.navigate(['/login'], {
      queryParams: { reason: 'session_expired' }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopTimeoutChecker();
  }
}
