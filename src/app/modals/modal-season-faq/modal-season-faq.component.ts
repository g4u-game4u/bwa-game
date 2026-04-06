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
      title: 'O que são os pontos desta gamificação?',
      body:
        'Nesta gamificação, os pontos representam o volume de entregas realizadas por você na plataforma acessória.\n' +
        'Diferente de outros programas, aqui só existem pontos desbloqueados: toda pontuação exibida já foi efetivamente conquistada ' +
        'com base em entregas concluídas no período filtrado.',
    },
    {
      title: 'Por que não existem pontos bloqueados ou a desbloquear?',
      body:
        'Porque os pontos são calculados exclusivamente a partir de entregas já realizadas e registradas na plataforma acessória.\n' +
        'Não há “promessas” de pontos futuros: se aparece no painel, significa que a entrega correspondente já foi concluída e contabilizada.',
    },
    {
      title: 'O que a lista de clientes representa?',
      body:
        'A lista de clientes mostra todas as entregas realizadas para cada cliente dentro do mês selecionado no painel.\n' +
        'Para cada cliente, você enxerga o conjunto de atividades concluídas naquele período, o que ajuda a entender como está ' +
        'a sua atuação e a concentração de entregas na carteira.',
    },
    {
      title: 'Como as entregas se conectam com os pontos no painel?',
      body:
        'Cada entrega registrada na plataforma acessória gera pontos de acordo com as regras de negócio da operação.\n' +
        'O painel consolida essas entregas por cliente e por período filtrado, somando os pontos correspondentes ' +
        'e exibindo o total de pontos desbloqueados para você.',
    },
    {
      title: 'Para que servem os KPIs em formato de círculo (circular progress)?',
      body:
        'Os KPIs em formato de círculo mostram a “saúde” da sua carteira de clientes, isto é, se você está atingindo ' +
        'os níveis esperados de qualidade, volume ou equilíbrio das entregas.\n' +
        'Eles não são apenas indicadores visuais: esses percentuais serão considerados quando os pontos forem convertidos em moedas, ' +
        'podendo gerar bonificação ou penalização.',
    },
    {
      title: 'Como os KPIs influenciam a conversão de pontos em moedas?',
      body:
        'Na conversão de pontos em moedas, os KPIs funcionam como multiplicadores ou redutores.\n' +
        'Uma carteira saudável (KPIs altos) pode gerar um bônus: a mesma quantidade de pontos resulta em mais moedas.\n' +
        'Por outro lado, se os KPIs indicarem problemas na carteira, pode haver uma penalização, reduzindo a quantidade de moedas ' +
        'geradas a partir dos mesmos pontos.',
    },
    {
      title: 'O que significa ter uma “carteira saudável”?',
      body:
        'Uma carteira saudável é aquela em que os KPIs se mantêm próximos ou acima das metas definidas pela operação.\n' +
        'Na prática, isso costuma significar boa distribuição de entregas entre clientes, níveis adequados de volume, ' +
        'qualidade e aderência aos prazos definidos para o seu papel.',
    },
    {
      title: 'Como posso usar o painel para melhorar meus resultados?',
      body:
        'Use os pontos para acompanhar o volume total de entregas realizadas e comparar sua performance entre períodos.\n' +
        'Analise a lista de clientes para identificar onde você mais entrega e onde ainda há espaço para atuar.\n' +
        'Monitore os KPIs circulares para ajustar seu foco: melhorar esses indicadores aumenta a saúde da carteira e pode ' +
        'elevar o valor final convertido em moedas.',
    },
  ];
}
