import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { OrgHierarchyExportJobService } from '@services/org-hierarchy-export-job.service';
import { OrgHierarchyExportJob } from '@model/org-hierarchy-export-job.model';

@Component({
  selector: 'c4u-org-hierarchy-export-jobs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './c4u-org-hierarchy-export-jobs.component.html',
  styleUrls: ['./c4u-org-hierarchy-export-jobs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uOrgHierarchyExportJobsComponent implements OnInit, OnDestroy {
  jobs: OrgHierarchyExportJob[] = [];
  collapsed = false;

  private subscription?: Subscription;

  constructor(
    private readonly exportJobService: OrgHierarchyExportJobService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscription = this.exportJobService.jobs$.subscribe(() => {
      this.jobs = this.exportJobService.visibleJobs;
      this.cdr.markForCheck();
    });
    this.jobs = this.exportJobService.visibleJobs;
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get activeCount(): number {
    return this.jobs.filter(job => job.status === 'queued' || job.status === 'processing').length;
  }

  get hasJobs(): boolean {
    return this.jobs.length > 0;
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    this.cdr.markForCheck();
  }

  dismiss(job: OrgHierarchyExportJob): void {
    this.exportJobService.dismissJob(job.localId);
  }

  statusLabel(job: OrgHierarchyExportJob): string {
    if (job.phaseLabel) {
      return job.phaseLabel;
    }
    switch (job.status) {
      case 'queued':
        return 'Na fila';
      case 'processing':
        return 'Processando…';
      case 'completed':
        return 'Concluído';
      case 'failed':
        return 'Falhou';
      case 'cancelled':
        return 'Cancelado';
      default:
        return job.status;
    }
  }

  progressWidth(job: OrgHierarchyExportJob): string {
    if (job.progressPct == null) {
      return '35%';
    }
    return `${Math.min(100, Math.max(0, job.progressPct))}%`;
  }

  isIndeterminate(job: OrgHierarchyExportJob): boolean {
    return job.progressPct == null && (job.status === 'queued' || job.status === 'processing');
  }

  trackByLocalId(_index: number, job: OrgHierarchyExportJob): string {
    return job.localId;
  }
}
