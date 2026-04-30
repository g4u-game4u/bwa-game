import { Component } from '@angular/core';

export interface SeasonFaqItem {
  title: string;
  body: string;
}

@Component({
  selector: 'app-modal-season-faq',
  templateUrl: './modal-season-faq.component.html',
  styleUrls: ['./modal-season-faq.component.scss'],
})
export class ModalSeasonFaqComponent {
  faqItems: SeasonFaqItem[] = [
    {
      title: 'O que o painel destaca nesta temporada?',
      body:
        'O painel concentra três frentes da sua performance: a meta de pontos do período, ' +
        'o quanto você entrega no prazo e quantos clientes você atende.\n' +
        'Esses indicadores ajudam a ver de um relance se você está caminhando em direção às metas da operação.',
    },
    {
      title: 'O que são os pontos e por que cada entrega vale diferente?',
      body:
        'Os pontos refletem entregas registradas na plataforma acessória, mas não são todos iguais: eles são pesados.\n' +
        'Na pontuação entram, entre outros fatores, o tempo médio de execução da entrega, a complexidade da demanda ' +
        'e o nível mínimo de senioridade exigido para aquela entrega.\n' +
        'Assim, entregas mais exigentes ou que pedem mais experiência tendem a contar de forma diferente na soma.',
    },
    {
      title: 'Como a empresa do cliente influencia os pontos?',
      body:
        'A classificação da empresa — Pedra, Bronze, Prata, Ouro ou Diamante — também entra no peso dos pontos.\n' +
        'Além disso, o painel considera contextos especiais: empresas em período de onboarding valem o dobro de pontos. ' +
        'Já empresas em risco de churn também são levadas em conta no modelo, reforçando o foco em retenção e qualidade do relacionamento.',
    },
    {
      title: 'O que é a meta de pontos?',
      body:
        'A meta de pontos é a referência de volume de pontuação que a operação espera para o período que você está visualizando.\n' +
        'Ela conversa diretamente com as entregas que você concluiu e com o peso de cada uma delas, conforme as regras descritas aqui.',
    },
    {
      title: 'O que significam “entregas no prazo”?',
      body:
        'Esse indicador mostra o quanto das suas entregas foi concluído dentro do prazo acordado ou esperado para o fluxo.\n' +
        'Manter esse número alto costuma ir de mãos dadas com uma boa pontuação e com uma carteira mais previsível.',
    },
    {
      title: 'O que são “clientes atendidos”?',
      body:
        'É a quantidade de clientes com os quais você teve entregas válidas no período filtrado no painel.\n' +
        'Ajuda a enxergar abrangência: além do volume de pontos, você vê quantas contas diferentes foram efetivamente cobertas.',
    },
    {
      title: 'Como posso usar o painel para melhorar meus resultados?',
      body:
        'Compare meta de pontos com o que você já acumulou e ajuste prioridades (complexidade, prazo, carteira).\n' +
        'Acompanhe entregas no prazo e clientes atendidos para equilibrar volume, pontualidade e cobertura.\n' +
        'Lembre-se do peso por classificação da empresa, onboarding e churn para priorizar onde cada ponto pesa mais na temporada.',
    },
  ];
}
