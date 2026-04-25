import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, retry, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { joinApiPath } from '../../environments/backend-url';

export interface AuthCredentials {
  /** E-mail do utilizador (compatível com o nome antigo `username`). */
  username: string;
  password: string;
  /** Ignorados — mantidos para compatibilidade com chamadas antigas. */
  apiKey?: string;
  grant_type?: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FunifierApiService {
  private readonly baseUrl: string;
  private authToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(private http: HttpClient) {
    this.baseUrl = (environment.backend_url_base || '').trim().replace(/\/+$/, '');
    this.loadStoredToken();
  }

  private loadStoredToken(): void {
    const token = localStorage.getItem('funifier_token');
    const expiry = localStorage.getItem('funifier_token_expiry');

    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        this.authToken = token;
        this.tokenExpiry = expiryTime;
      } else {
        this.clearAuth();
      }
    }
  }

  /**
   * Autenticação Game4U: POST /auth/login
   */
  authenticate(credentials: AuthCredentials): Observable<AuthToken> {
    const authUrl = joinApiPath(this.baseUrl, '/auth/login');
    const body = {
      email: credentials.username.trim(),
      password: credentials.password
    };

    return this.http.post<AuthToken>(authUrl, body).pipe(
      tap(response => {
        this.authToken = response.access_token;
        const ttlSec = Number(response.expires_in);
        const ms = (Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec : 3600) * 1000;
        this.tokenExpiry = Date.now() + ms;

        localStorage.setItem('funifier_token', response.access_token);
        localStorage.setItem('funifier_token_expiry', String(this.tokenExpiry));
      }),
      catchError(this.handleError)
    );
  }

  isAuthenticated(): boolean {
    if (!this.authToken || !this.tokenExpiry) {
      return false;
    }
    return Date.now() < this.tokenExpiry;
  }

  getToken(): string | null {
    return this.authToken;
  }

  get<T>(endpoint: string, params?: any): Observable<T> {
    if (endpoint.toLowerCase().includes('aggregate')) {
      console.warn('[Game4U API] GET aggregate desativado:', endpoint);
      return of([] as unknown as T);
    }
    const headers = this.getHeaders();
    let cleanEndpoint = endpoint.startsWith('/v3/') ? endpoint.substring(4) : endpoint;
    cleanEndpoint = cleanEndpoint.startsWith('/') ? cleanEndpoint.substring(1) : cleanEndpoint;
    const url = joinApiPath(this.baseUrl, cleanEndpoint);

    return this.http.get<T>(url, { headers, params }).pipe(
      retry({ count: 2, delay: 1000 }),
      catchError(error => this.handleError(error))
    );
  }

  post<T>(endpoint: string, body: any, options?: { headers?: { [key: string]: string } }): Observable<T> {
    if (endpoint.toLowerCase().includes('aggregate')) {
      console.warn('[Game4U API] POST aggregate desativado:', endpoint);
      return of([] as unknown as T);
    }
    let headers = this.getHeaders();

    if (options?.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        headers = headers.set(key, value);
      });
    }

    let cleanEndpoint = endpoint.startsWith('/v3/') ? endpoint.substring(4) : endpoint;
    cleanEndpoint = cleanEndpoint.startsWith('/') ? cleanEndpoint.substring(1) : cleanEndpoint;
    const url = joinApiPath(this.baseUrl, cleanEndpoint);

    return this.http.post<T>(url, body, { headers }).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  put<T>(endpoint: string, body: any, options?: { headers?: { [key: string]: string } }): Observable<T> {
    let headers = this.getHeaders();

    if (options?.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        headers = headers.set(key, value);
      });
    }

    let cleanEndpoint = endpoint.startsWith('/v3/') ? endpoint.substring(4) : endpoint;
    cleanEndpoint = cleanEndpoint.startsWith('/') ? cleanEndpoint.substring(1) : cleanEndpoint;
    const url = joinApiPath(this.baseUrl, cleanEndpoint);

    return this.http.put<T>(url, body, { headers }).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  patch<T>(endpoint: string, body: any, options?: { headers?: { [key: string]: string } }): Observable<T> {
    let headers = this.getHeaders();

    if (options?.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        headers = headers.set(key, value);
      });
    }

    let cleanEndpoint = endpoint.startsWith('/v3/') ? endpoint.substring(4) : endpoint;
    cleanEndpoint = cleanEndpoint.startsWith('/') ? cleanEndpoint.substring(1) : cleanEndpoint;
    const url = joinApiPath(this.baseUrl, cleanEndpoint);

    return this.http.patch<T>(url, body, { headers }).pipe(
      retry({ count: 3, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Erro ao comunicar com o servidor de gamificação';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Erro de conexão: ${error.error.message}`;
    } else {
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

    console.error('Game4U API Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }

  clearAuth(): void {
    this.authToken = null;
    this.tokenExpiry = null;
    localStorage.removeItem('funifier_token');
    localStorage.removeItem('funifier_token_expiry');
  }
}
