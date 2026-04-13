import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { SessaoProvider } from './sessao/sessao.provider';
import { buildGame4uQueryString } from '@utils/game4u-query-encode.util';

@Injectable({ providedIn: 'root' })
export class ApiProvider {
  public defaultHeaders = {
    'Content-Type': 'application/json',
  };

  constructor(private http: HttpClient, private sessao: SessaoProvider) {}

  private async chamadaApi<T>(
    path: string,
    method: string,
    headers: any = this.defaultHeaders,
    body?: any,
    params?: Object
  ): Promise<T> {
    const apiBase = String(environment.g4u_api_base || environment.backend_url_base || '').replace(/\/$/, '');
    const pathPart = path.startsWith('https') ? path : `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
    const encodedPath = encodeURI(pathPart);

    let url = encodedPath;
    let requestParams = params;

    if (
      method === 'GET' &&
      params &&
      typeof params === 'object' &&
      !Array.isArray(params) &&
      path.includes('/game/')
    ) {
      const qs = buildGame4uQueryString(params as Record<string, string | string[] | undefined | null>);
      url = qs ? `${encodedPath}?${qs}` : encodedPath;
      requestParams = undefined;
    }

    return new Promise<T>((resolve, reject) => {
      const options: any = { headers: { ...headers, ...this.defaultHeaders } };

      if (body) options.body = body;
      if (requestParams) options.params = requestParams;
      const request = this.http.request(method, url, options);

      request.subscribe({
        next: (response) => {
          resolve(<T>response);
        },
        error: (error) => {
          if (error && (error.status === 401 || error.status === 403))
            this.sessao.logout();
          reject(error);
        },
      });
    });
  }

  public async get<T>(path: string, options?: { headers?: Object, params?: Object }): Promise<T> {
    return this.chamadaApi(path, 'GET', options?.headers, undefined, options?.params);
  }

  public async put<T>(
    path: string,
    body: Object,
    headers?: Object
  ): Promise<T> {
    return this.chamadaApi(path, 'PUT', headers, body);
  }

  public async post<T>(
    path: string,
    body: Object,
    headers?: Object
  ): Promise<T> {
    return this.chamadaApi(path, 'POST', headers, body);
  }

  public async patch<T>(
    path: string,
    body: Object,
    headers?: Object
  ): Promise<T> {
    return this.chamadaApi(path, 'PATCH', headers, body);
  }
}
