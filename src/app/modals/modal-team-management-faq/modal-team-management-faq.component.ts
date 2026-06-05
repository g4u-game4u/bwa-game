import { Component } from '@angular/core';

export type TeamManagementFaqTheme =
  | 'violet'
  | 'gold'
  | 'emerald'
  | 'cyan'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'lime'
  | 'fuchsia';

export interface TeamManagementFaqItem {
  title: string;
  body: string;
  icon: string;
  theme: TeamManagementFaqTheme;
}

@Component({
  selector: 'app-modal-team-management-faq',
  templateUrl: './modal-team-management-faq.component.html',
  styleUrls: ['./modal-team-management-faq.component.scss'],
})
export class ModalTeamManagementFaqComponent {
  expandedIndex: number | null = null;

  readonly faqItems: TeamManagementFaqItem[] = [
    {
      title: 'Para quem é este painel?',
      icon: 'ri-team-line',
      theme: 'violet',
      body:
        'Destinado a quem acompanha performance de equipes no Game BWA: supervisores, líderes de célula, gestores, diretores e C-Level.\n' +
        'Aqui você enxerga metas, progresso, insights e clientes atendidos no escopo da sua responsabilidade.',
    },
    {
      title: 'Como navegar entre os painéis da plataforma?',
      icon: 'ri-compass-3-line',
      theme: 'sky',
      body:
        'Use o menu no topo da tela para alternar entre visões:\n' +
        'Meu Painel (sua performance individual, quando aplicável), Supervisor (visão rápida dos jogadores em cards ou tabela) e Gestão da Célula (este painel completo, com filtros e insights).\n' +
        'Cada visão responde a um tipo de necessidade: check-in rápido ou análise detalhada.',
    },
    {
      title: 'Como escolher equipe e colaborador?',
      icon: 'ri-filter-3-line',
      theme: 'cyan',
      body:
        'Na barra lateral, o seletor Equipe / Departamento define o time (ou escopo) analisado.\n' +
        'O seletor Colaborador filtra um jogador específico. Deixe vazio para ver o time inteiro agregado.\n' +
        'Com colaborador selecionado, metas, insights e listas refletem apenas aquela pessoa, ainda dentro do time escolhido.',
    },
    {
      title: 'O que é o Painel do Gerente, Diretor ou C-Level?',
      icon: 'ri-building-4-line',
      theme: 'gold',
      body:
        'Se você tem papel de gestão agregada, aparece uma opção especial no seletor de equipe (sem time individual).\n' +
        'Ela consolida KPIs de todos os times do seu escopo organizacional antes do drill-down em um time específico.\n' +
        'Ideal para visão macro mensal; depois selecione um time para investigar detalhes.',
    },
    {
      title: 'Como funciona o filtro de mês?',
      icon: 'ri-calendar-line',
      theme: 'emerald',
      body:
        'O seletor de mês no topo altera metas, progresso, insights operacionais, insights executivos e a lista de clientes atendidos.\n' +
        'A sidebar (pontos e progresso da temporada) considera o acumulado da campanha; o centro do painel segue o mês filtrado.\n' +
        'Use o botão Atualizar para buscar dados mais recentes após mudar o período.',
    },
    {
      title: 'Metas e Progresso vs. Análise de Produtividade',
      icon: 'ri-layout-grid-line',
      theme: 'amber',
      body:
        'A aba Metas e Progresso concentra KPIs da equipe, cards de atividades e processos, insights e clientes atendidos.\n' +
        'A aba Análise de Produtividade traz gráficos de evolução e segmentação; os dados carregam quando você abre a aba, para não sobrecarregar o painel.\n' +
        'Ao selecionar um colaborador, as abas focam naquela pessoa e a navegação por abas some, mantendo só o conteúdo relevante.',
    },
    {
      title: 'O que são os Insights operacionais?',
      icon: 'ri-pulse-line',
      theme: 'rose',
      body:
        'Resumo do time ou colaborador selecionado no mês: alertas de risco de multa, entregas próximas do vencimento e pendentes atrasadas.\n' +
        'Também mostra atividade mais realizada, dia mais produtivo e totais de finalizadas, no prazo, fora do prazo e pendentes abertas.\n' +
        'Use no dia a dia para priorizar o que exige ação imediata antes de discutir volume de pontos.',
    },
    {
      title: 'O que são os Insights executivos do mês?',
      icon: 'ri-pie-chart-2-line',
      theme: 'fuchsia',
      body:
        'Visão gerencial: entregas finalizadas, percentual no prazo e clientes atendidos por pessoa.\n' +
        'Inclui ranking de processos mais finalizados, destaques do mês (mais entregas no prazo) e jogadores que precisam de atenção (menor % no prazo).\n' +
        'Sem colaborador selecionado, reflete o time inteiro; com colaborador, foca na performance individual.',
    },
    {
      title: 'Como tirar melhor proveito dos insights?',
      icon: 'ri-lightbulb-line',
      theme: 'lime',
      body:
        'Rotina sugerida:\n' +
        'Diário: comece pelos Insights operacionais e trate alertas de multa, vencimento e atrasos.\n' +
        'Semanal (reunião de célula): revise meta de pontos, Insights executivos, top processos e quem precisa de apoio.\n' +
        'Mensal (gerência): use o painel agregado Gerente/Diretor/C-Level, compare times e evolução de entregas no prazo.\n' +
        'Combine insights com a lista Clientes atendidos e os cards de Progresso da equipe para entender causa raiz.',
    },
    {
      title: 'Como investigar entregas e clientes?',
      icon: 'ri-search-eye-line',
      theme: 'sky',
      body:
        'Clique nos cards de atividades ou processos em Progresso da equipe para abrir a lista de entregas do período.\n' +
        'Em Clientes atendidos este mês, cada linha mostra participação no mês; clique para ver entregas, responsáveis e status de prazo.\n' +
        'Com colaborador selecionado, os drill-downs refletem somente as entregas daquela pessoa.',
    },
    {
      title: 'Dúvidas, suporte e materiais oficiais',
      icon: 'ri-customer-service-2-line',
      theme: 'violet',
      body:
        'Use o botão de suporte disponível nas páginas da plataforma. A equipe Game4U acompanha as solicitações.\n' +
        'Tutoriais em PDF para gestores serão publicados neste FAQ assim que estiverem disponíveis.',
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
