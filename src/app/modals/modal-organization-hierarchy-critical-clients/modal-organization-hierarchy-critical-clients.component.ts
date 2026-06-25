import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import type { CriticalClientItem, CriticalClientsSummary } from '@model/game4u-api.model';
import {
  buildCriticalClientKpiChips,
  buildCriticalClientsListExportFilename,
  criticalClientHasOperationalIssues,
  CriticalClientKpiChip,
  downloadCriticalClientsExcel,
  formatCriticalClientRiskScore,
  getCriticalClientTagLabels,
  getCriticalClientTierClass,
  getCriticalClientTierLabel,
  getCriticalClientsFullList
} from '@services/org-hierarchy-critical-clients.mapper';
import { ToastService } from '@services/toast.service';

@Component({
  selector: 'modal-organization-hierarchy-critical-clients',
  templateUrl: './modal-organization-hierarchy-critical-clients.component.html',
  styleUrls: ['./modal-organization-hierarchy-critical-clients.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalOrganizationHierarchyCriticalClientsComponent {
  @Input() summary: CriticalClientsSummary | null = null;
  @Input() month = new Date();
  @Input() scopeLabel = '';

  @Output() closed = new EventEmitter<void>();
  @Output() clientDrillDown = new EventEmitter<CriticalClientItem>();

  search = '';
  isExporting = false;

  constructor(
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  get clients(): CriticalClientItem[] {
    return getCriticalClientsFullList(this.summary);
  }

  get kpiChips(): CriticalClientKpiChip[] {
    return buildCriticalClientKpiChips(this.summary);
  }

  get filteredClients(): CriticalClientItem[] {
    const query = this.search.trim().toLowerCase();
    if (!query) {
      return this.clients;
    }
    return this.clients.filter(client => {
      const haystack = [
        client.company_label,
        client.company_serve_key,
        ...getCriticalClientTagLabels(client)
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  get hasSearch(): boolean {
    return this.search.trim().length > 0;
  }

  close(): void {
    this.closed.emit();
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.cdr.markForCheck();
  }

  tierLabel(client: CriticalClientItem): string {
    return getCriticalClientTierLabel(client.risk_tier);
  }

  tierClass(client: CriticalClientItem): string {
    return getCriticalClientTierClass(client.risk_tier);
  }

  tagsLabel(client: CriticalClientItem): string {
    return getCriticalClientTagLabels(client).join(', ') || '—';
  }

  riskScore(client: CriticalClientItem): string {
    return formatCriticalClientRiskScore(client.risk_score);
  }

  hasIssues(client: CriticalClientItem): boolean {
    return criticalClientHasOperationalIssues(client);
  }

  trackByClient(_index: number, client: CriticalClientItem): string {
    return client.company_serve_key || client.company_label;
  }

  onClientClick(client: CriticalClientItem): void {
    this.clientDrillDown.emit(client);
  }

  exportExcel(): void {
    if (this.isExporting) {
      return;
    }
    const clients = this.filteredClients;
    if (clients.length === 0) {
      this.toastService.error('Nenhum cliente para exportar.', false);
      return;
    }

    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const filename = buildCriticalClientsListExportFilename({
        month: this.month,
        scopeLabel: this.scopeLabel
      });
      downloadCriticalClientsExcel({
        filename,
        chips: this.kpiChips,
        clients
      });
      this.toastService.success(
        `Arquivo exportado (${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}).`
      );
    } catch {
      this.toastService.error('Falha ao exportar clientes críticos.', false);
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }
}
