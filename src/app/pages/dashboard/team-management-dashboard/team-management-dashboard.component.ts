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
import { CnpjLookupService } from '@services/cnpj-lookup.service';

// Models
import { Team } from '@components/c4u-team-selector/c4u-team-selector.component';
import { GoalMetric } from '@components/c4u-goals-progress-tab/c4u-goals-progress-tab.component';
import { GraphDataPoint, ActivityMetrics, ProcessMetrics, ChartDataset, PointWallet, SeasonProgress } from '@app/model/gamification-dashboard.model';
import { ProgressCardType } from '@components/c4u-activity-progress/c4u-activity-progress.component';
import { ProgressListType } from '@modals/modal-progress-list/modal-progress-list.component';

/**
 * Helper to generate Funifier date expressions using ISO format
 * 
 * NOTE: Funifier's relative date shortcuts (-0d-, -0M-, etc.) were found to be
 * unreliable in aggregate queries. Using ISO date strings instead for consistency.
 * 
 * @param date - Target date (dayjs object or Date)
 * @param position - 'start' for beginning of period, 'end' for end of period
 * @returns Funifier date expression with ISO string like { $date: "2026-03-12T00:00:00.000Z" }
 */
function toFunifierDate(date: dayjs.Dayjs | Date, position: 'start' | 'end' = 'start'): { $date: string } {
  const target = dayjs(date);
  
  let resultDate: Date;
  if (position === 'start') {
    // Start of day: 00:00:00.000 UTC
    resultDate = target.startOf('day').toDate();
  } else {
    // End of day: 23:59:59.999 UTC
    resultDate = target.endOf('day').toDate();
  }
  
  return { $date: resultDate.toISOString() };
}

/**
 * Team Management Dashboard Component
 * Main container for the management dashboard view
 * Accessible only to users with management teams (GESTAO, SUPERVISÃƒO, or DIREÃ‡ÃƒO)
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
  // Initialize to February 2026 by default (similar to gamification-dashboard)
  // Calculate months ago from current date to February 2026
  selectedMonthsAgo: number = (() => {
    const now = dayjs();
    const feb2026 = dayjs('2026-02-01');
    // Calculate how many months ago February 2026 is from now
    // If we're in February 2026, monthsAgo = 0
    // If we're in March 2026, monthsAgo = 1 (one month ago)
    // If we're in January 2026, monthsAgo = -1, but we'll use 0 as minimum
    const monthsDiff = now.diff(feb2026, 'month', true); // Use true for fractional months
    return Math.max(0, Math.round(monthsDiff));
  })();
  selectedMonth: Date = new Date(2026, 1, 1); // February 2026 (month is 0-indexed: 1 = February)
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
  teamMembersData: any[] = []; // Store full player data from aggregate (includes extra.cnpj_resp)
  
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
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ â†’ clean empresa name
  
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
  
  // Meta configuration state (expanded for both cnpj_goal and entrega_goal)
  // Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
  metaConfig: {
    selectedCollaborator: string;
    cnpjGoalValue: number | null;
    entregaGoalValue: number | null;
  } = {
    selectedCollaborator: 'all',
    cnpjGoalValue: null,
    entregaGoalValue: null
  };
  isSavingMeta: boolean = false;
  metaSaveMessage: string = '';
  metaSaveSuccess: boolean = false;
  
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

  /**
   * Initialize dashboard by loading user's team and season dates.
   * 
   * This method is called on component initialization and performs the following:
   * 1. Loads season dates from the SeasonDatesService
   * 2. Identifies the user's management team (GESTAO, SUPERVISÃƒO, or DIREÃ‡ÃƒO)
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
      // Load season dates first
      await this.loadSeasonDates();
      // Load available teams that the user has access to
      await this.loadAvailableTeams();
      // Select the first available team or previously selected team
      if (this.teams.length > 0) {
        const savedTeamId = localStorage.getItem('selectedTeamId');
        const teamToSelect = savedTeamId && this.teams.find(t => t.id === savedTeamId) 
          ? savedTeamId 
          : this.teams[0].id;
        
        await this.onTeamChange(teamToSelect);
        } else {
                this.toastService.error('UsuÃ¡rio nÃ£o tem acesso a nenhum time');
      }
    } catch (error) {
            this.toastService.error('Erro ao carregar dashboard');
    } finally {
      this.isLoading = false;
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
   * // { start: Date, end: Date }
   */
  private async loadSeasonDates(): Promise<void> {
    try {
      const dates = await this.seasonDatesService.getSeasonDates();
      this.seasonDates = {
        start: (dates as any).start || (dates as any).dataInicio,
        end: (dates as any).end || (dates as any).dataFim
      };
    } catch (error) {
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
   * - SUPERVISOR: Only their own SUPERVISÃƒO team
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
      // Debug: Log user's teams from session
      const userTeams = this.sessaoProvider.usuario?.teams;
      // Fetch all teams from Funifier
      const allTeams = await firstValueFrom(
        this.funifierApi.get<any[]>(`/v3/team`).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                return [];
      });
      
      let availableTeams: any[] = [];
      
      if (profile === UserProfile.DIRETOR) {
        // DIRETOR can see all teams
        availableTeams = allTeams.map((team: any) => ({
          id: team._id || team.id,
          name: team.name || team._id || team.id,
          memberCount: 0 // Will be updated below
        }));
        } else {
        // Get accessible team IDs based on profile
        let accessibleTeamIds = this.userProfileService.getAccessibleTeamIds();
        // If no accessible teams found, use ALL user's teams (except management team)
        if (accessibleTeamIds.length === 0 && userTeams && Array.isArray(userTeams)) {
          // Extract team IDs from user's teams
          const userTeamIds = userTeams.map((team: any) => {
            if (typeof team === 'string') return team;
            if (team && typeof team === 'object' && team._id) return team._id;
            return null;
          }).filter(Boolean) as string[];
          
          // For GESTOR, filter out the GESTAO team
          if (profile === UserProfile.GESTOR) {
            accessibleTeamIds = userTeamIds.filter(id => id !== 'FkmdnFU');
          } else if (profile === UserProfile.SUPERVISOR) {
            accessibleTeamIds = userTeamIds.filter(id => id !== 'Fkmdmko');
          } else {
            accessibleTeamIds = userTeamIds;
          }
          
          }
        
        // If still no accessible teams, try to get their own team
        if (accessibleTeamIds.length === 0) {
          const ownTeamId = this.userProfileService.getCurrentUserOwnTeamId();
          if (ownTeamId) {
            accessibleTeamIds.push(ownTeamId);
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
                        return [];
          });
          
          // Extract count from result
          const count = result && result.length > 0 && result[0].total ? result[0].total : 0;
          return { ...team, memberCount: count };
        } catch (error) {
                    return { ...team, memberCount: 0 };
        }
      });
      
      // Wait for all member counts to be loaded
      const teamsWithCounts = await Promise.all(memberCountPromises);
      
      this.teams = teamsWithCounts;
      this.isLoadingTeams = false;
    } catch (error) {
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
      // OPTIMIZED: Use single aggregate query on player_status to get all team members' data
      // This replaces individual player status requests with one batched request
      const aggregatePayload = [
        {
          $match: {
            teams: teamId
          }
        }
      ];
      
      // Fetch all player status data in batches using pagination
      const allPlayersStatus = await this.fetchAllPaginatedData<any>(
        '/database/player_status/aggregate?strict=true',
        aggregatePayload,
        100 // batch size
      );
      
      // Store full player data from aggregate (includes extra.cnpj_resp, name, email, point_categories, etc.)
      this.teamMembersData = allPlayersStatus;
      
      // Extract member IDs from aggregate result
      const memberIds = allPlayersStatus
        .map((player: any) => String(player._id))
        .filter((id: string) => id != null && id !== 'null' && id !== 'undefined');
      
      this.teamMemberIds = memberIds;
      if (memberIds.length === 0) {
                this.teamTotalPoints = 0;
        this.teamAveragePoints = 0;
        this.teamTotalTasks = 0;
        this.teamTotalBlockedPoints = 0;
        this.cdr.markForCheck();
        return;
      }
      
      // Process player status data directly from aggregate result
      // No need for individual requests - all data is already in allPlayersStatus
      let totalPoints = 0;
      let totalTasks = 0;
      let totalBlockedPoints = 0;
      let validMembers = 0;
      
      // Calculate points for the selected month using achievement aggregate
      const monthStart = dayjs(this.selectedMonth).startOf('month');
      const monthEnd = dayjs(this.selectedMonth).endOf('month');
      
      // Fetch points for all team members in one aggregate query
      const pointsAggregatePayload = [
        {
          $match: {
            player: { $in: memberIds },
            type: 0, // type 0 = points
            time: {
              $gte: toFunifierDate(monthStart, 'start'),
              $lte: toFunifierDate(monthEnd, 'end')
            }
          }
        },
        {
          $group: {
            _id: '$player',
            totalPoints: { $sum: '$total' }
          }
        }
      ];
      
      const pointsByPlayer = await firstValueFrom(
        this.funifierApi.post<any[]>(
          '/database/achievement/aggregate?strict=true',
          pointsAggregatePayload
        ).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                return [];
      });
      
      // Create a map of player -> points for quick lookup
      const pointsMap = new Map<string, number>();
      pointsByPlayer.forEach((item: any) => {
        pointsMap.set(item._id, item.totalPoints || 0);
      });
      
      // Process each player's data from the aggregate result
      allPlayersStatus.forEach((status: any) => {
        const memberId = status._id;
        
        // Get points for this player from the points aggregate
        const pointsForMonth = pointsMap.get(memberId) || 0;
        totalPoints += pointsForMonth;
        
        // Get tasks completed from extra.tarefas_finalizadas
        const tasks = status.extra?.tarefas_finalizadas || 0;
        totalTasks += tasks;
        
        // Get blocked points from status
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
        });
      
      // Calculate aggregated metrics (round down all values)
      this.teamTotalPoints = Math.floor(totalPoints);
      this.teamAveragePoints = validMembers > 0 ? Math.floor(totalPoints / validMembers) : 0;
      this.teamTotalTasks = Math.floor(totalTasks);
      this.teamTotalBlockedPoints = Math.floor(totalBlockedPoints);
      
      this.cdr.markForCheck();
    } catch (error) {
            this.teamTotalPoints = 0;
      this.teamAveragePoints = 0;
      this.teamTotalTasks = 0;
      this.teamTotalBlockedPoints = 0;
      this.cdr.markForCheck();
    }
  }

  /**
   * Fetch all data using pagination with Range header.
   * Automatically fetches all pages until complete.
   * 
   * @param endpoint - API endpoint
   * @param aggregatePayload - Aggregate pipeline array
   * @param batchSize - Number of items per batch
   * @returns Promise of all items
   */
  private async fetchAllPaginatedData<T>(
    endpoint: string,
    aggregatePayload: any[],
    batchSize: number = 100
  ): Promise<T[]> {
    const allResults: T[] = [];
    let startIndex = 0;
    let hasMore = true;
    
    while (hasMore) {
      const rangeHeader = `items=${startIndex}-${batchSize}`;
      try {
        const batchResults = await firstValueFrom(
          this.funifierApi.post<T[]>(
            endpoint,
            aggregatePayload,
            { headers: { 'Range': rangeHeader } }
          ).pipe(takeUntil(this.destroy$))
        );
        
        if (batchResults && Array.isArray(batchResults)) {
          allResults.push(...batchResults);
          
          // If we got a full batch, there might be more
          if (batchResults.length === batchSize) {
            startIndex += batchSize;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
                hasMore = false;
      }
    }
    
    return allResults;
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
        await this.loadCollaboratorData(this.selectedCollaborator, dateRange);
      } else {
        // Otherwise, load team aggregated data
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
      
      } catch (error) {
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
      
      // Get progress metrics and points for the collaborator
      const metrics = await firstValueFrom(
        this.actionLogService.getProgressMetrics(collaboratorId, this.selectedMonth)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                this.hasSidebarError = true;
        this.sidebarErrorMessage = 'Erro ao carregar mÃ©tricas de progresso';
        return {
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        };
      });
      
      // Get player status to get blocked points
      const status = await firstValueFrom(
        this.funifierApi.get<any>(`/v3/player/${collaboratorId}/status`).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
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
      
      this.cdr.markForCheck();
    } catch (error) {
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
      
      // Load season points and progress metrics in parallel
      const [points, metrics] = await Promise.all([
        firstValueFrom(
          this.teamAggregateService
            .getTeamSeasonPoints(this.selectedTeam, dateRange.start, dateRange.end)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
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
                    this.hasSidebarError = true;
          this.sidebarErrorMessage = 'Erro ao carregar mÃ©tricas de progresso';
          this.toastService.error('Erro ao carregar mÃ©tricas de progresso');
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
      
      this.cdr.markForCheck();
    } catch (error) {
            this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
      this.isLoadingSidebar = false;
    }
  }

  /**
   * Load collaborators for selected team
   * 
   * OPTIMIZED: Uses the data already loaded from loadTeamMembersData aggregate query
   * instead of making individual player status requests.
   */
  private async loadCollaborators(): Promise<void> {
    try {
      this.isLoadingCollaborators = true;
      // Preservar o selectedCollaborator ANTES de carregar
      const preservedCollaboratorId = this.selectedCollaborator || localStorage.getItem('selectedCollaboratorId');
      
      // OPTIMIZED: Use data already loaded from loadTeamMembersData aggregate query
      // No need for individual requests - all data is already in teamMembersData
      if (this.teamMembersData.length > 0) {
        // Extract collaborator info directly from the aggregate result
        this.collaborators = this.teamMembersData.map((playerStatus: any) => ({
          userId: playerStatus._id,
          name: playerStatus.name || playerStatus._id,
          email: playerStatus._id
        }));
        
        } else if (this.teamMemberIds.length === 0) {
                // Fallback: try to load from aggregate query
        const members = await firstValueFrom(
          this.teamAggregateService
            .getTeamMembers(this.selectedTeam)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
                    return [];
        });
        
        this.collaborators = members;
      } else {
        // Fallback: Use member IDs if teamMembersData is empty but memberIds exist
        // This shouldn't happen normally, but provides a safety net
        this.collaborators = this.teamMemberIds.map(memberId => ({
          userId: memberId,
          name: memberId,
          email: memberId
        }));
        }
      
      // Validate current selection exists in the list
      if (this.selectedCollaborator) {
        const collaboratorExists = this.collaborators.find(c => c.userId === this.selectedCollaborator);
        if (!collaboratorExists) {
                    this.selectedCollaborator = null;
        }
      }
      
      this.isLoadingCollaborators = false;
      this.cdr.markForCheck();
    } catch (error) {
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
      
      // Get progress metrics for the collaborator
      const metrics = await firstValueFrom(
        this.actionLogService.getProgressMetrics(collaboratorId, this.selectedMonth)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
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
      this.cdr.markForCheck();
    } catch (error) {
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
              $gte: toFunifierDate(startDate, 'start'),
              $lte: toFunifierDate(endDate, 'end')
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
      // For single collaborator, percentage is always 100%
      this.activitiesByCollaboratorLabels = [`${memberName} - ${activitiesTotal} (100%)`];
      
      // Load points data for the same period
      await this.loadCollaboratorPointsData(collaboratorId, startDate, endDate, memberName);
      
      this.isLoadingProductivity = false;
      this.cdr.markForCheck();
    } catch (error) {
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
              $gte: toFunifierDate(startDate, 'start'),
              $lte: toFunifierDate(endDate, 'end')
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
      // For single collaborator, percentage is always 100%
      this.pointsByCollaboratorLabels = [`${memberName} - ${pointsTotal} (100%)`];
      
      } catch (error) {
            this.pointsGraphData = [];
      this.pointsGraphDatasets = [];
    }
  }

  /**
   * Load productivity graph data with one line per team member
   * OPTIMIZED: Uses single aggregate query with $lookup to get all action logs for the team
   */
  private async loadProductivityData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingProductivity = true;
      this.hasProductivityError = false;
      this.productivityErrorMessage = '';
      
      if (this.teamMemberIds.length === 0) {
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
        // OPTIMIZED: Single aggregate query with $lookup to get all action logs for the team
        // This replaces N individual requests with 1 aggregate request
        const actionLogsAggregateBody = [
          {
            $lookup: {
              from: 'player',
              localField: 'userId',
              foreignField: '_id',
              as: 'playerData'
            }
          },
          {
            $unwind: '$playerData'
          },
          {
            $match: {
              'playerData.teams': this.selectedTeamId,
              time: {
                $gte: toFunifierDate(startDate, 'start'),
                $lte: toFunifierDate(endDate, 'end')
              }
            }
          },
          {
            $group: {
              _id: {
                userId: '$userId',
                date: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: { $toDate: '$time' }
                  }
                }
              },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id.date': 1 }
          }
        ];
        
        // OPTIMIZED: Single aggregate query for points
        const pointsAggregateBody = [
          {
            $match: {
              player: { $in: this.teamMemberIds },
              type: 0, // type 0 = points
              time: {
                $gte: toFunifierDate(startDate, 'start'),
                $lte: toFunifierDate(endDate, 'end')
              }
            }
          },
          {
            $group: {
              _id: {
                player: '$player',
                date: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: { $toDate: '$time' }
                  }
                }
              },
              total: { $sum: '$total' }
            }
          },
          {
            $sort: { '_id.date': 1 }
          }
        ];
        
        // Fetch both activities and points in parallel (2 requests instead of 2*N)
        const [allActionLogs, allPointsData] = await Promise.all([
          this.fetchAllPaginatedData<any>(
            '/database/action_log/aggregate?strict=true',
            actionLogsAggregateBody,
            100
          ),
          firstValueFrom(
            this.funifierApi.post<any[]>(
              '/database/achievement/aggregate?strict=true',
              pointsAggregateBody
            ).pipe(takeUntil(this.destroy$))
          ).catch((error) => {
                        return [];
          })
        ]);
        
        // Process action logs into per-member data
        const memberActivitiesMap = new Map<string, Map<string, number>>();
        allActionLogs.forEach((item: any) => {
          const userId = item._id?.userId;
          const dateStr = item._id?.date;
          const count = item.count || 0;
          
          if (userId && dateStr) {
            if (!memberActivitiesMap.has(userId)) {
              memberActivitiesMap.set(userId, new Map());
            }
            memberActivitiesMap.get(userId)!.set(dateStr, count);
          }
        });
        
        // Process points into per-member data
        const memberPointsMap = new Map<string, Map<string, number>>();
        allPointsData.forEach((item: any) => {
          const player = item._id?.player;
          const dateStr = item._id?.date;
          const total = item.total || 0;
          
          if (player && dateStr) {
            if (!memberPointsMap.has(player)) {
              memberPointsMap.set(player, new Map());
            }
            memberPointsMap.get(player)!.set(dateStr, total);
          }
        });
        
        // Build member data from the aggregated results
        const validMemberData: Array<{ 
          memberId: string; 
          memberName: string; 
          activitiesDataPoints: GraphDataPoint[]; 
          pointsDataPoints: GraphDataPoint[] 
        }> = [];
        
        this.teamMemberIds.forEach(memberId => {
          const collaborator = this.collaborators.find(c => c.userId === memberId);
          const memberName = this.formatCollaboratorName(memberId, collaborator?.name);
          
          const activitiesMap = memberActivitiesMap.get(memberId) || new Map();
          const pointsMap = memberPointsMap.get(memberId) || new Map();
          
          const activitiesDataPoints: GraphDataPoint[] = [];
          const pointsDataPoints: GraphDataPoint[] = [];
          
          // Fill all dates in range
          let currentDate = startDate;
          while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
            const dateStr = currentDate.format('YYYY-MM-DD');
            activitiesDataPoints.push({
              date: currentDate.toDate(),
              value: activitiesMap.get(dateStr) || 0
            });
            pointsDataPoints.push({
              date: currentDate.toDate(),
              value: Math.floor(pointsMap.get(dateStr) || 0)
            });
            currentDate = currentDate.add(1, 'day');
          }
          
          validMemberData.push({
            memberId,
            memberName,
            activitiesDataPoints,
            pointsDataPoints
          });
        });
        
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
        this.cdr.markForCheck();
      } catch (error) {
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
  
  // Calculate total for percentage calculation
  const totalActivities = activitiesTotals.reduce((sum, item) => sum + item.total, 0);
  const totalPoints = pointsTotals.reduce((sum, item) => sum + item.total, 0);
  
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
  
  // Store collaborator names with percentage for chart labels
  // Format: "Nome - Valor (Porcentagem%)"
  this.activitiesByCollaboratorLabels = activitiesTotals.map(item => {
    const percentage = totalActivities > 0 ? Math.round((item.total / totalActivities) * 100) : 0;
    return `${item.name} - ${item.total} (${percentage}%)`;
  });
  this.pointsByCollaboratorLabels = pointsTotals.map(item => {
    const percentage = totalPoints > 0 ? Math.round((item.total / totalPoints) * 100) : 0;
    return `${item.name} - ${item.total} (${percentage}%)`;
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
   * OPTIMIZED: Uses single aggregate query instead of N individual requests
   */
  private async loadTeamActivityAndMacroData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      if (this.teamMemberIds.length === 0) {
                return;
      }
      
      // OPTIMIZED: Single aggregate query for all team members
      const metrics = await firstValueFrom(
        this.teamAggregateService.getTeamActivityMetrics(
          this.selectedTeamId,
          dateRange.start,
          dateRange.end
        ).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                return { finalizadas: 0, pontos: 0, processosFinalizados: 0, processosIncompletos: 0 };
      });
      
      // Get total points from achievement aggregate
      const totalPoints = await firstValueFrom(
        this.teamAggregateService.getTeamTotalPoints(
          this.teamMemberIds,
          dateRange.start,
          dateRange.end
        ).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                return 0;
      });
      
      // Set aggregated team metrics
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
      // Get CNPJ list with action counts and process counts for the collaborator
      const carteiraData = await firstValueFrom(
        this.actionLogService.getPlayerCnpjListWithCount(collaboratorId, this.selectedMonth)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                return [];
      });
      
      // Extract all CNPJ strings for lookup
      const cnpjList = carteiraData.map(c => c.cnpj);
      
      // Enrich CNPJs with clean company names
      const cnpjNames = await firstValueFrom(
        this.cnpjLookupService.enrichCnpjList(cnpjList)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                return new Map<string, string>();
      });
      this.cnpjNameMap = cnpjNames;
      // Enrich with KPI data
      const enrichedClientes = await firstValueFrom(
        this.companyKpiService.enrichCompaniesWithKpis(carteiraData)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                // Return data without KPI enrichment on error
        return carteiraData.map(item => ({
          cnpj: item.cnpj,
          actionCount: item.actionCount
        } as CompanyDisplay));
      });
      
      this.teamCarteiraClientes = enrichedClientes;
      
      // Update formatted sidebar data after carteira is loaded (for clientes count)
      this.updateFormattedSidebarData();
      
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    } catch (error) {
            this.teamCarteiraClientes = [];
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Load team carteira (companies/CNPJs) data using OPTIMIZED single aggregate query
   * 
   * Uses $lookup aggregate query to get all CNPJs and action counts for team members
   * in a single API call instead of N individual calls per member.
   * 
   * @private
   * @async
   * @param dateRange - Date range for filtering actions
   * @returns Promise that resolves when carteira data is loaded
   */
  private async loadTeamCarteiraData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingCarteira = true;
      if (!this.selectedTeamId) {
                this.teamCarteiraClientes = [];
        this.isLoadingCarteira = false;
        this.cdr.markForCheck();
        return;
      }
      
      // Calculate date range for the selected month
      const monthStart = dayjs(this.selectedMonth).startOf('month').toDate();
      const monthEnd = dayjs(this.selectedMonth).endOf('month').toDate();
      
      // OPTIMIZED: Use single aggregate query with $lookup - 1 API call instead of N
      const cnpjListWithCounts = await firstValueFrom(
        this.teamAggregateService.getTeamCnpjListWithCount(
          this.selectedTeamId,
          monthStart,
          monthEnd
        ).pipe(takeUntil(this.destroy$))
      ).catch((error) => {
        console.error('Error loading team carteira data (optimized):', error);
        return [];
      });
      
      if (cnpjListWithCounts.length === 0) {
        this.teamCarteiraClientes = [];
        this.isLoadingCarteira = false;
        this.cdr.markForCheck();
        return;
      }
      
      // Extract all CNPJ strings for lookup
      const cnpjList = cnpjListWithCounts.map(c => c.cnpj);
      
      // Enrich CNPJs with clean company names
      const cnpjNames = await firstValueFrom(
        this.cnpjLookupService.enrichCnpjList(cnpjList)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                return new Map<string, string>();
      });
      this.cnpjNameMap = cnpjNames;
      // Enrich with KPI data
      const enrichedClientes = await firstValueFrom(
        this.companyKpiService.enrichCompaniesWithKpis(cnpjListWithCounts)
          .pipe(takeUntil(this.destroy$))
      ).catch((error) => {
                // Return data without KPI enrichment on error
        return cnpjListWithCounts.map(item => ({
          cnpj: item.cnpj,
          actionCount: item.actionCount
        } as CompanyDisplay));
      });
      
      this.teamCarteiraClientes = enrichedClientes;
      
      // Update formatted sidebar data after carteira is loaded (for clientes count)
      this.updateFormattedSidebarData();
      
      this.isLoadingCarteira = false;
      this.cdr.markForCheck();
    } catch (error) {
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
      // Find the team in the teams array to get the name
      const team = this.teams.find(t => t.id === teamId);
      if (!team) {
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
      } else {
      // Reset to team view when "Redefinir seleÃ§Ã£o" is selected
      this.activeTab = 'goals'; // Keep on goals tab to show team KPIs and progress
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
  /**
   * Handle month selection change event.
   * 
   * When a user navigates to a different month:
   * 1. Updates the selectedMonthsAgo property
   * 2. Updates the selectedMonth Date object
   * 3. Reloads all team data for the new month
   * 
   * Similar to gamification-dashboard implementation.
   * 
   * @param monthsAgo - Number of months before current month (0 = current, 1 = previous, etc.)
   * 
   * @example
   * // Current month (February 2026)
   * onMonthChange(0);
   * 
   * // Previous month (January 2026)
   * onMonthChange(1);
   * 
   * @see {@link loadTeamData}
   * @see {@link calculateDateRange}
   */
  onMonthChange(monthsAgo: number): void {
    this.selectedMonthsAgo = monthsAgo;
    // Calculate the target month date (similar to gamification-dashboard)
    const date = new Date();
    date.setMonth(date.getMonth() - monthsAgo);
    this.selectedMonth = date;
    const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    this.announceToScreenReader(`MÃªs alterado para ${monthName}`);
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
   * For team: uses OPTIMIZED single aggregate query for all team members
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
        // Load for specific collaborator (single request)
        const breakdown = await firstValueFrom(
          this.actionLogService.getMonthlyPointsBreakdown(collaboratorId, this.selectedMonth)
            .pipe(takeUntil(this.destroy$))
        ).catch((error) => {
                    return { bloqueados: 0, desbloqueados: 0 };
        });
        
        this.monthlyPointsBreakdown = breakdown;
      } else {
        // OPTIMIZED: Use single aggregate query for all team members
        if (this.teamMemberIds.length === 0) {
          this.monthlyPointsBreakdown = { bloqueados: 0, desbloqueados: 0 };
          return;
        }
        
        // Calculate date range for the selected month
        const monthStart = dayjs(this.selectedMonth).startOf('month').toDate();
        const monthEnd = dayjs(this.selectedMonth).endOf('month').toDate();
        
        // Use optimized team aggregate service - single API call instead of N calls
        const breakdown = await firstValueFrom(
          this.teamAggregateService.getTeamMonthlyPointsBreakdown(
            this.teamMemberIds,
            monthStart,
            monthEnd
          ).pipe(takeUntil(this.destroy$))
        ).catch((error) => {
          console.error('Error loading team monthly points breakdown (optimized):', error);
          return { bloqueados: 0, desbloqueados: 0 };
        });
        
        this.monthlyPointsBreakdown = breakdown;
        }
      
      this.cdr.markForCheck();
    } catch (error) {
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
   * Get player ID for month selector component
   * Uses the first team member ID if available, otherwise uses current user ID
   * Similar to gamification-dashboard implementation
   */
  getTeamPlayerIdForMonthSelector(): string {
    // If we have team members, use the first one
    if (this.teamMemberIds.length > 0) {
      return this.teamMemberIds[0];
    }
    
    // Otherwise, use current user ID from session
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    if (usuario) {
      return (usuario._id || usuario.email || '') as string;
    }
    
    // Fallback to empty string
    return '';
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
  /**
   * Format KPI value for display in company list
   * For percentage-based KPIs (unit === '%'), show the raw value directly
   * For other KPIs, show percentage of target achievement
   */
  formatKpiValue(kpi: KPIData): string {
    // Show current value instead of achievement percentage
    const current = Math.round(kpi.current);
    const unit = kpi.unit || '%';
    return `${current}${unit}`;
  }

  /**
   * Get tooltip text showing current value vs target
   * Format: "75% de 80%" (valor alcanÃ§ado de meta)
   */
  getKpiTooltip(kpi: KPIData): string {
    const current = Math.round(kpi.current);
    const target = Math.round(kpi.target);
    const unit = kpi.unit || '';
    return `${current}${unit} de ${target}${unit}`;
  }

  /**
   * Get clean company display name from CNPJ
   * Uses the enriched CNPJ name map from the lookup service
   * Format: "COMPANY NAME l CODE [ID|SUFFIX]"
   * Returns: Clean company name from empid_cnpj__c collection
   */
  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    // Use the enriched name from the map, fallback to original
    const displayName = this.cnpjNameMap.get(cnpj);
    return displayName || cnpj;
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
   * OPTIMIZED: Uses already-loaded teamCarteiraClientes for company count
   * and single aggregate query for delivery percentage
   * 
   * Calculates:
   * 1. Total de empresas da carteira (atual) vs soma das metas dos colaboradores (target)
   * 2. KPI de processos no prazo: mÃ©dia dos processos no prazo de todos os usuÃ¡rios no time
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
        // OPTIMIZED: For team, use already-loaded data instead of N individual calls
        const teamKPIs: KPIData[] = [];
        
        if (this.teamMemberIds.length === 0) {
          this.teamKPIs = [];
          this.isLoadingKPIs = false;
          this.cdr.markForCheck();
          return;
        }
        
        // 1. Clientes na Carteira: use already-loaded teamCarteiraClientes
        // This data was loaded by loadTeamCarteiraData() using optimized aggregate query
        const totalEmpresasAtual = this.teamCarteiraClientes.length;
        
        // Fetch cnpj_goal from all team members using aggregate query
        // Sum all cnpj_goal values, defaulting each member to 10 if not set
        let somaMetasEmpresas = 0;
        try {
          const aggregateQuery = [
            {
              $match: {
                _id: { $in: this.teamMemberIds }
              }
            },
            {
              $project: {
                _id: 1,
                cnpj_goal: '$extra.cnpj_goal'
              }
            }
          ];
          
          const playerCnpjGoals = await firstValueFrom(
            this.funifierApi.post<{ _id: string; cnpj_goal?: number }[]>(
              '/database/player_status/aggregate?strict=true',
              aggregateQuery
            ).pipe(takeUntil(this.destroy$))
          ).catch(error => {
                        return [] as { _id: string; cnpj_goal?: number }[];
          });
          
          // Sum all cnpj_goal from team members, defaulting to 10 for each member without a goal
          somaMetasEmpresas = playerCnpjGoals.reduce((sum: number, player: { _id: string; cnpj_goal?: number }) => {
            const cnpjGoal = player.cnpj_goal;
            
            // Default to 10 if cnpj_goal is null or undefined
            if (cnpjGoal === undefined || cnpjGoal === null) {
              return sum + 10;
            }
            
            const numValue = typeof cnpjGoal === 'number' 
              ? cnpjGoal 
              : parseInt(String(cnpjGoal), 10);
            return sum + (isNaN(numValue) ? 10 : numValue);
          }, 0);
          
          // If no members were found, use default of 10 per member
          if (playerCnpjGoals.length === 0) {
            somaMetasEmpresas = this.teamMemberIds.length * 10;
          }
          
          } catch (error) {
                    // Fallback to default if error
          somaMetasEmpresas = this.teamMemberIds.length * 10;
        }
        
        // Use sum of goals (already includes defaults for members without goals)
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
        
        // 2. Entregas no Prazo: fetch from player data using single aggregate query
        // Only fetch if we're looking at current month (entrega is only valid for current month)
        const now = new Date();
        const isCurrentMonth = this.selectedMonth.getFullYear() === now.getFullYear() && 
                               this.selectedMonth.getMonth() === now.getMonth();
        
        if (isCurrentMonth) {
          try {
            // Use single aggregate query to get all team members' entrega values and entrega_goal
            const aggregateQuery = [
              {
                $match: {
                  _id: { $in: this.teamMemberIds }
                }
              },
              {
                $project: {
                  _id: 1,
                  entrega: '$extra.entrega',
                  entrega_goal: '$extra.entrega_goal'
                }
              }
            ];
            
            const playerEntregas = await firstValueFrom(
              this.funifierApi.post<{ _id: string; entrega?: string; entrega_goal?: number }[]>(
                '/database/player_status/aggregate?strict=true',
                aggregateQuery
              ).pipe(takeUntil(this.destroy$))
            ).catch(error => {
                            return [] as { _id: string; entrega?: string; entrega_goal?: number }[];
            });
            
            // Calculate average entrega percentage
            const validEntregas = playerEntregas
              .filter(p => p.entrega != null && p.entrega !== '')
              .map(p => parseFloat(p.entrega || '0'))
              .filter(v => !isNaN(v));
            
            // Calculate average entrega_goal from team members, defaulting to 90 for each member without a goal
            let targetEntregas = 90;
            if (playerEntregas.length > 0) {
              const entregaGoalSum = playerEntregas.reduce((sum: number, player: { _id: string; entrega?: string; entrega_goal?: number }) => {
                const entregaGoal = player.entrega_goal;
                
                // Default to 90 if entrega_goal is null or undefined
                if (entregaGoal === undefined || entregaGoal === null) {
                  return sum + 90;
                }
                
                const numValue = typeof entregaGoal === 'number' 
                  ? entregaGoal 
                  : parseFloat(String(entregaGoal));
                return sum + (isNaN(numValue) ? 90 : numValue);
              }, 0);
              
              targetEntregas = Math.round((entregaGoalSum / playerEntregas.length) * 100) / 100;
              }
            
            if (validEntregas.length > 0) {
              const mediaEntregas = validEntregas.reduce((sum, v) => sum + v, 0) / validEntregas.length;
              const superTargetEntregas = 100;
              
              teamKPIs.push({
                id: 'entregas-prazo',
                label: 'Entregas no Prazo',
                current: Math.round(mediaEntregas * 100) / 100,
                target: targetEntregas,
                superTarget: superTargetEntregas,
                unit: '%',
                color: this.getKPIColorByGoals(mediaEntregas, targetEntregas, superTargetEntregas),
                percentage: Math.min((mediaEntregas / superTargetEntregas) * 100, 100)
              });
            }
            
            } catch (error) {
                      }
        }
        
        this.teamKPIs = teamKPIs;
      }
      
      this.isLoadingKPIs = false;
      this.cdr.markForCheck();
    } catch (error) {
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
   * Get enabled KPIs (excluding commented/disabled ones)
   * Currently excludes 'numero-empresas' (Clientes na Carteira)
   */
  get enabledKPIs(): KPIData[] {
    return this.teamKPIs.filter(kpi => kpi.id !== 'numero-empresas');
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
    
    this.cdr.markForCheck();
  }

  /**
   * Format collaborator name for display (public method for template)
   */
  getCollaboratorDisplayName(userId: string): string {
    return this.formatCollaboratorName(userId);
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
   * Validate cnpj_goal value: must be a non-negative integer
   * @param value - Value to validate
   * @returns true if valid, false otherwise
   * Requirements: 4.7
   */
  private isValidCnpjGoal(value: number | null): boolean {
    if (value === null || value === undefined) {
      return true; // null is valid (optional field)
    }
    return Number.isInteger(value) && value >= 0;
  }

  /**
   * Validate entrega_goal value: must be a number between 0 and 100
   * @param value - Value to validate
   * @returns true if valid, false otherwise
   * Requirements: 4.7
   */
  private isValidEntregaGoal(value: number | null): boolean {
    if (value === null || value === undefined) {
      return true; // null is valid (optional field)
    }
    return typeof value === 'number' && value >= 0 && value <= 100;
  }

  /**
   * Save goals configuration for selected collaborator(s)
   * Updates the extra.cnpj_goal and extra.entrega_goal fields in Funifier player object
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
   */
  async saveGoals(): Promise<void> {
    const { cnpjGoalValue, entregaGoalValue, selectedCollaborator } = this.metaConfig;

    // Validate that at least one goal is provided
    if (cnpjGoalValue === null && entregaGoalValue === null) {
      this.metaSaveMessage = 'Por favor, insira pelo menos um valor de meta';
      this.metaSaveSuccess = false;
      this.cdr.markForCheck();
      return;
    }

    // Validate cnpj_goal: must be a non-negative integer (Requirement 4.7)
    if (cnpjGoalValue !== null && !this.isValidCnpjGoal(cnpjGoalValue)) {
      this.metaSaveMessage = 'Meta de Clientes deve ser um nÃºmero inteiro nÃ£o negativo';
      this.metaSaveSuccess = false;
      this.cdr.markForCheck();
      return;
    }

    // Validate entrega_goal: must be between 0 and 100 (Requirement 4.7)
    if (entregaGoalValue !== null && !this.isValidEntregaGoal(entregaGoalValue)) {
      this.metaSaveMessage = 'Meta de Entregas deve ser um nÃºmero entre 0 e 100';
      this.metaSaveSuccess = false;
      this.cdr.markForCheck();
      return;
    }

    this.isSavingMeta = true;
    this.metaSaveMessage = '';
    this.cdr.markForCheck();

    try {
      // Prepare goal values (floor cnpj_goal to ensure integer)
      const cnpjGoal = cnpjGoalValue !== null ? Math.floor(cnpjGoalValue) : null;
      const entregaGoal = entregaGoalValue;

      if (selectedCollaborator === 'all') {
        // Update all collaborators in the team (Requirement 4.4)
        if (this.collaborators.length === 0) {
          this.metaSaveMessage = 'Nenhum colaborador encontrado na equipe';
          this.metaSaveSuccess = false;
          this.isSavingMeta = false;
          this.cdr.markForCheck();
          return;
        }

        // Track failures for individual error reporting (Requirement 4.5)
        const failures: { collaboratorName: string; error: string }[] = [];
        let successCount = 0;

        // Send individual PUT requests per collaborator (Requirement 4.4)
        for (const collaborator of this.collaborators) {
          try {
            await this.updatePlayerGoals(collaborator.userId, cnpjGoal, entregaGoal);
            successCount++;
          } catch (error: any) {
            const collaboratorName = collaborator.name || this.formatCollaboratorName(collaborator.userId);
            failures.push({
              collaboratorName,
              error: error?.message || 'Erro desconhecido'
            });
            // Show error toast per collaborator on failure (Requirement 4.5)
            this.toastService.error(`Erro ao atualizar meta para ${collaboratorName}`);
          }
        }

        // Report results
        if (failures.length === 0) {
          // All succeeded (Requirement 4.6)
          const goalDescription = this.buildGoalDescription(cnpjGoal, entregaGoal);
          this.metaSaveMessage = `${goalDescription} configurada para todos os ${this.collaborators.length} colaboradores`;
          this.metaSaveSuccess = true;
          this.toastService.success(`Metas configuradas para todos os colaboradores`);
        } else if (successCount > 0) {
          // Partial success
          this.metaSaveMessage = `Metas configuradas para ${successCount} colaboradores. ${failures.length} falha(s).`;
          this.metaSaveSuccess = false;
        } else {
          // All failed
          this.metaSaveMessage = `Erro ao configurar metas para todos os colaboradores`;
          this.metaSaveSuccess = false;
        }
      } else {
        // Update single collaborator (Requirements 4.2, 4.3)
        const collaborator = this.collaborators.find(c => c.userId === selectedCollaborator);
        const collaboratorName = collaborator?.name || this.formatCollaboratorName(selectedCollaborator);
        
        await this.updatePlayerGoals(selectedCollaborator, cnpjGoal, entregaGoal);
        
        const goalDescription = this.buildGoalDescription(cnpjGoal, entregaGoal);
        this.metaSaveMessage = `${goalDescription} configurada para ${collaboratorName}`;
        this.metaSaveSuccess = true;
        this.toastService.success(`Metas configuradas para ${collaboratorName}`);
      }

      // Reset form after successful save
      if (this.metaSaveSuccess) {
        setTimeout(() => {
          this.resetMetaForm();
        }, 2000);
      }
      
    } catch (error: any) {
            this.metaSaveMessage = error?.message || 'Erro ao salvar metas. Tente novamente.';
      this.metaSaveSuccess = false;
      this.toastService.error('Erro ao salvar metas');
    } finally {
      this.isSavingMeta = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Build a human-readable description of the goals being set
   * @param cnpjGoal - CNPJ goal value (or null)
   * @param entregaGoal - Entrega goal value (or null)
   * @returns Description string
   */
  private buildGoalDescription(cnpjGoal: number | null, entregaGoal: number | null): string {
    const parts: string[] = [];
    if (cnpjGoal !== null) {
      parts.push(`Meta de ${cnpjGoal} clientes`);
    }
    if (entregaGoal !== null) {
      parts.push(`Meta de ${entregaGoal}% entregas`);
    }
    return parts.join(' e ') || 'Metas';
  }

  /**
   * Update player's cnpj_goal and entrega_goal in Funifier
   * Sends PUT request to https://service2.funifier.com/v3/player/{playerId}
   * with body {"extra": {"cnpj_goal": value, "entrega_goal": value}}
   * 
   * @param playerId - Player ID (email)
   * @param cnpjGoal - Target number of clients (non-negative integer) or null to skip
   * @param entregaGoal - Target delivery percentage (0-100) or null to skip
   * Requirements: 4.2, 4.3
   */
  private async updatePlayerGoals(playerId: string, cnpjGoal: number | null, entregaGoal: number | null): Promise<void> {
    try {
      // First, get current player data to preserve existing extra fields
      const currentPlayerData = await firstValueFrom(
        this.funifierApi.get<any>(`player/${playerId}`)
      );

      // Build the extra object with only the goals being updated
      const extraUpdate: any = { ...(currentPlayerData.extra || {}) };
      
      // Update cnpj_goal if provided (Requirement 4.2)
      if (cnpjGoal !== null) {
        extraUpdate.cnpj_goal = cnpjGoal;
      }
      
      // Update entrega_goal if provided (Requirement 4.3)
      if (entregaGoal !== null) {
        extraUpdate.entrega_goal = entregaGoal;
      }

      // Prepare update payload following Funifier API structure
      const updatePayload: any = {
        extra: extraUpdate
      };

      // Update player using PUT endpoint
      await firstValueFrom(
        this.funifierApi.put<any>(`player/${playerId}`, updatePayload)
      );

      } catch (error: any) {
            throw new Error(`Erro ao atualizar metas para ${playerId}: ${error.message}`);
    }
  }

  /**
   * Save clientes meta configuration for selected collaborator(s)
   * @deprecated Use saveGoals() instead
   * Updates the extra.client_goals field (number) in Funifier player object
   */
  async saveClientesMeta(): Promise<void> {
    // Redirect to new saveGoals method for backward compatibility
    // Map old targetValue to cnpjGoalValue
    if ((this.metaConfig as any).targetValue !== undefined) {
      this.metaConfig.cnpjGoalValue = (this.metaConfig as any).targetValue;
    }
    return this.saveGoals();
  }

  /**
   * Update player's client_goals in Funifier
   * @deprecated Use updatePlayerGoals() instead
   * @param playerId - Player ID (email)
   * @param targetValue - Target number of clients
   */
  private async updatePlayerClientesTarget(playerId: string, targetValue: number): Promise<void> {
    // Redirect to new updatePlayerGoals method for backward compatibility
    return this.updatePlayerGoals(playerId, targetValue, null);
  }

  /**
   * Reset meta configuration form
   * Requirements: 4.1
   */
  resetMetaForm(): void {
    this.metaConfig = {
      selectedCollaborator: 'all',
      cnpjGoalValue: null,
      entregaGoalValue: null
    };
    this.metaSaveMessage = '';
    this.metaSaveSuccess = false;
    this.cdr.markForCheck();
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
    const secondConfirm = window.confirm('Esta aÃ§Ã£o irÃ¡ desconectar vocÃª do sistema. Deseja continuar?');
    if (!secondConfirm) {
      return;
    }
    
    // If both confirmations are accepted, proceed with logout
    this.sessaoProvider.logout();
  }
}



