import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { parseFragmentParams } from '../../utils/url-fragment-params';

/**
 * Rota raiz (`/`): envia fluxos de redefinição de senha para `/login` com query + fragment preservados;
 * caso contrário redireciona para o dashboard (comportamento anterior).
 */
@Component({
  standalone: true,
  template: '',
})
export class RootRedirectComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {
    const tree = this.router.parseUrl(this.router.url);
    const qp = tree.queryParams as Record<string, string | undefined>;
    const fragFromTree = tree.fragment ?? '';
    const fragFromWindow =
      typeof window !== 'undefined' && window.location.hash
        ? window.location.hash.replace(/^#/, '')
        : '';
    const frag = fragFromTree || fragFromWindow;
    const hashParams = parseFragmentParams(frag);

    if (hashParams['access_token']) {
      const queryParams: Record<string, string> = {};
      if (qp['client_id'] != null && qp['client_id'] !== '') {
        queryParams['client_id'] = String(qp['client_id']);
      }
      void this.router.navigate(['/login'], {
        queryParams: Object.keys(queryParams).length ? queryParams : {},
        fragment: frag || undefined,
        replaceUrl: true,
      });
      return;
    }

    const token = qp['token'];
    const user = qp['user'];
    if (token && user) {
      void this.router.navigate(['/login'], {
        queryParams: { token: String(token), user: String(user) },
        replaceUrl: true,
      });
      return;
    }

    void this.router.navigate(['/dashboard'], { replaceUrl: true });
  }
}
