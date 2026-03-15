import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject, of, forkJoin } from 'rxjs';
import { takeUntil, switchMap, catchError, map } from 'rxjs/operators';

import { ActionLogService, ActionLogEntry } from '@services/action-log.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { Company, KPIData } from '@model/gamification-dashboard.model';

/** CNPJ row data for Tab 1 */
export interface PlayerCnpjRow {
  cnpj: string;
  companyName: string;
  actionCount: number;
  kpis: KPIData[];
}

/** Action row data for Tab 2 */
export interface PlayerActionRow {
  actionName: string;
  companyCnpj: string;
  companyName: string;
  date: number;
  points: number;
}

@Component({
  selector: 'modal-player-detail',
  templateUrl: './modal-player-detail.component.html',
  styleUrls: ['./modal-player-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalPlayerDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /** Player ID to display details for */
  @Input() playerId = '';

  /** Player name for the modal title */
  @Input() playerName = '';

  /** Current month filter value (0 = current month, -1 = "Toda temporada") */
  @Input() monthsAgo = 0;

  /** Emitted when the modal is closed */
  @Output() closed = new EventEmitter<void>();

  /** Emitted when a CNPJ row is clicked, passing a Company object for the company detail modal */
  @Output() cnpjSelected = new EventEmitter<Company>();

  /** Active tab: 0 = CNPJs, 1 = Actions */
  selectedTab = 0;

  /** Loading states */
  isLoadingCnpjs = true;
  isLoadingActions = true;

  /** Tab 1: CNPJ rows */
  cnpjRows: PlayerCnpjRow[] = [];

  /** Tab 2: Action rows */
  actionRows: PlayerActionRow[] = [];

  /** Player KPIs for the header */
  playerKPIs: KPIData[] = [];

  constructor(
    private actionLogService: ActionLogService,
    private cnpjLookupService: CnpjLookupService,
    private playerService: PlayerService,
    private kpiService: KPIService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.playerId) {
      this.loadCnpjData();
      this.loadActionData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Get the month Date object from monthsAgo, or undefined for "Toda temporada" */
  private getMonthDate(): Date | undefined {
    if (this.monthsAgo === -1) return undefined;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - this.monthsAgo, 1);
  }

  /** Select a tab */
  selectTab(tabIndex: number): void {
    this.selectedTab = tabIndex;
  }

  /** Close the modal */
  close(): void {
    this.closed.emit();
  }

  /** Handle outside click on overlay */
  onOverlayClick(): void {
    this.close();
  }

  /**
   * Load Tab 1 data: CNPJs from cnpj_resp with per-CNPJ action counts and company names.
   */
  private loadCnpjData(): void {
    this.isLoadingCnpjs = true;
    this.cdr.markForCheck();

    const month = this.getMonthDate();

    // Get player's cnpj_resp from player status
    this.playerService.getRawPlayerData(this.playerId).pipe(
      takeUntil(this.destroy$),
      switchMap(playerData => {
        const cnpjRespStr: string = playerData?.extra?.cnpj_resp || '';
        const cnpjList = cnpjRespStr
          .split(/[;,]/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);

        if (cnpjList.length === 0) {
          return of({ cnpjList: [] as string[], nameMap: new Map<string, string>(), countMap: new Map<string, number>() });
        }

        // Fetch action counts per CNPJ and company names in parallel
        return forkJoin({
          nameMap: this.cnpjLookupService.enrichCnpjList(cnpjList),
          countList: this.actionLogService.getPlayerCnpjListWithCount(this.playerId, month)
        }).pipe(
          map(({ nameMap, countList }) => {
            const countMap = new Map<string, number>();
            countList.forEach(item => countMap.set(item.cnpj, item.actionCount));
            return { cnpjList, nameMap, countMap };
          })
        );
      }),
      catchError(() => of({ cnpjList: [] as string[], nameMap: new Map<string, string>(), countMap: new Map<string, number>() }))
    ).subscribe(({ cnpjList, nameMap, countMap }) => {
      this.cnpjRows = cnpjList.map(cnpj => ({
        cnpj,
        companyName: nameMap.get(cnpj) || cnpj,
        actionCount: countMap.get(cnpj) || 0,
        kpis: []
      }));

      this.isLoadingCnpjs = false;
      this.cdr.markForCheck();
    });
  }

  /**
   * Load Tab 2 data: All actions from Action_Log for this player.
   * Cross-references attributes.cnpj with empid_cnpj__c for company names.
   */
  private loadActionData(): void {
    this.isLoadingActions = true;
    this.cdr.markForCheck();

    const month = this.getMonthDate();

    this.actionLogService.getPlayerActionLogForMonth(this.playerId, month).pipe(
      takeUntil(this.destroy$),
      switchMap((actions: ActionLogEntry[]) => {
        if (actions.length === 0) {
          return of({ actions, nameMap: new Map<string, string>() });
        }

        // Collect unique CNPJs from actions for name resolution
        const uniqueCnpjs = [...new Set(
          actions
            .map(a => a.attributes?.cnpj)
            .filter((c): c is string => !!c)
        )];

        if (uniqueCnpjs.length === 0) {
          return of({ actions, nameMap: new Map<string, string>() });
        }

        return this.cnpjLookupService.enrichCnpjList(uniqueCnpjs).pipe(
          map(nameMap => ({ actions, nameMap })),
          catchError(() => of({ actions, nameMap: new Map<string, string>() }))
        );
      }),
      catchError(() => of({ actions: [] as ActionLogEntry[], nameMap: new Map<string, string>() }))
    ).subscribe(({ actions, nameMap }) => {
      this.actionRows = actions.map(a => {
        const cnpj = a.attributes?.cnpj || '';
        const time = a.time;
        let timestamp = 0;
        if (typeof time === 'number') {
          timestamp = time;
        } else if (time && typeof time === 'object' && '$date' in time) {
          timestamp = new Date((time as { $date: string }).$date).getTime();
        }

        return {
          actionName: a.attributes?.acao || a.actionId || 'Ação sem título',
          companyCnpj: cnpj,
          companyName: nameMap.get(cnpj) || cnpj || '—',
          date: timestamp,
          points: a.points || 0
        };
      });

      this.isLoadingActions = false;
      this.cdr.markForCheck();
    });
  }

  /**
   * Handle CNPJ row click — emit a Company object to open the company detail modal.
   */
  onCnpjRowClick(row: PlayerCnpjRow): void {
    const company: Company = {
      id: row.cnpj,
      name: row.companyName,
      cnpj: row.cnpj,
      healthScore: 0,
      kpis: row.kpis
    };
    this.cnpjSelected.emit(company);
  }

  /** Format a timestamp for display */
  formatDate(timestamp: number): string {
    if (!timestamp) return '—';
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR');
  }

  /** Track CNPJ rows by cnpj */
  trackByCnpj(_index: number, row: PlayerCnpjRow): string {
    return row.cnpj;
  }

  /** Track action rows by index (actions may not have unique IDs) */
  trackByIndex(index: number): number {
    return index;
  }
}
