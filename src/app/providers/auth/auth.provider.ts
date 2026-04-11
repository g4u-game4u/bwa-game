import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from "../../../environments/environment";
import {firstValueFrom, Observable, of} from "rxjs";
import { FUNIFIER_HTTP_DISABLED } from "../../config/funifier-requests-disabled";

@Injectable({
  providedIn: 'root',
})
export class AuthProvider {
  private readonly funifierBaseUrl = environment.funifier_base_url || 'https://service2.funifier.com/v3/';
  private readonly g4uApiBase = environment.g4u_api_base || environment.backend_url_base;

  constructor(private http: HttpClient) {
  }

  /**
   * Login na API Game4U (POST /auth/login em `G4U_API_BASE`, com fallback para `BACKEND_URL_BASE`).
   */
  async login(email: string, password: string) {
    const base = String(this.g4uApiBase || '').replace(/\/+$/, '');
    const authUrl = `${base}/auth/login`;
    return firstValueFrom(
      this.http.post<LoginResponse>(
        authUrl,
        { email: email.trim(), password },
        { headers: { client_id: environment.client_id } }
      )
    );
  }

  userInfo(): Observable<any> {
    if (FUNIFIER_HTTP_DISABLED) {
      console.warn('[AuthProvider] userInfo Funifier bloqueado (refatoração)');
      return of({});
    }
    return this.http.get(`${this.funifierBaseUrl}player/me`);
  }

  /**
   * Get full player status (slower, use only when needed)
   * @deprecated Use userInfo() for faster response with essential data
   */
  userInfoFull(): Observable<any> {
    if (FUNIFIER_HTTP_DISABLED) {
      return of({});
    }
    return this.http.get(`${this.funifierBaseUrl}player/me/status`);
  }

  async requestPasswordReset(email: string) {
    return firstValueFrom(this.http.post(`${environment.backend_url_base}/auth/password-reset/request`, {
      email: email
    }));
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    return firstValueFrom(this.http.post(`${environment.backend_url_base}/auth/password-reset/confirm`, {
      email: email,
      code: code,
      new_password: newPassword
    }));
  }
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}
