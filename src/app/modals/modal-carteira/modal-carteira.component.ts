import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { ActionLogService, ClienteActionItem } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';

@Component({
  selector: 'modal-carteira',
  templateUrl: './modal-carteira.component.html',
  styleUrls: ['./modal-carteira.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalCarteiraComponent implements OnInit, OnDestroy {
  @Input() playerId = '';
  @Input() month?: Date;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  clientes: CompanyDisplay[] = [];
  selectedCnpj: string | null = null;
  selectedClienteActions: ClienteActionItem[] = [];
  isLoadingActions = false;

  constructor(
    private actionLogService: ActionLogService,
    private companyKpiService: CompanyKpiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadClientes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadClientes(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    
    // Fetch CNPJs with count and enrich with KPI data
    this.actionLogService.getPlayerCnpjListWithCount(this.playerId, this.month)
      .pipe(
        switchMap(clientes => {
          console.log('📊 Modal carteira clientes loaded, enriching with KPI data:', clientes);
          // Enrich companies with KPI data from cnpj__c collection
          return this.companyKpiService.enrichCompaniesWithKpis(clientes);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enrichedClientes) => {
          console.log('📊 Modal carteira clientes enriched with KPI data:', enrichedClientes);
          this.clientes = enrichedClientes;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          console.error('Error loading carteira:', err);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  selectCliente(cnpj: string): void {
    if (this.selectedCnpj === cnpj) {
      // Collapse if already selected
      this.selectedCnpj = null;
      this.selectedClienteActions = [];
      this.cdr.markForCheck();
      return;
    }

    this.selectedCnpj = cnpj;
    this.isLoadingActions = true;
    this.selectedClienteActions = [];
    this.cdr.markForCheck();

    // Now fetch all actions for this CNPJ (from all players)
    this.actionLogService.getActionsByCnpj(cnpj, this.month)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (actions) => {
          console.log('📊 Actions for CNPJ loaded:', actions);
          this.selectedClienteActions = actions;
          this.isLoadingActions = false;
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
          console.error('Error loading actions for CNPJ:', err);
          this.isLoadingActions = false;
          this.cdr.markForCheck();
        }
      });
  }

  onClose(): void {
    this.closed.emit();
  }

  formatDate(timestamp: number | { $date: string } | undefined): string {
    if (!timestamp) return '';
    
    // Handle Funifier's $date object format
    let dateValue: number | string;
    if (typeof timestamp === 'object' && '$date' in timestamp) {
      dateValue = timestamp.$date;
    } else {
      dateValue = timestamp;
    }
    
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /**
   * Extract company name from CNPJ string
   * Format: "COMPANY NAME l CODE [ID|SUFFIX]"
   * Returns: Company name without the code and ID parts
   */
  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    // Extract text before " l " separator
    const match = cnpj.match(/^([^l]+)/);
    return match ? match[1].trim() : cnpj;
  }
}
