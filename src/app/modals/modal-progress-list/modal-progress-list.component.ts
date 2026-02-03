import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActionLogService, ActivityListItem, ProcessListItem } from '@services/action-log.service';

export type ProgressListType = 'atividades' | 'pontos' | 'processos-pendentes' | 'processos-finalizados';

@Component({
  selector: 'modal-progress-list',
  templateUrl: './modal-progress-list.component.html',
  styleUrls: ['./modal-progress-list.component.scss']
})
export class ModalProgressListComponent implements OnInit, OnDestroy {
  @Input() playerId = '';
  @Input() listType: ProgressListType = 'atividades';
  @Input() month?: Date;
  @Output() closed = new EventEmitter<void>();

  private destroy$ = new Subject<void>();

  isLoading = true;
  activityItems: ActivityListItem[] = [];
  processoItems: ProcessListItem[] = [];

  constructor(
    private actionLogService: ActionLogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get modalTitle(): string {
    switch (this.listType) {
      case 'atividades':
        return 'Atividades Finalizadas';
      case 'pontos':
        return 'Pontos Obtidos';
      case 'processos-pendentes':
        return 'Processos Pendentes e Incompletos';
      case 'processos-finalizados':
        return 'Processos Finalizados';
      default:
        return 'Lista';
    }
  }

  get isActivityList(): boolean {
    return this.listType === 'atividades' || this.listType === 'pontos';
  }

  get isProcessList(): boolean {
    return this.listType === 'processos-pendentes' || this.listType === 'processos-finalizados';
  }

  private loadData(): void {
    this.isLoading = true;

    if (this.isActivityList) {
      this.actionLogService.getActivityList(this.playerId, this.month)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (items: ActivityListItem[]) => {
            this.activityItems = items;
            this.isLoading = false;
            this.cdr.detectChanges();
          },
          error: (err: Error) => {
            console.error('Error loading activity list:', err);
            this.isLoading = false;
            this.cdr.detectChanges();
          }
        });
    } else if (this.isProcessList) {
      this.actionLogService.getProcessList(this.playerId, this.month)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (items: ProcessListItem[]) => {
            // Filter based on list type
            if (this.listType === 'processos-finalizados') {
              this.processoItems = items.filter(p => p.isFinalized);
            } else {
              this.processoItems = items.filter(p => !p.isFinalized);
            }
            this.isLoading = false;
            this.cdr.detectChanges();
          },
          error: (err: Error) => {
            console.error('Error loading process list:', err);
            this.isLoading = false;
            this.cdr.detectChanges();
          }
        });
    }
  }

  onClose(): void {
    this.closed.emit();
  }

  formatDate(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
