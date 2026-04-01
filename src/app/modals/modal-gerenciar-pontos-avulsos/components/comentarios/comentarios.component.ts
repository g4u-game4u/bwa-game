import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

export interface Comentario {
  id?: string;
  message: string;
  type: 'FINISH' | 'APPROVE' | 'DENY' | 'CANCEL' | 'BLOCK' | 'COMMENT';
  created_by: string;
  created_at: string;
}

@Component({
  selector: 'app-comentarios',
  templateUrl: './comentarios.component.html',
  styleUrls: ['./comentarios.component.scss']
})
export class ComentariosComponent implements OnInit {
  @Input() userActionId: string = '';
  @Input() currentUserEmail: string = '';
  @Input() aliases: any;
  @Input() comentarios: Comentario[] = [];
  @Input() loadingComentarios: boolean = false;

  @Output() comentarioAdicionado = new EventEmitter<Comentario>();
  @Output() comentariosCarregados = new EventEmitter<Comentario[]>();

  // Estado do formulário
  novoComentario: string = '';
  adicionandoComentario: boolean = false;

  constructor() {}

  ngOnInit() {
    if (this.userActionId && this.comentarios.length === 0) {
      this.carregarComentarios();
    }
  }

  // ===== MÉTODOS DE COMENTÁRIOS =====

  async adicionarComentario() {
    if (!this.novoComentario.trim() || !this.currentUserEmail) {
      return;
    }

    this.adicionandoComentario = true;

    try {
      const comentario: Comentario = {
        message: this.novoComentario.trim(),
        type: 'COMMENT',
        created_by: this.currentUserEmail,
        created_at: new Date().toISOString()
      };

      // Aqui você faria a chamada real para o serviço
      // await this.pontosAvulsosService.adicionarComentario(
      //   this.userActionId,
      //   comentario.message,
      //   comentario.created_by,
      //   comentario.type
      // );

      // Simular delay da API
      await new Promise(resolve => setTimeout(resolve, 500));

      // Adicionar à lista local
      this.comentarios.unshift(comentario);

      // Emitir evento
      this.comentarioAdicionado.emit(comentario);

      // Limpar campo
      this.novoComentario = '';

      console.log('✅ Comentário adicionado com sucesso');

    } catch (error) {
      console.error('❌ Erro ao adicionar comentário:', error);
    } finally {
      this.adicionandoComentario = false;
    }
  }

  private async carregarComentarios(): Promise<void> {
    try {
      // Aqui você faria a chamada real para o serviço
      // const response = await this.pontosAvulsosService.buscarComentarios(this.userActionId);
      
      // Simular dados de comentários
      const comentariosSimulados: Comentario[] = [
        {
          id: '1',
          message: 'Atividade iniciada com sucesso',
          type: 'FINISH',
          created_by: 'usuario1@exemplo.com',
          created_at: new Date(Date.now() - 86400000).toISOString() // 1 dia atrás
        },
        {
          id: '2',
          message: 'Preciso de mais informações sobre o projeto',
          type: 'DENY',
          created_by: 'gerente@exemplo.com',
          created_at: new Date(Date.now() - 43200000).toISOString() // 12 horas atrás
        },
        {
          id: '3',
          message: 'Informações adicionais fornecidas',
          type: 'COMMENT',
          created_by: 'usuario1@exemplo.com',
          created_at: new Date(Date.now() - 21600000).toISOString() // 6 horas atrás
        }
      ];

      this.comentarios = comentariosSimulados;
      this.comentariosCarregados.emit(this.comentarios);

      console.log('✅ Comentários carregados:', this.comentarios.length);

    } catch (error) {
      console.error('❌ Erro ao carregar comentários:', error);
      this.comentarios = [];
    }
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

  getTipoComentarioLabel(tipo: string): string {
    switch (tipo) {
      case 'FINISH': return 'Finalização';
      case 'APPROVE': return 'Aprovação';
      case 'DENY': return 'Reprovação';
      case 'CANCEL': return 'Cancelamento';
      case 'BLOCK': return 'Bloqueio';
      case 'COMMENT': return 'Comentário';
      default: return tipo;
    }
  }

  getTipoComentarioClass(tipo: string): string {
    switch (tipo) {
      case 'FINISH': return 'tipo-finish';
      case 'APPROVE': return 'tipo-approve';
      case 'DENY': return 'tipo-deny';
      case 'CANCEL': return 'tipo-cancel';
      case 'BLOCK': return 'tipo-block';
      case 'COMMENT': return 'tipo-comment';
      default: return 'tipo-default';
    }
  }

  // ===== MÉTODOS DE CONTROLE DE ESTADO =====

  podeAdicionarComentario(): boolean {
    return this.novoComentario.trim().length > 0 && 
           !this.adicionandoComentario && 
           !!this.currentUserEmail;
  }

  getComentariosOrdenados(): Comentario[] {
    return [...this.comentarios].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  temComentarios(): boolean {
    return this.comentarios.length > 0;
  }

  getTextoPlaceholder(): string {
    return `Adicione um comentário sobre esta ${this.aliases?.actionAlias || 'atividade'}...`;
  }
} 