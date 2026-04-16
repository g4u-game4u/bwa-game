import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, forkJoin, of, firstValueFrom } from 'rxjs';
import { takeUntil, map, catchError } from 'rxjs/operators';
import { ActionLogService, ActivityListItem, ProcessListItem, ActionLogEntry } from '@services/action-log.service';
import {
  GameActionsUserRosterEntry,
  UserActionDashboardService
} from '@services/user-action-dashboard.service';
import { ChartDataset } from '@model/gamification-dashboard.model';
import { CnpjLookupService } from '@services/cnpj-lookup.service';

export type ProgressListType = 'atividades' | 'pontos' | 'processos-pendentes' | 'processos-finalizados';

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
  @Input() listType: ProgressListType = 'atividades';
  @Input() month?: Date;
  /**
   * When true, shows the Pontos column in activity lists (listType `atividades` or `pontos`).
   * Default false: painel individual do jogador não exibe pontos por tarefa; apenas o team-management ativa.
   */
  @Input() showPointsInActivityList = false;
  /** When true, shows a "Cliente" column using item.cnpj (attributes.deal). */
  @Input() showClientColumnInActivityList = false;
  /** Se true, listas de atividades/pontos vêm do GET `/user-action` (cache no UserActionDashboardService). */
  @Input() useBackendUserActions = false;
  /** Rótulos e títulos do modal alinhados a «movimentações» (times CS / Financeiro). */
  @Input() useMovimentacoesLabels = false;
  /**
   * Mapeia `userId` (ex.: UUID Game4U) → e-mail para GET `/game/actions?user=` quando {@link playerId} não é e-mail.
   * Usado na gestão de equipa ao agregar vários membros.
   */
  @Input() gameActionsUserRoster: ReadonlyArray<GameActionsUserRosterEntry> | null = null;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  isLoadingChart = true;
  activityItems: ActivityListItem[] = [];
  filteredActivityItems: ActivityListItem[] = [];
  processoItems: ProcessListItem[] = [];
  searchTerm: string = '';
  filterExecutor: string = '';
  availableExecutors: string[] = [];
  filteredProcessoItems: ProcessListItem[] = [];
  
  // Chart data
  chartLabels: string[] = [];
  chartDatasets: ChartDataset[] = [];
  
  // Accordion state for processes
  expandedProcesses: Set<string> = new Set();
  processActivities: Map<string, ActivityListItem[]> = new Map();
  loadingProcessActivities: Set<string> = new Set();
  
  // Copy state
  copiedDeliveryId: string | null = null;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name

  constructor(
    private actionLogService: ActionLogService,
    private userActionDashboard: UserActionDashboardService,
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
        return this.useMovimentacoesLabels ? 'Movimentações Finalizadas' : 'Tarefas Finalizadas';
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
    return this.listType === 'atividades' || this.listType === 'pontos';
  }

  get isProcessList(): boolean {
    return this.listType === 'processos-pendentes' || this.listType === 'processos-finalizados';
  }

  get showPointsColumn(): boolean {
    if (!this.showPointsInActivityList) {
      return false;
    }
    return this.listType === 'atividades' || this.listType === 'pontos';
  }

  get showClientColumn(): boolean {
    return this.isActivityList && this.showClientColumnInActivityList;
  }

  get activityVolumeChartTitle(): string {
    return this.useMovimentacoesLabels ? 'Volume de Movimentações por Dia' : 'Volume de Tarefas por Dia';
  }

  get activityTableSectionTitle(): string {
    return this.useMovimentacoesLabels ? 'Movimentações' : 'Tarefas';
  }

  get activityColumnSingular(): string {
    return this.useMovimentacoesLabels ? 'Movimentação' : 'Tarefa';
  }

  get activitySearchAriaLabel(): string {
    return this.useMovimentacoesLabels ? 'Buscar movimentações' : 'Buscar tarefas';
  }

  get emptyActivityListNone(): string {
    return this.useMovimentacoesLabels ? 'Nenhuma movimentação encontrada' : 'Nenhuma tarefa encontrada';
  }

  private chartDatasetActivityPlural(): string {
    return this.useMovimentacoesLabels ? 'Movimentações' : 'Tarefas';
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm = value;
    this.filterActivityItems();
  }

  filterActivityItems(): void {
    const search = (this.searchTerm || '').trim().toLowerCase();
    if (!search) {
      this.filteredActivityItems = [...this.activityItems];
      return;
    }

    this.filteredActivityItems = this.activityItems.filter(item => {
      const title = (item.title || '').toLowerCase();
      const executor = (item.player || '').toLowerCase();
      const dateText = this.formatDate(item.created).toLowerCase();
      const delivery = (item.deliveryName || '').toLowerCase();

      return (
        title.includes(search) ||
        executor.includes(search) ||
        dateText.includes(search) ||
        delivery.includes(search)
      );
    });
  }

  /**
   * Filter activities/processes based on search term and executor filter
   */
  applyFilters(): void {
    const term = this.searchTerm.toLowerCase().trim();
    const executor = this.filterExecutor;

    if (this.isActivityList) {
      this.filteredActivityItems = this.activityItems.filter(item => {
        const matchesSearch = !term ||
          item.title.toLowerCase().includes(term) ||
          (item.player && item.player.toLowerCase().includes(term)) ||
          (item.cnpj && item.cnpj.toLowerCase().includes(term)) ||
          (item.deliveryName && item.deliveryName.toLowerCase().includes(term));
        const matchesExecutor = !executor || item.player === executor;
        return matchesSearch && matchesExecutor;
      });
    } else if (this.isProcessList) {
      this.filteredProcessoItems = this.processoItems.filter(item => {
        const matchesSearch = !term ||
          item.title.toLowerCase().includes(term) ||
          item.deliveryId.toLowerCase().includes(term) ||
          (item.cnpj && item.cnpj.toLowerCase().includes(term));
        return matchesSearch;
      });
    }
  }

  onSearchChange(value: string): void {
    this.searchTerm = value;
    this.applyFilters();
  }

  onExecutorFilterChange(value: string): void {
    this.filterExecutor = value;
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.filterExecutor = '';
    this.applyFilters();
  }

  private extractExecutors(): void {
    const executorSet = new Set<string>();
    this.activityItems.forEach(item => {
      if (item.player) executorSet.add(item.player);
    });
    this.availableExecutors = Array.from(executorSet).sort();
  }

  /**
   * Get array of player IDs from comma-separated string
   */
  private getPlayerIds(): string[] {
    if (!this.playerId) {
      return [];
    }
    // Split by comma and filter out empty strings
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
      const activityRequests = playerIds.map(playerId =>
        this.useBackendUserActions
          ? this.userActionDashboard
              .getFinishedListForPlayer(
                playerId,
                this.month || new Date(),
                this.gameActionsUserRoster ?? undefined
              )
              .pipe(
              catchError(error => {
                console.error(`Error loading user-action list for player ${playerId}:`, error);
                return of([] as ActivityListItem[]);
              })
            )
          : this.actionLogService.getActivityList(playerId, this.month).pipe(
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

            // This modal is used for "atividades finalizadas".
            // Ensure we don't show "pendente" / "dispensado" items inside the finalized view.
            if (this.listType === 'atividades' || this.listType === 'pontos') {
              this.activityItems = this.activityItems.filter(item => {
                // If status is missing, keep it for backward compatibility (it will render as "Finalizado").
                if (!item.status) return true;
                return item.status === 'finalizado';
              });
            }
            // Sort by created date (newest first)
            this.activityItems.sort((a, b) => b.created - a.created);
            
            // Enrich CNPJ names
            await this.enrichCnpjNames(this.activityItems.map(item => item.cnpj).filter(cnpj => cnpj));

            // Apply initial filter
            this.filteredActivityItems = [...this.activityItems];
            this.filterActivityItems();

            this.isLoading = false;
            if (this.useBackendUserActions && this.isActivityList) {
              this.loadChartDataFromActivityItems();
            }
            this.cdr.markForCheck();
          },
          error: (err: Error) => {
            console.error('Error loading activity lists:', err);
            this.activityItems = [];
            this.isLoading = false;
            this.isLoadingChart = false;
            this.cdr.markForCheck();
          }
        });
      
      if (!this.useBackendUserActions) {
        this.loadChartData();
      } else {
        this.isLoadingChart = true;
        this.chartLabels = [];
        this.chartDatasets = [];
        this.cdr.markForCheck();
      }
    } else if (this.isProcessList) {
      // Load processes for all player IDs in parallel
      const processRequests = playerIds.map(playerId =>
        this.actionLogService.getProcessList(playerId, this.month).pipe(
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
            
            this.applyFilters();
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
   * Load chart data with activities count by day
   * Uses getPlayerActionLogForMonth to get raw action log data and processes it locally
   */
  private loadChartData(): void {
    this.isLoadingChart = true;
    // Clear previous data to ensure change detection
    this.chartLabels = [];
    this.chartDatasets = [];
    this.cdr.markForCheck();

    const targetMonth = this.month || new Date();
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;
    // Initialize all days with 0 - create new array
    const dailyCounts: number[] = Array.from({ length: daysInMonth }, () => 0);

    // Get all player IDs
    const playerIds = this.getPlayerIds();
    
    if (playerIds.length === 0) {
      console.warn('No player IDs for chart data');
      this.chartLabels = [];
      this.chartDatasets = [];
      this.isLoadingChart = false;
      this.cdr.markForCheck();
      return;
    }

    // Load action log for all player IDs in parallel
    const actionLogRequests = playerIds.map(playerId =>
      this.actionLogService.getPlayerActionLogForMonth(playerId, targetMonth).pipe(
        catchError(error => {
          console.error(`Error loading action log for player ${playerId}:`, error);
          return of([] as ActionLogEntry[]);
        })
      )
    );

    forkJoin(actionLogRequests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results: ActionLogEntry[][]) => {
          // Aggregate all action log entries from all players
          const allActionLogEntries = results.flat();
          // Process entries to count activities by day
          const newDailyCounts = [...dailyCounts];
          
          allActionLogEntries.forEach(entry => {
            // Extract timestamp from time field (can be number or { $date: "ISO string" })
            let timestamp: number;
            if (typeof entry.time === 'number') {
              timestamp = entry.time;
            } else if (entry.time && typeof entry.time === 'object' && '$date' in entry.time) {
              const date = new Date(entry.time.$date);
              timestamp = isNaN(date.getTime()) ? 0 : date.getTime();
            } else {
              return; // Skip entries with invalid time
            }

            // Convert timestamp to date
            const entryDate = new Date(timestamp);
            const entryYear = entryDate.getFullYear();
            const entryMonth = entryDate.getMonth();
            const entryDay = entryDate.getDate();

            const isDismissed =
              entry.extra?.['dismissed'] === true ||
              (entry as any).attributes?.['dismissed'] === true ||
              entry.status === 'CANCELLED';
            const stageRaw = (entry as any).attributes?.['stage'];
            const stage =
              typeof stageRaw === 'string' ? stageRaw.trim().toLowerCase() : '';
            const hasStage = stage.length > 0;
            const stageIndicatesFinalizado =
              stage === 'done' ||
              stage === 'delivered' ||
              stage === 'finalizado' ||
              stage === 'finalizada' ||
              stage.includes('finaliz') ||
              stage.includes('entreg') ||
              stage.includes('conclu');
            const isFinalized =
              entry.extra?.processed === true ||
              entry.status === 'DONE' ||
              entry.status === 'DELIVERED' ||
              entry.actionId === 'desbloquear' ||
              stageIndicatesFinalizado ||
              hasStage;

            // Check if entry is in the target month
            if (entryYear === year && entryMonth === month && entryDay >= 1 && entryDay <= daysInMonth) {
              if (this.listType === 'atividades' || this.listType === 'pontos') {
                if (!isDismissed && isFinalized) {
                  newDailyCounts[entryDay - 1]++;
                }
              } else {
                newDailyCounts[entryDay - 1]++;
              }
            }
          });
          console.log('📊 Total activities:', newDailyCounts.reduce((sum, count) => sum + count, 0));

          // Generate labels (day numbers) - create new array reference
          this.chartLabels = [...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];

          // Create dataset - create new array reference to ensure change detection
          // Green color for finalized tasks
          const backgroundColorArray = newDailyCounts.map((count, index) => {
            // Future days should be empty/transparent
            if (isCurrentMonth && index + 1 > currentDay) {
              return 'rgba(255, 255, 255, 0.1)';
            }
            // Days with activities - green color for finalized tasks
            if (count > 0) {
              return 'rgba(34, 197, 94, 0.6)'; // Green with transparency
            }
            // Days without activities (past)
            return 'rgba(255, 255, 255, 0.05)';
          });

          const borderColorArray = newDailyCounts.map((count, index) => {
            if (isCurrentMonth && index + 1 > currentDay) {
              return 'rgba(255, 255, 255, 0.1)';
            }
            if (count > 0) {
              return 'rgba(34, 197, 94, 1)'; // Green for finalized tasks
            }
            return 'rgba(255, 255, 255, 0.1)';
          });

          // Create new array reference for datasets
          this.chartDatasets = [{
            label: this.chartDatasetActivityPlural(),
            data: [...newDailyCounts], // Create new array reference with actual data
            backgroundColor: backgroundColorArray,
            borderColor: borderColorArray,
            borderWidth: 1
          }];

          this.isLoadingChart = false;
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          console.error('Error loading chart data:', err);
          // Initialize empty chart on error
          this.chartLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
          this.chartDatasets = [{
            label: this.chartDatasetActivityPlural(),
            data: dailyCounts,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1
          }];
          this.isLoadingChart = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** Gráfico diário a partir de `activityItems` já carregados (GET `/user-action`). */
  private loadChartDataFromActivityItems(): void {
    const targetMonth = this.month || new Date();
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;
    const newDailyCounts: number[] = Array.from({ length: daysInMonth }, () => 0);

    this.activityItems.forEach(item => {
      if (item.status && item.status !== 'finalizado') {
        return;
      }
      const entryDate = new Date(item.created);
      if (isNaN(entryDate.getTime())) {
        return;
      }
      if (
        entryDate.getFullYear() === year &&
        entryDate.getMonth() === month &&
        entryDate.getDate() >= 1 &&
        entryDate.getDate() <= daysInMonth
      ) {
        newDailyCounts[entryDate.getDate() - 1]++;
      }
    });

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

    this.chartDatasets = [{
      label: this.chartDatasetActivityPlural(),
      data: [...newDailyCounts],
      backgroundColor: backgroundColorArray,
      borderColor: borderColorArray,
      borderWidth: 1
    }];

    this.isLoadingChart = false;
    this.cdr.markForCheck();
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

  /**
   * Encurta rótulos de cliente/entrega para caber em coluna fixa (tooltip com texto completo no template).
   */
  abbreviateClientLabel(text: string | undefined | null, maxLength = 26): string {
    if (text == null) {
      return '';
    }
    const t = String(text).trim();
    if (t === '') {
      return '';
    }
    if (t.length <= maxLength) {
      return t;
    }
    const slice = t.slice(0, maxLength);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > Math.min(10, maxLength * 0.35) ? slice.slice(0, lastSpace) : slice.slice(0, maxLength - 1);
    const base = cut.trimEnd();
    return base.length > 0 ? `${base}…` : `${t.slice(0, maxLength - 1)}…`;
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
