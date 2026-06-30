import { Injectable } from '@angular/core';
import {
  formatMonthYearPtBr,
  monthKeyFromDate,
  ON_TIME_DELIVERY_GOAL_CURRENT,
  ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM,
  ON_TIME_DELIVERY_GOAL_LEGACY
} from '@app/constants/on-time-delivery-goal';
import {
  GameRulesUpdateAnnouncement,
  GameRulesUpdateAudience
} from '@model/game-rules-update.model';

const DISMISS_STORAGE_PREFIX = 'bwa-game-rules-update-dismissed:';

@Injectable({
  providedIn: 'root'
})
export class GameRulesUpdateService {
  private readonly announcements: ReadonlyArray<{
    id: string;
    effectiveFrom: string;
    build: (audience: GameRulesUpdateAudience, effectiveMonth: Date) => GameRulesUpdateAnnouncement;
  }> = [
    {
      id: 'on-time-delivery-goal-2026-07',
      effectiveFrom: ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM,
      build: (audience, effectiveMonth) => this.buildOnTimeGoalJuly2026(audience, effectiveMonth)
    }
  ];

  getVisibleAnnouncements(
    selectedMonth: Date | undefined | null,
    audience: GameRulesUpdateAudience
  ): GameRulesUpdateAnnouncement[] {
    if (!selectedMonth) {
      return [];
    }

    const monthKey = monthKeyFromDate(selectedMonth);
    const calendarMonthKey = monthKeyFromDate(new Date());
    return this.announcements
      .filter(
        item =>
          monthKey >= item.effectiveFrom &&
          calendarMonthKey >= item.effectiveFrom &&
          !this.isDismissed(item.id)
      )
      .map(item => item.build(audience, selectedMonth));
  }

  dismissAnnouncement(id: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${id}`, '1');
    } catch {
      // ignore quota / private mode
    }
  }

  isDismissed(id: string): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    try {
      return localStorage.getItem(`${DISMISS_STORAGE_PREFIX}${id}`) === '1';
    } catch {
      return false;
    }
  }

  private buildOnTimeGoalJuly2026(
    audience: GameRulesUpdateAudience,
    effectiveMonth: Date
  ): GameRulesUpdateAnnouncement {
    const effectiveMonthLabel = formatMonthYearPtBr(effectiveMonth);
    const sharedBody =
      'Buscamos excelência na experiência dos clientes: prazos cumpridos significam confiança, previsibilidade e saúde da operação. ' +
      'Atingir essa meta fortalece a conversão de pontos em moedas e o impacto positivo que entregamos todos os dias.';

    const audienceLead: Record<GameRulesUpdateAudience, string> = {
      player:
        'A partir deste mês, sua meta de entregas no prazo passa de 90% para 95%. É um passo a mais rumo à excelência na carteira que você atende.',
      collaborator:
        'A partir deste mês, a meta de entregas no prazo deste colaborador passa de 90% para 95% — um novo patamar de qualidade na carteira.',
      team:
        'A partir deste mês, a meta coletiva de entregas no prazo do time passa de 90% para 95%. Juntos, elevamos o padrão de qualidade para todos os clientes.'
    };

    return {
      id: 'on-time-delivery-goal-2026-07',
      effectiveFrom: ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM,
      title: 'Nova meta de entregas no prazo',
      body: `${audienceLead[audience]} ${sharedBody}`,
      previousValueLabel: `${ON_TIME_DELIVERY_GOAL_LEGACY}%`,
      newValueLabel: `${ON_TIME_DELIVERY_GOAL_CURRENT}%`,
      effectiveMonthLabel
    };
  }
}
