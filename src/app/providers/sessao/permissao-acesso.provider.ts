import {inject, Injectable} from '@angular/core';
import {ActivatedRouteSnapshot, CanActivateChildFn, CanActivateFn, Router, RouterStateSnapshot} from "@angular/router";
import {SessaoProvider} from "./sessao.provider";
import {Usuario} from "@model/usuario.model";
import { environment } from '../../../environments/environment';
import { getMaintenanceAllowedEmails, isLoginEmailAllowed } from '@utils/maintenance-allowlist';

@Injectable({
    providedIn: 'root'
})
export class PermissaoAcessoProvider {

    constructor(private sessao: SessaoProvider, private router: Router) {
    }

    async validateSSOUser() {
        // Check if user is already logged in (has token and user data)
        let user: Usuario | null = this.sessao.usuario;
        let token = this.sessao.token;
        
        // If we have a user, they're authenticated
        if (user) {
            return true;
        }
        
        // If we have a token but no user, try to initialize
        // This happens when the page is refreshed
        if (token) {
            try {
                const result = await this.sessao.init(true);
                // If init failed, token was likely invalid - clear it
                if (!result) {
                                    }
                return result;
            } catch (error: any) {
                                // If it's a timeout or network error, token is likely invalid
                if (error?.name === 'TimeoutError' || error?.message?.includes('timeout') || error?.status === 0) {
                                    }
                return false;
            }
        }
        
        // No token, no user - not authenticated
        return false;
    }

    async validaTokenAcessoValido(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        // Em modo manutenção: só usuários allowlist podem acessar /dashboard.
        // Os demais (logados ou não) são enviados para /manutencao e a sessão é limpa.
        if (environment.maintenanceMode) {
            const isAuthenticated = await this.validateSSOUser();
            setTimeout(() => window.scrollTo(0, 0));
            if (isAuthenticated) {
                return true;
            }
            await this.sessao.logout();
            await this.router.navigate(['/manutencao']);
            return false;
        }

        const canActivate = await this.validateSSOUser();
        setTimeout(() => window.scrollTo(0, 0));

        if (canActivate) {
            if (getMaintenanceAllowedEmails().length > 0) {
                const email = this.sessao.usuario?.email;
                if (!isLoginEmailAllowed(email)) {
                    await this.sessao.logout();
                    await this.router.navigate(['/manutencao']);
                    return false;
                }
            }
            return true;
        }
        await this.router.navigate(['login']);
        return false;
    }
}

export const PermissaoAcessoGeral: CanActivateChildFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> => {
    return inject(PermissaoAcessoProvider).validaTokenAcessoValido(route, state);
};

/** Guard para a rota pai (ex.: /dashboard) — bloqueia acesso antes de carregar o layout do painel (ex.: em modo manutenção). */
export const PermissaoAcessoRota: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> => {
    return inject(PermissaoAcessoProvider).validaTokenAcessoValido(route, state);
};

