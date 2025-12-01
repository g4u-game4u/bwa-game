import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, tap } from 'rxjs/operators';

export interface AuthCredentials {
  apiKey: string;
  grant_type: string;
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

@Injectable({
  providedIn: 'root'
})
export class FunifierApiService {
  private readonly baseUrl = 'https://service2.funifier.com';
  private readonly apiKey = '68ffd888e179d46fce277c00';
  private readonly basicToken = 'NjhmZmQ4ODhlMTc5ZDQ2ZmNlMjc3YzAwOjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==';
  private authToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(private http: HttpClient) {
    // Load token from localStorage on service initialization
    this.loadStoredToken();
  }

  /**
   * Load stored token from localStorage
   */
  private loadStoredToken(): void {
    const token = localStorage.getItem('funifier_token');
    const expiry = localStorage.getItem('funifier_token_expiry');
    
    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        this.authToken = token;
        this.tokenExpiry = expiryTime;
      } else {
        // Token expired, clear it
        this.clearAuth();
      }
    }
  }

  /**
   * Authenticate with Funifier API using username and password
   * POST /v3/auth/token
   */
  authenticate(credentials: AuthCredentials): Observable<AuthToken> {
    const authBody = {
      apiKey: credentials.apiKey || this.apiKey,
      grant_type: credentials.grant_type || 'password',
      username: credentials.username,
      password: credentials.password
    };

    return this.http.post<AuthToken>(`${this.baseUrl}/v3/auth/token`, authBody).pipe(
      tap(response => {
        this.authToken = response.access_token;
        this.tokenExpiry = response.expires_in;
        
        // Store token and expiry in localStorage
        localStorage.setItem('funifier_token', response.access_token);
        localStorage.setItem('funifier_token_expiry', response.expires_in.toString());
        
        console.log('Funifier authentication successful');
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Check if user is authenticated and token is valid
   */
  isAuthenticated(): boolean {
    if (!this.authToken || !this.tokenExpiry) {
      return false;
    }
    
    // Check if token is expired
    return Date.now() < this.tokenExpiry;
  }

  /**
   * Get current auth token
   */
  getToken(): string | null {
    return this.authToken;
  }

  /**
   * GET request to Funifier API
   */
  get<T>(endpoint: string, params?: any): Observable<T> {
    const headers = this.getHeaders(endpoint);
    const url = `${this.baseUrl}${endpoint}`;
    
    return this.http.get<T>(url, { headers, params }).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  /**
   * POST request to Funifier API
   */
  post<T>(endpoint: string, body: any): Observable<T> {
    const headers = this.getHeaders(endpoint);
    const url = `${this.baseUrl}${endpoint}`;
    
    return this.http.post<T>(url, body, { headers }).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  /**
   * Get authorization headers for Funifier API
   * Uses Basic Auth for /database endpoints, Bearer token for others
   * Note: For player endpoints, the AuthInterceptor will add the Bearer token
   * from the session, so we don't need to add it here
   */
  private getHeaders(endpoint: string): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
      // Don't add X-Funifier-Request - Funifier blocks custom headers via CORS
      // The interceptor recognizes Funifier URLs by domain
    });

    // Check if this is a database endpoint
    const isDatabaseEndpoint = endpoint.includes('/database');

    if (isDatabaseEndpoint) {
      // Use Basic Auth for database operations
      headers = headers.set('Authorization', `Basic ${this.basicToken}`);
      console.log('Using Basic Auth for database endpoint:', endpoint);
    }
    // For non-database endpoints, the AuthInterceptor will add the Bearer token
    // from the session storage, so we don't add it here to avoid conflicts

    return headers;
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Erro ao comunicar com o servidor de gamificação';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Erro de conexão: ${error.error.message}`;
    } else {
      // Server-side error
      switch (error.status) {
        case 0:
          errorMessage = 'Erro de conexão. Verifique sua internet.';
          break;
        case 401:
          errorMessage = 'Sessão expirada. Faça login novamente.';
          break;
        case 403:
          errorMessage = 'Acesso negado.';
          break;
        case 404:
          errorMessage = 'Recurso não encontrado.';
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = 'Erro no servidor. Tente novamente mais tarde.';
          break;
        default:
          errorMessage = `Erro ${error.status}: ${error.message}`;
      }
    }

    console.error('Funifier API Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Clear stored authentication token
   */
  clearAuth(): void {
    this.authToken = null;
    this.tokenExpiry = null;
    localStorage.removeItem('funifier_token');
    localStorage.removeItem('funifier_token_expiry');
  }
}
