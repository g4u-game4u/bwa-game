import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActionLogService, ClienteActionItem } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { isGame4uDataEnabled } from '@model/game4u-api.model';
import { KPIService } from '@services/kpi.service';
import { KPIData } from '@model/gamification-dashboard.model';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'modal-company-carteira-detail',
  templateUrl: './modal-company-carteira-detail.component.html',
  styleUrls: ['./modal-company-carteira-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalCompanyCarteiraDetailComponent implements OnInit, OnDestroy {
  @Input() company: CompanyDisplay | null = null;
  @Input() month?: Date;
  /** Quando definido, restringe o aggregate ao userId (carteira individual / colaborador). */
  @Input() actionLogUserId: string | null = null;
  /** Vista equipa sem colaborador: restringe aos jogadores do time (mesmo critério da carteira agregada). */
  @Input() actionLogTeamId: string | null = null;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  isLoadingTasks = false;
  companyKPIs: KPIData[] = [];
  tasks: ClienteActionItem[] = [];
  /** Total no servidor (GET actions-by-delivery paginado). */
  tasksTotal = 0;
  tasksOffset = 0;
  readonly tasksPageSizeFinishedReports = 25;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name
  companyStatus = ''; // Company status from empid_cnpj__c (e.g. "Ativa")

  constructor(
    private actionLogService: ActionLogService,
    private companyKpiService: CompanyKpiService,
    private kpiService: KPIService,
    private cnpjLookupService: CnpjLookupService,
    private cdr: ChangeDetectorRef
  ) {}

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
    if (this.company.loadTasksViaGameReports || this.company.cnpj.startsWith('g4u-rpt:')) {
      return;
    }

    try {
      const cnpjInfo = await firstValueFrom(
        this.cnpjLookupService.enrichCnpjListFull([this.company.cnpj])
          .pipe(takeUntil(this.destroy$))
      );
      const nameMap = new Map<string, string>();
      cnpjInfo.forEach((info, key) => {
        nameMap.set(key, info.empresa);
        if (info.status) {
          this.companyStatus = info.status;
        }
      });
      this.cnpjNameMap = nameMap;
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
    if (this.company.loadTasksViaGameReports || this.company.cnpj.startsWith('g4u-rpt:')) {
      this.companyKPIs = [];
      this.isLoading = false;
      this.cdr.markForCheck();
    } else if (this.company.cnpjId) {
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
    this.tasksTotal = 0;
    this.tasksOffset = 0;
    this.cdr.markForCheck();

    const uid = this.actionLogUserId?.trim() || undefined;
    const tid = !uid && this.actionLogTeamId?.trim() ? this.actionLogTeamId.trim() : undefined;
    const oneScope = (uid && !tid) || (!uid && tid);

    // Colaborador OU equipa agregada + Game4U + relatório finished: resposta paginada (`items` + `total`).
    if (oneScope && isGame4uDataEnabled() && this.company.loadTasksViaGameReports) {
      this.fetchParticipationModalTasksPage(true);
      return;
    }

    // Colaborador + Game4U (user-actions finalizadas no mês): igual ao painel de gamificação individual.
    if (uid && !tid && isGame4uDataEnabled()) {
      this.actionLogService
        .getGame4uUserActionsForParticipationModal(
          uid,
          {
            cnpj: this.company.cnpj,
            deliveryId: this.company.deliveryId,
            delivery_extra_cnpj: this.company.delivery_extra_cnpj,
            delivery_title: this.company.delivery_title,
            loadTasksViaGameReports: this.company.loadTasksViaGameReports
          },
          this.month
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: page => {
            this.tasks = page.items;
            this.tasksTotal = page.total;
            this.isLoadingTasks = false;
            this.cdr.markForCheck();
          },
          error: (error: unknown) => {
            console.error('Error loading tasks:', error);
            this.tasks = [];
            this.tasksTotal = 0;
            this.isLoadingTasks = false;
            this.cdr.markForCheck();
          }
        });
      return;
    }

    // Equipa (sem colaborador) + Game4U: mesmas user-actions finalizadas com `team_id` (não Funifier action_log).
    if (!uid && tid && isGame4uDataEnabled()) {
      this.actionLogService
        .getGame4uUserActionsForParticipationModal(
          'me',
          {
            cnpj: this.company.cnpj,
            deliveryId: this.company.deliveryId,
            delivery_extra_cnpj: this.company.delivery_extra_cnpj,
            delivery_title: this.company.delivery_title,
            loadTasksViaGameReports: this.company.loadTasksViaGameReports
          },
          this.month,
          undefined,
          tid
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: page => {
            this.tasks = page.items;
            this.tasksTotal = page.total;
            this.isLoadingTasks = false;
            this.cdr.markForCheck();
          },
          error: (error: unknown) => {
            console.error('Error loading tasks (team Game4U):', error);
            this.tasks = [];
            this.tasksTotal = 0;
            this.isLoadingTasks = false;
            this.cdr.markForCheck();
          }
        });
      return;
    }

    if (uid && !tid) {
      this.actionLogService
        .getUserActionsForCompanyUsingPlayerActionLog(uid, this.company.cnpj, this.month)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: tasks => {
            this.tasks = tasks;
            this.tasksTotal = tasks.length;
            this.isLoadingTasks = false;
            this.cdr.markForCheck();
          },
          error: (error: unknown) => {
            console.error('Error loading tasks:', error);
            this.tasks = [];
            this.tasksTotal = 0;
            this.isLoadingTasks = false;
            this.cdr.markForCheck();
          }
        });
      return;
    }

    this.actionLogService
      .getActionsByCnpj(this.company.cnpj, this.month, { userId: uid, teamId: tid })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: tasks => {
          this.tasks = tasks;
          this.tasksTotal = tasks.length;
          this.isLoadingTasks = false;
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error loading tasks:', error);
          this.tasks = [];
          this.tasksTotal = 0;
          this.isLoadingTasks = false;
          this.cdr.markForCheck();
        }
      });
  }

  private fetchParticipationModalTasksPage(resetOffset: boolean): void {
    if (!this.company) return;
    const uid = this.actionLogUserId?.trim();
    const tid = !uid && this.actionLogTeamId?.trim() ? this.actionLogTeamId.trim() : undefined;
    if (!uid && !tid) {
      this.isLoadingTasks = false;
      this.cdr.markForCheck();
      return;
    }
    if (resetOffset) {
      this.tasksOffset = 0;
    }
    this.isLoadingTasks = true;
    this.cdr.markForCheck();
    this.actionLogService
      .getGame4uUserActionsForParticipationModal(
        uid || 'me',
        {
          cnpj: this.company.cnpj,
          deliveryId: this.company.deliveryId,
          delivery_extra_cnpj: this.company.delivery_extra_cnpj,
          delivery_title: this.company.delivery_title,
          loadTasksViaGameReports: true
        },
        this.month,
        { offset: this.tasksOffset, limit: this.tasksPageSizeFinishedReports },
        tid
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: page => {
          this.tasks = page.items;
          this.tasksTotal = page.total;
          this.isLoadingTasks = false;
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          console.error('Error loading tasks (reports page):', err);
          this.tasks = [];
          this.tasksTotal = 0;
          this.isLoadingTasks = false;
          this.cdr.markForCheck();
        }
      });
  }

  get tasksPaginationLabel(): string {
    if (!this.company?.loadTasksViaGameReports || this.tasksTotal === 0) {
      return '';
    }
    const from = this.tasks.length === 0 ? 0 : this.tasksOffset + 1;
    const to = this.tasksOffset + this.tasks.length;
    return `${from}–${to} de ${this.tasksTotal}`;
  }

  get tasksCanGoPrev(): boolean {
    return !!this.company?.loadTasksViaGameReports && this.tasksOffset > 0;
  }

  get tasksCanGoNext(): boolean {
    return (
      !!this.company?.loadTasksViaGameReports &&
      this.tasksOffset + this.tasks.length < this.tasksTotal
    );
  }

  goTasksPrevPage(): void {
    if (!this.tasksCanGoPrev) return;
    this.tasksOffset = Math.max(0, this.tasksOffset - this.tasksPageSizeFinishedReports);
    this.fetchParticipationModalTasksPage(false);
  }

  goTasksNextPage(): void {
    if (!this.tasksCanGoNext) return;
    this.tasksOffset += this.tasksPageSizeFinishedReports;
    this.fetchParticipationModalTasksPage(false);
  }

  formatTaskPoints(task: ClienteActionItem): string {
    if (task.points == null || !Number.isFinite(task.points)) {
      return '—';
    }
    return String(task.points);
  }

  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    const displayName = this.cnpjNameMap.get(cnpj);
    return displayName || cnpj;
  }

  /** Título do modal: delivery_title (+ extra.cnpj) como na lista; senão nome CRM / chave. */
  getModalTitle(): string {
    if (!this.company) {
      return 'Detalhes da Empresa';
    }
    const t = this.company.delivery_title?.trim();
    const ec = this.company.delivery_extra_cnpj?.trim();
    if (t && ec) {
      return `${t} · ${ec}`;
    }
    if (t) {
      return t;
    }
    const name = this.getCompanyDisplayName(this.company.cnpj);
    return name || this.company.cnpj || 'Detalhes da Empresa';
  }

  get isCompanyActive(): boolean {
    return this.companyStatus?.toLowerCase() === 'ativa';
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

