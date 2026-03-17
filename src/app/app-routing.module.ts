import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {MainComponent} from "@layout/main/main.component";
import {SemPermissaoComponent} from "@layout/sem-permissao/sem-permissao.component";
import {PermissaoAcessoGeral, PermissaoAcessoRota} from "@providers/sessao/permissao-acesso.provider";
import {BreveComponent} from "@layout/breve/breve.component";
import {ManutencaoComponent} from "@layout/manutencao/manutencao.component";
import { environment } from '../environments/environment';

const routes: Routes = [
  {
    path: '',
    // A decisão de acesso em manutenção é feita pelo guard (com allowlist).
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    children: [{
      path: '',
      loadChildren: () => import('./layout/login/login.module').then(m => m.LoginModule)
    }]
  },
  {
    path: 'dashboard',
    component: MainComponent,
    canActivate: [PermissaoAcessoRota],
    children: [{
      path: '',
      loadChildren: () => import('./layout/main/main.module').then(m => m.MainModule),
      canActivateChild: [PermissaoAcessoGeral]
    }]
  },
  {
    path: 'sem-permissao',
    component: SemPermissaoComponent
  },
  {
    path: 'breve',
    component: BreveComponent
  },
  {
    path: 'manutencao',
    component: ManutencaoComponent
  }
];


@NgModule({
  imports: [RouterModule.forRoot(routes, {
    // Enable scroll position restoration
    scrollPositionRestoration: 'enabled',
    // Enable anchor scrolling
    anchorScrolling: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
