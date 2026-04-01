import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { AtividadeDetalhe, PontosAvulsosService } from '../../../../services/pontos-avulsos.service';
import { Comentario } from '../comentarios/comentarios.component';

export type CorDetalhe = 'vermelho' | 'verde' | 'azul' | 'cinza' | 'amarelo';

@Component({
  selector: 'app-detalhe-atividade',
  templateUrl: './detalhe-atividade.component.html',
  styleUrls: ['./detalhe-atividade.component.scss']
})
export class DetalheAtividadeComponent implements OnInit, OnChanges {
  @Input() atividade: AtividadeDetalhe | null = null;
  @Input() cor: CorDetalhe = 'vermelho';
  @Input() aliases: any;
  @Input() isAdminOrGerente = false;
  @Input() currentUserEmail = '';
  @Input() jogadores: any[] = []; // Lista de jogadores do time
  @Input() isTeamContext = true; // Se está no contexto de time
  @Output() voltar = new EventEmitter<void>();
  @Output() finalizar = new EventEmitter<void>();
  @Output() aprovar = new EventEmitter<void>();
  @Output() reprovar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();
  @Output() bloquear = new EventEmitter<void>();
  @Output() executorAtualizado = new EventEmitter<void>(); // Emitido quando o executor for atualizado

  // Propriedades para upload de arquivos
  maxArquivos = 5;
  maxTamanhoArquivo = 10 * 1024 * 1024; // 10MB

  // Propriedades para o seletor de executor
  novoExecutorSelecionado: string | null = null;
  atualizandoExecutor = false;

  constructor(private pontosAvulsosService: PontosAvulsosService) {}

  ngOnInit() {
    this.atualizarSeletorExecutor();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Atualizar o seletor quando a atividade mudar
    if (changes['atividade'] && !changes['atividade'].firstChange) {
      this.atualizarSeletorExecutor();
    }
  }

  /**
   * Atualiza o valor do seletor de executor baseado na atividade atual
   */
  private atualizarSeletorExecutor() {
    if (this.atividade?.user_email) {
      this.novoExecutorSelecionado = this.atividade.user_email;
    } else {
      this.novoExecutorSelecionado = 'UNASSIGNED';
    }
  }

  // ===== MÉTODOS DE AÇÕES =====

  onVoltar() {
    this.voltar.emit();
  }

  onFinalizar() {
    this.finalizar.emit();
  }

  onAprovar() {
    this.aprovar.emit();
  }

  onReprovar() {
    this.reprovar.emit();
  }

  onCancelar() {
    this.cancelar.emit();
  }

  onBloquear() {
    this.bloquear.emit();
  }

  // ===== MÉTODOS PARA COMPONENTES AUXILIARES =====

  onComentarioAdicionado(comentario: Comentario) {
    console.log('✅ Comentário adicionado:', comentario);
    // Aqui você pode adicionar lógica adicional se necessário
  }

  onComentariosCarregados(comentarios: Comentario[]) {
    console.log('✅ Comentários carregados:', comentarios.length);
    // Aqui você pode adicionar lógica adicional se necessário
  }

  onUploadConcluido() {
    console.log('✅ Upload de anexos concluído');
    // Aqui você pode adicionar lógica adicional se necessário
  }

  onDownloadIniciado(anexoId: string) {
    console.log('📥 Download iniciado para anexo:', anexoId);
    // Aqui você pode adicionar lógica adicional se necessário
  }

  // ===== MÉTODOS AUXILIARES =====

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

  getStatusLabel(status: string | undefined): string {
    if (!status) return 'N/A';
    
    if (this.atividade?.dismissed === true) {
      return 'Cancelada';
    }
    
    switch (status) {
      case 'PENDING': return 'Pendente';
      case 'DOING': return 'Em progresso';
      case 'DONE': 
        return this.isAtividadeAprovada() ? 'Aprovado' : 'Aguardando Aprovação';
      case 'DELIVERED': return 'Entregue';
      case 'LOST': return 'Perdido';
      case 'CANCELLED': return 'Cancelado';
      case 'INCOMPLETE': return 'Incompleto';
      default: return status;
    }
  }

  getStatusClass(status: string | undefined): string {
    if (!status) return '';
    
    if (this.atividade?.dismissed === true) {
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

  isAtividadeAprovada(): boolean {
    return this.atividade?.approved === true;
  }

  // ===== MÉTODOS DE CONTROLE DE BOTÕES =====

  podeAprovar(): boolean {
    return this.atividade?.status === 'DONE' && 
           !!this.atividade?.delivery_id &&
           !!this.atividade?.action_title &&
           !this.isAtividadeAprovada();
  }

  podeReprovar(): boolean {
    return this.atividade?.status !== 'PENDING';
  }

  podeCancelar(): boolean {
    return this.atividade?.dismissed !== true;
  }

  podeDesbloquear(): boolean {
    return this.atividade?.status === 'DONE' && 
           !!this.atividade?.delivery_id;
  }

  // ===== MÉTODOS PARA ATUALIZAÇÃO DE EXECUTOR =====

  /**
   * Atualiza o executor da atividade
   */
  async atualizarExecutor() {
    if (!this.atividade || this.atualizandoExecutor) {
      return;
    }

    // Verificar se o executor realmente mudou
    const executorAtual = this.atividade.user_email || null;
    const novoExecutor = this.novoExecutorSelecionado === 'UNASSIGNED' 
      ? null 
      : this.novoExecutorSelecionado;

    if (executorAtual === novoExecutor) {
      console.log('ℹ️ Executor não foi alterado');
      return;
    }

    this.atualizandoExecutor = true;

    try {
      // Obter os dados necessários da atividade
      const actionId = this.atividade.action_id || this.atividade.action_template_id;
      if (!actionId) {
        throw new Error('ID da ação não encontrado');
      }

      const deliveryId = this.atividade.delivery_id || '';
      const deliveryTitle = this.atividade.delivery_title || '';
      const createdAt = this.atividade.created_at || new Date().toISOString();
      const integrationId = this.atividade.integration_id || deliveryId || actionId;

      // Criar payload para atualizar o executor
      const payload = this.pontosAvulsosService.createProcessPayload(
        actionId,
        novoExecutor,
        deliveryId,
        deliveryTitle,
        this.atividade.status || 'PENDING',
        this.atividade.finished_at,
        undefined, // comment
        integrationId
      );

      // Manter outros campos da atividade
      if (this.atividade.approved !== undefined) {
        payload.approved = this.atividade.approved;
      }
      if (this.atividade.approved_by !== undefined) {
        payload.approved_by = this.atividade.approved_by;
      }
      if (this.atividade.dismissed !== undefined) {
        payload.dismissed = this.atividade.dismissed;
      }
      if (this.atividade.comments) {
        payload.comments = this.atividade.comments;
      }

      // Atualizar a atividade
      await this.pontosAvulsosService.processAction(payload);

      // Atualizar o executor localmente
      if (this.atividade) {
        this.atividade.user_email = novoExecutor || undefined;
      }

      console.log('✅ Executor atualizado com sucesso');
      
      // Emitir evento para o componente pai recarregar os dados
      this.executorAtualizado.emit();
    } catch (error) {
      console.error('❌ Erro ao atualizar executor:', error);
      // Reverter a seleção em caso de erro
      this.novoExecutorSelecionado = executorAtual || 'UNASSIGNED';
    } finally {
      this.atualizandoExecutor = false;
    }
  }

  /**
   * Obtém o nome do jogador pelo email
   */
  getJogadorNome(email: string | null | undefined): string {
    if (!email || email === 'UNASSIGNED') {
      return 'Não atribuído';
    }

    const jogador = this.jogadores.find(j => 
      j.email === email || j.id === email || j._id === email
    );

    if (jogador) {
      return jogador.name || jogador.full_name || email;
    }

    return this.formatEmailToName(email);
  }
} 