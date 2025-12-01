import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from "../../../environments/environment";
import {firstValueFrom, Observable} from "rxjs";

@Injectable({
  providedIn: 'root',
})
export class AuthProvider {
  private readonly funifierBaseUrl = 'https://service2.funifier.com';
  private readonly funifierApiKey = '68ffd888e179d46fce277c00';

  constructor(private http: HttpClient) {
  }

  async login(email: string, password: string) {
    // Use Funifier authentication
    const authBody = {
      apiKey: this.funifierApiKey,
      grant_type: 'password',
      username: email,
      password: password
    };

    return firstValueFrom(
      this.http.post<LoginResponse>(`${this.funifierBaseUrl}/v3/auth/token`, authBody)
    );
  }

  userInfo(): Observable<any> {
    // Get user info from Funifier player status
    return this.http.get(`${this.funifierBaseUrl}/v3/player/me/status`);
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
