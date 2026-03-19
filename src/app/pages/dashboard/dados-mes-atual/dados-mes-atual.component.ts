import {Component, Input, OnChanges} from '@angular/core';
import {translate} from '../../../providers/translate.provider';
import {ResumoMes} from '../../../model/resumoMes.model';
import {PainelInfoModel} from '../../../components/c4u-painel-info/c4u-painel-info.component';
import {MesAtualService} from '../../../services/mes-atual.service';
import {DetalheAtividade} from '../../../model/detalheAtividade.model';
import {ModalDetailsPainelInfoProvider} from '../../../providers/modal-details-painel-info.provider';
import * as moment from 'moment';
import { AliasService, SystemAliases } from 'src/app/services/alias.service';
import { TIPO_CONSULTA_TIME } from '../dashboard.component';

@Component({
  selector: 'dados-mes-atual',
  templateUrl: './dados-mes-atual.component.html',
  styleUrls: ['./dados-mes-atual.component.scss'],
})
export class DadosMesAtualComponent implements OnChanges {
  @Input()
  dadosMesAtual: ResumoMes = {} as any;

  @Input()
  idUsuario: number | any;

  @Input()
  tipoConsulta: number | any;

  @Input()
  showVertical = false;

  questInfo: Array<PainelInfoModel> = [];

  processInfo: Array<PainelInfoModel> = [];

  aliases: SystemAliases | null = null;

  constructor(
    private mesAtualService: MesAtualService,
    private modalDetailsPainelInfo: ModalDetailsPainelInfoProvider,
    private aliasService: AliasService
  ) {}

  ngOnInit() {
    this.loadAliases();
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

  defineDadosMesAtual() {
    this.questInfo = [
      {
        value: (this.dadosMesAtual?.pendingTasks || 0) + (this.dadosMesAtual?.doingTasks || 0),
        text: translate('LABEL_PENDING', {actionAlias: this.actionAlias}),
        toolTip: translate('HINT_PENDING_QUESTS', {actionAlias: this.actionAlias}),
        icon: 'icon-notifications_paused',
        action: () => {
          this.abreModal(0, 0);
        },
        extras: {
          showModal: true,
          textoItem: {
            label: 'LABEL_QUEST_PENDING_SINCE',
            param: 'dataAtribuicao',
          },
          dataApi: async (page: number, pageSize: number) => {
            try {
              const [pendingResponse, doingResponse] = await Promise.all([
                this.mesAtualService.getGameActions('PENDING', page, pageSize, this.idUsuario, this.tipoConsulta),
                this.mesAtualService.getGameActions('DOING', page, pageSize, this.idUsuario, this.tipoConsulta)
              ]) as [DetalheAtividade | undefined, DetalheAtividade | undefined];

              const results = [
                ...(pendingResponse as any || []),
                ...(doingResponse as any || [])
              ];

              return results;
            } catch (error) {
              console.error('Error fetching data:', error);
              return []
            }
          }
        },
      },
      // {
      //   value: this.dadosMesAtual?.atividades?.execucao || 0,
      //   text: translate('LABEL_DOING'),
      //   toolTip: translate('HINT_DOING_QUESTS'),
      //   icon: 'icon-handyman',
      //   action: () => {
      //     this.abreModal(0, 1);
      //   },
      //   extras: {
      //     showModal: true,
      //     textoItem: {
      //       label: 'LABEL_QUEST_EXECUTING_SINCE',
      //       param: 'dataExecucao',
      //     },
      //     detailsFn: (detalhes: DetalheAtividade, info: PainelInfoModel) =>
      //       this.modalDetailsPainelInfo.getDetailsQuests(detalhes, info),
      //     dataApi: async (page: number, pageSize: number) => {
      //       if (this.idUsuario) {
      //         return this.mesAtualService.getDadosMesAtualAtividadesExecucao(
      //           this.idUsuario,
      //           this.tipoConsulta,
      //           page,
      //           pageSize
      //         );
      //       }
      //       return null;
      //     },
      //   },
      // },
      {
        value: this.dadosMesAtual?.completedTasks + this.dadosMesAtual?.deliveredTasks || 0,
        text: translate('LABEL_FINISHED', {actionAlias: this.actionAlias}),
        toolTip: translate('HINT_FINISHED_QUESTS', {actionAlias: this.actionAlias}),
        icon: 'icon-fact_check',
        action: () => {
          this.abreModal(0, 1);
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
                this.mesAtualService.getGameActions('DONE', page, pageSize, this.idUsuario, this.tipoConsulta),
                this.mesAtualService.getGameActions('DELIVERED', page, pageSize, this.idUsuario, this.tipoConsulta)
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
        },
      },
      {
        value: this.dadosMesAtual?.pontos || 0,
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
        value: this.dadosMesAtual?.pendingDeliveries || 0,
        text: translate('LABEL_PENDING', {deliveryAlias: this.deliveryAlias}),
        toolTip: translate('HINT_PENDING_MACRO_QUESTS', {deliveryAlias: this.deliveryAlias, actionAlias: this.actionAlias}),
        icon: 'icon-notifications_paused',
        action: () => {
          this.abreModal(1, 0);
        },
        extras: {
          showModal: true,
          textoItem: {
            label: 'LABEL_PROCESS_PENDING_SINCE',
            param: 'dataUltimaAtribuicao',
          },
          dataApi: async (page: number, pageSize: number) => {
            return this.mesAtualService.getGameDeliveries('PENDING', page, pageSize, this.idUsuario, this.tipoConsulta);
          }
        },
      },
      {
        value: this.dadosMesAtual?.incompleteDeliveries || 0,
        text: translate('LABEL_PROCESS_INCOMPLETE', {deliveryAlias: this.deliveryAlias}),
        toolTip: translate('HINT_INCOMPLETE_MACRO_QUESTS', {deliveryAlias: this.deliveryAlias, actionAlias: this.actionAlias}),
        icon: 'icon-rule',
        action: () => {
          this.abreModal(1, 1);
        },
        extras: {
          showModal: true,
          textoItem: {
            label: 'LABEL_PROCESS_INCOMPLETE_SINCE',
            param: 'dataUltimaFinalizacao',
          },
          dataApi: async (page: number, pageSize: number) => {
            return this.mesAtualService.getGameDeliveries('INCOMPLETE', page, pageSize, this.idUsuario, this.tipoConsulta);
          }
        },
      },
      {
        value: this.dadosMesAtual?.completedDeliveries || 0,
        text: translate('LABEL_FINISHED', {deliveryAlias: this.deliveryAlias}),
        toolTip: translate('HINT_FINISHED_MACRO_QUESTS', {deliveryAlias: this.deliveryAlias}),
        icon: 'icon-new_releases',
        action: () => {
          this.abreModal(1, 2);
        },
        extras: {
          showModal: true,
          textoItem: {
            label: 'LABEL_PROCESS_COMPLETED_SINCE',
            param: 'dataUltimaFinalizacao',
          },
          dataApi: async (page: number, pageSize: number) => {
            return this.mesAtualService.getGameDeliveries('DELIVERED', page, pageSize, this.idUsuario, this.tipoConsulta);
          }
        },
      },
    ];
  }

  private abreModal(type: number = 0, tab: number = 0) {
    let dataModal = {
      teamSelected: this.tipoConsulta === TIPO_CONSULTA_TIME ? this.idUsuario : null,
      title: translate('LABEL_MY_PROGRESS') + ' em ' + this.getCurrentMonth(),
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

  private getCurrentMonth() {
    return moment().format('MMM/YY').toUpperCase();
  }

  ngOnChanges() {
    this.defineDadosMesAtual();
  }
}
