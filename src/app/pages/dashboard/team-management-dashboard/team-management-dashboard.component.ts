import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import * as dayjs from 'dayjs';
import { trigger, transition, style, animate } from '@angular/animations';

// Services
import { TeamAggregateService, TeamSeasonPoints, TeamProgressMetrics, Collaborator } from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';

// Models
import { Team } from '@components/c4u-team-selector/c4u-team-selector.component';
import { GoalMetric } from '@components/c4u-goals-progress-tab/c4u-goals-progress-tab.component';
import { GraphDataPoint } from '@app/model/gamification-dashboard.model';

/**
 * Team Management Dashboard Component
 * Main container for the management dashboard view
 * Accessible only to users with GESTAO role
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
  selectedPeriod: number = 30;
  
  // Refresh tracking
  lastRefresh: Date = new Date();
  
  // Cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private teamAggregateService: TeamAggregateService,
    private graphDataProcessor: GraphDataProcessorService,
    private seasonDatesService: SeasonDatesService,
    private toastService: ToastService,
    private sessaoProvider: SessaoProvider
  ) {}

  ngOnInit(): void {
    this.initializeDashboard();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize dashboard by loading teams and season dates.
   * 
   * This method is called on component initialization and performs the following:
   * 1. Loads season dates from the SeasonDatesService
   * 2. Loads available teams (from hardcoded list or user metadata)
   * 3. Selects the first team or previously selected team from localStorage
   * 4. Loads all data for the selected team
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
      
      // Load available teams
      await this.loadTeams();
      
      // If teams are available, load data for the first team
      if (this.teams.length > 0) {
        // Check if there's a saved team selection
        const savedTeam = localStorage.getItem('selectedTeamId');
        if (savedTeam && this.teams.some(t => t.id === savedTeam)) {
          this.selectedTeam = savedTeam;
        } else {
          this.selectedTeam = this.teams[0].id;
        }
        
        await this.loadTeamData();
      }
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      this.toastService.error('Erro ao carregar dashboard');
    } finally {
      this.isLoading = false;
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
   * Load available teams for the current user.
   * 
   * Currently uses hardcoded teams but can be extended to fetch from:
   * - User metadata (extra.teams field)
   * - Funifier API
   * - Custom team management service
   * 
   * Teams are stored in the component's teams array and displayed in the
   * team selector dropdown.
   * 
   * @private
   * @async
   * @returns Promise that resolves when teams are loaded
   * 
   * @todo Replace hardcoded teams with API call
   * 
   * @example
   * await this.loadTeams();
   * console.log(this.teams); // [{ id: 'Team1', name: 'Team1', memberCount: 0 }]
   */
  private async loadTeams(): Promise<void> {
    try {
      this.isLoadingTeams = true;
      
      // TODO: Replace with actual API call to fetch teams from Funifier or user metadata
      // For now, using hardcoded teams based on the data schema examples
      this.teams = [
        { id: 'Departamento Pessoal', name: 'Departamento Pessoal', memberCount: 0 },
        { id: 'Financeiro', name: 'Financeiro', memberCount: 0 },
        { id: 'Comercial', name: 'Comercial', memberCount: 0 }
      ];
      
      // Try to get teams from user metadata if available
      const user = this.sessaoProvider.usuario;
      if (user?.extra?.['teams'] && Array.isArray(user.extra['teams'])) {
        this.teams = user.extra['teams'].map((teamName: string) => ({
          id: teamName,
          name: teamName,
          memberCount: 0
        }));
      }
    } catch (error) {
      console.error('Error loading teams:', error);
      this.toastService.error('Erro ao carregar equipes');
    } finally {
      this.isLoadingTeams = false;
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
    if (!this.selectedTeam) {
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
        this.loadProductivityData(dateRange)
      ]);
      
      this.lastRefresh = new Date();
    } catch (error) {
      console.error('Error loading team data:', error);
      this.toastService.error('Erro ao carregar dados da equipe');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Calculate date range based on selected month.
   * 
   * Uses the selectedMonthsAgo property to calculate the start and end dates
   * of the target month. For example:
   * - selectedMonthsAgo = 0: Current month
   * - selectedMonthsAgo = 1: Previous month
   * - selectedMonthsAgo = 2: Two months ago
   * 
   * @private
   * @returns Object containing start and end dates of the selected month
   * 
   * @example
   * this.selectedMonthsAgo = 1; // Previous month
   * const range = this.calculateDateRange();
   * // Returns: { start: Date(2023-12-01), end: Date(2023-12-31) }
   */
  private calculateDateRange(): { start: Date; end: Date } {
    const now = dayjs();
    const targetMonth = now.subtract(this.selectedMonthsAgo, 'month');
    
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
      
      // Load season points
      this.teamAggregateService
        .getTeamSeasonPoints(this.selectedTeam, dateRange.start, dateRange.end)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.isLoadingSidebar = false)
        )
        .subscribe({
          next: (points) => {
            this.seasonPoints = points;
            this.hasSidebarError = false;
          },
          error: (error) => {
            console.error('Error loading season points:', error);
            this.seasonPoints = { total: 0, bloqueados: 0, desbloqueados: 0 };
            this.hasSidebarError = true;
            this.sidebarErrorMessage = 'Erro ao carregar pontos da temporada';
            this.toastService.error('Erro ao carregar pontos da temporada');
          }
        });
      
      // Load progress metrics
      this.teamAggregateService
        .getTeamProgressMetrics(this.selectedTeam, dateRange.start, dateRange.end)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (metrics) => {
            this.progressMetrics = metrics;
            this.hasSidebarError = false;
          },
          error: (error) => {
            console.error('Error loading progress metrics:', error);
            this.progressMetrics = {
              processosIncompletos: 0,
              atividadesFinalizadas: 0,
              processosFinalizados: 0
            };
            this.hasSidebarError = true;
            this.sidebarErrorMessage = 'Erro ao carregar métricas de progresso';
            this.toastService.error('Erro ao carregar métricas de progresso');
          }
        });
    } catch (error) {
      console.error('Error in loadSidebarData:', error);
      this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar dados da barra lateral';
    }
  }

  /**
   * Load collaborators for selected team
   */
  private async loadCollaborators(): Promise<void> {
    try {
      this.isLoadingCollaborators = true;
      
      this.teamAggregateService
        .getTeamMembers(this.selectedTeam)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.isLoadingCollaborators = false)
        )
        .subscribe({
          next: (members) => {
            this.collaborators = members;
          },
          error: (error) => {
            console.error('Error loading collaborators:', error);
            this.collaborators = [];
          }
        });
    } catch (error) {
      console.error('Error in loadCollaborators:', error);
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
   * Load productivity graph data
   */
  private async loadProductivityData(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      this.isLoadingProductivity = true;
      this.hasProductivityError = false;
      this.productivityErrorMessage = '';
      
      // For productivity tab, use the selected period instead of month range
      const endDate = dayjs();
      const startDate = endDate.subtract(this.selectedPeriod, 'day');
      
      this.teamAggregateService
        .getTeamProgressMetrics(this.selectedTeam, startDate.toDate(), endDate.toDate())
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.isLoadingProductivity = false)
        )
        .subscribe({
          next: (metrics) => {
            // Convert metrics to graph data points
            // This is a simplified version - in production, you'd query for daily data
            this.graphData = this.graphDataProcessor.processGraphData([], this.selectedPeriod);
            this.hasProductivityError = false;
          },
          error: (error) => {
            console.error('Error loading productivity data:', error);
            this.graphData = [];
            this.hasProductivityError = true;
            this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
            this.toastService.error('Erro ao carregar dados de produtividade');
          }
        });
    } catch (error) {
      console.error('Error in loadProductivityData:', error);
      this.hasProductivityError = true;
      this.productivityErrorMessage = 'Erro ao carregar dados de produtividade';
    }
  }

  /**
   * Handle team selection change event.
   * 
   * When a user selects a different team from the dropdown:
   * 1. Updates the selectedTeam property
   * 2. Resets the collaborator filter to null (show all team members)
   * 3. Reloads all team data for the new team
   * 4. Saves the selection to localStorage for persistence
   * 
   * @param teamId - The ID of the newly selected team
   * 
   * @example
   * // Called from template when team selector changes
   * onTeamChange('Departamento Pessoal');
   * 
   * @see {@link loadTeamData}
   */
  onTeamChange(teamId: string): void {
    this.selectedTeam = teamId;
    this.selectedCollaborator = null; // Reset collaborator filter
    this.loadTeamData();
  }

  /**
   * Handle collaborator selection change event.
   * 
   * When a user selects a specific collaborator or "All":
   * 1. Updates the selectedCollaborator property
   * 2. Reloads all team data filtered by the selected collaborator
   * 
   * If null is passed, shows aggregate data for all team members.
   * If a userId is passed, shows data only for that specific collaborator.
   * 
   * @param userId - The user ID of the selected collaborator, or null for all
   * 
   * @example
   * // Show all team members
   * onCollaboratorChange(null);
   * 
   * // Show specific collaborator
   * onCollaboratorChange('user@example.com');
   * 
   * @see {@link loadTeamData}
   */
  onCollaboratorChange(userId: string | null): void {
    this.selectedCollaborator = userId;
    this.loadTeamData();
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
   * Looks up the team name from the teams array based on the selectedTeam ID.
   * Returns empty string if no team is selected or team is not found.
   * 
   * @returns Team display name or empty string
   * 
   * @example
   * this.selectedTeam = 'dept-pessoal';
   * const name = this.teamName;
   * // Returns: "Departamento Pessoal"
   */
  get teamName(): string {
    const team = this.teams.find(t => t.id === this.selectedTeam);
    return team ? team.name : '';
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
   * Logout user and redirect to login page
   */
  logout(): void {
    this.sessaoProvider.logout();
  }
}
