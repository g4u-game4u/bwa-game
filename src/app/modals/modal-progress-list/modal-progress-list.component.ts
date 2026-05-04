import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, forkJoin, of, firstValueFrom } from 'rxjs';
import { takeUntil, map, catchError } from 'rxjs/operators';
import { ActionLogService, ActivityListItem, ProcessListItem } from '@services/action-log.service';
import type { Game4uUserActionStatus } from '@model/game4u-api.model';
import { ChartDataset } from '@model/gamification-dashboard.model';
import { CnpjLookupService } from '@services/cnpj-lookup.service';

export type ProgressListType =
  | 'atividades'
  | 'atividades-pendentes'
  | 'pontos'
  | 'processos-pendentes'
  | 'processos-finalizados';

/** Agrupamento por título de tarefa (modal tarefas finalizadas). */
export interface FinishedTaskGroup {
  groupKey: string;
  title: string;
  items: ActivityListItem[];
}

@Component({
  selector: 'modal-progress-list',
  templateUrl: './modal-progress-list.component.html',
  styleUrls: ['./modal-progress-list.component.scss'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('300ms ease-out', style({ height: '*', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ height: 0, opacity: 0 }))
      ])
    ])
  ]
})
export class ModalProgressListComponent implements OnInit, OnDestroy {
  @Input() playerId = '';
  /** Quando definido (ex. painel de equipa Game4U), escopo `team_id` num único GET com o jogador em `playerId`. */
  @Input() teamId: string | null = null;
  @Input() listType: ProgressListType = 'atividades';
  @Input() month?: Date;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  isLoadingChart = true;
  activityItems: ActivityListItem[] = [];
  processoItems: ProcessListItem[] = [];
  
  // Chart data
  chartLabels: string[] = [];
  chartDatasets: ChartDataset[] = [];
  
  // Accordion state for processes
  expandedProcesses: Set<string> = new Set();
  processActivities: Map<string, ActivityListItem[]> = new Map();
  loadingProcessActivities: Set<string> = new Set();

  /** Acordeão: grupos de tarefas finalizadas expandidos (chave = título normalizado). */
  expandedFinishedTaskGroups = new Set<string>();
  
  // Copy state
  copiedDeliveryId: string | null = null;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name

  /** Filtro local do modal «Tarefas finalizadas» (título, cliente, data). */
  activitySearchQuery = '';

  constructor(
    private actionLogService: ActionLogService,
    private cnpjLookupService: CnpjLookupService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get modalTitle(): string {
    switch (this.listType) {
      case 'atividades':
        return 'Tarefas Finalizadas';
      case 'atividades-pendentes':
        return 'Tarefas Pendentes';
      case 'pontos':
        return 'Pontos Obtidos';
      case 'processos-pendentes':
        return 'Processos Pendentes e Incompletos';
      case 'processos-finalizados':
        return 'Processos Finalizados';
      default:
        return 'Lista';
    }
  }

  get modalIcon(): string {
    switch (this.listType) {
      case 'atividades':
        return 'ri-checkbox-circle-line'; // Round checkbox icon for finished tasks
      case 'atividades-pendentes':
        return 'ri-time-line';
      case 'pontos':
        return 'ri-coins-line';
      case 'processos-pendentes':
        return 'ri-time-line';
      case 'processos-finalizados':
        return 'ri-checkbox-circle-line';
      default:
        return '';
    }
  }

  get isActivityList(): boolean {
    return (
      this.listType === 'atividades' ||
      this.listType === 'atividades-pendentes' ||
      this.listType === 'pontos'
    );
  }

  /** Mesmo layout em acordeão que «finalizadas» (agrupamento por título). */
  get isGroupedTasksModal(): boolean {
    return this.listType === 'atividades' || this.listType === 'atividades-pendentes';
  }

  /** Modal «Tarefas Pendentes»: sem coluna de finalização; gráfico por prazo. */
  get isPendingActivitiesModal(): boolean {
    return this.listType === 'atividades-pendentes';
  }

  /** Painel de equipa (escopo `team_id`): coluna com o jogador da user-action (`user_email`). */
  get showActivityExecutorColumn(): boolean {
    return (this.teamId ?? '').trim().length > 0;
  }

  /**
   * Mensagem enquanto `forkJoin` aguarda cada `getActivityList` terminar (inclui todas as páginas de
   * `GET /game/reports/user-actions` para pendentes e finalizadas), depois gráfico + enrich CNPJ.
   */
  get activityLoadingMessage(): string {
    switch (this.listType) {
      case 'atividades-pendentes':
        return 'Carregando tarefas pendentes e gráfico (todas as páginas)…';
      case 'atividades':
        return 'Carregando tarefas finalizadas e gráfico (todas as páginas)…';
      case 'pontos':
        return 'Carregando pontos…';
      default:
        return 'Carregando…';
    }
  }

  get chartSectionTitle(): string {
    return this.isPendingActivitiesModal
      ? 'Tarefas por dia de prazo no mês'
      : 'Volume de Tarefas por Dia';
  }

  get isProcessList(): boolean {
    return this.listType === 'processos-pendentes' || this.listType === 'processos-finalizados';
  }

  /**
   * Linhas exibidas na tabela: com filtro em «Tarefas finalizadas», lista completa nos demais tipos.
   */
  get displayedActivityItems(): ActivityListItem[] {
    if (!this.isGroupedTasksModal) {
      return this.activityItems;
    }
    const q = this.activitySearchQuery.trim().toLowerCase();
    if (!q) {
      return this.activityItems;
    }
    return this.activityItems.filter(item => this.activityMatchesSearch(item, q));
  }

  /**
   * Tarefas finalizadas agrupadas pelo nome da tarefa (`title`), com contagem e detalhes por cliente ao expandir.
   */
  get finishedTaskGroups(): FinishedTaskGroup[] {
    if (!this.isGroupedTasksModal) {
      return [];
    }
    const items = this.displayedActivityItems;
    const map = new Map<string, ActivityListItem[]>();
    for (const item of items) {
      const raw = (item.title || '').trim();
      const title = raw || 'Sem título';
      const list = map.get(title) ?? [];
      list.push(item);
      map.set(title, list);
    }
    const groups: FinishedTaskGroup[] = [...map.entries()].map(([title, row]) => ({
      groupKey: title,
      title,
      items: [...row].sort((a, b) => {
        if (this.isPendingActivitiesModal) {
          const ka = this.dtPrazoSortKey(a.dt_prazo);
          const kb = this.dtPrazoSortKey(b.dt_prazo);
          if (ka !== kb) {
            return ka - kb;
          }
        }
        return b.created - a.created;
      })
    }));
    groups.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }));
    return groups;
  }

  trackByFinishedTaskGroup(_index: number, g: FinishedTaskGroup): string {
    return g.groupKey;
  }

  toggleFinishedTaskGroup(groupKey: string): void {
    if (this.expandedFinishedTaskGroups.has(groupKey)) {
      this.expandedFinishedTaskGroups.delete(groupKey);
    } else {
      this.expandedFinishedTaskGroups.add(groupKey);
    }
    this.cdr.markForCheck();
  }

  isFinishedTaskExpanded(groupKey: string): boolean {
    return this.expandedFinishedTaskGroups.has(groupKey);
  }

  onActivitySearchInput(event: Event): void {
    this.activitySearchQuery = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  clearActivitySearch(): void {
    this.activitySearchQuery = '';
    this.cdr.markForCheck();
  }

  /**
   * Nome do cliente: razão social (lookup CNPJ), senão título do processo, senão CNPJ.
   */
  getActivityClientDisplay(item: ActivityListItem): string {
    if (item.cnpj) {
      const mapped = this.cnpjNameMap.get(item.cnpj);
      if (mapped?.trim()) {
        return mapped.trim();
      }
    }
    if (item.delivery_title?.trim()) {
      return item.delivery_title.trim();
    }
    if (item.cnpj) {
      return item.cnpj;
    }
    return '—';
  }

  private activityMatchesSearch(item: ActivityListItem, qLower: string): boolean {
    if ((item.title || '').toLowerCase().includes(qLower)) {
      return true;
    }
    const client = this.getActivityClientDisplay(item).toLowerCase();
    if (client.includes(qLower)) {
      return true;
    }
    if (item.cnpj?.toLowerCase().includes(qLower)) {
      return true;
    }
    if (item.delivery_title?.toLowerCase().includes(qLower)) {
      return true;
    }
    if (item.dt_prazo?.toLowerCase().includes(qLower)) {
      return true;
    }
    if (this.showActivityExecutorColumn) {
      const exec = this.formatEmailToName(item.player).toLowerCase();
      if (exec.includes(qLower)) {
        return true;
      }
      if ((item.player || '').toLowerCase().includes(qLower)) {
        return true;
      }
    }
    const prazoFmt = this.formatDtPrazo(item.dt_prazo).toLowerCase();
    if (prazoFmt && prazoFmt !== '—' && prazoFmt.includes(qLower)) {
      return true;
    }
    if (!this.isPendingActivitiesModal) {
      const completionDateStr = this.formatDateOnly(item.created).toLowerCase();
      if (completionDateStr.includes(qLower)) {
        return true;
      }
      const digits = qLower.replace(/\D/g, '');
      if (digits.length >= 2) {
        const dateDigits = completionDateStr.replace(/\D/g, '');
        if (dateDigits.includes(digits)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Com `teamId`, um único jogador (gestor ou colaborador) + escopo equipa na API.
   * Sem `teamId`, comportamento legado: vários IDs separados por vírgula (forkJoin).
   */
  private getPlayerIds(): string[] {
    if (!this.playerId) {
      return [];
    }
    const scope = (this.teamId ?? '').trim();
    if (scope) {
      const single = this.playerId.split(',')[0]?.trim() ?? '';
      return single ? [single] : [];
    }
    return this.playerId.split(',').map(id => id.trim()).filter(id => id.length > 0);
  }

  private loadData(): void {
    this.isLoading = true;

    const playerIds = this.getPlayerIds();
    
    if (playerIds.length === 0) {
      console.warn('No player IDs provided');
      this.activityItems = [];
      this.processoItems = [];
      this.isLoading = false;
      this.isLoadingChart = false;
      this.chartLabels = [];
      this.chartDatasets = [];
      this.cdr.markForCheck();
      return;
    }

    if (this.isActivityList) {
      this.isLoadingChart = true;
      this.activityItems = [];
      this.chartLabels = [];
      this.chartDatasets = [];
      /**
       * Pendentes e finalizadas (Game4U): cada `getActivityList` agrega todas as páginas de
       * `GET /game/reports/user-actions` antes de completar. `forkJoin` espera todos os jogadores;
       * só então montamos gráfico e tabela (e enrich CNPJ).
       */
      const reportStatuses: Game4uUserActionStatus[] | undefined =
        this.listType === 'atividades-pendentes'
          ? ['PENDING', 'DOING']
          : this.listType === 'atividades'
            ? ['DONE', 'DELIVERED']
            : undefined;

      const tid = (this.teamId ?? '').trim() || undefined;
      const activityRequests = playerIds.map(playerId =>
        this.actionLogService.getActivityList(
          playerId,
          this.month,
          undefined,
          reportStatuses,
          tid
        ).pipe(
          catchError(error => {
            console.error(`Error loading activity list for player ${playerId}:`, error);
            return of([] as ActivityListItem[]);
          })
        )
      );

      forkJoin(activityRequests)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async (results: ActivityListItem[][]) => {
            // Aggregate all activities from all players
            this.activityItems = results.flat();

            if (this.listType === 'atividades-pendentes') {
              this.activityItems.sort((a, b) => {
                const ka = this.dtPrazoSortKey(a.dt_prazo);
                const kb = this.dtPrazoSortKey(b.dt_prazo);
                if (ka !== kb) {
                  return ka - kb;
                }
                return b.created - a.created;
              });
            } else {
              this.activityItems.sort((a, b) => b.created - a.created);
            }

            // Gráfico: finalizadas por dia de registro; pendentes por dia de prazo (`dt_prazo`)
            this.applyChartFromActivityItems(this.activityItems);

            // Enrich CNPJ names (tabela); só depois exibir conteúdo + gráfico juntos
            await this.enrichCnpjNames(this.activityItems.map(item => item.cnpj).filter(cnpj => cnpj));

            this.isLoadingChart = false;
            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: (err: Error) => {
            console.error('Error loading activity lists:', err);
            this.activityItems = [];
            this.applyChartFromActivityItems([]);
            this.isLoadingChart = false;
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
    } else if (this.isProcessList) {
      const tid = (this.teamId ?? '').trim() || undefined;
      const processRequests = playerIds.map(playerId =>
        this.actionLogService.getProcessList(playerId, this.month, tid).pipe(
          catchError(error => {
            console.error(`Error loading process list for player ${playerId}:`, error);
            return of([] as ProcessListItem[]);
          })
        )
      );

      forkJoin(processRequests)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async (results: ProcessListItem[][]) => {
            // Aggregate all processes from all players
            // Use a Map to deduplicate by deliveryId
            const processMap = new Map<string, ProcessListItem>();
            
            results.flat().forEach(process => {
              const existing = processMap.get(process.deliveryId);
              if (existing) {
                // If process already exists, merge action counts
                existing.actionCount += process.actionCount;
                // Keep finalized status if any is finalized
                if (process.isFinalized) {
                  existing.isFinalized = true;
                }
                // Keep CNPJ if available
                if (process.cnpj && !existing.cnpj) {
                  existing.cnpj = process.cnpj;
                }
              } else {
                processMap.set(process.deliveryId, { ...process });
              }
            });
            
            const allProcesses = Array.from(processMap.values());
            
            // Filter based on list type
            if (this.listType === 'processos-finalizados') {
              this.processoItems = allProcesses.filter(p => p.isFinalized);
            } else {
              this.processoItems = allProcesses.filter(p => !p.isFinalized);
            }
            
            // Sort by action count (descending)
            this.processoItems.sort((a, b) => b.actionCount - a.actionCount);
            
            // Enrich CNPJ names
            await this.enrichCnpjNames(this.processoItems.map(item => item.cnpj).filter(cnpj => cnpj));
            
            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: (err: Error) => {
            console.error('Error loading process lists:', err);
            this.processoItems = [];
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  /**
   * Conta tarefas por dia do mês usando os mesmos itens da tabela (origem: user-actions Game4U
   * ou action_log Funifier, conforme getActivityList).
   * «Tarefas pendentes»: eixo = dia do calendário do **prazo** (`dt_prazo`), não data de criação/finalização.
   */
  private applyChartFromActivityItems(items: ActivityListItem[]): void {
    if (this.listType === 'atividades-pendentes') {
      this.applyChartFromDtPrazoItems(items);
      return;
    }

    const targetMonth = this.month || new Date();
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;

    const newDailyCounts: number[] = Array.from({ length: daysInMonth }, () => 0);

    for (const item of items) {
      if (!item.created) {
        continue;
      }
      const entryDate = new Date(item.created);
      const entryYear = entryDate.getFullYear();
      const entryMonth = entryDate.getMonth();
      const entryDay = entryDate.getDate();
      if (entryYear === year && entryMonth === month && entryDay >= 1 && entryDay <= daysInMonth) {
        newDailyCounts[entryDay - 1]++;
      }
    }

    this.chartLabels = [...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];

    const backgroundColorArray = newDailyCounts.map((count, index) => {
      if (isCurrentMonth && index + 1 > currentDay) {
        return 'rgba(255, 255, 255, 0.1)';
      }
      if (count > 0) {
        return 'rgba(34, 197, 94, 0.6)';
      }
      return 'rgba(255, 255, 255, 0.05)';
    });

    const borderColorArray = newDailyCounts.map((count, index) => {
      if (isCurrentMonth && index + 1 > currentDay) {
        return 'rgba(255, 255, 255, 0.1)';
      }
      if (count > 0) {
        return 'rgba(34, 197, 94, 1)';
      }
      return 'rgba(255, 255, 255, 0.1)';
    });

    this.chartDatasets = [
      {
        label: 'Tarefas',
        data: [...newDailyCounts],
        backgroundColor: backgroundColorArray,
        borderColor: borderColorArray,
        borderWidth: 1
      }
    ];
  }

  /** Ordenação e gráfico: milissegundos no início do dia do prazo; sem prazo → fim da lista. */
  private dtPrazoSortKey(dt?: string): number {
    const ms = this.parseDtPrazoToLocalStartMs(dt);
    return ms ?? Number.MAX_SAFE_INTEGER;
  }

  private parseDtPrazoToLocalStartMs(dt?: string): number | null {
    if (!dt?.trim()) {
      return null;
    }
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt.trim());
    if (!ymd) {
      return null;
    }
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }

  /** Barras = contagem de tarefas cujo `dt_prazo` cai em cada dia do mês visível. */
  private applyChartFromDtPrazoItems(items: ActivityListItem[]): void {
    const targetMonth = this.month || new Date();
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;

    const newDailyCounts: number[] = Array.from({ length: daysInMonth }, () => 0);

    for (const item of items) {
      const ms = this.parseDtPrazoToLocalStartMs(item.dt_prazo);
      if (ms == null) {
        continue;
      }
      const entryDate = new Date(ms);
      const entryYear = entryDate.getFullYear();
      const entryMonth = entryDate.getMonth();
      const entryDay = entryDate.getDate();
      if (entryYear === year && entryMonth === month && entryDay >= 1 && entryDay <= daysInMonth) {
        newDailyCounts[entryDay - 1]++;
      }
    }

    this.chartLabels = [...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];

    const fillPending = (count: number, index: number, active: string, muted: string) => {
      if (isCurrentMonth && index + 1 > currentDay) {
        return 'rgba(255, 255, 255, 0.1)';
      }
      if (count > 0) {
        return active;
      }
      return muted;
    };

    const bg = newDailyCounts.map((count, index) =>
      fillPending(count, index, 'rgba(251, 191, 36, 0.65)', 'rgba(255, 255, 255, 0.05)')
    );
    const border = newDailyCounts.map((count, index) =>
      fillPending(count, index, 'rgba(245, 158, 11, 1)', 'rgba(255, 255, 255, 0.1)')
    );

    this.chartDatasets = [
      {
        label: 'Por prazo',
        data: [...newDailyCounts],
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 1
      }
    ];
  }

  onClose(): void {
    this.closed.emit();
  }

  formatDate(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /** Data sem horário (coluna «Data de Finalização» em tarefas finalizadas). */
  formatDateOnly(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  /** Exibe `dt_prazo` (`YYYY-MM-DD` ou ISO) no formato local; sem valor → em dash. */
  formatDtPrazo(value?: string): string {
    if (!value?.trim()) {
      return '—';
    }
    const s = value.trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (ymd) {
      const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
    }
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      return new Date(t).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    return s;
  }

  /**
   * Início do dia local do prazo (alinha a {@link formatDtPrazo}: `YYYY-MM-DD` ou ISO).
   */
  private dtPrazoToLocalDayStartMs(dt?: string): number | null {
    let ms = this.parseDtPrazoToLocalStartMs(dt);
    if (ms == null && dt?.trim()) {
      const t = Date.parse(dt.trim());
      if (!Number.isNaN(t)) {
        const d = new Date(t);
        ms = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
      }
    }
    return ms;
  }

  /** Tarefas pendentes: prazo estritamente anterior a hoje (calendário local). */
  isPendingTaskOverdue(dt_prazo?: string): boolean {
    const ms = this.dtPrazoToLocalDayStartMs(dt_prazo);
    if (ms == null) {
      return false;
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    return ms < todayStart;
  }

  /**
   * Format email to name (e.g., "maria.luisa@bwa.global" -> "Maria Luisa")
   */
  formatEmailToName(email: string | undefined): string {
    if (!email) return 'N/A';
    
    const namePart = email.split('@')[0];
    
    if (namePart.includes('.')) {
      const parts = namePart.split('.');
      return parts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    } else {
      return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
    }
  }

  /**
   * Get status label for activities
   */
  getStatusLabel(item?: ActivityListItem): string {
    if (item?.status) {
      switch (item.status) {
        case 'finalizado':
          return 'Finalizado';
        case 'pendente':
          return 'Pendente';
        case 'dispensado':
          return 'Dispensado';
        default:
          return 'N/A';
      }
    }
    return 'Finalizado';
  }

  /**
   * Get status class for activities
   */
  getStatusClass(item?: ActivityListItem): string {
    if (item?.status) {
      switch (item.status) {
        case 'finalizado':
          return 'status-finalizado';
        case 'pendente':
          return 'status-pendente';
        case 'dispensado':
          return 'status-dispensado';
        default:
          return 'status-unknown';
      }
    }
    return 'status-finalizado';
  }

  /**
   * Toggle accordion for a process
   */
  toggleProcess(deliveryId: string): void {
    if (this.expandedProcesses.has(deliveryId)) {
      this.expandedProcesses.delete(deliveryId);
    } else {
      this.expandedProcesses.add(deliveryId);
      // Load activities if not already loaded
      if (!this.processActivities.has(deliveryId)) {
        this.loadProcessActivities(deliveryId);
      }
    }
    this.cdr.detectChanges();
  }

  /**
   * Check if a process is expanded
   */
  isProcessExpanded(deliveryId: string): boolean {
    return this.expandedProcesses.has(deliveryId);
  }

  /**
   * Load activities for a specific process
   */
  private loadProcessActivities(deliveryId: string): void {
    const deliveryIdNum = parseInt(deliveryId, 10);
    if (isNaN(deliveryIdNum)) {
      // Some new payloads don't provide numeric delivery_id.
      // Keep accordion stable and show no nested rows instead of breaking.
      console.warn('Non-numeric process id, skipping nested activities query:', deliveryId);
      this.processActivities.set(deliveryId, []);
      this.loadingProcessActivities.delete(deliveryId);
      this.cdr.markForCheck();
      return;
    }

    const playerIds = this.getPlayerIds();
    if (playerIds.length === 0) {
      console.warn('No player IDs for process activities');
      this.processActivities.set(deliveryId, []);
      this.loadingProcessActivities.delete(deliveryId);
      this.cdr.markForCheck();
      return;
    }

    this.loadingProcessActivities.add(deliveryId);
    this.cdr.markForCheck();

    // Load activities for all player IDs in parallel
    const activityRequests = playerIds.map(playerId =>
      this.actionLogService.getActivitiesByProcess(deliveryIdNum, playerId, this.month).pipe(
        catchError(error => {
          console.error(`Error loading process activities for player ${playerId}:`, error);
          return of([] as ActivityListItem[]);
        })
      )
    );

    forkJoin(activityRequests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results: ActivityListItem[][]) => {
          // Aggregate all activities from all players
          const allActivities = results.flat();
          // Sort by created date (newest first)
          allActivities.sort((a, b) => b.created - a.created);
          
          console.log('📊 Activities loaded for process:', deliveryId, allActivities);
          this.processActivities.set(deliveryId, allActivities);
          this.loadingProcessActivities.delete(deliveryId);
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          console.error('Error loading process activities:', err);
          this.processActivities.set(deliveryId, []);
          this.loadingProcessActivities.delete(deliveryId);
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Get activities for a process
   */
  getProcessActivities(deliveryId: string): ActivityListItem[] {
    return this.processActivities.get(deliveryId) || [];
  }

  /**
   * Check if activities are loading for a process
   */
  isLoadingProcessActivities(deliveryId: string): boolean {
    return this.loadingProcessActivities.has(deliveryId);
  }

  /**
   * Enrich CNPJ names from empid_cnpj__c collection
   */
  private async enrichCnpjNames(cnpjList: (string | undefined)[]): Promise<void> {
    try {
      const validCnpjs = cnpjList.filter((cnpj): cnpj is string => !!cnpj);
      if (validCnpjs.length === 0) return;
      
      const cnpjNames = await firstValueFrom(
        this.cnpjLookupService.enrichCnpjList(validCnpjs)
      );
      this.cnpjNameMap = cnpjNames;
    } catch (error) {
      console.error('Error enriching CNPJ names:', error);
    }
  }

  /**
   * Get company display name from CNPJ
   * Uses the enriched CNPJ name map from the lookup service
   */
  getCompanyDisplayName(cnpj: string | undefined): string {
    if (!cnpj) return '';
    // Use the enriched name from the map, fallback to original
    const displayName = this.cnpjNameMap.get(cnpj);
    return displayName || cnpj;
  }

  /**
   * Copy delivery_id to clipboard
   */
  copyDeliveryId(deliveryId: string, event: Event): void {
    event.stopPropagation(); // Prevent accordion toggle
    
    // Use Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(deliveryId).then(() => {
        this.copiedDeliveryId = deliveryId;
        this.cdr.detectChanges();
        
        // Reset after 2 seconds
        setTimeout(() => {
          this.copiedDeliveryId = null;
          this.cdr.detectChanges();
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback to old method
        this.fallbackCopyText(deliveryId);
      });
    } else {
      // Fallback for older browsers
      this.fallbackCopyText(deliveryId);
    }
  }

  /**
   * Fallback copy method for older browsers
   */
  private fallbackCopyText(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.copiedDeliveryId = text;
        this.cdr.detectChanges();
        
        setTimeout(() => {
          this.copiedDeliveryId = null;
          this.cdr.detectChanges();
        }, 2000);
      } else {
        console.error('Fallback copy failed');
      }
    } catch (err) {
      console.error('Fallback copy error:', err);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
