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
  @Input() color: 'red' | 'yellow' | 'green' | 'gray' = 'red';
  /** Rótulo do cartão (ex.: visão equipe vs colaborador). */
  @Input() label = 'Pontos no mês';
  /** Texto do botão de ajuda; se vazio, usa o texto padrão abaixo. */
  @Input() helpDescription = '';

  readonly unit = 'pts';

  private readonly fallbackHelp =
    'Aqui você vê quantos pontos você já fez no período do filtro, comparado à meta daquele período. Só entram pontos “feitos” as atividades já concluídas; a meta é o total que estava previsto (incluindo o que ainda não foi fechado)';

  get resolvedHelpDescription(): string {
    const t = this.helpDescription?.trim();
    return t ? t : this.fallbackHelp;
  }

  get superTarget(): number {
    return Math.ceil(this.target * 1.5);
  }
}
