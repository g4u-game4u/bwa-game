import { Component, Input, Output, EventEmitter, OnInit, ViewChild } from '@angular/core';
import { C4uModalComponent } from '@components/c4u-modal/c4u-modal.component';
import { Company, CompanyDetails, Process } from '@model/gamification-dashboard.model';
import { CompanyService } from '@services/company.service';

@Component({
  selector: 'modal-company-detail',
  templateUrl: './modal-company-detail.component.html',
  styleUrls: ['./modal-company-detail.component.scss']
})
export class ModalCompanyDetailComponent implements OnInit {
  @ViewChild(C4uModalComponent)
  private modal: C4uModalComponent | null = null;

  @Input()
  company: Company | undefined;
  
  @Output()
  closed = new EventEmitter<void>();

  companyDetails: CompanyDetails | undefined;
  selectedTab: number = 0;
  isLoading: boolean = false;

  private readonly tabDescriptions: string[] = [
    'São processos com atividades pendentes, minhas ou de outros colaboradores',
    'Atividades que foram concluídas com sucesso',
    'Macros que foram finalizadas completamente'
  ];

  constructor(private companyService: CompanyService) {}

  ngOnInit(): void {
    if (this.company) {
      this.loadCompanyDetails();
    }
  }

  loadCompanyDetails(): void {
    if (!this.company) return;

    this.isLoading = true;
    this.companyService.getCompanyDetails(this.company.id).subscribe({
      next: (details) => {
        this.companyDetails = details;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading company details:', error);
        this.isLoading = false;
      }
    });
  }

  selectTab(tabIndex: number): void {
    this.selectedTab = tabIndex;
  }

  getTabDescription(): string {
    return this.tabDescriptions[this.selectedTab] || '';
  }

  get currentTabProcesses(): Process[] {
    if (!this.companyDetails) return [];

    switch (this.selectedTab) {
      case 0: // Macros incompletas
        return this.companyDetails.processes.filter(
          p => p.status === 'pending' || p.status === 'in-progress'
        );
      case 1: // Atividades finalizadas
        // For activities, we'll show completed processes with their completed tasks
        return this.companyDetails.processes.filter(
          p => p.tasks.some(t => t.status === 'completed')
        ).map(p => ({
          ...p,
          tasks: p.tasks.filter(t => t.status === 'completed')
        }));
      case 2: // Macros finalizadas
        return this.companyDetails.processes.filter(
          p => p.status === 'completed'
        );
      default:
        return [];
    }
  }

  close(): void {
    if (this.modal) {
      this.modal.close();
    }
    this.closed.emit();
  }
  
  onModalClosed(): void {
    this.closed.emit();
  }
}
