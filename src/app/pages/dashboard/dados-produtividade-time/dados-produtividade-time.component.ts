import {Component, Input, OnChanges} from '@angular/core';
import {translate} from "../../../providers/translate.provider";
import {BotaoSelecaoItemModel} from "../../../components/c4u-botao-selecao/c4u-botao-selecao.component";
import {TIPO_CONSULTA_TIME} from "../dashboard.component";
import {GraficoService} from "../../../services/grafico.service";
import {Grafico} from "../../../model/grafico.model";
import { AliasService, SystemAliases } from 'src/app/services/alias.service';

@Component({
  selector: 'dados-produtividade-time',
  templateUrl: './dados-produtividade-time.component.html',
  styleUrls: ['./dados-produtividade-time.component.scss']
})
export class DadosProdutividadeTimeComponent implements OnChanges {
  @Input()
  idTime: number | any;

  @Input()
  nomeTime: string = '';

  @Input()
  mesAnterior: number = 0;

  @Input()
  isCSLayout: boolean = false;

  users: Array<{ email: string, nome: string }> | any;

  labelsParticipacaoAtividades = [''];
  labelsParticipacaoPontos = [''];

  valuesParticipacaoAtividades = [{valueList: [0], label: ''}];
  valuesParticipacaoPontos = [{valueList: [0], label: ''}];

  valuesAtividades = [{valueList: [0], label: ''}];
  valuesPontos = [{valueList: [0], label: ''}];
  labels = [''];
  dateRanges = [
    {val: 60, text: `60 ${translate('LABEL_DAYS')}`},
    {val: 30, text: `30 ${translate('LABEL_DAYS')}`},
    {val: 15, text: `15 ${translate('LABEL_DAYS')}`},
    {val: 7, text: `7 ${translate('LABEL_DAYS')}`},
  ];
  selectedDateRange = 7;
  selectedUser: any;
  itemsButton: Array<BotaoSelecaoItemModel> = [{
    icon: 'icon-timeline',
    text: translate('LABEL_LINE')
  }, {
    icon: 'icon-bar_chart',
    text: translate('LABEL_BARS')
  }];
  chartSelection = 0;
  chartLoaded: any = true;

  aliases: SystemAliases | null = null;

  constructor(private graficoService: GraficoService, private aliasService: AliasService) {
  }

  init(): void {
    this.chartLoaded = false;
    if (this.idTime) {
      this.getDadosGrafico();
    }
  }

  updateGrafico() {
    this.chartLoaded = null;
    this.getDadosGrafico();
  }

  getDadosGrafico() {
    if (this.idTime) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - this.selectedDateRange);

      this.graficoService.getDadosGrafico(
        this.idTime, 
        TIPO_CONSULTA_TIME, 
        startDate.toISOString(),
        endDate.toISOString()
      ).then((graphicData) => {
        const grafico = graphicData as any;

        this.valuesAtividades = [{
          valueList: grafico.stats.map(({total_actions}: any) => total_actions),
          label: this.nomeTime + ' (100%)'
        }];

        this.valuesPontos = [{valueList: grafico.stats.map(({total_points}: any) => total_points), label: this.nomeTime + ' (100%)'}];

        let qtdeTotalAtividadesTime = this.getSomaValoresLista(this.valuesAtividades[0].valueList);
        let qtdeTotalPontosTime = this.getSomaValoresLista(this.valuesPontos[0].valueList);
        let executores = this.getDadosExecutoresTime(grafico, qtdeTotalAtividadesTime, qtdeTotalPontosTime);
        this.users = executores.map((exec: any) => {
          return {email: exec.id, nome: exec.nome}
        });
        this.valuesAtividades.push(...this.ordenaPorParticipacaoAtividades(executores).map((exec: any) => {
          return {
            valueList: exec.listaAtividades,
            label: exec.label + ' (' + exec.contribuicaoAtividades + '%)'
          }
        }));
        this.valuesPontos.push(...this.ordenaPorParticipacaoPontos(executores).map((exec: any) => {
          return {
            valueList: exec.listaPontos,
            label: exec.label + ' (' + exec.contribuicaoPontos + '%)'
          }
        }));

        this.labels = grafico.stats.map(({date}: any) => {
          const d = new Date(date);
          return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        });
        
        this.defineDadosGraficoParticipacaoTime(executores);

        this.chartLoaded = 'yes';
      });
    }
  }

  getDadosExecutoresTime(grafico: Grafico, qtdeTotalAtividadesTime: number, qtdeTotalPontosTime: number) {
    let executores = <any>{};
    for (let i = 0; i < grafico.stats.length; i++) {
      let data = grafico.stats[i];
      let keysExecutoresData = data?.users ? data?.users.map(e => e.email) : [];
      for (let exec of (data?.users || [])) {
        if (!executores[exec.email]) {
          executores[exec.email] = {
            listaAtividades: new Array(i).fill(0),
            listaPontos: new Array(i).fill(0),
            label: exec.email,
            id: exec.email
          }
        }
        executores[exec.email].listaPontos.push(exec.total_points );
        executores[exec.email].listaAtividades.push(exec.total_actions);
      }
      let keysListaExecutores = Object.keys(executores);
      let execSemAtividades = keysExecutoresData
        .filter(x => !keysListaExecutores.includes(x))
        .concat(keysListaExecutores.filter(x => !keysExecutoresData.includes(x)));
      for (let exec of execSemAtividades) {
        executores[exec].listaPontos.push(0);
        executores[exec].listaAtividades.push(0);
      }
    }
    return Object.values(executores).map((exec: any) => {
      exec.contribuicaoAtividades = this.getParticipacaoColaboradorTime(exec.listaAtividades, qtdeTotalAtividadesTime);
      exec.contribuicaoPontos = this.getParticipacaoColaboradorTime(exec.listaPontos, qtdeTotalPontosTime);
      return exec;
    });
  }

  defineDadosGraficoParticipacaoTime(executores: Array<any>) {
    let ordenadoPontos = this.ordenaPorParticipacaoPontos(executores);
    let ordenadoAtividades = this.ordenaPorParticipacaoAtividades(executores);

    this.labelsParticipacaoAtividades = ordenadoAtividades.map(exec => exec.label + '');
    this.labelsParticipacaoPontos = ordenadoPontos.map(exec => exec.label + '');

    this.valuesParticipacaoAtividades = [{
      valueList: ordenadoAtividades.map((exec: any) => exec.contribuicaoAtividades),
      label: '%'
    }];

    this.valuesParticipacaoPontos = [{
      valueList: ordenadoPontos.map((exec: any) => exec.contribuicaoPontos),
      label: '%'
    }];
  }

  ngOnChanges() {
    this.init();
    this.loadAliases();
  }

  ordenaPorParticipacaoAtividades(lista: Array<any>) {
    return lista.slice().sort((a: any, b: any) => b.contribuicaoAtividades - a.contribuicaoAtividades)
  }

  ordenaPorParticipacaoPontos(lista: Array<any>) {
    return lista.slice().sort((a: any, b: any) => b.contribuicaoPontos - a.contribuicaoPontos)
  }

  private getParticipacaoColaboradorTime(lista: Array<number>, totalTime: number) {
    let valorTotalExecutor = this.getSomaValoresLista(lista);
    return totalTime !== 0 ? (Math.round((valorTotalExecutor / totalTime) * 100)) : 0;
  }

  private getSomaValoresLista(lista: Array<number>) {
    return lista.reduce((total, e) => total + Number(e));
  }

  async loadAliases() {
    try {
      this.aliases = await this.aliasService.getAliases();
    } catch (error) {
      console.error('Erro ao carregar aliases:', error);
    }
  }

  get pointAlias(): string {
    return this.aliases?.pointAlias || 'Pontos';
  }

  get actionAlias(): string {
    return this.aliases?.actionAlias || 'Ações';
  }

  get deliveryAlias(): string {
    return this.aliases?.deliveryAlias || 'Entregas';
  }
}
