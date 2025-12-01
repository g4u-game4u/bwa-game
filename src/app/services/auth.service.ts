import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { FunifierApiService, AuthCredentials, AuthToken } from './funifier-api.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<string | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private funifierApi: FunifierApiService) {
    // Check if user is already authenticated
    const storedUser = localStorage.getItem('funifier_user');
    if (storedUser && this.funifierApi.isAuthenticated()) {
      this.currentUserSubject.next(storedUser);
    }
  }

  /**
   * Login with username and password
   */
  login(username: string, password: string): Observable<AuthToken> {
    const credentials: AuthCredentials = {
      apiKey: '68ffd888e179d46fce277c00',
      grant_type: 'password',
      username,
      password
    };

    return this.funifierApi.authenticate(credentials).pipe(
      tap(response => {
        // Store username
        localStorage.setItem('funifier_user', username);
        this.currentUserSubject.next(username);
      })
    );
  }

  /**
   * Logout user
   */
  logout(): void {
    this.funifierApi.clearAuth();
    localStorage.removeItem('funifier_user');
    this.currentUserSubject.next(null);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.funifierApi.isAuthenticated();
  }

  /**
   * Get current username
   */
  getCurrentUser(): string | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get current user as observable
   */
  getCurrentUser$(): Observable<string | null> {
    return this.currentUser$;
  }

  /**
   * Check if user is logged in (synchronous)
   */
  isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null && this.isAuthenticated();
  }
}
