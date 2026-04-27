import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil, switchMap, map } from 'rxjs/operators';
import { ActionLogService, ClienteActionItem } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';

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
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name
  cnpjStatusMap = new Map<string, string>(); // Map of CNPJ → status (Ativa/Inativa)

  constructor(
    private actionLogService: ActionLogService,
    private companyKpiService: CompanyKpiService,
    private cnpjLookupService: CnpjLookupService,
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
          
          // Extract all CNPJ strings for lookup
          const cnpjList = clientes.map(c => c.cnpj);
          
          // Enrich CNPJs with clean company names, status, and KPI data in parallel
          return forkJoin({
            enrichedClientes: this.companyKpiService.enrichCompaniesWithKpis(clientes),
            cnpjInfo: this.cnpjLookupService.enrichCnpjListFull(cnpjList)
          });
        }),
        map(({ enrichedClientes, cnpjInfo }) => {
          // Store the CNPJ name and status maps for display
          const nameMap = new Map<string, string>();
          cnpjInfo.forEach((info, key) => {
            nameMap.set(key, info.empresa);
            if (info.status) {
              this.cnpjStatusMap.set(key, info.status);
            }
          });
          this.cnpjNameMap = nameMap;
          console.log('📊 Modal: Stored cnpjNameMap:', this.cnpjNameMap.size, 'entries, statusMap:', this.cnpjStatusMap.size, 'entries');
          return enrichedClientes;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enrichedClientes) => {
          console.log('📊 Modal carteira clientes enriched with KPI data:', enrichedClientes);
          console.log('📊 CNPJ name map:', this.cnpjNameMap);
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

    const singlePlayer =
      this.playerId && !this.playerId.includes(',') ? this.playerId.trim() : undefined;
    this.actionLogService.getActionsByCnpj(cnpj, this.month, singlePlayer ? { userId: singlePlayer } : undefined)
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
   * Get clean company display name from CNPJ
   * Uses the enriched CNPJ name map from the lookup service
   */
  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    const displayName = this.cnpjNameMap.get(cnpj);
    return displayName || cnpj;
  }

  getClienteCarteiraDisplayName(cliente: CompanyDisplay): string {
    const t = cliente.delivery_title?.trim();
    if (t) {
      return t;
    }
    return this.getCompanyDisplayName(cliente.cnpj);
  }

  getCompanyStatus(cnpj: string): string {
    return this.cnpjStatusMap.get(cnpj) || '';
  }

  isCompanyActive(cnpj: string): boolean {
    return this.cnpjStatusMap.get(cnpj)?.toLowerCase() === 'ativa';
  }
}
