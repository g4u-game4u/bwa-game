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
    // Trim username to prevent spaces from breaking the Funifier profile
    const authBody = {
      apiKey: this.funifierApiKey,
      grant_type: 'password',
      username: email.trim(),
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
    // Get user info from Funifier player/me endpoint (faster than player/me/status)
    // This returns cnpj_resp, entrega, goals directly in the extra field
    // baseUrl already includes /v3/, so just use player/me
    // The interceptor will add the Bearer token from sessionStorage
    return this.http.get(`${this.funifierBaseUrl}player/me`);
  }

  /**
   * Get full player status (slower, use only when needed)
   * @deprecated Use userInfo() for faster response with essential data
   */
  userInfoFull(): Observable<any> {
    // Get full user info from Funifier player/me/status (slower)
    return this.http.get(`${this.funifierBaseUrl}player/me/status`);
  }

  async requestPasswordReset(email: string) {
    // Use Funifier's public password reset endpoint
    const apiKey = environment.funifier_api_key;
    const resetUrl = `${this.funifierBaseUrl}pub/${apiKey}/passwordreset`;
    
    return firstValueFrom(this.http.post(resetUrl, {
      email: email
    }));
  }

  async resetPassword(userId: string, token: string, newPassword: string) {
    // Use Funifier's public update password endpoint
    const apiKey = environment.funifier_api_key;
    const updateUrl = `${this.funifierBaseUrl}pub/${apiKey}/updatepassword`;
    
    return firstValueFrom(this.http.post(updateUrl, {
      user: userId,
      token: token,
      password: newPassword
    }));
  }
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}
