import { Component } from '@angular/core';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { Router } from '@angular/router';

@Component({
  selector: 'app-manutencao',
  templateUrl: './manutencao.component.html',
  styleUrls: ['./manutencao.component.scss']
})
export class ManutencaoComponent {

  constructor(
    private sessao: SessaoProvider,
    private router: Router
  ) {}

  logout() {
    this.sessao.logout();
    this.router.navigate(['/login']);
  }
}
