import {Component, Input} from '@angular/core';
import {PainelInfoModel} from "../../../components/c4u-painel-info/c4u-painel-info.component";
import {TIPO_CONSULTA_TIME} from "../dashboard.component";
import {MesAtualService} from "../../../services/mes-atual.service";
import {MesAnteriorService} from "../../../services/mes-anterior.service";
import {ResumoMes} from "../../../model/resumoMes.model";
import { roundPercentageValue } from '@utils/roundPercentage';
import { AliasService, SystemAliases } from 'src/app/services/alias.service';
import { GoalsConfigService, GoalsConfig } from 'src/app/services/goals-config.service';
import { AcessoService } from '../../../services/acesso.service';
import { FeaturesService, SystemFeatures } from 'src/app/services/features.service';
import { TeamStatsCacheService } from 'src/app/services/team-stats-cache.service';

@Component({
  selector: 'dados-metas-progresso-time',
  templateUrl: './dados-metas-progresso-time.component.html',
  styleUrls: ['./dados-metas-progresso-time.component.scss']
})
export class DadosMetasProgressoTimeComponent {

  @Input()
  idTime: number | any;

  @Input()
  mesAnterior: number = 0;

  @Input()
  aliases: SystemAliases | null = null;

  @Input()
  apiReady: boolean = false;

  features: SystemFeatures | null = null;

  // Propriedades para as configurações de metas
  goalsConfig: GoalsConfig | null = null;
  goalsConfigLoading = false;

  dadosMes: ResumoMes | any;
  
  nivelMeta: {
    nivel: any,
    estrelas: number,
    maxLevel: number,
    tema: 'red' | 'gold' | 'green'
  } | any;

  evaluatedTicketsPercent: number = 0;
  evaluatedTicketsTheme: "red" | "gold" = "red";

  questInfo: Array<PainelInfoModel> = []

  macroInfo: Array<PainelInfoModel> = [];

  qtdeColaboradores: any;
  
  constructor(private mesAtualService: MesAtualService,
              private mesAnteriorService: MesAnteriorService,
              private aliasService: AliasService,
              private goalsConfigService: GoalsConfigService,
              private acessoService: AcessoService,
              private featuresService: FeaturesService,
              private teamStatsCache: TeamStatsCacheService) {
  }

  async ngOnInit() {
    this.loadAliases();
    await this.loadGoalsConfig();
    await this.getDadosMesAtual();
    await this.defineDetalhesNivelMetaDoTime();
    this.features = await this.featuresService.getFeatures();
  }

  async getDadosMesAtual() {
    if (this.idTime) {
      this.dadosMes = await this.teamStatsCache.getTeamStats(this.idTime, this.tipoConsulta, 0);
    }
  }

  getDadosMesAnterior() {
    if (this.idTime) {
      this.teamStatsCache.getTeamStats(this.idTime, this.tipoConsulta, this.mesAnterior).then(data => {
        this.dadosMes = data;
        // Recalcula os níveis quando os dados mudam
        this.defineDetalhesNivelMetaDoTime();
        this.populateTicketsPoints();
      });
    }
  }

  ngOnChanges() {
    this.dadosMes = null;
    if (this.mesAnterior) {
      this.getDadosMesAnterior();
    } else {
      this.getDadosMesAtual();
    }
  }

  private populateTicketsPoints() {
    const totalTickets = this.dadosMes?.atividades?.total || 0;

    const currentEvaluatedTickets = this.dadosMes?.atividades?.desbloqueadas || 0;
    const totalTicketsToEvaluate = totalTickets > 1 ? (totalTickets / 2) : totalTickets;

    this.evaluatedTicketsPercent = !totalTicketsToEvaluate ? 0 : (currentEvaluatedTickets / totalTicketsToEvaluate) * 100;
    this.evaluatedTicketsTheme = (currentEvaluatedTickets > 0 && currentEvaluatedTickets >= totalTicketsToEvaluate) ? "gold" : "red";
  }

  getPercentNivel(maxLevel: number) {
    return Math.floor((this.nivelMeta?.nivel / maxLevel) * 100);
  }

  getPercentMacro(individualMonthlyGoal: number) {
    return Math.floor((this.dadosMes?.completedDeliveries / individualMonthlyGoal) * 100);
  }

  protected readonly getPercentEvaluatedTickets = () => 
    roundPercentageValue(this.dadosMes?.atividades?.total, this.evaluatedTicketsPercent);

  get metaMacrosTime() {
    // Usa a configuração dinâmica se disponível, senão usa o valor hardcoded como fallback
    return this.goalsConfig?.individualMonthlyGoal ? this.goalsConfig.individualMonthlyGoal * 4 : 100 * 4;
  }

  get tipoConsulta() {
    return TIPO_CONSULTA_TIME;
  }

  async loadAliases() {
    this.aliases = await this.aliasService.getAliases();
  }

  get deliveryAlias(): string {
    return this.aliases?.deliveryAlias || 'Entregas';
  }

  // Getters para facilitar o acesso às configurações de metas no template
  get individualMonthlyGoal(): number {
    return this.goalsConfig?.individualMonthlyGoal || 100;
  }

  get teamMonthlyGoal(): number {
    return this.goalsConfig?.teamMonthlyGoal || 400;
  }

  get maxLevel(): number {
    return (this.goalsConfig?.maxLevel || 1) * (this.qtdeColaboradores || 1);
  }

  get pointsPerLevel(): number {
    return this.goalsConfig?.pointsPerLevel || 500;
  }

  /**
   * Verifica se as configurações de metas estão disponíveis
   */
  get goalsConfigReady(): boolean {
    return this.goalsConfig !== null && !this.goalsConfigLoading;
  }

  /**
   * Carrega as configurações de metas do sistema
   */
  async loadGoalsConfig() {
    try {
      this.goalsConfigLoading = true;
      this.goalsConfig = await this.goalsConfigService.getGoalsConfig();
    } catch (error) {
      console.error('Erro ao carregar configurações de metas no componente:', error);
    } finally {
      this.goalsConfigLoading = false;
    }
  }

  async defineDetalhesNivelMetaDoTime() {
    // Aguarda os dados do time e dos colaboradores
    if (!this.dadosMes || !this.goalsConfig) {
      // Se ainda não carregou os dados necessários, não faz nada
      return;
    }

    // Aguarda a Promise para obter o array de colaboradores
    const colaboradores = await this.acessoService.colaboradoresGestor(this.idTime);
    this.qtdeColaboradores = colaboradores.length;

    // Agora sim, pode calcular os valores corretamente
    const nivelAtual = Math.floor(this.dadosMes.pontos / (this.goalsConfig.pointsPerLevel || 1));
    const maxLevel = (this.goalsConfig.maxLevel * this.qtdeColaboradores);
    // const diferencaNiveisMax = nivelAtual - maxLevel;

    // Exemplo de tema, ajuste conforme sua lógica
    const tema = nivelAtual >= maxLevel ? 'gold' : 'red';

    this.nivelMeta = {
      nivel: nivelAtual,
      maxLevel: maxLevel,
      tema: tema
    };
  }

  isLevelsEnabled(): boolean {
    return this.featuresService.isLevelsEnabled();
  }
}
