import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
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
    
    // Fetch CNPJs assigned to this player (by player actions in action_log time window),
    // but use GLOBAL executor-independent counts for the "tarefas" label.
    this.actionLogService.getPlayerCnpjList(this.playerId, this.month)
      .pipe(
        switchMap((cnpjList: string[]) => {
          const normalized = (cnpjList || []).filter(Boolean);
          if (normalized.length === 0) {
            return of({ enrichedClientes: [], cnpjNames: new Map<string, string>() });
          }

          return forkJoin({
            globalCounts: this.actionLogService.getCnpjListWithCountForAllExecutors(normalized, this.month),
            cnpjNames: this.cnpjLookupService.enrichCnpjList(normalized)
          }).pipe(
            switchMap(({ globalCounts, cnpjNames }) =>
              this.companyKpiService.enrichCompaniesWithKpis(globalCounts).pipe(
                map(enrichedClientes => ({ enrichedClientes, cnpjNames }))
              )
            )
          );
        }),
        map(({ enrichedClientes, cnpjNames }) => {
          this.cnpjNameMap = cnpjNames;
          return enrichedClientes;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enrichedClientes) => {
                              this.clientes = enrichedClientes;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
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
                    this.selectedClienteActions = actions;
          this.isLoadingActions = false;
          this.cdr.markForCheck();
        },
        error: (err: Error) => {
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
    // Use the enriched name from the map, fallback to original
    const displayName = this.cnpjNameMap.get(cnpj);
    console.log('📊 getCompanyDisplayName called:', { cnpj, displayName, hasInMap: this.cnpjNameMap.has(cnpj), mapSize: this.cnpjNameMap.size });
    return displayName || cnpj;
  }
}



