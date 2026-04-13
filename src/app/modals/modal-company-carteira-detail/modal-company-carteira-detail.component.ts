import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActionLogService, ClienteActionItem } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { KPIService } from '@services/kpi.service';
import { ChartDataset, KPIData } from '@model/gamification-dashboard.model';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { UserActionDashboardService } from '@services/user-action-dashboard.service';
import { firstValueFrom, Observable, of } from 'rxjs';

@Component({
  selector: 'modal-company-carteira-detail',
  templateUrl: './modal-company-carteira-detail.component.html',
  styleUrls: ['./modal-company-carteira-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalCompanyCarteiraDetailComponent implements OnInit, OnDestroy {
  @Input() company: CompanyDisplay | null = null;
  @Input() month?: Date;
  /**
   * Jogador cujas ações alimentam GET `/game/actions?user=` para esta entrega.
   * Se omitido, usa o utilizador da sessão (legado).
   */
  @Input() actionContextPlayerId: string | null = null;
  /**
   * Vários jogadores (ex.: todos os membros do time na gestão de equipa) — agrega atividades da mesma `deliveryId`.
   */
  @Input() actionContextPlayerIds: string[] | null = null;
  /**
   * Legado; o detalhe da entrega usa GET `/user-action/search` por `deliveryId` (não envia `team`).
   */
  @Input() teamIdForDeliveryActions: string | null = null;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  isLoadingTasks = false;
  companyKPIs: KPIData[] = [];
  tasks: ClienteActionItem[] = [];
  filteredTasks: ClienteActionItem[] = [];
  chartLabels: string[] = [];
  chartDatasets: ChartDataset[] = [];
  searchTerm = '';
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name

  constructor(
    private actionLogService: ActionLogService,
    private companyKpiService: CompanyKpiService,
    private kpiService: KPIService,
    private cnpjLookupService: CnpjLookupService,
    private cdr: ChangeDetectorRef,
    private sessao: SessaoProvider,
    private userActionDashboard: UserActionDashboardService
  ) {}

  /** Coluna de pontos por tarefa: apenas admin / gestor (supervisor). */
  get showTaskPointsForGestor(): boolean {
    return Boolean(this.sessao.isAdmin() || this.sessao.isGerente());
  }

  ngOnInit(): void {
    if (this.company) {
      // Enrich company name from CNPJ
      this.enrichCompanyName();
      this.loadCompanyData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async enrichCompanyName(): Promise<void> {
    if (!this.company) return;
    
    try {
      const cnpjNames = await firstValueFrom(
        this.cnpjLookupService.enrichCnpjList([this.company.cnpj])
          .pipe(takeUntil(this.destroy$))
      );
      this.cnpjNameMap = cnpjNames;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error enriching company name:', error);
    }
  }

  private loadCompanyData(): void {
    if (!this.company) return;

    this.isLoading = true;
    this.cdr.markForCheck();

    // Load company KPIs - try to get all KPIs from company service
    if (this.company.cnpjId) {
      this.kpiService.getCompanyKPIs(this.company.cnpjId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (kpis) => {
            this.companyKPIs = kpis && kpis.length > 0 ? kpis : [];
            // If no KPIs from service, use deliveryKpi if available
            if (this.companyKPIs.length === 0 && this.company && this.company.deliveryKpi) {
              this.companyKPIs = [this.company.deliveryKpi];
            }
            this.isLoading = false;
            this.cdr.markForCheck();
          },
          error: (error) => {
            console.error('Error loading company KPIs:', error);
            // Fallback to deliveryKpi if available
            if (this.company && this.company.deliveryKpi) {
              this.companyKPIs = [this.company.deliveryKpi];
            } else {
              this.companyKPIs = [];
            }
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
    } else {
      // If no cnpjId, use deliveryKpi if available
      if (this.company.deliveryKpi) {
        this.companyKPIs = [this.company.deliveryKpi];
      } else {
        this.companyKPIs = [];
      }
      this.isLoading = false;
      this.cdr.markForCheck();
    }

    // Load tasks
    this.loadTasks();
  }

  private loadTasks(): void {
    if (!this.company) return;

    this.isLoadingTasks = true;
    this.cdr.markForCheck();

    const month = this.month || new Date();

    let tasks$: Observable<ClienteActionItem[]>;

    if (this.company.deliveryId) {
      tasks$ = this.userActionDashboard.getDeliveryDetailActionsFromUserActionSearch(
        this.company.deliveryId,
        month
      );
    } else {
      tasks$ = this.actionLogService.getActionsByCnpj(this.company.cnpj, this.month);
    }

    tasks$.pipe(takeUntil(this.destroy$)).subscribe({
      next: tasks => {
        this.tasks = tasks;
        this.filterTasks();
        this.rebuildTaskDailyChart();
        this.isLoadingTasks = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading tasks:', error);
        this.tasks = [];
        this.filteredTasks = [];
        this.rebuildTaskDailyChart();
        this.isLoadingTasks = false;
        this.cdr.markForCheck();
      }
    });
  }

  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    // Use the enriched name from the map, fallback to original
    const displayName = this.cnpjNameMap.get(cnpj);
    return displayName || cnpj;
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm = value;
    this.filterTasks();
    this.cdr.markForCheck();
  }

  /**
   * Tarefas finalizadas por dia no mês selecionado (mesma lógica do modal de lista de progresso).
   */
  private rebuildTaskDailyChart(): void {
    const targetMonth = this.month || new Date();
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;
    const newDailyCounts: number[] = Array.from({ length: daysInMonth }, () => 0);

    for (const task of this.tasks) {
      if (task.status === 'pendente' || task.status === 'dispensado') {
        continue;
      }
      const entryDate = new Date(task.created);
      if (isNaN(entryDate.getTime())) {
        continue;
      }
      if (
        entryDate.getFullYear() === year &&
        entryDate.getMonth() === month &&
        entryDate.getDate() >= 1 &&
        entryDate.getDate() <= daysInMonth
      ) {
        newDailyCounts[entryDate.getDate() - 1]++;
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

  private filterTasks(): void {
    const search = (this.searchTerm || '').trim().toLowerCase();
    if (!search) {
      this.filteredTasks = [...this.tasks];
      return;
    }
    this.filteredTasks = this.tasks.filter(task => {
      const title = (task.title || '').toLowerCase();
      const executor = (task.player || '').toLowerCase();
      const dateText = this.formatDate(task.created).toLowerCase();
      const statusLabel = this.getStatusLabel(task.status).toLowerCase();
      return (
        title.includes(search) ||
        executor.includes(search) ||
        dateText.includes(search) ||
        statusLabel.includes(search)
      );
    });
  }

  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusLabel(status?: string): string {
    switch (status) {
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

  getStatusClass(status?: string): string {
    switch (status) {
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

  /**
   * Format email to name (e.g., "maria.luisa@bwa.global" -> "Maria Luisa")
   */
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

  onClose(): void {
    this.closed.emit();
  }
}

