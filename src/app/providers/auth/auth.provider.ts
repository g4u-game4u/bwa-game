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

  private apiBase(): string {
    return String(this.g4uApiBase || '').replace(/\/+$/, '');
  }

  private apiHeaders(): { client_id: string } {
    return { client_id: environment.client_id };
  }

  /**
   * Login na API Game4U (POST /auth/login em `G4U_API_BASE`, com fallback para `BACKEND_URL_BASE`).
   */
  async login(email: string, password: string) {
    const authUrl = `${this.apiBase()}/auth/login`;
    return firstValueFrom(
      this.http.post<LoginResponse>(
        authUrl,
        { email: email.trim(), password },
        { headers: this.apiHeaders() }
      )
    );
  }

  /**
   * Perfil do utilizador autenticado.
   * Com Funifier desligado, usa GET `/auth/user` na mesma base do login (roles, times, email).
   */
  userInfo(): Observable<any> {
    if (FUNIFIER_HTTP_DISABLED) {
      return this.http.get<any>(`${this.apiBase()}/auth/user`);
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

  private passwordResetRedirectUrl(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}/login`;
  }

  async requestPasswordReset(email: string) {
    return firstValueFrom(
      this.http.post(
        `${this.apiBase()}/auth/change-password-request`,
        {
          email: email.trim(),
          redirect_to: this.passwordResetRedirectUrl(),
        },
        { headers: this.apiHeaders() },
      ),
    );
  }

  async changePasswordRecovery(accessToken: string, newPassword: string) {
    return firstValueFrom(
      this.http.post<{ message: string }>(
        `${this.apiBase()}/auth/change-password-recovery`,
        {
          access_token: accessToken.trim(),
          password: newPassword,
        },
        { headers: this.apiHeaders() },
      ),
    );
  }

  /**
   * Conclui cadastro de convite (POST /auth/change-password-recovery com flow=invite).
   */
  async completeInviteFromRecovery(params: {
    accessToken: string;
    fullName: string;
    password: string;
  }) {
    return firstValueFrom(
      this.http.post<{ message: string }>(
        `${this.apiBase()}/auth/change-password-recovery`,
        {
          access_token: params.accessToken.trim(),
          password: params.password,
          full_name: params.fullName.trim(),
          flow: 'invite',
        },
        { headers: this.apiHeaders() },
      ),
    );
  }
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}
