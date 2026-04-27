import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'c4u-monthly-points-goal-progress',
  templateUrl: './c4u-monthly-points-goal-progress.component.html',
  styleUrls: ['./c4u-monthly-points-goal-progress.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uMonthlyPointsGoalProgressComponent {
  @Input() current = 0;
  @Input() target = 1;
  @Input() isLoading = false;
  @Input() color: 'red' | 'yellow' | 'green' | 'pink' = 'red';
  /** Rótulo do cartão (ex.: visão equipe vs colaborador). */
  @Input() label = 'Pontos no mês';
  /** Texto do botão de ajuda; se vazio, usa o texto padrão abaixo. */
  @Input() helpDescription = '';

  readonly unit = 'pts';

  private readonly fallbackHelp =
    'Atingido: pontos de user-actions em status DONE no período do filtro. Meta: soma dos pontos de user-actions em todos os status no mesmo período (dados Game4U). Sem integração Game4U, a meta provisória usa processos pendentes/incompletos do action_log × 3.';

  get resolvedHelpDescription(): string {
    const t = this.helpDescription?.trim();
    return t ? t : this.fallbackHelp;
  }

  get superTarget(): number {
    return Math.ceil(this.target * 1.5);
  }
}
