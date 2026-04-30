import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, forkJoin, of, firstValueFrom } from 'rxjs';
import { takeUntil, map, catchError } from 'rxjs/operators';
import { ActionLogService, ActivityListItem, ProcessListItem } from '@services/action-log.service';
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

  /**
   * Linhas exibidas na tabela: com filtro em «Tarefas finalizadas», lista completa nos demais tipos.
   */
  get displayedActivityItems(): ActivityListItem[] {
    if (this.listType !== 'atividades') {
      return this.activityItems;
    }
    const q = this.activitySearchQuery.trim().toLowerCase();
    if (!q) {
      return this.activityItems;
    }
    return this.activityItems.filter(item => this.activityMatchesSearch(item, q));
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
    const formatted = this.formatDate(item.created).toLowerCase();
    if (formatted.includes(qLower)) {
      return true;
    }
    const dateOnly = new Date(item.created).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).toLowerCase();
    if (dateOnly.includes(qLower)) {
      return true;
    }
    const digits = qLower.replace(/\D/g, '');
    if (digits.length >= 2) {
      const dateDigits = dateOnly.replace(/\D/g, '');
      if (dateDigits.includes(digits)) {
        return true;
      }
      const fullDigits = formatted.replace(/\D/g, '');
      if (fullDigits.includes(digits)) {
        return true;
      }
    }
    return false;
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
      this.isLoadingChart = true;
      // Load activities for all player IDs in parallel
      const activityRequests = playerIds.map(playerId =>
        this.actionLogService.getActivityList(
          playerId,
          this.month,
          this.listType === 'atividades' ? 'DONE' : undefined
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

            // Sort by created date (newest first)
            this.activityItems.sort((a, b) => b.created - a.created);

            // Gráfico: mesma base da tabela (uma linha por user-action / action_log já mapeada em getActivityList)
            this.applyChartFromActivityItems(this.activityItems);

            // Enrich CNPJ names
            await this.enrichCnpjNames(this.activityItems.map(item => item.cnpj).filter(cnpj => cnpj));

            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: (err: Error) => {
            console.error('Error loading activity lists:', err);
            this.activityItems = [];
            this.applyChartFromActivityItems([]);
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
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
   */
  private applyChartFromActivityItems(items: ActivityListItem[]): void {
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
