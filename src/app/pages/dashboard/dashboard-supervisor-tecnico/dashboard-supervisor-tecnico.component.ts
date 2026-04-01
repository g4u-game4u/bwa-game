import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, of, firstValueFrom } from 'rxjs';
import { takeUntil, switchMap, catchError, map } from 'rxjs/operators';
import * as dayjs from 'dayjs';

import { ACLService, AclMetadata } from '@services/acl.service';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { FunifierApiService } from '@services/funifier-api.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { TeamAggregateService } from '@services/team-aggregate.service';
import { ActionLogService } from '@services/action-log.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { CompanyKpiService, CompanyDisplay } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import {
  Company,
  KPIData,
  PointWallet,
  SeasonProgress,
  ActivityMetrics,
  ProcessMetrics
} from '@model/gamification-dashboard.model';
import { Team } from '@components/c4u-team-selector/c4u-team-selector.component';
import { Collaborator } from '@services/team-aggregate.service';
import { ProgressCardType } from '@components/c4u-activity-progress/c4u-activity-progress.component';
import { ProgressListType } from '@modals/modal-progress-list/modal-progress-list.component';

/** Helper to convert a date to Funifier date format */
function toFunifierDate(date: dayjs.Dayjs | Date, position: 'start' | 'end' = 'start'): { $date: string } {
  const d = dayjs.isDayjs(date) ? date : dayjs(date);
  if (position === 'start') {
    return { $date: d.startOf('day').toISOString() };
  }
  return { $date: d.endOf('day').toISOString() };
}

/** Player row data for the read-only team view */
export interface SupervisorTecnicoPlayerRow {
  playerId: string;
  playerName: string;
  teams: string[];
  teamIds: string[];
  points: number;
  cnpjMetric: number;
  entregaMetric: number;
  kpis: KPIData[];
}

@Component({
  selector: 'app-dashboard-supervisor-tecnico',
  templateUrl: './dashboard-supervisor-tecnico.component.html',
  styleUrls: ['./dashboard-supervisor-tecnico.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardSupervisorTecnicoComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /** Selected month filter (0 = current month, -1 = "Toda temporada") */
  selectedMonthsAgo = 0;
  selectedMonth: Date = new Date();

  /** Loading states */
  isLoadingPlayers = true;
  isLoadingTeams = false;
  isLoadingKPIs = false;
  isLoadingSidebar = false;
  isLoadingCarteira = false;
  isLoading = false;

  /** Error states */
  hasSidebarError = false;
  sidebarErrorMessage = '';

  /** Team selector data */
  teams: Team[] = [];
  selectedTeamId = '';

  /** Collaborator selector data */
  collaborators: Collaborator[] = [];
  selectedCollaborator: string | null = null;

  /** Deduplicated player rows for the read-only table */
  playerRows: SupervisorTecnicoPlayerRow[] = [];

  /** Player Detail Modal state */
  isPlayerDetailModalOpen = false;
  selectedPlayerForDetail: SupervisorTecnicoPlayerRow | null = null;

  /** Company Detail Modal state (opened from CNPJ row in player detail) */
  isCompanyDetailModalOpen = false;
  selectedCompanyForDetail: Company | null = null;

  /** Company Carteira Detail Modal state */
  isCompanyCarteiraDetailModalOpen = false;
  selectedCarteiraCompany: CompanyDisplay | null = null;

  /** Progress List Modal state */
  isProgressModalOpen = false;
  progressModalType: ProgressListType = 'atividades';

  /** Team KPI averages */
  averagePoints = 0;
  averageCnpjMetric = 0;
  averageEntregaMetric = 0;
  averageKPIs: KPIData[] = [];

  /** Team KPIs (like GESTOR) */
  teamKPIs: KPIData[] = [];

  /** Point Wallet (read-only) */
  teamPointWallet: PointWallet | null = null;
  teamAveragePoints = 0;

  /** Season Progress (read-only) */
  teamSeasonProgress: SeasonProgress | null = null;
  seasonDates: { start: Date; end: Date } = { start: new Date(), end: new Date() };

  /** Activity and Process metrics */
  teamActivityMetrics: ActivityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
  teamProcessMetrics: ProcessMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
  progressMetrics = { processosIncompletos: 0, atividadesFinalizadas: 0, processosFinalizados: 0 };

  /** Monthly points breakdown */
  monthlyPointsBreakdown: { bloqueados: number; desbloqueados: number } | null = null;

  /** Company/Carteira data */
  teamCarteiraClientes: CompanyDisplay[] = [];
  supervisorCarteiraClientes: CompanyDisplay[] = [];
  cnpjNameMap = new Map<string, string>();

  // Clientes sub-tabs
  clientesActiveTab: 'carteira' | 'participacao' | 'carteira-individual' = 'carteira';
  teamParticipacaoCnpjs: CompanyDisplay[] = [];
  teamParticipacaoCount = 0;
  isLoadingParticipacao = false;
  isLoadingCarteiraIndividual = false;
  private teamMembersRawData: any[] = [];

  /** Team member IDs and data */
  teamMemberIds: string[] = [];
  teamTotalPoints = 0;

  /** ACL metadata for resolving team display names */
  private aclMetadata: AclMetadata[] = [];

  constructor(
    private aclService: ACLService,
    private playerService: PlayerService,
    private kpiService: KPIService,
    private funifierApi: FunifierApiService,
    private toastService: ToastService,
    private sessaoProvider: SessaoProvider,
    private teamAggregateService: TeamAggregateService,
    private actionLogService: ActionLogService,
    private seasonDatesService: SeasonDatesService,
    private companyKpiService: CompanyKpiService,
    private cnpjLookupService: CnpjLookupService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeDashboard();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Get the current user's player ID from session */
  private getPlayerId(): string {
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    return (usuario?._id || usuario?.email || 'me') as string;
  }

  /** Initialize dashboard: load season dates, then teams */
  private async initializeDashboard(): Promise<void> {
    try {
      this.isLoading = true;
      this.cdr.markForCheck();

      // Load season dates
      await this.loadSeasonDates();

      // Load accessible teams
      await this.loadAvailableTeams();

      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      this.toastService.error('Erro ao inicializar o dashboard');
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** Load season dates from campaign service */
  private async loadSeasonDates(): Promise<void> {
    try {
      this.seasonDates = await this.seasonDatesService.getSeasonDates();
    } catch (error) {
      console.error('Error loading season dates:', error);
      this.seasonDates = { start: new Date(), end: new Date() };
    }
  }

  /** Load available teams via ACL Service (Virtual Good-based) */
  private async loadAvailableTeams(): Promise<void> {
    this.isLoadingTeams = true;
    this.cdr.markForCheck();

    const playerId = this.getPlayerId();

    try {
      const [teamIds, metadata] = await Promise.all([
        firstValueFrom(this.aclService.getAccessibleTeamIds(playerId).pipe(takeUntil(this.destroy$))),
        firstValueFrom(this.aclService.getAclMetadata().pipe(takeUntil(this.destroy$)))
      ]);

      this.aclMetadata = metadata;

      // Build teams array for the team selector
      this.teams = teamIds.map(teamId => {
        const meta = metadata.find(m => m.team_id === teamId);
        return {
          id: teamId,
          name: meta ? meta.team_name : teamId,
          memberCount: 0
        };
      });

      this.isLoadingTeams = false;

      // Auto-select first team
      if (this.teams.length > 0) {
        this.selectedTeamId = this.teams[0].id;
        await this.loadTeamData();
      } else {
        this.isLoadingPlayers = false;
      }

      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading available teams:', error);
      this.toastService.error('Erro ao carregar equipes acessíveis');
      this.teams = [];
      this.isLoadingTeams = false;
      this.isLoadingPlayers = false;
      this.cdr.markForCheck();
    }
  }

  /** Load all data for the selected team (mirrors GESTOR's loadTeamData) */
  async loadTeamData(): Promise<void> {
    if (!this.selectedTeamId) return;

    try {
      this.isLoading = true;
      this.isLoadingPlayers = true;
      this.teamParticipacaoCount = 0;
      this.teamParticipacaoCnpjs = [];
      this.cdr.markForCheck();

      const dateRange = this.calculateDateRange();

      if (this.selectedCollaborator) {
        // Load single collaborator data
        await this.loadCollaboratorData(this.selectedCollaborator, dateRange);
      } else {
        // Load team members data first
        await this.loadTeamMembersData(this.selectedTeamId, dateRange);

        // Load activity/process metrics
        await this.loadTeamActivityAndMacroData(dateRange);

        // Load sidebar, collaborators, and carteira in parallel
        await Promise.all([
          this.loadSidebarData(dateRange),
          this.loadCollaborators()
        ]);

        // Load carteira then KPIs (KPIs depend on carteira data)
        await this.loadTeamCarteiraData(dateRange);
        await this.loadTeamKPIs();

        // Load monthly points breakdown
        await this.loadMonthlyPointsBreakdown(dateRange);
      }

      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team data:', error);
      this.toastService.error('Erro ao carregar dados da equipe');
      this.isLoading = false;
      this.isLoadingPlayers = false;
      this.cdr.markForCheck();
    }
  }

  /** Calculate date range based on selected month */
  private calculateDateRange(): { start: Date; end: Date } {
    if (this.selectedMonthsAgo === -1) {
      // "Toda temporada"
      return this.seasonDates;
    }
    const now = dayjs();
    const targetMonth = now.subtract(this.selectedMonthsAgo, 'month');
    this.selectedMonth = targetMonth.startOf('month').toDate();
    return {
      start: targetMonth.startOf('month').toDate(),
      end: targetMonth.endOf('month').toDate()
    };
  }

  /** Load team members data (mirrors GESTOR's loadTeamMembersData) */
  private async loadTeamMembersData(teamId: string, dateRange?: { start: Date; end: Date }): Promise<void> {
    try {
      const aggregatePayload = [{ $match: { teams: teamId } }];

      const allPlayersStatus = await firstValueFrom(
        this.funifierApi.post<any[]>(
          '/database/player_status/aggregate?strict=true',
          aggregatePayload,
          { headers: { 'Range': 'items=0-200' } }
        ).pipe(takeUntil(this.destroy$))
      ).catch(() => [] as any[]);

      this.teamMembersRawData = Array.isArray(allPlayersStatus) ? allPlayersStatus : [];
      this.teamParticipacaoCount = this.getParticipacaoCountFromRawPlayers(this.teamMembersRawData);

      const memberIds = (Array.isArray(allPlayersStatus) ? allPlayersStatus : [])
        .map((player: any) => String(player._id))
        .filter((id: string) => id != null && id !== 'null' && id !== 'undefined');

      this.teamMemberIds = memberIds;

      if (memberIds.length === 0) {
        this.teamTotalPoints = 0;
        this.teamAveragePoints = 0;
        this.playerRows = [];
        this.isLoadingPlayers = false;
        this.cdr.markForCheck();
        return;
      }

      // Calculate points for the selected date range (supports "Toda temporada")
      const rangeStart = dateRange ? dayjs(dateRange.start) : dayjs(this.selectedMonth).startOf('month');
      const rangeEnd = dateRange ? dayjs(dateRange.end) : dayjs(this.selectedMonth).endOf('month');

      const pointsAggregatePayload = [
        {
          $match: {
            player: { $in: memberIds },
            type: 0,
            time: {
              $gte: toFunifierDate(rangeStart, 'start'),
              $lte: toFunifierDate(rangeEnd, 'end')
            }
          }
        },
        { $group: { _id: '$player', totalPoints: { $sum: '$total' } } }
      ];

      const pointsByPlayer = await firstValueFrom(
        this.funifierApi.post<any[]>(
          '/database/achievement/aggregate?strict=true',
          pointsAggregatePayload
        ).pipe(takeUntil(this.destroy$))
      ).catch(() => []);

      const pointsMap = new Map<string, number>();
      (pointsByPlayer || []).forEach((item: any) => {
        pointsMap.set(item._id, item.totalPoints || 0);
      });

      let totalPoints = 0;
      let validMembers = 0;

      const players = Array.isArray(allPlayersStatus) ? allPlayersStatus : [];
      players.forEach((status: any) => {
        const memberId = String(status._id);
        const pts = pointsMap.get(memberId) || 0;
        totalPoints += pts;

        validMembers++;
      });

      this.teamTotalPoints = Math.floor(totalPoints);
      this.teamAveragePoints = validMembers > 0 ? Math.floor(totalPoints / validMembers) : 0;

      // Build player rows
      const teamName = this.resolveTeamName(teamId);
      this.playerRows = this.buildPlayerRows(players, pointsMap, teamId, teamName);
      this.calculateAverages();
      this.isLoadingPlayers = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team members:', error);
      this.teamTotalPoints = 0;
      this.teamAveragePoints = 0;
      this.playerRows = [];
      this.isLoadingPlayers = false;
      this.cdr.markForCheck();
    }
  }

  /** Build player rows from raw player status data */
  private buildPlayerRows(
    players: any[],
    pointsMap: Map<string, number>,
    teamId: string,
    teamName: string
  ): SupervisorTecnicoPlayerRow[] {
    return players
      .filter(p => {
        const id = String(p._id);
        return id && id !== 'null' && id !== 'undefined';
      })
      .map(playerData => {
        const playerId = String(playerData._id);
        const extra = playerData.extra || {};
        const points = pointsMap.get(playerId) || 0;
        const cnpjMetric = this.getCnpjRespCount(extra);
        const entregaMetric = extra.entrega ? parseFloat(extra.entrega) : 0;

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
          cnpjMetric,
          entregaMetric,
          kpis
        };
      })
      .sort((a, b) => a.playerName.localeCompare(b.playerName, 'pt-BR'));
  }

  /** Calculate team averages from all player data */
  calculateAverages(): void {
    const players = this.playerRows;

    if (players.length === 0) {
      this.averagePoints = 0;
      this.averageCnpjMetric = 0;
      this.averageEntregaMetric = 0;
      this.averageKPIs = [];
      return;
    }

    const count = players.length;
    this.averagePoints = players.reduce((sum, p) => sum + p.points, 0) / count;
    this.averageCnpjMetric = players.reduce((sum, p) => sum + p.cnpjMetric, 0) / count;
    this.averageEntregaMetric = players.reduce((sum, p) => sum + p.entregaMetric, 0) / count;

    this.averageKPIs = [
      {
        id: 'avg-numero-empresas',
        label: 'Média Clientes',
        current: this.averageCnpjMetric,
        target: 10,
        unit: 'clientes',
        color: this.kpiService.getKPIColorByGoals(this.averageCnpjMetric, 10, 15),
        percentage: Math.min((this.averageCnpjMetric / 15) * 100, 100)
      },
      {
        id: 'avg-entregas-prazo',
        label: 'Média Entregas',
        current: this.averageEntregaMetric,
        target: 90,
        superTarget: 100,
        unit: '%',
        color: this.kpiService.getKPIColorByGoals(this.averageEntregaMetric, 90, 100),
        percentage: Math.min(this.averageEntregaMetric, 100)
      }
    ];
  }

  /** Load sidebar data: point wallet and season progress (read-only) */
  private async loadSidebarData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingSidebar = true;
      this.hasSidebarError = false;
      this.cdr.markForCheck();

      const unlockedPoints = this.teamTotalPoints;

      // No locked points displayed (Requirement 16.4)
      this.teamPointWallet = {
        bloqueados: 0,
        desbloqueados: Math.floor(unlockedPoints),
        moedas: 0
      };

      this.teamSeasonProgress = {
        metas: { current: 0, target: 0 },
        clientes: this.teamCarteiraClientes.length + this.teamParticipacaoCount,
        tarefasFinalizadas: Math.floor(this.teamActivityMetrics.finalizadas),
        seasonDates: this.seasonDates
      };

      this.progressMetrics = {
        processosIncompletos: Math.floor(this.teamProcessMetrics.incompletas),
        atividadesFinalizadas: Math.floor(this.teamActivityMetrics.finalizadas),
        processosFinalizados: Math.floor(this.teamProcessMetrics.finalizadas)
      };

      this.isLoadingSidebar = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading sidebar data:', error);
      this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
      this.isLoadingSidebar = false;
      this.cdr.markForCheck();
    }
  }

  /** Load team activity and process metrics */
  private async loadTeamActivityAndMacroData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      if (this.teamMemberIds.length === 0) return;

      const metrics = await firstValueFrom(
        this.teamAggregateService.getTeamActivityMetrics(
          this.selectedTeamId,
          dateRange.start,
          dateRange.end
        ).pipe(takeUntil(this.destroy$))
      ).catch(() => ({ finalizadas: 0, pontos: 0, processosFinalizados: 0, processosIncompletos: 0 }));

      const totalPoints = await firstValueFrom(
        this.teamAggregateService.getTeamTotalPoints(
          this.teamMemberIds,
          dateRange.start,
          dateRange.end
        ).pipe(takeUntil(this.destroy$))
      ).catch(() => 0);

      this.teamActivityMetrics = {
        pendentes: 0,
        emExecucao: 0,
        finalizadas: metrics.finalizadas,
        pontos: totalPoints
      };

      this.teamProcessMetrics = {
        pendentes: 0,
        incompletas: Math.max(0, metrics.processosIncompletos),
        finalizadas: metrics.processosFinalizados
      };

      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading activity data:', error);
    }
  }

  /** Load team KPIs (mirrors GESTOR's loadTeamKPIs — read-only, no goal editing) */
  private async loadTeamKPIs(collaboratorId?: string): Promise<void> {
    try {
      this.isLoadingKPIs = true;

      if (collaboratorId) {
        const kpis = await firstValueFrom(
          this.kpiService.getPlayerKPIs(collaboratorId, this.selectedMonthsAgo === -1 ? undefined : this.selectedMonth, this.actionLogService)
            .pipe(takeUntil(this.destroy$))
        );
        this.teamKPIs = kpis || [];
      } else {
        const teamKPIs: KPIData[] = [];

        if (this.teamMemberIds.length === 0) {
          this.teamKPIs = [];
          this.isLoadingKPIs = false;
          this.cdr.markForCheck();
          return;
        }

        // 1. Clientes na Carteira
        const totalEmpresasAtual = this.teamCarteiraClientes.length;

        let somaMetasEmpresas = 0;
        try {
          const aggregateQuery = [
            { $match: { _id: { $in: this.teamMemberIds } } },
            { $project: { _id: 1, cnpj_goal: '$extra.cnpj_goal' } }
          ];

          const playerCnpjGoals = await firstValueFrom(
            this.funifierApi.post<{ _id: string; cnpj_goal?: number }[]>(
              '/database/player_status/aggregate?strict=true',
              aggregateQuery
            ).pipe(takeUntil(this.destroy$))
          ).catch(() => [] as { _id: string; cnpj_goal?: number }[]);

          somaMetasEmpresas = playerCnpjGoals.reduce((sum: number, player: { _id: string; cnpj_goal?: number }) => {
            const cnpjGoal = player.cnpj_goal;
            if (cnpjGoal === undefined || cnpjGoal === null) return sum + 100;
            const numValue = typeof cnpjGoal === 'number' ? cnpjGoal : parseInt(String(cnpjGoal), 10);
            return sum + (isNaN(numValue) ? 100 : numValue);
          }, 0);

          if (playerCnpjGoals.length === 0) {
            somaMetasEmpresas = this.teamMemberIds.length * 100;
          }
        } catch {
          somaMetasEmpresas = this.teamMemberIds.length * 100;
        }

        const targetEmpresas = somaMetasEmpresas;
        const superTargetEmpresas = Math.ceil(targetEmpresas * 1.5);

        teamKPIs.push({
          id: 'numero-empresas',
          label: 'Clientes na Carteira',
          current: totalEmpresasAtual,
          target: targetEmpresas,
          superTarget: superTargetEmpresas,
          unit: 'clientes',
          color: this.getKPIColorByGoals(totalEmpresasAtual, targetEmpresas, superTargetEmpresas),
          percentage: Math.min((totalEmpresasAtual / superTargetEmpresas) * 100, 100)
        });

        // 2. Entregas no Prazo
        const now = new Date();
        const isCurrentMonth = this.selectedMonthsAgo === -1 || (
          this.selectedMonth.getFullYear() === now.getFullYear() &&
          this.selectedMonth.getMonth() === now.getMonth()
        );

        if (isCurrentMonth) {
          try {
            const aggregateQuery = [
              { $match: { _id: { $in: this.teamMemberIds } } },
              { $project: { _id: 1, entrega: '$extra.entrega', entrega_goal: '$extra.entrega_goal' } }
            ];

            const playerEntregas = await firstValueFrom(
              this.funifierApi.post<{ _id: string; entrega?: string; entrega_goal?: number }[]>(
                '/database/player_status/aggregate?strict=true',
                aggregateQuery
              ).pipe(takeUntil(this.destroy$))
            ).catch(() => [] as { _id: string; entrega?: string; entrega_goal?: number }[]);

            const validEntregas = playerEntregas
              .filter(p => p.entrega != null && p.entrega !== '')
              .map(p => parseFloat(p.entrega || '0'))
              .filter(v => !isNaN(v));

            let targetEntregas = 90;
            if (playerEntregas.length > 0) {
              const entregaGoalSum = playerEntregas.reduce((sum: number, player) => {
                const entregaGoal = player.entrega_goal;
                if (entregaGoal === undefined || entregaGoal === null) return sum + 90;
                const numValue = typeof entregaGoal === 'number' ? entregaGoal : parseFloat(String(entregaGoal));
                return sum + (isNaN(numValue) ? 90 : numValue);
              }, 0);
              targetEntregas = Math.round((entregaGoalSum / playerEntregas.length) * 100) / 100;
            }

            if (validEntregas.length > 0) {
              const mediaEntregas = validEntregas.reduce((sum, v) => sum + v, 0) / validEntregas.length;
              teamKPIs.push({
                id: 'entregas-prazo',
                label: 'Entregas no Prazo',
                current: Math.round(mediaEntregas * 100) / 100,
                target: targetEntregas,
                superTarget: 100,
                unit: '%',
                color: this.getKPIColorByGoals(mediaEntregas, targetEntregas, 100),
                percentage: Math.min((mediaEntregas / 100) * 100, 100)
              });
            }
          } catch (error) {
            console.error('Error loading entrega KPIs:', error);
          }
        }

        this.teamKPIs = teamKPIs;
      }

      this.isLoadingKPIs = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team KPIs:', error);
      this.teamKPIs = [];
      this.isLoadingKPIs = false;
      this.cdr.markForCheck();
    }
  }

  /** Load team carteira (company portfolio) data from player_company__c */
  private async loadTeamCarteiraData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingCarteira = true;
      if (!this.selectedTeamId) {
        this.teamCarteiraClientes = [];
        this.isLoadingCarteira = false;
        this.cdr.markForCheck();
        return;
      }

      if (this.teamMemberIds.length === 0) {
        this.teamCarteiraClientes = [];
        this.isLoadingCarteira = false;
        this.cdr.markForCheck();
        return;
      }

      // Fetch all cnpj_resp from player_company__c for all team members
      const aggregateQuery = [
        {
          $match: {
            playerId: { $in: this.teamMemberIds },
            type: 'cnpj_resp'
          }
        },
        {
          $group: {
            _id: '$cnpj',
            count: { $sum: 1 }
          }
        }
      ];

      const cnpjRespResult = await firstValueFrom(
        this.funifierApi.post<any[]>(
          '/v3/database/player_company__c/aggregate?strict=true',
          aggregateQuery
        ).pipe(takeUntil(this.destroy$))
      ).catch(() => []);

      if (cnpjRespResult.length === 0) {
        this.teamCarteiraClientes = [];
        this.isLoadingCarteira = false;
        this.cdr.markForCheck();
        return;
      }

      const cnpjList = cnpjRespResult.map((item: any) => item._id).filter((id: string) => id != null);

      // Get action counts for each CNPJ
      const monthStart = dayjs(dateRange.start).startOf('day').toDate();
      const monthEnd = dayjs(dateRange.end).endOf('day').toDate();

      let cnpjListWithCounts: { cnpj: string; actionCount: number }[] = [];

      if (this.selectedMonthsAgo === -1) {
        // For "Toda temporada", get counts from action_log
        const actionCountQuery = [
          {
            $match: {
              userId: { $in: this.teamMemberIds },
              'attributes.deal': { $in: cnpjList },
              time: {
                $gte: { $date: monthStart.toISOString() },
                $lte: { $date: monthEnd.toISOString() }
              }
            }
          },
          {
            $group: {
              _id: '$attributes.deal',
              actionCount: { $sum: 1 }
            }
          }
        ];

        const actionCounts = await firstValueFrom(
          this.funifierApi.post<any[]>(
            '/database/action_log/aggregate?strict=true',
            actionCountQuery
          ).pipe(takeUntil(this.destroy$))
        ).catch(() => []);

        const actionCountMap = new Map(actionCounts.map((item: any) => [item._id, item.actionCount || 0]));
        cnpjListWithCounts = cnpjList.map(cnpj => ({
          cnpj,
          actionCount: actionCountMap.get(cnpj) || 0
        }));
      } else {
        // For specific month, get global counts for all executors
        const globalCounts = await firstValueFrom(
          this.actionLogService
            .getCnpjListWithCountForAllExecutors(cnpjList, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        ).catch(() => []);

        cnpjListWithCounts = cnpjList.map(cnpj => {
          const found = globalCounts.find(c => c.cnpj === cnpj);
          return {
            cnpj,
            actionCount: found?.actionCount || 0
          };
        });
      }

      // Enrich with company names
      const cnpjNames = await firstValueFrom(
        this.cnpjLookupService.enrichCnpjList(cnpjList).pipe(takeUntil(this.destroy$))
      ).catch(() => new Map<string, string>());
      this.cnpjNameMap = cnpjNames;

      // Enrich with KPI data
      const enrichedClientes = await firstValueFrom(
        this.companyKpiService.enrichCompaniesWithKpis(cnpjListWithCounts).pipe(takeUntil(this.destroy$))
      ).catch(() => cnpjListWithCounts.map(item => ({ cnpj: item.cnpj, actionCount: item.actionCount } as CompanyDisplay)));

      this.teamCarteiraClientes = enrichedClientes;
      this.syncSeasonClientesCount();
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading carteira data:', error);
      this.teamCarteiraClientes = [];
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    }
  }

  /** Load collaborators list for the team */
  private async loadCollaborators(): Promise<void> {
    try {
      const members = await firstValueFrom(
        this.teamAggregateService.getTeamMembers(this.selectedTeamId).pipe(takeUntil(this.destroy$))
      ).catch(() => []);

      this.collaborators = members;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading collaborators:', error);
      this.collaborators = [];
    }
  }

  /** Load single collaborator data */
  private async loadCollaboratorData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      // Load collaborator's player status
      const status = await firstValueFrom(
        this.funifierApi.get<any>(`/v3/player/${collaboratorId}/status`).pipe(takeUntil(this.destroy$))
      ).catch(() => null);

      if (status) {
        const extra = status.extra || {};
        const pointCategories = status.point_categories || status.pointCategories || {};
        const points = Number(pointCategories.points) || 0;
        const cnpjMetric = this.getCnpjRespCount(extra);
        this.teamParticipacaoCount = this.parseCnpjList(extra?.['cnpj']).length;
        const entregaMetric = extra.entrega ? parseFloat(extra.entrega) : 0;

        const cnpjGoal = extra.cnpj_goal != null ? Number(extra.cnpj_goal) : 100;
        const entregaGoal = extra.entrega_goal != null ? Number(extra.entrega_goal) : 90;
        const cnpjSuperTarget = Math.ceil(cnpjGoal * 1.5);

        this.playerRows = [{
          playerId: collaboratorId,
          playerName: status.name || collaboratorId,
          teams: [this.resolveTeamName(this.selectedTeamId)],
          teamIds: [this.selectedTeamId],
          points,
          cnpjMetric,
          entregaMetric,
          kpis: [
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
          ]
        }];

        this.teamTotalPoints = Math.floor(points);
        this.teamAveragePoints = Math.floor(points);
        this.teamMemberIds = [collaboratorId];
      } else {
        this.playerRows = [];
      }

      this.calculateAverages();

      // Load collaborator sidebar data
      // Use dateRange for "Toda temporada" support — pass null for season-wide
      const monthForMetrics = this.selectedMonthsAgo === -1 ? undefined : this.selectedMonth;
      const metrics = await firstValueFrom(
        this.actionLogService.getProgressMetrics(collaboratorId, monthForMetrics).pipe(takeUntil(this.destroy$))
      ).catch(() => ({
        activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
        processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
      }));

      this.teamActivityMetrics = metrics.activity;
      this.teamProcessMetrics = metrics.processo;

      const unlockedPoints = this.teamTotalPoints;
      this.teamPointWallet = {
        bloqueados: 0,
        desbloqueados: Math.floor(unlockedPoints),
        moedas: 0
      };

      this.teamSeasonProgress = {
        metas: { current: 0, target: 0 },
        clientes: this.teamParticipacaoCount,
        tarefasFinalizadas: Math.floor(metrics.activity.finalizadas),
        seasonDates: this.seasonDates
      };

      this.progressMetrics = {
        processosIncompletos: Math.floor(metrics.processo.incompletas),
        atividadesFinalizadas: Math.floor(metrics.activity.finalizadas),
        processosFinalizados: Math.floor(metrics.processo.finalizadas)
      };

      await this.loadTeamKPIs(collaboratorId);

      this.isLoadingPlayers = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading collaborator data:', error);
      this.playerRows = [];
      this.isLoadingPlayers = false;
      this.cdr.markForCheck();
    }
  }

  /** Load monthly points breakdown */
  private async loadMonthlyPointsBreakdown(dateRange?: { start: Date; end: Date }): Promise<void> {
    try {
      if (this.teamMemberIds.length === 0) {
        this.monthlyPointsBreakdown = null;
        return;
      }

      const monthStart = dateRange ? dayjs(dateRange.start).startOf('day').toDate() : dayjs(this.selectedMonth).startOf('month').toDate();
      const monthEnd = dateRange ? dayjs(dateRange.end).endOf('day').toDate() : dayjs(this.selectedMonth).endOf('month').toDate();

      const breakdown = await firstValueFrom(
        this.teamAggregateService.getTeamMonthlyPointsBreakdown(
          this.teamMemberIds,
          monthStart,
          monthEnd
        ).pipe(takeUntil(this.destroy$))
      ).catch(() => ({ bloqueados: 0, desbloqueados: 0 }));

      this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: breakdown.desbloqueados || 0 };
      this.cdr.markForCheck();
    } catch (error) {
      this.monthlyPointsBreakdown = null;
    }
  }

  /** KPI color helper */
  private getKPIColorByGoals(current: number, target: number, superTarget: number): 'red' | 'yellow' | 'green' {
    if (current >= superTarget) return 'green';
    if (current >= target) return 'yellow';
    return 'red';
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

  /** Resolve a team ID to a display name using ACL metadata */
  private resolveTeamName(teamId: string): string {
    const entry = this.aclMetadata.find(m => m.team_id === teamId);
    return entry ? entry.team_name : teamId;
  }

  /** Get company display name from CNPJ */
  getCompanyDisplayName(cnpj: string): string {
    return this.cnpjNameMap.get(cnpj) || cnpj;
  }

  /** Format KPI value for display */
  formatKpiValue(kpi: KPIData): string {
    const value = this.roundValue(kpi.current);
    return kpi.unit ? `${value}${kpi.unit}` : `${value}`;
  }

  /** Get KPI tooltip text */
  getKpiTooltip(kpi: KPIData): string {
    return `${kpi.label}: ${this.roundValue(kpi.current)} / ${this.roundValue(kpi.target)}${kpi.unit ? ' ' + kpi.unit : ''}`;
  }

  // --- Event handlers ---

  /** Handle team change from selector */
  async onTeamChange(teamId: string): Promise<void> {
    this.selectedTeamId = teamId;
    this.teamParticipacaoCnpjs = [];
    this.supervisorCarteiraClientes = [];
    this.clientesActiveTab = 'carteira';
    this.selectedCollaborator = null;
    await this.loadTeamData();
  }

  /** Handle collaborator change from selector */
  async onCollaboratorChange(userId: string | null): Promise<void> {
    this.selectedCollaborator = userId;
    await this.loadTeamData();
  }

  /** Open the Player Detail Modal for a given player */
  openPlayerDetail(player: SupervisorTecnicoPlayerRow): void {
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

  /** Handle CNPJ selection from the Player Detail Modal */
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

  /** Open company carteira detail modal */
  openCompanyDetailModal(company: CompanyDisplay): void {
    this.selectedCarteiraCompany = company;
    this.isCompanyCarteiraDetailModalOpen = true;
    this.cdr.markForCheck();
  }

  /** Close company carteira detail modal */
  onCompanyCarteiraDetailModalClosed(): void {
    this.isCompanyCarteiraDetailModalOpen = false;
    this.selectedCarteiraCompany = null;
    this.cdr.markForCheck();
  }

  /** Handle progress card click */
  onProgressCardClicked(type: ProgressCardType): void {
    switch (type) {
      case 'atividades-finalizadas':
        this.progressModalType = 'atividades';
        break;
      case 'atividades-pontos':
        this.progressModalType = 'pontos';
        break;
      case 'processos-pendentes':
        this.progressModalType = 'processos-pendentes';
        break;
      case 'processos-finalizados':
        this.progressModalType = 'processos-finalizados';
        break;
      default:
        this.progressModalType = 'atividades';
    }
    this.isProgressModalOpen = true;
    this.cdr.markForCheck();
  }

  /** Close progress modal */
  onProgressModalClosed(): void {
    this.isProgressModalOpen = false;
    this.cdr.markForCheck();
  }

  /** Handle month filter changes */
  onMonthChange(monthsAgo: number): void {
    this.selectedMonthsAgo = monthsAgo;
    this.playerService.clearCache();
    this.loadTeamData();
  }

  /** Navigate back to the main player dashboard */
  navigateToMainDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  /** Retry sidebar data load */
  retrySidebarData(): void {
    const dateRange = this.calculateDateRange();
    this.loadSidebarData(dateRange);
  }

  /** Get team player IDs for modal */
  get teamPlayerIdsForModal(): string {
    return this.teamMemberIds.join(',');
  }

  /** Track player rows by playerId for ngFor */
  trackByPlayerId(_index: number, row: SupervisorTecnicoPlayerRow): string {
    return row.playerId;
  }

  /** Track KPIs by id for ngFor */
  trackByKpiId(_index: number, kpi: KPIData): string {
    return kpi.id;
  }

  /** Round a value for display */
  roundValue(value: number): number {
    return Math.round(value);
  }

  /** Get enabled KPIs (non-commented) */
  get enabledKPIs(): KPIData[] {
    return this.teamKPIs.filter(kpi => kpi.id !== 'numero-empresas');
  }

  /** Switch between Carteira, Carteira Individual, and Participação sub-tabs */
  switchClientesTab(tab: 'carteira' | 'participacao' | 'carteira-individual'): void {
    this.clientesActiveTab = tab;
    if (tab === 'participacao' && this.teamParticipacaoCnpjs.length === 0 && !this.isLoadingParticipacao) {
      this.loadParticipacaoData();
    }
    if (tab === 'carteira-individual' && this.supervisorCarteiraClientes.length === 0 && !this.isLoadingCarteiraIndividual) {
      this.loadCarteiraIndividualData();
    }
    this.cdr.markForCheck();
  }

  /** Load supervisor's own CNPJs from player_company__c where type = "cnpj" for Participação tab */
  private async loadParticipacaoData(): Promise<void> {
    this.isLoadingParticipacao = true;
    this.cdr.markForCheck();

    try {
      const playerId = this.getPlayerId();

      // Fetch supervisor's cnpj (participação) from player_company__c
      const cnpjList = await firstValueFrom(
        this.playerService.getPlayerCnpj(playerId).pipe(takeUntil(this.destroy$))
      ).catch(() => []);

      if (cnpjList.length === 0) {
        this.teamParticipacaoCnpjs = [];
        this.teamParticipacaoCount = 0;
        this.syncSeasonClientesCount();
        this.isLoadingParticipacao = false;
        this.cdr.markForCheck();
        return;
      }

      // Enrich with names from empid_cnpj__c and KPI data from cnpj__c
      const enrichedClientes = await firstValueFrom(
        this.companyKpiService.enrichFromCnpjResp(cnpjList).pipe(takeUntil(this.destroy$))
      ).catch(() => cnpjList.map(cnpj => ({ cnpj } as CompanyDisplay)));

      // Enrich company names if not already present
      const unknownCnpjs = enrichedClientes.filter(c => !c.name).map(c => c.cnpj);
      if (unknownCnpjs.length > 0) {
        const names = await firstValueFrom(
          this.cnpjLookupService.enrichCnpjList(unknownCnpjs).pipe(takeUntil(this.destroy$))
        ).catch(() => new Map<string, string>());
        enrichedClientes.forEach(c => {
          if (!c.name) {
            const name = names.get(c.cnpj);
            if (name) c.name = name;
          }
        });
      }

      this.teamParticipacaoCnpjs = enrichedClientes;
      this.teamParticipacaoCount = enrichedClientes.length;
      this.syncSeasonClientesCount();
    } catch (error) {
      console.error('Error loading participacao data:', error);
      this.teamParticipacaoCnpjs = [];
      this.teamParticipacaoCount = 0;
      this.syncSeasonClientesCount();
    } finally {
      this.isLoadingParticipacao = false;
      this.cdr.markForCheck();
    }
  }

  /** Load supervisor's own carteira from player_company__c where type = "cnpj_resp" for Carteira Individual tab */
  private async loadCarteiraIndividualData(): Promise<void> {
    this.isLoadingCarteiraIndividual = true;
    this.cdr.markForCheck();

    try {
      const playerId = this.getPlayerId();

      // Fetch supervisor's cnpj_resp from player_company__c
      const cnpjRespList = await firstValueFrom(
        this.playerService.getPlayerCnpjResp(playerId).pipe(takeUntil(this.destroy$))
      ).catch(() => []);

      if (cnpjRespList.length === 0) {
        this.supervisorCarteiraClientes = [];
        this.isLoadingCarteiraIndividual = false;
        this.cdr.markForCheck();
        return;
      }

      // Enrich with names from empid_cnpj__c and KPI data from cnpj__c
      const enrichedClientes = await firstValueFrom(
        this.companyKpiService.enrichFromCnpjResp(cnpjRespList).pipe(takeUntil(this.destroy$))
      ).catch(() => cnpjRespList.map(cnpj => ({ cnpj } as CompanyDisplay)));

      // Enrich company names if not already present
      const unknownCnpjs = enrichedClientes.filter(c => !c.name).map(c => c.cnpj);
      if (unknownCnpjs.length > 0) {
        const names = await firstValueFrom(
          this.cnpjLookupService.enrichCnpjList(unknownCnpjs).pipe(takeUntil(this.destroy$))
        ).catch(() => new Map<string, string>());
        enrichedClientes.forEach(c => {
          if (!c.name) {
            const name = names.get(c.cnpj);
            if (name) c.name = name;
          }
        });
      }

      this.supervisorCarteiraClientes = enrichedClientes;
    } catch (error) {
      console.error('Error loading carteira individual data:', error);
      this.supervisorCarteiraClientes = [];
    } finally {
      this.isLoadingCarteiraIndividual = false;
      this.cdr.markForCheck();
    }
  }

  private parseCnpjList(raw: unknown): string[] {
    if (raw == null) return [];
    if (typeof raw === 'string') {
      return raw.split(/[;,]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    }
    if (Array.isArray(raw)) {
      return raw.map((s: unknown) => String(s || '').trim()).filter((s: string) => s.length > 0);
    }
    return [];
  }

  private getParticipacaoCountFromRawPlayers(players: any[]): number {
    const seen = new Set<string>();
    for (const player of players) {
      const cnpjs = this.parseCnpjList(player?.extra?.['cnpj']);
      for (const cnpj of cnpjs) {
        seen.add(cnpj);
      }
    }
    return seen.size;
  }

  private syncSeasonClientesCount(): void {
    if (!this.teamSeasonProgress) {
      return;
    }
    this.teamSeasonProgress = {
      ...this.teamSeasonProgress,
      clientes: this.teamCarteiraClientes.length + this.teamParticipacaoCount
    };
  }
}
