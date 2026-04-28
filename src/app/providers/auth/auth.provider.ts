import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from "../../../environments/environment";
import {joinApiPath} from "../../../environments/backend-url";
import {firstValueFrom, Observable} from "rxjs";
import {map} from "rxjs/operators";

@Injectable({
  providedIn: 'root',
})
export class AuthProvider {
  private apiBase(): string {
    return (environment.backend_url_base || '').trim().replace(/\/+$/, '');
  }

  constructor(private http: HttpClient) {
  }

  async login(email: string, password: string) {
    const base = this.apiBase();
    const authUrl = joinApiPath(base, '/auth/login');
    const authBody = {
      email: email.trim(),
      password
    };

    return firstValueFrom(
      this.http.post<LoginResponse>(authUrl, authBody)
    );
  }

  userInfo(): Observable<any> {
    const url = joinApiPath(this.apiBase(), '/auth/user');
    return this.http.get<any>(url).pipe(map(u => this.normalizeUserProfile(u)));
  }

  /**
   * Perfil completo (mesmo endpoint até existir rota dedicada no backend).
   */
  userInfoFull(): Observable<any> {
    return this.userInfo();
  }

  private normalizeUserProfile(u: any): any {
    if (!u || typeof u !== 'object') {
      return u;
    }
    const out = {...u};
    if (!out._id && out.id != null) {
      out._id = out.id;
    }
    if (!out.email && out._id && typeof out._id === 'string' && out._id.includes('@')) {
      out.email = out._id;
    }
    return out;
  }

  /**
   * Pedido de redefinição de senha (o backend deve expor a rota correspondente).
   */
  async requestPasswordReset(email: string) {
    const url = joinApiPath(this.apiBase(), '/auth/change-password-request');
    return firstValueFrom(this.http.post(url, { email }));
  }

  /**
   * Confirma nova senha após link do e-mail.
   * - Formato atual: `access_token` (fragmento) + opcional `client_id` (query).
   * - Legado: `user` + `token` (query).
   */
  async resetPassword(
    newPassword: string,
    recovery:
      | { accessToken: string; clientId?: string }
      | { userId: string; token: string }
  ): Promise<unknown> {
    const url = joinApiPath(this.apiBase(), '/auth/change-password');
    if ('accessToken' in recovery) {
      return firstValueFrom(
        this.http.post(url, {
          password: newPassword,
          access_token: recovery.accessToken,
          ...(recovery.clientId ? { client_id: recovery.clientId } : {}),
        })
      );
    }
    return firstValueFrom(
      this.http.post(url, {
        user: recovery.userId,
        token: recovery.token,
        password: newPassword,
      })
    );
  }
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}
