import { Component } from '@angular/core';

export type SeasonFaqTheme =
  | 'violet'
  | 'gold'
  | 'emerald'
  | 'cyan'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'lime'
  | 'fuchsia';

export interface SeasonFaqItem {
  title: string;
  body: string;
  icon: string;
  theme: SeasonFaqTheme;
}

export interface SeasonFaqResourceLink {
  label: string;
  description: string;
  url: string;
  icon: string;
  theme: SeasonFaqTheme;
}

/** Materiais oficiais publicados em Supabase Storage (`rulebook/bwa-pdf/`). */
const RULEBOOK_BASE_URL =
  'https://zarptqqopvuwognexpon.supabase.co/storage/v1/object/public/rulebook/bwa-pdf';

@Component({
  selector: 'app-modal-season-faq',
  templateUrl: './modal-season-faq.component.html',
  styleUrls: ['./modal-season-faq.component.scss'],
})
export class ModalSeasonFaqComponent {
  expandedIndex: number | null = null;

  readonly resourceLinks: SeasonFaqResourceLink[] = [
    {
      label: 'Tutorial: interface do painel (PDF)',
      description:
        'Passo a passo da tela do jogador: menu lateral, metas, progresso, insights e clientes atendidos.',
      url: `${RULEBOOK_BASE_URL}/PLATAFORMA_BWA%20GAME_062026V1_PERFILJOGADOR.pdf`,
      icon: 'ri-layout-masonry-line',
      theme: 'sky',
    },
    {
      label: 'Regras de pontuação (PDF)',
      description:
        'Balanceamento, multiplicadores, bônus e penalidades por prazo. Base oficial do cálculo de pontos.',
      url: `${RULEBOOK_BASE_URL}/REGRAS_BWA%20GAME_062026V1_PERFILJOGADOR.pdf`,
      icon: 'ri-medal-line',
      theme: 'gold',
    },
  ];

  readonly faqItems: SeasonFaqItem[] = [
    {
      title: 'Como o painel está organizado?',
      icon: 'ri-dashboard-3-line',
      theme: 'violet',
      body:
        'O menu lateral mostra pontos da temporada, o período da campanha, entregas finalizadas e clientes atendidos.\n' +
        'No centro você acompanha Minhas Metas, Meu Progresso (Pendentes e Finalizados), Insights do mês e Clientes atendidos, tudo filtrado pelo mês selecionado no topo.\n' +
        'Para o passo a passo visual, abra o tutorial em PDF nos materiais acima.',
    },
    {
      title: 'Como funciona a pontuação no BWA Game?',
      icon: 'ri-trophy-line',
      theme: 'gold',
      body:
        'Cada entrega finalizada no Acessórias é analisada pelo game e os pontos vão para quem finalizou a entrega.\n' +
        'A pontuação usa três camadas: (1) base da atividade, com senioridade, tempo médio e complexidade, em escala de 1 a 5; ' +
        '(2) multiplicadores, com classificação da empresa (1 a 5), bônus x2 em onboarding e bônus x2 em risco de churn; ' +
        '(3) bônus ou penalidade por prazo, com entrega antecipada (+50%), no prazo técnico (neutro), atrasos progressivos (-10% a -100%) ou atraso com risco de multa (-100%).\n' +
        'Detalhes e exemplo numérico estão no PDF de regras de pontuação.',
    },
    {
      title: 'O que é a meta de pontos?',
      icon: 'ri-flag-2-line',
      theme: 'emerald',
      body:
        'É a referência de volume que a operação espera para o mês filtrado.\n' +
        'Contam as tarefas finalizadas por você, com o peso de cada entrega conforme as regras do game.\n' +
        'Compare o realizado com a meta na barra de progresso em Minhas Metas.',
    },
    {
      title: 'O que significa a meta de 90% de entregas no prazo?',
      icon: 'ri-time-line',
      theme: 'cyan',
      body:
        'É a meta de qualidade operacional com base nas entregas no Acessórias.\n' +
        'O percentual considera entregas de todos os usuários que atenderam cada cliente, não apenas as suas.\n' +
        'Valores acima de 90% indicam resultado positivo para a carteira.',
    },
    {
      title: 'Como usar Meu Progresso (Pendentes e Finalizados)?',
      icon: 'ri-bar-chart-grouped-line',
      theme: 'amber',
      body:
        'Em Pendentes, clique para ver os tipos de tarefa em aberto, o volume por dia de prazo no mês e, ao selecionar um tipo, a lista de empresas com prazos.\n' +
        'Tarefas com risco de multa aparecem destacadas abaixo do nome da empresa.\n' +
        'Em Finalizados, você acessa as entregas já concluídas no período.',
    },
    {
      title: 'O que são os Insights do mês?',
      icon: 'ri-lightbulb-flash-line',
      theme: 'rose',
      body:
        'Resumo inteligente das suas tarefas no mês: produtividade, prazos e alertas (risco de multa, vencimento próximo, pendentes atrasadas).\n' +
        'Mostra também atividade mais realizada, dia mais produtivo e totais de finalizadas, no prazo, fora do prazo e pendentes abertas.',
    },
    {
      title: 'O que são “clientes atendidos este mês”?',
      icon: 'ri-building-4-line',
      theme: 'sky',
      body:
        'Clientes para os quais você finalizou entregas no Acessórias no período filtrado.\n' +
        'Ao clicar em uma empresa, você vê as tarefas realizadas, quem finalizou e a data de entrega, útil para monitorar a carteira por cliente.',
    },
    {
      title: 'Preciso de ajuda ou tenho dúvidas sobre regras?',
      icon: 'ri-customer-service-2-line',
      theme: 'lime',
      body:
        'Use os PDFs oficiais acima (tutorial e regras), este FAQ ou o botão de suporte disponível em todas as páginas da plataforma.\n' +
        'A equipe Game4U acompanha as solicitações. Prazo para primeira resposta: até 24 horas.',
    },
    {
      title: 'Como usar o painel para melhorar meus resultados?',
      icon: 'ri-rocket-2-line',
      theme: 'fuchsia',
      body:
        'Priorize alertas de risco de multa e tarefas próximas do vencimento em Pendentes e Insights.\n' +
        'Equilibre meta de pontos, entregas no prazo e cobertura de clientes.\n' +
        'Aproveite bônus (entrega antecipada, onboarding, churn) e evite penalidades por atraso. Cada dia conta na tabela oficial de -10% a -100%.',
    },
  ];

  toggleFaq(index: number): void {
    this.expandedIndex = this.expandedIndex === index ? null : index;
  }

  isExpanded(index: number): boolean {
    return this.expandedIndex === index;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
