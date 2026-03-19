import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';

import { PontosAvulsosService, ActionTemplate, AtividadeDetalhe } from '../../services/pontos-avulsos.service';
import { AliasService } from '@services/alias.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ModalStateService, ModalState } from './services/modal-state.service';
import { ModalActionsService } from './services/modal-actions.service';
import { AbaType } from './components/aba-navegacao/aba-navegacao.component';
import { CorDetalhe } from './components/detalhe-atividade/detalhe-atividade.component';
import { CorDetalheDelivery } from './components/detalhe-delivery/detalhe-delivery.component';

export interface ModalData {
  title: string;
  typeSelected: number;
  tabSelected: number;
  types: Array<any>
}

@Component({
  selector: 'modal-gerenciar-pontos-avulsos-refatorado',
  templateUrl: './modal-gerenciar-pontos-avulsos-refatorado.component.html',
  styleUrls: ['./modal-gerenciar-pontos-avulsos-refatorado.component.scss']
})
export class ModalGerenciarPontosAvulsosRefatoradoComponent implements OnInit {
  @Input() timeId?: number;
  @Input() userId?: string;
  @Input() userName?: string;
  @Input() isTeamContext: boolean = true;
  @Input() currentUserEmail?: string;
  @Input() initialTab?: AbaType;
  @Input() initialType?: number;
  @Input() data: ModalData | undefined;

  // Observables do estado
  state$: Observable<ModalState>;

  // Dados carregados
  atividades: ActionTemplate[] = [];
  jogadores: any[] = [];
  aliases: any;

  // Estados de loading
  loadingAtividades = false;
  loadingJogadores = false;
  processandoAtribuicao = false;

  // Dados das listas
  atividadesPendentes: AtividadeDetalhe[] = [];
  atividadesFinalizadas: AtividadeDetalhe[] = [];
  atividadesAprovadas: AtividadeDetalhe[] = [];
  atividadesCanceladas: AtividadeDetalhe[] = [];
  processosPendentes: any[] = [];
  processosIncompletos: any[] = [];
  processosEntregues: any[] = [];
  processosCancelados: any[] = [];

  // Estados de loading das listas
  loadingAtividadesPendentes = false;
  loadingAtividadesFinalizadas = false;
  loadingAtividadesAprovadas = false;
  loadingAtividadesCanceladas = false;
  loadingProcessosPendentes = false;
  loadingProcessosIncompletos = false;
  loadingProcessosEntregues = false;
  loadingProcessosCancelados = false;

  constructor(
    public activeModal: NgbActiveModal,
    private pontosAvulsosService: PontosAvulsosService,
    private aliasService: AliasService,
    private sessao: SessaoProvider,
    private modalStateService: ModalStateService,
    private modalActionsService: ModalActionsService
  ) {
    this.state$ = this.modalStateService.state$;
  }

  async ngOnInit() {
    await Promise.all([
      this.carregarDadosIniciais(),
      this.loadAliases()
    ]);

    this.configurarEstadoInicial();
  }

  private async carregarDadosIniciais() {
    await Promise.all([
      this.carregarAtividades(),
      this.carregarJogadores()
    ]);
  }

  private configurarEstadoInicial() {
    if (this.initialType !== undefined) {
      this.modalStateService.setSelectedType(this.initialType);
    }

    if (this.initialTab) {
      this.modalStateService.setCurrentAba(this.initialTab);
    } else {
      // Default to 'processos-pendentes' if no initialTab is provided
      this.modalStateService.setCurrentAba(this.getAbaInicialPorTipo(this.modalStateService.currentState.selectedType));
    }

    // Load data for the initial tab
    this.carregarDadosAbaAtual();

    // If not in team context, pre-select the current user
    if (!this.isTeamContext && this.userId) {
      // This logic will need to be passed down to the FormularioAtribuicaoComponent
      // For now, it's a placeholder for how the main component would interact
      // with the form component to set initial values.
      // The FormularioAtribuicaoComponent itself will handle its form's patchValue.
    }

    // Ensure currentUserEmail is set for actions
    if (!this.currentUserEmail) {
            this.currentUserEmail = this.userId || 'usuario@exemplo.com';
    }
  }

  async carregarAtividades() {
    this.loadingAtividades = true;
    try {
      this.atividades = await this.pontosAvulsosService.getActionTemplates();
    } catch (error) {
          } finally {
      this.loadingAtividades = false;
    }
  }

  async carregarJogadores() {
    this.loadingJogadores = true;
    try {
      if (this.isTeamContext) {
        if (!this.timeId) {
                    return;
        }
        const todosJogadores = await this.pontosAvulsosService.getUsers(this.timeId);
        
        // Filtrar apenas usuários ativos (deactivated_at deve ser null)       
        this.jogadores = todosJogadores.filter((jogador: any) => {
          return jogador.deactivated_at === null || jogador.deactivated_at === undefined;
        });
        
              } else {
        if (!this.userId || !this.userName) {
                    return;
        }
        this.jogadores = [{
          id: this.userId,
          email: this.userId,
          name: this.userName,
          full_name: this.userName
        }];
              }
    } catch (error) {
          } finally {
      this.loadingJogadores = false;
    }
  }

  onTypeChange(typeIndex: number) {
        const currentState = this.modalStateService.currentState;

    // Fechar detalhes se estiverem abertos
    if (currentState.mostrarDetalhe) {
      this.modalStateService.fecharDetalheAtividade();
    }
    if (currentState.mostrarDetalheDelivery) {
      this.modalStateService.fecharDetalheDelivery();
    }

    this.modalStateService.setSelectedType(typeIndex);
    const newAba = this.getAbaInicialPorTipo(typeIndex);
    this.modalStateService.setCurrentAba(newAba);

    // Limpar estado de retorno se o usuário navegar manualmente
    this.modalStateService.limparRetornoDelivery();

    // Carregar dados da nova aba
    this.carregarDadosAbaAtual();
  }

  onAbaChange(aba: AbaType) {
        const currentState = this.modalStateService.currentState;

    // Fechar detalhes se estiverem abertos
    if (currentState.mostrarDetalhe) {
      this.modalStateService.fecharDetalheAtividade();
    }
    if (currentState.mostrarDetalheDelivery) {
      this.modalStateService.fecharDetalheDelivery();
    }

    this.modalStateService.setCurrentAba(aba);

    // Limpar estado de retorno se o usuário navegar manualmente
    this.modalStateService.limparRetornoDelivery();

    // Carregar dados da nova aba (exceto para "atribuir" que não precisa carregar dados)
    if (aba !== 'atribuir') {
      this.carregarDadosAbaAtual();
    } else {
            // The form component itself will handle its reset logic
    }
  }

  async onFormSubmit(formData: any) {
    this.processandoAtribuicao = true;
    try {
      await this.modalActionsService.atribuirAtividade(
        formData,
        this.isTeamContext,
        this.userId,
        this.atividades,
        this.jogadores
      );

            const currentState = this.modalStateService.currentState;
      if (currentState.retornarParaDelivery && currentState.deliveryParaRetornar) {
                const deliveryId = currentState.deliveryParaRetornar.id;

        this.modalStateService.limparRetornoDelivery(); // Limpar estado de retorno

        // Restore previous type and tab
        this.modalStateService.setSelectedType(0); // Always processes for delivery context
        if (currentState.abaAnterior) {
          this.modalStateService.setCurrentAba(currentState.abaAnterior);
        }

        await this.carregarDadosAbaAtual(); // Recarregar dados da aba

        // Recarregar dados da delivery para incluir a nova atividade
        await this.recarregarDadosDelivery(deliveryId);

        // Re-open delivery detail with updated data
        setTimeout(() => {
          this.modalStateService.abrirDetalheDelivery(this.modalStateService.currentState.deliveryParaRetornar, currentState.abaAnterior!);
        }, 100);

      } else {
        // Normal behavior: reset form and reload pending activities
        // The form component will handle its own reset
        await this.carregarAtividadesPendentes();
      }

    } catch (error) {
          } finally {
      this.processandoAtribuicao = false;
    }
  }

  onAtividadeClick(atividade: AtividadeDetalhe) {
    const state = this.modalStateService.currentState;
    this.modalStateService.abrirDetalheAtividade(atividade, state.currentAba);
  }

  onProcessoClick(processo: any) {
    const state = this.modalStateService.currentState;
    this.modalStateService.abrirDetalheDelivery(processo, state.currentAba);
  }

  onCriarTarefa(processo: any) {
    // Salvar estado atual para retorno
    const state = this.modalStateService.currentState;
    this.modalStateService.setRetornoDelivery(processo, state.currentAba);

    // Fechar detalhe da delivery
    this.modalStateService.fecharDetalheDelivery();

    // Trocar para aba "Criar" (tipo 2)
    this.onTypeChange(2);
  }

  // ===== MÉTODOS PARA COMPONENTES DE DETALHE =====

  // Métodos para detalhe de atividade
  onVoltarDetalheAtividade() {
    this.modalStateService.fecharDetalheAtividade();
  }

  async onFinalizarAtividade() {
    const state = this.modalStateService.currentState;
    if (!state.atividadeSelecionada || !this.currentUserEmail) {
            return;
    }

    try {
      await this.modalActionsService.finalizarAtividade(state.atividadeSelecionada, this.currentUserEmail);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheAtividade();
    } catch (error) {
          }
  }

  async onAprovarAtividade() {
    const state = this.modalStateService.currentState;
    if (!state.atividadeSelecionada || !this.currentUserEmail) {
            return;
    }

    try {
      await this.modalActionsService.aprovarAtividade(state.atividadeSelecionada, this.currentUserEmail);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheAtividade();
    } catch (error) {
          }
  }

  async onReprovarAtividade() {
    const state = this.modalStateService.currentState;
    if (!state.atividadeSelecionada || !this.currentUserEmail) {
            return;
    }

    try {
      await this.modalActionsService.reprovarAtividade(state.atividadeSelecionada, this.currentUserEmail);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheAtividade();
    } catch (error) {
          }
  }

  async onCancelarAtividade() {
    const state = this.modalStateService.currentState;
    if (!state.atividadeSelecionada || !this.currentUserEmail) {
            return;
    }

    try {
      await this.modalActionsService.cancelarAtividade(state.atividadeSelecionada, this.currentUserEmail);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheAtividade();
    } catch (error) {
          }
  }

  async onBloquearAtividade() {
    const state = this.modalStateService.currentState;
    if (!state.atividadeSelecionada || !this.currentUserEmail) {
            return;
    }

    try {
      await this.modalActionsService.bloquearAtividade(state.atividadeSelecionada, this.currentUserEmail);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheAtividade();
    } catch (error) {
          }
  }

  /**
   * Método chamado quando o executor da atividade é atualizado
   */
  async onExecutorAtualizado() {
        // Recarregar os dados da aba atual para refletir a mudança
    await this.carregarDadosAbaAtual();
  }

  // Métodos para detalhe de delivery
  onVoltarDetalheDelivery() {
    this.modalStateService.fecharDetalheDelivery();
  }

  async onCancelarDelivery() {
    const state = this.modalStateService.currentState;
    if (!state.deliverySelecionada) {
            return;
    }

    try {
      await this.modalActionsService.cancelarDelivery(state.deliverySelecionada);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheDelivery();
    } catch (error) {
          }
  }

  async onCompletarDelivery() {
    const state = this.modalStateService.currentState;
    if (!state.deliverySelecionada) {
            return;
    }

    try {
      await this.modalActionsService.completarDelivery(state.deliverySelecionada);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheDelivery();
    } catch (error) {
          }
  }

  async onDesfazerDelivery() {
    const state = this.modalStateService.currentState;
    if (!state.deliverySelecionada) {
            return;
    }

    try {
      await this.modalActionsService.desfazerDelivery(state.deliverySelecionada);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheDelivery();
    } catch (error) {
          }
  }

  async onRestaurarDelivery() {
    const state = this.modalStateService.currentState;
    if (!state.deliverySelecionada) {
            return;
    }

    try {
      await this.modalActionsService.restaurarDelivery(state.deliverySelecionada);
            // Recarregar dados da aba atual
      await this.carregarDadosAbaAtual();
      
      // Fechar detalhe
      this.modalStateService.fecharDetalheDelivery();
    } catch (error) {
          }
  }

  // Métodos auxiliares para cores dos detalhes
  getCorDetalheAtividade(): CorDetalhe {
    const state = this.modalStateService.currentState;
    switch (state.abaAnterior) {
      case 'pendentes': return 'vermelho';
      case 'finalizados': return 'verde';
      case 'aprovados': return 'azul';
      case 'cancelados': return 'cinza';
      default: return 'vermelho';
    }
  }

  getCorDetalheDelivery(): CorDetalheDelivery {
    const state = this.modalStateService.currentState;
    switch (state.abaAnterior) {
      case 'processos-pendentes': return 'vermelho';
      case 'incompletos': return 'amarelo';
      case 'entregues': return 'azul';
      case 'processos-cancelados': return 'cinza';
      default: return 'vermelho';
    }
  }

  private getAbaInicialPorTipo(typeIndex: number): AbaType {
    switch (typeIndex) {
      case 0: return 'processos-pendentes';
      case 1: return 'pendentes';
      case 2: return 'atribuir';
      default: return 'processos-pendentes';
    }
  }

  private async carregarDadosAbaAtual() {
    const currentAba = this.modalStateService.currentState.currentAba;
        switch (currentAba) {
      case 'pendentes':
        await this.carregarAtividadesPendentes();
        break;
      case 'processos-pendentes':
        await this.carregarProcessosPendentes();
        break;
      case 'finalizados':
        await this.carregarAtividadesFinalizadas();
        break;
      case 'aprovados':
        await this.carregarAtividadesAprovadas();
        break;
      case 'cancelados':
        await this.carregarAtividadesCanceladas();
        break;
      case 'incompletos':
        await this.carregarProcessosIncompletos();
        break;
      case 'entregues':
        await this.carregarProcessosEntregues();
        break;
      case 'processos-cancelados':
        await this.carregarProcessosCancelados();
        break;
      case 'atribuir':
        // No data loading needed for 'atribuir' tab itself
        break;
    }
  }

  private async recarregarDadosDelivery(deliveryId: string): Promise<void> {
    try {
            await this.carregarDadosAbaAtual(); // Recarregar a lista de processos baseada na aba atual

      let deliveryAtualizada = null;
      const currentAba = this.modalStateService.currentState.currentAba;

      if (currentAba === 'processos-pendentes') {
        deliveryAtualizada = this.processosPendentes.find(d => d.id === deliveryId);
      } else if (currentAba === 'incompletos') {
        deliveryAtualizada = this.processosIncompletos.find(d => d.id === deliveryId);
      } else if (currentAba === 'entregues') {
        deliveryAtualizada = this.processosEntregues.find(d => d.id === deliveryId);
      } else if (currentAba === 'processos-cancelados') {
        deliveryAtualizada = this.processosCancelados.find(d => d.id === deliveryId);
      }

      if (deliveryAtualizada) {
                this.modalStateService.updateState({ deliveryParaRetornar: deliveryAtualizada });
      } else {
              }

    } catch (error) {
          }
  }

  async carregarAtividadesPendentes() {
    this.loadingAtividadesPendentes = true;
    try {
      this.atividadesPendentes = await this.pontosAvulsosService.getAtividadesPendentesModal(
        this.timeId,
        this.userId,
        this.isTeamContext
      );
    } catch (error) {
            this.atividadesPendentes = [];
    } finally {
      this.loadingAtividadesPendentes = false;
    }
  }

  async carregarAtividadesFinalizadas() {
    this.loadingAtividadesFinalizadas = true;
    try {
      this.atividadesFinalizadas = await this.pontosAvulsosService.getAtividadesFinalizadasModal(
        this.timeId || 0,
        this.userId || '',
        this.isTeamContext
      );
      this.atividadesFinalizadas = this.atividadesFinalizadas.filter(atividade =>
        atividade.approved === false || atividade.approved === null
      );
    } catch (error) {
            this.atividadesFinalizadas = [];
    } finally {
      this.loadingAtividadesFinalizadas = false;
    }
  }

  async carregarAtividadesAprovadas() {
    this.loadingAtividadesAprovadas = true;
    try {
      this.atividadesAprovadas = await this.pontosAvulsosService.getAtividadesAprovadasModal(
        this.timeId || 0,
        this.userId || '',
        this.isTeamContext
      );
    } catch (error) {
            this.atividadesAprovadas = [];
    } finally {
      this.loadingAtividadesAprovadas = false;
    }
  }

  async carregarAtividadesCanceladas() {
    this.loadingAtividadesCanceladas = true;
    try {
      this.atividadesCanceladas = await this.pontosAvulsosService.getAtividadesCanceladasModal(
        this.timeId,
        this.userId,
        this.isTeamContext
      );
    } catch (error) {
            this.atividadesCanceladas = [];
    } finally {
      this.loadingAtividadesCanceladas = false;
    }
  }

  async carregarProcessosPendentes() {
    this.loadingProcessosPendentes = true;
    try {
      this.processosPendentes = await this.pontosAvulsosService.getProcessosPendentes(
        this.timeId,
        this.userId,
        this.isTeamContext
      );
    } catch (error) {
            this.processosPendentes = [];
    } finally {
      this.loadingProcessosPendentes = false;
    }
  }

  async carregarProcessosIncompletos() {
    this.loadingProcessosIncompletos = true;
    try {
      this.processosIncompletos = await this.pontosAvulsosService.getProcessosIncompletos(
        this.timeId,
        this.userId,
        this.isTeamContext
      );
    } catch (error) {
            this.processosIncompletos = [];
    } finally {
      this.loadingProcessosIncompletos = false;
    }
  }

  async carregarProcessosEntregues() {
    this.loadingProcessosEntregues = true;
    try {
      this.processosEntregues = await this.pontosAvulsosService.getProcessosEntregues(
        this.timeId,
        this.userId,
        this.isTeamContext
      );
    } catch (error) {
            this.processosEntregues = [];
    } finally {
      this.loadingProcessosEntregues = false;
    }
  }

  async carregarProcessosCancelados() {
    this.loadingProcessosCancelados = true;
    try {
      this.processosCancelados = await this.pontosAvulsosService.getProcessosCancelados(
        this.timeId,
        this.userId,
        this.isTeamContext
      );
    } catch (error) {
            this.processosCancelados = [];
    } finally {
      this.loadingProcessosCancelados = false;
    }
  }

  async loadAliases() {
    this.aliasService.getAliases().then(aliases => {
      this.aliases = aliases;
    });
  }

  get isAdminOrGerente() {
    return (
        this.sessao.isAdmin() ||
        this.sessao.isGerente()
    );
  }
} 
