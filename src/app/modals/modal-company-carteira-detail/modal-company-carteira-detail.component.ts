import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActionLogService, ClienteActionItem } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
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
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  isLoadingTasks = false;
  companyKPIs: KPIData[] = [];
  tasks: ClienteActionItem[] = [];
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name

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
    
    try {
      // Use cnpjId (raw CNPJ ID) for lookup, not cnpj (display name)
      const cnpjForLookup = this.company.cnpjId || this.company.cnpj;
      console.log('📊 Modal detail: enriching company name for:', cnpjForLookup);
      
      const cnpjNames = await firstValueFrom(
        this.cnpjLookupService.enrichCnpjList([cnpjForLookup])
          .pipe(takeUntil(this.destroy$))
      );
      this.cnpjNameMap = cnpjNames;
      console.log('📊 Modal detail: CNPJ name map loaded with', this.cnpjNameMap.size, 'entries');
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

    // Use cnpjId (raw CNPJ ID) for action_log queries, not cnpj (display name)
    const cnpjForQuery = this.company.cnpjId || this.company.cnpj;
    console.log('📊 Loading tasks for CNPJ:', cnpjForQuery, '(cnpjId:', this.company.cnpjId, ', cnpj:', this.company.cnpj, ')');

    this.actionLogService.getActionsByCnpj(cnpjForQuery, this.month)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks) => {
          console.log('📊 Tasks loaded for company:', tasks);
          this.tasks = tasks;
          this.isLoadingTasks = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading tasks:', error);
          this.tasks = [];
          this.isLoadingTasks = false;
          this.cdr.markForCheck();
        }
      });
  }

  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    
    // First try to get from the name map using cnpjId (raw CNPJ ID)
    if (this.company?.cnpjId) {
      const displayName = this.cnpjNameMap.get(this.company.cnpjId);
      if (displayName) {
        console.log('📊 Modal detail getCompanyDisplayName: found via cnpjId:', displayName);
        return displayName;
      }
    }
    
    // Try direct lookup (for backward compatibility)
    const displayName = this.cnpjNameMap.get(cnpj);
    if (displayName) {
      console.log('📊 Modal detail getCompanyDisplayName: found via direct lookup:', displayName);
      return displayName;
    }
    
    // Fallback: if cnpj is already the display name (from gamification-dashboard), return it
    console.log('📊 Modal detail getCompanyDisplayName: using fallback:', cnpj);
    return cnpj;
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

