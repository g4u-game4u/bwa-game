import {Injectable} from '@angular/core';
import {Usuario} from '@model/usuario.model';
import {ROLES_LIST} from '@utils/constants';
import { extractGame4uUserIdFromUserPayload, looksLikeEmail } from '@utils/game4u-user-id.util';
import {AuthProvider, LoginResponse} from "@providers/auth/auth.provider";
import {Router} from "@angular/router";
import {firstValueFrom, timeout, catchError, throwError} from "rxjs";

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
                                console.error('🔐 Error fetching user info:', error);
                                // Re-throw to be caught by outer try-catch
                                return throwError(() => error);
                            })
                        )
                    );

                    if (info) {
                        await this.getUserAfterValidations(info);
                        return true;
                    } else {
                        console.warn('🔐 User info is null or undefined');
                        await this.logout();
                        return false;
                    }
                } catch (error: any) {
                    console.error('🔐 Failed to initialize session:', error);
                    
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

    public async getUserAfterValidations(user: any) {
        if (!user) {
            await this.logout();
            return;
        }
        // Game4U GET /auth/user: desembrulhar e alinhar campos ao modelo Usuario
        const dataObj =
            user.data && typeof user.data === 'object' && !Array.isArray(user.data) ? user.data : null;
        if (dataObj) {
            user = { ...user, ...dataObj };
            if (dataObj.user && typeof dataObj.user === 'object' && !Array.isArray(dataObj.user)) {
                user = { ...user, ...dataObj.user };
            }
        }
        if (user.user && typeof user.user === 'object') {
            user = { ...user, ...user.user };
        }
        if (typeof user.roles === 'string' && user.roles.trim()) {
            user.roles = [user.roles.trim()];
        }
        if (user.id != null && user._id == null) {
            user._id = String(user.id);
        }
        if ((!user.teams || !Array.isArray(user.teams) || user.teams.length === 0) && user.team_id != null) {
            user.teams = [user.team_id];
        }
        // Funifier legado: `_id` pode ser o e-mail. Não copiar UUID/object id para `email`
        // (GET `/game/actions?user=` exige e-mail real).
        if (!user.email && user._id != null) {
            const idStr = String(user._id).trim();
            if (looksLikeEmail(idStr)) {
                user.email = idStr;
            }
        }
        
        // Map name to full_name if full_name is not set
        if (!user.full_name && user.name) {
            user.full_name = user.name;
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
        const g4uId = extractGame4uUserIdFromUserPayload(user, this.loginResponse?.access_token);
        if (g4uId) {
            user.user_id = g4uId;
            if (user.id == null) {
                user.id = g4uId;
            }
        }
        this._usuario = user;
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
