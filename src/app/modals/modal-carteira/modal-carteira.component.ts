import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, switchMap, map } from 'rxjs/operators';
import { ActionLogService, ClienteActionItem } from '@services/action-log.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { UserActionDashboardService } from '@services/user-action-dashboard.service';

@Component({
  selector: 'modal-carteira',
  templateUrl: './modal-carteira.component.html',
  styleUrls: ['./modal-carteira.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalCarteiraComponent implements OnInit, OnDestroy {
  @Input() playerId = '';
  @Input() month?: Date;
  @Input() useBackendUserActions = false;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  clientes: CompanyDisplay[] = [];
  /** Chave da linha expandida (entrega ou cliente legado). */
  selectedListRowKey: string | null = null;
  selectedClienteActions: ClienteActionItem[] = [];
  isLoadingActions = false;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ → clean empresa name

  constructor(
    private actionLogService: ActionLogService,
    private companyKpiService: CompanyKpiService,
    private cnpjLookupService: CnpjLookupService,
    private userActionDashboard: UserActionDashboardService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadClientes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private playerIdsFromInput(): string[] {
    return (this.playerId || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private mergeCarteiraByDelivery(rows: CompanyDisplay[]): CompanyDisplay[] {
    const map = new Map<string, CompanyDisplay>();
    for (const r of rows) {
      const key = ((r.deliveryId || r.cnpj || '') as string).trim() || r.cnpj;
      const existing = map.get(key);
      if (existing) {
        existing.actionCount += r.actionCount;
        if (!existing.deliveryId && r.deliveryId) {
          existing.deliveryId = r.deliveryId;
        }
        if (!existing.deliveryTitle?.trim() && r.deliveryTitle?.trim()) {
          existing.deliveryTitle = r.deliveryTitle;
        }
      } else {
        map.set(key, { ...r });
      }
    }
    return [...map.values()].sort((a, b) => b.actionCount - a.actionCount);
  }

  /** Evita colisão entre id de entrega e texto de cliente no modo legado. */
  getClienteRowKey(cliente: CompanyDisplay): string {
    if (this.useBackendUserActions && (cliente.deliveryId || '').trim()) {
      return `d:${(cliente.deliveryId || '').trim()}`;
    }
    return `c:${cliente.cnpj}`;
  }

  getClientePrimaryLabel(cliente: CompanyDisplay): string {
    if (this.useBackendUserActions && cliente.deliveryId) {
      const title = (cliente.deliveryTitle || '').trim();
      if (title) {
        return title;
      }
      return this.getCompanyDisplayName(cliente.cnpj);
    }
    return this.getCompanyDisplayName(cliente.cnpj);
  }

  private loadClientes(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    const month = this.month || new Date();
    const idList = this.playerIdsFromInput();

    const pipeline$ = this.useBackendUserActions
      ? (idList.length <= 1
          ? this.userActionDashboard.getCarteiraEnriched(idList[0] || this.playerId, month)
          : forkJoin(idList.map(id => this.userActionDashboard.getCarteiraEnriched(id, month))).pipe(
              map(arrays => this.mergeCarteiraByDelivery(arrays.flat()))
            )
        ).pipe(
          switchMap(enrichedClientes => {
            const cnpjList = enrichedClientes.map(c => c.cnpj);
            if (cnpjList.length === 0) {
              this.cnpjNameMap = new Map();
              return of(enrichedClientes);
            }
            return this.cnpjLookupService.enrichCnpjList(cnpjList).pipe(
              map(names => {
                this.cnpjNameMap = names;
                return enrichedClientes;
              })
            );
          })
        )
      : this.actionLogService.getPlayerCnpjListWithCount(this.playerId, this.month).pipe(
          switchMap(clientes => {
            const cnpjList = clientes.map(c => c.cnpj);
            return forkJoin({
              enrichedClientes: this.companyKpiService.enrichCompaniesWithKpis(clientes),
              cnpjNames: this.cnpjLookupService.enrichCnpjList(cnpjList)
            });
          }),
          map(({ enrichedClientes, cnpjNames }) => {
            this.cnpjNameMap = cnpjNames;
            return enrichedClientes;
          })
        );

    pipeline$.pipe(takeUntil(this.destroy$)).subscribe({
      next: enrichedClientes => {
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

  selectCliente(cliente: CompanyDisplay): void {
    const key = this.getClienteRowKey(cliente);
    if (this.selectedListRowKey === key) {
      this.selectedListRowKey = null;
      this.selectedClienteActions = [];
      this.cdr.markForCheck();
      return;
    }

    this.selectedListRowKey = key;
    this.isLoadingActions = true;
    this.selectedClienteActions = [];
    this.cdr.markForCheck();

    const month = this.month || new Date();
    const ids = this.playerIdsFromInput();
    const actions$ =
      this.useBackendUserActions && (cliente.deliveryId || '').trim()
        ? ids.length <= 1
          ? this.userActionDashboard.getClienteActionsForDelivery(
              ids[0] || this.playerId,
              String(cliente.deliveryId).trim(),
              month
            )
          : this.userActionDashboard.getClienteActionsForDeliveryForPlayers(
              ids,
              String(cliente.deliveryId).trim(),
              month
            )
        : this.actionLogService.getActionsByCnpj(cliente.cnpj, this.month);

    actions$.pipe(takeUntil(this.destroy$)).subscribe({
      next: actions => {
        this.selectedClienteActions = actions;
        this.isLoadingActions = false;
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        console.error('Error loading actions for carteira row:', err);
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
    return displayName || cnpj;
  }
}
