import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, switchMap, catchError, map } from 'rxjs/operators';

import { ACLService, AclMetadata } from '@services/acl.service';
import { UserProfileService } from '@services/user-profile.service';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { BackendApiService } from '@services/backend-api.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { CacheManagerService } from '@services/cache-manager.service';
import { SupabaseCompaniesService } from '@services/supabase-companies.service';
import { Company, KPIData } from '@model/gamification-dashboard.model';

/** View mode toggle for the main content area */
export type SupervisorViewMode = 'card' | 'table';

/** SUPERVISOR's own info card data */
export interface SupervisorInfoCard {
  name: string;
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

  /** Clientes sub-tabs: 3 tabs with enrichment pipeline */
  clientesActiveTab: 'carteira-equipe' | 'participacao-equipe' | 'carteira-supervisor' = 'carteira-equipe';

  /** Carteira equipe: companies from Supabase for all team member emails */
  carteiraEquipeClientes: CompanyDisplay[] = [];
  isLoadingCarteiraEquipe = false;

  /** Participação equipe: aggregated cnpj from all team members */
  participacaoEquipeClientes: CompanyDisplay[] = [];
  isLoadingParticipacaoEquipe = false;

  /** Carteira supervisor: supervisor's own companies (Supabase/mock) */
  carteiraSupervisorClientes: CompanyDisplay[] = [];
  isLoadingCarteiraSupervisor = false;

  /** Shared maps for CNPJ enrichment (same pattern as gamification dashboard) */
  cnpjNameMap = new Map<string, string>();
  cnpjStatusMap = new Map<string, string>();
  cnpjNumberMap = new Map<string, string>();

  /** ACL metadata for resolving team display names */
  private aclMetadata: AclMetadata[] = [];

  constructor(
    private aclService: ACLService,
    private userProfileService: UserProfileService,
    private playerService: PlayerService,
    private kpiService: KPIService,
    private backendApi: BackendApiService,
    private cnpjLookupService: CnpjLookupService,
    private companyKpiService: CompanyKpiService,
    private sessaoProvider: SessaoProvider,
    private cacheManagerService: CacheManagerService,
    private supabaseCompaniesService: SupabaseCompaniesService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Force fresh data on every dashboard load
    this.cacheManagerService.clearAllCaches();
    
    this.loadSupervisorInfoCard();
    this.loadTeamPlayers();
    this.loadCarteiraSupervisor();
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

          // Volume de clientes = quantidade de itens no array cnpj_resp do jogador
          const cnpjMetric = this.getCnpjRespCount(extra);
          const entregaMetric = extra.entrega_sup ? parseFloat(extra.entrega_sup) : 0;

          // Goals
          const cnpjGoal = extra.cnpj_goal != null ? Number(extra.cnpj_goal) : 100;
          const entregaGoal = extra.entrega_goal != null ? Number(extra.entrega_goal) : 90;

          this.supervisorInfo = {
            name: playerData.name || '',
            cnpjMetric,
            entregaMetric,
            cnpjGoal,
            entregaGoal
          };

          this.isLoadingInfoCard = false;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading supervisor info card:', error);
          this.isLoadingInfoCard = false;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
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
        const teamRequests = teamIds.map((teamId: string) =>
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
        // Now that playerCards are loaded, fetch all client tabs
        this.loadCarteiraEquipe();
        this.loadParticipacaoEquipe();
      },
      error: (error) => {
        console.error('Error loading team players:', error);
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

    return this.backendApi.post<any[]>(
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
   * Carteira do supervisor: Supabase `companies` (mock) + KPI Funifier opcional.
   */
  loadCarteiraSupervisor(): void {
    this.isLoadingCarteiraSupervisor = true;
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();

    this.supabaseCompaniesService.getCompaniesForPlayer(playerId)
      .pipe(
        switchMap(rows => {
          const cnpjs = rows.map(r => r.cnpj).filter(c => !!c && c.trim().length > 0);
          console.log('📊 Supervisor carteira CNPJs (Supabase/mock):', cnpjs);
          if (cnpjs.length === 0) {
            return of([] as CompanyDisplay[]);
          }
          this.supabaseCompaniesService.applyRowsToCnpjMaps(
            rows,
            this.cnpjNameMap,
            this.cnpjStatusMap,
            this.cnpjNumberMap
          );
          return this.companyKpiService.enrichFromCnpjResp(cnpjs);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (enriched: CompanyDisplay[]) => {
          enriched.forEach(c => {
            const status = this.cnpjStatusMap.get(c.cnpj);
            if (status) c.status = status;
          });
          this.carteiraSupervisorClientes = enriched;
          this.isLoadingCarteiraSupervisor = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading carteira supervisor:', err);
          this.carteiraSupervisorClientes = [];
          this.isLoadingCarteiraSupervisor = false;
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Carteira da equipe: empresas no Supabase onde `responsaveis` inclui email de qualquer membro.
   */
  loadCarteiraEquipe(): void {
    this.isLoadingCarteiraEquipe = true;
    this.cdr.markForCheck();

    const emails = this.playerCards.map(p => p.playerId).filter(id => !!id && String(id).trim().length > 0);
    if (emails.length === 0) {
      this.carteiraEquipeClientes = [];
      this.isLoadingCarteiraEquipe = false;
      this.cdr.markForCheck();
      return;
    }

    this.supabaseCompaniesService.getCompaniesForEmails(emails, true).pipe(
      takeUntil(this.destroy$),
      switchMap(rows => {
        console.log('📊 Carteira equipe companies (Supabase/mock):', rows.length);
        const cnpjs = rows.map(r => r.cnpj).filter(c => !!c && c.trim().length > 0);
        if (cnpjs.length === 0) {
          return of([] as CompanyDisplay[]);
        }
        this.supabaseCompaniesService.applyRowsToCnpjMaps(
          rows,
          this.cnpjNameMap,
          this.cnpjStatusMap,
          this.cnpjNumberMap
        );
        return this.companyKpiService.enrichFromCnpjResp(cnpjs);
      })
    ).subscribe({
      next: (enriched: CompanyDisplay[]) => {
        enriched.forEach(c => {
          const status = this.cnpjStatusMap.get(c.cnpj);
          if (status) c.status = status;
        });
        this.carteiraEquipeClientes = enriched;
        this.isLoadingCarteiraEquipe = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading carteira equipe:', err);
        this.carteiraEquipeClientes = [];
        this.isLoadingCarteiraEquipe = false;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Load aggregated cnpj (extra.cnpj) from ALL team members (participação equipe).
   * Uses the enrichment pipeline: cnpjLookupService.enrichCnpjListFull() → companyKpiService.enrichFromCnpjResp()
   */
  loadParticipacaoEquipe(): void {
    this.isLoadingParticipacaoEquipe = true;
    this.cdr.markForCheck();

    const playerIds = this.playerCards.map(p => p.playerId);
    if (playerIds.length === 0) {
      this.participacaoEquipeClientes = [];
      this.isLoadingParticipacaoEquipe = false;
      this.cdr.markForCheck();
      return;
    }

    const aggregatePayload = [{ $match: { _id: { $in: playerIds } } }];
    this.backendApi.post<any[]>(
      '/database/player_status/aggregate?strict=true',
      aggregatePayload,
      { headers: { 'Range': 'items=0-200' } }
    ).pipe(
      takeUntil(this.destroy$),
      switchMap(players => {
        const allPlayers = Array.isArray(players) ? players : [];
        const seen = new Set<string>();
        const allCnpjs: string[] = [];

        for (const player of allPlayers) {
          const raw: string = player?.extra?.cnpj || '';
          if (!raw) continue;
          const cnpjs = raw.split(/[;,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          for (const cnpj of cnpjs) {
            if (!seen.has(cnpj)) {
              seen.add(cnpj);
              allCnpjs.push(cnpj);
            }
          }
        }

        console.log('📊 Participação equipe aggregated cnpjs:', allCnpjs.length);
        if (allCnpjs.length === 0) {
          return of([] as CompanyDisplay[]);
        }

        return this.cnpjLookupService.enrichCnpjListFull(allCnpjs).pipe(
          switchMap(cnpjInfo => {
            cnpjInfo.forEach((info, key) => {
              this.cnpjNameMap.set(key, info.empresa);
              if (info.status) this.cnpjStatusMap.set(key, info.status);
              if (info.cnpj) this.cnpjNumberMap.set(key, info.cnpj);
            });
            return this.companyKpiService.enrichFromCnpjResp(allCnpjs);
          })
        );
      })
    ).subscribe({
      next: (enriched: CompanyDisplay[]) => {
        enriched.forEach(c => {
          const status = this.cnpjStatusMap.get(c.cnpj);
          if (status) c.status = status;
        });
        this.participacaoEquipeClientes = enriched;
        this.isLoadingParticipacaoEquipe = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading participação equipe:', err);
        this.participacaoEquipeClientes = [];
        this.isLoadingParticipacaoEquipe = false;
        this.cdr.markForCheck();
      }
    });
  }

  /** Handle click on a company display row — open company detail modal */
  onCompanyDisplayClick(item: CompanyDisplay): void {
    const company: Company = {
      id: item.cnpj,
      name: this.cnpjNameMap.get(item.cnpj) || item.cnpj,
      cnpj: this.cnpjNumberMap.get(item.cnpj) || item.cnpj,
      healthScore: item.entrega || 0,
      kpis: item.deliveryKpi ? [item.deliveryKpi] : []
    };
    this.onCnpjSelectedFromPlayerDetail(company);
  }

  /** Track company display items by cnpj for ngFor */
  trackByCompanyDisplayCnpj(_index: number, item: CompanyDisplay): string {
    return item.cnpj;
  }

  /** Track player cards by playerId for ngFor */
  trackByPlayerId(_index: number, card: SupervisorPlayerCard): string {
    return card.playerId;
  }

  /** Switch between the 3 Clientes sub-tabs with lazy loading */
  switchClientesTab(tab: 'carteira-equipe' | 'participacao-equipe' | 'carteira-supervisor'): void {
    this.clientesActiveTab = tab;
    if (tab === 'carteira-equipe' && this.carteiraEquipeClientes.length === 0 && !this.isLoadingCarteiraEquipe) {
      this.loadCarteiraEquipe();
    } else if (tab === 'participacao-equipe' && this.participacaoEquipeClientes.length === 0 && !this.isLoadingParticipacaoEquipe) {
      this.loadParticipacaoEquipe();
    } else if (tab === 'carteira-supervisor' && this.carteiraSupervisorClientes.length === 0 && !this.isLoadingCarteiraSupervisor) {
      this.loadCarteiraSupervisor();
    }
    this.cdr.markForCheck();
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
    // Reset all clientes tab data and reload the active tab
    this.carteiraEquipeClientes = [];
    this.participacaoEquipeClientes = [];
    this.carteiraSupervisorClientes = [];
    this.clientesActiveTab = 'carteira-equipe';
    this.loadCarteiraEquipe();
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

  /** Get clean company display name from CNPJ using the enriched name map */
  getCompanyDisplayName(cnpj: string): string {
    return this.cnpjNameMap.get(cnpj) || cnpj;
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
