import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';

@Injectable({
  providedIn: 'root'
})
export class AdminGuardService {
  constructor(
    private sessao: SessaoProvider,
    private router: Router
  ) {}

  async canActivate(
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): Promise<boolean> {
    if (!this.sessao.usuario) {
      await this.router.navigate(['/login']);
      return false;
    }

    if (this.sessao.isAdmin()) {
      return true;
    }

    await this.router.navigate(['/sem-permissao']);
    return false;
  }
}

export const AdminGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Promise<boolean> => {
  return inject(AdminGuardService).canActivate(route, state);
};
