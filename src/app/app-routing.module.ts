import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {MainComponent} from "@layout/main/main.component";
import {SemPermissaoComponent} from "@layout/sem-permissao/sem-permissao.component";
import {PermissaoAcessoGeral} from "@providers/sessao/permissao-acesso.provider";
import {BreveComponent} from "@layout/breve/breve.component";

const routes: Routes = [
  {
    path: '',
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
