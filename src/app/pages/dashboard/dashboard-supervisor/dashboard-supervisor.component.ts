import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, switchMap, catchError, map } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

import { ACLService, AclMetadata } from '@services/acl.service';
import { UserProfileService } from '@services/user-profile.service';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { FunifierApiService } from '@services/funifier-api.service';
import { ToastService } from '@services/toast.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { CompanyService } from '@services/company.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { Company, KPIData } from '@model/gamification-dashboard.model';

/** Client row data for the client list section */
export interface SupervisorClientRow {
  cnpj: string;
  companyName: string;
  kpis: KPIData[];
  healthScore: number;
}

/** View mode toggle for the main content area */
export type SupervisorViewMode = 'card' | 'table';

/** SUPERVISOR's own info card data */
export interface SupervisorInfoCard {
  name: string;
  points: number;
  coins: number;
  cnpjMetric: number;
  entregaMetric: number;
  cnpjGoal: number;
  entregaGoal: number;
}

/** Player card data for Card View / Table View */
export interface SupervisorPlayerCard {
  playerId: string;
  playerName: string;
  teams: string[];
  teamIds: string[];
  points: number;
  coins: number;
  cnpjMetric: number;
  entregaMetric: number;
  cnpjGoal: number;
  entregaGoal: number;
  kpis: KPIData[];
}

@Component({
  selector: 'app-dashboard-supervisor',
  templateUrl: './dashboard-supervisor.component.html',
  styleUrls: ['./dashboard-supervisor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardSupervisorComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /** Current view mode: card (default) or table */
  viewMode: SupervisorViewMode = 'card';

  /** Selected month filter (0 = current month, -1 = "Toda temporada") */
  selectedMonthsAgo = 0;

  /** Loading states */
  isLoading = true;
  isLoadingInfoCard = true;
  isLoadingPlayers = true;

  /** SUPERVISOR's own info card data */
  supervisorInfo: SupervisorInfoCard | null = null;

  /** SUPERVISOR's KPIs for the info card */
  supervisorKPIs: KPIData[] = [];

  /** Deduplicated player cards for Card View / Table View */
  playerCards: SupervisorPlayerCard[] = [];

  /** Player Detail Modal state */
  isPlayerDetailModalOpen = false;
  selectedPlayerForDetail: SupervisorPlayerCard | null = null;

  /** Company Detail Modal state (opened from CNPJ row in player detail) */
  isCompanyDetailModalOpen = false;
  selectedCompanyForDetail: Company | null = null;

  /** Team averages calculated from all players across accessible teams */
  averagePoints = 0;
  averageCnpjMetric = 0;
  averageEntregaMetric = 0;
  averageKPIs: KPIData[] = [];

  /** Client list data for the bottom section */
  clientRows: SupervisorClientRow[] = [];
  isLoadingClients = true;

  // Clientes sub-tabs
  clientesActiveTab: 'carteira' | 'participacao' = 'carteira';
  participacaoCnpjs: { cnpj: string; playerName: string; companyName: string }[] = [];
  isLoadingParticipacao = false;

  /** ACL metadata for resolving team display names */
  private aclMetadata: AclMetadata[] = [];

  constructor(
    private aclService: ACLService,
    private userProfileService: UserProfileService,
    private playerService: PlayerService,
    private kpiService: KPIService,
    private funifierApi: FunifierApiService,
    private toastService: ToastService,
    private cnpjLookupService: CnpjLookupService,
    private companyService: CompanyService,
    private sessaoProvider: SessaoProvider,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadSupervisorInfoCard();
    this.loadTeamPlayers();
    this.loadClientList();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Get the current SUPERVISOR's player ID from session */
  private getPlayerId(): string {
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    return (usuario?._id || usuario?.email || 'me') as string;
  }

  /** Load the SUPERVISOR's own info card data from player status */
  loadSupervisorInfoCard(): void {
    this.isLoadingInfoCard = true;
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();

    this.playerService.getRawPlayerData(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (playerData) => {
          const extra = playerData.extra || {};
          const pointCategories = playerData.point_categories || playerData.pointCategories || {};

          // SUPERVISOR reads pontos_supervisor for points (not points)
          const points = Number(pointCategories.pontos_supervisor) || 0;
          // Coins from coins field
          const coins = Number(pointCategories.coins) || 0;

          // Volume de clientes = quantidade de itens no array cnpj_resp do jogador
          const cnpjMetric = this.getCnpjRespCount(extra);
          const entregaMetric = extra.entrega_sup ? parseFloat(extra.entrega_sup) : 0;

          // Goals
          const cnpjGoal = extra.cnpj_goal != null ? Number(extra.cnpj_goal) : 100;
          const entregaGoal = extra.entrega_goal != null ? Number(extra.entrega_goal) : 90;

          this.supervisorInfo = {
            name: playerData.name || '',
            points,
            coins,
            cnpjMetric,
            entregaMetric,
            cnpjGoal,
            entregaGoal
          };

          // Build KPIs for the info card using SUPERVISOR-specific fields
          this.supervisorKPIs = this.buildSupervisorKPIs(cnpjMetric, cnpjGoal, entregaMetric, entregaGoal);

          this.isLoadingInfoCard = false;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading supervisor info card:', error);
          this.toastService.error('Erro ao carregar dados do supervisor');
          this.isLoadingInfoCard = false;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** Build KPI data for the SUPERVISOR's info card using _sup fields */
  private buildSupervisorKPIs(cnpjMetric: number, cnpjGoal: number, entregaMetric: number, entregaGoal: number): KPIData[] {
    const cnpjSuperTarget = Math.ceil(cnpjGoal * 1.5);

    return [
      {
        id: 'numero-empresas',
        label: 'Clientes na Carteira',
        current: cnpjMetric,
        target: cnpjGoal,
        superTarget: cnpjSuperTarget,
        unit: 'clientes',
        color: this.kpiService.getKPIColorByGoals(cnpjMetric, cnpjGoal, cnpjSuperTarget),
        percentage: cnpjGoal > 0 ? Math.min((cnpjMetric / cnpjSuperTarget) * 100, 100) : 0
      },
      {
        id: 'entregas-prazo',
        label: 'Entregas no Prazo',
        current: entregaMetric,
        target: entregaGoal,
        superTarget: 100,
        unit: '%',
        color: this.kpiService.getKPIColorByGoals(entregaMetric, entregaGoal, 100),
        percentage: Math.min(entregaMetric, 100)
      }
    ];
  }

  /**
   * Load players from all accessible teams, deduplicate, and build card data.
   * Uses ACLService to get accessible team IDs, then fetches team members
   * via aggregate queries on player_status.
   */
  loadTeamPlayers(): void {
    this.isLoadingPlayers = true;
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();

    // Fetch accessible team IDs and ACL metadata in parallel
    forkJoin({
      teamIds: this.aclService.getAccessibleTeamIds(playerId),
      metadata: this.aclService.getAclMetadata()
    }).pipe(
      takeUntil(this.destroy$),
      switchMap(({ teamIds, metadata }) => {
        this.aclMetadata = metadata;

        if (teamIds.length === 0) {
          return of([]);
        }

        // Fetch members for all teams in parallel
        const teamRequests = teamIds.map(teamId =>
          this.fetchTeamMembers(teamId).pipe(
            map(members => ({ teamId, members })),
            catchError(() => of({ teamId, members: [] as any[] }))
          )
        );

        return forkJoin(teamRequests);
      })
    ).subscribe({
      next: (teamResults) => {
        if (Array.isArray(teamResults)) {
          this.playerCards = this.deduplicateAndBuildCards(teamResults);
        } else {
          this.playerCards = [];
        }
        this.calculateAverages();
        this.isLoadingPlayers = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading team players:', error);
        this.toastService.error('Erro ao carregar jogadores das equipes');
        this.playerCards = [];
        this.calculateAverages();
        this.isLoadingPlayers = false;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Calculate SUPERVISOR's aggregate metrics as arithmetic mean of all players' metrics.
   * Excludes teams with zero players to avoid division by zero.
   * Called after loadTeamPlayers() completes — month filter is already applied to player data.
   */
  calculateAverages(): void {
    const players = this.playerCards;

    if (players.length === 0) {
      this.averagePoints = 0;
      this.averageCnpjMetric = 0;
      this.averageEntregaMetric = 0;
      this.averageKPIs = [];
      return;
    }

    const count = players.length;
    const totalPoints = players.reduce((sum, p) => sum + p.points, 0);
    const totalCnpj = players.reduce((sum, p) => sum + p.cnpjMetric, 0);
    const totalEntrega = players.reduce((sum, p) => sum + p.entregaMetric, 0);

    this.averagePoints = totalPoints / count;
    this.averageCnpjMetric = totalCnpj / count;
    this.averageEntregaMetric = totalEntrega / count;

    // Build average KPIs for display
    const avgCnpjGoal = players.reduce((sum, p) => sum + p.cnpjGoal, 0) / count;
    const avgEntregaGoal = players.reduce((sum, p) => sum + p.entregaGoal, 0) / count;
    const avgCnpjSuperTarget = Math.ceil(avgCnpjGoal * 1.5);

    this.averageKPIs = [
      {
        id: 'avg-numero-empresas',
        label: 'Média Clientes',
        current: this.averageCnpjMetric,
        target: avgCnpjGoal,
        superTarget: avgCnpjSuperTarget,
        unit: 'clientes',
        color: this.kpiService.getKPIColorByGoals(this.averageCnpjMetric, avgCnpjGoal, avgCnpjSuperTarget),
        percentage: avgCnpjGoal > 0 ? Math.min((this.averageCnpjMetric / avgCnpjSuperTarget) * 100, 100) : 0
      },
      {
        id: 'avg-entregas-prazo',
        label: 'Média Entregas',
        current: this.averageEntregaMetric,
        target: avgEntregaGoal,
        superTarget: 100,
        unit: '%',
        color: this.kpiService.getKPIColorByGoals(this.averageEntregaMetric, avgEntregaGoal, 100),
        percentage: Math.min(this.averageEntregaMetric, 100)
      }
    ];
  }

  /**
   * Fetch all members of a team using aggregate query on player_status.
   * Follows the same pattern as team-management-dashboard.
   */
  private fetchTeamMembers(teamId: string) {
    const aggregatePayload = [{ $match: { teams: teamId } }];

    return this.funifierApi.post<any[]>(
      '/database/player_status/aggregate?strict=true',
      aggregatePayload,
      { headers: { 'Range': 'items=0-200' } }
    ).pipe(
      map(result => Array.isArray(result) ? result : []),
      catchError(() => of([] as any[]))
    );
  }

  /**
   * Deduplicate players across teams and build SupervisorPlayerCard array.
   * If a player appears in multiple teams, they are shown once with all teams listed.
   */
  private deduplicateAndBuildCards(
    teamResults: Array<{ teamId: string; members: any[] }>
  ): SupervisorPlayerCard[] {
    const playerMap = new Map<string, SupervisorPlayerCard>();

    for (const { teamId, members } of teamResults) {
      const teamName = this.resolveTeamName(teamId);

      for (const member of members) {
        const memberId = String(member._id);
        if (!memberId || memberId === 'null' || memberId === 'undefined') continue;

        const existing = playerMap.get(memberId);
        if (existing) {
          // Player already seen — add this team if not already listed
          if (!existing.teamIds.includes(teamId)) {
            existing.teamIds.push(teamId);
            existing.teams.push(teamName);
          }
        } else {
          // New player — build card data
          playerMap.set(memberId, this.buildPlayerCard(memberId, member, teamId, teamName));
        }
      }
    }

    // Sort by player name alphabetically
    return Array.from(playerMap.values()).sort((a, b) =>
      a.playerName.localeCompare(b.playerName, 'pt-BR')
    );
  }

  /**
   * Build a SupervisorPlayerCard from raw player status data.
   */
  private buildPlayerCard(
    playerId: string,
    playerData: any,
    teamId: string,
    teamName: string
  ): SupervisorPlayerCard {
    const extra = playerData.extra || {};
    const pointCategories = playerData.point_categories || playerData.pointCategories || {};

    // Regular players use 'points' field (not pontos_supervisor)
    const points = Number(pointCategories.points) || 0;
    const coins = Number(pointCategories.coins) || 0;

    // Regular player metrics - count CNPJs from cnpj_resp (comma-separated list)
    const cnpjRespStr = extra.cnpj_resp || '';
    const cnpjMetric = cnpjRespStr ? cnpjRespStr.split(',').filter((s: string) => s.trim()).length : 0;
    const entregaMetric = extra.entrega ? parseFloat(extra.entrega) : 0;

    // Goals
    const cnpjGoal = extra.cnpj_goal != null ? Number(extra.cnpj_goal) : 100;
    const entregaGoal = extra.entrega_goal != null ? Number(extra.entrega_goal) : 90;

    const cnpjSuperTarget = Math.ceil(cnpjGoal * 1.5);

    const kpis: KPIData[] = [
      {
        id: 'numero-empresas',
        label: 'Clientes',
        current: cnpjMetric,
        target: cnpjGoal,
        superTarget: cnpjSuperTarget,
        unit: 'clientes',
        color: this.kpiService.getKPIColorByGoals(cnpjMetric, cnpjGoal, cnpjSuperTarget),
        percentage: cnpjGoal > 0 ? Math.min((cnpjMetric / cnpjSuperTarget) * 100, 100) : 0
      },
      {
        id: 'entregas-prazo',
        label: 'Entregas',
        current: entregaMetric,
        target: entregaGoal,
        superTarget: 100,
        unit: '%',
        color: this.kpiService.getKPIColorByGoals(entregaMetric, entregaGoal, 100),
        percentage: Math.min(entregaMetric, 100)
      }
    ];

    return {
      playerId,
      playerName: playerData.name || playerId,
      teams: [teamName],
      teamIds: [teamId],
      points,
      coins,
      cnpjMetric,
      entregaMetric,
      cnpjGoal,
      entregaGoal,
      kpis
    };
  }

  /**
   * Resolve a team ID to a human-readable display name using cached ACL metadata.
   * Falls back to the raw team ID if no metadata entry is found.
   */
  private resolveTeamName(teamId: string): string {
    const entry = this.aclMetadata.find(m => m.team_id === teamId);
    return entry ? entry.team_name : teamId;
  }

  /** Open the Player Detail Modal for a given player card */
  openPlayerDetail(player: SupervisorPlayerCard): void {
    this.selectedPlayerForDetail = player;
    this.isPlayerDetailModalOpen = true;
    this.cdr.markForCheck();
  }

  /** Close the Player Detail Modal */
  onPlayerDetailClosed(): void {
    this.isPlayerDetailModalOpen = false;
    this.selectedPlayerForDetail = null;
    this.cdr.markForCheck();
  }

  /** Handle CNPJ selection from the Player Detail Modal — open company detail modal */
  onCnpjSelectedFromPlayerDetail(company: Company): void {
    this.selectedCompanyForDetail = company;
    this.isCompanyDetailModalOpen = true;
    this.cdr.markForCheck();
  }

  /** Close the Company Detail Modal */
  onCompanyDetailClosed(): void {
    this.isCompanyDetailModalOpen = false;
    this.selectedCompanyForDetail = null;
    this.cdr.markForCheck();
  }

  /**
   * Conta quantos itens existem no array/string cnpj_resp do jogador (carteira atribuída).
   */
  private getCnpjRespCount(extra: Record<string, unknown>): number {
    const raw = extra?.['cnpj_resp'];
    if (raw == null) return 0;
    if (typeof raw === 'string') {
      return raw.split(/[;,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0).length;
    }
    if (Array.isArray(raw)) return raw.length;
    return 0;
  }

  /**
   * Load the SUPERVISOR's own client list from cnpj_resp.
   * Fetches companies from cnpj__c and enriches names from empid_cnpj__c.
   * Applies the current month filter.
   */
  loadClientList(): void {
    this.isLoadingClients = true;
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();

    // Use CompanyService to get companies from cnpj_resp → cnpj__c
    this.companyService.getCompanies(playerId)
      .pipe(
        switchMap(companies => {
          if (companies.length === 0) {
            return of({ companies, nameMap: new Map<string, string>() });
          }
          // Enrich company names from empid_cnpj__c
          const cnpjIds = companies.map(c => c.cnpj).filter(id => id);
          if (cnpjIds.length === 0) {
            return of({ companies, nameMap: new Map<string, string>() });
          }
          return this.cnpjLookupService.enrichCnpjList(cnpjIds).pipe(
            map(nameMap => ({ companies, nameMap })),
            catchError(() => of({ companies, nameMap: new Map<string, string>() }))
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ companies, nameMap }) => {
          this.clientRows = companies.map(company => {
            const enrichedName = nameMap.get(company.cnpj) || company.name || company.cnpj;
            return {
              cnpj: company.cnpj,
              companyName: enrichedName,
              kpis: company.kpis || [],
              healthScore: company.healthScore || 0
            };
          });
          this.isLoadingClients = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading client list:', error);
          this.toastService.error('Erro ao carregar lista de clientes');
          this.clientRows = [];
          this.isLoadingClients = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** Handle click on a client row — open company detail modal */
  onClientRowClick(row: SupervisorClientRow): void {
    const company: Company = {
      id: row.cnpj,
      name: row.companyName,
      cnpj: row.cnpj,
      healthScore: row.healthScore,
      kpis: row.kpis
    };
    this.onCnpjSelectedFromPlayerDetail(company);
  }

  /** Track client rows by cnpj for ngFor */
  trackByClientCnpj(_index: number, row: SupervisorClientRow): string {
    return row.cnpj;
  }

  /** Track player cards by playerId for ngFor */
  trackByPlayerId(_index: number, card: SupervisorPlayerCard): string {
    return card.playerId;
  }

  /** Switch between Carteira and Participação sub-tabs */
  switchClientesTab(tab: 'carteira' | 'participacao'): void {
    this.clientesActiveTab = tab;
    if (tab === 'participacao' && this.participacaoCnpjs.length === 0 && !this.isLoadingParticipacao) {
      this.loadParticipacaoData();
    }
    this.cdr.markForCheck();
  }

  /** Load CNPJs from extra.cnpj of each player for the Participação tab */
  private loadParticipacaoData(): void {
    this.isLoadingParticipacao = true;
    this.cdr.markForCheck();

    const seen = new Set<string>();
    const rows: { cnpj: string; playerName: string; companyName: string }[] = [];

    // Fetch raw player data to get extra.cnpj
    const playerIds = this.playerCards.map(p => p.playerId);
    if (playerIds.length === 0) {
      this.participacaoCnpjs = [];
      this.isLoadingParticipacao = false;
      this.cdr.markForCheck();
      return;
    }

    const aggregatePayload = [{ $match: { _id: { $in: playerIds } } }];
    this.funifierApi.post<any[]>(
      '/database/player_status/aggregate?strict=true',
      aggregatePayload,
      { headers: { 'Range': 'items=0-200' } }
    ).pipe(
      takeUntil(this.destroy$),
      switchMap(players => {
        const allPlayers = Array.isArray(players) ? players : [];
        for (const player of allPlayers) {
          const raw: string = player?.extra?.cnpj || '';
          if (!raw) continue;
          const cnpjs = raw.split(/[;,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          for (const cnpj of cnpjs) {
            if (seen.has(cnpj)) continue;
            seen.add(cnpj);
            rows.push({
              cnpj,
              playerName: player.name || player._id || '',
              companyName: cnpj
            });
          }
        }

        // Enrich company names
        const cnpjIds = rows.map(r => r.cnpj);
        if (cnpjIds.length === 0) return of(new Map<string, string>());
        return this.cnpjLookupService.enrichCnpjList(cnpjIds).pipe(
          catchError(() => of(new Map<string, string>()))
        );
      })
    ).subscribe({
      next: (nameMap) => {
        for (const row of rows) {
          const name = nameMap.get(row.cnpj);
          if (name) row.companyName = name;
        }
        this.participacaoCnpjs = rows;
        this.isLoadingParticipacao = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.participacaoCnpjs = [];
        this.isLoadingParticipacao = false;
        this.cdr.markForCheck();
      }
    });
  }

    /** Handle month filter changes from c4u-seletor-mes */
  onMonthChange(monthsAgo: number): void {
    this.selectedMonthsAgo = monthsAgo;
    // Clear player cache to force fresh data for the new month
    this.playerService.clearCache();
    // Reload info card with new month filter
    this.loadSupervisorInfoCard();
    // Reload team players with new month filter
    this.loadTeamPlayers();
    // Reload client list with new month filter
    this.loadClientList();
    // Reset participação data
    this.participacaoCnpjs = [];
    this.clientesActiveTab = 'carteira';
  }

  /** Toggle between Card View and Table View */
  toggleViewMode(mode: SupervisorViewMode): void {
    this.viewMode = mode;
  }

  /** Navigate to the legacy team management dashboard */
  navigateToLegacyDashboard(): void {
    this.router.navigate(['/dashboard/team-management']);
  }

  /** Track KPIs by id for ngFor */
  trackByKpiId(_index: number, kpi: KPIData): string {
    return kpi.id;
  }

  /** Round a value for display */
  roundValue(value: number): number {
    return Math.round(value);
  }

  /**
   * Logout user and redirect to login page
   * Includes double confirmation to prevent accidental logout
   */
  logout(): void {
    const firstConfirm = window.confirm('Tem certeza que deseja sair do sistema?');
    if (!firstConfirm) {
      return;
    }

    const secondConfirm = window.confirm('Esta ação irá desconectar você do sistema. Deseja continuar?');
    if (!secondConfirm) {
      return;
    }

    this.sessaoProvider.logout();
  }
}
