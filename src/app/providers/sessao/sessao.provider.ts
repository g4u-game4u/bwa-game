import {Injectable} from '@angular/core';
import {Usuario} from '@model/usuario.model';
import {ROLES_LIST} from '@utils/constants';
import {AuthProvider, LoginResponse} from "@providers/auth/auth.provider";
import {Router} from "@angular/router";
import {firstValueFrom, timeout, catchError, throwError} from "rxjs";
import { isLoginEmailAllowed } from '@utils/maintenance-allowlist';

const TKN_KEY = 'g4utkn'

@Injectable({
    providedIn: 'root',
})
export class SessaoProvider {
    private _usuario: Usuario | null = null;
    private loginResponse?: LoginResponse;
    private initPromise: Promise<boolean> | null = null; // Prevent concurrent init calls

    constructor(private auth: AuthProvider, private router: Router) {
        this.loginResponse = this.getStoredLoginInfo()
    }

    public async login(email: string, password: string) {
                const loginResponse = await this.auth.login(email, password);
                this.storeLoginInfo(loginResponse)
        return await this.init(true);
    }

    public async init(canActivate: boolean): Promise<boolean> {
        // If already initializing, return the existing promise to prevent concurrent calls
        if (this.initPromise) {
                        return this.initPromise;
        }

        if (canActivate) {
            // Create and store the promise
            this.initPromise = (async () => {
                try {
                    // Add timeout to prevent infinite loading (15 seconds)
                    const REQUEST_TIMEOUT = 15000;
                                        let info = await firstValueFrom(
                        this.auth.userInfo().pipe(
                            timeout(REQUEST_TIMEOUT),
                            catchError(error => {
                                                                // Re-throw to be caught by outer try-catch
                                return throwError(() => error);
                            })
                        )
                    );

                    if (info) {
                        const ok = await this.getUserAfterValidations(info);
                        return ok;
                    } else {
                                                await this.logout();
                        return false;
                    }
                } catch (error: any) {
                                        // For timeout, network errors, or authentication errors, clear token
                    if (error?.name === 'TimeoutError' || 
                        error?.message?.includes('timeout') ||
                        error?.status === 401 || 
                        error?.status === 403 ||
                        error?.status === 0) {
                                                // Clear token but don't navigate (let guard handle it)
                        this._usuario = null;
                        delete this.loginResponse;
                        sessionStorage.removeItem(TKN_KEY);
                        return false;
                    }
                    
                    // For other errors, throw to let caller handle
                    throw error;
                } finally {
                    // Clear the promise so we can retry if needed
                    this.initPromise = null;
                }
            })();

            return this.initPromise;
        }

        return canActivate;
    }

    get usuario(): Usuario | null {
        return this._usuario;
    }

    get token(): string | undefined {
        return this.loginResponse?.access_token;
    }

    get refreshToken(): string | undefined {
        return this.loginResponse?.refresh_token;
    }

    public async getUserAfterValidations(user: any): Promise<boolean> {
        if (!user) {
            await this.logout();
            return false;
        }
        
                                // Handle Funifier response format - map _id to email if email is not set
        // Funifier uses _id as the email/player identifier
        if (!user.email && user._id) {
            user.email = user._id;
        }
        
        // Map name to full_name if full_name is not set
        if (!user.full_name && user.name) {
            user.full_name = user.name;
        }

        if (!isLoginEmailAllowed(user.email)) {
            await this.logout();
            return false;
        }
        
        // Handle Funifier response format - roles might be in different places
        if (!user.roles) {
            user.roles = [];
            // Try to get role from user_role field
            if (user.user_role) {
                user.roles.push(user.user_role);
            }
            // Try to get role from extra.role field (Funifier format)
            if (user.extra?.role) {
                user.roles.push(user.extra.role);
            }
        }
        
        // Ensure roles is an array and filter out undefined/null values
        if (!Array.isArray(user.roles)) {
            user.roles = [];
        }
        user.roles = user.roles.filter((r: any) => r && typeof r === 'string');
        
        // Add default player panel access
        if (!user.roles.includes(ROLES_LIST.ACCESS_PLAYER_PANEL)) {
            user.roles.push(ROLES_LIST.ACCESS_PLAYER_PANEL);
        }
        
        // Ensure teams field is preserved from Funifier response
        // Teams can be an array of strings (team IDs) or objects with _id
        if (!user.teams) {
            user.teams = [];
        }
        // Ensure teams is an array
        if (!Array.isArray(user.teams)) {
            user.teams = [];
        }
        
                        this._usuario = user;
        return true;
                            }

    async logout() {
        this._usuario = null; // Limpar dados do usuário
        delete this.loginResponse;
        sessionStorage.removeItem(TKN_KEY);
        return this.router.navigate(['/login']);
    }

    public isAdmin() {
        return this.verifyUserProfile(ROLES_LIST.ACCESS_ADMIN_PANEL);
    }

    public isGerente() {
        return this.verifyUserProfile(ROLES_LIST.ACCESS_MANAGER_PANEL);
    }

    public isColaborador() {
        return (
            this._usuario?.roles?.length &&
            this.verifyUserProfile(ROLES_LIST.ACCESS_PLAYER_PANEL) && !this.isGerente() && !this.isAdmin()
        );
    }

    private verifyUserProfile(...rolesType: ROLES_LIST[]) {
        return this._usuario?.roles?.some((role) =>
            role && typeof role === 'string' && rolesType.some((roleType) => role.includes(roleType))
        );
    }

    public storeLoginInfo(loginResponse: LoginResponse) {
        this.loginResponse = loginResponse;
        sessionStorage.setItem(TKN_KEY, btoa(JSON.stringify(loginResponse)));
    }

    private getStoredLoginInfo() {
        try {
            const login = sessionStorage.getItem(TKN_KEY)
            if (!login)
                return null;

            return JSON.parse(atob(login));
        } catch (error) {
            sessionStorage.removeItem(TKN_KEY);
            return null;
        }
    }
}

