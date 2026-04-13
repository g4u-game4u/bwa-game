import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from "@ng-bootstrap/ng-bootstrap";
import { FeaturesService } from '@services/features.service';
import { SeasonDatesService } from "@services/season-dates.service";
import { SystemParamsService } from '@services/system-params.service';
import { TemporadaDashboard } from 'src/app/model/temporadaDashboard.model';
import { SessaoProvider } from 'src/app/providers/sessao/sessao.provider';
import { AliasService, SystemAliases } from 'src/app/services/alias.service';
import { TemporadaService } from '@services/temporada.service';
import { FreeChallengeAllowedTeam, FreeChallengeAllowedRole } from 'src/app/model/system-params.model';
import { ModalGerenciarPontosAvulsosProvider } from "../../../providers/modal-gerenciar-pontos-avulsos.provider";
import { TIPO_CONSULTA_TIME } from "../dashboard.component";
import { ModalDetalheExecutorComponent } from "./modal-detalhe-executor/modal-detalhe-executor.component";
import { environment } from 'src/environments/environment';

@Component({
  selector: 'page-season',    
  templateUrl: './season.component.html',
  styleUrls: ['./season.component.scss']
})
export class SeasonComponent implements OnInit, OnChanges {
  protected readonly Math = Math;
  protected readonly String = String;

  @Input()
  collapse: boolean = false;

  @Input()
  idConsulta: number | any;

  @Input()
  nomeConsulta: string | any;

  @Input()
  tipoConsulta: number | any;

  @Input()
  time: { id: number; nome: string } | any;

  @Input()
  isCSLayout: boolean = false;

  @Input()
  showTeamGoal?: boolean = false;

  @Output()
  seasonData = new EventEmitter<TemporadaDashboard>();

  seasonInfo: TemporadaDashboard | any;

  teamSeasonLevel: number | any;

  apiReady = false;
  apiTeamReady = false;
  showValues = false;

  clientLogoUrl: string | null = null;

  // Propriedades para os aliases
  aliases: SystemAliases | null = null;
  aliasesLoading = false;

  // Propriedades para as datas da temporada
  seasonDates: { start: Date; end: Date } | null = null;
  seasonDatesLoading = false;

  // Propriedades para o client_id
  clientId: string | null = null;
  clientIdLoading = false;

  /**
   * Carteira de pontos da temporada montada no front (action-template-pontos.md),
   * agregando o action_log no intervalo real da temporada — jogador ou time.
   */
  seasonPointsWallet: { total: number; bloqueados: number; desbloqueados: number } | null = null;
  seasonWalletLoading = false;

  // Propriedades para verificação de permissão de times
  freeChallengesAllowedTeams: FreeChallengeAllowedTeam[] | null = null;
  freeChallengesAllowedTeamsLoading = false;

  // Propriedades para verificação de permissão de roles
  freeChallengesAllowedRoles: FreeChallengeAllowedRole[] | null = null;
  restrictFreeChallengesByRole: boolean = false;
  freeChallengesRolesLoading = false;

  /** Chave estável do contexto (colaborador/time) — ignora churn de collapse, nomeConsulta, showTeamGoal, etc. */
  private lastSeasonLoadKey: string | null = null;
  /** Invalida callbacks HTTP quando um novo carregamento é pedido. */
  private seasonDataLoadGeneration = 0;

  constructor(
    private modal: NgbModal,
    private temporadaService: TemporadaService,
    private sessao: SessaoProvider,
    private seasonDatesService: SeasonDatesService,
    private aliasService: AliasService,
    private featuresService: FeaturesService,
    private router: Router,
    private systemParamsService: SystemParamsService,
    private modalGerenciarPontosAvulsosProvider: ModalGerenciarPontosAvulsosProvider
  ) {
  }

  async ngOnInit() {
    this.loadAliases();
    this.loadSeasonDates();
    this.loadClientInfo();
    this.loadClientId();
    this.loadFreeChallengesAllowedTeams();
    this.loadFreeChallengesRoles();
  }

  /**
   * Recarrega só quando o contexto real muda (quem está selecionado). Qualquer outro @Input
   * (collapse, nomeConsulta, showTeamGoal, nova referência de `time` com o mesmo id) não dispara API.
   */
  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.idConsulta) {
      this.lastSeasonLoadKey = null;
      this.seasonDataLoadGeneration++;
      this.apiReady = false;
      this.apiTeamReady = false;
      this.seasonPointsWallet = null;
      this.seasonWalletLoading = false;
      return;
    }

    const key = this.seasonLoadKey();
    if (key === this.lastSeasonLoadKey) {
      return;
    }

    this.lastSeasonLoadKey = key;
    this.seasonDataLoadGeneration++;
    const loadGen = this.seasonDataLoadGeneration;

    this.apiReady = false;
    this.apiTeamReady = false;

    this.getDadosTemporada(loadGen);
    if (this.seasonDates?.start && this.seasonDates?.end) {
      void this.recalculateSeasonWalletFromTemplate(loadGen);
    }
  }

  private seasonLoadKey(): string {
    const t = this.time;
    const teamPart =
      t == null || t === ''
        ? ''
        : typeof t === 'object' && t !== null && 'id' in (t as object)
          ? String((t as { id?: unknown }).id ?? '')
          : String(t);
    return `${String(this.tipoConsulta ?? '')}|${String(this.idConsulta ?? '')}|${teamPart}`;
  }

  private getDadosTemporada(loadGen: number): void {
    const range =
      this.seasonDates?.start && this.seasonDates?.end
        ? {
            start: new Date(this.seasonDates.start).toISOString(),
            end: new Date(this.seasonDates.end).toISOString()
          }
        : undefined;
    void this.temporadaService
      .getDadosTemporadaDashboard(this.idConsulta, this.tipoConsulta, range)
      .then(data => {
        if (loadGen !== this.seasonDataLoadGeneration) {
          return;
        }
        this.seasonData.emit(data);
        this.seasonInfo = data;
        this.apiReady = true;
      });
  }

  get isTeam() {
    return this.tipoConsulta === TIPO_CONSULTA_TIME
  }

  getPercentPontosBloqueados() {
    const w = this.seasonPointsWallet;
    if (!w) {
      return 0;
    }
    const totalPontos = w.bloqueados + w.desbloqueados;
    if (totalPontos <= 0) {
      return 0;
    }
    return Math.floor((w.bloqueados / totalPontos) * 100);
  }

  extratoTemporadaBeta() {
    let md = this.modal.open(ModalDetalheExecutorComponent, {size: 'xl'});
    md.componentInstance.idConsulta = this.idConsulta;
  }

  abrirModalInserirAtividade() {
    // Detectar se é contexto de time ou colaborador
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      // Contexto de time
      this.modalGerenciarPontosAvulsosProvider.abreModalTime(
        this.time?.id,
        this.sessao.usuario?.email
      );
    } else {
      // Contexto de colaborador
      this.modalGerenciarPontosAvulsosProvider.abreModalColaborador(
        this.idConsulta,
        this.nomeConsulta,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar atividades pendentes
   */
  abrirModalPendentes() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalPendentes(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalPendentes(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar atividades finalizadas
   */
  abrirModalFinalizadas() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalFinalizadas(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalFinalizadas(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar atividades aprovadas
   */
  abrirModalAprovadas() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalAprovadas(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalAprovadas(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar atividades canceladas
   */
  abrirModalCanceladas() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalCanceladas(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalCanceladas(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para criar novas atividades
   */
  abrirModalCriar() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalCriar(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalCriar(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar processos
   */
  abrirModalProcessos() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessos(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessos(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar tarefas
   */
  abrirModalTarefas() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalTarefas(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalTarefas(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar processos incompletos
   */
  abrirModalProcessosIncompletos() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosIncompletos(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosIncompletos(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar processos entregues
   */
  abrirModalProcessosEntregues() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosEntregues(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosEntregues(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar processos pendentes
   */
  abrirModalProcessosPendentes() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosPendentes(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosPendentes(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  /**
   * Abre o modal para visualizar processos cancelados
   */
  abrirModalProcessosCancelados() {
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    if (isTeamContext) {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosCancelados(
        this.time?.id,
        undefined,
        undefined,
        true,
        this.sessao.usuario?.email
      );
    } else {
      this.modalGerenciarPontosAvulsosProvider.abreModalProcessosCancelados(
        undefined,
        this.idConsulta,
        this.nomeConsulta,
        false,
        this.sessao.usuario?.email
      );
    }
  }

  get hideExtratoTemporadaBeta() {
    return this.sessao.isGerente()
  }

  /**
   * Carrega as datas da temporada
   */
  async loadSeasonDates() {
    try {
      this.seasonDatesLoading = true;
      this.seasonDates = await this.seasonDatesService.getSeasonDates();
    } catch (error) {
      console.error('Erro ao carregar datas da temporada:', error);
      this.seasonDates = {
        start: new Date(2026, 2, 1),
        end: new Date(2026, 3, 30, 23, 59, 59, 999)
      };
    } finally {
      this.seasonDatesLoading = false;
      const gen = this.seasonDataLoadGeneration;
      void this.recalculateSeasonWalletFromTemplate(gen);
    }
  }

  private async recalculateSeasonWalletFromTemplate(loadGen: number): Promise<void> {
    if (loadGen !== this.seasonDataLoadGeneration) {
      return;
    }
    if (!this.idConsulta || !this.seasonDates?.start || !this.seasonDates?.end) {
      this.seasonPointsWallet = null;
      this.seasonWalletLoading = false;
      return;
    }

    const rangeStart = new Date(this.seasonDates.start);
    const rangeEnd = new Date(this.seasonDates.end);
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      this.seasonPointsWallet = null;
      return;
    }

    this.seasonWalletLoading = true;
    try {
      const dash = await this.temporadaService.getDadosTemporadaDashboard(
        this.idConsulta,
        this.tipoConsulta,
        { start: rangeStart.toISOString(), end: rangeEnd.toISOString() }
      );
      if (loadGen !== this.seasonDataLoadGeneration) {
        return;
      }
      const bloq = Math.floor(Number(dash.blocked_points) || 0);
      const desb = Math.floor(Number(dash.unblocked_points) || 0);
      this.seasonPointsWallet = {
        total: bloq + desb,
        bloqueados: bloq,
        desbloqueados: desb
      };
    } catch (error) {
      console.error('Erro ao montar carteira de pontos da temporada (/game/stats):', error);
      if (loadGen === this.seasonDataLoadGeneration) {
        this.seasonPointsWallet = { total: 0, bloqueados: 0, desbloqueados: 0 };
      }
    } finally {
      if (loadGen === this.seasonDataLoadGeneration) {
        this.seasonWalletLoading = false;
      }
    }
  }

  get totalSeasonPoints(): number {
    return Math.floor(this.seasonPointsWallet?.total ?? 0);
  }

  get displaySeasonBlockedPoints(): number {
    return Math.floor(this.seasonPointsWallet?.bloqueados ?? 0);
  }

  get displaySeasonUnblockedPoints(): number {
    return Math.floor(this.seasonPointsWallet?.desbloqueados ?? 0);
  }

  /**
   * Verifica se as datas da temporada estão disponíveis
   */
  get seasonDatesReady(): boolean {
    return this.seasonDates !== null && !this.seasonDatesLoading;
  }

  // Getters para facilitar o acesso aos aliases no template
  get pointAlias(): string {
    return this.aliases?.pointAlias || 'Pontos';
  }

  get coinsAlias(): string {
    return this.aliases?.coinsAlias || 'Moedas';
  }

  get deliveryAlias(): string {
    return this.aliases?.deliveryAlias || 'Entregas';
  }

  get actionAlias(): string {
    return this.aliases?.actionAlias || 'Ações';
  }

  /**
   * Verifica se os aliases estão disponíveis
   */
  get aliasesReady(): boolean {
    return this.aliases !== null && !this.aliasesLoading;
  }

  isVirtualStoreEnabled(): boolean {
    return this.featuresService.isVirtualStoreEnabled();
  }
  
  get isFreeChallengeEnabled(): boolean {
    return this.featuresService.isFreeChallengeEnabled();
  }

  /**
   * Carrega os aliases do sistema
   */
  async loadAliases() {
    try {
      this.aliasesLoading = true;
      this.aliases = await this.aliasService.getAliases();
    } catch (error) {
      console.error('Erro ao carregar aliases no componente season:', error);
    } finally {
      this.aliasesLoading = false;
    }
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }

  get currentUrl(): string {
    return this.router.url;
  }
  
  private async loadClientInfo() {
    try {
      this.clientLogoUrl = await this.systemParamsService.getParam<string>('client_dark_logo_url') || null;
    } catch (error) {
      console.error('Erro ao carregar informações do cliente:', error);
    }
  }

  /**
   * Carrega o client_id dos parâmetros do sistema
   * Usa client_name como fallback e depois environment
   */
  private async loadClientId() {
    try {
      this.clientIdLoading = true;
      // Tenta obter o client_name primeiro
      const clientName = await this.systemParamsService.getParam<string>('client_name');
      this.clientId = clientName || environment.client_id || null;
    } catch (error) {
      console.error('Erro ao carregar client_id:', error);
      // Fallback para o environment caso não consiga carregar do system params
      this.clientId = environment.client_id || null;
    } finally {
      this.clientIdLoading = false;
    }
  }

  /**
   * Carrega a lista de times permitidos para desafios livres
   */
  async loadFreeChallengesAllowedTeams() {
    try {
      this.freeChallengesAllowedTeamsLoading = true;
      const systemParams = await this.systemParamsService.getSystemParams();
      this.freeChallengesAllowedTeams = systemParams.free_challenges_allowed_teams || null;
    } catch (error) {
      console.error('Erro ao carregar times permitidos para desafios livres:', error);
      this.freeChallengesAllowedTeams = null;
    } finally {
      this.freeChallengesAllowedTeamsLoading = false;
    }
  }

  /**
   * Carrega a lista de roles permitidas para desafios livres
   */
  async loadFreeChallengesRoles() {
    try {
      this.freeChallengesRolesLoading = true;
      const systemParams = await this.systemParamsService.getSystemParams();
      this.freeChallengesAllowedRoles = systemParams.free_challenges_allowed_roles || null;
      this.restrictFreeChallengesByRole = systemParams.restrict_free_challenges_by_role?.value === true;
    } catch (error) {
      console.error('Erro ao carregar roles permitidas para desafios livres:', error);
      this.freeChallengesAllowedRoles = null;
      this.restrictFreeChallengesByRole = false;
    } finally {
      this.freeChallengesRolesLoading = false;
    }
  }

  /**
   * Verifica se o time tem permissão para visualizar o modal de pontos avulsos
   * @param teamId ID do time a ser verificado (number ou string)
   * @returns true se o time tem permissão, false caso contrário
   */
  isTeamAllowedForFreeChallenges(teamId: number | string | undefined): boolean {
    if (!teamId || !this.freeChallengesAllowedTeams || this.freeChallengesAllowedTeams.length === 0) {
      return false;
    }

    // Converte teamId para string para comparação
    const teamIdString = String(teamId);
    
    // Busca o time na lista de times permitidos
    const team = this.freeChallengesAllowedTeams.find(
      (t) => String(t.team_id.value) === teamIdString
    );

    // Retorna true apenas se o time foi encontrado E tem allowed.value === true
    return team?.allowed?.value === true;
  }

  /**
   * Verifica se o role do usuário está permitido para acessar free challenges
   * ADMIN sempre tem acesso (se o free challenge estiver ativo para o time)
   * @returns true se o role está permitido, false caso contrário
   */
  isRoleAllowedForFreeChallenges(): boolean {
    // Se a restrição por role não está ativada, todos têm acesso (apenas verificação de time)
    if (!this.restrictFreeChallengesByRole) {
      return true;
    }

    // ADMIN sempre tem acesso
    if (this.sessao.isAdmin()) {
      return true;
    }

    // Se não há lista de roles permitidas, não permite acesso (exceto ADMIN já tratado acima)
    if (!this.freeChallengesAllowedRoles || this.freeChallengesAllowedRoles.length === 0) {
      return false;
    }

    // Determina o role atual do usuário
    let userRole: string | null = null;
    if (this.sessao.isGerente()) {
      userRole = 'GESTOR';
    } else if (this.sessao.isColaborador()) {
      userRole = 'PLAYER';
    }

    // Se não foi possível determinar o role, não permite acesso
    if (!userRole) {
      return false;
    }

    // Busca o role na lista de roles permitidas
    const roleConfig = this.freeChallengesAllowedRoles.find(
      (r) => r.role?.value === userRole
    );

    // Retorna true apenas se o role foi encontrado E tem allowed.value === true
    return roleConfig?.allowed?.value === true;
  }

  /**
   * Verifica se a feature de desafios livres está habilitada
   * para determinar se deve mostrar o modal de gerenciar pontos avulsos
   */
  get shouldShowManagePointsModal(): boolean {
    // Primeiro verifica se a feature está habilitada
    if (!this.isFreeChallengeEnabled) {
      return false;
    }

    // Se não há lista de times permitidos, não mostra o modal
    if (!this.freeChallengesAllowedTeams || this.freeChallengesAllowedTeams.length === 0) {
      return false;
    }

    // Verifica o contexto (time ou colaborador)
    const isTeamContext = this.tipoConsulta === TIPO_CONSULTA_TIME;
    
    // Verifica se o time tem permissão
    const teamAllowed = isTeamContext
      ? this.isTeamAllowedForFreeChallenges(this.time?.id)
      : this.isTeamAllowedForFreeChallenges(this.sessao.usuario?.team_id);

    if (!teamAllowed) {
      return false;
    }

    // Verifica se o role do usuário está permitido
    return this.isRoleAllowedForFreeChallenges();
  }

  /**
   * Executa logout do usuário
   */
  sair() {
    this.sessao.logout();
  }
}

