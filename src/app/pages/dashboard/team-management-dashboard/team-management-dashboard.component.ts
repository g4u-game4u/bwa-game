import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import * as dayjs from 'dayjs';
import { trigger, transition, style, animate } from '@angular/animations';

// Services
import { TeamAggregateService, TeamSeasonPoints, TeamProgressMetrics, Collaborator } from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { FunifierApiService } from '@services/funifier-api.service';
import { PlayerService } from '@services/player.service';
import { ActionLogService } from '@services/action-log.service';
import { UserProfileService } from '@services/user-profile.service';
import { UserProfile } from '@utils/user-profile';

// Models
import { Team } from '@components/c4u-team-selector/c4u-team-selector.component';
import { GoalMetric } from '@components/c4u-goals-progress-tab/c4u-goals-progress-tab.component';
import { GraphDataPoint, ActivityMetrics, ProcessMetrics, ChartDataset } from '@app/model/gamification-dashboard.model';
import { ProgressCardType } from '@components/c4u-activity-progress/c4u-activity-progress.component';
import { ProgressListType } from '@modals/modal-progress-list/modal-progress-list.component';

/**
 * Team Management Dashboard Component
 * Main container for the management dashboard view
 * Accessible only to users with management teams (GESTAO, SUPERVISÃO, or DIREÇÃO)
 * 
 * This component orchestrates all child components and manages the data flow
 * between team selection, collaborator filtering, month selection, and data display.
 * 
 * Features:
 * - Team and collaborator selection
 * - Month-based data filtering
 * - Tab switching between Goals and Productivity views
 * - Real-time data fetching from Funifier API
 * - Loading states and error handling
 * - Data refresh with cache clearing
 * 
 * Requirements: All
 */
@Component({
  selector: 'app-team-management-dashboard',
  templateUrl: './team-management-dashboard.component.html',
  styleUrls: ['./team-management-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class TeamManagementDashboardComponent implements OnInit, OnDestroy {
  // State management
  selectedTeam: string = '';
  selectedTeamId: string = ''; // Funifier team ID (e.g., 'FkgMSNO')
  selectedCollaborator: string | null = null;
  selectedMonth: Date = new Date();
  selectedMonthsAgo: number = 0;
  activeTab: 'goals' | 'productivity' = 'goals';
  
  // Loading states
  isLoading: boolean = false;
  isLoadingTeams: boolean = false;
  isLoadingCollaborators: boolean = false;
  isLoadingSidebar: boolean = false;
  isLoadingGoals: boolean = false;
  isLoadingProductivity: boolean = false;
  
  // Error states
  hasError: boolean = false;
  errorMessage: string = '';
  hasSidebarError: boolean = false;
  sidebarErrorMessage: string = '';
  hasGoalsError: boolean = false;
  goalsErrorMessage: string = '';
  hasProductivityError: boolean = false;
  productivityErrorMessage: string = '';
  
  // Data
  teams: Team[] = [];
  collaborators: Collaborator[] = [];
  seasonPoints: TeamSeasonPoints = { total: 0, bloqueados: 0, desbloqueados: 0 };
  progressMetrics: TeamProgressMetrics = {
    processosIncompletos: 0,
    atividadesFinalizadas: 0,
    processosFinalizados: 0
  };
  seasonDates: { start: Date; end: Date } = { start: new Date(), end: new Date() };
  goalMetrics: GoalMetric[] = [];
  graphData: GraphDataPoint[] = [];
  graphDatasets: ChartDataset[] = []; // Multiple datasets for team members (one line per player)
  selectedPeriod: number = 30;
  
  // Team aggregated data from members
  teamTotalPoints: number = 0;
  teamAveragePoints: number = 0;
  teamTotalTasks: number = 0;
  teamMemberIds: string[] = [];
  teamMembersData: any[] = []; // Store full player data from aggregate (includes extra.cnpj)
  
  // Activity and Process metrics for team
  teamActivityMetrics: ActivityMetrics = {
    pendentes: 0,
    emExecucao: 0,
    finalizadas: 0,
    pontos: 0
  };
  teamProcessMetrics: ProcessMetrics = {
    pendentes: 0,
    incompletas: 0,
    finalizadas: 0
  };
  
  // Company/Carteira data for team
  teamCarteiraClientes: { cnpj: string; actionCount: number }[] = [];
  isLoadingCarteira: boolean = false;
  
  // Modal states
  isProgressModalOpen: boolean = false;
  progressModalType: ProgressListType = 'atividades';
  isCarteiraModalOpen: boolean = false;
  
  // Refresh tracking
  lastRefresh: Date = new Date();
  
  // Accessibility properties
  screenReaderAnnouncement: string = '';
  
  // Cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private teamAggregateService: TeamAggregateService,
    private graphDataProcessor: GraphDataProcessorService,
    private seasonDatesService: SeasonDatesService,
    private toastService: ToastService,
    private sessaoProvider: SessaoProvider,
    private funifierApi: FunifierApiService,
    private playerService: PlayerService,
    private actionLogService: ActionLogService,
    private userProfileService: UserProfileService,
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

  /**
   * Initialize dashboard by loading user's team and season dates.
   * 
   * This method is called on component initialization and performs the following:
   * 1. Loads season dates from the SeasonDatesService
   * 2. Identifies the user's management team (GESTAO, SUPERVISÃO, or DIREÇÃO)
   * 3. Fetches team information from Funifier to get the team name
   * 4. Loads all data for the user's team
   * 
   * @private
   * @async
   * @returns Promise that resolves when initialization is complete
   * 
   * @example
   * // Called automatically in ngOnInit
   * await this.initializeDashboard();
   */
  private async initializeDashboard(): Promise<void> {
    try {
      this.isLoading = true;
      console.log('🚀 Initializing team management dashboard...');
      
      // Load season dates first
      console.log('📅 Loading season dates...');
      await this.loadSeasonDates();
      console.log('✅ Season dates loaded');
      
      // Load available teams that the user has access to
      console.log('👥 Loading available teams...');
      await this.loadAvailableTeams();
      console.log('✅ Available teams loaded:', this.teams.length);
      
      // Select the first available team or previously selected team
      if (this.teams.length > 0) {
        const savedTeamId = localStorage.getItem('selectedTeamId');
        const teamToSelect = savedTeamId && this.teams.find(t => t.id === savedTeamId) 
          ? savedTeamId 
          : this.teams[0].id;
        
        await this.onTeamChange(teamToSelect);
        console.log('✅ Initial team selected:', teamToSelect);
      } else {
        console.error('❌ No teams available for user');
        this.toastService.error('Usuário não tem acesso a nenhum time');
      }
    } catch (error) {
      console.error('❌ Error initializing dashboard:', error);
      this.toastService.error('Erro ao carregar dashboard');
    } finally {
      this.isLoading = false;
      console.log('🏁 Dashboard initialization complete, isLoading:', this.isLoading);
      this.cdr.markForCheck();
    }
  }

  /**
   * Load season dates from SeasonDatesService.
   * 
   * Fetches the current season's start and end dates. If the service fails,
   * falls back to default dates (January 1 to December 31 of current year).
   * 
   * @private
   * @async
   * @returns Promise that resolves when season dates are loaded
   * 
   * @example
   * await this.loadSeasonDates();
   * console.log(this.seasonDates); // { start: Date, end: Date }
   */
  private async loadSeasonDates(): Promise<void> {
    try {
      const dates = await this.seasonDatesService.getSeasonDates();
      this.seasonDates = {
        start: (dates as any).start || (dates as any).dataInicio,
        end: (dates as any).end || (dates as any).dataFim
      };
    } catch (error) {
      console.error('Error loading season dates:', error);
      // Use default dates if service fails
      const now = new Date();
      this.seasonDates = {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(now.getFullYear(), 11, 31)
      };
    }
  }

  /**
   * Get the management team ID that the current user belongs to.
   * 
   * Uses UserProfileService to get the user's own team ID based on their profile.
   * 
   * @private
   * @returns The team ID if user belongs to a management team, null otherwise
   * 
   * @example
   * const teamId = this.getUserManagementTeamId();
   * // Returns: 'FkgMSNO' or 'Fkku5tB' or null (DIRETOR returns null as they can see all)
   */
  private getUserManagementTeamId(): string | null {
    return this.userProfileService.getCurrentUserOwnTeamId();
  }

  /**
   * Load all available teams from Funifier and filter by user profile.
   * 
   * Filtering logic based on profile:
   * - JOGADOR: No teams (should not reach here)
   * - SUPERVISOR: Only their own SUPERVISÃO team
   * - GESTOR: Their GESTAO team and potentially other teams they manage
   * - DIRETOR: All teams (no filtering)
   * 
   * @private
   * @async
   * @returns Promise that resolves when teams are loaded
   */
  private async loadAvailableTeams(): Promise<void> {
    try {
      this.isLoadingTeams = true;
      
      const profile = this.userProfileService.getCurrentUserProfile();
      console.log('👤 User profile:', profile);
      
      // Fetch all teams from Funifier
      const allTeams = await firstValueFrom(
        this.funifierApi.get<any[]>(`/v3/team`).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error loading teams from Funifier:', error);
        return [];
      });
      
      console.log('📊 All teams from Funifier:', allTeams);
      
      let availableTeams: any[] = [];
      
      if (profile === UserProfile.DIRETOR) {
        // DIRETOR can see all teams
        availableTeams = allTeams.map((team: any) => ({
          id: team._id || team.id,
          name: team.name || team._id || team.id,
          memberCount: 0 // Will be updated below
        }));
        console.log('✅ DIRETOR: Showing all teams:', availableTeams.length);
      } else {
        // Get accessible team IDs based on profile
        const accessibleTeamIds = this.userProfileService.getAccessibleTeamIds();
        console.log('👤 Accessible team IDs for profile:', accessibleTeamIds);
        
        if (accessibleTeamIds.length === 0) {
          // For SUPERVISOR and GESTOR, if no accessible teams found, try to get their own team
          const ownTeamId = this.userProfileService.getCurrentUserOwnTeamId();
          if (ownTeamId) {
            accessibleTeamIds.push(ownTeamId);
            console.log('👤 Using own team ID:', ownTeamId);
          }
        }
        
        // Filter teams to show only those the user has access to
        availableTeams = allTeams
          .filter((team: any) => {
            const teamId = team._id || team.id;
            return accessibleTeamIds.includes(teamId);
          })
          .map((team: any) => ({
            id: team._id || team.id,
            name: team.name || team._id || team.id,
            memberCount: 0 // Will be updated below
          }));
        
        console.log('✅ Available teams for profile:', profile, availableTeams.length);
      }
      
      // Load member count for each team using aggregate queries
      const memberCountPromises = availableTeams.map(async (team) => {
        try {
          const aggregatePayload = [
            {
              $match: {
                teams: team.id
              }
            },
            {
              $count: 'total'
            }
          ];
          
          const result = await firstValueFrom(
            this.funifierApi.post<any[]>(
              `/database/player/aggregate?strict=true`,
              aggregatePayload
            ).pipe(takeUntil(this.destroy$))
          ).catch((error) => {
            console.error(`Error loading member count for team ${team.id}:`, error);
            return [];
          });
          
          // Extract count from result
          const count = result && result.length > 0 && result[0].total ? result[0].total : 0;
          return { ...team, memberCount: count };
        } catch (error) {
          console.error(`Error processing member count for team ${team.id}:`, error);
          return { ...team, memberCount: 0 };
        }
      });
      
      // Wait for all member counts to be loaded
      const teamsWithCounts = await Promise.all(memberCountPromises);
      
      this.teams = teamsWithCounts;
      console.log('✅ Available teams loaded with member counts:', this.teams);
      
      this.isLoadingTeams = false;
    } catch (error) {
      console.error('Error in loadAvailableTeams:', error);
      this.teams = [];
      this.isLoadingTeams = false;
      this.toastService.error('Erro ao carregar equipes');
    }
  }

  /**
   * Load team members data (member IDs, points, tasks) from Funifier.
   * 
   * Uses POST aggregate query to /database/player/aggregate?strict=true
   * to filter players by team membership, then fetches status data for each member.
   * 
   * @private
   * @async
   * @param teamId - The Funifier team ID (e.g., 'FkgMSNO')
   * @returns Promise that resolves when team members data is loaded
   */
  private async loadTeamMembersData(teamId: string): Promise<void> {
    try {
      console.log('👥 Loading team members data for team:', teamId);
      
      // Step 1: Get member IDs using aggregate query
      // Filter players by team membership using $match
      const aggregatePayload = [
        {
          $match: {
            teams: teamId
          }
        }
      ];
      
      const players = await firstValueFrom(
        this.funifierApi.post<any[]>(
          `/database/player/aggregate?strict=true`,
          aggregatePayload
        ).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error loading team members via aggregate:', error);
        return [];
      });
      
      // Store full player data from aggregate (includes extra.cnpj, name, email, etc.)
      this.teamMembersData = players;
      
      // Extract member IDs from aggregate result
      // The result should contain player documents with _id field
      const memberIds = players
        .map((player: any) => player._id)
        .filter((id: any) => id != null) as string[];
      
      this.teamMemberIds = memberIds;
      console.log('✅ Team member IDs loaded via aggregate:', memberIds.length, 'members');
      console.log('✅ Team members data stored:', this.teamMembersData.length, 'players with full data');
      
      if (memberIds.length === 0) {
        console.warn('⚠️ No members found in team');
        this.teamTotalPoints = 0;
        this.teamAveragePoints = 0;
        this.teamTotalTasks = 0;
        this.cdr.markForCheck();
        return;
      }
      
      // Step 2: Fetch raw status data for each member in parallel
      // We need the raw data to access total_points and extra fields
      const memberDataPromises = memberIds.map(memberId => 
        firstValueFrom(
          this.funifierApi.get<any>(`/v3/player/${memberId}/status`).pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error(`Error loading status for member ${memberId}:`, error);
          return null;
        })
      );
      
      const memberStatuses = await Promise.all(memberDataPromises);
      
      // Step 3: Aggregate data from all members
      let totalPoints = 0;
      let totalTasks = 0;
      let validMembers = 0;
      
      memberStatuses.forEach((status, index) => {
        if (status) {
          // Get total points from status (raw API response has total_points)
          const points = status.total_points || 0;
          totalPoints += points;
          
          // Get tasks completed from extra.tarefas_finalizadas
          const tasks = status.extra?.tarefas_finalizadas || 0;
          totalTasks += tasks;
          
          validMembers++;
          console.log(`📊 Member ${memberIds[index]}: ${points} points, ${tasks} tasks`);
        }
      });
      
      // Calculate aggregated metrics
      this.teamTotalPoints = totalPoints;
      this.teamAveragePoints = validMembers > 0 ? totalPoints / validMembers : 0;
      this.teamTotalTasks = totalTasks;
      
      console.log('✅ Team aggregated data:', {
        totalPoints: this.teamTotalPoints,
        averagePoints: this.teamAveragePoints,
        totalTasks: this.teamTotalTasks,
        validMembers
      });
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadTeamMembersData:', error);
      this.teamTotalPoints = 0;
      this.teamAveragePoints = 0;
      this.teamTotalTasks = 0;
      this.cdr.markForCheck();
    }
  }

  /**
   * Load all team data including sidebar metrics, collaborators, goals, and productivity.
   * 
   * This method orchestrates loading of all dashboard data by:
   * 1. Calculating the date range based on selected month
   * 2. Loading sidebar data (points and progress metrics) in parallel
   * 3. Loading collaborators list
   * 4. Loading goals data
   * 5. Loading productivity graph data
   * 6. Updating the last refresh timestamp
   * 
   * All data loading operations run in parallel using Promise.all for optimal performance.
   * 
   * @async
   * @returns Promise that resolves when all data is loaded
   * 
   * @example
   * // Called when team, collaborator, or month changes
   * await this.loadTeamData();
   * 
   * @see {@link loadSidebarData}
   * @see {@link loadCollaborators}
   * @see {@link loadGoalsData}
   * @see {@link loadProductivityData}
   */
  async loadTeamData(): Promise<void> {
    if (!this.selectedTeam || !this.selectedTeamId) {
      return;
    }
    
    try {
      this.isLoading = true;
      
      // Calculate date range based on selected month
      const dateRange = this.calculateDateRange();
      
      // Load data in parallel
      await Promise.all([
        this.loadSidebarData(dateRange),
        this.loadCollaborators(),
        this.loadGoalsData(dateRange),
        this.loadProductivityData(dateRange),
        this.loadTeamActivityAndMacroData(dateRange),
        this.loadTeamCarteiraData(dateRange)
      ]);
      
      this.lastRefresh = new Date();
    } catch (error) {
      console.error('Error loading team data:', error);
      this.toastService.error('Erro ao carregar dados da equipe');
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Calculate date range based on selected month.
   * 
   * Uses the selectedMonthsAgo property to calculate the start and end dates.
   * When February is selected (selectedMonthsAgo = 1), includes January as well.
   * For example:
   * - selectedMonthsAgo = 0: Current month only
   * - selectedMonthsAgo = 1: January + February (if February is selected)
   * - selectedMonthsAgo = 2: Two months ago only
   * 
   * @private
   * @returns Object containing start and end dates
   * 
   * @example
   * this.selectedMonthsAgo = 1; // February selected
   * const range = this.calculateDateRange();
   * // Returns: { start: Date(2026-01-01), end: Date(2026-02-28) }
   */
  private calculateDateRange(): { start: Date; end: Date } {
    const now = dayjs();
    const targetMonth = now.subtract(this.selectedMonthsAgo, 'month');
    
    // If February is selected (1 month ago), include January as well
    if (this.selectedMonthsAgo === 1) {
      const january = targetMonth.subtract(1, 'month');
      return {
        start: january.startOf('month').toDate(),
        end: targetMonth.endOf('month').toDate()
      };
    }
    
    // For other months, return only the selected month
    return {
      start: targetMonth.startOf('month').toDate(),
      end: targetMonth.endOf('month').toDate()
    };
  }

  /**
   * Load sidebar data (season points and progress metrics)
   */
  private async loadSidebarData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingSidebar = true;
      this.hasSidebarError = false;
      this.sidebarErrorMessage = '';
      
      console.log('📊 Loading sidebar data for team:', this.selectedTeam);
      
      // Load season points and progress metrics in parallel
      const [points, metrics] = await Promise.all([
        firstValueFrom(
          this.teamAggregateService
            .getTeamSeasonPoints(this.selectedTeam, dateRange.start, dateRange.end)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error('Error loading season points:', error);
          this.hasSidebarError = true;
          this.sidebarErrorMessage = 'Erro ao carregar pontos da temporada';
          this.toastService.error('Erro ao carregar pontos da temporada');
          return { total: 0, bloqueados: 0, desbloqueados: 0 };
        }),
        firstValueFrom(
          this.teamAggregateService
            .getTeamProgressMetrics(this.selectedTeam, dateRange.start, dateRange.end)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error('Error loading progress metrics:', error);
          this.hasSidebarError = true;
          this.sidebarErrorMessage = 'Erro ao carregar métricas de progresso';
          this.toastService.error('Erro ao carregar métricas de progresso');
          return {
            processosIncompletos: 0,
            atividadesFinalizadas: 0,
            processosFinalizados: 0
          };
        })
      ]);
      
      // Use aggregated data from team members (from loadTeamMembersData)
      // The aggregate queries may not capture all member data, so we prioritize
      // the data fetched directly from member statuses
      this.seasonPoints = {
        total: this.teamTotalPoints > 0 ? this.teamTotalPoints : points.total,
        bloqueados: points.bloqueados,
        desbloqueados: this.teamTotalPoints > 0 ? this.teamTotalPoints : points.desbloqueados
      };
      
      // Update progress metrics with aggregated tasks from members
      this.progressMetrics = {
        processosIncompletos: metrics.processosIncompletos,
        atividadesFinalizadas: this.teamTotalTasks > 0 ? this.teamTotalTasks : metrics.atividadesFinalizadas,
        processosFinalizados: metrics.processosFinalizados
      };
      
      this.isLoadingSidebar = false;
      
      console.log('✅ Sidebar data loaded:', { 
        points: this.seasonPoints, 
        metrics: this.progressMetrics,
        teamTotalPoints: this.teamTotalPoints,
        teamAveragePoints: this.teamAveragePoints,
        teamTotalTasks: this.teamTotalTasks
      });
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadSidebarData:', error);
      this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
      this.isLoadingSidebar = false;
    }
  }

  /**
   * Load collaborators for selected team
   * 
   * Uses the member IDs already loaded from loadTeamMembersData to fetch
   * collaborator information (name, email) from player status.
   */
  private async loadCollaborators(): Promise<void> {
    try {
      this.isLoadingCollaborators = true;
      console.log('👥 Loading collaborators for team:', this.selectedTeam);
      
      // Use member IDs already loaded from loadTeamMembersData
      if (this.teamMemberIds.length === 0) {
        console.warn('⚠️ No member IDs available, trying to load from aggregate query');
        // Fallback: try to load from aggregate query
        const members = await firstValueFrom(
          this.teamAggregateService
            .getTeamMembers(this.selectedTeam)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error('Error loading collaborators:', error);
          return [];
        });
        
        this.collaborators = members;
      } else {
        // Fetch player info for each member ID to get name and email
        const collaboratorPromises = this.teamMemberIds.map(memberId =>
          firstValueFrom(
            this.funifierApi.get<any>(`/v3/player/${memberId}/status`).pipe(takeUntil(this.destroy$))
          ).then((status) => ({
            userId: memberId,
            name: status.name || memberId,
            email: status._id || memberId
          })).catch((error) => {
            console.error(`Error loading collaborator info for ${memberId}:`, error);
            return {
              userId: memberId,
              name: memberId,
              email: memberId
            };
          })
        );
        
        this.collaborators = await Promise.all(collaboratorPromises);
      }
      
      this.isLoadingCollaborators = false;
      console.log('✅ Collaborators loaded:', this.collaborators.length);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadCollaborators:', error);
      this.collaborators = [];
      this.isLoadingCollaborators = false;
    }
  }

  /**
   * Load goals data
   */
  private async loadGoalsData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingGoals = true;
      this.hasGoalsError = false;
      this.goalsErrorMessage = '';
      
      // Create goal metrics from progress metrics
      // In a real implementation, you might have separate goal targets configured
      this.goalMetrics = [
        {
          id: 'processos-finalizados',
          label: 'Processos Finalizados',
          current: this.progressMetrics.processosFinalizados,
          target: 100, // TODO: Get from configuration
          unit: ''
        },
        {
          id: 'atividades-finalizadas',
          label: 'Atividades Finalizadas',
          current: this.progressMetrics.atividadesFinalizadas,
          target: 500, // TODO: Get from configuration
          unit: ''
        }
      ];
      
      this.isLoadingGoals = false;
    } catch (error) {
      console.error('Error loading goals data:', error);
      this.goalMetrics = [];
      this.isLoadingGoals = false;
      this.hasGoalsError = true;
      this.goalsErrorMessage = 'Erro ao carregar dados de metas';
      this.toastService.error('Erro ao carregar dados de metas');
    }
  }

  /**
   * Load productivity graph data with one line per team member
   */
  private async loadProductivityData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingProductivity = true;
      this.hasProductivityError = false;
      this.productivityErrorMessage = '';
      
      console.log('📈 Loading productivity data for team members...');
      
      if (this.teamMemberIds.length === 0) {
        console.warn('⚠️ No team members to load productivity data for');
        this.graphData = [];
        this.graphDatasets = [];
        this.isLoadingProductivity = false;
        return;
      }
      
      // For productivity tab, use the selected period instead of month range
      const endDate = dayjs();
      const startDate = endDate.subtract(this.selectedPeriod, 'day');
      
      try {
        // Load daily productivity data for each team member
        const memberProductivityPromises = this.teamMemberIds.map(async (memberId) => {
          try {
            // Get collaborator name for the label
            const collaborator = this.collaborators.find(c => c.userId === memberId);
            const memberName = collaborator?.name || memberId;
            
            // Query action_log for daily completed tasks count for this member
            const aggregateBody = [
              {
                $match: {
                  userId: memberId,
                  time: {
                    $gte: { $date: startDate.toISOString() },
                    $lte: { $date: endDate.toISOString() }
                  }
                }
              },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: { $toDate: '$time' }
                    }
                  },
                  count: { $sum: 1 }
                }
              },
              {
                $sort: { _id: 1 }
              }
            ];
            
            const dailyData = await firstValueFrom(
              this.funifierApi.post<any[]>(
                '/v3/database/action_log/aggregate?strict=true',
                aggregateBody
              ).pipe(takeUntil(this.destroy$))
            ).catch((error) => {
              console.error(`Error loading productivity for member ${memberId}:`, error);
              return [];
            });
            
            // Convert to GraphDataPoint format
            const dataPoints: GraphDataPoint[] = [];
            const dataMap = new Map<string, number>();
            
            dailyData.forEach((item: any) => {
              const dateStr = item._id;
              const count = item.count || 0;
              dataMap.set(dateStr, count);
            });
            
            // Fill all dates in range
            let currentDate = startDate;
            while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
              const dateStr = currentDate.format('YYYY-MM-DD');
              dataPoints.push({
                date: currentDate.toDate(),
                value: dataMap.get(dateStr) || 0
              });
              currentDate = currentDate.add(1, 'day');
            }
            
            return {
              memberId,
              memberName,
              dataPoints
            };
          } catch (error) {
            console.error(`Error processing productivity for member ${memberId}:`, error);
            return null;
          }
        });
        
        const allMemberData = await Promise.all(memberProductivityPromises);
        const validMemberData = allMemberData.filter(d => d !== null) as Array<{ memberId: string; memberName: string; dataPoints: GraphDataPoint[] }>;
        
        // Create multiple datasets (one per member) using GraphDataProcessorService
        if (validMemberData.length > 0) {
          // Generate date labels
          const dateLabels = this.graphDataProcessor.getDateLabels(this.selectedPeriod);
          
          // Create datasets for each member
          this.graphDatasets = validMemberData.map((memberData, index) => {
            const colors = this.getColorForIndex(index);
            return {
              label: memberData.memberName,
              data: memberData.dataPoints.map(point => point.value),
              borderColor: colors.border,
              backgroundColor: colors.background,
              fill: false
            };
          });
          
          // Also set graphData for backward compatibility (aggregated)
          const aggregatedMap = new Map<string, number>();
          validMemberData.forEach(memberData => {
            memberData.dataPoints.forEach(point => {
              const dateStr = dayjs(point.date).format('YYYY-MM-DD');
              aggregatedMap.set(dateStr, (aggregatedMap.get(dateStr) || 0) + point.value);
            });
          });
          
          const aggregatedPoints: GraphDataPoint[] = [];
          let currentDate = startDate;
          while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
            const dateStr = currentDate.format('YYYY-MM-DD');
            aggregatedPoints.push({
              date: currentDate.toDate(),
              value: aggregatedMap.get(dateStr) || 0
            });
            currentDate = currentDate.add(1, 'day');
          }
          
          this.graphData = aggregatedPoints;
        } else {
          this.graphData = [];
          this.graphDatasets = [];
        }
        
        this.hasProductivityError = false;
        console.log('✅ Productivity data loaded for', validMemberData.length, 'members');
        this.cdr.markForCheck();
      } catch (error) {
        console.error('Error loading productivity data:', error);
        this.graphData = [];
        this.graphDatasets = [];
        this.hasProductivityError = true;
        this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
        this.toastService.error('Erro ao carregar dados de produtividade');
      } finally {
        this.isLoadingProductivity = false;
      }
    } catch (error) {
      console.error('Error in loadProductivityData:', error);
      this.hasProductivityError = true;
      this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
      this.isLoadingProductivity = false;
    }
  }

  /**
   * Get color for dataset by index (cycling through palette)
   */
  private getColorForIndex(index: number): { border: string; background: string } {
    const colorPalette = [
      { border: 'rgba(75, 192, 192, 1)', background: 'rgba(75, 192, 192, 0.2)' },
      { border: 'rgba(255, 99, 132, 1)', background: 'rgba(255, 99, 132, 0.2)' },
      { border: 'rgba(54, 162, 235, 1)', background: 'rgba(54, 162, 235, 0.2)' },
      { border: 'rgba(255, 206, 86, 1)', background: 'rgba(255, 206, 86, 0.2)' },
      { border: 'rgba(153, 102, 255, 1)', background: 'rgba(153, 102, 255, 0.2)' },
      { border: 'rgba(255, 159, 64, 1)', background: 'rgba(255, 159, 64, 0.2)' }
    ];
    return colorPalette[index % colorPalette.length];
  }

  /**
   * Load team activity and process metrics aggregated from all team members
   */
  private async loadTeamActivityAndMacroData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      console.log('📊 Loading team activity and process data...');
      
      if (this.teamMemberIds.length === 0) {
        console.warn('⚠️ No team members to aggregate data from');
        return;
      }
      
      // Load metrics for each team member in parallel
      const memberMetricsPromises = this.teamMemberIds.map(memberId =>
        firstValueFrom(
          this.actionLogService.getProgressMetrics(memberId, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error(`Error loading metrics for member ${memberId}:`, error);
          return {
            activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
            processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
          };
        })
      );
      
      const allMetrics = await Promise.all(memberMetricsPromises);
      
      // Aggregate metrics from all members
      let totalPendentes = 0;
      let totalEmExecucao = 0;
      let totalFinalizadas = 0;
      let totalPontos = 0;
      let totalProcessPendentes = 0;
      let totalProcessIncompletas = 0;
      let totalProcessFinalizadas = 0;
      
      allMetrics.forEach(metrics => {
        totalPendentes += metrics.activity.pendentes;
        totalEmExecucao += metrics.activity.emExecucao;
        totalFinalizadas += metrics.activity.finalizadas;
        totalPontos += metrics.activity.pontos;
        totalProcessPendentes += metrics.processo.pendentes;
        totalProcessIncompletas += metrics.processo.incompletas;
        totalProcessFinalizadas += metrics.processo.finalizadas;
      });
      
      this.teamActivityMetrics = {
        pendentes: totalPendentes,
        emExecucao: totalEmExecucao,
        finalizadas: totalFinalizadas,
        pontos: totalPontos
      };
      
      this.teamProcessMetrics = {
        pendentes: totalProcessPendentes,
        incompletas: totalProcessIncompletas,
        finalizadas: totalProcessFinalizadas
      };
      
      console.log('✅ Team activity and process data loaded:', {
        activities: this.teamActivityMetrics,
        processos: this.teamProcessMetrics
      });
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team activity and process data:', error);
    }
  }

  /**
   * Load team carteira (companies/CNPJs) data aggregated from all team members
   * Uses CNPJs from extra.cnpj field in player aggregate data instead of making individual requests
   */
  private async loadTeamCarteiraData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingCarteira = true;
      console.log('📊 Loading team carteira data from aggregate...');
      
      if (this.teamMembersData.length === 0) {
        console.warn('⚠️ No team members data to extract CNPJs from');
        this.teamCarteiraClientes = [];
        this.isLoadingCarteira = false;
        this.cdr.markForCheck();
        return;
      }
      
      // Extract CNPJs from extra.cnpj field of each player
      // CNPJs are stored as comma-separated strings (e.g., "3438,3660,3450")
      const cnpjMap = new Map<string, number>();
      
      this.teamMembersData.forEach((player: any) => {
        const cnpjString = player.extra?.cnpj;
        if (cnpjString && typeof cnpjString === 'string') {
          // Split comma-separated CNPJs and count each one
          const cnpjs = cnpjString.split(',').map((cnpj: string) => cnpj.trim()).filter((cnpj: string) => cnpj.length > 0);
          
          cnpjs.forEach((cnpj: string) => {
            // Count each CNPJ occurrence (each player contributes 1 count per CNPJ they have)
            const currentCount = cnpjMap.get(cnpj) || 0;
            cnpjMap.set(cnpj, currentCount + 1);
          });
        }
      });
      
      // Convert map to array and sort by count (descending)
      this.teamCarteiraClientes = Array.from(cnpjMap.entries())
        .map(([cnpj, actionCount]) => ({ cnpj, actionCount }))
        .sort((a, b) => b.actionCount - a.actionCount);
      
      console.log('✅ Team carteira data loaded from aggregate:', this.teamCarteiraClientes.length, 'unique CNPJs');
      
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team carteira data:', error);
      this.teamCarteiraClientes = [];
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Handle team selection change event.
   * 
   * When a user selects a different team from the dropdown:
   * 1. Updates the selectedTeamId (Funifier team ID) and selectedTeam (team name)
   * 2. Resets the collaborator filter to null (show all team members)
   * 3. Loads team members data for the selected team
   * 4. Reloads all team data for the new team
   * 5. Saves the selection to localStorage for persistence
   * 
   * @param teamId - The Funifier team ID (e.g., 'FkgMSNO')
   * 
   * @example
   * // Called from template when team selector changes
   * await this.onTeamChange('FkgMSNO');
   * 
   * @see {@link loadTeamMembersData}
   * @see {@link loadTeamData}
   */
  async onTeamChange(teamId: string): Promise<void> {
    try {
      console.log('🔄 Team changed to:', teamId);
      
      // Find the team in the teams array to get the name
      const team = this.teams.find(t => t.id === teamId);
      if (!team) {
        console.error('Team not found:', teamId);
        return;
      }
      
      // Set selected team ID and name
      this.selectedTeamId = teamId;
      this.selectedTeam = team.name;
      
      // Reset collaborator filter
      this.selectedCollaborator = null;
      
      // Save selection to localStorage
      localStorage.setItem('selectedTeamId', teamId);
      
      // Load team members data first (this sets teamTotalPoints, etc.)
      await this.loadTeamMembersData(teamId);
      
      // Then load all other team data
      await this.loadTeamData();
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in onTeamChange:', error);
      this.toastService.error('Erro ao carregar dados do time');
    }
  }

  /**
   * Handle collaborator selection change event.
   * 
   * When a user selects a specific collaborator:
   * 1. Navigates to the gamification-dashboard for that player
   * 
   * If null is passed, does nothing (should not happen as we always navigate).
   * 
   * @param userId - The user ID (email) of the selected collaborator
   * 
   * @example
   * // Navigate to collaborator's dashboard
   * onCollaboratorChange('user@example.com');
   * // Navigates to /dashboard?playerId=user@example.com
   */
  onCollaboratorChange(userId: string | null): void {
    if (!userId) {
      console.warn('No collaborator selected');
      return;
    }
    
    console.log('👤 Navigating to collaborator dashboard:', userId);
    
    // Navigate to gamification dashboard with player ID as query parameter
    this.router.navigate(['/dashboard'], {
      queryParams: { playerId: userId }
    });
  }

  /**
   * Handle month selection change event.
   * 
   * When a user navigates to a different month:
   * 1. Updates the selectedMonthsAgo property
   * 2. Updates the selectedMonth Date object
   * 3. Reloads all team data for the new month
   * 
   * @param monthsAgo - Number of months before current month (0 = current, 1 = previous, etc.)
   * 
   * @example
   * // Current month
   * onMonthChange(0);
   * 
   * // Previous month
   * onMonthChange(1);
   * 
   * // Two months ago
   * onMonthChange(2);
   * 
   * @see {@link loadTeamData}
   * @see {@link calculateDateRange}
   */
  onMonthChange(monthsAgo: number): void {
    this.selectedMonthsAgo = monthsAgo;
    this.selectedMonth = dayjs().subtract(monthsAgo, 'month').toDate();
    this.loadTeamData();
  }

  /**
   * Handle period change from productivity tab
   */
  onPeriodChange(period: number): void {
    this.selectedPeriod = period;
    const dateRange = {
      start: dayjs().subtract(period, 'day').toDate(),
      end: new Date()
    };
    this.loadProductivityData(dateRange);
  }

  /**
   * Handle chart type change from productivity tab
   */
  onChartTypeChange(chartType: 'line' | 'bar'): void {
    // Chart type is managed by the child component
    // No action needed here
  }

  /**
   * Switch active tab
   */
  switchTab(tab: 'goals' | 'productivity'): void {
    this.activeTab = tab;
  }

  /**
   * Refresh all dashboard data with cache clearing.
   * 
   * This method:
   * 1. Sets loading state to true
   * 2. Clears all cached data in TeamAggregateService
   * 3. Reloads all team data from the API
   * 4. Preserves user selections (team, collaborator, month, tab)
   * 5. Updates the last refresh timestamp
   * 
   * Use this when you need to ensure the latest data is displayed,
   * bypassing the 5-minute cache.
   * 
   * @example
   * // Called when user clicks refresh button
   * refreshData();
   * 
   * @see {@link TeamAggregateService.clearCache}
   * @see {@link loadTeamData}
   */
  refreshData(): void {
    this.isLoading = true;
    
    // Clear cache
    this.teamAggregateService.clearCache();
    
    // Reload data
    this.loadTeamData();
  }

  /**
   * Get formatted last refresh time as HH:mm:ss string.
   * 
   * Formats the lastRefresh Date object into a time string for display
   * in the dashboard header.
   * 
   * @returns Formatted time string (e.g., "14:35:22")
   * 
   * @example
   * const time = this.getLastRefreshTime();
   * // Returns: "14:35:22"
   */
  getLastRefreshTime(): string {
    return dayjs(this.lastRefresh).format('HH:mm:ss');
  }

  /**
   * Get the display name of the currently selected team.
   * 
   * Looks up the team name from the teams array based on the selectedTeamId.
   * Returns the selectedTeam name directly if available, or looks it up from teams array.
   * 
   * @returns Team display name or empty string
   * 
   * @example
   * this.selectedTeamId = 'FkgMSNO';
   * const name = this.teamName;
   * // Returns: "GESTAO" or the team name from Funifier
   */
  get teamName(): string {
    // If selectedTeam is already set (team name), return it
    if (this.selectedTeam) {
      return this.selectedTeam;
    }
    
    // Otherwise, look it up from teams array using selectedTeamId
    if (this.selectedTeamId) {
      const team = this.teams.find(t => t.id === this.selectedTeamId);
      return team ? team.name : this.selectedTeamId;
    }
    
    return '';
  }

  /**
   * Retry loading sidebar data after an error.
   * 
   * Called when the user clicks a retry button in the sidebar error state.
   * Recalculates the date range and attempts to load sidebar data again.
   * 
   * @example
   * // Called from template on retry button click
   * <button (click)="retrySidebarData()">Retry</button>
   * 
   * @see {@link loadSidebarData}
   * @requirements 14.3 - Retry logic for failed queries
   */
  retrySidebarData(): void {
    const dateRange = this.calculateDateRange();
    this.loadSidebarData(dateRange);
  }

  /**
   * Retry loading goals data
   * Requirements: 14.3
   */
  retryGoalsData(): void {
    const dateRange = this.calculateDateRange();
    this.loadGoalsData(dateRange);
  }

  /**
   * Retry loading productivity data
   * Requirements: 14.3
   */
  retryProductivityData(): void {
    const dateRange = this.calculateDateRange();
    this.loadProductivityData(dateRange);
  }

  /**
   * Handle progress card click to open modal
   */
  onProgressCardClicked(type: ProgressCardType): void {
    // Map ProgressCardType to ProgressListType
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
  }

  /**
   * Close progress modal
   */
  onProgressModalClosed(): void {
    this.isProgressModalOpen = false;
  }

  /**
   * Open carteira modal
   */
  openCarteiraModal(): void {
    this.isCarteiraModalOpen = true;
  }

  /**
   * Close carteira modal
   */
  onCarteiraModalClosed(): void {
    this.isCarteiraModalOpen = false;
  }

  /**
   * Get team player IDs as comma-separated string for modal
   * The modal expects a single playerId, but we'll pass all team member IDs
   */
  get teamPlayerIdsForModal(): string {
    return this.teamMemberIds.join(',');
  }

  /**
   * Logout user and redirect to login page
   */
  logout(): void {
    this.sessaoProvider.logout();
  }
}
