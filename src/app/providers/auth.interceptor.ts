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

const WHITELISTED_URLS = [
    '/auth/login',
    '/auth/refresh',
    '/client/system-params',
    '/campaign/current',
    'funifier.com' // Whitelist all Funifier API calls
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

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        // Safety check for request URL
        const requestUrl = request.url || '';
        
        // Check if this is a Funifier API request by URL
        const isFunifierRequest = WHITELISTED_URLS.some(item => requestUrl.includes(item));
        
        // For Funifier requests, add Bearer token if available (but don't add client_id)
        if (isFunifierRequest) {
            const token = this.sessao.token;
            if (token && !requestUrl.includes('/auth/token')) {
                // Add Bearer token for authenticated Funifier requests
                const modifiedRequest = request.clone({
                    setHeaders: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                return next.handle(modifiedRequest);
            }
            // For login endpoint or when no token, pass through unchanged
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
            return from(this.router.navigate(['/login'])).pipe(
                concatMap(() => throwError(() => "Session expired, please log in")),
            );
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

    private isTokenExpired(token: string) {
        const claims = jwtDecode(token)
        const expDate = moment(claims.exp! * 1000);
        return expDate.diff(moment.utc(), 'minutes') < 5;
    }

    private refreshToken(request: HttpRequest<any>, next: HttpHandler) {
        if (!this.refreshChain)
            this.refreshChain = this.http.post<HttpRequest<any>>(environment.backend_url_base + '/auth/refresh', {
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
