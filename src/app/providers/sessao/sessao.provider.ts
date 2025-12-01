import {Injectable} from '@angular/core';
import {Usuario} from '@model/usuario.model';
import {ROLES_LIST} from '@utils/constants';
import {AuthProvider, LoginResponse} from "@providers/auth/auth.provider";
import {Router} from "@angular/router";
import {firstValueFrom} from "rxjs";

const TKN_KEY = 'g4utkn'

@Injectable({
    providedIn: 'root',
})
export class SessaoProvider {
    private _usuario: Usuario | null = null;
    private loginResponse?: LoginResponse;

    constructor(private auth: AuthProvider, private router: Router) {
        this.loginResponse = this.getStoredLoginInfo()
    }

    public async login(email: string, password: string) {
        console.log('🔐 SessaoProvider.login called');
        const loginResponse = await this.auth.login(email, password);
        console.log('🔐 Login response received:', loginResponse);
        this.storeLoginInfo(loginResponse)
        return await this.init(true);
    }

    public async init(canActivate: boolean) {
        if (canActivate) {
            let info = await firstValueFrom(this.auth.userInfo());

            if (info) {
                await this.getUserAfterValidations(info);
            } else {
                await this.logout();
            }
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
