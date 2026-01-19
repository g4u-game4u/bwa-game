import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActionLogService, ClienteListItem, ClienteActionItem } from '@services/action-log.service';

@Component({
  selector: 'modal-carteira',
  templateUrl: './modal-carteira.component.html',
  styleUrls: ['./modal-carteira.component.scss']
})
export class ModalCarteiraComponent implements OnInit, OnDestroy {
  @Input() playerId = '';
  @Input() month?: Date;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  clientes: ClienteListItem[] = [];
  selectedCnpj: string | null = null;
  selectedClienteActions: ClienteActionItem[] = [];

  constructor(private actionLogService: ActionLogService) {}

  ngOnInit(): void {
    this.loadClientes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadClientes(): void {
    this.isLoading = true;
    
    this.actionLogService.getCarteiraClientes(this.playerId, this.month)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (clientes: ClienteListItem[]) => {
          this.clientes = clientes;
          this.isLoading = false;
        },
        error: (err: Error) => {
          console.error('Error loading carteira:', err);
          this.isLoading = false;
        }
      });
  }

  selectCliente(cnpj: string): void {
    if (this.selectedCnpj === cnpj) {
      this.selectedCnpj = null;
      this.selectedClienteActions = [];
      return;
    }

    this.selectedCnpj = cnpj;
    const cliente = this.clientes.find(c => c.cnpj === cnpj);
    this.selectedClienteActions = cliente?.actions || [];
  }

  onClose(): void {
    this.closed.emit();
  }

  formatDate(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatCnpj(cnpj: string): string {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
}
