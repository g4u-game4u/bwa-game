import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ActivityListItem } from '@model/gamification-dashboard.model';
import {
  DASHBOARD_INSIGHTS_DUE_SOON_DAYS,
  DASHBOARD_INSIGHTS_WEEKDAY_LABELS,
  DashboardInsightPreset,
  DashboardInsightsAudience,
  DashboardInsightsQuery,
  DashboardInsightsRankedItem,
  DashboardInsightsSnapshot,
  DashboardInsightsWeekdayStat
} from '@model/dashboard-insights.model';
import { Game4uUserActionModel, Game4uUserActionStatus, isGame4uDataEnabled } from '@model/game4u-api.model';
import {
  mapGame4uActionsToActivityList,
  parseGame4uDtPrazoToLocalDayStartMs,
  resolveGame4uFinishedPrazoStatus
} from '@services/game4u-game-mapper';
import { ActionLogService } from '@services/action-log.service';
import { Game4uApiService } from '@services/game4u-api.service';

const INSIGHTS_OPEN_STATUSES: Game4uUserActionStatus[] = ['PENDING', 'DOING'];
const INSIGHTS_FINISHED_STATUSES: Game4uUserActionStatus[] = ['DONE', 'DELIVERED', 'PAID'];

export interface BuildDashboardInsightPresetsOptions {
  audience?: DashboardInsightsAudience;
  /** Ex.: «do time», «da organização», «do colaborador selecionado». */
  scopeLabel?: string;
}

type DashboardInsightPresetMetrics = Pick<
  DashboardInsightsSnapshot,
  | 'fineRiskTasks'
  | 'fineRiskDeliveries'
  | 'overduePendingTasks'
  | 'dueSoonTasks'
  | 'dueSoonDays'
  | 'finishedTasks'
  | 'onTimeFinishedTasks'
  | 'lateFinishedTasks'
  | 'justifiedTasks'
  | 'pendingTasks'
>;

function pluralEntregas(n: number): string {
  return n === 1 ? '1 entrega' : `${n} entregas`;
}

function pluralTarefas(n: number): string {
  return n === 1 ? '1 tarefa' : `${n} tarefas`;
}

function resolveDashboardInsightScopePhrase(
  audience: DashboardInsightsAudience,
  scopeLabel: string
): string {
  const scope = (scopeLabel || '').trim();
  switch (audience) {
    case 'player':
      return 'suas entregas';
    case 'supervisor':
      if (scope.includes('colaborador')) {
        return 'as entregas do colaborador selecionado';
      }
      return scope ? `as entregas ${scope}` : 'as entregas do time';
    case 'gerente':
      return scope ? `as entregas ${scope}` : 'as entregas das supervisões';
    case 'diretor':
      return scope ? `as entregas ${scope}` : 'as entregas das gerências';
    case 'c_level':
      return scope ? `as entregas ${scope}` : 'as entregas da organização';
    default:
      return scope ? `as entregas ${scope}` : 'as entregas';
  }
}

function resolveDashboardInsightScopeLocative(scopeLabel: string): string {
  const scope = (scopeLabel || '').trim();
  switch (scope) {
    case 'do time':
      return 'no time';
    case 'da organização':
      return 'na organização';
    case 'do colaborador selecionado':
      return 'do colaborador selecionado';
    default:
      return scope || 'no escopo';
  }
}

/** Referência humana para mensagens de gestão (equipe vs colaborador). */
function resolveDashboardInsightManagementTeamRef(scopeLabel: string): string {
  return (scopeLabel || '').includes('colaborador') ? 'o colaborador responsável' : 'a equipe';
}

function buildFineRiskPreset(
  audience: DashboardInsightsAudience,
  metrics: DashboardInsightPresetMetrics,
  scopeLocative: string,
  scopeLabel: string
): DashboardInsightPreset {
  const { fineRiskTasks, fineRiskDeliveries } = metrics;
  const countLabel = pluralEntregas(fineRiskTasks);
  const deliveryHint =
    fineRiskDeliveries > 0 && fineRiskDeliveries !== fineRiskTasks
      ? ` em ${fineRiskDeliveries === 1 ? '1 cliente' : `${fineRiskDeliveries} clientes`}`
      : '';
  const teamRef = resolveDashboardInsightManagementTeamRef(scopeLabel);

  const messages: Record<DashboardInsightsAudience, string> = {
    player: `${countLabel}${deliveryHint} ${fineRiskTasks === 1 ? 'tem' : 'têm'} risco de multa. Priorize a regularização imediata antes que vire penalidade.`,
    supervisor: `Há ${countLabel}${deliveryHint} com risco de multa ${scopeLocative}. Acompanhe os responsáveis e oriente a priorização imediata com ${teamRef}.`,
    gerente: `Identificamos ${countLabel}${deliveryHint} com risco de multa ${scopeLocative}. Alinhe com ${teamRef} e os supervisores na regularização urgente; monitore a evolução diária.`,
    diretor: `${countLabel}${deliveryHint} com risco de multa ${scopeLocative}. Escalone com os gerentes responsáveis e acompanhe a mitigação nos times mais expostos.`,
    c_level: `${countLabel}${deliveryHint} com risco de multa ${scopeLocative}. Avalie o impacto financeiro em multas e acione as gerências com maior concentração de casos.`
  };

  return {
    tone: 'urgent',
    title: 'Risco de multa identificado',
    message: messages[audience]
  };
}

function buildOverduePendingPreset(
  audience: DashboardInsightsAudience,
  metrics: DashboardInsightPresetMetrics,
  scopeLocative: string
): DashboardInsightPreset {
  const { overduePendingTasks } = metrics;
  const countLabel = pluralTarefas(overduePendingTasks);

  const messages: Record<DashboardInsightsAudience, string> = {
    player: `${countLabel} ${overduePendingTasks === 1 ? 'está' : 'estão'} com prazo vencido. Reorganize o dia e trate primeiro o que já passou do limite.`,
    supervisor: `${countLabel} ${overduePendingTasks === 1 ? 'está' : 'estão'} atrasada${overduePendingTasks === 1 ? '' : 's'} ${scopeLocative}. Verifique quem concentra o atraso e apoie a redistribuição se necessário.`,
    gerente: `${countLabel} pendente${overduePendingTasks === 1 ? '' : 's'} com prazo vencido ${scopeLocative}. Acione os supervisores dos times com maior volume de atraso.`,
    diretor: `${countLabel} com prazo vencido ${scopeLocative}. Priorize conversas com gerências que concentram pendências críticas.`,
    c_level: `${countLabel} atrasada${overduePendingTasks === 1 ? '' : 's'} ${scopeLocative}. Use este sinal para avaliar gargalos operacionais e risco de multa em escala.`
  };

  return {
    tone: 'urgent',
    title: 'Pendências fora do prazo',
    message: messages[audience]
  };
}

function buildDueSoonPreset(
  audience: DashboardInsightsAudience,
  metrics: DashboardInsightPresetMetrics,
  scopeLocative: string
): DashboardInsightPreset {
  const { dueSoonTasks, dueSoonDays } = metrics;
  const countLabel = pluralTarefas(dueSoonTasks);

  const messages: Record<DashboardInsightsAudience, string> = {
    player: `${countLabel} vence${dueSoonTasks === 1 ? '' : 'm'} nos próximos ${dueSoonDays} dias. Antecipe etapas críticas para evitar atraso no fechamento.`,
    supervisor: `${countLabel} com vencimento nos próximos ${dueSoonDays} dias ${scopeLocative}. Reforce o acompanhamento diário com o time nesta semana.`,
    gerente: `${countLabel} vence${dueSoonTasks === 1 ? '' : 'm'} em até ${dueSoonDays} dias ${scopeLocative}. Garanta que as supervisões tenham capacidade para absorver o pico.`,
    diretor: `${countLabel} com prazo curto (${dueSoonDays} dias) ${scopeLocative}. Monitore gerências com maior volume de vencimentos próximos.`,
    c_level: `${countLabel} vence${dueSoonTasks === 1 ? '' : 'm'} nos próximos ${dueSoonDays} dias ${scopeLocative}. Acompanhe se há risco sistêmico de atraso no fechamento do mês.`
  };

  return {
    tone: 'warning',
    title: 'Prazos se aproximando',
    message: messages[audience]
  };
}

function buildLateFinishedPreset(
  audience: DashboardInsightsAudience,
  metrics: DashboardInsightPresetMetrics,
  scopePhrase: string,
  scopeLocative: string,
  onTimePct: number | null
): DashboardInsightPreset {
  const { lateFinishedTasks } = metrics;
  const countLabel = pluralEntregas(lateFinishedTasks);

  const messages: Record<DashboardInsightsAudience, string> = {
    player:
      lateFinishedTasks === 1
        ? '1 entrega foi concluída fora do prazo neste mês. Revise o planejamento e antecipe etapas nos próximos ciclos.'
        : `${countLabel} foram concluídas fora do prazo neste mês. Revise o planejamento e antecipe etapas nos próximos ciclos.`,
    supervisor:
      onTimePct != null
        ? `${onTimePct}% das finalizações ${scopePhrase} foram no prazo, mas ${countLabel} ficou${lateFinishedTasks === 1 ? '' : 'ram'} fora do prazo. Reforce rituais de acompanhamento com o time.`
        : `${countLabel} finalizada${lateFinishedTasks === 1 ? '' : 's'} fora do prazo ${scopeLocative}. Identifique padrões e ajuste o ritmo com os jogadores.`,
    gerente:
      onTimePct != null
        ? `Taxa de ${onTimePct}% no prazo ${scopeLocative}, com ${countLabel} fora do prazo. Oriente supervisões com pior desempenho a reequilibrar a carteira.`
        : `${countLabel} fora do prazo ${scopeLocative}. Priorize conversas com supervisões que concentram atrasos.`,
    diretor:
      onTimePct != null
        ? `${onTimePct}% no prazo ${scopeLocative}, porém ${countLabel} fora do prazo. Acione gerentes das áreas com maior incidência de atraso.`
        : `${countLabel} concluída${lateFinishedTasks === 1 ? '' : 's'} fora do prazo ${scopeLocative}. Cruze com rankings de atenção para focar correções.`,
    c_level:
      onTimePct != null
        ? `${onTimePct}% das finalizações no prazo ${scopeLocative}, com ${countLabel} atrasada${lateFinishedTasks === 1 ? '' : 's'}. Avalie se há necessidade de reforço de capacidade ou processo.`
        : `${countLabel} fora do prazo ${scopeLocative}. Use o dado para calibrar metas e investimentos operacionais.`
  };

  return {
    tone: onTimePct != null && onTimePct >= 70 ? 'warning' : 'warning',
    title: 'Oportunidade de melhoria',
    message: messages[audience]
  };
}

function buildHealthyMonthPreset(
  audience: DashboardInsightsAudience,
  metrics: DashboardInsightPresetMetrics,
  scopePhrase: string,
  scopeLocative: string,
  onTimePct: number
): DashboardInsightPreset {
  const { onTimeFinishedTasks } = metrics;

  const messages: Record<DashboardInsightsAudience, string> = {
    player:
      onTimeFinishedTasks === 1
        ? 'Sua entrega finalizada foi concluída no prazo. Mantenha o ritmo e a comunicação proativa com os clientes.'
        : `Todas as ${onTimeFinishedTasks} entregas avaliadas foram no prazo (${onTimePct}%). Mantenha o ritmo e a comunicação proativa com os clientes.`,
    supervisor: `${onTimePct}% das finalizações ${scopePhrase} foram no prazo, sem alertas críticos. Continue reforçando boas práticas com o time.`,
    gerente: `${onTimePct}% no prazo ${scopeLocative}, sem risco de multa ou pendências vencidas. Reconheça supervisões consistentes e mantenha o padrão.`,
    diretor: `${onTimePct}% de entregas no prazo ${scopeLocative}. Destaque gerências exemplares e replique boas práticas entre times.`,
    c_level: `${onTimePct}% no prazo ${scopeLocative}. Operação saudável no mês. Monitore sustentabilidade e concentração de risco residual.`
  };

  return {
    tone: 'success',
    title: 'Ritmo saudável',
    message: messages[audience]
  };
}

function buildMajorityOnTimePreset(
  audience: DashboardInsightsAudience,
  scopeLocative: string,
  onTimePct: number
): DashboardInsightPreset {
  const messages: Record<DashboardInsightsAudience, string> = {
    player: `${onTimePct}% das suas entregas avaliadas foram no prazo. Continue priorizando prazos mais apertados para elevar a consistência.`,
    supervisor: `${onTimePct}% no prazo ${scopeLocative}. Bom desempenho geral. Acompanhe os casos em aberto para proteger a taxa até o fechamento.`,
    gerente: `${onTimePct}% no prazo ${scopeLocative}. Desempenho majoritariamente positivo; reforce foco nos alertas restantes.`,
    diretor: `${onTimePct}% no prazo ${scopeLocative}. Visão favorável, com pontos de atenção pontuais a tratar com as gerências.`,
    c_level: `${onTimePct}% no prazo ${scopeLocative}. Indicador sólido no mês, com margem para reduzir riscos residuais.`
  };

  return {
    tone: 'success',
    title: 'Desempenho majoritariamente no prazo',
    message: messages[audience]
  };
}

function buildJustifiedPreset(
  audience: DashboardInsightsAudience,
  metrics: DashboardInsightPresetMetrics
): DashboardInsightPreset {
  const { justifiedTasks } = metrics;
  const countLabel = pluralEntregas(justifiedTasks);

  const messages: Record<DashboardInsightsAudience, string> = {
    player:
      justifiedTasks === 1
        ? '1 entrega com atraso justificado. Documente o contexto para referência futura.'
        : `${countLabel} com atraso justificado. Documente o contexto para referência futura.`,
    supervisor:
      justifiedTasks === 1
        ? '1 entrega justificada no time. Confirme se o contexto está registrado e se não há recorrência no mesmo cliente.'
        : `${countLabel} justificadas no escopo. Confirme se o contexto está registrado e se não há recorrência nos mesmos clientes.`,
    gerente:
      justifiedTasks === 1
        ? '1 entrega justificada no escopo. Acompanhe se a justificativa é pontual ou sinal de gargalo operacional.'
        : `${countLabel} justificadas no escopo. Acompanhe se há padrão recorrente em supervisões ou clientes específicos.`,
    diretor:
      justifiedTasks === 1
        ? '1 entrega justificada nas gerências. Valide se reflete exceção pontual ou necessidade de suporte adicional.'
        : `${countLabel} justificadas nas gerências. Valide padrões e aloque suporte onde houver recorrência.`,
    c_level:
      justifiedTasks === 1
        ? '1 entrega justificada na organização. Monitore se exceções pontuais indicam risco sistêmico de prazo.'
        : `${countLabel} justificadas na organização. Monitore concentração por área e impacto na meta de prazo.`
  };

  return {
    tone: 'info',
    title: 'Entregas justificadas',
    message: messages[audience]
  };
}

function buildFormingHistoryPreset(audience: DashboardInsightsAudience): DashboardInsightPreset {
  const messages: Record<DashboardInsightsAudience, string> = {
    player: 'Ainda não há entregas finalizadas suficientes neste mês para avaliar prazos. Foque em concluir as pendências em aberto.',
    supervisor: 'Poucas finalizações no mês para avaliar prazos do time. Acompanhe de perto as primeiras entregas do período.',
    gerente: 'Histórico de finalizações ainda limitado no escopo. Monitore as primeiras entregas do mês nas supervisões.',
    diretor: 'Volume de finalizações ainda baixo para leitura de prazos. Acompanhe evolução nas primeiras semanas do mês.',
    c_level: 'Dados de finalização ainda incipientes no mês. Reavalie indicadores quando houver volume representativo.'
  };

  return {
    tone: 'info',
    title: 'Histórico em formação',
    message: messages[audience]
  };
}

function buildCalmAlertsPreset(
  audience: DashboardInsightsAudience,
  scopeLocative: string
): DashboardInsightPreset {
  const messages: Record<DashboardInsightsAudience, string> = {
    player: 'Nenhum alerta crítico no momento. Use o resumo abaixo para manter o ritmo e antecipar entregas dos próximos dias.',
    supervisor: `Sem alertas críticos ${scopeLocative}. Use o resumo para orientar o time e antecipar gargalos.`,
    gerente: `Operação sem alertas urgentes ${scopeLocative}. Reforce previsibilidade nas supervisões até o fechamento.`,
    diretor: `Sem alertas críticos ${scopeLocative}. Aproveite para revisar desempenho por gerência nos rankings.`,
    c_level: `Sem alertas críticos ${scopeLocative}. Mantenha visão executiva sobre concentração de risco residual.`
  };

  return {
    tone: 'info',
    title: 'Sem alertas urgentes',
    message: messages[audience]
  };
}

/** Recomendações contextuais entre alertas e produtividade, por perfil de quem visualiza o painel. */
export function buildDashboardInsightPresets(
  snapshot: DashboardInsightPresetMetrics | null | undefined,
  options: BuildDashboardInsightPresetsOptions = {}
): DashboardInsightPreset[] {
  if (!snapshot) {
    return [];
  }

  const audience = options.audience ?? 'player';
  const scopeLabel = options.scopeLabel ?? '';
  const scopePhrase = resolveDashboardInsightScopePhrase(audience, scopeLabel);
  const scopeLocative = resolveDashboardInsightScopeLocative(scopeLabel);
  const presets: DashboardInsightPreset[] = [];

  const judgedFinished = snapshot.onTimeFinishedTasks + snapshot.lateFinishedTasks;
  const onTimePct =
    judgedFinished > 0
      ? Math.round((snapshot.onTimeFinishedTasks / judgedFinished) * 1000) / 10
      : null;
  const lateShare = judgedFinished > 0 ? snapshot.lateFinishedTasks / judgedFinished : 0;
  const hasCriticalAlerts =
    snapshot.fineRiskTasks > 0 || snapshot.overduePendingTasks > 0;

  if (snapshot.fineRiskTasks > 0) {
    presets.push(buildFineRiskPreset(audience, snapshot, scopeLocative, scopeLabel));
  }

  if (snapshot.overduePendingTasks > 0) {
    presets.push(buildOverduePendingPreset(audience, snapshot, scopeLocative));
  }

  if (snapshot.dueSoonTasks > 0) {
    presets.push(buildDueSoonPreset(audience, snapshot, scopeLocative));
  }

  if (
    snapshot.lateFinishedTasks > 0 &&
    (snapshot.lateFinishedTasks >= 2 || lateShare >= 0.25) &&
    snapshot.fineRiskTasks === 0
  ) {
    presets.push(buildLateFinishedPreset(audience, snapshot, scopePhrase, scopeLocative, onTimePct));
  } else if (snapshot.lateFinishedTasks === 1 && snapshot.fineRiskTasks === 0 && !hasCriticalAlerts) {
    presets.push(buildLateFinishedPreset(audience, snapshot, scopePhrase, scopeLocative, onTimePct));
  }

  if (
    judgedFinished > 0 &&
    snapshot.lateFinishedTasks === 0 &&
    !hasCriticalAlerts &&
    snapshot.dueSoonTasks === 0
  ) {
    presets.push(buildHealthyMonthPreset(audience, snapshot, scopePhrase, scopeLocative, onTimePct ?? 100));
  } else if (
    onTimePct != null &&
    onTimePct >= 80 &&
    snapshot.lateFinishedTasks > 0 &&
    snapshot.fineRiskTasks === 0 &&
    !hasCriticalAlerts
  ) {
    presets.push(buildMajorityOnTimePreset(audience, scopeLocative, onTimePct));
  }

  if (snapshot.justifiedTasks > 0) {
    presets.push(buildJustifiedPreset(audience, snapshot));
  }

  if (presets.length === 0 && judgedFinished === 0 && snapshot.justifiedTasks === 0) {
    presets.push(buildFormingHistoryPreset(audience));
  } else if (presets.length === 0 && !hasCriticalAlerts) {
    presets.push(buildCalmAlertsPreset(audience, scopeLocative));
  }

  return presets;
}

/** Snapshot a partir de user-actions já carregadas (2 pedidos por equipa: abertas + finalizadas). */
export function buildDashboardInsightsSnapshotFromUserActions(
  actions: Game4uUserActionModel[],
  month: Date
): DashboardInsightsSnapshot {
  const pendingRaw = (actions || []).filter(a => INSIGHTS_OPEN_STATUSES.includes(a.status));
  const finishedRaw = (actions || []).filter(a => INSIGHTS_FINISHED_STATUSES.includes(a.status));
  return computeDashboardInsightsFromActivityLists(
    mapGame4uActionsToActivityList(pendingRaw, month, { monthFilter: 'none' }),
    mapGame4uActionsToActivityList(finishedRaw, month, { monthFilter: 'none' })
  );
}

function deliveryDistinctKey(item: ActivityListItem): string {
  const title = (item.delivery_title || '').trim();
  const client = (item.cnpj || '').trim();
  if (title && client) {
    return `${title}|${client}`;
  }
  return title || client || item.id;
}

function localDayStartMsFromTimestamp(ms: number): number | null {
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function addDaysToDayStartMs(dayStartMs: number, days: number): number {
  const d = new Date(dayStartMs);
  d.setDate(d.getDate() + days);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/**
 * Agrega insights a partir de listas de tarefas (pendentes + finalizadas).
 * Função pura — reutilizável quando o backend passar a devolver listas ou totais pré-agregados.
 */
export function computeDashboardInsightsFromActivityLists(
  pending: ActivityListItem[],
  finished: ActivityListItem[],
  dueSoonDays = DASHBOARD_INSIGHTS_DUE_SOON_DAYS
): DashboardInsightsSnapshot {
  const todayStart = localDayStartMsFromTimestamp(Date.now()) ?? 0;
  const dueSoonEnd = addDaysToDayStartMs(todayStart, dueSoonDays);

  let overduePendingTasks = 0;
  let dueSoonTasks = 0;
  let fineRiskTasks = 0;
  const fineRiskDeliveryKeys = new Set<string>();

  let justifiedTasks = 0;

  for (const item of pending) {
    if (item.atraso_justificado === true) {
      justifiedTasks++;
      continue;
    }
    const prazoMs = parseGame4uDtPrazoToLocalDayStartMs(item.dt_prazo);
    if (prazoMs != null) {
      if (prazoMs < todayStart) {
        overduePendingTasks++;
      } else if (prazoMs >= todayStart && prazoMs <= dueSoonEnd) {
        dueSoonTasks++;
      }
    }
    if (item.risco_multa === true) {
      fineRiskTasks++;
      fineRiskDeliveryKeys.add(deliveryDistinctKey(item));
    }
  }

  let onTimeFinishedTasks = 0;
  let lateFinishedTasks = 0;
  const activityCounts = new Map<string, DashboardInsightsRankedItem>();
  const weekdayCounts = new Array(7).fill(0);

  for (const item of finished) {
    if (item.atraso_justificado === true) {
      justifiedTasks++;
    } else {
      const status = resolveGame4uFinishedPrazoStatus(item.dt_prazo, item.created);
      if (status === 'on_time') {
        onTimeFinishedTasks++;
      } else if (status === 'late') {
        lateFinishedTasks++;
      }
    }

    const title = (item.title || 'Sem título').trim();
    const existing = activityCounts.get(title);
    if (existing) {
      existing.count++;
    } else {
      activityCounts.set(title, { key: title, label: title, count: 1 });
    }

    const finishedDay = localDayStartMsFromTimestamp(item.created);
    if (finishedDay != null) {
      weekdayCounts[new Date(finishedDay).getDay()]++;
    }
  }

  const topActivities = [...activityCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const weekdayDistribution: DashboardInsightsWeekdayStat[] = DASHBOARD_INSIGHTS_WEEKDAY_LABELS.map(
    (w, index) => ({
      index,
      label: w.label,
      shortLabel: w.shortLabel,
      count: weekdayCounts[index] ?? 0
    })
  );
  const mostProductiveWeekday =
    weekdayDistribution.reduce<DashboardInsightsWeekdayStat | null>((best, row) => {
      if (row.count <= 0) {
        return best;
      }
      if (!best || row.count > best.count) {
        return row;
      }
      return best;
    }, null);

  return {
    source: 'client',
    computedAt: new Date().toISOString(),
    dueSoonDays,
    pendingTasks: pending.length,
    finishedTasks: finished.length,
    overduePendingTasks,
    dueSoonTasks,
    fineRiskTasks,
    fineRiskDeliveries: fineRiskDeliveryKeys.size,
    onTimeFinishedTasks,
    lateFinishedTasks,
    justifiedTasks,
    topActivity: topActivities[0] ?? null,
    topActivities,
    mostProductiveWeekday,
    weekdayDistribution
  };
}

/** Combina snapshots de várias equipas (soma contagens; rankings reordenados). */
export function mergeDashboardInsightsSnapshots(
  snapshots: Array<DashboardInsightsSnapshot | null | undefined>
): DashboardInsightsSnapshot | null {
  const valid = snapshots.filter((s): s is DashboardInsightsSnapshot => s != null);
  if (valid.length === 0) {
    return null;
  }
  if (valid.length === 1) {
    return valid[0]!;
  }

  const activityCounts = new Map<string, DashboardInsightsRankedItem>();
  const weekdayCounts = new Array(7).fill(0);
  let overduePendingTasks = 0;
  let dueSoonTasks = 0;
  let fineRiskTasks = 0;
  let fineRiskDeliveries = 0;
  let onTimeFinishedTasks = 0;
  let lateFinishedTasks = 0;
  let justifiedTasks = 0;
  let pendingTasks = 0;
  let finishedTasks = 0;
  const dueSoonDays = valid[0]!.dueSoonDays;

  for (const snap of valid) {
    overduePendingTasks += snap.overduePendingTasks;
    dueSoonTasks += snap.dueSoonTasks;
    fineRiskTasks += snap.fineRiskTasks;
    fineRiskDeliveries += snap.fineRiskDeliveries;
    onTimeFinishedTasks += snap.onTimeFinishedTasks;
    lateFinishedTasks += snap.lateFinishedTasks;
    justifiedTasks += snap.justifiedTasks;
    pendingTasks += snap.pendingTasks;
    finishedTasks += snap.finishedTasks;

    for (const act of snap.topActivities) {
      const cur = activityCounts.get(act.key);
      if (cur) {
        cur.count += act.count;
      } else {
        activityCounts.set(act.key, { ...act });
      }
    }

    for (const day of snap.weekdayDistribution) {
      weekdayCounts[day.index] = (weekdayCounts[day.index] ?? 0) + day.count;
    }
  }

  const topActivities = [...activityCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const weekdayDistribution: DashboardInsightsWeekdayStat[] = DASHBOARD_INSIGHTS_WEEKDAY_LABELS.map(
    (w, index) => ({
      index,
      label: w.label,
      shortLabel: w.shortLabel,
      count: weekdayCounts[index] ?? 0
    })
  );
  const mostProductiveWeekday =
    weekdayDistribution.reduce<DashboardInsightsWeekdayStat | null>((best, row) => {
      if (row.count <= 0) {
        return best;
      }
      if (!best || row.count > best.count) {
        return row;
      }
      return best;
    }, null);

  return {
    source: 'client',
    computedAt: new Date().toISOString(),
    dueSoonDays,
    pendingTasks,
    finishedTasks,
    overduePendingTasks,
    dueSoonTasks,
    fineRiskTasks,
    fineRiskDeliveries,
    onTimeFinishedTasks,
    lateFinishedTasks,
    justifiedTasks,
    topActivity: topActivities[0] ?? null,
    topActivities,
    mostProductiveWeekday,
    weekdayDistribution
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardInsightsService {
  constructor(
    private readonly actionLog: ActionLogService,
    private readonly game4u: Game4uApiService
  ) {}

  /**
   * Insights do mês via agregação client-side de `/game/reports/user-actions`.
   * Substituível por `GET /game/reports/dashboard/insights` quando disponível no backend.
   */
  getDashboardInsights(q: DashboardInsightsQuery, playerIdForApi: string): Observable<DashboardInsightsSnapshot | null> {
    if (!isGame4uDataEnabled() || !this.game4u.isConfigured() || !q.month) {
      return of(null);
    }

    const teamId = (q.team_id ?? '').trim() || undefined;
    const pid = (playerIdForApi ?? '').trim();
    const useTeamOnly = !!teamId && !pid;

    return this.actionLog
      .getTeamUserActionsForInsightsMonth(useTeamOnly ? teamId : undefined, q.month, useTeamOnly ? undefined : pid)
      .pipe(
        map(actions => buildDashboardInsightsSnapshotFromUserActions(actions, q.month!)),
        catchError(err => {
          console.error('[DashboardInsights] Failed to load insights:', err);
          return of(null);
        })
      );
  }

  /**
   * Insights agregando várias equipas (2 pedidos user-actions por `team_id`: abertas + finalizadas).
   */
  getDashboardInsightsForTeams(
    teamIds: string[],
    q: Omit<DashboardInsightsQuery, 'team_id'>,
    playerIdForApi: string
  ): Observable<DashboardInsightsSnapshot | null> {
    const ids = [...new Set(teamIds.map(id => id.trim()).filter(id => id.length > 0))];
    if (ids.length === 0) {
      return of(null);
    }
    if (ids.length === 1) {
      return this.getDashboardInsights({ ...q, team_id: ids[0] }, playerIdForApi);
    }
    return forkJoin(
      ids.map(team_id => this.getDashboardInsights({ ...q, team_id }, playerIdForApi))
    ).pipe(
      map(snapshots => mergeDashboardInsightsSnapshots(snapshots)),
      catchError(err => {
        console.error('[DashboardInsights] Failed to load multi-team insights:', err);
        return of(null);
      })
    );
  }
}
