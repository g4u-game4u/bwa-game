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

  readonly label = 'Pontos no mês';
  readonly unit = 'pts';

  readonly helpText =
    'Pontos conquistados no mês selecionado no painel. A meta provisória soma processos pendentes e incompletos do action_log e multiplica por 3 (mesma regra das atividades); em seguida será calculada a partir das tarefas pendentes no Supabase.';

  get superTarget(): number {
    return Math.ceil(this.target * 1.5);
  }
}
