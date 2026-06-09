import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { canAccessOrganizationHierarchyNav } from '@utils/org-hierarchy-report-role';

@Injectable({
  providedIn: 'root'
})
export class OrgHierarchyReportGuardService {
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

    if (canAccessOrganizationHierarchyNav(this.sessao.usuario.roles)) {
      return true;
    }

    await this.router.navigate(['/sem-permissao']);
    return false;
  }
}

export const OrgHierarchyReportGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Promise<boolean> => {
  return inject(OrgHierarchyReportGuardService).canActivate(route, state);
};
