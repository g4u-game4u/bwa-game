import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from "../../../environments/environment";
import {firstValueFrom, Observable} from "rxjs";

@Injectable({
  providedIn: 'root',
})
export class AuthProvider {
  private readonly funifierBaseUrl = environment.funifier_base_url || 'https://service2.funifier.com/v3/';
  private readonly funifierApiKey = environment.funifier_api_key;

  constructor(private http: HttpClient) {
  }

  async login(email: string, password: string) {
    console.log('🔐 AuthProvider.login called');
    // baseUrl already includes /v3/, so just use auth/token
    const authUrl = `${this.funifierBaseUrl}auth/token`;
    console.log('🔐 Funifier URL:', authUrl);
    console.log('🔐 API Key:', this.funifierApiKey);
    console.log('🔐 Username:', email);
    
    // Use Funifier authentication
    const authBody = {
      apiKey: this.funifierApiKey,
      grant_type: 'password',
      username: email,
      password: password
    };

    console.log('🔐 Making POST request to Funifier...');
    
    // Don't add custom headers - Funifier blocks them via CORS
    // The interceptor will recognize Funifier URLs by domain
    return firstValueFrom(
      this.http.post<LoginResponse>(authUrl, authBody)
    );
  }

  userInfo(): Observable<any> {
    // Get user info from Funifier player status
    // baseUrl already includes /v3/, so just use player/me/status
    // The interceptor will add the Bearer token from sessionStorage
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
