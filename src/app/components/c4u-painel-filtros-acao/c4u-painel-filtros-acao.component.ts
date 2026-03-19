import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface FiltrosAcaoModel {
  busca?: string;
  executor?: string;
  created_at_start?: string;
  created_at_end?: string;
  finished_at_start?: string;
  finished_at_end?: string;
}

export interface AcaoLoteModel {
  tipo: 'cancelar' | 'finalizar' | 'restaurar' | 'aprovar';
  label: string;
  icon?: string;
  habilitado: boolean;
}

export type FetchAllPagesCallback = () => Promise<void>;

@Component({
  selector: 'c4u-painel-filtros-acao',
  templateUrl: './c4u-painel-filtros-acao.component.html',
  styleUrls: ['./c4u-painel-filtros-acao.component.scss']
})
export class C4uPainelFiltrosAcaoComponent implements OnInit, OnDestroy {
  @Input() totalItens: number = 0;
  @Input() itensSelecionados: number = 0;
  @Input() mostrarFiltros: boolean = true;
  @Input() mostrarAcoes: boolean = true;
  @Input() acoesDisponiveis: AcaoLoteModel[] = [];
  @Input() executorsList: Array<{value: string, label: string}> = [];
  @Input() fetchAllPagesCallback?: FetchAllPagesCallback;
  
  @Output() filtrosChange = new EventEmitter<FiltrosAcaoModel>();
  @Output() acaoLote = new EventEmitter<'cancelar' | 'finalizar' | 'restaurar' | 'aprovar'>();
  @Output() selecionarTodos = new EventEmitter<boolean>();
  @Output() limparFiltros = new EventEmitter<void>();
  @Output() alterarItens = new EventEmitter<{executor?: string}>();
  @Output() fetchAllPagesNeeded = new EventEmitter<void>();

  formFiltros: FormGroup;
  formAlteracao: FormGroup;
  mostrarFiltrosAvancados: boolean = false;
  
  private buscaSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private isFetchingAllPages: boolean = false;

  constructor(private fb: FormBuilder) {
    this.formFiltros = this.fb.group({
      busca: [''],
      executor: [''],
      created_at_start: [''],
      created_at_end: [''],
      finished_at_start: [''],
      finished_at_end: ['']
    });

    this.formAlteracao = this.fb.group({
      executorAlteracao: ['']
    });
  }

  ngOnInit() {
    // Debounce para o campo de busca (500ms) - busca no frontend
    this.buscaSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      // Busca é feita no frontend, apenas emitir evento para que o componente pai filtre
      // Aguardar a função assíncrona
      this.onFiltrosChange().catch(error => {
        console.error('Erro ao processar mudança de filtros:', error);
      });
    });

    // Escuta mudanças no campo de busca com debounce
    this.formFiltros.get('busca')?.valueChanges.subscribe((busca: string) => {
      this.buscaSubject.next(busca || '');
    });

    // Escuta mudanças no executor e emite eventos imediatamente
    this.formFiltros.get('executor')?.valueChanges.subscribe(() => {
      // Aguardar a função assíncrona
      this.onFiltrosChange().catch(error => {
        console.error('Erro ao processar mudança de filtros:', error);
      });
    });

    // Datas não devem emitir eventos automaticamente - apenas quando o botão Filtrar for clicado
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.buscaSubject.complete();
  }

  /**
   * Verifica se precisa buscar todas as páginas antes de aplicar filtros
   * Retorna true se há apenas busca por texto (sem filtros de data ou executor)
   */
  private precisaBuscarTodasPaginas(): boolean {
    const buscaValue = this.formFiltros.get('busca')?.value;
    const buscaNormalizada = buscaValue?.trim();
    const executor = this.formFiltros.get('executor')?.value;
    const createdAtStart = this.formFiltros.get('created_at_start')?.value;
    const createdAtEnd = this.formFiltros.get('created_at_end')?.value;
    const finishedAtStart = this.formFiltros.get('finished_at_start')?.value;
    const finishedAtEnd = this.formFiltros.get('finished_at_end')?.value;
    
    // Verifica se há apenas busca por texto (sem filtros de data ou executor)
    const temBusca = !!buscaNormalizada;
    const temFiltroData = !!(createdAtStart || createdAtEnd || finishedAtStart || finishedAtEnd);
    const temExecutor = !!executor;
    
    // Precisa buscar todas as páginas se há busca por texto e não há outros filtros
    return temBusca && !temFiltroData && !temExecutor;
  }

  /**
   * Busca todas as páginas quando necessário antes de aplicar os filtros
   */
  private async buscarTodasPaginasSeNecessario(): Promise<void> {
    if (!this.precisaBuscarTodasPaginas() || this.isFetchingAllPages) {
      return;
    }

    this.isFetchingAllPages = true;

    try {
      // Se há callback fornecido pelo componente pai, usar ele
      if (this.fetchAllPagesCallback) {
        await this.fetchAllPagesCallback();
      } else {
        // Caso contrário, emitir evento para que o componente pai trate
        this.fetchAllPagesNeeded.emit();
      }
    } catch (error) {
      console.error('Erro ao buscar todas as páginas:', error);
    } finally {
      this.isFetchingAllPages = false;
    }
  }

  /**
   * Método principal chamado quando os filtros são alterados
   * Busca todas as páginas se necessário antes de emitir o evento de mudança de filtros
   */
  async onFiltrosChange() {
    // Se precisa buscar todas as páginas, fazer isso primeiro
    if (this.precisaBuscarTodasPaginas()) {
      await this.buscarTodasPaginasSeNecessario();
    }

    // Normalizar busca: se for string vazia ou apenas espaços, enviar como undefined
    const buscaValue = this.formFiltros.get('busca')?.value;
    const buscaNormalizada = buscaValue?.trim() || undefined;
    
    const filtros: FiltrosAcaoModel = {
      busca: buscaNormalizada,
      executor: this.formFiltros.get('executor')?.value || undefined,
      created_at_start: this.formFiltros.get('created_at_start')?.value || undefined,
      created_at_end: this.formFiltros.get('created_at_end')?.value || undefined,
      finished_at_start: this.formFiltros.get('finished_at_start')?.value || undefined,
      finished_at_end: this.formFiltros.get('finished_at_end')?.value || undefined
    };
    this.filtrosChange.emit(filtros);
  }

  /**
   * Aplica filtros de data quando o botão Filtrar for clicado
   */
  async onFiltrarData() {
    // Verifica se pelo menos uma data foi preenchida
    const createdAtStart = this.formFiltros.get('created_at_start')?.value;
    const createdAtEnd = this.formFiltros.get('created_at_end')?.value;
    const finishedAtStart = this.formFiltros.get('finished_at_start')?.value;
    const finishedAtEnd = this.formFiltros.get('finished_at_end')?.value;
    
    const temCreatedDates = createdAtStart || createdAtEnd;
    const temFinishedDates = finishedAtStart || finishedAtEnd;
    
    if (!temCreatedDates && !temFinishedDates) {
      // Não aplicar se nenhuma data estiver preenchida
      return;
    }
    
    await this.onFiltrosChange();
  }

  /**
   * Verifica se o botão de filtrar data deve estar habilitado
   */
  podeFiltrarData(): boolean {
    const createdAtStart = this.formFiltros.get('created_at_start')?.value;
    const createdAtEnd = this.formFiltros.get('created_at_end')?.value;
    const finishedAtStart = this.formFiltros.get('finished_at_start')?.value;
    const finishedAtEnd = this.formFiltros.get('finished_at_end')?.value;
    
    const temCreatedDates = createdAtStart || createdAtEnd;
    const temFinishedDates = finishedAtStart || finishedAtEnd;
    
    return !!(temCreatedDates || temFinishedDates);
  }

  onAcaoLote(tipo: 'cancelar' | 'finalizar' | 'restaurar' | 'aprovar') {
    this.acaoLote.emit(tipo);
  }

  onSelecionarTodos() {
    const selecionar = this.itensSelecionados < this.totalItens;
    this.selecionarTodos.emit(selecionar);
  }

  onLimparFiltros() {
    this.formFiltros.reset();
    this.limparFiltros.emit();
  }

  toggleFiltrosAvancados() {
    this.mostrarFiltrosAvancados = !this.mostrarFiltrosAvancados;
  }

  temFiltrosAtivos(): boolean {
    const valores = this.formFiltros.value;
    return !!(
      valores.busca ||
      valores.executor ||
      valores.created_at_start ||
      valores.created_at_end ||
      valores.finished_at_start ||
      valores.finished_at_end
    );
  }

  getAcaoLabel(tipo: string): string {
    const acao = this.acoesDisponiveis.find(a => a.tipo === tipo);
    return acao?.label || tipo;
  }

  podeExecutarAcao(): boolean {
    return this.itensSelecionados > 0;
  }

  onAlterarItens() {
    const executor = this.formAlteracao.get('executorAlteracao')?.value;

    if (!executor) {
      return; // Nenhuma alteração selecionada
    }

    this.alterarItens.emit({
      executor: executor || undefined
    });
  }

  podeAlterar(): boolean {
    const executor = this.formAlteracao.get('executorAlteracao')?.value;
    return this.itensSelecionados > 0 && !!executor;
  }
}

