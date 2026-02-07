import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, map, catchError } from 'rxjs/operators';
import { ActionLogService, ActivityListItem, ProcessListItem, ActionLogEntry } from '@services/action-log.service';
import { ChartDataset } from '@model/gamification-dashboard.model';

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

  constructor(
    private actionLogService: ActionLogService,
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
      this.cdr.markForCheck();
      return;
    }

    if (this.isActivityList) {
      // Load activities for all player IDs in parallel
      const activityRequests = playerIds.map(playerId =>
        this.actionLogService.getActivityList(playerId, this.month).pipe(
          catchError(error => {
            console.error(`Error loading activity list for player ${playerId}:`, error);
            return of([] as ActivityListItem[]);
          })
        )
      );

      forkJoin(activityRequests)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (results: ActivityListItem[][]) => {
            // Aggregate all activities from all players
            this.activityItems = results.flat();
            // Sort by created date (newest first)
            this.activityItems.sort((a, b) => b.created - a.created);
            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: (err: Error) => {
            console.error('Error loading activity lists:', err);
            this.activityItems = [];
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
      
      // Load chart data for activities
      this.loadChartData();
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
          next: (results: ProcessListItem[][]) => {
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

    console.log('📊 Loading chart data for month:', year, month + 1, 'Days in month:', daysInMonth, 'Current day:', currentDay);

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
          
          console.log('📊 Action log entries received:', allActionLogEntries);
          console.log('📊 Total entries:', allActionLogEntries.length);
          
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

            // Check if entry is in the target month
            if (entryYear === year && entryMonth === month && entryDay >= 1 && entryDay <= daysInMonth) {
              newDailyCounts[entryDay - 1]++;
            }
          });

          console.log('📊 Daily counts array:', newDailyCounts);
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
            label: 'Tarefas',
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
            label: 'Tarefas',
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
      console.error('Invalid delivery_id:', deliveryId);
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
   * Get company display name from CNPJ
   * Extracts the company name part before " l " separator
   */
  getCompanyDisplayName(cnpj: string | undefined): string {
    if (!cnpj) return '';
    // Extract text before " l " separator (e.g., "SAFETEC INFORMATICA LTDA [299|0001-69]" -> "SAFETEC INFORMATICA LTDA")
    const match = cnpj.match(/^([^l]+)/);
    return match ? match[1].trim() : cnpj;
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
