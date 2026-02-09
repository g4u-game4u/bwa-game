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
import { CompanyDisplay, CompanyKpiService } from '@services/company-kpi.service';
import { KPIData } from '@app/model/gamification-dashboard.model';
import { KPIService } from '@services/kpi.service';

// Models
import { Team } from '@components/c4u-team-selector/c4u-team-selector.component';
import { GoalMetric } from '@components/c4u-goals-progress-tab/c4u-goals-progress-tab.component';
import { GraphDataPoint, ActivityMetrics, ProcessMetrics, ChartDataset, PointWallet, SeasonProgress } from '@app/model/gamification-dashboard.model';
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
  selectedTeamId: string = ''; // Funifier team ID (e.g., 'FkmdnFU')
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
  displayTeamName: string = ''; // Explicit property for team name display (for OnPush change detection)
  seasonPoints: TeamSeasonPoints = { total: 0, bloqueados: 0, desbloqueados: 0 };
  progressMetrics: TeamProgressMetrics = {
    processosIncompletos: 0,
    atividadesFinalizadas: 0,
    processosFinalizados: 0
  };
  seasonDates: { start: Date; end: Date } = { start: new Date(), end: new Date() };
  
  // Formatted data for gamification dashboard components
  teamPointWallet: PointWallet | null = null;
  teamSeasonProgress: SeasonProgress | null = null;
  teamKPIs: KPIData[] = [];
  isLoadingKPIs: boolean = false;
  goalMetrics: GoalMetric[] = [];
  graphData: GraphDataPoint[] = []; // Activities data
  graphDatasets: ChartDataset[] = []; // Multiple datasets for team members (one line per player) - Activities
  pointsGraphData: GraphDataPoint[] = []; // Points data
  pointsGraphDatasets: ChartDataset[] = []; // Multiple datasets for team members (one line per player) - Points
  selectedPeriod: number = 30;
  
  // Bar charts data for collaborator comparison
  activitiesByCollaboratorGraphData: GraphDataPoint[] = [];
  activitiesByCollaboratorDatasets: ChartDataset[] = [];
  activitiesByCollaboratorLabels: string[] = [];
  pointsByCollaboratorGraphData: GraphDataPoint[] = [];
  pointsByCollaboratorDatasets: ChartDataset[] = [];
  pointsByCollaboratorLabels: string[] = [];
  
  // Team aggregated data from members
  teamTotalPoints: number = 0;
  teamAveragePoints: number = 0;
  teamTotalTasks: number = 0;
  teamTotalBlockedPoints: number = 0; // Sum of blocked points from all team members
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
  teamCarteiraClientes: CompanyDisplay[] = [];
  isLoadingCarteira: boolean = false;
  
  // Monthly points breakdown
  monthlyPointsBreakdown: { bloqueados: number; desbloqueados: number } | null = null;
  
  // Company detail modal state
  isCompanyCarteiraDetailModalOpen: boolean = false;
  selectedCarteiraCompany: CompanyDisplay | null = null;
  
  // Modal states
  isProgressModalOpen: boolean = false;
  progressModalType: ProgressListType = 'atividades';
  isCarteiraModalOpen: boolean = false;
  
  // Refresh tracking
  lastRefresh: Date = new Date();
  
  // Accessibility properties
  screenReaderAnnouncement: string = '';
  private focusedElementBeforeModal: HTMLElement | null = null;
  
  // Sidebar collapse state
  sidebarCollapsed: boolean = false;
  
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
    private companyKpiService: CompanyKpiService,
    private kpiService: KPIService,
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
   * // Returns: 'FkmdnFU' or 'Fkmdmko' or null (DIRETOR returns null as they can see all)
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
   * to filter players by team membership, then fetches status data and points for each member.
   * 
   * Points are calculated for the selected month using achievement collection.
   * Tasks are taken from extra.tarefas_finalizadas in player status.
   * Blocked points are taken from point_categories.locked_points in player status.
   * 
   * @private
   * @async
   * @param teamId - The Funifier team ID (e.g., 'FkmdnFU')
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
        this.teamTotalBlockedPoints = 0;
        this.cdr.markForCheck();
        return;
      }
      
      // Step 2: Fetch raw status data and points for selected month for each member in parallel
      // We need the raw data to access extra fields and calculate points for the selected period
      const memberDataPromises = memberIds.map(async (memberId) => {
        try {
          // Fetch status and points in parallel for each member
          const [status, pointsForMonth] = await Promise.all([
            firstValueFrom(
              this.funifierApi.get<any>(`/v3/player/${memberId}/status`).pipe(takeUntil(this.destroy$))
            ).catch((error) => {
              console.error(`Error loading status for member ${memberId}:`, error);
              return null;
            }),
            firstValueFrom(
              this.actionLogService.getPontosForMonth(memberId, this.selectedMonth).pipe(takeUntil(this.destroy$))
            ).catch((error) => {
              console.error(`Error loading points for member ${memberId}:`, error);
              return 0;
            })
          ]);
          
          return { status, pointsForMonth, memberId };
        } catch (error) {
          console.error(`Error loading data for member ${memberId}:`, error);
          return { status: null, pointsForMonth: 0, memberId };
        }
      });
      
      const memberDataResults = await Promise.all(memberDataPromises);
      
      // Step 3: Aggregate data from all members
      let totalPoints = 0;
      let totalTasks = 0;
      let totalBlockedPoints = 0;
      let validMembers = 0;
      
      memberDataResults.forEach(({ status, pointsForMonth, memberId }) => {
        if (status) {
          // Use points for the selected month (from achievement collection)
          totalPoints += pointsForMonth;
          
          // Get tasks completed from extra.tarefas_finalizadas
          const tasks = status.extra?.tarefas_finalizadas || 0;
          totalTasks += tasks;
          
          // Get blocked points from status (if available)
          // Blocked points can be in different formats:
          // - point_categories.locked_points.total
          // - point_categories.locked_points
          // - point_wallet.bloqueados (Portuguese)
          let blockedPoints = 0;
          if (status.point_categories?.locked_points) {
            if (typeof status.point_categories.locked_points === 'object' && status.point_categories.locked_points.total) {
              blockedPoints = status.point_categories.locked_points.total;
            } else if (typeof status.point_categories.locked_points === 'number') {
              blockedPoints = status.point_categories.locked_points;
            }
          } else if (status.point_wallet?.bloqueados) {
            blockedPoints = status.point_wallet.bloqueados;
          }
          totalBlockedPoints += blockedPoints;
          
          validMembers++;
          console.log(`📊 Member ${memberId}: ${pointsForMonth} points (month), ${tasks} tasks, ${blockedPoints} blocked points`);
        }
      });
      
      // Calculate aggregated metrics
      // Round down all values to remove decimals
      this.teamTotalPoints = Math.floor(totalPoints);
      this.teamAveragePoints = validMembers > 0 ? Math.floor(totalPoints / validMembers) : 0;
      this.teamTotalTasks = Math.floor(totalTasks);
      this.teamTotalBlockedPoints = Math.floor(totalBlockedPoints);
      
      console.log('✅ Team aggregated data from members:', {
        totalPoints: this.teamTotalPoints,
        averagePoints: this.teamAveragePoints,
        totalTasks: this.teamTotalTasks,
        totalBlockedPoints: this.teamTotalBlockedPoints,
        validMembers,
        selectedMonth: this.selectedMonth
      });
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadTeamMembersData:', error);
      this.teamTotalPoints = 0;
      this.teamAveragePoints = 0;
      this.teamTotalTasks = 0;
      this.teamTotalBlockedPoints = 0;
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
      
      // If a collaborator is selected, load only that collaborator's data
      if (this.selectedCollaborator) {
        console.log('👤 Loading data for selected collaborator:', this.selectedCollaborator);
        await this.loadCollaboratorData(this.selectedCollaborator, dateRange);
      } else {
        // Otherwise, load team aggregated data
        console.log('👥 Loading team aggregated data');
        // First, reload team members data to recalculate points for the selected month
        // This is important when the month changes, as points need to be recalculated
        await this.loadTeamMembersData(this.selectedTeamId);
        
        // Then, load team activity and macro data (needed for sidebar aggregation)
        await this.loadTeamActivityAndMacroData(dateRange);
        
        // Load data in parallel, but KPIs need carteira data first
        await Promise.all([
          this.loadSidebarData(dateRange),
          this.loadCollaborators(),
          this.loadGoalsData(dateRange),
          this.loadProductivityData(dateRange),
          this.loadMonthlyPointsBreakdown()
        ]);
        
        // Load carteira data first, then KPIs (which depend on carteira)
        await this.loadTeamCarteiraData(dateRange);
        await this.loadTeamKPIs();
        
        // Update formatted sidebar data after KPIs are loaded (includes metas calculation)
        this.updateFormattedSidebarData();
        
        // Update team name display after loading collaborators
        this.updateTeamNameDisplay();
      }
      
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
   * Load data for a specific collaborator (instead of team aggregated data)
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when collaborator data is loaded
   */
  private async loadCollaboratorData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      console.log('👤 Loading data for collaborator:', collaboratorId);
      
      // Load collaborator-specific data in parallel
      await Promise.all([
        this.loadCollaboratorSidebarData(collaboratorId, dateRange),
        this.loadCollaborators(), // Still load collaborators list
        this.loadCollaboratorGoalsData(collaboratorId, dateRange),
        this.loadCollaboratorProductivityData(collaboratorId, dateRange),
        this.loadMonthlyPointsBreakdown(collaboratorId)
      ]);
      
      // Load carteira data first, then KPIs (which depend on carteira)
      await this.loadCollaboratorCarteiraData(collaboratorId, dateRange);
      await this.loadTeamKPIs(collaboratorId);
      
      // Update formatted sidebar data after KPIs are loaded (includes metas calculation)
      this.updateFormattedSidebarData();
      
      // Update team name display after loading collaborators
      this.updateTeamNameDisplay();
      
      this.cdr.markForCheck();
      
      console.log('✅ Collaborator data loaded for:', collaboratorId);
    } catch (error) {
      console.error('Error loading collaborator data:', error);
      this.toastService.error('Erro ao carregar dados do colaborador');
    }
  }

  /**
   * Calculate date range based on selected month.
   * 
   * Uses the selectedMonthsAgo property to calculate the start and end dates.
   * Ensures data is pulled from 01/01/2026 onwards.
   * 
   * Logic:
   * - When February is selected (selectedMonthsAgo = 0, if current month is February):
   *   Includes both January and February (01/01/2026 to end of February)
   * - When January is selected (selectedMonthsAgo = 1, if current month is February):
   *   Returns only January (01/01/2026 to 31/01/2026)
   * - For other months: Returns only the selected month
   * 
   * Minimum date is always 01/01/2026.
   * 
   * @private
   * @returns Object containing start and end dates
   * 
   * @example
   * // February selected (current month)
   * this.selectedMonthsAgo = 0;
   * const range = this.calculateDateRange();
   * // Returns: { start: Date(2026-01-01), end: Date(2026-02-28) }
   * 
   * // January selected
   * this.selectedMonthsAgo = 1;
   * const range = this.calculateDateRange();
   * // Returns: { start: Date(2026-01-01), end: Date(2026-01-31) }
   */
  private calculateDateRange(): { start: Date; end: Date } {
    const now = dayjs();
    const targetMonth = now.subtract(this.selectedMonthsAgo, 'month');
    const seasonStartDate = dayjs('2026-01-01');
    
    // Check if the target month is January or February 2026
    const targetYear = targetMonth.year();
    const targetMonthNum = targetMonth.month(); // 0-indexed: 0 = January, 1 = February
    const isJanuary2026 = targetYear === 2026 && targetMonthNum === 0;
    const isFebruary2026 = targetYear === 2026 && targetMonthNum === 1;
    
    // If February 2026 is selected, include January as well
    if (isFebruary2026) {
      return {
        start: seasonStartDate.toDate(), // 01/01/2026
        end: targetMonth.endOf('month').toDate() // End of February 2026
      };
    }
    
    // If January 2026 is selected, return only January
    if (isJanuary2026) {
      return {
        start: seasonStartDate.toDate(), // 01/01/2026
        end: targetMonth.endOf('month').toDate() // 31/01/2026
      };
    }
    
    // For other months, return only the selected month
    // But ensure start date is not before season start
    const monthStart = targetMonth.startOf('month');
    const startDate = monthStart.isBefore(seasonStartDate) ? seasonStartDate : monthStart;
    
    return {
      start: startDate.toDate(),
      end: targetMonth.endOf('month').toDate()
    };
  }

  /**
   * Load sidebar data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when sidebar data is loaded
   */
  private async loadCollaboratorSidebarData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingSidebar = true;
      this.hasSidebarError = false;
      this.sidebarErrorMessage = '';
      
      console.log('📊 Loading sidebar data for collaborator:', collaboratorId);
      
      // Get progress metrics and points for the collaborator
      const metrics = await firstValueFrom(
        this.actionLogService.getProgressMetrics(collaboratorId, this.selectedMonth)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error loading collaborator progress metrics:', error);
        this.hasSidebarError = true;
        this.sidebarErrorMessage = 'Erro ao carregar métricas de progresso';
        return {
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        };
      });
      
      // Get player status to get blocked points
      const status = await firstValueFrom(
        this.funifierApi.get<any>(`/v3/player/${collaboratorId}/status`).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error loading collaborator status:', error);
        return null;
      });
      
      // Calculate blocked points from status
      let blockedPoints = 0;
      if (status) {
        if (status.point_categories?.locked_points) {
          if (typeof status.point_categories.locked_points === 'object' && status.point_categories.locked_points.total) {
            blockedPoints = status.point_categories.locked_points.total;
          } else if (typeof status.point_categories.locked_points === 'number') {
            blockedPoints = status.point_categories.locked_points;
          }
        } else if (status.point_wallet?.bloqueados) {
          blockedPoints = status.point_wallet.bloqueados;
        }
      }
      
      const totalPoints = metrics.activity.pontos;
      const unlockedPoints = Math.max(0, totalPoints - blockedPoints);
      
      // Set sidebar data for collaborator
      // Round down all values to remove decimals
      this.seasonPoints = {
        total: Math.floor(totalPoints),
        bloqueados: Math.floor(blockedPoints),
        desbloqueados: Math.floor(unlockedPoints)
      };
      
      this.progressMetrics = {
        processosIncompletos: Math.floor(metrics.processo.incompletas),
        atividadesFinalizadas: Math.floor(metrics.activity.finalizadas),
        processosFinalizados: Math.floor(metrics.processo.finalizadas)
      };
      
      // Set team metrics to match collaborator metrics for display consistency
      this.teamActivityMetrics = {
        pendentes: metrics.activity.pendentes,
        emExecucao: metrics.activity.emExecucao,
        finalizadas: metrics.activity.finalizadas,
        pontos: metrics.activity.pontos
      };
      
      this.teamProcessMetrics = {
        pendentes: metrics.processo.pendentes,
        incompletas: metrics.processo.incompletas,
        finalizadas: metrics.processo.finalizadas
      };
      
      // Set team totals to collaborator values
      // Round down all values to remove decimals
      this.teamTotalPoints = Math.floor(totalPoints);
      this.teamAveragePoints = Math.floor(totalPoints); // For single collaborator, average = total
      this.teamTotalTasks = Math.floor(metrics.activity.finalizadas);
      this.teamTotalBlockedPoints = Math.floor(blockedPoints);
      
      // Update formatted data for gamification dashboard components
      this.updateFormattedSidebarData();
      
      this.isLoadingSidebar = false;
      
      console.log('✅ Collaborator sidebar data loaded:', {
        points: this.seasonPoints,
        metrics: this.progressMetrics,
        collaboratorId
      });
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error in loadCollaboratorSidebarData:', error);
      this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
      this.isLoadingSidebar = false;
      this.cdr.markForCheck();
    }
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
      
      // Use aggregated data from team members (from loadTeamMembersData and loadTeamActivityAndMacroData)
      // All data should be aggregated directly from team members, not from aggregate queries
      // Points: Sum from all team members' points for the selected month
      // Blocked points: Sum from all team members' locked_points
      // Unlocked points: Total points minus blocked points
      // Round down all values to remove decimals
      const unlockedPoints = Math.max(0, this.teamTotalPoints - this.teamTotalBlockedPoints);
      
      this.seasonPoints = {
        total: Math.floor(this.teamTotalPoints), // Always use aggregated points from members (for selected month)
        bloqueados: Math.floor(this.teamTotalBlockedPoints > 0 ? this.teamTotalBlockedPoints : points.bloqueados), // Use aggregated blocked points or fallback
        desbloqueados: Math.floor(unlockedPoints > 0 ? unlockedPoints : this.teamTotalPoints) // Unlocked = total - blocked
      };
      
      // Progress metrics: Use aggregated data from team members
      // Atividades finalizadas: Sum from teamActivityMetrics.finalizadas (from loadTeamActivityAndMacroData)
      // Processos: Use aggregated from teamProcessMetrics (from loadTeamActivityAndMacroData)
      // Round down all values to remove decimals
      this.progressMetrics = {
        processosIncompletos: Math.floor(this.teamProcessMetrics.incompletas || metrics.processosIncompletos),
        atividadesFinalizadas: Math.floor(this.teamActivityMetrics.finalizadas || this.teamTotalTasks || metrics.atividadesFinalizadas),
        processosFinalizados: Math.floor(this.teamProcessMetrics.finalizadas || metrics.processosFinalizados)
      };
      
      // Update formatted data for gamification dashboard components
      this.updateFormattedSidebarData();
      
      this.isLoadingSidebar = false;
      
      console.log('✅ Sidebar data loaded (aggregated from team members):', { 
        points: this.seasonPoints, 
        metrics: this.progressMetrics,
        teamTotalPoints: this.teamTotalPoints,
        teamTotalBlockedPoints: this.teamTotalBlockedPoints,
        teamAveragePoints: this.teamAveragePoints,
        teamTotalTasks: this.teamTotalTasks,
        teamActivityMetrics: this.teamActivityMetrics,
        teamProcessMetrics: this.teamProcessMetrics
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
      
      // Preservar o selectedCollaborator ANTES de carregar
      const preservedCollaboratorId = this.selectedCollaborator || localStorage.getItem('selectedCollaboratorId');
      
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
      
      // Validate current selection exists in the list
      if (this.selectedCollaborator) {
        const collaboratorExists = this.collaborators.find(c => c.userId === this.selectedCollaborator);
        if (!collaboratorExists) {
          console.warn('⚠️ Selected collaborator not found in list, resetting to team view');
          this.selectedCollaborator = null;
        }
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
   * Load goals data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when goals data is loaded
   */
  private async loadCollaboratorGoalsData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingGoals = true;
      this.hasGoalsError = false;
      this.goalsErrorMessage = '';
      
      console.log('📊 Loading goals data for collaborator:', collaboratorId);
      
      // Get progress metrics for the collaborator
      const metrics = await firstValueFrom(
        this.actionLogService.getProgressMetrics(collaboratorId, this.selectedMonth)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error loading collaborator progress metrics for goals:', error);
        return {
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        };
      });
      
      // Create goal metrics from collaborator's progress metrics
      this.goalMetrics = [
        {
          id: 'processos-finalizados',
          label: 'Processos Finalizados',
          current: metrics.processo.finalizadas,
          target: 100, // TODO: Get from configuration
          unit: ''
        },
        {
          id: 'atividades-finalizadas',
          label: 'Atividades Finalizadas',
          current: metrics.activity.finalizadas,
          target: 500, // TODO: Get from configuration
          unit: ''
        }
      ];
      
      this.isLoadingGoals = false;
      console.log('✅ Collaborator goals data loaded:', this.goalMetrics);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading collaborator goals data:', error);
      this.goalMetrics = [];
      this.isLoadingGoals = false;
      this.hasGoalsError = true;
      this.goalsErrorMessage = 'Erro ao carregar dados de metas';
      this.toastService.error('Erro ao carregar dados de metas');
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
   * Load productivity graph data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when productivity data is loaded
   */
  private async loadCollaboratorProductivityData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingProductivity = true;
      this.hasProductivityError = false;
      this.productivityErrorMessage = '';
      
      console.log('📈 Loading productivity data for collaborator:', collaboratorId);
      
      // Get collaborator name for the label
      const collaborator = this.collaborators.find(c => c.userId === collaboratorId);
      const memberName = this.formatCollaboratorName(collaboratorId, collaborator?.name);
      
      // For productivity tab, use the selected period instead of month range
      const endDate = dayjs();
      const startDate = endDate.subtract(this.selectedPeriod, 'day');
      
      // Query action_log for daily completed tasks count for this collaborator
      const aggregateBody = [
        {
          $match: {
            userId: collaboratorId,
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
        console.error(`Error loading productivity for collaborator ${collaboratorId}:`, error);
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
      
      // Create a single dataset for the collaborator (activities)
      this.graphData = dataPoints;
      this.graphDatasets = [
        {
          label: memberName,
          data: dataPoints.map(p => p.value),
          borderColor: '#4F46E5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true
        }
      ];
      
      // Calculate totals for single collaborator bar charts
      const activitiesTotal = dataPoints.reduce((sum, point) => sum + point.value, 0);
      this.activitiesByCollaboratorGraphData = [{ date: new Date(), value: activitiesTotal }];
      this.activitiesByCollaboratorDatasets = [{
        label: 'Total de Atividades',
        data: [activitiesTotal],
        backgroundColor: ['rgba(79, 70, 229, 0.6)'],
        borderColor: ['rgba(79, 70, 229, 1)'],
        borderWidth: 1
      }];
      this.activitiesByCollaboratorLabels = [memberName];
      
      // Load points data for the same period
      await this.loadCollaboratorPointsData(collaboratorId, startDate, endDate, memberName);
      
      this.isLoadingProductivity = false;
      console.log('✅ Collaborator productivity data loaded:', {
        dataPoints: dataPoints.length,
        totalActions: dataPoints.reduce((sum, p) => sum + p.value, 0)
      });
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading collaborator productivity data:', error);
      this.graphData = [];
      this.graphDatasets = [];
      this.pointsGraphData = [];
      this.pointsGraphDatasets = [];
      this.activitiesByCollaboratorGraphData = [];
      this.activitiesByCollaboratorDatasets = [];
      this.activitiesByCollaboratorLabels = [];
      this.pointsByCollaboratorGraphData = [];
      this.pointsByCollaboratorDatasets = [];
      this.pointsByCollaboratorLabels = [];
      this.hasProductivityError = true;
      this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
      this.isLoadingProductivity = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Load daily points data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param startDate - Start date for the period
   * @param endDate - End date for the period
   * @param memberName - Name of the collaborator for the label
   * @returns Promise that resolves when points data is loaded
   */
  private async loadCollaboratorPointsData(
    collaboratorId: string, 
    startDate: dayjs.Dayjs, 
    endDate: dayjs.Dayjs,
    memberName: string
  ): Promise<void> {
    try {
      // Query achievement collection for daily points earned
      const aggregateBody = [
        {
          $match: {
            player: collaboratorId,
            type: 0, // type 0 = points
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
            total: { $sum: '$total' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ];
      
      const dailyPointsData = await firstValueFrom(
        this.funifierApi.post<any[]>(
          '/v3/database/achievement/aggregate?strict=true',
          aggregateBody
        ).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error(`Error loading points for collaborator ${collaboratorId}:`, error);
        return [];
      });
      
      // Convert to GraphDataPoint format
      const pointsDataPoints: GraphDataPoint[] = [];
      const pointsDataMap = new Map<string, number>();
      
      dailyPointsData.forEach((item: any) => {
        const dateStr = item._id;
        const points = item.total || 0;
        pointsDataMap.set(dateStr, points);
      });
      
      // Fill all dates in range
      let currentDate = startDate;
      while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        pointsDataPoints.push({
          date: currentDate.toDate(),
          value: Math.floor(pointsDataMap.get(dateStr) || 0) // Round down points
        });
        currentDate = currentDate.add(1, 'day');
      }
      
      // Create a single dataset for the collaborator (points)
      this.pointsGraphData = pointsDataPoints;
      this.pointsGraphDatasets = [
        {
          label: memberName,
          data: pointsDataPoints.map(p => p.value),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true
        }
      ];
      
      // Calculate totals for single collaborator points bar chart
      const pointsTotal = Math.floor(pointsDataPoints.reduce((sum, point) => sum + point.value, 0));
      this.pointsByCollaboratorGraphData = [{ date: new Date(), value: pointsTotal }];
      this.pointsByCollaboratorDatasets = [{
        label: 'Total de Pontos',
        data: [pointsTotal],
        backgroundColor: ['rgba(16, 185, 129, 0.6)'],
        borderColor: ['rgba(16, 185, 129, 1)'],
        borderWidth: 1
      }];
      this.pointsByCollaboratorLabels = [memberName];
      
      console.log('✅ Collaborator points data loaded:', {
        dataPoints: pointsDataPoints.length,
        totalPoints: pointsDataPoints.reduce((sum, p) => sum + p.value, 0)
      });
    } catch (error) {
      console.error('Error loading collaborator points data:', error);
      this.pointsGraphData = [];
      this.pointsGraphDatasets = [];
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
        this.pointsGraphData = [];
        this.pointsGraphDatasets = [];
        this.activitiesByCollaboratorGraphData = [];
        this.activitiesByCollaboratorDatasets = [];
        this.activitiesByCollaboratorLabels = [];
        this.pointsByCollaboratorGraphData = [];
        this.pointsByCollaboratorDatasets = [];
        this.pointsByCollaboratorLabels = [];
        this.isLoadingProductivity = false;
        return;
      }
      
      // For productivity tab, use the selected period instead of month range
      const endDate = dayjs();
      const startDate = endDate.subtract(this.selectedPeriod, 'day');
      
      try {
        // Load daily productivity data (activities and points) for each team member
        const memberProductivityPromises = this.teamMemberIds.map(async (memberId) => {
          try {
            // Get collaborator name for the label
            const collaborator = this.collaborators.find(c => c.userId === memberId);
            const memberName = this.formatCollaboratorName(memberId, collaborator?.name);
            
            // Query action_log for daily completed tasks count for this member
            const activitiesAggregateBody = [
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
            
            // Query achievement for daily points earned for this member
            const pointsAggregateBody = [
              {
                $match: {
                  player: memberId,
                  type: 0, // type 0 = points
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
                  total: { $sum: '$total' }
                }
              },
              {
                $sort: { _id: 1 }
              }
            ];
            
            // Load both activities and points in parallel
            const [dailyActivitiesData, dailyPointsData] = await Promise.all([
              firstValueFrom(
                this.funifierApi.post<any[]>(
                  '/v3/database/action_log/aggregate?strict=true',
                  activitiesAggregateBody
                ).pipe(takeUntil(this.destroy$))
              ).catch((error) => {
                console.error(`Error loading activities for member ${memberId}:`, error);
                return [];
              }),
              firstValueFrom(
                this.funifierApi.post<any[]>(
                  '/v3/database/achievement/aggregate?strict=true',
                  pointsAggregateBody
                ).pipe(takeUntil(this.destroy$))
              ).catch((error) => {
                console.error(`Error loading points for member ${memberId}:`, error);
                return [];
              })
            ]);
            
            // Convert activities to GraphDataPoint format
            const activitiesDataPoints: GraphDataPoint[] = [];
            const activitiesDataMap = new Map<string, number>();
            
            dailyActivitiesData.forEach((item: any) => {
              const dateStr = item._id;
              const count = item.count || 0;
              activitiesDataMap.set(dateStr, count);
            });
            
            // Convert points to GraphDataPoint format
            const pointsDataPoints: GraphDataPoint[] = [];
            const pointsDataMap = new Map<string, number>();
            
            dailyPointsData.forEach((item: any) => {
              const dateStr = item._id;
              const points = item.total || 0;
              pointsDataMap.set(dateStr, points);
            });
            
            // Fill all dates in range for both activities and points
            let currentDate = startDate;
            while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
              const dateStr = currentDate.format('YYYY-MM-DD');
              activitiesDataPoints.push({
                date: currentDate.toDate(),
                value: activitiesDataMap.get(dateStr) || 0
              });
              pointsDataPoints.push({
                date: currentDate.toDate(),
                value: Math.floor(pointsDataMap.get(dateStr) || 0) // Round down points
              });
              currentDate = currentDate.add(1, 'day');
            }
            
            return {
              memberId,
              memberName,
              activitiesDataPoints,
              pointsDataPoints
            };
          } catch (error) {
            console.error(`Error processing productivity for member ${memberId}:`, error);
            return null;
          }
        });
        
        const allMemberData = await Promise.all(memberProductivityPromises);
        const validMemberData = allMemberData.filter(d => d !== null) as Array<{ 
          memberId: string; 
          memberName: string; 
          activitiesDataPoints: GraphDataPoint[]; 
          pointsDataPoints: GraphDataPoint[] 
        }>;
        
        // Create multiple datasets (one per member) for activities and points
        if (validMemberData.length > 0) {
          // Generate date labels
          const dateLabels = this.graphDataProcessor.getDateLabels(this.selectedPeriod);
          
          // Create datasets for activities (one per member)
          this.graphDatasets = validMemberData.map((memberData, index) => {
            const colors = this.getColorForIndex(index);
            return {
              label: memberData.memberName,
              data: memberData.activitiesDataPoints.map(point => point.value),
              borderColor: colors.border,
              backgroundColor: colors.background,
              fill: false
            };
          });
          
          // Create datasets for points (one per member)
          this.pointsGraphDatasets = validMemberData.map((memberData, index) => {
            const colors = this.getColorForIndex(index);
            return {
              label: memberData.memberName,
              data: memberData.pointsDataPoints.map(point => point.value),
              borderColor: colors.border,
              backgroundColor: colors.background,
              fill: false
            };
          });
          
          // Also set graphData for backward compatibility (aggregated activities)
          const aggregatedActivitiesMap = new Map<string, number>();
          validMemberData.forEach(memberData => {
            memberData.activitiesDataPoints.forEach(point => {
              const dateStr = dayjs(point.date).format('YYYY-MM-DD');
              aggregatedActivitiesMap.set(dateStr, (aggregatedActivitiesMap.get(dateStr) || 0) + point.value);
            });
          });
          
          // Aggregate points data
          const aggregatedPointsMap = new Map<string, number>();
          validMemberData.forEach(memberData => {
            memberData.pointsDataPoints.forEach(point => {
              const dateStr = dayjs(point.date).format('YYYY-MM-DD');
              aggregatedPointsMap.set(dateStr, (aggregatedPointsMap.get(dateStr) || 0) + point.value);
            });
          });
          
          const aggregatedActivities: GraphDataPoint[] = [];
          const aggregatedPoints: GraphDataPoint[] = [];
          let currentDate = startDate;
          while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
            const dateStr = currentDate.format('YYYY-MM-DD');
            aggregatedActivities.push({
              date: currentDate.toDate(),
              value: aggregatedActivitiesMap.get(dateStr) || 0
            });
            aggregatedPoints.push({
              date: currentDate.toDate(),
              value: Math.floor(aggregatedPointsMap.get(dateStr) || 0) // Round down points
            });
            currentDate = currentDate.add(1, 'day');
          }
          
          this.graphData = aggregatedActivities;
          this.pointsGraphData = aggregatedPoints;
          
          // Calculate totals by collaborator for bar charts
          this.calculateCollaboratorTotals(validMemberData);
        } else {
          this.graphData = [];
          this.graphDatasets = [];
          this.pointsGraphData = [];
          this.pointsGraphDatasets = [];
          this.activitiesByCollaboratorGraphData = [];
          this.activitiesByCollaboratorDatasets = [];
          this.pointsByCollaboratorGraphData = [];
          this.pointsByCollaboratorDatasets = [];
        }
        
        this.hasProductivityError = false;
        console.log('✅ Productivity data loaded for', validMemberData.length, 'members');
        this.cdr.markForCheck();
      } catch (error) {
        console.error('Error loading productivity data:', error);
      this.graphData = [];
      this.graphDatasets = [];
      this.pointsGraphData = [];
      this.pointsGraphDatasets = [];
      this.activitiesByCollaboratorGraphData = [];
      this.activitiesByCollaboratorDatasets = [];
      this.pointsByCollaboratorGraphData = [];
      this.pointsByCollaboratorDatasets = [];
      this.hasProductivityError = true;
      this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
      this.toastService.error('Erro ao carregar dados de produtividade');
    } finally {
      this.isLoadingProductivity = false;
    }
  } catch (error) {
    console.error('Error in loadProductivityData:', error);
    this.graphData = [];
    this.graphDatasets = [];
    this.pointsGraphData = [];
    this.pointsGraphDatasets = [];
    this.activitiesByCollaboratorGraphData = [];
    this.activitiesByCollaboratorDatasets = [];
    this.pointsByCollaboratorGraphData = [];
    this.pointsByCollaboratorDatasets = [];
    this.hasProductivityError = true;
    this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
    this.isLoadingProductivity = false;
  }
}

/**
 * Calculate total activities and points by collaborator for bar charts
 */
private calculateCollaboratorTotals(memberData: Array<{ 
  memberId: string; 
  memberName: string; 
  activitiesDataPoints: GraphDataPoint[]; 
  pointsDataPoints: GraphDataPoint[] 
}>): void {
  // Calculate totals for each collaborator
  const activitiesTotals: Array<{ name: string; total: number }> = [];
  const pointsTotals: Array<{ name: string; total: number }> = [];
  
  memberData.forEach(member => {
    const activitiesTotal = member.activitiesDataPoints.reduce((sum, point) => sum + point.value, 0);
    const pointsTotal = member.pointsDataPoints.reduce((sum, point) => sum + point.value, 0);
    
    // Format the member name (already formatted in loadProductivityData, but ensure consistency)
    const formattedName = this.formatCollaboratorName(member.memberId, member.memberName);
    
    activitiesTotals.push({
      name: formattedName,
      total: activitiesTotal
    });
    
    pointsTotals.push({
      name: formattedName,
      total: Math.floor(pointsTotal) // Round down points
    });
  });
  
  // Sort by total (descending) for better visualization
  activitiesTotals.sort((a, b) => b.total - a.total);
  pointsTotals.sort((a, b) => b.total - a.total);
  
  // Create graph data and datasets for activities by collaborator
  this.activitiesByCollaboratorGraphData = activitiesTotals.map((item, index) => ({
    date: new Date(2024, 0, index + 1), // Dummy date, not used in bar chart
    value: item.total
  }));
  
  this.activitiesByCollaboratorDatasets = [{
    label: 'Total de Atividades',
    data: activitiesTotals.map(item => item.total),
    backgroundColor: activitiesTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.background;
    }),
    borderColor: activitiesTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.border;
    }),
    borderWidth: 1
  }];
  
  // Create graph data and datasets for points by collaborator
  this.pointsByCollaboratorGraphData = pointsTotals.map((item, index) => ({
    date: new Date(2024, 0, index + 1), // Dummy date, not used in bar chart
    value: item.total
  }));
  
  this.pointsByCollaboratorDatasets = [{
    label: 'Total de Pontos',
    data: pointsTotals.map(item => item.total),
    backgroundColor: pointsTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.background;
    }),
    borderColor: pointsTotals.map((_, index) => {
      const colors = this.getColorForIndex(index);
      return colors.border;
    }),
    borderWidth: 1
  }];
  
  // Store collaborator names for chart labels
  this.activitiesByCollaboratorLabels = activitiesTotals.map(item => item.name);
  this.pointsByCollaboratorLabels = pointsTotals.map(item => item.name);
  
  console.log('✅ Collaborator totals calculated:', {
    activities: activitiesTotals,
    points: pointsTotals,
    activitiesLabels: this.activitiesByCollaboratorLabels,
    pointsLabels: this.pointsByCollaboratorLabels
  });
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
      
      // Sum metrics from all team members
      allMetrics.forEach((metrics, index) => {
        const memberId = this.teamMemberIds[index];
        totalPendentes += metrics.activity.pendentes;
        totalEmExecucao += metrics.activity.emExecucao;
        totalFinalizadas += metrics.activity.finalizadas;
        totalPontos += metrics.activity.pontos;
        totalProcessPendentes += metrics.processo.pendentes;
        totalProcessIncompletas += metrics.processo.incompletas;
        totalProcessFinalizadas += metrics.processo.finalizadas;
        
        console.log(`📊 Member ${memberId} metrics:`, {
          atividades: metrics.activity,
          processos: metrics.processo
        });
      });
      
      // Set aggregated team metrics
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
      
      console.log('✅ Team activity and process data aggregated from', this.teamMemberIds.length, 'members:', {
        activities: this.teamActivityMetrics,
        processos: this.teamProcessMetrics,
        selectedMonth: this.selectedMonth
      });
      
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading team activity and process data:', error);
    }
  }

  /**
   * Load carteira data for a specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - The user ID (email) of the collaborator
   * @param dateRange - Date range for filtering data
   * @returns Promise that resolves when carteira data is loaded
   */
  private async loadCollaboratorCarteiraData(collaboratorId: string, dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingCarteira = true;
      console.log('📊 Loading carteira data for collaborator:', collaboratorId);
      
      // Get CNPJ list with action counts and process counts for the collaborator
      const carteiraData = await firstValueFrom(
        this.actionLogService.getPlayerCnpjListWithCount(collaboratorId, this.selectedMonth)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error(`Error loading carteira for collaborator ${collaboratorId}:`, error);
        return [];
      });
      
      // Enrich with KPI data
      const enrichedClientes = await firstValueFrom(
        this.companyKpiService.enrichCompaniesWithKpis(carteiraData)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error(`Error enriching carteira data for collaborator ${collaboratorId}:`, error);
        // Return data without KPI enrichment on error
        return carteiraData.map(item => ({
          cnpj: item.cnpj,
          actionCount: item.actionCount,
          processCount: item.processCount
        } as CompanyDisplay));
      });
      
      this.teamCarteiraClientes = enrichedClientes;
      
      // Update formatted sidebar data after carteira is loaded (for clientes count)
      this.updateFormattedSidebarData();
      
      console.log('✅ Collaborator carteira data loaded:', this.teamCarteiraClientes.length, 'unique CNPJs');
      console.log('✅ Total actions across all CNPJs:', 
        this.teamCarteiraClientes.reduce((sum, item) => sum + item.actionCount, 0));
      
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading collaborator carteira data:', error);
      this.teamCarteiraClientes = [];
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Load team carteira (companies/CNPJs) data aggregated from all team members
   * 
   * Aggregates CNPJs and action counts from all team members' action_log entries
   * for the selected month. Sums action counts per CNPJ across all team members.
   * 
   * @private
   * @async
   * @param dateRange - Date range for filtering actions (currently not used, uses selectedMonth)
   * @returns Promise that resolves when carteira data is loaded
   */
  private async loadTeamCarteiraData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingCarteira = true;
      console.log('📊 Loading team carteira data from team members...');
      
      if (this.teamMemberIds.length === 0) {
        console.warn('⚠️ No team members to aggregate carteira data from');
        this.teamCarteiraClientes = [];
        this.isLoadingCarteira = false;
        this.cdr.markForCheck();
        return;
      }
      
      // Load CNPJ list with action counts for each team member in parallel
      const memberCarteiraPromises = this.teamMemberIds.map(memberId =>
        firstValueFrom(
          this.actionLogService.getPlayerCnpjListWithCount(memberId, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error(`Error loading carteira for member ${memberId}:`, error);
          return [];
        })
      );
      
      const allMemberCarteiras = await Promise.all(memberCarteiraPromises);
      
      // Aggregate CNPJs and sum action counts and process counts across all members
      const cnpjMap = new Map<string, { actionCount: number; processCount: number }>();
      
      allMemberCarteiras.forEach((memberCarteira) => {
        memberCarteira.forEach(({ cnpj, actionCount, processCount }) => {
          if (cnpj) {
            const existing = cnpjMap.get(cnpj);
            if (existing) {
              existing.actionCount += actionCount;
              existing.processCount += processCount;
            } else {
              cnpjMap.set(cnpj, { actionCount, processCount });
            }
          }
        });
      });
      
      // Convert map to array format for enrichCompaniesWithKpis
      const aggregatedCarteira = Array.from(cnpjMap.entries())
        .map(([cnpj, counts]) => ({ 
          cnpj, 
          actionCount: counts.actionCount,
          processCount: counts.processCount
        }))
        .sort((a, b) => b.actionCount - a.actionCount);
      
      // Enrich with KPI data
      const enrichedClientes = await firstValueFrom(
        this.companyKpiService.enrichCompaniesWithKpis(aggregatedCarteira)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error enriching team carteira data:', error);
        // Return data without KPI enrichment on error
        return aggregatedCarteira.map(item => ({
          cnpj: item.cnpj,
          actionCount: item.actionCount,
          processCount: item.processCount
        } as CompanyDisplay));
      });
      
      this.teamCarteiraClientes = enrichedClientes;
      
      // Update formatted sidebar data after carteira is loaded (for clientes count)
      this.updateFormattedSidebarData();
      
      console.log('✅ Team carteira data loaded (aggregated from', this.teamMemberIds.length, 'members):', 
        this.teamCarteiraClientes.length, 'unique CNPJs');
      console.log('✅ Total actions across all CNPJs:', 
        this.teamCarteiraClientes.reduce((sum, item) => sum + item.actionCount, 0));
      
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
   * @param teamId - The Funifier team ID (e.g., 'FkmdnFU')
   * 
   * @example
   * // Called from template when team selector changes
   * await this.onTeamChange('FkmdnFU');
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
      
      // Check if team is actually changing
      const isTeamChanging = this.selectedTeamId !== teamId;
      
      // Set selected team ID and name
      this.selectedTeamId = teamId;
      this.selectedTeam = team.name;
      this.displayTeamName = team.name; // Update display name
      
      // Reset collaborator filter when team changes
      if (isTeamChanging) {
        this.selectedCollaborator = null;
      }
      
      // Save team selection to localStorage
      localStorage.setItem('selectedTeamId', teamId);
      
      // Load team members data first (this sets teamTotalPoints, etc.)
      await this.loadTeamMembersData(teamId);
      
      // Then load all other team data
      await this.loadTeamData();
      
      // After loading collaborators, validate current selection
      if (this.selectedCollaborator) {
        const collaboratorExists = this.collaborators.some(
          c => c.userId === this.selectedCollaborator
        );
        if (!collaboratorExists) {
          this.selectedCollaborator = null;
        }
      }
      
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
   * 1. Updates the selectedCollaborator property
   * 2. Reloads all data filtered to that collaborator only
   * 
   * When null is passed (deselecting):
   * 1. Clears the selectedCollaborator property
   * 2. Reloads all team data
   * 
   * @param userId - The user ID (email) of the selected collaborator, or null to show team data
   * 
   * @example
   * // Show data for specific collaborator
   * onCollaboratorChange('user@example.com');
   * // Shows only that collaborator's data
   * 
   * // Show team data
   * onCollaboratorChange(null);
   * // Shows aggregated team data
   */
  async onCollaboratorChange(userId: string | null): Promise<void> {
    // Update the selected collaborator
    this.selectedCollaborator = userId;
    
    // When a specific collaborator is selected, switch to goals tab
    // When no collaborator is selected (showing all), switch back to team view
    if (userId) {
      this.activeTab = 'goals';
      console.log('👤 Filtering data for collaborator:', userId);
    } else {
      // Reset to team view when "Redefinir seleção" is selected
      this.activeTab = 'goals'; // Keep on goals tab to show team KPIs and progress
      console.log('👥 Showing team data (no collaborator selected)');
    }
    
    // Update team name display immediately
    this.updateTeamNameDisplay();
    
    // Reload data with the new filter
    if (this.selectedTeamId) {
      await this.loadTeamData();
    }
    
    this.cdr.markForCheck();
  }

  /**
   * Update team name display based on current selection
   * This ensures the team name is correctly displayed when switching between collaborator and team view
   */
  private updateTeamNameDisplay(): void {
    // Calculate and update displayTeamName explicitly
    if (this.selectedCollaborator) {
      const collaborator = this.collaborators.find(c => c.userId === this.selectedCollaborator);
      this.displayTeamName = collaborator?.name || this.formatCollaboratorName(this.selectedCollaborator) || '';
    } else {
      // Show team name
      if (this.selectedTeam && this.selectedTeam.trim().length > 0) {
        this.displayTeamName = this.selectedTeam;
      } else if (this.selectedTeamId) {
        const team = this.teams.find(t => t.id === this.selectedTeamId);
        if (team && team.name) {
          this.selectedTeam = team.name;
          this.displayTeamName = team.name;
        } else {
          this.displayTeamName = this.selectedTeamId;
        }
      } else {
        this.displayTeamName = '';
      }
    }
    // Force change detection
    this.cdr.markForCheck();
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
   * this.selectedTeamId = 'FkmdnFU';
   * const name = this.teamName;
   * // Returns: "GESTAO" or the team name from Funifier
   */
  get teamName(): string {
    // If a collaborator is selected, show their name
    if (this.selectedCollaborator) {
      const collaborator = this.collaborators.find(c => c.userId === this.selectedCollaborator);
      return collaborator?.name || this.selectedCollaborator || '';
    }
    
    // If selectedTeam is already set (team name), return it
    if (this.selectedTeam && this.selectedTeam.trim().length > 0) {
      return this.selectedTeam;
    }
    
    // Otherwise, look it up from teams array using selectedTeamId
    if (this.selectedTeamId) {
      const team = this.teams.find(t => t.id === this.selectedTeamId);
      if (team && team.name) {
        // Update selectedTeam for consistency
        this.selectedTeam = team.name;
        return team.name;
      }
      return this.selectedTeamId;
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
   * Load monthly points breakdown (bloqueados and desbloqueados)
   * For team: aggregates breakdown from all team members
   * For collaborator: fetches breakdown for specific collaborator
   * 
   * @private
   * @async
   * @param collaboratorId - Optional collaborator ID. If provided, loads for that collaborator only. Otherwise, aggregates for team.
   * @returns Promise that resolves when monthly points breakdown is loaded
   */
  private async loadMonthlyPointsBreakdown(collaboratorId?: string): Promise<void> {
    try {
      if (collaboratorId) {
        // Load for specific collaborator
        const breakdown = await firstValueFrom(
          this.actionLogService.getMonthlyPointsBreakdown(collaboratorId, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error(`Error loading monthly points breakdown for collaborator ${collaboratorId}:`, error);
          return { bloqueados: 0, desbloqueados: 0 };
        });
        
        this.monthlyPointsBreakdown = breakdown;
      } else {
        // Aggregate for all team members
        if (this.teamMemberIds.length === 0) {
          this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
          return;
        }
        
        const memberBreakdownPromises = this.teamMemberIds.map(memberId =>
          firstValueFrom(
            this.actionLogService.getMonthlyPointsBreakdown(memberId, this.selectedMonth)
              .pipe(takeUntil(this.destroy$))
          ).catch((error) => {
            console.error(`Error loading monthly points breakdown for member ${memberId}:`, error);
            return { bloqueados: 0, desbloqueados: 0 };
          })
        );
        
        const allBreakdowns = await Promise.all(memberBreakdownPromises);
        
        // Aggregate breakdowns
        const totalBloqueados = allBreakdowns.reduce((sum, breakdown) => sum + breakdown.bloqueados, 0);
        const totalDesbloqueados = allBreakdowns.reduce((sum, breakdown) => sum + breakdown.desbloqueados, 0);
        
        this.monthlyPointsBreakdown = {
          bloqueados: Math.floor(totalBloqueados),
          desbloqueados: Math.floor(totalDesbloqueados)
        };
      }
      
      console.log('✅ Monthly points breakdown loaded:', this.monthlyPointsBreakdown);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading monthly points breakdown:', error);
      this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
      this.cdr.markForCheck();
    }
  }

  /**
   * Get team player IDs as comma-separated string for modal
   * The modal expects a single playerId, but we'll pass all team member IDs
   */
  get teamPlayerIdsForModal(): string {
    return this.teamMemberIds.join(',');
  }

  /**
   * Toggle sidebar collapsed state
   */
  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.announceToScreenReader(this.sidebarCollapsed ? 'Menu recolhido' : 'Menu expandido');
  }

  /**
   * Format KPI value as integer with percentage sign
   */
  formatKpiValue(value: number): string {
    return `${Math.round(value)}%`;
  }

  /**
   * Get tooltip text showing current value vs target
   */
  getKpiTooltip(kpi: KPIData): string {
    const current = Math.round(kpi.current);
    const target = Math.round(kpi.target);
    return `${current}% de ${target}%`;
  }

  /**
   * Extract company name from CNPJ string
   * Format: "COMPANY NAME l CODE [ID|SUFFIX]"
   * Returns: Company name without the code and ID parts
   */
  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    // Extract text before " l " separator
    const match = cnpj.match(/^([^l]+)/);
    return match ? match[1].trim() : cnpj;
  }

  /**
   * Open company detail modal
   */
  openCompanyDetailModal(company: CompanyDisplay): void {
    this.selectedCarteiraCompany = company;
    this.isCompanyCarteiraDetailModalOpen = true;
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    const companyName = this.getCompanyDisplayName(company.cnpj);
    this.announceToScreenReader(`Abrindo detalhes de ${companyName}`);
  }

  /**
   * Handle company carteira detail modal close
   */
  onCompanyCarteiraDetailModalClosed(): void {
    const companyName = this.selectedCarteiraCompany 
      ? this.getCompanyDisplayName(this.selectedCarteiraCompany.cnpj) 
      : 'empresa';
    this.isCompanyCarteiraDetailModalOpen = false;
    this.selectedCarteiraCompany = null;
    this.announceToScreenReader(`Modal de ${companyName} fechado`);
    
    // Restore focus to the element that was focused before the modal opened
    if (this.focusedElementBeforeModal) {
      setTimeout(() => {
        this.focusedElementBeforeModal?.focus();
        this.focusedElementBeforeModal = null;
      }, 100);
    }
  }

  /**
   * Announce message to screen reader
   */
  private announceToScreenReader(message: string): void {
    this.screenReaderAnnouncement = message;
    this.cdr.markForCheck();
    // Clear after announcement
    setTimeout(() => {
      this.screenReaderAnnouncement = '';
      this.cdr.markForCheck();
    }, 1000);
  }

  /**
   * Load team KPIs
   * Calculates:
   * 1. Total de empresas da carteira (atual) vs soma das metas dos colaboradores (target)
   * 2. KPI de processos no prazo: média dos processos no prazo de todos os usuários no time
   */
  private async loadTeamKPIs(collaboratorId?: string): Promise<void> {
    try {
      this.isLoadingKPIs = true;
      
      if (collaboratorId) {
        // For single collaborator, use their KPIs
        const kpis = await firstValueFrom(
          this.kpiService.getPlayerKPIs(collaboratorId, this.selectedMonth, this.actionLogService)
            .pipe(takeUntil(this.destroy$))
        );
        this.teamKPIs = kpis || [];
      } else {
        // For team, aggregate KPIs from all members
        const teamKPIs: KPIData[] = [];
        
        if (this.teamMemberIds.length === 0) {
          this.teamKPIs = [];
          this.isLoadingKPIs = false;
          this.cdr.markForCheck();
          return;
        }
        
        // Load KPIs for all team members in parallel
        const kpiPromises = this.teamMemberIds.map(memberId =>
          firstValueFrom(
            this.kpiService.getPlayerKPIs(memberId, this.selectedMonth, this.actionLogService)
              .pipe(takeUntil(this.destroy$))
          ).catch(error => {
            console.error(`Error loading KPIs for member ${memberId}:`, error);
            return [];
          })
        );
        
        const allMemberKPIs = await Promise.all(kpiPromises);
        
        // Aggregate KPIs
        // 1. Clientes na Carteira: total atual vs soma das metas
        const empresasKPIs = allMemberKPIs
          .flat()
          .filter(kpi => kpi.id === 'numero-empresas');
        
        const totalEmpresasAtual = this.teamCarteiraClientes.length;
        const somaMetasEmpresas = empresasKPIs.reduce((sum, kpi) => sum + (kpi.target || 0), 0);
        
        if (empresasKPIs.length > 0 || totalEmpresasAtual > 0) {
          teamKPIs.push({
            id: 'numero-empresas',
            label: 'Clientes na Carteira',
            current: totalEmpresasAtual,
            target: somaMetasEmpresas || 10, // Fallback to 10 if no targets
            superTarget: Math.max(somaMetasEmpresas * 1.5, 15), // 1.5x target as super target
            unit: 'clientes',
            color: this.getKPIColorByGoals(totalEmpresasAtual, somaMetasEmpresas || 10, Math.max(somaMetasEmpresas * 1.5, 15)),
            percentage: Math.min((totalEmpresasAtual / Math.max(somaMetasEmpresas * 1.5, 15)) * 100, 100)
          });
        }
        
        // 2. Entregas no Prazo: média dos processos no prazo de todos os usuários
        const entregasKPIs = allMemberKPIs
          .flat()
          .filter(kpi => kpi.id === 'entregas-prazo');
        
        if (entregasKPIs.length > 0) {
          const mediaEntregas = entregasKPIs.reduce((sum, kpi) => sum + kpi.current, 0) / entregasKPIs.length;
          const targetEntregas = entregasKPIs[0]?.target || 80;
          const superTargetEntregas = entregasKPIs[0]?.superTarget || 90;
          
          teamKPIs.push({
            id: 'entregas-prazo',
            label: 'Entregas no Prazo',
            current: Math.round(mediaEntregas * 100) / 100, // Round to 2 decimals
            target: targetEntregas,
            superTarget: superTargetEntregas,
            unit: '%',
            color: this.getKPIColorByGoals(mediaEntregas, targetEntregas, superTargetEntregas),
            percentage: Math.min((mediaEntregas / superTargetEntregas) * 100, 100)
          });
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

  /**
   * Get KPI color based on goals (red/yellow/green)
   */
  private getKPIColorByGoals(current: number, target: number, superTarget: number): 'red' | 'yellow' | 'green' {
    if (current >= superTarget) {
      return 'green';
    } else if (current >= target) {
      return 'yellow';
    } else {
      return 'red';
    }
  }

  /**
   * Round value for KPI display
   */
  roundValue(value: number): number {
    return Math.round(value);
  }

  /**
   * Track by function for KPI list
   */
  trackByKpiId(index: number, kpi: KPIData): string {
    return kpi.id;
  }

  /**
   * Update formatted sidebar data for gamification dashboard components
   * Converts team data to PointWallet and SeasonProgress formats
   */
  private updateFormattedSidebarData(): void {
    // Convert seasonPoints to PointWallet format
    // Note: moedas is not available for teams, so we set it to 0
    this.teamPointWallet = {
      bloqueados: this.seasonPoints?.bloqueados || 0,
      desbloqueados: this.seasonPoints?.desbloqueados || 0,
      moedas: 0 // Teams don't have moedas, only individual players
    };
    
    // Calculate metas from team KPIs
    // Metas = count of KPIs where current >= target
    const totalKPIs = this.teamKPIs ? this.teamKPIs.length : 0;
    const metasAchieved = this.teamKPIs ? this.teamKPIs.filter(kpi => kpi.current >= kpi.target).length : 0;
    
    // Convert progressMetrics to SeasonProgress format
    // For teams, we use:
    // - metas: Calculated from teamKPIs (number of KPIs achieved / total KPIs)
    // - clientes: Count of unique CNPJs from teamCarteiraClientes
    // - tarefasFinalizadas: atividadesFinalizadas from progressMetrics
    const uniqueClientes = this.teamCarteiraClientes?.length || 0;
    
    this.teamSeasonProgress = {
      metas: {
        current: metasAchieved,
        target: totalKPIs
      },
      clientes: uniqueClientes,
      tarefasFinalizadas: this.progressMetrics?.atividadesFinalizadas || 0,
      seasonDates: this.seasonDates
    };
    
    console.log('📊 Team metas updated from KPIs:', this.teamSeasonProgress.metas, `(${metasAchieved}/${totalKPIs})`, `from ${totalKPIs} KPIs`);
    
    this.cdr.markForCheck();
  }

  /**
   * Format collaborator name from email or use provided name
   * Converts email like "joyce.carla@bwa.global" to "Joyce Carla"
   * 
   * @param userId - The user ID (email) or collaborator ID
   * @param collaboratorName - Optional name from collaborator object
   * @returns Formatted name for display
   */
  private formatCollaboratorName(userId: string, collaboratorName?: string): string {
    // If we have a name from the collaborator object, use it
    if (collaboratorName && collaboratorName.trim()) {
      return collaboratorName.trim();
    }
    
    // Otherwise, extract and format from email
    if (userId && userId.includes('@')) {
      // Get the part before @
      const emailPrefix = userId.split('@')[0];
      // Replace dots with spaces and split into words
      const words = emailPrefix.split('.');
      // Capitalize each word
      const formattedWords = words.map(word => {
        if (word.length === 0) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
      return formattedWords.join(' ');
    }
    
    // Fallback: return userId as-is if it's not an email
    return userId;
  }

  /**
   * Logout user and redirect to login page
   * Includes double confirmation to prevent accidental logout
   */
  logout(): void {
    // First confirmation
    const firstConfirm = window.confirm('Tem certeza que deseja sair do sistema?');
    if (!firstConfirm) {
      return;
    }
    
    // Second confirmation (double validation)
    const secondConfirm = window.confirm('Esta ação irá desconectar você do sistema. Deseja continuar?');
    if (!secondConfirm) {
      return;
    }
    
    // If both confirmations are accepted, proceed with logout
    this.sessaoProvider.logout();
  }
}
