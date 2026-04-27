import {Injectable} from '@angular/core';
import {
    HttpClient,
    HttpErrorResponse,
    HttpEvent,
    HttpHandler,
    HttpHeaders,
    HttpInterceptor,
    HttpRequest
} from '@angular/common/http';
import {concatMap, from, Observable, share, tap, throwError} from 'rxjs';
import {catchError} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {SessaoProvider} from './sessao/sessao.provider';
import {Router} from "@angular/router";
import {jwtDecode} from "jwt-decode";
import moment from "moment";
import {LoginResponse} from "@providers/auth/auth.provider";
import {joinApiPath} from "../../environments/backend-url";

/** Backend Game4U / utilitários: não exigem sessão BWA no interceptor. */
const WHITELISTED_URLS = [
    '/auth/login',
    '/auth/refresh',
    '/client/system-params',
    '/campaign/current',
    '/campaign',
    'integrador-n8n.grupo4u.com.br' // Whitelist help button webhook (external, no auth needed)
]

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    private refreshChain?: Observable<HttpRequest<any>>;

    constructor(
        private http: HttpClient,
        private sessao: SessaoProvider,
        private router: Router,
    ) {
    }

    private headersToObject(headers: HttpHeaders): { [name: string]: string } {
        const obj: { [name: string]: string } = {};
        headers.keys().forEach(key => {
            const value = headers.get(key);
            if (value !== null) obj[key] = value;
        });
        return obj;
    }

    /**
     * Pedidos à mesma origem que `backend_url_base` (Game4U): login/refresh sem sessão;
     * com sessão, anexar Bearer sem duplicar o ramo genérico que força `client_id`.
     */
    private isGame4uBackendRequestUrl(requestUrl: string): boolean {
        const base = (environment.backend_url_base || '').trim();
        if (!base) {
            return false;
        }
        try {
            const resolvedBase = base.startsWith('http') ? base : `https://${base}`;
            const b = new URL(resolvedBase);
            const u = new URL(requestUrl);
            return u.origin === b.origin;
        } catch {
            return false;
        }
    }

    private isGamificacaoApiKeyRequest(request: HttpRequest<unknown>): boolean {
        if (!request.headers.has('x-api-token')) {
            return false;
        }
        const configured = environment.gamificacaoApiUrl?.trim();
        if (!configured) {
            return false;
        }
        try {
            const reqUrl = new URL(request.url);
            const base = new URL(configured);
            if (reqUrl.origin !== base.origin) {
                return false;
            }
            const norm = (pathname: string) => {
                const p = pathname.replace(/\/$/, '') || '/';
                return p;
            };
            const basePath = norm(base.pathname);
            const reqPath = norm(reqUrl.pathname);
            return reqPath === basePath || reqPath.startsWith(basePath + '/');
        } catch {
            return false;
        }
    }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        // Safety check for request URL
        const requestUrl = request.url || '';

        if (this.isGamificacaoApiKeyRequest(request)) {
            return next.handle(request);
        }

        const isWhitelistedBackend = WHITELISTED_URLS.some(item => requestUrl.includes(item));
        const isGame4uBackend = this.isGame4uBackendRequestUrl(requestUrl);

        // Game4U ou URLs explicitamente isentas: não forçar o ramo genérico (clone completo do header set)
        if (isWhitelistedBackend || isGame4uBackend) {
            if (request.headers.has('Authorization')) {
                return next.handle(request);
            }

            const token = this.sessao.token;
            const isAuthAnonymous =
                requestUrl.includes('/auth/login') ||
                requestUrl.includes('/auth/refresh') ||
                requestUrl.includes('/auth/token');

            const extra: { [k: string]: string } = {};
            if (isGame4uBackend && environment.client_id) {
                extra['client_id'] = environment.client_id;
            }
            if (token && !isAuthAnonymous) {
                extra['Authorization'] = `Bearer ${token}`;
            }
            if (Object.keys(extra).length > 0) {
                return next.handle(
                    request.clone({
                        setHeaders: {
                            ...this.headersToObject(request.headers),
                            ...extra
                        }
                    })
                );
            }
            return next.handle(request);
        }

        let modifiedRequest = request.clone({
            setHeaders: {
                ...this.headersToObject(request.headers),
                client_id: environment.client_id!
            }
        })

        const token = this.sessao.token;
        if (!token) {
            // Only redirect if not already on login page to avoid infinite loops
            const currentUrl = this.router.url;
            if (!currentUrl.includes('/login')) {
                return from(this.router.navigate(['/login'])).pipe(
                    concatMap(() => throwError(() => "Session expired, please log in")),
                );
            }
            // If already on login page, just throw error without redirect
            return throwError(() => "Session expired, please log in");
        }

        if (this.isTokenExpired(token))
            return this.refreshToken(modifiedRequest, next);

        // Adiciona os headers à requisição
        modifiedRequest = modifiedRequest.clone({
            setHeaders: {
                ...this.headersToObject(modifiedRequest.headers),
                'Authorization': `Bearer ${token}`,
            }
        });

        return next.handle(modifiedRequest).pipe(
            catchError((error: HttpErrorResponse) => {
                return throwError(() => error);
            })
        );
    }

    private isTokenExpired(token: string): boolean {
        try {
            // Try to decode as standard JWT
            const claims = jwtDecode(token);
            if (claims.exp) {
                const expDate = moment(claims.exp * 1000);
                return expDate.diff(moment.utc(), 'minutes') < 5;
            }
            return false;
        } catch (error) {
            // Funifier tokens use GZIP compression and can't be decoded with jwtDecode
            // For Funifier tokens, we rely on the expires_in from the login response
            // which is stored in sessionStorage. Check if we have a valid session.
            console.log('Token is not a standard JWT (likely Funifier compressed token)');
            return false; // Assume not expired, let the API handle it
        }
    }

    private refreshToken(request: HttpRequest<any>, next: HttpHandler) {
        if (!this.refreshChain)
            this.refreshChain = this.http.post<HttpRequest<any>>(
                joinApiPath((environment.backend_url_base || '').trim(), '/auth/refresh'),
                {
                refresh_token: this.sessao.refreshToken
            }).pipe(
                tap(res => {
                    this.sessao.storeLoginInfo(res as unknown as LoginResponse);
                    delete this.refreshChain;
                }),
                catchError((error: HttpErrorResponse) => {
                    this.sessao.logout();
                    return throwError(() => error);
                }),
                share()
            );

        return this.refreshChain.pipe(concatMap(refreshed =>
            next.handle(request.clone({
                setHeaders: {
                    Authorization: `Bearer ${(refreshed as unknown as LoginResponse).access_token}`
                }
            }))
        ));
    }
}
