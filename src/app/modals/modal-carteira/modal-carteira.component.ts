import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActionLogService, ClienteActionItem } from '@services/action-log.service';

interface CarteiraCliente {
  cnpj: string;
  actionCount: number;
}

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
  clientes: CarteiraCliente[] = [];
  selectedCnpj: string | null = null;
  selectedClienteActions: ClienteActionItem[] = [];
  isLoadingActions = false;

  constructor(
    private actionLogService: ActionLogService,
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
    
    // Only fetch CNPJs with count - don't fetch all actions yet
    this.actionLogService.getPlayerCnpjListWithCount(this.playerId, this.month)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (clientes) => {
          console.log('📊 Carteira clientes loaded:', clientes);
          this.clientes = clientes;
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
}
