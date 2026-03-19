import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { PontosAvulsosService, ActionTemplate, AtividadeDetalhe, PaginatedResponse } from '../../services/pontos-avulsos.service';
import { ModalConfirmarAprovacaoComponent } from './modal-confirmar-aprovacao/modal-confirmar-aprovacao.component';
import { ModalConfirmarBloqueioComponent } from './modal-confirmar-bloqueio/modal-confirmar-bloqueio.component';
import { ModalMotivoCancelamentoComponent } from './modal-confirmar-cancelamento/modal-motivo-cancelamento.component';
import { AliasService } from '@services/alias.service';
import {SessaoProvider} from '@providers/sessao/sessao.provider';
import { ModalMotivoReprovacaoComponent } from './modal-confirmar-reprovacao/modal-motivo-reprovacao.component';
import { ModalConfirmarCancelarDeliveryComponent } from './modal-confirmar-cancelar-delivery/modal-confirmar-cancelar-delivery.component';
import { ModalConfirmarCompletarDeliveryComponent } from './modal-confirmar-completar-delivery/modal-confirmar-completar-delivery.component';
import { ModalConfirmarDesfazerDeliveryComponent } from './modal-confirmar-desfazer-delivery/modal-confirmar-desfazer-delivery.component';
import { ModalConfirmarRestaurarDeliveryComponent } from './modal-confirmar-restaurar-delivery/modal-confirmar-restaurar-delivery.component';
import { ModalConfirmarFinalizacaoComponent } from './modal-confirmar-finalizacao/modal-confirmar-finalizacao.component';
import { TypeModalData } from '../modal-pending-quests/modal-pending-quests.component';
import { BotaoSelecaoItemModel } from '../../components/c4u-botao-selecao/c4u-botao-selecao.component';
import { LoadingProvider } from '../../providers/loading.provider';
import { ToastService } from '../../services/toast.service';

export interface ModalData {
  title: string;
  typeSelected: number;
  tabSelected: number;
  types: Array<TypeModalData>
}



@Component({
  selector: 'modal-gerenciar-pontos-avulsos',
  templateUrl: './modal-gerenciar-pontos-avulsos.component.html',
  styleUrls: ['./modal-gerenciar-pontos-avulsos.component.scss']
})
export class ModalGerenciarPontosAvulsosComponent implements OnInit {
  @Input() timeId?: number;
  @Input() userId?: string; // Para contexto de colaborador
  @Input() userName?: string; // Nome do colaborador
  @Input() isTeamContext: boolean = false; // true = time, false = colaborador
  @Input() currentUserEmail?: string; // Email do usuário atual (para ações de aprovar/reprovar/cancelar)
  @Input() initialTab?: 'atribuir' | 'pendentes' | 'finalizados' | 'aprovados' | 'cancelados' | 'incompletos' | 'entregues' | 'processos-pendentes' | 'processos-cancelados';
  @Input() initialType?: number; // 0 = Processos, 1 = Tarefas, 2 = Criar

  @Input()
  data: ModalData | undefined;
  
  aba: 'atribuir' | 'pendentes' | 'finalizados' | 'aprovados' | 'cancelados' | 'incompletos' | 'entregues' | 'processos-pendentes' | 'processos-cancelados' = 'processos-pendentes';
  formAtribuir: FormGroup;
  aliases: any;

  // Propriedades para os botões de seleção
  selectedType: number = 0; // 0 = Processos, 1 = Tarefas, 2 = Criar (padrão: Processos)
  typeButtons: BotaoSelecaoItemModel[] = [
    { text: 'Processos', icon: 'icon-timeline' },
    { text: 'Tarefas', icon: 'icon-handyman' },
    { text: 'Criar', icon: 'icon-add', alignRight: true }
  ];

  // Abas disponíveis por tipo
  get availableTabs(): string[] {
    switch (this.selectedType) {
      case 0: // Processos
        return ['processos-pendentes', 'incompletos', 'entregues', 'processos-cancelados'];
      case 1: // Tarefas
        return ['pendentes', 'finalizados', 'aprovados', 'cancelados'];
      case 2: // Criar
        return ['atribuir'];
      default:
        return [];
    }
  }

  // Verificar se uma aba está disponível para o tipo atual
  isTabAvailable(tabName: string): boolean {
    return this.availableTabs.includes(tabName);
  }

  atividades: ActionTemplate[] = [];
  loadingAtividades = false;
  processandoAtribuicao = false;

  jogadores: any[] = [];
  loadingJogadores = false;

  // Dados reais de atividades pendentes
  atividadesPendentes: AtividadeDetalhe[] = [];
  loadingAtividadesPendentes = false;
  paginacaoPendentes: PaginatedResponse<AtividadeDetalhe> | null = null;

  // Dados reais de atividades finalizadas
  atividadesFinalizadas: AtividadeDetalhe[] = [];
  loadingAtividadesFinalizadas = false;
  paginacaoFinalizadas: PaginatedResponse<AtividadeDetalhe> | null = null;

  // Dados reais de atividades aprovadas
  atividadesAprovadas: AtividadeDetalhe[] = [];
  loadingAtividadesAprovadas = false;
  paginacaoAprovadas: PaginatedResponse<AtividadeDetalhe> | null = null;

  // Dados reais de atividades canceladas
  atividadesCanceladas: AtividadeDetalhe[] = [];
  loadingAtividadesCanceladas = false;
  paginacaoCanceladas: PaginatedResponse<AtividadeDetalhe> | null = null;

  // Configurações de paginação
  pageSize: number = 10; // Itens por página
  currentPagePendentes: number = 1;
  currentPageFinalizadas: number = 1;
  currentPageAprovadas: number = 1;
  currentPageCanceladas: number = 1;

  // Dados dos processos (deliveries)
  processosPendentes: any[] = [];
  processosIncompletos: any[] = [];
  processosEntregues: any[] = [];
  processosCancelados: any[] = [];
  
  // Listas originais de processos (antes da filtragem local)
  processosPendentesOriginais: any[] = [];
  processosIncompletosOriginais: any[] = [];
  processosEntreguesOriginais: any[] = [];
  processosCanceladosOriginais: any[] = [];
  
  loadingProcessosPendentes = false;
  loadingProcessosIncompletos = false;
  loadingProcessosEntregues = false;
  loadingProcessosCancelados = false;
  
  // Filtros ativos para processos
  filtrosProcessos: any = {};

  // Propriedades para upload de arquivos
  arquivosSelecionados: File[] = [];
  maxArquivos = 5;
  maxTamanhoArquivo = 10 * 1024 * 1024; // 10MB

  // Propriedades para anexos existentes
  anexosExistentes: any[] = [];
  loadingAnexos = false;
  downloadingAnexos: Set<string> = new Set(); // Controla quais anexos estão sendo baixados

  // Propriedades para detalhe da delivery
  deliverySelecionada: any = null;
  mostrarDetalheDelivery = false;
  detalheDeliveryCor = '';

  statusList = [
    { value: 'PENDING', label: 'Pendente' },
    { value: 'DOING', label: 'Em Execução' },
    { value: 'DONE', label: 'Aguardando Aprovação' },
    { value: 'DELIVERED', label: 'Aprovado' },
    { value: 'CANCELLED', label: 'Cancelada' }
  ];

  abaAnterior: string | null = null;
  atividadeSelecionada: any = null;
  mostrarDetalhe = false;
  detalheCor = '';

  // Propriedades para o seletor de executor
  novoExecutorSelecionado: string | null = null;
  atualizandoExecutor = false;
  
  // Propriedades para controle de retorno após criação de tarefa
  retornarParaDelivery: boolean = false;
  deliveryParaRetornar: any = null;
  
  // Cache do estado do detalhe do processo antes de criar tarefa
  private estadoDetalheProcessoCache: {
    deliveryId: string;
    delivery: any;
    aba: string;
    selectedType: number;
    detalheDeliveryCor: string;
    mostrarDetalheDelivery: boolean;
  } | null = null;

  // Propriedade para verificar se o usuário é PLAYER
  isPlayer: boolean = false;

  // Modo de visualização: 'personal' = apenas dados pessoais, 'team' = dados do time
  viewMode: 'personal' | 'team' = 'personal';
  
  // ID do time do jogador (obtido do usuário logado)
  playerTeamId: number | null = null;
  
  // Indica se o jogador pode ver dados do time (tem um time associado)
  canViewTeamData: boolean = false;

  // Expor Math para uso no template
  Math = Math;

  // Propriedade para controlar o loading bloqueante
  isLoadingBlocking: boolean = false;
  
  // Listener para bloquear eventos de teclado
  private keydownBlockListener?: (event: KeyboardEvent) => void;
  
  // Listener para bloquear eventos de mouse
  private mouseEventBlockListener?: (event: MouseEvent) => void;

  // Propriedades para filtros e seleção em lote
  itensSelecionadosIds: Set<string | number> = new Set();
  filtrosAtivos: any = {};
  
  // Propriedades para seleção de tarefas dentro do detalhe de processo
  tarefasSelecionadasDetalhe: Set<string | number> = new Set();
  
  // Propriedades para listas originais (antes da filtragem local)
  atividadesPendentesOriginais: AtividadeDetalhe[] = [];
  atividadesFinalizadasOriginais: AtividadeDetalhe[] = [];
  atividadesAprovadasOriginais: AtividadeDetalhe[] = [];
  atividadesCanceladasOriginais: AtividadeDetalhe[] = [];

  constructor(
    private fb: FormBuilder, 
    public activeModal: NgbActiveModal, 
    private modalService: NgbModal,
    private pontosAvulsosService: PontosAvulsosService,
    private aliasService: AliasService,
    private sessao: SessaoProvider,
    private loadingProvider: LoadingProvider,
    private toastService: ToastService
  ) {

    this.isTeamContext = !this.sessao.isColaborador();
    this.formAtribuir = this.fb.group({
      atividade: [null, Validators.required],
      jogador: [null, Validators.required],
      delivery_id: [null, Validators.required],
      delivery_title: [null, Validators.required],
      status: ['PENDING', Validators.required],
      dataFinalizacao: [null],
      quantidade: [1, [Validators.min(1)]] // Campo para PLAYER selecionar quantas atividades criar (não obrigatório)
    });

    // Configurar o espelhamento automático do título para o ID
    this.formAtribuir.get('delivery_title')?.valueChanges.subscribe(titulo => {
      if (titulo) {
        const idGerado = this.gerarIdFromTitulo(titulo);
        this.formAtribuir.patchValue({ delivery_id: idGerado }, { emitEvent: false });
      }
    });
  }

  async ngOnInit() {
    // Verificar se o usuário é PLAYER
    this.isPlayer = !!this.sessao.isColaborador();

    // Se for PLAYER, verificar se tem time associado e configurar modo de visualização
    if (this.isPlayer) {
      const usuario = this.sessao.usuario;
      if (usuario?.team_id) {
        this.playerTeamId = usuario.team_id;
        this.canViewTeamData = true;
        // Por padrão, jogadores veem apenas seus dados pessoais
        // Mas podem alternar para ver dados do time
        this.viewMode = 'personal';
        console.log('👤 Jogador detectado com time:', this.playerTeamId);
      } else {
        this.canViewTeamData = false;
        console.log('👤 Jogador sem time associado');
      }
    }

    await Promise.all([
      this.carregarAtividades(),
      this.carregarJogadores(),
      this.loadAliases()
    ]);

    // Se for contexto de colaborador sem time, pré-selecionar o colaborador
    // (Jogadores com time serão pré-selecionados após carregar os jogadores)
    const jogadorComTime = this.isPlayer && this.playerTeamId !== null;
    if (!this.isTeamContext && !jogadorComTime && this.userId) {
      this.formAtribuir.patchValue({
        jogador: this.userId
      });
    }

    // Se o usuário for PLAYER, definir status como 'PENDING' (Pendente)
    if (this.isPlayer) {
      this.formAtribuir.patchValue({
        status: 'PENDING'
      });
    }

    // Verificar se o email do usuário atual está disponível
    if (!this.currentUserEmail) {
      console.warn('⚠️ Email do usuário atual não fornecido. As ações de aprovar/reprovar/cancelar podem não funcionar.');
      // Fallback: usar o userId como email se disponível
      this.currentUserEmail = this.userId || 'usuario@exemplo.com';
    }

    // Configurar aba e tipo inicial baseado nos dados recebidos
    if (this.initialTab) {
      this.aba = this.initialTab;
    }
    
    if (this.initialType !== undefined) {
      this.selectedType = this.initialType;
    }

    // Se a aba inicial for "pendentes" (tarefas), carregar os dados
    if (this.aba === 'pendentes') {
      this.carregarAtividadesPendentes();
    }
    
    // Se a aba inicial for "processos-pendentes", carregar os dados
    if (this.aba === 'processos-pendentes') {
      console.log('📊 Modal inicializado na aba Processos Pendentes');
      this.carregarProcessosPendentes();
    }
  }

  async carregarAtividades() {
    this.loadingAtividades = true;
    try {
      const atividades = await this.pontosAvulsosService.getActionTemplates();
      // Ordenar atividades alfabeticamente por nome
      this.atividades = atividades.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();
        return nameA.localeCompare(nameB);
      });
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
      // Aqui você pode adicionar um toast ou notificação de erro
    } finally {
      this.loadingAtividades = false;
    }
  }

  async carregarJogadores() {
    this.loadingJogadores = true;
    try {
      const context = this.getCurrentContext();
      
      // Se for contexto de time ou jogador com time, carregar todos os membros do time
      let timeIdParaBuscar: number | undefined;
      
      if (context.isTeamContext && context.timeId) {
        // Contexto de time (gestor/admin)
        timeIdParaBuscar = context.timeId;
      } else if (this.isPlayer && this.playerTeamId) {
        // Jogador com time - usar o time do jogador
        timeIdParaBuscar = this.playerTeamId;
        console.log('👤 Carregando jogadores do time do jogador:', timeIdParaBuscar);
      }
      
      if (timeIdParaBuscar) {
        // Buscar usuários do endpoint /team/{id}/users
        const todosJogadores = await this.pontosAvulsosService.getUsers(timeIdParaBuscar);
        
        // Filtrar apenas usuários ativos (deactivated_at deve ser null)
        this.jogadores = todosJogadores.filter((jogador: any) => {
          return jogador.deactivated_at === null || jogador.deactivated_at === undefined;
        });
        
        console.log('Usuários ativos do time carregados:', this.jogadores);
        
        // Se houver uma atividade selecionada, atualizar o seletor de executor
        if (this.atividadeSelecionada?.user_email) {
          const jogadorEncontrado = this.jogadores.find(j => 
            j.email === this.atividadeSelecionada.user_email || 
            (j.id || j._id || j.email) === this.atividadeSelecionada.user_email
          );
          
          if (jogadorEncontrado) {
            this.novoExecutorSelecionado = jogadorEncontrado.id || jogadorEncontrado._id || jogadorEncontrado.email;
          } else {
            this.novoExecutorSelecionado = this.atividadeSelecionada.user_email;
          }
        }
        
        // Se for jogador com time, pré-selecionar o próprio jogador
        if (this.isPlayer && this.userId && this.jogadores.length > 0) {
          this.preSelecionarJogadorAtual();
        }
      } else {
        // Contexto de colaborador sem time - usar apenas o colaborador atual
        if (!this.userId || !this.userName) {
          console.error('userId ou userName não fornecidos para contexto de colaborador');
          return;
        }
        
        // Criar objeto do colaborador atual
        this.jogadores = [{
          id: this.userId,
          email: this.userId,
          name: this.userName,
          full_name: this.userName
        }];
        console.log('Colaborador carregado:', this.jogadores);
      }
    } catch (error) {
      console.error('Erro ao carregar jogadores:', error);
      // Aqui você pode adicionar um toast ou notificação de erro
    } finally {
      this.loadingJogadores = false;
    }
  }

  async carregarAtividadesPendentes(page: number = this.currentPagePendentes) {
    this.loadingAtividadesPendentes = true;
    this.currentPagePendentes = page;
    try {
      const context = this.getCurrentContext();
      const response = await this.pontosAvulsosService.getAtividadesPendentesModal(
        context.timeId,
        context.userId,
        context.isTeamContext,
        page,
        this.pageSize,
        this.filtrosAtivos
      );
      
      // Sempre atribuir paginacao ANTES de aplicar filtros locais
      this.paginacaoPendentes = response;
      this.atividadesPendentesOriginais = response.items;
      
      // Aplicar filtros locais se houver busca por texto (após atribuir paginação)
      const temFiltroData = !!(this.filtrosAtivos?.created_at_start || this.filtrosAtivos?.created_at_end || 
                               this.filtrosAtivos?.finished_at_start || this.filtrosAtivos?.finished_at_end);
      if (this.filtrosAtivos?.busca && !temFiltroData && !this.filtrosAtivos?.executor) {
        // Quando há busca local, não mostrar paginação do servidor
        // mas manter os dados originais para filtragem
        this.aplicarFiltrosLocais();
      } else {
        this.atividadesPendentes = response.items;
      }
      
      const temFiltrosBackendResult = this.temFiltrosBackend();
      const shouldShowPagination = this.paginacaoPendentes && 
                                   this.paginacaoPendentes.totalPages > 1 && 
                                   !this.loadingAtividadesPendentes && 
                                   temFiltrosBackendResult;
      
      console.log('📊 Atividades pendentes carregadas:', {
        total: response.total,
        pagina: response.page,
        itens: response.items.length,
        totalPages: response.totalPages,
        paginacaoPendentes: this.paginacaoPendentes,
        paginacaoPendentesTotalPages: this.paginacaoPendentes?.totalPages,
        loading: this.loadingAtividadesPendentes,
        temFiltrosBackend: temFiltrosBackendResult,
        shouldShowPagination: shouldShowPagination,
        filtrosAtivos: this.filtrosAtivos,
        filtrosAtivosKeys: Object.keys(this.filtrosAtivos || {}),
        filtrosAtivosEmpty: Object.keys(this.filtrosAtivos || {}).length === 0
      });
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar atividades pendentes:', error);
      this.atividadesPendentes = [];
      this.paginacaoPendentes = null;
    } finally {
      this.loadingAtividadesPendentes = false;
    }
  }

  async carregarAtividadesFinalizadas(page: number = this.currentPageFinalizadas) {
    this.loadingAtividadesFinalizadas = true;
    this.currentPageFinalizadas = page;
    try {
      const context = this.getCurrentContext();
      const response = await this.pontosAvulsosService.getAtividadesFinalizadasModal(
        context.timeId || 0,
        context.userId || '',
        context.isTeamContext,
        page,
        this.pageSize,
        this.filtrosAtivos
      );
      
      // Sempre atribuir paginacao ANTES de aplicar filtros locais
      this.paginacaoFinalizadas = response;
      this.atividadesFinalizadasOriginais = response.items;
      
      // Aplicar filtros locais se houver busca por texto (após atribuir paginação)
      const temFiltroData = !!(this.filtrosAtivos?.created_at_start || this.filtrosAtivos?.created_at_end || 
                               this.filtrosAtivos?.finished_at_start || this.filtrosAtivos?.finished_at_end);
      if (this.filtrosAtivos?.busca && !temFiltroData && !this.filtrosAtivos?.executor) {
        // Quando há busca local, não mostrar paginação do servidor
        // mas manter os dados originais para filtragem
        this.aplicarFiltrosLocais();
      } else {
        this.atividadesFinalizadas = response.items;
      }
      
      console.log('📊 Atividades finalizadas carregadas:', {
        total: response.total,
        pagina: response.page,
        itens: response.items.length,
        totalPages: response.totalPages,
        paginacaoFinalizadas: this.paginacaoFinalizadas,
        paginacaoFinalizadasTotalPages: this.paginacaoFinalizadas?.totalPages,
        loading: this.loadingAtividadesFinalizadas,
        shouldShowPagination: this.paginacaoFinalizadas && this.paginacaoFinalizadas.totalPages > 1 && !this.loadingAtividadesFinalizadas,
        filtrosAtivos: this.filtrosAtivos
      });
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar atividades aguardando aprovação:', error);
      this.atividadesFinalizadas = [];
      this.paginacaoFinalizadas = null;
    } finally {
      this.loadingAtividadesFinalizadas = false;
    }
  }

  async carregarAtividadesAprovadas(page: number = this.currentPageAprovadas) {
    this.loadingAtividadesAprovadas = true;
    this.currentPageAprovadas = page;
    try {
      console.log('🔄 Modal - Iniciando carregamento de atividades aprovadas...');
      console.log('📋 Parâmetros:', { 
        timeId: this.timeId, 
        userId: this.userId, 
        isTeamContext: this.isTeamContext,
        page: page,
        limit: this.pageSize
      });
      
      const context = this.getCurrentContext();
      const response = await this.pontosAvulsosService.getAtividadesAprovadasModal(
        context.timeId || 0,
        context.userId || '',
        context.isTeamContext,
        page,
        this.pageSize,
        this.filtrosAtivos
      );
      
      // Sempre atribuir paginacao ANTES de aplicar filtros locais
      this.paginacaoAprovadas = response;
      this.atividadesAprovadasOriginais = response.items;
      
      // Aplicar filtros locais se houver busca por texto (após atribuir paginação)
      const temFiltroData = !!(this.filtrosAtivos?.created_at_start || this.filtrosAtivos?.created_at_end || 
                               this.filtrosAtivos?.finished_at_start || this.filtrosAtivos?.finished_at_end);
      if (this.filtrosAtivos?.busca && !temFiltroData && !this.filtrosAtivos?.executor) {
        // Quando há busca local, não mostrar paginação do servidor
        // mas manter os dados originais para filtragem
        this.aplicarFiltrosLocais();
      } else {
        this.atividadesAprovadas = response.items;
      }
      
      console.log('✅ Modal - Atividades aprovadas carregadas:', {
        total: response.total,
        pagina: response.page,
        itens: response.items.length,
        totalPages: response.totalPages,
        paginacaoAprovadas: this.paginacaoAprovadas,
        paginacaoAprovadasTotalPages: this.paginacaoAprovadas?.totalPages,
        loading: this.loadingAtividadesAprovadas,
        shouldShowPagination: this.paginacaoAprovadas && this.paginacaoAprovadas.totalPages > 1 && !this.loadingAtividadesAprovadas,
        filtrosAtivos: this.filtrosAtivos
      });
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar atividades aprovadas:', error);
      this.atividadesAprovadas = [];
      this.paginacaoAprovadas = null;
    } finally {
      this.loadingAtividadesAprovadas = false;
    }
  }

  async carregarAtividadesCanceladas(page: number = this.currentPageCanceladas) {
    this.loadingAtividadesCanceladas = true;
    this.currentPageCanceladas = page;
    try {
      console.log('🔄 Modal - Iniciando carregamento de atividades canceladas...');
      console.log('📋 Parâmetros:', { 
        timeId: this.timeId, 
        userId: this.userId, 
        isTeamContext: this.isTeamContext,
        page: page,
        limit: this.pageSize
      });
      
      const context = this.getCurrentContext();
      const response = await this.pontosAvulsosService.getAtividadesCanceladasModal(
        context.timeId,
        context.userId,
        context.isTeamContext,
        page,
        this.pageSize,
        this.filtrosAtivos
      );
      
      // Sempre atribuir paginacao ANTES de aplicar filtros locais
      this.paginacaoCanceladas = response;
      this.atividadesCanceladasOriginais = response.items;
      
      // Aplicar filtros locais se houver busca por texto (após atribuir paginação)
      const temFiltroData = !!(this.filtrosAtivos?.created_at_start || this.filtrosAtivos?.created_at_end || 
                               this.filtrosAtivos?.finished_at_start || this.filtrosAtivos?.finished_at_end);
      if (this.filtrosAtivos?.busca && !temFiltroData && !this.filtrosAtivos?.executor) {
        // Quando há busca local, não mostrar paginação do servidor
        // mas manter os dados originais para filtragem
        this.aplicarFiltrosLocais();
      } else {
        this.atividadesCanceladas = response.items;
      }
      
      console.log('✅ Modal - Atividades canceladas carregadas:', {
        total: response.total,
        pagina: response.page,
        itens: response.items.length,
        totalPages: response.totalPages,
        paginacaoCanceladas: this.paginacaoCanceladas,
        paginacaoCanceladasTotalPages: this.paginacaoCanceladas?.totalPages,
        loading: this.loadingAtividadesCanceladas,
        filtrosAtivos: this.filtrosAtivos
      });
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar atividades canceladas:', error);
      this.atividadesCanceladas = [];
      this.paginacaoCanceladas = null;
    } finally {
      this.loadingAtividadesCanceladas = false;
    }
  }

  // Método para formatar email para nome
  formatEmailToName(email: string | undefined): string {
    if (!email) return 'N/A';
    
    // Remove a parte do domínio do email
    const namePart = email.split('@')[0];
    
    // Verifica se o nome contém um ponto final
    if (namePart.includes('.')) {
      // Se contém ponto, separa por ponto e capitaliza ambas as partes
      const parts = namePart.split('.');
      return parts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    } else {
      // Se não contém ponto, capitaliza somente o primeiro nome
      return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
    }
  }

    // Método para verificar se uma atividade está aprovada
    isAtividadeAprovada(atividade: any): boolean {
      return atividade?.approved === true;
    }

  // Método para obter o status traduzido
  getStatusLabel(status: string | undefined, atividade?: any): string {
    if (!status) return 'N/A';
    
    // Se a atividade está dismissed, mostrar como cancelada
    if (atividade?.dismissed === true) {
      return 'Cancelada';
    }
    
    switch (status) {
      case 'PENDING': return 'Pendente';
      case 'DOING': return 'Em progresso';
      case 'DONE': 
        // Se uma atividade foi passada, usar ela para verificar aprovação
        if (atividade) {
          return this.isAtividadeAprovada(atividade) ? 'Aprovado' : 'Aguardando Aprovação';
        }
        // Caso contrário, usar a atividade selecionada (para compatibilidade)
        return this.isAtividadeAprovada(this.atividadeSelecionada) ? 'Aprovado' : 'Aguardando Aprovação';
      case 'DELIVERED': return 'Entregue'; // Status DELIVERED agora é usado apenas para deliveries completadas
      case 'LOST': return 'Perdido';
      case 'CANCELLED': return 'Cancelado';
      case 'INCOMPLETE': return 'Incompleto';
      default: return status;
    }
  }

  // Método para obter a classe CSS do status
  getStatusClass(status: string | undefined, atividade?: any): string {
    if (!status) return '';
    
    // Se a atividade está dismissed, aplicar classe de cancelado
    if (atividade?.dismissed === true) {
      return 'statusCancelled';
    }
    
    switch (status) {
      case 'PENDING': return 'statusPending';
      case 'DOING': return 'statusDoing';
      case 'DONE': return 'statusDone';
      case 'DELIVERED': return 'statusDelivered';
      case 'LOST': return 'statusLost';
      case 'CANCELLED': return 'statusCancelled';
      case 'INCOMPLETE': return 'statusIncomplete';
      default: return '';
    }
  }

  async atribuirAtividade() {
    // Prevenir execução múltipla
    if (this.processandoAtribuicao) {
      console.log('⚠️ Processamento de atribuição já em andamento, ignorando requisição duplicada');
      return;
    }

    if (this.formAtribuir.valid) {
      this.processandoAtribuicao = true;
      this.isLoadingBlocking = true;
      this.loadingProvider.show = true;
      
      // Bloquear eventos de mouse e teclado
      document.body.style.pointerEvents = 'none';
      document.body.style.userSelect = 'none';
      
      // Bloquear eventos de teclado (exceto F5 e Ctrl+R para reload)
      this.keydownBlockListener = (event: KeyboardEvent): void => {
        // Permitir apenas F5 e Ctrl+R (reload da página)
        const isReload = event.key === 'F5' || 
                        (event.ctrlKey && event.key === 'r') ||
                        (event.ctrlKey && event.key === 'R');
        
        if (!isReload) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      
      document.addEventListener('keydown', this.keydownBlockListener, true);
      
      // Bloquear eventos de mouse também
      this.mouseEventBlockListener = (event: MouseEvent): void => {
        // Permitir apenas se o usuário tentar fechar a aba/navegador (não implementado, mas manter o listener)
        event.stopPropagation();
      };
      
      document.addEventListener('mousedown', this.mouseEventBlockListener, true);
      document.addEventListener('mouseup', this.mouseEventBlockListener, true);
      document.addEventListener('click', this.mouseEventBlockListener, true);
      document.addEventListener('contextmenu', this.mouseEventBlockListener, true);
      
      let sucessos = 0;
      let falhas = 0;
      const erros: string[] = [];
      
      try {
        const formValue = this.formAtribuir.value;
        const atividadeSelecionada = this.atividades.find(a => a.id === formValue.atividade);
        
        if (!atividadeSelecionada) {
          console.error('Atividade não encontrada');
          this.isLoadingBlocking = false;
          this.loadingProvider.show = false;
          document.body.style.pointerEvents = '';
          document.body.style.userSelect = '';
          
          // Remover listeners
          if (this.keydownBlockListener) {
            document.removeEventListener('keydown', this.keydownBlockListener, true);
            this.keydownBlockListener = undefined;
          }
          if (this.mouseEventBlockListener) {
            document.removeEventListener('mousedown', this.mouseEventBlockListener, true);
            document.removeEventListener('mouseup', this.mouseEventBlockListener, true);
            document.removeEventListener('click', this.mouseEventBlockListener, true);
            document.removeEventListener('contextmenu', this.mouseEventBlockListener, true);
            this.mouseEventBlockListener = undefined;
          }
          
          this.processandoAtribuicao = false;
          this.toastService.error('Atividade não encontrada');
          return;
        }

        // Determinar o email do jogador baseado no contexto
        let userEmail: string | null;
        if (this.isTeamContext) {
          // Verificar se foi selecionado "Unassigned"
          if (formValue.jogador === 'UNASSIGNED') {
            userEmail = null;
          } else {
            // Buscar o email do jogador selecionado no contexto de time
            const jogadorSelecionado = this.jogadores.find(j => 
              (j.id || j._id || j.email) === formValue.jogador
            );
            userEmail = jogadorSelecionado?.email || 'usuario@exemplo.com';
          }
        } else {
          // Usar o email do colaborador atual
          userEmail = this.userId || 'usuario@exemplo.com';
        }

        // Se o usuário for PLAYER, forçar o status como 'PENDING'
        const statusToUse = this.isPlayer ? 'PENDING' : formValue.status;
        
        // Preparar a data de finalização se o status for DONE e houver data
        let finishedAt: string | undefined;
        if (statusToUse === 'DONE' && formValue.dataFinalizacao) {
          finishedAt = new Date(formValue.dataFinalizacao).toISOString();
        }

        // Obter a quantidade de atividades a criar (padrão: 1)
        const quantidade = Number(formValue.quantidade) || 1;
        
        console.log(`🔄 Criando ${quantidade} atividade(s)...`);
        console.log(`📊 Valor de quantidade no formulário: ${formValue.quantidade}, convertido para número: ${quantidade}`);

        // Usar o mesmo delivery_id e delivery_title para todas as atividades
        const deliveryId = formValue.delivery_id || '';
        const deliveryTitle = formValue.delivery_title || '';
        
        // Criar múltiplas atividades conforme a quantidade informada
        for (let i = 0; i < quantidade; i++) {
          try {
            // Gerar integration_id único para cada atividade
            // Usar timestamp + índice para garantir unicidade
            const timestamp = Date.now();
            const uniqueSuffix = `${timestamp}_${i + 1}`;
            const uniqueIntegrationId = deliveryId 
              ? `${deliveryId}_${uniqueSuffix}`
              : `${atividadeSelecionada.id}_${uniqueSuffix}`;
            
            console.log(`📝 Criando atividade ${i + 1}/${quantidade} com delivery_id: ${deliveryId} e integration_id: ${uniqueIntegrationId}`);

            const payload = this.pontosAvulsosService.createProcessPayload(
              atividadeSelecionada.id,
              userEmail,
              deliveryId,
              deliveryTitle,
              statusToUse,
              finishedAt,
              undefined, // comment
              uniqueIntegrationId // integration_id único
            );

            await this.pontosAvulsosService.processAction(payload);
            
            sucessos++;
            console.log(`✅ Atividade ${i + 1}/${quantidade} atribuída com sucesso!`);
            
            // Pequeno delay entre requisições para evitar sobrecarga
            if (i < quantidade - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (error: any) {
            falhas++;
            const errorMsg = error?.message || `Erro ao criar atividade ${i + 1}`;
            erros.push(errorMsg);
            console.error(`❌ Erro ao criar atividade ${i + 1}/${quantidade}:`, error);
            
            // Continuar com as próximas requisições mesmo se uma falhar
          }
        }
        
        // Verificar se deve retornar para a delivery usando o cache
        if (this.estadoDetalheProcessoCache || (this.retornarParaDelivery && this.deliveryParaRetornar)) {
          console.log('🔄 Retornando para detalhe da delivery após atribuição');
          
          // Tentar restaurar usando o cache primeiro (mais confiável)
          const restaurado = await this.restaurarEstadoDetalheProcesso();
          
          // Se o cache não funcionou, tentar com a lógica antiga (fallback)
          if (!restaurado && this.retornarParaDelivery && this.deliveryParaRetornar) {
            console.log('🔄 Tentando restaurar usando lógica antiga (fallback)');
            
            const deliveryId = this.deliveryParaRetornar.id;
            const abaAnteriorSalva = this.abaAnterior;
            
            // Limpar estado de retorno antes de recarregar
            this.retornarParaDelivery = false;
            
            // Retornar para o tipo de processo (0)
            this.selectedType = 0;
            
            // Restaurar aba anterior
            if (abaAnteriorSalva) {
              this.aba = abaAnteriorSalva as any;
            }
            
            // Recarregar dados da aba para obter dados atualizados
            await this.onAbaChange();
            
            // Aguardar um pouco mais para garantir que os dados foram carregados
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Buscar a delivery atualizada na lista recarregada
            const deliveryAtualizada = await this.buscarDeliveryAtualizada(deliveryId);
            
            if (deliveryAtualizada) {
              console.log('✅ Delivery atualizada encontrada com', deliveryAtualizada.user_action?.length || 0, 'atividades');
              this.abrirDetalheDelivery(deliveryAtualizada);
            } else {
              console.warn('⚠️ Delivery não encontrada após recarregamento, tentando com dados originais');
              if (this.deliveryParaRetornar) {
                this.abrirDetalheDelivery(this.deliveryParaRetornar);
              }
            }
            
            // Limpar estado
            this.deliveryParaRetornar = null;
            this.abaAnterior = null;
          }
          
        } else {
          // Comportamento normal: resetar formulário e redirecionar para processos pendentes
          this.formAtribuir.reset({ status: 'PENDING', quantidade: 1 });
          
          // Redirecionar para processos pendentes após criação
          console.log('🔄 Redirecionando para lista de processos pendentes...');
          this.onTypeChange(0); // Muda para tipo "Processos"
          this.aba = 'processos-pendentes'; // Define a aba como "processos-pendentes"
          this.onAbaChange(); // Carrega os dados da aba
        }
        
        // Mostrar toast com resultado
        this.mostrarToastResultado(sucessos, falhas, quantidade);
        
      } catch (error) {
        console.error('Erro ao atribuir atividade:', error);
        this.toastService.error('Erro ao processar as requisições. Por favor, tente novamente ou contate o suporte.');
      } finally {
        // Restaurar interação do usuário
        this.isLoadingBlocking = false;
        this.loadingProvider.show = false;
        document.body.style.pointerEvents = '';
        document.body.style.userSelect = '';
        
        // Remover listener de bloqueio de teclado
        if (this.keydownBlockListener) {
          document.removeEventListener('keydown', this.keydownBlockListener, true);
          this.keydownBlockListener = undefined;
        }
        
        // Remover listeners de bloqueio de mouse
        if (this.mouseEventBlockListener) {
          document.removeEventListener('mousedown', this.mouseEventBlockListener, true);
          document.removeEventListener('mouseup', this.mouseEventBlockListener, true);
          document.removeEventListener('click', this.mouseEventBlockListener, true);
          document.removeEventListener('contextmenu', this.mouseEventBlockListener, true);
          this.mouseEventBlockListener = undefined;
        }
        
        this.processandoAtribuicao = false;
      }
    }
  }

  /**
   * Mostra toast com resultado das requisições
   */
  private mostrarToastResultado(sucessos: number, falhas: number, total: number): void {
    const alias = this.aliases?.actionAlias || 'atividade';
    const aliasPlural = `${alias}${sucessos !== 1 ? 's' : ''}`;
    
    if (sucessos === total && falhas === 0) {
      // Todas as requisições foram bem-sucedidas
      const mensagem = `${sucessos} ${aliasPlural} ${sucessos === 1 ? 'criada' : 'criadas'} com sucesso!`;
      this.toastService.success(mensagem, 4000);
    } else if (sucessos > 0 && falhas > 0) {
      // Algumas foram bem-sucedidas e outras falharam
      const mensagem = `${sucessos} de ${total} ${aliasPlural} ${sucessos === 1 ? 'criada' : 'criadas'} com sucesso. ${falhas} ${falhas === 1 ? 'falhou' : 'falharam'}.`;
      this.toastService.alert(mensagem);
    } else {
      // Todas as requisições falharam
      const mensagem = `Falha ao criar ${aliasPlural}. Nenhuma ${alias} foi criada.`;
      this.toastService.error(mensagem);
    }
  }



  async abrirDetalheAtividade(atividade: any) {
    this.abaAnterior = this.aba;
    this.atividadeSelecionada = atividade;
    this.mostrarDetalhe = true;
    
    // Garantir que os jogadores estejam carregados
    if (this.jogadores.length === 0 && this.isTeamContext && !this.loadingJogadores) {
      await this.carregarJogadores();
    }
    
    // Inicializar o seletor de executor com o executor atual
    // Buscar o jogador correspondente ao email da atividade
    if (atividade?.user_email) {
      const jogadorEncontrado = this.jogadores.find(j => 
        j.email === atividade.user_email || 
        (j.id || j._id || j.email) === atividade.user_email
      );
      
      if (jogadorEncontrado) {
        this.novoExecutorSelecionado = jogadorEncontrado.id || jogadorEncontrado._id || jogadorEncontrado.email;
      } else {
        // Se não encontrar, usar o email diretamente (pode ser um email que não está na lista)
        this.novoExecutorSelecionado = atividade.user_email;
      }
    } else {
      this.novoExecutorSelecionado = 'UNASSIGNED';
    }
    
    // Carregar anexos da atividade
    if (atividade?.id) {
      this.carregarAnexos(atividade.id);
    }
    
    if (this.aba === 'pendentes') {
      this.detalheCor = 'vermelho';
    } else if (this.aba === 'finalizados') {
      this.detalheCor = 'verde';
    } else if (this.aba === 'aprovados') {
      this.detalheCor = 'azul';
    } else if (this.aba === 'cancelados') {
      this.detalheCor = 'cinza';
    } else {
      this.detalheCor = '';
    }
  }

  onTarefaClick(tarefa: any) {
    if (tarefa.status === 'PENDING' || tarefa.status === 'IN_PROGRESS') {
      this.aba = 'pendentes';
    } else if (tarefa.status === 'DONE') {
      this.aba = 'finalizados';
    } else if (tarefa.status === 'APPROVED') {
      this.aba = 'aprovados';  
    } else if (tarefa.status === 'CANCELED') {
      this.aba = 'cancelados';
    } else {
      this.aba = 'pendentes'; // Default para status desconhecido
    }

    this.mostrarDetalheDelivery = false;
    this.onTypeChange(1);
    this.onAbaChange();
    this.abrirDetalheAtividade(tarefa);
  }

  fecharDetalhe() {
    this.mostrarDetalhe = false;
    this.atividadeSelecionada = null;
    this.limparArquivos(); // Limpar arquivos selecionados
    this.anexosExistentes = []; // Limpar anexos existentes
    
    // Só restaurar a aba anterior se não estivermos trocando de aba
    // (quando abaAnterior é null, significa que estamos trocando de aba)
    if (this.abaAnterior) {
    this.aba = this.abaAnterior as any;
      this.abaAnterior = null; // Resetar para próxima vez
    }
  }

  // ===== MÉTODOS PARA DETALHE DA DELIVERY =====

  abrirDetalheDelivery(delivery: any) {
    // Log para inspecionar a estrutura recebida
    console.log('🟢 Detalhe da delivery selecionada:', delivery);
    // Normaliza o campo de tarefas
    if (!Array.isArray(delivery.user_action)) {
      if (Array.isArray(delivery.user_actions)) {
        delivery.user_action = delivery.user_actions;
      } else {
        delivery.user_action = [];
      }
    }
    this.abaAnterior = this.aba;
    this.deliverySelecionada = delivery;
    this.mostrarDetalheDelivery = true;
    
    // Limpar seleção de tarefas ao abrir novo detalhe
    this.tarefasSelecionadasDetalhe.clear();
    
    // Definir cor baseada no status da delivery
    if (this.aba === 'processos-pendentes') {
      this.detalheDeliveryCor = 'vermelho';
    } else if (this.aba === 'incompletos') {
      this.detalheDeliveryCor = 'amarelo';
    } else if (this.aba === 'entregues') {
      this.detalheDeliveryCor = 'azul';
    } else if (this.aba === 'processos-cancelados') {
      this.detalheDeliveryCor = 'cinza';
    } else {
      this.detalheDeliveryCor = '';
    }
  }

  fecharDetalheDelivery() {
    this.mostrarDetalheDelivery = false;
    this.deliverySelecionada = null;
    
    // Limpar seleção de tarefas no detalhe
    this.tarefasSelecionadasDetalhe.clear();
    
    // Só restaurar a aba anterior se não estivermos trocando de aba
    if (this.abaAnterior) {
      this.aba = this.abaAnterior as any;
      this.abaAnterior = null;
    }
  }

  async cancelarDelivery() {
    if (!this.deliverySelecionada) {
      console.error('❌ Delivery não selecionada');
      return;
    }

    const modalRef = this.modalService.open(ModalConfirmarCancelarDeliveryComponent, { size: 'sm' });
    modalRef.componentInstance.deliveryTitle = this.deliverySelecionada.title || this.deliverySelecionada.name || 'N/A';
    
    const result = await modalRef.result.catch(() => false);
    
    if (result) {
      try {
        console.log('❌ Cancelando delivery:', this.deliverySelecionada.id);
        
        await this.pontosAvulsosService.cancelarDelivery(this.deliverySelecionada.id);
        
        // Atualizar status localmente
        this.deliverySelecionada.status = 'CANCELLED';
        
        // Aguardar um pequeno delay para garantir que o backend processou a mudança
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Recarregar as listas de processos (incluindo cancelados)
        await this.recarregarListasProcessos();
        
        // Sempre recarregar também a lista de cancelados para garantir que apareça
        await this.carregarProcessosCancelados();
        
        console.log('✅ Delivery cancelada com sucesso!');
        
        // Mostrar toast de sucesso
        const alias = this.aliases?.deliveryAlias || 'processo';
        this.toastService.success(`${alias} cancelado com sucesso! Status alterado para "Cancelado".`, 4000);
        
        this.fecharDetalheDelivery();
        
      } catch (error) {
        console.error('❌ Erro ao cancelar delivery:', error);
        const alias = this.aliases?.deliveryAlias || 'processo';
        this.toastService.error(`Erro ao cancelar ${alias}. Por favor, tente novamente.`);
      }
    }
  }

  async completarDelivery() {
    if (!this.deliverySelecionada) {
      console.error('❌ Delivery não selecionada');
      return;
    }

    const modalRef = this.modalService.open(ModalConfirmarCompletarDeliveryComponent, { size: 'sm' });
    modalRef.componentInstance.deliveryTitle = this.deliverySelecionada.title || this.deliverySelecionada.name || 'N/A';
    
    const result = await modalRef.result.catch(() => false);
    
    if (result) {
      try {
        console.log('✅ Completando delivery:', this.deliverySelecionada.id);
        
        await this.pontosAvulsosService.completarDelivery(this.deliverySelecionada.id);
        
        // Atualizar status localmente
        this.deliverySelecionada.status = 'DELIVERED';
        
        // Recarregar as listas
        await this.recarregarListasProcessos();
        
        console.log('✅ Delivery completada com sucesso!');
        this.fecharDetalheDelivery();
        
      } catch (error) {
        console.error('❌ Erro ao completar delivery:', error);
      }
    }
  }

  async desfazerDelivery() {
    if (!this.deliverySelecionada) {
      console.error('❌ Delivery não selecionada');
      return;
    }

    const modalRef = this.modalService.open(ModalConfirmarDesfazerDeliveryComponent, { size: 'sm' });
    modalRef.componentInstance.deliveryTitle = this.deliverySelecionada.title || this.deliverySelecionada.name || 'N/A';
    
    const result = await modalRef.result.catch(() => false);
    
    if (result) {
      try {
        console.log('🔄 Desfazendo delivery:', this.deliverySelecionada.id);
        
        await this.pontosAvulsosService.desfazerDelivery(this.deliverySelecionada.id);
        
        // Atualizar status localmente
        this.deliverySelecionada.status = 'INCOMPLETE';
        
        // Recarregar as listas
        await this.recarregarListasProcessos();
        
        console.log('✅ Delivery desfeita com sucesso!');
        this.fecharDetalheDelivery();
        
      } catch (error) {
        console.error('❌ Erro ao desfazer delivery:', error);
      }
    }
  }

  async restaurarDelivery() {
    if (!this.deliverySelecionada) {
      console.error('❌ Delivery não selecionada');
      return;
    }

    const modalRef = this.modalService.open(ModalConfirmarRestaurarDeliveryComponent, { size: 'sm' });
    modalRef.componentInstance.deliveryTitle = this.deliverySelecionada.title || this.deliverySelecionada.name || 'N/A';
    
    const result = await modalRef.result.catch(() => false);
    
    if (result) {
      try {
        console.log('🔄 Restaurando delivery:', this.deliverySelecionada.id);
        
        await this.pontosAvulsosService.restaurarDelivery(this.deliverySelecionada.id);
        
        // Atualizar status localmente
        this.deliverySelecionada.status = 'PENDING';
        
        // Recarregar as listas
        await this.recarregarListasProcessos();
        
        console.log('✅ Delivery restaurada com sucesso!');
        this.fecharDetalheDelivery();
        
      } catch (error) {
        console.error('❌ Erro ao restaurar delivery:', error);
      }
    }
  }

  async criarTarefa() {
    console.log('🔍 Criando nova tarefa para delivery:', {
      deliverySelecionada: this.deliverySelecionada?.id,
      currentUserEmail: this.currentUserEmail
    });

    if (!this.deliverySelecionada) {
      console.error('❌ Delivery não selecionada');
      return;
    }

    // Salvar estado completo do detalhe do processo no cache
    this.salvarEstadoDetalheProcesso();

    // Preencher formulário com dados da delivery
    this.preencherFormularioComDelivery(this.deliverySelecionada);

    // Fechar detalhe da delivery
    this.fecharDetalheDelivery();

    // Trocar para aba "Criar" (tipo 2)
    this.onTypeChange(2);

    console.log('✅ Formulário de criação aberto com dados da delivery:', {
      titulo: this.deliverySelecionada.title || this.deliverySelecionada.name,
      id: this.deliverySelecionada.id
    });
    console.log('💾 Estado do detalhe salvo no cache:', this.estadoDetalheProcessoCache);
  }

  /**
   * Salva o estado atual do detalhe do processo no cache
   */
  private salvarEstadoDetalheProcesso(): void {
    if (!this.deliverySelecionada || !this.mostrarDetalheDelivery) {
      console.warn('⚠️ Não há detalhe de processo para salvar no cache');
      return;
    }

    this.estadoDetalheProcessoCache = {
      deliveryId: this.deliverySelecionada.id,
      delivery: { ...this.deliverySelecionada }, // Cópia profunda
      aba: this.aba,
      selectedType: this.selectedType,
      detalheDeliveryCor: this.detalheDeliveryCor,
      mostrarDetalheDelivery: this.mostrarDetalheDelivery
    };

    // Também manter compatibilidade com a lógica antiga
    this.retornarParaDelivery = true;
    this.deliveryParaRetornar = { ...this.deliverySelecionada };
    this.abaAnterior = this.aba;

    console.log('💾 Estado do detalhe do processo salvo no cache:', {
      deliveryId: this.estadoDetalheProcessoCache.deliveryId,
      aba: this.estadoDetalheProcessoCache.aba,
      selectedType: this.estadoDetalheProcessoCache.selectedType
    });
  }

  /**
   * Restaura o estado do detalhe do processo do cache
   */
  private async restaurarEstadoDetalheProcesso(): Promise<boolean> {
    if (!this.estadoDetalheProcessoCache) {
      console.warn('⚠️ Não há estado de detalhe salvo no cache para restaurar');
      return false;
    }

    try {
      const cache = this.estadoDetalheProcessoCache;
      console.log('🔄 Restaurando estado do detalhe do processo do cache:', cache);

      // Aguardar um pequeno delay para garantir que a API processou as novas atividades
      await new Promise(resolve => setTimeout(resolve, 500));

      // Restaurar tipo e aba
      this.selectedType = cache.selectedType;
      this.aba = cache.aba as any;

      // Recarregar dados da aba para obter dados atualizados
      await this.onAbaChange();

      // Aguardar um pouco mais para garantir que os dados foram carregados
      await new Promise(resolve => setTimeout(resolve, 300));

      // Buscar a delivery atualizada na lista recarregada
      const deliveryAtualizada = await this.buscarDeliveryAtualizada(cache.deliveryId);

      if (deliveryAtualizada) {
        console.log('✅ Delivery atualizada encontrada com', deliveryAtualizada.user_action?.length || 0, 'atividades');
        
        // Restaurar detalhe com dados atualizados
        this.abrirDetalheDelivery(deliveryAtualizada);
        
        // Restaurar cor do detalhe
        this.detalheDeliveryCor = cache.detalheDeliveryCor;
        
        console.log('✅ Estado do detalhe do processo restaurado com sucesso');
        return true;
      } else {
        console.warn('⚠️ Delivery não encontrada após recarregamento, tentando com dados do cache');
        
        // Se não encontrou, usar dados do cache (podem estar desatualizados)
        if (cache.delivery) {
          this.abrirDetalheDelivery(cache.delivery);
          this.detalheDeliveryCor = cache.detalheDeliveryCor;
          console.log('✅ Estado do detalhe do processo restaurado usando cache (pode estar desatualizado)');
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('❌ Erro ao restaurar estado do detalhe do processo:', error);
      return false;
    } finally {
      // Limpar cache após tentar restaurar
      this.limparEstadoDetalheProcesso();
    }
  }

  /**
   * Limpa o cache do estado do detalhe do processo
   */
  private limparEstadoDetalheProcesso(): void {
    this.estadoDetalheProcessoCache = null;
    this.retornarParaDelivery = false;
    this.deliveryParaRetornar = null;
    this.abaAnterior = null;
    console.log('🧹 Cache do estado do detalhe do processo limpo');
  }

  /**
   * Verifica se existe estado em cache para voltar
   */
  temEstadoCache(): boolean {
    return !!this.estadoDetalheProcessoCache;
  }

  /**
   * Volta para o estado anterior usando o cache (sem criar atividade)
   */
  async voltarParaEstadoAnterior(): Promise<void> {
    if (!this.estadoDetalheProcessoCache) {
      console.warn('⚠️ Não há estado em cache para voltar');
      return;
    }

    console.log('⬅️ Voltando para estado anterior usando cache');

    try {
      // Usar o método de restauração existente
      await this.restaurarEstadoDetalheProcesso();
    } catch (error) {
      console.error('❌ Erro ao voltar para estado anterior:', error);
      this.toastService.error('Erro ao voltar para a página anterior');
    }
  }

  /**
   * Preenche o formulário com dados da delivery selecionada
   * @param delivery Objeto da delivery
   */
  private preencherFormularioComDelivery(delivery: any): void {
    const titulo = delivery.title || delivery.name || '';
    const id = delivery.id || '';

    console.log('📝 Preenchendo formulário com dados da delivery:', { titulo, id });

    // Preencher campos do formulário
    this.formAtribuir.patchValue({
      delivery_title: titulo,
      delivery_id: id,
      status: 'PENDING' // Status padrão para nova tarefa
    });

    // Forçar atualização do ID baseado no título (se necessário)
    if (titulo && !id) {
      const idGerado = this.gerarIdFromTitulo(titulo);
      this.formAtribuir.patchValue({ delivery_id: idGerado });
    }
  }

  /**
   * Limpa o estado de retorno para delivery
   */
  private limparEstadoRetorno(): void {
    this.retornarParaDelivery = false;
    this.deliveryParaRetornar = null;
    this.abaAnterior = null;
  }

  /**
   * Limpa o formulário de atribuição de atividades
   */
  private limparFormularioAtribuicao(): void {
    console.log('🧹 Limpando formulário de atribuição');
    
    // Resetar formulário para valores padrão
    this.formAtribuir.reset({
      atividade: null,
      jogador: null,
      delivery_id: null,
      delivery_title: null,
      status: 'PENDING',
      dataFinalizacao: null,
      quantidade: 1
    });
    
    // Pré-selecionar o jogador atual após limpar
    // Se for jogador com time, será pré-selecionado quando a lista de jogadores for carregada
    // Se for colaborador sem time, pré-selecionar diretamente
    const jogadorComTime = this.isPlayer && this.playerTeamId !== null;
    if (!this.isTeamContext && !jogadorComTime && this.userId) {
      this.formAtribuir.patchValue({
        jogador: this.userId
      });
    } else if (jogadorComTime && this.jogadores.length > 0) {
      // Se já tem jogadores carregados, pré-selecionar imediatamente
      this.preSelecionarJogadorAtual();
    }
    
    console.log('✅ Formulário limpo com sucesso');
  }

  /**
   * Busca uma delivery atualizada na lista recarregada
   * @param deliveryId ID da delivery
   * @returns Delivery atualizada ou null se não encontrada
   */
  private async buscarDeliveryAtualizada(deliveryId: string): Promise<any | null> {
    try {
      console.log('🔍 Buscando delivery atualizada:', deliveryId, 'na aba:', this.aba);
      
      let deliveryAtualizada: any = null;
      
      // Buscar na lista apropriada baseada na aba atual
      if (this.aba === 'processos-pendentes') {
        deliveryAtualizada = this.processosPendentes.find(d => d.id === deliveryId);
      } else if (this.aba === 'incompletos') {
        deliveryAtualizada = this.processosIncompletos.find(d => d.id === deliveryId);
      } else if (this.aba === 'entregues') {
        deliveryAtualizada = this.processosEntregues.find(d => d.id === deliveryId);
      } else if (this.aba === 'processos-cancelados') {
        deliveryAtualizada = this.processosCancelados.find(d => d.id === deliveryId);
      }
      
      if (deliveryAtualizada) {
        // Normalizar o campo de tarefas se necessário
        if (!Array.isArray(deliveryAtualizada.user_action)) {
          if (Array.isArray(deliveryAtualizada.user_actions)) {
            deliveryAtualizada.user_action = deliveryAtualizada.user_actions;
          } else {
            deliveryAtualizada.user_action = [];
          }
        }
        
        console.log('✅ Delivery encontrada com', deliveryAtualizada.user_action?.length || 0, 'atividades');
      } else {
        console.warn('⚠️ Delivery não encontrada na lista. Tentando buscar em todas as listas...');
        
        // Se não encontrou na aba atual, buscar em todas as listas
        const todasListas = [
          ...this.processosPendentes,
          ...this.processosIncompletos,
          ...this.processosEntregues,
          ...this.processosCancelados
        ];
        
        deliveryAtualizada = todasListas.find(d => d.id === deliveryId);
        
        if (deliveryAtualizada) {
          // Normalizar o campo de tarefas
          if (!Array.isArray(deliveryAtualizada.user_action)) {
            if (Array.isArray(deliveryAtualizada.user_actions)) {
              deliveryAtualizada.user_action = deliveryAtualizada.user_actions;
            } else {
              deliveryAtualizada.user_action = [];
            }
          }
          console.log('✅ Delivery encontrada em outra lista com', deliveryAtualizada.user_action?.length || 0, 'atividades');
        }
      }
      
      return deliveryAtualizada;
    } catch (error) {
      console.error('❌ Erro ao buscar delivery atualizada:', error);
      return null;
    }
  }

  /**
   * Recarrega as listas de processos após uma alteração
   */
  private async recarregarListasProcessos() {
    try {
      // Recarregar baseado na aba atual
      if (this.aba === 'processos-pendentes') {
        await this.carregarProcessosPendentes();
      } else if (this.aba === 'incompletos') {
        await this.carregarProcessosIncompletos();
      } else if (this.aba === 'entregues') {
        await this.carregarProcessosEntregues();
      } else if (this.aba === 'processos-cancelados') {
        await this.carregarProcessosCancelados();
      }
      
      // Reaplicar filtros locais após recarregar
      this.aplicarFiltrosLocaisProcessos();
    } catch (error) {
      console.error('Erro ao recarregar listas de processos:', error);
    }
  }

  async finalizarAtividade() {
    console.log('🔍 Verificando dados para finalizar atividade:', {
      atividadeSelecionada: this.atividadeSelecionada?.id,
      executorEmail: this.atividadeSelecionada?.user_email,
      currentUserEmail: this.currentUserEmail,
      status: this.atividadeSelecionada?.status
    });

    if (!this.atividadeSelecionada) {
      console.error('❌ Atividade não selecionada');
      return;
    }

    // Usar o email do executor da atividade (não o do usuário logado)
    const executorEmail = this.atividadeSelecionada.user_email;
    if (!executorEmail) {
      console.error('❌ Email do executor da atividade não fornecido');
      return;
    }

    // Obter o action_id
    const actionId = await this.getActionId();
    if (!actionId) {
      return;
    }

    if (!this.atividadeSelecionada.delivery_id) {
      console.error('❌ Delivery ID não encontrado na atividade');
      return;
    }

    // Verificar se a atividade já está finalizada
    if (this.atividadeSelecionada.status === 'DONE') {
      console.log('⚠️ Atividade já está finalizada');
      return;
    }

    // Abrir modal de confirmação
    const modalRef = this.modalService.open(ModalConfirmarFinalizacaoComponent, { size: 'sm' });
    const result = await modalRef.result.catch(() => false);

    if (result && result.confirmado) {
      try {
        console.log('✅ Finalizando atividade:', this.atividadeSelecionada.delivery_id);
        console.log('📧 Usando email do executor:', executorEmail);
        
        // Usar a data atual como data de finalização
        const finishedAt = new Date().toISOString();
        
        await this.pontosAvulsosService.finalizarAtividade(
          actionId,
          executorEmail,
          finishedAt,
          this.atividadeSelecionada.delivery_id,
          this.atividadeSelecionada.delivery_title || '',
          this.atividadeSelecionada.created_at,
          this.atividadeSelecionada.integration_id || this.atividadeSelecionada.delivery_id
        );

        // Adicionar comentário de finalização ou o comentário fornecido pelo usuário
        const comentario = result.comentario?.trim() || 'Atividade enviada para aprovação';
        await this.adicionarComentario(
          this.atividadeSelecionada.id,
          comentario,
          'FINISH'
        );

        // Atualizar o status localmente
        this.atividadeSelecionada.status = 'DONE';
        this.atividadeSelecionada.approved = false;
        this.atividadeSelecionada.approved_by = null;
        this.atividadeSelecionada.finished_at = finishedAt;

        // Recarregar as listas para refletir as mudanças
        await this.recarregarListasAtualizadas();
        
        console.log('✅ Atividade enviada para aprovação!');
        
        // Mostrar toast de sucesso
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.success(`${alias} finalizada com sucesso! Status alterado para "Aguardando Aprovação".`, 4000);
        
        this.fecharDetalhe();
        
      } catch (error) {
        console.error('❌ Erro ao finalizar atividade:', error);
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.error(`Erro ao finalizar ${alias}. Por favor, tente novamente.`);
      }
    }
  }

  async aprovarAtividade() {
    console.log('🔍 Verificando dados para aprovar atividade:', {
      atividadeSelecionada: this.atividadeSelecionada?.id,
      executorEmail: this.atividadeSelecionada?.user_email,
      currentUserEmail: this.currentUserEmail,
      status: this.atividadeSelecionada?.status,
      deliveryId: this.atividadeSelecionada?.delivery_id
    });

    if (!this.atividadeSelecionada) {
      console.error('❌ Atividade não selecionada');
      return;
    }

    // Usar o email do executor da atividade (não o do usuário logado)
    const executorEmail = this.atividadeSelecionada.user_email;
    if (!executorEmail) {
      console.error('❌ Email do executor da atividade não fornecido');
      return;
    }

    // Obter o action_id
    const actionId = await this.getActionId();
    if (!actionId) {
      return;
    }

    if (!this.atividadeSelecionada.delivery_id) {
      console.error('❌ Delivery ID não encontrado na atividade');
      return;
    }

    const modalRef = this.modalService.open(ModalConfirmarAprovacaoComponent, { size: 'sm' });
    const result = await modalRef.result.catch(() => null);

    if (result && result.aprovado) {
      try {
        console.log('✅ Aprovando atividade:', this.atividadeSelecionada.delivery_id);
        console.log('📧 Usando email do executor:', executorEmail);
        
        // Usar a data atual como data de finalização
        const finishedAt = new Date().toISOString();
        
        await this.pontosAvulsosService.aprovarAtividade(
          actionId,
          executorEmail,
          finishedAt,
          this.atividadeSelecionada.delivery_id,
          this.atividadeSelecionada.delivery_title || '',
          this.atividadeSelecionada.created_at,
          this.atividadeSelecionada.integration_id || this.atividadeSelecionada.delivery_id
        );

        // Adicionar comentário personalizado se fornecido, senão usar o padrão
        const comentario = result.comentario?.trim() || 'Atividade aprovada com sucesso';
        await this.adicionarComentario(
          this.atividadeSelecionada.id,
          comentario,
          'APPROVE'
        );

        // Atualizar o status localmente (manter como DONE, não alterar para DELIVERED)
        this.atividadeSelecionada.status = 'DONE';
        this.atividadeSelecionada.finished_at = finishedAt;

        // Recarregar as listas para refletir as mudanças
        await this.recarregarListasAtualizadas();
        
        console.log('✅ Atividade aprovada com sucesso!');
        this.fecharDetalhe();
        
        // Aqui você pode adicionar um toast de sucesso
        // this.toastService.showSuccess('Atividade aprovada com sucesso!');
        
      } catch (error) {
        console.error('❌ Erro ao aprovar atividade:', error);
        // Aqui você pode adicionar um toast de erro
        // this.toastService.showError('Erro ao aprovar atividade');
      }
    }
  }

  async bloquearAtividade() {
    console.log('🔍 Verificando dados para bloquear atividade:', {
      atividadeSelecionada: this.atividadeSelecionada?.id,
      executorEmail: this.atividadeSelecionada?.user_email,
      currentUserEmail: this.currentUserEmail,
      status: this.atividadeSelecionada?.status
    });

    if (!this.atividadeSelecionada) {
      console.error('❌ Atividade não selecionada');
      return;
    }

    // Usar o email do executor da atividade (não o do usuário logado)
    const executorEmail = this.atividadeSelecionada.user_email;
    if (!executorEmail) {
      console.error('❌ Email do executor da atividade não fornecido');
      return;
    }

    // Obter o action_id
    const actionId = await this.getActionId();
    if (!actionId) {
      return;
    }

    if (!this.atividadeSelecionada.delivery_id) {
      console.error('❌ Delivery ID não encontrado na atividade');
      return;
    }

    if (this.atividadeSelecionada.status === 'DONE') {
      console.log('⚠️ Atividade já está bloqueada');
      return;
    }

    const modalRef = this.modalService.open(ModalConfirmarBloqueioComponent, { size: 'sm' });
    const motivo = await modalRef.result.catch(() => null);

    if (motivo) {
      try {
        console.log('🔒 Bloqueando atividade com comentário:', this.atividadeSelecionada.delivery_id);
        console.log('📧 Usando email do executor:', executorEmail);

        await this.pontosAvulsosService.bloquearAtividadeComComentario(
          actionId,
          executorEmail,
          this.atividadeSelecionada.delivery_id,
          this.atividadeSelecionada.delivery_title || '',
          this.atividadeSelecionada.created_at,
          this.atividadeSelecionada.integration_id || this.atividadeSelecionada.delivery_id
        );

        // Adicionar comentário de bloqueio
        await this.adicionarComentario(
          this.atividadeSelecionada.id,
          motivo,
          'BLOCK'
        );
        
        // Atualizar o status localmente
        this.atividadeSelecionada.status = 'DONE';
        this.atividadeSelecionada.finished_at = new Date().toISOString();

        // Recarregar as listas para refletir as mudanças
        await this.recarregarListasAtualizadas();
        
        console.log('✅ Atividade bloqueada com sucesso!');
        this.fecharDetalhe();
        
      } catch (error) {
        console.error('❌ Erro ao bloquear atividade:', error);
      }
    }
  }

  async reprovarAtividade() {
    console.log('🔍 Verificando dados para reprovar atividade:', {
      atividadeSelecionada: this.atividadeSelecionada?.id,
      executorEmail: this.atividadeSelecionada?.user_email,
      currentUserEmail: this.currentUserEmail,
      status: this.atividadeSelecionada?.status
    });

    if (!this.atividadeSelecionada) {
      console.error('❌ Atividade não selecionada');
      return;
    }

    // Usar o email do executor da atividade (não o do usuário logado)
    const executorEmail = this.atividadeSelecionada.user_email;
    if (!executorEmail) {
      console.error('❌ Email do executor da atividade não fornecido');
      return;
    }

    // Obter o action_id
    const actionId = await this.getActionId();
    if (!actionId) {
      return;
    }

    if (!this.atividadeSelecionada.delivery_id) {
      console.error('❌ Delivery ID não encontrado na atividade');
      return;
    }

    // Verificar se a atividade já está pendente
    if (this.atividadeSelecionada.status === 'PENDING') {
      console.log('⚠️ Atividade já está pendente');
      return;
    }

    const modalRef = this.modalService.open(ModalMotivoReprovacaoComponent, { size: 'sm' });
    const motivo = await modalRef.result.catch(() => null);
    
    if (motivo) {
      try {
        console.log('🔄 Reprovar atividade com comentário:', this.atividadeSelecionada.id);
        console.log('📧 Usando email do executor:', executorEmail);
        
        await this.pontosAvulsosService.reprovarAtividadeComComentario(
          actionId,
          executorEmail,
          this.atividadeSelecionada.delivery_id,
          this.atividadeSelecionada.delivery_title || '',
          this.atividadeSelecionada.created_at,
          this.atividadeSelecionada.integration_id || this.atividadeSelecionada.delivery_id
        );

        // Adicionar comentário de reprovação
        await this.adicionarComentario(
          this.atividadeSelecionada.id,
          motivo,
          'DENY'
        );

        // Atualizar o status localmente
        this.atividadeSelecionada.status = 'PENDING';
        this.atividadeSelecionada.finished_at = undefined; // Remover data de finalização

        // Recarregar as listas para refletir as mudanças
        await this.recarregarListasAtualizadas();
        
        console.log('✅ Atividade reprovada com sucesso!');
        this.fecharDetalhe();
        
        // Aqui você pode adicionar um toast de sucesso
        // this.toastService.showSuccess('Atividade reprovada com sucesso!');
        
      } catch (error) {
        console.error('❌ Erro ao reprovar atividade:', error);
        // Aqui você pode adicionar um toast de erro
        // this.toastService.showError('Erro ao reprovar atividade');
      }
    }
  }

  async cancelarAtividade() {
    console.log('🔍 Verificando dados para cancelar atividade:', {
      atividadeSelecionada: this.atividadeSelecionada?.id,
      executorEmail: this.atividadeSelecionada?.user_email,
      currentUserEmail: this.currentUserEmail,
      status: this.atividadeSelecionada?.status
    });

    if (!this.atividadeSelecionada) {
      console.error('❌ Atividade não selecionada');
      return;
    }

    // Usar o email do executor da atividade (não o do usuário logado)
    const executorEmail = this.atividadeSelecionada.user_email;
    if (!executorEmail) {
      console.error('❌ Email do executor da atividade não fornecido');
      return;
    }

    // Obter o action_id
    const actionId = await this.getActionId();
    if (!actionId) {
      return;
    }

    if (!this.atividadeSelecionada.delivery_id) {
      console.error('❌ Delivery ID não encontrado na atividade');
      return;
    }

    const modalRef = this.modalService.open(ModalMotivoCancelamentoComponent, { size: 'sm' });
    const motivo = await modalRef.result.catch(() => null);
    
    if (motivo) {
      try {
        console.log('❌ Cancelando atividade com comentário:', this.atividadeSelecionada.id);
        console.log('📧 Usando email do executor:', executorEmail);
        
        try {
          await this.pontosAvulsosService.cancelarAtividadeComComentario(
            actionId,
            executorEmail,
            this.atividadeSelecionada.delivery_id,
            this.atividadeSelecionada.delivery_title || '',
            this.atividadeSelecionada.created_at,
            this.atividadeSelecionada.integration_id || this.atividadeSelecionada.delivery_id
          );
        } catch (cancelError: any) {
          // Status 204 é sucesso - a operação foi concluída
          if (cancelError?.status === 204 || cancelError?.response?.status === 204) {
            console.log('✅ Atividade cancelada (status 204 - No Content)');
          } else {
            throw cancelError; // Re-lançar se não for 204
          }
        }

        // Adicionar comentário de cancelamento (não crítico se falhar)
        try {
          await this.adicionarComentario(
            this.atividadeSelecionada.id,
            motivo,
            'CANCEL'
          );
        } catch (commentError: any) {
          // Comentário não é crítico - log mas não falha a operação
          if (commentError?.status === 204 || commentError?.response?.status === 204) {
            console.log('✅ Comentário adicionado (status 204)');
          } else {
            console.warn('⚠️ Comentário não pôde ser adicionado:', commentError);
          }
        }

        // Atualizar o status localmente
        this.atividadeSelecionada.dismissed = true;
        this.atividadeSelecionada.finished_at = new Date().toISOString();

        // Limpar filtros de busca local para forçar recarregamento do backend
        const temFiltroData = !!(this.filtrosAtivos?.created_at_start || this.filtrosAtivos?.created_at_end || 
                                 this.filtrosAtivos?.finished_at_start || this.filtrosAtivos?.finished_at_end);
        if (this.filtrosAtivos?.busca && !temFiltroData && !this.filtrosAtivos?.executor) {
          this.filtrosAtivos.busca = undefined;
        }

        // Aguardar um pouco para garantir que o backend processou a mudança
        await new Promise(resolve => setTimeout(resolve, 500));

        // Recarregar as listas para refletir as mudanças
        await this.recarregarListasAtualizadas();
        
        console.log('✅ Atividade cancelada com sucesso!');
        
        // Mostrar toast de sucesso
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.success(`${alias} cancelada com sucesso! Status alterado para "Cancelada".`, 4000);
        
        this.fecharDetalhe();
        
      } catch (error) {
        console.error('❌ Erro ao cancelar atividade:', error);
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.error(`Erro ao cancelar ${alias}. Por favor, tente novamente.`);
      }
    }
  }

  /**
   * Atualiza o executor da atividade selecionada
   */
  async atualizarExecutor() {
    if (!this.atividadeSelecionada) {
      console.error('❌ Atividade não selecionada');
      return;
    }

    // Validar que apenas atividades com status PENDING podem ter o executor alterado
    if (this.atividadeSelecionada.status !== 'PENDING') {
      const alias = this.aliases?.actionAlias || 'atividade';
      this.toastService.alert(`Apenas ${alias}s com status "Pendente" podem ter o executor alterado.`);
      return;
    }

    if (this.atualizandoExecutor) {
      return;
    }

    try {
      this.atualizandoExecutor = true;

      // Determinar o email do executor
      let userEmail: string | null = null;
      
      if (this.novoExecutorSelecionado === 'UNASSIGNED') {
        userEmail = null;
      } else if (this.novoExecutorSelecionado) {
        // Buscar o jogador pelo ID ou email
        const jogador = this.jogadores.find(j => 
          (j.id || j._id || j.email) === this.novoExecutorSelecionado ||
          j.email === this.novoExecutorSelecionado
        );
        
        if (jogador) {
          userEmail = jogador.email;
        } else if (this.novoExecutorSelecionado.includes('@')) {
          // Se for um email direto e não encontrar na lista, usar o email
          userEmail = this.novoExecutorSelecionado;
        } else {
          console.warn('⚠️ Jogador não encontrado para o ID selecionado:', this.novoExecutorSelecionado);
          userEmail = null;
        }
      }

      // Criar payload para atualizar apenas o executor
      const payload = this.pontosAvulsosService.createProcessPayload(
        this.atividadeSelecionada.action_id || this.atividadeSelecionada.id,
        userEmail,
        this.atividadeSelecionada.delivery_id || '',
        this.atividadeSelecionada.delivery_title || '',
        this.atividadeSelecionada.status || 'PENDING',
        this.atividadeSelecionada.finished_at,
        undefined,
        this.atividadeSelecionada.integration_id || ''
      );

      // Manter outros campos importantes
      if (this.atividadeSelecionada.comments) {
        payload.comments = this.atividadeSelecionada.comments;
      }
      if (this.atividadeSelecionada.approved !== undefined) {
        payload.approved = this.atividadeSelecionada.approved;
      }
      if (this.atividadeSelecionada.approved_by) {
        payload.approved_by = this.atividadeSelecionada.approved_by;
      }
      if (this.atividadeSelecionada.dismissed !== undefined) {
        payload.dismissed = this.atividadeSelecionada.dismissed;
      }

      await this.pontosAvulsosService.processAction(payload);

      // Atualizar localmente
      this.atividadeSelecionada.user_email = userEmail;
      
      const alias = this.aliases?.actionAlias || 'atividade';
      this.toastService.success(`Executor da ${alias} atualizado com sucesso!`, 3000);

      // Recarregar a lista atual
      await this.recarregarListasAtualizadas();

    } catch (error) {
      console.error('❌ Erro ao atualizar executor:', error);
      const alias = this.aliases?.actionAlias || 'atividade';
      this.toastService.error(`Erro ao atualizar executor da ${alias}. Por favor, tente novamente.`);
    } finally {
      this.atualizandoExecutor = false;
    }
  }

  /**
   * Recarrega as listas de atividades após uma alteração de status
   */
  private async recarregarListasAtualizadas() {
    try {
      // Recarregar baseado na aba atual, mantendo a página atual
      if (this.aba === 'pendentes') {
        await this.carregarAtividadesPendentes(this.currentPagePendentes);
      } else if (this.aba === 'finalizados') {
        await this.carregarAtividadesFinalizadas(this.currentPageFinalizadas);
      } else if (this.aba === 'aprovados') {
        await this.carregarAtividadesAprovadas(this.currentPageAprovadas);
      } else if (this.aba === 'cancelados') {
        await this.carregarAtividadesCanceladas(this.currentPageCanceladas);
      }
    } catch (error) {
      console.error('Erro ao recarregar listas:', error);
    }
  }

  /**
   * Métodos para navegação de paginação
   */
  irParaPaginaPendentes(page: number) {
    if (page >= 1 && page <= (this.paginacaoPendentes?.totalPages || 1)) {
      this.carregarAtividadesPendentes(page);
    }
  }

  irParaPaginaFinalizadas(page: number) {
    if (page >= 1 && page <= (this.paginacaoFinalizadas?.totalPages || 1)) {
      this.carregarAtividadesFinalizadas(page);
    }
  }

  irParaPaginaAprovadas(page: number) {
    if (page >= 1 && page <= (this.paginacaoAprovadas?.totalPages || 1)) {
      this.carregarAtividadesAprovadas(page);
    }
  }

  irParaPaginaCanceladas(page: number) {
    if (page >= 1 && page <= (this.paginacaoCanceladas?.totalPages || 1)) {
      this.carregarAtividadesCanceladas(page);
    }
  }

  /**
   * Verifica se há próxima página
   */
  temProximaPagina(tipo: 'pendentes' | 'finalizadas' | 'aprovadas' | 'canceladas'): boolean {
    const paginacao = tipo === 'pendentes' ? this.paginacaoPendentes :
                     tipo === 'finalizadas' ? this.paginacaoFinalizadas :
                     tipo === 'aprovadas' ? this.paginacaoAprovadas :
                     this.paginacaoCanceladas;
    
    return paginacao ? paginacao.page < paginacao.totalPages : false;
  }

  /**
   * Verifica se há página anterior
   */
  temPaginaAnterior(tipo: 'pendentes' | 'finalizadas' | 'aprovadas' | 'canceladas'): boolean {
    const paginacao = tipo === 'pendentes' ? this.paginacaoPendentes :
                     tipo === 'finalizadas' ? this.paginacaoFinalizadas :
                     tipo === 'aprovadas' ? this.paginacaoAprovadas :
                     this.paginacaoCanceladas;
    
    return paginacao ? paginacao.page > 1 : false;
  }

  /**
   * Gera array de números de página para exibição na paginação
   * Mostra até 5 páginas ao redor da página atual
   */
  getPageNumbers(paginacao: PaginatedResponse<AtividadeDetalhe> | null): number[] {
    if (!paginacao || paginacao.totalPages <= 1) {
      return [];
    }

    const currentPage = paginacao.page;
    const totalPages = paginacao.totalPages;
    const maxPagesToShow = 5;
    const pages: number[] = [];

    if (totalPages <= maxPagesToShow) {
      // Se temos poucas páginas, mostrar todas
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Mostrar páginas ao redor da atual
      let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
      let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

      // Ajustar início se estivermos no final
      if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }

    return pages;
  }

  /**
   * Verifica se o botão de aprovar deve estar habilitado
   */
  podeAprovar(): boolean {
    return this.atividadeSelecionada?.status === 'DONE' && 
           !!this.atividadeSelecionada?.delivery_id &&
           !!this.atividadeSelecionada?.action_title &&
           !this.isAtividadeAprovada(this.atividadeSelecionada); // Só pode aprovar se não estiver aprovada
  }

  /**
   * Verifica se o botão de reprovar deve estar habilitado
   */
  podeReprovar(): boolean {
    return this.atividadeSelecionada?.status !== 'PENDING';
  }

  /**
   * Verifica se o botão de cancelar deve estar habilitado
   */
  podeCancelar(): boolean {
    return this.atividadeSelecionada?.dismissed !== true; // Não pode cancelar se já estiver dismissed
  }

  /**
   * Verifica se o botão de desbloquear deve estar habilitado
   */
  podeDesbloquear(): boolean {
    // Só pode desbloquear se a atividade estiver com status DONE (bloqueada)
    // e tiver um delivery_id
    return this.atividadeSelecionada?.status === 'DONE' && 
           !!this.atividadeSelecionada?.delivery_id;
  }

  /**
   * Carrega os anexos existentes de uma atividade
   * @param userActionId ID da user action
   */
  private async carregarAnexos(userActionId: string): Promise<void> {
    try {
      this.loadingAnexos = true;
      console.log('📎 Carregando anexos para atividade:', userActionId);
      
      const response = await this.pontosAvulsosService.buscarAnexos(userActionId);
      
      if (Array.isArray(response)) {
        // Mapear os anexos para garantir que todos os campos estejam presentes
        this.anexosExistentes = response.map(anexo => ({
          id: anexo.id,
          filename: anexo.filename || anexo.name || 'arquivo',
          original_name: anexo.original_name || anexo.filename || anexo.name || 'arquivo',
          size: anexo.size || 0,
          mime_type: anexo.mime_type || anexo.type || 'application/octet-stream',
          created_at: anexo.created_at || anexo.createdAt || new Date().toISOString(),
          url: anexo.url
        }));
        
        console.log('✅ Anexos carregados:', this.anexosExistentes.length);
        console.log('📋 Detalhes dos anexos:', this.anexosExistentes);
      } else {
        this.anexosExistentes = [];
        console.log('ℹ️ Nenhum anexo encontrado');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar anexos:', error);
      this.anexosExistentes = [];
    } finally {
      this.loadingAnexos = false;
    }
  }

  /**
   * Faz upload dos anexos selecionados
   */
  public async fazerUploadAnexos(): Promise<void> {
    if (!this.atividadeSelecionada?.id || this.arquivosSelecionados.length === 0) {
      console.log('ℹ️ Nenhum arquivo para upload ou atividade não selecionada');
      return;
    }

    try {
      console.log('📎 Iniciando upload de anexos:', this.arquivosSelecionados.length);
      
      await this.pontosAvulsosService.uploadAnexos(
        this.atividadeSelecionada.id,
        this.arquivosSelecionados
      );

      console.log('✅ Upload de anexos concluído');
      
      // Recarregar anexos após upload
      await this.carregarAnexos(this.atividadeSelecionada.id);
      
      // Limpar arquivos selecionados
      this.limparArquivos();
      
      // Aqui você pode adicionar um toast de sucesso
      // this.toastService.showSuccess('Anexos enviados com sucesso!');
      
    } catch (error: any) {
      console.error('❌ Erro ao fazer upload de anexos:', error);
      
      // Exibir mensagem de erro específica
      const errorMessage = error.message || 'Erro ao fazer upload dos anexos';
      console.error('Mensagem de erro:', errorMessage);
      
      // Aqui você pode adicionar um toast de erro
      // this.toastService.showError(errorMessage);
    }
  }

  /**
   * Adiciona um comentário a uma atividade
   * @param userActionId ID da user action
   * @param comment Comentário a ser adicionado
   * @param commentType Tipo do comentário
   */
  private async adicionarComentario(
    userActionId: string,
    comment: string,
    commentType: 'CANCEL' | 'BLOCK' | 'FINISH' | 'DENY' | 'APPROVE' = 'FINISH'
  ): Promise<void> {
    try {
      if (!this.currentUserEmail) {
        console.error('❌ Email do usuário não fornecido para adicionar comentário');
        return;
      }

      await this.pontosAvulsosService.adicionarComentario(
        userActionId,
        comment,
        this.currentUserEmail,
        commentType
      );

      console.log('✅ Comentário adicionado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao adicionar comentário:', error);
      // Aqui você pode adicionar um toast de erro
    }
  }

  /**
   * Obtém o action_id da atividade, buscando pelo título se necessário
   * @returns Promise com o action_id ou null
   */
  private async getActionId(): Promise<string | null> {
    if (!this.atividadeSelecionada) {
      return null;
    }

    // Se já temos o action_id, retornar
    if (this.atividadeSelecionada.action_id) {
      return this.atividadeSelecionada.action_id;
    }

    // Se não temos o action_id mas temos o título, buscar pelo título
    if (this.atividadeSelecionada.action_title) {
      console.log('🔍 Action ID não encontrado, buscando pelo título:', this.atividadeSelecionada.action_title);
      const actionId = await this.pontosAvulsosService.getActionIdByTitle(this.atividadeSelecionada.action_title);
      
      if (actionId) {
        // Atualizar o objeto da atividade com o action_id encontrado
        this.atividadeSelecionada.action_id = actionId;
        return actionId;
      }
    }

    console.error('❌ Action ID não encontrado na atividade e não foi possível buscar pelo título');
    return null;
  }

  // Métodos para upload de arquivos
  onFileSelected(event: any) {
    const files: FileList = event.target.files;
    this.processarArquivos(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.dataTransfer?.files) {
      this.processarArquivos(event.dataTransfer.files);
    }
  }

  processarArquivos(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Verificar se já atingiu o limite de arquivos
      if (this.arquivosSelecionados.length >= this.maxArquivos) {
        console.warn('Limite máximo de arquivos atingido');
        // Aqui você pode adicionar um toast de aviso
        // this.toastService.showWarning('Limite máximo de 5 arquivos atingido');
        break;
      }

      // Verificar se o arquivo já foi selecionado
      if (this.arquivosSelecionados.some(f => f.name === file.name && f.size === file.size)) {
        console.warn('Arquivo já selecionado:', file.name);
        // Aqui você pode adicionar um toast de aviso
        // this.toastService.showWarning(`Arquivo "${file.name}" já foi selecionado`);
        continue;
      }

      // Verificar tamanho do arquivo (10MB = 10 * 1024 * 1024 bytes)
      if (file.size > this.maxTamanhoArquivo) {
        console.warn('Arquivo muito grande:', file.name, 'Tamanho:', this.formatFileSize(file.size));
        // Aqui você pode adicionar um toast de erro
        // this.toastService.showError(`Arquivo "${file.name}" muito grande. Máximo: ${this.formatFileSize(this.maxTamanhoArquivo)}`);
        continue;
      }

      // Verificar tipo do arquivo
      if (!this.isTipoArquivoValido(file)) {
        console.warn('Tipo de arquivo não suportado:', file.name);
        // Aqui você pode adicionar um toast de erro
        // this.toastService.showError(`Tipo de arquivo não suportado: ${file.name}`);
        continue;
      }

      this.arquivosSelecionados.push(file);
      console.log('✅ Arquivo adicionado:', file.name, 'Tamanho:', this.formatFileSize(file.size));
    }
  }

  /**
   * Remove um arquivo da lista de arquivos selecionados (ainda não enviados)
   * @param index Índice do arquivo na lista
   */
  public removerArquivo(index: number): void {
    if (index >= 0 && index < this.arquivosSelecionados.length) {
      const arquivoRemovido = this.arquivosSelecionados[index];
      console.log('🗑️ Removendo arquivo:', arquivoRemovido.name);
      
      this.arquivosSelecionados.splice(index, 1);
      
      console.log('✅ Arquivo removido. Arquivos restantes:', this.arquivosSelecionados.length);
      
      // Aqui você pode adicionar um toast de sucesso se desejar
      // this.toastService.showSuccess(`Arquivo "${arquivoRemovido.name}" removido`);
    } else {
      console.warn('⚠️ Índice inválido para remoção de arquivo:', index);
    }
  }

  /**
   * Remove todos os arquivos selecionados de uma vez
   */
  public removerTodosArquivos(): void {
    if (this.arquivosSelecionados.length > 0) {
      console.log('🗑️ Removendo todos os arquivos selecionados:', this.arquivosSelecionados.length);
      
      this.arquivosSelecionados = [];
      
      console.log('✅ Todos os arquivos foram removidos');
      
      // Aqui você pode adicionar um toast de sucesso se desejar
      // this.toastService.showSuccess('Todos os arquivos foram removidos');
    } else {
      console.log('ℹ️ Nenhum arquivo para remover');
    }
  }

  /**
   * Faz download de um anexo específico preservando o formato original
   * @param anexo Objeto do anexo com id e original_name
   */
  public async fazerDownloadAnexo(anexo: any): Promise<void> {
    if (!anexo?.id) {
      console.error('❌ ID do anexo não fornecido');
      return;
    }

    // Verificar se já está baixando
    if (this.downloadingAnexos.has(anexo.id)) {
      console.log('⏳ Download já em andamento para:', anexo.original_name || anexo.filename);
      return;
    }

    // Adicionar ao conjunto de downloads em andamento
    this.downloadingAnexos.add(anexo.id);

    try {
      console.log('📥 Iniciando download:', anexo.original_name || anexo.filename);
      
      // Obter a URL de download do anexo
      const downloadUrl = await this.pontosAvulsosService.getDownloadUrl(anexo.id);
      
      // Fazer o download via fetch para preservar o formato original
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Obter o blob com o tipo MIME correto
      const blob = await response.blob();
      
      // Determinar o nome do arquivo com extensão correta
      const fileName = this.getFileNameWithExtension(anexo, blob.type);
      
      // Determinar o tipo MIME correto
      const mimeType = this.getCorrectMimeType(anexo, blob.type);
      
      console.log('📋 Informações do download:', {
        anexo: {
          id: anexo.id,
          original_name: anexo.original_name,
          filename: anexo.filename,
          mime_type: anexo.mime_type,
          url: anexo.url
        },
        blob: {
          type: blob.type,
          size: blob.size
        },
        resultado: {
          fileName,
          mimeType
        }
      });
      
      // Criar um blob com o tipo MIME correto
      const correctBlob = new Blob([blob], { type: mimeType });
      
      // Criar URL do blob
      const blobUrl = window.URL.createObjectURL(correctBlob);
      
      // Verificar se é uma imagem para decidir entre download ou abrir em nova aba
      const isImage = this.isImageFile(mimeType, fileName);
      
      if (isImage) {
        // Para imagens: abrir em nova aba
        console.log('🖼️ Abrindo imagem em nova aba:', fileName);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        
        // Adicionar ao DOM, clicar e remover
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Limpar a URL do blob após um delay para permitir que a aba abra
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 1000);
        
      } else {
        // Para outros arquivos: download normal
        console.log('📥 Fazendo download do arquivo:', fileName);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.style.display = 'none';
        
        // Adicionar ao DOM, clicar e remover
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Limpar a URL do blob para liberar memória
        window.URL.revokeObjectURL(blobUrl);
      }
      
              console.log('✅ Ação concluída:', isImage ? 'Imagem aberta em nova aba' : 'Download realizado', fileName, 'Tipo:', mimeType);
      
      // Aqui você pode adicionar um toast de sucesso
      // this.toastService.showSuccess(`Download de "${fileName}" concluído`);
      
    } catch (error: any) {
      console.error('❌ Erro ao fazer download:', error);
      
      const errorMessage = error.message || 'Erro ao fazer download do anexo';
      console.error('Mensagem de erro:', errorMessage);
      
      // Aqui você pode adicionar um toast de erro
      // this.toastService.showError(errorMessage);
    } finally {
      // Remover do conjunto de downloads em andamento
      this.downloadingAnexos.delete(anexo.id);
    }
  }

  /**
   * Determina o nome do arquivo com extensão correta
   * @param anexo Objeto do anexo
   * @param blobType Tipo MIME do blob
   * @returns Nome do arquivo com extensão
   */
  private getFileNameWithExtension(anexo: any, blobType: string): string {
    // Priorizar o nome original do anexo
    let fileName = anexo.original_name || anexo.filename || anexo.name || 'arquivo';
    
    // Se o nome não tem extensão, adicionar baseado no tipo MIME
    if (!fileName.includes('.')) {
      const extension = this.getExtensionFromMimeType(anexo.mime_type || blobType);
      fileName += extension;
    }
    
    // Se ainda não tem extensão, tentar extrair da URL do Supabase
    if (!fileName.includes('.')) {
      const urlExtension = this.extractExtensionFromUrl(anexo.url);
      if (urlExtension) {
        fileName += urlExtension;
      }
    }
    
    return fileName;
  }

  /**
   * Determina o tipo MIME correto para o arquivo
   * @param anexo Objeto do anexo
   * @param blobType Tipo MIME do blob
   * @returns Tipo MIME correto
   */
  private getCorrectMimeType(anexo: any, blobType: string): string {
    // Priorizar o tipo MIME do anexo
    if (anexo.mime_type) {
      return anexo.mime_type;
    }
    
    // Se não tem, usar o tipo do blob
    if (blobType && blobType !== 'application/octet-stream') {
      return blobType;
    }
    
    // Fallback baseado na extensão do arquivo
    const fileName = anexo.original_name || anexo.filename || anexo.name || '';
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    return this.getMimeTypeFromExtension(extension) || 'application/octet-stream';
  }

  /**
   * Obtém a extensão baseada no tipo MIME
   * @param mimeType Tipo MIME
   * @returns Extensão do arquivo
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExtension: { [key: string]: string } = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'video/mp4': '.mp4',
      'video/avi': '.avi',
      'video/quicktime': '.mov',
      'text/plain': '.txt',
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar'
    };
    
    return mimeToExtension[mimeType] || '';
  }

  /**
   * Obtém o tipo MIME baseado na extensão
   * @param extension Extensão do arquivo
   * @returns Tipo MIME
   */
  private getMimeTypeFromExtension(extension: string): string {
    const extensionToMime: { [key: string]: string } = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'mp4': 'video/mp4',
      'avi': 'video/avi',
      'mov': 'video/quicktime',
      'txt': 'text/plain',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed'
    };
    
    return extensionToMime[extension] || 'application/octet-stream';
  }

  /**
   * Gera o tooltip apropriado para o botão de download baseado no tipo de arquivo
   * @param anexo Objeto do anexo
   * @returns Texto do tooltip
   */
  public getDownloadTooltip(anexo: any): string {
    const fileName = anexo.original_name || anexo.filename || 'arquivo';
    const mimeType = anexo.mime_type || '';
    
    // Verificar se é uma imagem
    if (this.isImageFile(mimeType, fileName)) {
      return `Visualizar ${fileName} (abre em nova aba)`;
    } else {
      return `Baixar ${fileName} (preserva formato original)`;
    }
  }

  /**
   * Verifica se um arquivo é uma imagem baseado no tipo MIME e nome
   * @param mimeType Tipo MIME do arquivo
   * @param fileName Nome do arquivo
   * @returns true se for uma imagem
   */
  private isImageFile(mimeType: string, fileName: string): boolean {
    // Verificar por tipo MIME primeiro
    const imageMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/svg+xml',
      'image/tiff',
      'image/tif'
    ];
    
    if (imageMimeTypes.includes(mimeType)) {
      return true;
    }
    
    // Verificar por extensão se o tipo MIME não for específico
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif'];
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (extension && imageExtensions.includes('.' + extension)) {
      return true;
    }
    
    return false;
  }

  /**
   * Extrai a extensão de uma URL (especialmente URLs do Supabase Storage)
   * @param url URL do arquivo
   * @returns Extensão do arquivo
   */
  private extractExtensionFromUrl(url: string): string {
    if (!url) return '';
    
    try {
      // Decodificar a URL para lidar com caracteres especiais (como %20 para espaços)
      const decodedUrl = decodeURIComponent(url);
      
      console.log('🔍 Analisando URL para extrair extensão:', {
        original: url,
        decoded: decodedUrl
      });
      
      // Extrair o nome do arquivo da URL
      const fileName = decodedUrl.split('/').pop() || '';
      
      console.log('📄 Nome do arquivo extraído:', fileName);
      
      // Extrair a extensão
      const extension = fileName.split('.').pop()?.toLowerCase();
      
      console.log('🔧 Extensão encontrada:', extension);
      
      if (extension && extension.length <= 5) { // Extensões válidas têm até 5 caracteres
        return '.' + extension;
      }
    } catch (error) {
      console.warn('Erro ao extrair extensão da URL:', error);
    }
    
    return '';
  }

  isTipoArquivoValido(file: File): boolean {
    const tiposValidos = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'video/mp4',
      'video/avi',
      'video/quicktime'
    ];

    return tiposValidos.includes(file.type);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  limparArquivos() {
    this.arquivosSelecionados = [];
  }

  /**
   * Gera um ID a partir do título da entrega
   * Converte para minúsculas, remove acentos e substitui espaços por underline
   * Adiciona timestamp para garantir unicidade
   */
  private gerarIdFromTitulo(titulo: string): string {
    const baseId = titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/\s+/g, '_') // Substitui espaços por underline
      .replace(/[^a-z0-9_]/g, '') // Remove caracteres especiais exceto underline
      .replace(/_+/g, '_') // Remove underlines duplicados
      .replace(/^_|_$/g, ''); // Remove underlines no início e fim
    
    // Adicionar timestamp para garantir unicidade
    const timestamp = Date.now().toString().slice(-8); // Últimos 8 dígitos do timestamp
    
    return `${baseId}_${timestamp}`;
  }

  // Método chamado quando a aba muda
  async onAbaChange() {
    console.log('🔄 Aba mudou para:', this.aba);
    
    // Resetar paginação para página 1 quando a aba muda
    if (this.aba === 'pendentes') {
      this.currentPagePendentes = 1;
      console.log('📊 Carregando dados da aba Pendentes (Tarefas)...');
      await this.carregarAtividadesPendentes(1);
    } else if (this.aba === 'processos-pendentes') {
      console.log('📊 Carregando dados da aba Pendentes (Processos)...');
      await this.carregarProcessosPendentes();
    } else if (this.aba === 'finalizados') {
      this.currentPageFinalizadas = 1;
      console.log('📊 Carregando dados da aba Aguardando Aprovação...');
      await this.carregarAtividadesFinalizadas(1);
    } else if (this.aba === 'aprovados') {
      this.currentPageAprovadas = 1;
      console.log('📊 Carregando dados da aba Aprovados...');
      await this.carregarAtividadesAprovadas(1);
    } else if (this.aba === 'cancelados') {
      this.currentPageCanceladas = 1;
      console.log('📊 Carregando dados da aba Cancelados...');
      await this.carregarAtividadesCanceladas(1);
    } else if (this.aba === 'incompletos') {
      console.log('📊 Carregando dados da aba Incompleto...');
      await this.carregarProcessosIncompletos();
    } else if (this.aba === 'entregues') {
      console.log('📊 Carregando dados da aba Entregue...');
      await this.carregarProcessosEntregues();
    } else if (this.aba === 'processos-cancelados') {
      console.log('📊 Carregando dados da aba Cancelados (Processos)...');
      await this.carregarProcessosCancelados();
    }
  }



  async loadAliases() {
    this.aliasService.getAliases().then(aliases => {
      this.aliases = aliases;
    });
  }

  // ===== MÉTODOS PARA CARREGAR PROCESSOS =====

  async carregarProcessosPendentes() {
    this.loadingProcessosPendentes = true;
    try {
      const context = this.getCurrentContext();
      console.log('🔄 Modal - Iniciando carregamento de processos pendentes...');
      console.log('📋 Parâmetros:', { 
        timeId: context.timeId, 
        userId: context.userId, 
        isTeamContext: context.isTeamContext,
        viewMode: this.viewMode
      });
      
      this.processosPendentes = await this.pontosAvulsosService.getProcessosPendentes(
        context.timeId,
        context.userId,
        context.isTeamContext
      );
      
      // Salvar lista original para filtragem local
      this.processosPendentesOriginais = [...this.processosPendentes];
      
      // Aplicar filtros locais se houver busca
      this.aplicarFiltrosLocaisProcessos();
      
      console.log('✅ Modal - Processos pendentes carregados:', this.processosPendentes.length);
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar processos pendentes:', error);
      this.processosPendentes = [];
      this.processosPendentesOriginais = [];
    } finally {
      this.loadingProcessosPendentes = false;
    }
  }

  async carregarProcessosIncompletos() {
    this.loadingProcessosIncompletos = true;
    try {
      const context = this.getCurrentContext();
      console.log('🔄 Modal - Iniciando carregamento de processos incompletos...');
      console.log('📋 Parâmetros:', { 
        timeId: context.timeId, 
        userId: context.userId, 
        isTeamContext: context.isTeamContext,
        viewMode: this.viewMode
      });
      
      this.processosIncompletos = await this.pontosAvulsosService.getProcessosIncompletos(
        context.timeId,
        context.userId,
        context.isTeamContext
      );
      
      // Salvar lista original para filtragem local
      this.processosIncompletosOriginais = [...this.processosIncompletos];
      
      // Aplicar filtros locais se houver busca
      this.aplicarFiltrosLocaisProcessos();
      
      console.log('✅ Modal - Processos incompletos carregados:', this.processosIncompletos.length);
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar processos incompletos:', error);
      this.processosIncompletos = [];
      this.processosIncompletosOriginais = [];
    } finally {
      this.loadingProcessosIncompletos = false;
    }
  }

  async carregarProcessosEntregues() {
    this.loadingProcessosEntregues = true;
    try {
      const context = this.getCurrentContext();
      console.log('🔄 Modal - Iniciando carregamento de processos entregues...');
      console.log('📋 Parâmetros:', { 
        timeId: context.timeId, 
        userId: context.userId, 
        isTeamContext: context.isTeamContext,
        viewMode: this.viewMode
      });
      
      this.processosEntregues = await this.pontosAvulsosService.getProcessosEntregues(
        context.timeId,
        context.userId,
        context.isTeamContext
      );
      
      // Salvar lista original para filtragem local
      this.processosEntreguesOriginais = [...this.processosEntregues];
      
      // Aplicar filtros locais se houver busca
      this.aplicarFiltrosLocaisProcessos();
      
      console.log('✅ Modal - Processos entregues carregados:', this.processosEntregues.length);
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar processos entregues:', error);
      this.processosEntregues = [];
      this.processosEntreguesOriginais = [];
    } finally {
      this.loadingProcessosEntregues = false;
    }
  }

  async carregarProcessosCancelados() {
    this.loadingProcessosCancelados = true;
    try {
      const context = this.getCurrentContext();
      this.processosCancelados = await this.pontosAvulsosService.getProcessosCancelados(
        context.timeId,
        context.userId,
        context.isTeamContext
      );
      
      // Salvar lista original para filtragem local
      this.processosCanceladosOriginais = [...this.processosCancelados];
      
      // Aplicar filtros locais se houver busca
      this.aplicarFiltrosLocaisProcessos();
    } catch (error) {
      console.error('❌ Modal - Erro ao carregar processos cancelados:', error);
      this.processosCancelados = [];
      this.processosCanceladosOriginais = [];
    } finally {
      this.loadingProcessosCancelados = false;
    }
  }

  get isAdminOrGerente() {
    return (
        this.sessao.isAdmin() ||
        this.sessao.isGerente()
    );
  }

  /**
   * Método chamado quando o tipo de botão é alterado
   * @param typeIndex Índice do tipo selecionado (0 = Processos, 1 = Tarefas, 2 = Criar)
   */
  onTypeChange(typeIndex: number) {
    console.log('🔄 Alterando tipo para:', typeIndex);
    
    // Se estiver no detalhe de uma atividade, fechar o detalhe primeiro
    if (this.mostrarDetalhe) {
      console.log('📋 Fechando detalhe de atividade antes de trocar de tipo');
      this.abaAnterior = null;
      this.fecharDetalhe();
    }
    
    // Se estiver no detalhe de uma delivery, fechar o detalhe primeiro
    // Mas preservar o estado se estivermos retornando de uma criação
    if (this.mostrarDetalheDelivery && !this.retornarParaDelivery && !this.estadoDetalheProcessoCache) {
      console.log('📋 Fechando detalhe de delivery antes de trocar de tipo');
      this.abaAnterior = null;
      this.fecharDetalheDelivery();
      // Limpar cache se estiver navegando manualmente
      this.limparEstadoDetalheProcesso();
    }
    
    this.selectedType = typeIndex;
    
    // Definir a aba inicial baseada no tipo selecionado
    switch (typeIndex) {
      case 0: // Processos
        this.aba = 'processos-pendentes';
        break;
      case 1: // Tarefas
        this.aba = 'pendentes';
        break;
      case 2: // Criar
        this.aba = 'atribuir';
        // Limpar formulário se não estiver vindo de uma delivery
        if (!this.retornarParaDelivery && !this.estadoDetalheProcessoCache) {
          this.limparFormularioAtribuicao();
        }
        break;
    }
    
    // Carregar dados da aba correspondente
    this.onAbaChange();
  }

  /**
   * Método chamado quando uma aba tradicional é clicada
   * Atualiza o botão de seleção correspondente
   * @param novaAba Nova aba selecionada
   */
  trocarAba(novaAba: 'atribuir' | 'pendentes' | 'aprovados' | 'cancelados' | 'finalizados' | 'incompletos' | 'entregues' | 'processos-pendentes' | 'processos-cancelados') {
    console.log('🔄 Tentando trocar para aba:', novaAba);
    
    // Se estiver no detalhe de uma atividade, fechar o detalhe primeiro
    if (this.mostrarDetalhe) {
      console.log('📋 Fechando detalhe de atividade antes de trocar de aba');
      // Definir abaAnterior como null para indicar que estamos trocando de aba
      this.abaAnterior = null;
      this.fecharDetalhe();
    }
    
    // Se estiver no detalhe de uma delivery, fechar o detalhe primeiro
    if (this.mostrarDetalheDelivery) {
      console.log('📋 Fechando detalhe de delivery antes de trocar de aba');
      // Definir abaAnterior como null para indicar que estamos trocando de aba
      this.abaAnterior = null;
      this.fecharDetalheDelivery();
    }
    
    // Limpar estado de retorno e cache se o usuário navegar manualmente
    if (this.retornarParaDelivery || this.estadoDetalheProcessoCache) {
      console.log('🧹 Limpando estado de retorno e cache - navegação manual detectada');
      this.limparEstadoDetalheProcesso();
      this.limparEstadoRetorno();
    }
    
    // Trocar para a nova aba
    this.aba = novaAba;
    
    // Atualizar o botão de seleção baseado na aba
    switch (novaAba) {
      case 'atribuir':
        this.selectedType = 2; // Criar
        break;
      case 'pendentes':
      case 'finalizados':
      case 'aprovados':
      case 'cancelados':
        this.selectedType = 1; // Tarefas
        break;
      case 'processos-pendentes':
      case 'incompletos':
      case 'entregues':
      case 'processos-cancelados':
        this.selectedType = 0; // Processos
        break;
    }
    
    // Carregar dados da nova aba (exceto para "atribuir" que não precisa carregar dados)
    if (novaAba !== 'atribuir') {
      this.onAbaChange();
    } else {
      console.log('📝 Aba "Atribuir" selecionada - não precisa carregar dados');
      // Limpar formulário se não estiver vindo de uma delivery
      if (!this.retornarParaDelivery) {
        this.limparFormularioAtribuicao();
      }
    }
  }

  // ========== Métodos para Painel de Filtros e Ações ==========

  /**
   * Retorna a lista de itens selecionados
   */
  getItensSelecionados(): any[] {
    const itens: any[] = [];
    
    // Buscar itens selecionados das diferentes listas
    this.atividadesPendentes.forEach(item => {
      if (this.isItemSelecionado(item)) itens.push(item);
    });
    this.atividadesFinalizadas.forEach(item => {
      if (this.isItemSelecionado(item)) itens.push(item);
    });
    this.atividadesAprovadas.forEach(item => {
      if (this.isItemSelecionado(item)) itens.push(item);
    });
    this.atividadesCanceladas.forEach(item => {
      if (this.isItemSelecionado(item)) itens.push(item);
    });
    this.processosPendentes.forEach(item => {
      if (this.isItemSelecionado(item)) itens.push(item);
    });
    
    return itens;
  }

  /**
   * Verifica se um item está selecionado
   */
  isItemSelecionado(item: any): boolean {
    const id = this.getItemId(item);
    return this.itensSelecionadosIds.has(id);
  }

  /**
   * Obtém o ID único de um item (delivery_id, integration_id ou id)
   */
  getItemId(item: any): string | number {
    return item.integration_id || item.delivery_id || item.id || '';
  }

  /**
   * Toggle de seleção de um item
   */
  toggleSelecionarItem(item: any) {
    const id = this.getItemId(item);
    if (this.itensSelecionadosIds.has(id)) {
      this.itensSelecionadosIds.delete(id);
    } else {
      this.itensSelecionadosIds.add(id);
    }
  }

  /**
   * Seleciona/desseleciona todos os itens pendentes
   */
  toggleSelecionarTodosPendentes(event: any) {
    const selecionar = event.target.checked;
    if (selecionar) {
      this.atividadesPendentes.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    } else {
      this.atividadesPendentes.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    }
  }

  /**
   * Versão manual para checkbox customizado - seleciona/desseleciona todos os itens pendentes
   */
  toggleSelecionarTodosPendentesManual() {
    const todosSelecionados = this.itensSelecionadosIds.size === this.atividadesPendentes.length && this.atividadesPendentes.length > 0;
    if (todosSelecionados) {
      this.atividadesPendentes.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    } else {
      this.atividadesPendentes.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    }
  }

  /**
   * Seleciona/desseleciona todos os itens finalizados
   */
  toggleSelecionarTodosFinalizadas(event: any) {
    const selecionar = event.target.checked;
    if (selecionar) {
      this.atividadesFinalizadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    } else {
      this.atividadesFinalizadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    }
  }

  /**
   * Versão manual para checkbox customizado - seleciona/desseleciona todos os itens finalizados
   */
  toggleSelecionarTodosFinalizadasManual() {
    const todosSelecionados = this.itensSelecionadosIds.size === this.atividadesFinalizadas.length && this.atividadesFinalizadas.length > 0;
    if (todosSelecionados) {
      this.atividadesFinalizadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    } else {
      this.atividadesFinalizadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    }
  }

  /**
   * Seleciona/desseleciona todos os itens aprovados
   */
  toggleSelecionarTodosAprovadas(event: any) {
    const selecionar = event.target.checked;
    if (selecionar) {
      this.atividadesAprovadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    } else {
      this.atividadesAprovadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    }
  }

  /**
   * Versão manual para checkbox customizado - seleciona/desseleciona todos os itens aprovados
   */
  toggleSelecionarTodosAprovadasManual() {
    const todosSelecionados = this.itensSelecionadosIds.size === this.atividadesAprovadas.length && this.atividadesAprovadas.length > 0;
    if (todosSelecionados) {
      this.atividadesAprovadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    } else {
      this.atividadesAprovadas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    }
  }

  /**
   * Seleciona/desseleciona todos os itens cancelados
   */
  toggleSelecionarTodosCanceladas(event: any) {
    const selecionar = event.target.checked;
    if (selecionar) {
      this.atividadesCanceladas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    } else {
      this.atividadesCanceladas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    }
  }

  /**
   * Versão manual para checkbox customizado - seleciona/desseleciona todos os itens cancelados
   */
  toggleSelecionarTodosCanceladasManual() {
    const todosSelecionados = this.itensSelecionadosIds.size === this.atividadesCanceladas.length && this.atividadesCanceladas.length > 0;
    if (todosSelecionados) {
      this.atividadesCanceladas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    } else {
      this.atividadesCanceladas.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    }
  }

  /**
   * Seleciona/desseleciona todos os processos pendentes
   */
  toggleSelecionarTodosProcessosPendentes(event: any) {
    const selecionar = event.target.checked;
    if (selecionar) {
      this.processosPendentes.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    } else {
      this.processosPendentes.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    }
  }

  /**
   * Retorna lista de executores para o seletor
   * Prioriza todos os jogadores do time e depois adiciona executores das atividades
   */
  getExecutorsList(): Array<{value: string, label: string}> {
    const executors: Array<{value: string, label: string}> = [];
    const executorsSet = new Set<string>();

    // Primeiro, adicionar TODOS os jogadores do time (prioridade)
    if (this.jogadores && this.jogadores.length > 0) {
      this.jogadores.forEach(jogador => {
        const email = jogador.email || jogador.user_email || jogador.id;
        const nome = jogador.name || jogador.full_name || this.formatEmailToName(email) || email;
        
        if (email && !executorsSet.has(email)) {
          executorsSet.add(email);
          executors.push({
            value: email,
            label: nome
          });
        }
      });
    }

    // Depois, adicionar executores únicos das atividades (caso não estejam no time)
    const todasAtividades = [
      ...this.atividadesPendentes,
      ...this.atividadesFinalizadas,
      ...this.atividadesAprovadas,
      ...this.atividadesCanceladas
    ];

    todasAtividades.forEach(item => {
      if (item.user_email && !executorsSet.has(item.user_email)) {
        executorsSet.add(item.user_email);
        executors.push({
          value: item.user_email,
          label: this.formatEmailToName(item.user_email)
        });
      }
    });

    return executors.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Retorna as ações disponíveis baseado no tipo de aba
   */
  getAcoesDisponiveis(tipo: string): Array<{tipo: 'cancelar' | 'finalizar' | 'restaurar' | 'aprovar', label: string, icon?: string, habilitado: boolean}> {
    const acoes: Array<{tipo: 'cancelar' | 'finalizar' | 'restaurar' | 'aprovar', label: string, icon?: string, habilitado: boolean}> = [];

    switch (tipo) {
      case 'pendentes':
        acoes.push(
          { tipo: 'cancelar', label: 'Cancelar', icon: 'icon-cancel', habilitado: true },
          { tipo: 'finalizar', label: 'Finalizar', icon: 'icon-check_circle', habilitado: true }
        );
        break;
      case 'finalizadas':
        acoes.push(
          { tipo: 'cancelar', label: 'Cancelar', icon: 'icon-cancel', habilitado: true },
          { tipo: 'aprovar', label: 'Aprovar', icon: 'icon-check_circle', habilitado: !!this.isAdminOrGerente }
        );
        break;
      case 'aprovadas':
        acoes.push(
          { tipo: 'cancelar', label: 'Cancelar', icon: 'icon-cancel', habilitado: true }
        );
        break;
      case 'canceladas':
        acoes.push(
          { tipo: 'restaurar', label: 'Restaurar', icon: 'icon-restore', habilitado: true }
        );
        break;
      case 'processos-pendentes':
        acoes.push(
          { tipo: 'cancelar', label: 'Cancelar Processos', icon: 'icon-cancel', habilitado: true }
        );
        break;
      case 'processos-cancelados':
        acoes.push(
          { tipo: 'restaurar', label: 'Restaurar Processos', icon: 'icon-restore', habilitado: true }
        );
        break;
    }

    return acoes;
  }

  /**
   * Busca todas as páginas da aba atual (sem filtros de busca) para permitir busca local completa
   */
  async buscarTodasPaginasAbaAtual(): Promise<void> {
    console.log('📥 Buscando todas as páginas da aba:', this.aba);
    
    // Criar filtros sem busca para buscar todas as páginas
    const filtrosSemBusca = { ...this.filtrosAtivos };
    delete filtrosSemBusca.busca;
    
    // Determinar qual método de busca usar baseado na aba atual
    if (this.aba === 'pendentes') {
      await this.buscarTodasPaginasPendentes(filtrosSemBusca);
    } else if (this.aba === 'finalizados') {
      await this.buscarTodasPaginasFinalizadas(filtrosSemBusca);
    } else if (this.aba === 'aprovados') {
      await this.buscarTodasPaginasAprovadas(filtrosSemBusca);
    } else if (this.aba === 'cancelados') {
      await this.buscarTodasPaginasCanceladas(filtrosSemBusca);
    }
  }

  /**
   * Busca todas as páginas de atividades pendentes
   */
  private async buscarTodasPaginasPendentes(filtros: any): Promise<void> {
    try {
      const context = this.getCurrentContext();
      let todasAtividades: AtividadeDetalhe[] = [];
      let page = 1;
      let temMaisPaginas = true;
      
      while (temMaisPaginas) {
        const response = await this.pontosAvulsosService.getAtividadesPendentesModal(
          context.timeId,
          context.userId,
          context.isTeamContext,
          page,
          100, // Usar limite maior para reduzir número de requisições
          filtros
        );
        
        todasAtividades = todasAtividades.concat(response.items);
        
        temMaisPaginas = page < response.totalPages;
        page++;
      }
      
      this.atividadesPendentesOriginais = todasAtividades;
      console.log(`✅ Total de ${todasAtividades.length} atividades pendentes carregadas`);
    } catch (error) {
      console.error('❌ Erro ao buscar todas as páginas pendentes:', error);
    }
  }

  /**
   * Busca todas as páginas de atividades finalizadas
   */
  private async buscarTodasPaginasFinalizadas(filtros: any): Promise<void> {
    try {
      const context = this.getCurrentContext();
      let todasAtividades: AtividadeDetalhe[] = [];
      let page = 1;
      let temMaisPaginas = true;
      
      while (temMaisPaginas) {
        const response = await this.pontosAvulsosService.getAtividadesFinalizadasModal(
          context.timeId || 0,
          context.userId || '',
          context.isTeamContext,
          page,
          100,
          filtros
        );
        
        todasAtividades = todasAtividades.concat(response.items);
        
        temMaisPaginas = page < response.totalPages;
        page++;
      }
      
      this.atividadesFinalizadasOriginais = todasAtividades;
      console.log(`✅ Total de ${todasAtividades.length} atividades finalizadas carregadas`);
    } catch (error) {
      console.error('❌ Erro ao buscar todas as páginas finalizadas:', error);
    }
  }

  /**
   * Busca todas as páginas de atividades aprovadas
   */
  private async buscarTodasPaginasAprovadas(filtros: any): Promise<void> {
    try {
      const context = this.getCurrentContext();
      let todasAtividades: AtividadeDetalhe[] = [];
      let page = 1;
      let temMaisPaginas = true;
      
      while (temMaisPaginas) {
        const response = await this.pontosAvulsosService.getAtividadesAprovadasModal(
          context.timeId || 0,
          context.userId || '',
          context.isTeamContext,
          page,
          100,
          filtros
        );
        
        todasAtividades = todasAtividades.concat(response.items);
        
        temMaisPaginas = page < response.totalPages;
        page++;
      }
      
      this.atividadesAprovadasOriginais = todasAtividades;
      console.log(`✅ Total de ${todasAtividades.length} atividades aprovadas carregadas`);
    } catch (error) {
      console.error('❌ Erro ao buscar todas as páginas aprovadas:', error);
    }
  }

  /**
   * Busca todas as páginas de atividades canceladas
   */
  private async buscarTodasPaginasCanceladas(filtros: any): Promise<void> {
    try {
      const context = this.getCurrentContext();
      let todasAtividades: AtividadeDetalhe[] = [];
      let page = 1;
      let temMaisPaginas = true;
      
      while (temMaisPaginas) {
        const response = await this.pontosAvulsosService.getAtividadesCanceladasModal(
          context.timeId,
          context.userId,
          context.isTeamContext,
          page,
          100,
          filtros
        );
        
        todasAtividades = todasAtividades.concat(response.items);
        
        temMaisPaginas = page < response.totalPages;
        page++;
      }
      
      this.atividadesCanceladasOriginais = todasAtividades;
      console.log(`✅ Total de ${todasAtividades.length} atividades canceladas carregadas`);
    } catch (error) {
      console.error('❌ Erro ao buscar todas as páginas canceladas:', error);
    }
  }

  /**
   * Alterna o modo de visualização entre pessoal e do time
   * Apenas disponível para jogadores que têm um time associado
   */
  async toggleViewMode() {
    if (!this.canViewTeamData || !this.playerTeamId) {
      return;
    }

    this.viewMode = this.viewMode === 'personal' ? 'team' : 'personal';
    console.log('🔄 Modo de visualização alterado para:', this.viewMode);

    // Recarregar dados com o novo contexto
    await this.onAbaChange();
  }

  /**
   * Retorna o contexto atual baseado no modo de visualização
   * Se o jogador está em modo 'team', retorna contexto de time
   */
  getCurrentContext(): { isTeamContext: boolean; timeId?: number; userId?: string } {
    if (this.isPlayer && this.viewMode === 'team' && this.playerTeamId) {
      // Jogador visualizando dados do time
      return {
        isTeamContext: true,
        timeId: this.playerTeamId,
        userId: this.userId // Manter userId para referência, mas usar timeId para busca
      };
    }
    
    // Comportamento padrão: usar o contexto original
    return {
      isTeamContext: this.isTeamContext,
      timeId: this.timeId,
      userId: this.userId
    };
  }

  /**
   * Método chamado quando os filtros são alterados
   */
  async onFiltrosChange(filtros: any) {
    console.log('🔍 Filtros alterados:', filtros);
    
    // Normalizar busca: se for string vazia, tratar como undefined
    const buscaNormalizada = filtros?.busca?.trim() || undefined;
    
    // Atualizar filtros ativos com busca normalizada
    this.filtrosAtivos = {
      ...filtros,
      busca: buscaNormalizada
    };
    
    // Se houver filtros de data (qualquer data preenchida) ou executor, recarregar do backend
    const temFiltroData = !!(filtros?.created_at_start || filtros?.created_at_end || 
                             filtros?.finished_at_start || filtros?.finished_at_end);
    const temFiltroBackend = temFiltroData || !!filtros?.executor;
    
    if (temFiltroBackend) {
      // Resetar para primeira página quando filtros mudam
      this.currentPagePendentes = 1;
      this.currentPageFinalizadas = 1;
      this.currentPageAprovadas = 1;
      this.currentPageCanceladas = 1;
      
      // Recarregar dados com os filtros aplicados baseado na aba atual
      await this.onAbaChange();
    } else {
      // Busca por texto - filtrar localmente (mesmo se vazia, para restaurar listas)
      this.aplicarFiltrosLocais();
    }
  }

  /**
   * Aplica filtros locais (busca por texto) nas listas já carregadas
   */
  aplicarFiltrosLocais() {
    // Normalizar busca: remover espaços e converter para lowercase
    const buscaRaw = this.filtrosAtivos?.busca || '';
    const busca = buscaRaw.trim().toLowerCase();
    
    if (!busca) {
      // Sem busca, restaurar listas originais completas
      this.atividadesPendentes = [...this.atividadesPendentesOriginais];
      this.atividadesFinalizadas = [...this.atividadesFinalizadasOriginais];
      this.atividadesAprovadas = [...this.atividadesAprovadasOriginais];
      this.atividadesCanceladas = [...this.atividadesCanceladasOriginais];
      return;
    }
    
    // Filtrar cada lista com a busca
    this.atividadesPendentes = this.atividadesPendentesOriginais.filter(item => 
      this.matchBusca(item, busca)
    );
    
    this.atividadesFinalizadas = this.atividadesFinalizadasOriginais.filter(item => 
      this.matchBusca(item, busca)
    );
    
    this.atividadesAprovadas = this.atividadesAprovadasOriginais.filter(item => 
      this.matchBusca(item, busca)
    );
    
    this.atividadesCanceladas = this.atividadesCanceladasOriginais.filter(item => 
      this.matchBusca(item, busca)
    );
  }

  /**
   * Verifica se há filtros de backend ativos (data ou executor)
   * A paginação deve aparecer apenas quando não há apenas busca local
   */
  temFiltrosBackend(): boolean {
    // Se não há filtros ou o objeto está vazio, mostrar paginação
    if (!this.filtrosAtivos || Object.keys(this.filtrosAtivos).length === 0) {
      return true;
    }
    
    // Se há apenas busca por texto (sem data ou executor), NÃO mostrar paginação (busca local)
    // Verificar se busca tem conteúdo (não vazia)
    const buscaValida = this.filtrosAtivos.busca && 
                       typeof this.filtrosAtivos.busca === 'string' && 
                       this.filtrosAtivos.busca.trim().length > 0;
    const temFiltroData = !!(this.filtrosAtivos.created_at_start || this.filtrosAtivos.created_at_end || 
                             this.filtrosAtivos.finished_at_start || this.filtrosAtivos.finished_at_end);
    const temApenasBusca = buscaValida && !temFiltroData && !this.filtrosAtivos.executor;
    
    return !temApenasBusca;
  }

  /**
   * Verifica se deve mostrar a paginação da aba canceladas
   */
  get deveMostrarPaginacaoCanceladas(): boolean {
    // Verificação básica: deve ter paginação, múltiplas páginas e não estar carregando
    if (!this.paginacaoCanceladas) {
      return false;
    }
    
    if (this.paginacaoCanceladas.totalPages <= 1) {
      return false;
    }
    
    if (this.loadingAtividadesCanceladas) {
      return false;
    }
    
    // Se não há filtros ou o objeto está vazio, mostrar paginação
    if (!this.filtrosAtivos || Object.keys(this.filtrosAtivos).length === 0) {
      return true;
    }
    
    // Se há busca válida (com conteúdo) mas não há filtros de data ou executor, esconder paginação
    const buscaValida = this.filtrosAtivos.busca && 
                       typeof this.filtrosAtivos.busca === 'string' && 
                       this.filtrosAtivos.busca.trim().length > 0;
    const temFiltroData = !!(this.filtrosAtivos.created_at_start || this.filtrosAtivos.created_at_end || 
                             this.filtrosAtivos.finished_at_start || this.filtrosAtivos.finished_at_end);
    const temApenasBusca = buscaValida && !temFiltroData && !this.filtrosAtivos.executor;
    
    // Se há apenas busca local, não mostrar paginação; caso contrário, mostrar
    return !temApenasBusca;
  }

  /**
   * Verifica se deve mostrar a paginação da aba pendentes
   */
  get deveMostrarPaginacaoPendentes(): boolean {
    // Verificação básica: deve ter paginação, múltiplas páginas e não estar carregando
    if (!this.paginacaoPendentes) {
      return false;
    }
    
    if (this.paginacaoPendentes.totalPages <= 1) {
      return false;
    }
    
    if (this.loadingAtividadesPendentes) {
      return false;
    }
    
    // Se não há filtros ou o objeto está vazio, mostrar paginação
    if (!this.filtrosAtivos || Object.keys(this.filtrosAtivos).length === 0) {
      return true;
    }
    
    // Se há busca válida (com conteúdo) mas não há filtros de data ou executor, esconder paginação
    const buscaValida = this.filtrosAtivos.busca && 
                       typeof this.filtrosAtivos.busca === 'string' && 
                       this.filtrosAtivos.busca.trim().length > 0;
    const temFiltroData = !!(this.filtrosAtivos.created_at_start || this.filtrosAtivos.created_at_end || 
                             this.filtrosAtivos.finished_at_start || this.filtrosAtivos.finished_at_end);
    const temApenasBusca = buscaValida && !temFiltroData && !this.filtrosAtivos.executor;
    
    // Se há apenas busca local, não mostrar paginação; caso contrário, mostrar
    return !temApenasBusca;
  }

  /**
   * Verifica se deve mostrar a paginação da aba aprovadas
   */
  get deveMostrarPaginacaoAprovadas(): boolean {
    // Verificação básica: deve ter paginação, múltiplas páginas e não estar carregando
    if (!this.paginacaoAprovadas) {
      return false;
    }
    
    if (this.paginacaoAprovadas.totalPages <= 1) {
      return false;
    }
    
    if (this.loadingAtividadesAprovadas) {
      return false;
    }
    
    // Se não há filtros ou o objeto está vazio, mostrar paginação
    if (!this.filtrosAtivos || Object.keys(this.filtrosAtivos).length === 0) {
      return true;
    }
    
    // Se há busca válida (com conteúdo) mas não há filtros de data ou executor, esconder paginação
    const buscaValida = this.filtrosAtivos.busca && 
                       typeof this.filtrosAtivos.busca === 'string' && 
                       this.filtrosAtivos.busca.trim().length > 0;
    const temFiltroData = !!(this.filtrosAtivos.created_at_start || this.filtrosAtivos.created_at_end || 
                             this.filtrosAtivos.finished_at_start || this.filtrosAtivos.finished_at_end);
    const temApenasBusca = buscaValida && !temFiltroData && !this.filtrosAtivos.executor;
    
    // Se há apenas busca local, não mostrar paginação; caso contrário, mostrar
    return !temApenasBusca;
  }

  /**
   * Verifica se um item corresponde à busca (título, ID ou executor)
   */
  private matchBusca(item: any, busca: string): boolean {
    if (!busca) return true;
    
    // Buscar no título
    const titulo = (item.action_title || '').toLowerCase();
    if (titulo.includes(busca)) return true;
    
    // Buscar no ID (integration_id, delivery_id, id)
    const id = (item.integration_id || item.delivery_id || item.id || '').toString().toLowerCase();
    if (id.includes(busca)) return true;
    
    // Buscar no executor (email formatado)
    const executor = this.formatEmailToName(item.user_email || '').toLowerCase();
    if (executor.includes(busca)) return true;
    
    return false;
  }

  /**
   * Método chamado quando uma ação em lote é solicitada
   */
  onAcaoLote(tipo: 'cancelar' | 'finalizar' | 'restaurar' | 'aprovar') {
    console.log(`🔔 onAcaoLote chamado com tipo: ${tipo}`);
    const itensSelecionados = this.getItensSelecionados();
    console.log(`📋 Itens selecionados encontrados: ${itensSelecionados.length}`);
    
    if (itensSelecionados.length === 0) {
      console.warn('⚠️ Nenhum item selecionado');
      this.toastService.error('Selecione pelo menos um item para executar a ação');
      return;
    }

    // Verificar se há duplicatas nos itens selecionados
    const ids = new Set();
    const itensUnicos: any[] = [];
    itensSelecionados.forEach(item => {
      const id = this.getItemId(item);
      if (!ids.has(id)) {
        ids.add(id);
        itensUnicos.push(item);
      }
    });

    if (itensUnicos.length !== itensSelecionados.length) {
      console.warn(`⚠️ Detectados ${itensSelecionados.length - itensUnicos.length} itens duplicados. Processando apenas ${itensUnicos.length} itens únicos.`);
    }
    
    // Usar apenas itens únicos
    switch (tipo) {
      case 'cancelar':
        console.log('🚫 Chamando executarCancelamentoLote...');
        this.executarCancelamentoLote(itensUnicos);
        break;
      case 'finalizar':
        console.log('✅ Chamando executarFinalizacaoLote...');
        this.executarFinalizacaoLote(itensUnicos);
        break;
      case 'restaurar':
        console.log('🔄 Chamando executarRestauracaoLote...');
        this.executarRestauracaoLote(itensUnicos);
        break;
      case 'aprovar':
        console.log('👍 Chamando executarAprovacaoLote...');
        this.executarAprovacaoLote(itensUnicos);
        break;
    }
  }

  /**
   * Método chamado quando selecionar/desselecionar todos é solicitado
   */
  onSelecionarTodos(selecionar: boolean) {
    
    // Obter lista atual baseada na aba
    let listaAtual: any[] = [];
    switch (this.aba) {
      case 'pendentes':
        listaAtual = this.atividadesPendentes;
        break;
      case 'finalizados':
        listaAtual = this.atividadesFinalizadas;
        break;
      case 'aprovados':
        listaAtual = this.atividadesAprovadas;
        break;
      case 'cancelados':
        listaAtual = this.atividadesCanceladas;
        break;
      case 'processos-pendentes':
        listaAtual = this.processosPendentes;
        break;
    }

    if (selecionar) {
      listaAtual.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.add(id);
      });
    } else {
      listaAtual.forEach(item => {
        const id = this.getItemId(item);
        this.itensSelecionadosIds.delete(id);
      });
    }
  }

  /**
   * Método chamado quando alterar itens é solicitado
   */
  async onAlterarItens(alteracoes: {executor?: string}) {
    const itensSelecionados = this.getItensSelecionados();
    
    if (itensSelecionados.length === 0) {
      this.toastService.error('Selecione pelo menos um item para alterar');
      return;
    }

    if (!alteracoes.executor) {
      this.toastService.error('Selecione um executor para alterar');
      return;
    }

    try {
      this.isLoadingBlocking = true;
      let sucessos = 0;
      let falhas = 0;
      const erros: string[] = [];

      // Processar cada item selecionado
      for (let i = 0; i < itensSelecionados.length; i++) {
        const item = itensSelecionados[i];
        try {
          await this.atualizarItem(item, alteracoes);
          sucessos++;
          console.log(`✅ Item ${i + 1}/${itensSelecionados.length} alterado com sucesso!`);

          // Pequeno delay entre requisições
          if (i < itensSelecionados.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error: any) {
          falhas++;
          const errorMsg = error?.message || `Erro ao alterar item ${i + 1}`;
          erros.push(errorMsg);
          console.error(`❌ Erro ao alterar item ${i + 1}/${itensSelecionados.length}:`, error);
        }
      }

      // Mensagem de resultado
      if (sucessos > 0) {
        this.toastService.success(`${sucessos} item(s) alterado(s) com sucesso!`);
      }
      if (falhas > 0) {
        this.toastService.error(`${falhas} item(s) falharam ao alterar. ${erros.slice(0, 3).join('; ')}`);
      }

      // Limpar seleção e recarregar dados
      this.itensSelecionadosIds.clear();
      await this.onAbaChange();

    } catch (error: any) {
      console.error('❌ Erro geral ao alterar itens:', error);
      this.toastService.error('Erro ao processar alterações. Tente novamente.');
    } finally {
      this.isLoadingBlocking = false;
    }
  }

  /**
   * Atualiza um item individual fazendo POST em /game/action/process
   */
  private async atualizarItem(item: any, alteracoes: {executor?: string}) {
    const deliveryId = item.delivery_id || item.id;
    const integrationId = item.integration_id || item.id;

    if (!deliveryId && !integrationId) {
      throw new Error('Item sem ID válido');
    }

    // Preparar payload com dados existentes do item
    const payload: any = {
      status: item.status || 'PENDING',
      user_email: alteracoes.executor || item.user_email || this.currentUserEmail || '',
      action_id: item.action_id || item.action_template_id || '',
      delivery_id: deliveryId,
      delivery_title: item.delivery_title || item.title || item.name || '',
      created_at: item.created_at || new Date().toISOString(),
      integration_id: integrationId
    };

    // Adicionar campos opcionais se existirem
    if (item.finished_at) {
      payload.finished_at = item.finished_at;
    }
    if (item.points) {
      payload.points = item.points;
    }
    if (item.comments) {
      payload.comments = item.comments;
    }

    // Fazer POST
    await this.pontosAvulsosService.processAction(payload);
  }

  /**
   * Método chamado quando limpar filtros é solicitado
   */
  async onLimparFiltros() {
    console.log('🧹 Limpando filtros');
    this.filtrosAtivos = {};
    
    // Restaurar listas originais
    this.atividadesPendentes = [...this.atividadesPendentesOriginais];
    this.atividadesFinalizadas = [...this.atividadesFinalizadasOriginais];
    this.atividadesAprovadas = [...this.atividadesAprovadasOriginais];
    this.atividadesCanceladas = [...this.atividadesCanceladasOriginais];
    
    // Resetar para primeira página
    this.currentPagePendentes = 1;
    this.currentPageFinalizadas = 1;
    this.currentPageAprovadas = 1;
    this.currentPageCanceladas = 1;
    
    // Recarregar dados sem filtros do backend
    await this.onAbaChange();
  }

  // ========== Métodos auxiliares para ações em lote ==========

  /**
   * Obtém o action_id de um item específico
   */
  private async getActionIdForItem(item: any): Promise<string | null> {
    // Se já temos o action_id, retornar
    if (item.action_id || item.action_template_id) {
      return item.action_id || item.action_template_id;
    }

    // Se não temos o action_id mas temos o título, buscar pelo título
    if (item.action_title) {
      console.log('🔍 Action ID não encontrado, buscando pelo título:', item.action_title);
      const actionId = await this.pontosAvulsosService.getActionIdByTitle(item.action_title);
      
      if (actionId) {
        // Atualizar o objeto da atividade com o action_id encontrado
        if (item.action_id !== undefined) {
          item.action_id = actionId;
        }
        return actionId;
      }
    }

    console.error('❌ Action ID não encontrado na atividade e não foi possível buscar pelo título');
    return null;
  }

  /**
   * Executa cancelamento em lote de atividades
   */
  async executarCancelamentoLote(itens: any[]) {
    if (!this.currentUserEmail) {
      this.toastService.error('Email do usuário não fornecido');
      return;
    }

    // Abrir modal de confirmação para obter motivo do cancelamento
    const modalRef = this.modalService.open(ModalMotivoCancelamentoComponent, { size: 'sm' });
    const motivo = await modalRef.result.catch(() => null);
    
    if (!motivo) {
      return; // Usuário cancelou o modal
    }

    console.log(`🚫 Cancelando ${itens.length} item(s) em lote`);

    try {
      this.isLoadingBlocking = true;
      let sucessos = 0;
      let falhas = 0;
      const erros: string[] = [];

      // Processar cada item selecionado
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        try {
          // Obter action_id do item
          const actionId = await this.getActionIdForItem(item);
          if (!actionId) {
            falhas++;
            erros.push(`Item ${i + 1}: Action ID não encontrado`);
            continue;
          }

          // Obter delivery_id
          const deliveryId = item.delivery_id || item.integration_id || item.id;
          if (!deliveryId) {
            falhas++;
            erros.push(`Item ${i + 1}: Delivery ID não encontrado`);
            continue;
          }

          // Usar o email do executor da atividade (não o do usuário logado)
          const executorEmail = item.user_email;
          if (!executorEmail) {
            falhas++;
            erros.push(`Item ${i + 1}: Email do executor não encontrado`);
            continue;
          }

          // Cancelar atividade
          try {
          await this.pontosAvulsosService.cancelarAtividadeComComentario(
            actionId,
              executorEmail,
            deliveryId,
            item.delivery_title || item.title || item.action_title || '',
            item.created_at || new Date().toISOString(),
            item.integration_id || deliveryId
          );
          } catch (cancelError: any) {
            // Status 204 é sucesso - a operação foi concluída
            if (cancelError?.status === 204 || cancelError?.response?.status === 204) {
              console.log(`✅ Item ${i + 1} cancelado (status 204 - No Content)`);
            } else {
              throw cancelError; // Re-lançar se não for 204
            }
          }

          // Adicionar comentário de cancelamento (não crítico se falhar)
          if (item.id) {
            try {
            await this.adicionarComentario(item.id, motivo, 'CANCEL');
            } catch (commentError: any) {
              // Comentário não é crítico - log mas não falha a operação
              if (commentError?.status === 204 || commentError?.response?.status === 204) {
                console.log(`✅ Comentário adicionado (status 204)`);
              } else {
                console.warn(`⚠️ Comentário não pôde ser adicionado para item ${i + 1}:`, commentError);
              }
            }
          }

          sucessos++;
          console.log(`✅ Item ${i + 1}/${itens.length} cancelado com sucesso!`);

          // Pequeno delay entre requisições
          if (i < itens.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error: any) {
          // Verificar se é status 204 (sucesso)
          const is204 = error?.status === 204 || error?.response?.status === 204;
          if (is204) {
            // Status 204 é sucesso - contar como sucesso
            sucessos++;
            console.log(`✅ Item ${i + 1}/${itens.length} cancelado (status 204 - No Content)`);
          } else {
            falhas++;
            const errorMsg = error?.message || `Erro ao cancelar item ${i + 1}`;
            erros.push(errorMsg);
            console.error(`❌ Erro ao cancelar item ${i + 1}/${itens.length}:`, error);
          }
        }
      }

      // Limpar seleção
      this.itensSelecionadosIds.clear();
      
      // Mensagem de resultado
      if (sucessos > 0) {
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.success(`${sucessos} ${alias}(s) cancelada(s) com sucesso!`);
      }
      if (falhas > 0) {
        this.toastService.error(`${falhas} item(s) falharam ao cancelar. Verifique o console para mais detalhes.`);
        console.error('Erros detalhados:', erros);
      }

      // Limpar filtros de busca local para forçar recarregamento do backend
      const temFiltroData = !!(this.filtrosAtivos?.created_at_start || this.filtrosAtivos?.created_at_end || 
                               this.filtrosAtivos?.finished_at_start || this.filtrosAtivos?.finished_at_end);
      if (this.filtrosAtivos?.busca && !temFiltroData && !this.filtrosAtivos?.executor) {
        this.filtrosAtivos.busca = undefined;
      }

      // Aguardar um pouco para garantir que o backend processou as mudanças
      await new Promise(resolve => setTimeout(resolve, 500));

      // Recarregar listas
      await this.onAbaChange();

    } catch (error: any) {
      console.error('❌ Erro geral ao cancelar itens:', error);
      this.toastService.error('Erro ao processar cancelamentos. Tente novamente.');
    } finally {
      this.isLoadingBlocking = false;
    }
  }

  /**
   * Executa finalização em lote de atividades
   */
  async executarFinalizacaoLote(itens: any[]) {
    if (!this.currentUserEmail) {
      this.toastService.error('Email do usuário não fornecido');
      return;
    }

    // Abrir modal de confirmação
    const modalRef = this.modalService.open(ModalConfirmarFinalizacaoComponent, { size: 'sm' });
    const result = await modalRef.result.catch(() => false);

    if (!result || !result.confirmado) {
      return; // Usuário cancelou o modal
    }

    console.log(`✅ Finalizando ${itens.length} item(s) em lote`);

    try {
      this.isLoadingBlocking = true;
      let sucessos = 0;
      let falhas = 0;
      const erros: string[] = [];
      const comentario = result.comentario?.trim() || 'Atividade enviada para aprovação';

      // Processar cada item selecionado
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        try {
          // Obter action_id do item
          const actionId = await this.getActionIdForItem(item);
          if (!actionId) {
            falhas++;
            erros.push(`Item ${i + 1}: Action ID não encontrado`);
            continue;
          }

          // Obter delivery_id
          const deliveryId = item.delivery_id || item.integration_id || item.id;
          if (!deliveryId) {
            falhas++;
            erros.push(`Item ${i + 1}: Delivery ID não encontrado`);
            continue;
          }

          // Usar o email do executor da atividade (não o do usuário logado)
          const executorEmail = item.user_email;
          if (!executorEmail) {
            falhas++;
            erros.push(`Item ${i + 1}: Email do executor não encontrado`);
            continue;
          }

          // Verificar se a atividade já está finalizada
          if (item.status === 'DONE') {
            console.log(`⚠️ Item ${i + 1} já está finalizado`);
            sucessos++; // Contar como sucesso, pois já está no estado desejado
            continue;
          }

          // Usar a data atual como data de finalização
          const finishedAt = new Date().toISOString();

          let itemFinalizado = false;

          // Finalizar atividade
          try {
            await this.pontosAvulsosService.finalizarAtividade(
              actionId,
              executorEmail,
              finishedAt,
              deliveryId,
              item.delivery_title || item.title || item.action_title || '',
              item.created_at || new Date().toISOString(),
              item.integration_id || deliveryId
            );
            itemFinalizado = true;
          } catch (error: any) {
            // Verificar se é status 204 (No Content) - isso é sucesso, não erro
            if (error?.status === 204 || error?.response?.status === 204) {
              console.log(`✅ Item ${i + 1} finalizado (status 204 - No Content)`);
              itemFinalizado = true;
            } else {
              throw error; // Re-lançar se não for 204
            }
          }

          // Se a finalização foi bem-sucedida, tentar adicionar comentário
          if (itemFinalizado) {
            // Adicionar comentário de finalização (não crítico se falhar)
            if (item.id) {
              try {
                await this.adicionarComentario(item.id, comentario, 'FINISH');
              } catch (commentError: any) {
                // Comentário não é crítico - log mas não falha a operação
                if (commentError?.status === 204 || commentError?.response?.status === 204) {
                  console.log(`✅ Comentário adicionado (status 204)`);
                } else {
                  console.warn(`⚠️ Comentário não pôde ser adicionado para item ${i + 1}:`, commentError);
                  // Não incrementa falhas, pois a finalização já foi bem-sucedida
                }
              }
            }

            sucessos++;
            console.log(`✅ Item ${i + 1}/${itens.length} finalizado com sucesso!`);
          }

          // Pequeno delay entre requisições
          if (i < itens.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error: any) {
          falhas++;
          // Verificar novamente se é 204 (pode ser que o catch capture mesmo assim)
          const is204 = error?.status === 204 || error?.response?.status === 204;
          if (is204) {
            // Status 204 é sucesso, tratar como sucesso
            sucessos++;
            console.log(`✅ Item ${i + 1}/${itens.length} finalizado (status 204 - No Content)`);
          } else {
            const errorMsg = error?.message || `Erro ao finalizar item ${i + 1}`;
            erros.push(errorMsg);
            console.error(`❌ Erro ao finalizar item ${i + 1}/${itens.length}:`, error);
          }
        }
      }

      // Limpar seleção
      this.itensSelecionadosIds.clear();
      
      // Mensagem de resultado
      if (sucessos > 0) {
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.success(`${sucessos} ${alias}(s) finalizada(s) com sucesso! Status alterado para "Aguardando Aprovação".`);
      }
      if (falhas > 0) {
        this.toastService.error(`${falhas} item(s) falharam ao finalizar. Verifique o console para mais detalhes.`);
        console.error('Erros detalhados:', erros);
      }

      // Limpar filtros de busca para garantir que as tarefas apareçam
      if (this.filtrosAtivos?.busca) {
        this.filtrosAtivos.busca = undefined;
      }

      // Recarregar listas para refletir as mudanças
      // Se estava na aba de pendentes, pode trocar para finalizados para ver as tarefas finalizadas
      if (this.aba === 'pendentes' && sucessos > 0) {
        console.log('🔄 Tarefas finalizadas - pode verificar na aba "Finalizados"');
      }
      
      await this.onAbaChange();
      
      // Aguardar um pouco para garantir que os dados foram carregados
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.error('❌ Erro geral ao finalizar itens:', error);
      this.toastService.error('Erro ao processar finalizações. Tente novamente.');
    } finally {
      this.isLoadingBlocking = false;
    }
  }

  async executarRestauracaoLote(itens: any[]) {
    console.log(`🔄 Restaurando ${itens.length} item(s) em lote`);
    console.log('📋 Itens a restaurar:', itens.map((item, idx) => ({
      index: idx + 1,
      id: item.id,
      dismissed: item.dismissed,
      status: item.status,
      action_id: item.action_id,
      delivery_id: item.delivery_id,
      user_email: item.user_email
    })));

    try {
      this.isLoadingBlocking = true;
      let sucessos = 0;
      let falhas = 0;
      const erros: string[] = [];

      // Processar cada item selecionado
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        console.log(`\n📦 Processando item ${i + 1}/${itens.length}:`, {
          id: item.id,
          dismissed: item.dismissed,
          status: item.status,
          action_title: item.action_title
        });
        
        try {
          // Obter action_id do item
          console.log(`🔍 Buscando action_id para item ${i + 1}...`);
          const actionId = await this.getActionIdForItem(item);
          if (!actionId) {
            console.error(`❌ Item ${i + 1}: Action ID não encontrado`);
            falhas++;
            erros.push(`Item ${i + 1}: Action ID não encontrado`);
            continue;
          }
          console.log(`✅ Action ID encontrado: ${actionId}`);

          // Obter delivery_id
          const deliveryId = item.delivery_id || item.integration_id || item.id;
          if (!deliveryId) {
            console.error(`❌ Item ${i + 1}: Delivery ID não encontrado`);
            falhas++;
            erros.push(`Item ${i + 1}: Delivery ID não encontrado`);
            continue;
          }
          console.log(`✅ Delivery ID: ${deliveryId}`);

          // Usar o email do executor da atividade (não o do usuário logado)
          const executorEmail = item.user_email;
          if (!executorEmail) {
            console.error(`❌ Item ${i + 1}: Email do executor não encontrado`);
            falhas++;
            erros.push(`Item ${i + 1}: Email do executor não encontrado`);
            continue;
          }
          console.log(`✅ Executor email: ${executorEmail}`);

          // Verificar se a atividade está cancelada
          // Pode ter dismissed: true OU estar na aba de canceladas (sempre está cancelada)
          const estaCancelada = item.dismissed === true || 
                                item.status === 'CANCELLED' ||
                                this.aba === 'cancelados'; // Se está na aba cancelados, está cancelada
          
          console.log(`🔍 Verificação de cancelamento:`, {
            dismissed: item.dismissed,
            status: item.status,
            aba: this.aba,
            estaCancelada
          });
          
          if (!estaCancelada) {
            console.log(`⚠️ Item ${i + 1} não está cancelado - pulando (dismissed: ${item.dismissed}, status: ${item.status})`);
            // Mesmo assim, tentar restaurar - pode ser que apenas precise mudar dismissed para false
            // Não pular, continuar com a restauração
          }

          // Criar payload para restaurar atividade (remover dismissed: true)
          // Usar os dados originais da atividade, mas com dismissed: false
          const payload: any = {
            status: 'PENDING', // Sempre restaurar como PENDING
            user_email: executorEmail,
            action_id: actionId,
            delivery_id: deliveryId,
            delivery_title: item.delivery_title || item.title || item.action_title || '',
            created_at: item.created_at || new Date().toISOString(), // Usar created_at original
            integration_id: item.integration_id || deliveryId,
            dismissed: false, // Remover cancelamento
            comments: [], // Array vazio - comentários serão adicionados via endpoint separado
            approved: false, // Ao restaurar, não está aprovada
            approved_by: null // Ninguém aprovou ainda
          };

          // Não incluir finished_at ao restaurar - atividade volta para pendente
          
          console.log('🔄 Preparando payload para restaurar atividade:', payload);
          console.log('📤 Fazendo POST para /game/action/process...');

          // Fazer POST para restaurar
          try {
            const response = await this.pontosAvulsosService.processAction(payload);
            console.log('✅ Resposta da API:', response);
          } catch (apiError: any) {
            console.error('❌ Erro na chamada da API:', apiError);
            throw apiError; // Re-lançar para ser capturado no catch externo
          }

          // Adicionar comentário de restauração (não crítico se falhar)
          if (item.id) {
            try {
              await this.adicionarComentario(
                item.id,
                'Atividade restaurada',
                'APPROVE' // Usar tipo APPROVE para restauração
              );
            } catch (commentError: any) {
              // Comentário não é crítico - log mas não falha a operação
              console.warn(`⚠️ Comentário não pôde ser adicionado para item ${i + 1}:`, commentError);
            }
          }

          sucessos++;
          console.log(`✅ Item ${i + 1}/${itens.length} restaurado com sucesso!`);

          // Pequeno delay entre requisições
          if (i < itens.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error: any) {
          falhas++;
          const errorMsg = error?.message || `Erro ao restaurar item ${i + 1}`;
          erros.push(errorMsg);
          console.error(`❌ Erro ao restaurar item ${i + 1}/${itens.length}:`, error);
        }
      }

      // Limpar seleção
      this.itensSelecionadosIds.clear();
      
      // Mensagem de resultado
      if (sucessos > 0) {
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.success(`${sucessos} ${alias}(s) restaurada(s) com sucesso! Status alterado para "Pendente".`);
      }
      if (falhas > 0) {
        this.toastService.error(`${falhas} item(s) falharam ao restaurar. Verifique o console para mais detalhes.`);
        console.error('Erros detalhados:', erros);
      }

      // Recarregar listas para refletir as mudanças
      await this.onAbaChange();

    } catch (error: any) {
      console.error('❌ Erro geral ao restaurar itens:', error);
      this.toastService.error('Erro ao processar restaurações. Tente novamente.');
    } finally {
      this.isLoadingBlocking = false;
    }
  }

  async executarAprovacaoLote(itens: any[]) {
    if (!this.currentUserEmail) {
      this.toastService.error('Email do usuário não fornecido');
      return;
    }

    // Abrir modal de confirmação
    const modalRef = this.modalService.open(ModalConfirmarAprovacaoComponent, { size: 'sm' });
    const result = await modalRef.result.catch(() => null);

    if (!result || !result.aprovado) {
      return; // Usuário cancelou o modal
    }

    console.log(`👍 Aprovando ${itens.length} item(s) em lote`);

    try {
      this.isLoadingBlocking = true;
      let sucessos = 0;
      let falhas = 0;
      const erros: string[] = [];
      const comentario = result.comentario?.trim() || 'Atividade aprovada com sucesso';

      // Processar cada item selecionado
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        try {
          // Obter action_id do item
          const actionId = await this.getActionIdForItem(item);
          if (!actionId) {
            falhas++;
            erros.push(`Item ${i + 1}: Action ID não encontrado`);
            continue;
          }

          // Obter delivery_id
          const deliveryId = item.delivery_id || item.integration_id || item.id;
          if (!deliveryId) {
            falhas++;
            erros.push(`Item ${i + 1}: Delivery ID não encontrado`);
            continue;
          }

          // Usar o email do executor da atividade (não o do usuário logado)
          const executorEmail = item.user_email;
          if (!executorEmail) {
            falhas++;
            erros.push(`Item ${i + 1}: Email do executor não encontrado`);
            continue;
          }

          // Verificar se a atividade já está aprovada
          if (item.status === 'DONE' && item.approved === true) {
            console.log(`⚠️ Item ${i + 1} já está aprovado`);
            sucessos++; // Contar como sucesso, pois já está no estado desejado
            continue;
          }

          // Usar a data atual como data de finalização
          const finishedAt = new Date().toISOString();

          let itemAprovado = false;

          // Aprovar atividade
          try {
            await this.pontosAvulsosService.aprovarAtividade(
              actionId,
              executorEmail,
              finishedAt,
              deliveryId,
              item.delivery_title || item.title || item.action_title || '',
              item.created_at || new Date().toISOString(),
              item.integration_id || deliveryId
            );
            itemAprovado = true;
          } catch (error: any) {
            // Verificar se é status 204 (No Content) - isso é sucesso, não erro
            if (error?.status === 204 || error?.response?.status === 204) {
              console.log(`✅ Item ${i + 1} aprovado (status 204 - No Content)`);
              itemAprovado = true;
            } else {
              throw error; // Re-lançar se não for 204
            }
          }

          // Se a aprovação foi bem-sucedida, tentar adicionar comentário
          if (itemAprovado) {
            // Adicionar comentário de aprovação (não crítico se falhar)
            if (item.id) {
              try {
                await this.adicionarComentario(item.id, comentario, 'APPROVE');
              } catch (commentError: any) {
                // Comentário não é crítico - log mas não falha a operação
                if (commentError?.status === 204 || commentError?.response?.status === 204) {
                  console.log(`✅ Comentário adicionado (status 204)`);
                } else {
                  console.warn(`⚠️ Comentário não pôde ser adicionado para item ${i + 1}:`, commentError);
                  // Não incrementa falhas, pois a aprovação já foi bem-sucedida
                }
              }
            }

            sucessos++;
            console.log(`✅ Item ${i + 1}/${itens.length} aprovado com sucesso!`);
          }

          // Pequeno delay entre requisições
          if (i < itens.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error: any) {
          falhas++;
          // Verificar novamente se é 204 (pode ser que o catch capture mesmo assim)
          const is204 = error?.status === 204 || error?.response?.status === 204;
          if (is204) {
            // Status 204 é sucesso, tratar como sucesso
            sucessos++;
            console.log(`✅ Item ${i + 1}/${itens.length} aprovado (status 204 - No Content)`);
          } else {
            const errorMsg = error?.message || `Erro ao aprovar item ${i + 1}`;
            erros.push(errorMsg);
            console.error(`❌ Erro ao aprovar item ${i + 1}/${itens.length}:`, error);
          }
        }
      }

      // Limpar seleção
      this.itensSelecionadosIds.clear();
      
      // Mensagem de resultado
      if (sucessos > 0) {
        const alias = this.aliases?.actionAlias || 'atividade';
        this.toastService.success(`${sucessos} ${alias}(s) aprovada(s) com sucesso!`);
      }
      if (falhas > 0) {
        this.toastService.error(`${falhas} item(s) falharam ao aprovar. Verifique o console para mais detalhes.`);
        console.error('Erros detalhados:', erros);
      }

      // Limpar filtros de busca para garantir que as tarefas apareçam
      if (this.filtrosAtivos?.busca) {
        this.filtrosAtivos.busca = undefined;
      }

      // Recarregar listas para refletir as mudanças
      await this.recarregarListasAtualizadas();
      await this.onAbaChange();
      
      // Aguardar um pouco para garantir que os dados foram carregados
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.error('❌ Erro geral ao aprovar itens:', error);
      this.toastService.error('Erro ao processar aprovações. Tente novamente.');
    } finally {
      this.isLoadingBlocking = false;
    }
  }

  // ========== Métodos para seleção e ações em lote no detalhe de processo ==========

  /**
   * Verifica se uma tarefa está selecionada no detalhe de processo
   */
  isTarefaSelecionadaDetalhe(tarefa: any): boolean {
    const id = this.getTarefaIdDetalhe(tarefa);
    return this.tarefasSelecionadasDetalhe.has(id);
  }

  /**
   * Obtém o ID único de uma tarefa no contexto do detalhe de processo
   * IMPORTANTE: Sempre usar 'id' como identificador principal, pois é único para cada tarefa
   * O integration_id pode ser compartilhado entre tarefas da mesma delivery
   */
  getTarefaIdDetalhe(tarefa: any): string | number {
    // SEMPRE priorizar 'id' - é o identificador único de cada tarefa
    if (tarefa.id) {
      return tarefa.id;
    }
    
    // Se não tiver id, criar um ID composto único usando vários campos
    // Isso garante que mesmo tarefas com o mesmo integration_id tenham IDs diferentes
    const parts: string[] = [];
    
    if (tarefa.integration_id) {
      parts.push(tarefa.integration_id);
    }
    if (tarefa.user_email) {
      parts.push(tarefa.user_email);
    }
    if (tarefa.action_title) {
      parts.push(tarefa.action_title);
    }
    if (tarefa.created_at) {
      // Usar timestamp para diferenciar tarefas criadas em momentos diferentes
      const timestamp = new Date(tarefa.created_at).getTime();
      parts.push(timestamp.toString());
    } else {
      // Se não tiver created_at, usar um hash baseado nos outros campos
      const hash = parts.join('_').split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
      }, 0);
      parts.push(Math.abs(hash).toString());
    }
    
    if (parts.length > 0) {
      return parts.join('_');
    }
    
    // Se nada funcionar, gerar um ID único baseado em timestamp e random
    console.warn('⚠️ Tarefa sem identificadores válidos, usando fallback:', tarefa);
    return `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Toggle de seleção de uma tarefa no detalhe de processo
   */
  toggleSelecionarTarefaDetalhe(tarefa: any, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    const id = this.getTarefaIdDetalhe(tarefa);
    
    // Garantir que temos um ID válido
    if (!id) {
      console.warn('⚠️ Tarefa sem ID válido:', tarefa);
      return;
    }
    
    // Debug: verificar se há outras tarefas com o mesmo ID
    const todasTarefas = this.deliverySelecionada?.user_action || [];
    const tarefasComMesmoId = todasTarefas.filter((t: any) => this.getTarefaIdDetalhe(t) === id);
    if (tarefasComMesmoId.length > 1) {
      console.warn('⚠️ Múltiplas tarefas com o mesmo ID:', {
        id,
        quantidade: tarefasComMesmoId.length,
        tarefas: tarefasComMesmoId.map((t: any) => ({
          id: t.id,
          integration_id: t.integration_id,
          action_title: t.action_title,
          user_email: t.user_email
        }))
      });
    }
    
    console.log('🔄 Toggle tarefa:', {
      id,
      tarefaId: tarefa.id,
      integrationId: tarefa.integration_id,
      actionTitle: tarefa.action_title,
      estavaSelecionada: this.tarefasSelecionadasDetalhe.has(id),
      totalSelecionadas: this.tarefasSelecionadasDetalhe.size
    });
    
    if (this.tarefasSelecionadasDetalhe.has(id)) {
      this.tarefasSelecionadasDetalhe.delete(id);
      console.log('✅ Tarefa desmarcada:', id);
    } else {
      this.tarefasSelecionadasDetalhe.add(id);
      console.log('✅ Tarefa marcada:', id);
    }
    
    console.log('📊 Total selecionadas após toggle:', this.tarefasSelecionadasDetalhe.size);
  }

  /**
   * Seleciona/desseleciona todas as tarefas no detalhe de processo
   */
  toggleSelecionarTodasTarefasDetalhe(event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    if (!this.deliverySelecionada?.user_action || this.deliverySelecionada.user_action.length === 0) {
      return;
    }

    const todasSelecionadas = this.tarefasSelecionadasDetalhe.size === this.deliverySelecionada.user_action.length;
    
    if (todasSelecionadas) {
      // Desselecionar todas
      this.deliverySelecionada.user_action.forEach((tarefa: any) => {
        const id = this.getTarefaIdDetalhe(tarefa);
        this.tarefasSelecionadasDetalhe.delete(id);
      });
    } else {
      // Selecionar todas
      this.deliverySelecionada.user_action.forEach((tarefa: any) => {
        const id = this.getTarefaIdDetalhe(tarefa);
        this.tarefasSelecionadasDetalhe.add(id);
      });
    }
  }

  /**
   * Retorna a lista de tarefas selecionadas no detalhe de processo
   */
  getTarefasSelecionadasDetalhe(): any[] {
    if (!this.deliverySelecionada?.user_action) {
      return [];
    }

    return this.deliverySelecionada.user_action.filter((tarefa: any) => 
      this.isTarefaSelecionadaDetalhe(tarefa)
    );
  }

  /**
   * Aprova tarefas selecionadas no detalhe de processo
   */
  async aprovarTarefasDetalheLote() {
    const tarefasSelecionadas = this.getTarefasSelecionadasDetalhe();
    
    if (tarefasSelecionadas.length === 0) {
      this.toastService.error('Selecione pelo menos uma tarefa para aprovar');
      return;
    }

    // Filtrar apenas tarefas que podem ser aprovadas (status DONE e não aprovadas)
    const tarefasAprovaveis = tarefasSelecionadas.filter((tarefa: any) => 
      tarefa.status === 'DONE' && tarefa.approved !== true
    );

    if (tarefasAprovaveis.length === 0) {
      this.toastService.error('Nenhuma tarefa selecionada pode ser aprovada. Apenas tarefas com status "Aguardando Aprovação" podem ser aprovadas.');
      return;
    }

    // Usar o método de aprovação em lote existente
    await this.executarAprovacaoLote(tarefasAprovaveis);
    
    // Limpar seleção e recarregar detalhe do processo
    this.tarefasSelecionadasDetalhe.clear();
    await this.recarregarDetalheProcesso();
  }

  /**
   * Cancela tarefas selecionadas no detalhe de processo
   */
  async cancelarTarefasDetalheLote() {
    const tarefasSelecionadas = this.getTarefasSelecionadasDetalhe();
    
    if (tarefasSelecionadas.length === 0) {
      this.toastService.error('Selecione pelo menos uma tarefa para cancelar');
      return;
    }

    // Filtrar apenas tarefas que podem ser canceladas (não já canceladas)
    const tarefasCancelaveis = tarefasSelecionadas.filter((tarefa: any) => 
      tarefa.dismissed !== true
    );

    if (tarefasCancelaveis.length === 0) {
      this.toastService.error('Nenhuma tarefa selecionada pode ser cancelada. Todas as tarefas selecionadas já estão canceladas.');
      return;
    }

    // Usar o método de cancelamento em lote existente
    await this.executarCancelamentoLote(tarefasCancelaveis);
    
    // Limpar seleção e recarregar detalhe do processo
    this.tarefasSelecionadasDetalhe.clear();
    await this.recarregarDetalheProcesso();
  }

  /**
   * Recarrega o detalhe do processo após uma ação em lote
   */
  private async recarregarDetalheProcesso() {
    if (!this.deliverySelecionada?.id) {
      return;
    }

    try {
      // Recarregar a lista de processos para obter dados atualizados
      await this.recarregarListasProcessos();
      
      // Buscar a delivery atualizada
      const deliveryAtualizada = await this.buscarDeliveryAtualizada(this.deliverySelecionada.id);
      
      if (deliveryAtualizada) {
        // Atualizar a delivery selecionada com os dados atualizados
        this.deliverySelecionada = deliveryAtualizada;
      }
    } catch (error) {
      console.error('❌ Erro ao recarregar detalhe do processo:', error);
    }
  }

  /**
   * Verifica se há tarefas selecionadas no detalhe de processo
   */
  temTarefasSelecionadasDetalhe(): boolean {
    return this.tarefasSelecionadasDetalhe.size > 0;
  }

  /**
   * Verifica se pode aprovar tarefas selecionadas (pelo menos uma com status DONE e não aprovada)
   */
  podeAprovarTarefasDetalhe(): boolean {
    if (!this.temTarefasSelecionadasDetalhe()) {
      return false;
    }

    const tarefasSelecionadas = this.getTarefasSelecionadasDetalhe();
    return tarefasSelecionadas.some((tarefa: any) => 
      tarefa.status === 'DONE' && tarefa.approved !== true
    );
  }

  /**
   * Verifica se pode cancelar tarefas selecionadas (pelo menos uma não cancelada)
   */
  podeCancelarTarefasDetalhe(): boolean {
    if (!this.temTarefasSelecionadasDetalhe()) {
      return false;
    }

    const tarefasSelecionadas = this.getTarefasSelecionadasDetalhe();
    return tarefasSelecionadas.some((tarefa: any) => tarefa.dismissed !== true);
  }

  /**
   * TrackBy function para o *ngFor das tarefas no detalhe de processo
   * Garante que cada checkbox seja renderizado corretamente
   */
  trackByTarefaId(index: number, tarefa: any): string | number {
    if (!tarefa) {
      return index;
    }
    const id = this.getTarefaIdDetalhe(tarefa);
    // Se não conseguir obter um ID válido, usar o índice como fallback
    return id || `index_${index}`;
  }

  // ========== Métodos para filtragem de processos ==========

  /**
   * Aplica filtros locais nas listas de processos (busca por título)
   */
  aplicarFiltrosLocaisProcessos() {
    const busca = this.filtrosProcessos?.busca?.trim().toLowerCase() || '';
    
    if (!busca) {
      // Sem busca, restaurar listas originais
      this.processosPendentes = this.processosPendentesOriginais.length > 0 
        ? [...this.processosPendentesOriginais] 
        : [];
      this.processosIncompletos = this.processosIncompletosOriginais.length > 0 
        ? [...this.processosIncompletosOriginais] 
        : [];
      this.processosEntregues = this.processosEntreguesOriginais.length > 0 
        ? [...this.processosEntreguesOriginais] 
        : [];
      this.processosCancelados = this.processosCanceladosOriginais.length > 0 
        ? [...this.processosCanceladosOriginais] 
        : [];
      return;
    }
    
    // Filtrar cada lista pelo título (apenas se houver dados originais)
    if (this.processosPendentesOriginais.length > 0) {
      this.processosPendentes = this.processosPendentesOriginais.filter(processo => 
        this.matchBuscaProcesso(processo, busca)
      );
    }
    
    if (this.processosIncompletosOriginais.length > 0) {
      this.processosIncompletos = this.processosIncompletosOriginais.filter(processo => 
        this.matchBuscaProcesso(processo, busca)
      );
    }
    
    if (this.processosEntreguesOriginais.length > 0) {
      this.processosEntregues = this.processosEntreguesOriginais.filter(processo => 
        this.matchBuscaProcesso(processo, busca)
      );
    }
    
    if (this.processosCanceladosOriginais.length > 0) {
      this.processosCancelados = this.processosCanceladosOriginais.filter(processo => 
        this.matchBuscaProcesso(processo, busca)
      );
    }
  }

  /**
   * Verifica se um processo corresponde à busca (título ou ID)
   */
  private matchBuscaProcesso(processo: any, busca: string): boolean {
    if (!busca) return true;
    
    // Buscar no título
    const titulo = (processo.title || processo.name || '').toLowerCase();
    if (titulo.includes(busca)) return true;
    
    // Buscar no ID
    const id = (processo.id || '').toString().toLowerCase();
    if (id.includes(busca)) return true;
    
    return false;
  }

  /**
   * Método chamado quando os filtros de processos são alterados
   */
  async onFiltrosProcessosChange(filtros: any) {
    console.log('🔍 Filtros de processos alterados:', filtros);
    
    // Normalizar busca: se for string vazia, tratar como undefined
    const buscaNormalizada = filtros?.busca?.trim() || undefined;
    
    // Atualizar filtros ativos
    this.filtrosProcessos = {
      ...filtros,
      busca: buscaNormalizada
    };
    
    // Aplicar filtros locais (busca por texto)
    this.aplicarFiltrosLocaisProcessos();
  }

  /**
   * Método chamado quando limpar filtros de processos é solicitado
   */
  async onLimparFiltrosProcessos() {
    console.log('🧹 Limpando filtros de processos');
    this.filtrosProcessos = {};
    
    // Restaurar listas originais
    this.processosPendentes = [...this.processosPendentesOriginais];
    this.processosIncompletos = [...this.processosIncompletosOriginais];
    this.processosEntregues = [...this.processosEntreguesOriginais];
    this.processosCancelados = [...this.processosCanceladosOriginais];
  }

  /**
   * Pré-seleciona o jogador atual no formulário
   */
  private preSelecionarJogadorAtual(): void {
    if (!this.userId || this.jogadores.length === 0) {
      return;
    }
    
    // Encontrar o jogador atual na lista
    const jogadorAtual = this.jogadores.find(j => 
      j.email === this.userId || 
      (j.id || j._id || j.email) === this.userId
    );
    
    if (jogadorAtual) {
      const jogadorId = this.getJogadorId(jogadorAtual);
      this.formAtribuir.patchValue({
        jogador: jogadorId
      });
      console.log('👤 Jogador atual pré-selecionado:', jogadorId, jogadorAtual);
    } else if (this.userId.includes('@')) {
      // Se não encontrou na lista mas é um email, tentar usar o email diretamente
      this.formAtribuir.patchValue({
        jogador: this.userId
      });
      console.log('👤 Jogador atual pré-selecionado (email):', this.userId);
    }
  }
  
  /**
   * Verifica se deve mostrar o select de executores
   * Mostra quando há contexto de time OU quando jogador tem time associado
   */
  get deveMostrarSelectExecutores(): boolean {
    return this.isTeamContext || (this.isPlayer && this.playerTeamId !== null);
  }
  
  /**
   * Obtém o ID do jogador para comparação
   */
  getJogadorId(jogador: any): string {
    return jogador.id || jogador._id || jogador.email || '';
  }
  
  /**
   * Obtém o nome do jogador para exibição
   */
  getJogadorNome(jogador: any): string {
    return jogador.name || jogador.full_name || jogador.email || 'N/A';
  }
} 