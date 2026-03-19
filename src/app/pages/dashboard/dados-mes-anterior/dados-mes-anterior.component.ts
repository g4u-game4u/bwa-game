import { Component, Input, OnChanges } from '@angular/core';
import { ResumoMes } from '../../../model/resumoMes.model';
import { PainelInfoModel } from '../../../components/c4u-painel-info/c4u-painel-info.component';
import { translate } from '../../../providers/translate.provider';
import { DetalheAtividade } from '../../../model/detalheAtividade.model';
import { ModalDetailsPainelInfoProvider } from '../../../providers/modal-details-painel-info.provider';
import { MesAnteriorService } from '../../../services/mes-anterior.service';
// import { DetalheMacro } from '../../../model/detalheMacro.model';
import * as moment from 'moment';
import { AliasService, SystemAliases } from 'src/app/services/alias.service';
import { TIPO_CONSULTA_TIME } from '../dashboard.component';

@Component({
  selector: 'dados-mes-anterior',
  templateUrl: './dados-mes-anterior.component.html',
  styleUrls: ['./dados-mes-anterior.component.scss'],
})
export class DadosMesAnteriorComponent implements OnChanges {

  @Input()
  dadosMesAnterior: ResumoMes | any;

  @Input()
  idUsuario: number | any;

  @Input()
  mesesAnteriores: number | any;

  @Input()
  tipoConsulta: number | any;

  @Input()
  showVertical = true;

  questInfo: Array<PainelInfoModel> = [];

  processInfo: Array<PainelInfoModel> = [];

  aliases: SystemAliases | null = null;

  constructor(
    private mesAnteriorService: MesAnteriorService,
    private modalDetailsPainelInfo: ModalDetailsPainelInfoProvider,
    private aliasService: AliasService
  ) {}

  ngOnInit() {
    this.loadAliases();
  }

  defineDadosMesAnterior() {
    this.questInfo = [
      {
        value: this.dadosMesAnterior?.completedTasks + this.dadosMesAnterior?.deliveredTasks || 0,
        text: translate('LABEL_QUESTS_FINISHED', {actionAlias: this.actionAlias}),
        toolTip: translate('HINT_FINISHED_QUESTS', {actionAlias: this.actionAlias, deliveryAlias: this.deliveryAlias}),
        icon: 'icon-fact_check',
        action: () => {
          this.abreModal(0, 0);
        },
        extras: {
          showModal: true,
          textoItem: {
            label: 'LABEL_QUEST_COMPLETED_SINCE',
            param: 'dataFinalizacao',
          },
          dataApi: async (page: number, pageSize: number) => {
            try {
              const [doneResponse, deliveredResponse] = await Promise.all([
                this.mesAnteriorService.getGameActions('DONE', page, pageSize, this.mesesAnteriores, this.idUsuario, this.tipoConsulta),
                this.mesAnteriorService.getGameActions('DELIVERED', page, pageSize, this.mesesAnteriores, this.idUsuario, this.tipoConsulta)
              ]) as [DetalheAtividade | undefined, DetalheAtividade | undefined];

              const results = [
                ...(doneResponse as any || []),
                ...(deliveredResponse as any || [])
              ];

              return results;
            } catch (error) {
              console.error('Error fetching data:', error);
              return []
            }
          }
        }
      },
      {
        value: this.dadosMesAnterior?.pontos || 0,
        text: translate('LABEL_POINTS', {pointAlias: this.pointAlias}),
        toolTip: translate('HINT_POINTS_GENERATED', {pointAlias: this.pointAlias, actionAlias: this.actionAlias}),
        icon: 'icon-auto_awesome',
        extras: {
          showModal: false,
        },
      },
    ];

    this.processInfo = [
      {
        value: this.dadosMesAnterior?.completedDeliveries || 0,
        text: translate('LABEL_PROCESSES_QUESTS_FINISHED', {deliveryAlias: this.deliveryAlias}),
        toolTip: translate('HINT_FINISHED_MACRO_QUESTS', {deliveryAlias: this.deliveryAlias, actionAlias: this.actionAlias}),

        icon: 'icon-new_releases',
        action: () => {
          this.abreModal(1, 0);
        },
        extras: {
          showModal: true,
          textoItem: {
            label: 'LABEL_PROCESS_COMPLETED_SINCE',
            param: 'dataUltimaFinalizacao',
          },
          dataApi: async (page: number, pageSize: number) => {
              return this.mesAnteriorService.getGameDeliveries('DELIVERED', page, pageSize, this.mesesAnteriores, this.idUsuario, this.tipoConsulta);
          }
        },
      },
      
    ];
  }

  async loadAliases() {
    try {
      this.aliases = await this.aliasService.getAliases();
    } catch (error) {
      console.error('Erro ao carregar aliases:', error);
    }
  }

  get actionAlias(): string {
    return this.aliases?.actionAlias || 'Ações';
  }

  get deliveryAlias(): string {
    return this.aliases?.deliveryAlias || 'Entregas';
  }

  get pointAlias(): string {
    return this.aliases?.pointAlias || 'Pontos';
  }

  private abreModal(type: number = 0, tab: number = 0) {
    let dataModal = {
      teamSelected: this.tipoConsulta === TIPO_CONSULTA_TIME ? this.idUsuario : null,
      title: translate('LABEL_MY_PROGRESS') + ' em ' + this.getMonthSelected(),
      typeSelected: type,
      tabSelected: tab,
      types: [
        this.modalDetailsPainelInfo.infoToTypes(
          translate('LABEL_QUESTS', {actionAlias: this.actionAlias}),
          this.questInfo
        ),
        this.modalDetailsPainelInfo.infoToTypes(
          translate('LABEL_PROCESSES_QUESTS', {deliveryAlias: this.deliveryAlias}),
          this.processInfo
        ),
      ],
    };
  
    this.modalDetailsPainelInfo.abreModal(dataModal);
  }

  private getMonthSelected() {
    const month = moment().subtract(this.mesesAnteriores, 'months');
    return month.format('MMM/YY').toUpperCase();
  }

  ngOnChanges() {
    this.defineDadosMesAnterior();
  }
}
