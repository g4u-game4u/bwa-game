import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { takeUntil, switchMap, map, catchError } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { PlayerService } from '@services/player.service';
import { CompanyService } from '@services/company.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService } from '@services/company-kpi.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { 
  PlayerStatus, 
  PointWallet, 
  SeasonProgress, 
  Company, 
  KPIData,
  ActivityMetrics,
  ProcessMetrics
} from '@model/gamification-dashboard.model';
import { CompanyDisplay } from '@services/company-kpi.service';
import { ProgressCardType } from '@components/c4u-activity-progress/c4u-activity-progress.component';
import { ProgressListType } from '@modals/modal-progress-list/modal-progress-list.component';
import { ModalConfirmLogoutComponent } from '@modals/modal-confirm-logout/modal-confirm-logout.component';

@Component({
  selector: 'app-gamification-dashboard',
  templateUrl: './gamification-dashboard.component.html',
  styleUrls: ['./gamification-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamificationDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private endRenderMeasurement: (() => void) | null = null;
  
  // Responsive properties
  isMobile = false;
  isTablet = false;
  isDesktop = true;
  sidebarCollapsed = false;
  
  // Breakpoint constants
  private readonly MOBILE_BREAKPOINT = 768;
  private readonly TABLET_BREAKPOINT = 1024;
  
  @HostListener('window:resize')
  onResize(): void {
    this.checkResponsiveBreakpoints();
  }
  
  // Loading states
  isLoadingPlayer = true;
  isLoadingCompanies = true;
  isLoadingKPIs = true;
  isLoadingProgress = true;
  
  // Player data
  playerStatus: PlayerStatus | null = null;
  pointWallet: PointWallet | null = null;
  seasonProgress: SeasonProgress | null = null;
  
  // KPI data
  playerKPIs: KPIData[] = [];
  
  // Activity and Process data
  activityMetrics: ActivityMetrics | null = null;
  processMetrics: ProcessMetrics | null = null;
  monthlyPointsBreakdown: { desbloqueados: number } | null = null;
  
  // Company data
  companies: Company[] = [];
  selectedCompany: Company | null = null;
  
  // Carteira data from action_log (CNPJs with action counts and KPI data)
  carteiraClientes: CompanyDisplay[] = [];
  isLoadingCarteira = true;
  cnpjNameMap = new Map<string, string>(); // Map of original CNPJ to clean empresa name

  // Clientes sub-tabs: 'carteira' (extra.cnpj_resp) vs 'participacao' (extra.cnpj)
  clientesActiveTab: 'carteira' | 'participacao' = 'carteira';
  participacaoCnpjs: { cnpj: string; playerName: string; companyName: string }[] = [];
  isLoadingParticipacao = false;
  
  // Month selection (undefined = "Toda temporada" / season-wide, no month filtering)
  selectedMonth: Date | undefined = new Date();
  
  // Modal state
  isCompanyModalOpen = false;
  
  // Progress list modal state
  isProgressModalOpen = false;
  progressModalType: ProgressListType = 'atividades';
  
  // Carteira modal state
  isCarteiraModalOpen = false;
  
  // Company carteira detail modal state
  isCompanyCarteiraDetailModalOpen = false;
  selectedCarteiraCompany: CompanyDisplay | null = null;
  
  // Refresh state
  lastRefreshTime: Date | null = null;
  
  // Season dates - Fixed for current season (01/01/2026 to 30/04/2026)
  private readonly seasonDates = {
    start: new Date(2026, 0, 1),  // January 1, 2026
    end: new Date(2026, 3, 30)   // April 30, 2026
  };
  
  // Accessibility properties
  screenReaderAnnouncement = '';
  private focusedElementBeforeModal: HTMLElement | null = null;
  
  constructor(
    private playerService: PlayerService,
    private companyService: CompanyService,
    private kpiService: KPIService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private performanceMonitor: PerformanceMonitorService,
    private actionLogService: ActionLogService,
    private companyKpiService: CompanyKpiService,
    private cnpjLookupService: CnpjLookupService,
    private sessaoProvider: SessaoProvider,
    private route: ActivatedRoute,
    private modalService: NgbModal,
    private router: Router
  ) {
    // Start measuring render time
    this.endRenderMeasurement = this.performanceMonitor.measureRenderTime('GamificationDashboardComponent');
  }
  
  /**
   * Get current player ID from query params, session, or use 'me' for Funifier API
   * 
   * Priority:
   * 1. Query parameter 'playerId' (when viewing another player's dashboard)
   * 2. Current user from session
   * 3. 'me' as fallback
   */
  getPlayerId(): string {
    // Check for playerId in query params (when viewing another player's dashboard)
    const playerIdParam = this.route.snapshot.queryParams['playerId'];
    if (playerIdParam && typeof playerIdParam === 'string') {
      return playerIdParam;
    }
    
    // Try to get from current user session
    const usuario = this.sessaoProvider.usuario;
    if (usuario) {
      const sessionPlayerId = usuario._id || usuario.email;
      if (sessionPlayerId && typeof sessionPlayerId === 'string') {
        return sessionPlayerId;
      }
    }
    
    // Fallback to 'me' (current authenticated user)
    return 'me';
  }
  
  ngOnInit(): void {
    this.checkResponsiveBreakpoints();
    
    // Listen for query param changes (when viewing different players)
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const playerId = params['playerId'];
        if (playerId) {
          this.loadDashboardData();
        }
      });
    
    this.loadDashboardData();
    this.announceToScreenReader('Painel de gamificaÃ§Ã£o carregado');
    this.performanceMonitor.trackChangeDetection('GamificationDashboardComponent');
  }

  ngAfterViewInit(): void {
    // End render measurement
    if (this.endRenderMeasurement) {
      this.endRenderMeasurement();
    }

    // Log performance report in development mode
    if (!this.isProduction()) {
      setTimeout(() => {
        this.performanceMonitor.logPerformanceReport();
      }, 1000);
    }
  }

  private isProduction(): boolean {
    return typeof window !== 'undefined' && window.location.hostname !== 'localhost';
  }
  
  /**
   * Announce message to screen readers
   */
  private announceToScreenReader(message: string): void {
    this.screenReaderAnnouncement = message;
    // Clear the announcement after a short delay to allow for re-announcements
    setTimeout(() => {
      this.screenReaderAnnouncement = '';
    }, 1000);
  }
  
  /**
   * Check and update responsive breakpoints
   */
  private checkResponsiveBreakpoints(): void {
    const width = window.innerWidth;
    this.isMobile = width < this.MOBILE_BREAKPOINT;
    this.isTablet = width >= this.MOBILE_BREAKPOINT && width < this.TABLET_BREAKPOINT;
    this.isDesktop = width >= this.TABLET_BREAKPOINT;
    this.cdr.markForCheck();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  /**
   * Load all dashboard data asynchronously
   * All data loads in parallel to avoid blocking the UI
   */
  loadDashboardData(): void {
    // Set refresh time immediately
    this.lastRefreshTime = new Date();
    
    // Load all data in parallel - UI will update as data arrives
    // This allows the page to render immediately while data loads
    this.loadPlayerData();
    this.loadCompanyData();
    this.loadCarteiraData();
    this.loadKPIData();
    this.loadProgressData();
  }
  
  /**
   * Load player status, points, and season progress
   */
  private loadPlayerData(): void {
    this.isLoadingPlayer = true;
    this.cdr.markForCheck();
    
    const playerId = this.getPlayerId();
    
    // Load player status
    // Safety timeout to prevent infinite loading state
    const loadingTimeout = setTimeout(() => {
      if (this.isLoadingPlayer) {
                this.isLoadingPlayer = false;
        this.cdr.markForCheck();
      }
    }, 20000); // 20 second timeout
    
    this.playerService.getPlayerStatus(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          clearTimeout(loadingTimeout);
          this.playerStatus = status;
          this.isLoadingPlayer = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
                    clearTimeout(loadingTimeout);
          this.toastService.error('Erro ao carregar dados do jogador');
          this.isLoadingPlayer = false;
          this.cdr.markForCheck();
        },
        complete: () => {
          clearTimeout(loadingTimeout);
        }
      });
    
    // Load point wallet
    this.playerService.getPlayerPoints(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (points) => {
          this.pointWallet = points;
          this.cdr.markForCheck();
        },
        error: (error) => {
                    // Set default values on error so UI doesn't stay stuck
          this.pointWallet = { moedas: 0, bloqueados: 0, desbloqueados: 0 }; // bloqueados kept for interface compat but not displayed
          this.cdr.markForCheck();
        },
        complete: () => {
          }
      });
    
    // Load season progress (basic data from player status)
    this.playerService.getSeasonProgress(playerId, this.seasonDates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          this.seasonProgress = progress;
          this.cdr.markForCheck();
          
          // Load additional data for season progress
          this.loadSeasonProgressDetails();
        },
        error: (error) => {
                    // Set default values on error so UI doesn't stay stuck
          this.seasonProgress = {
            metas: { current: 0, target: 0 },
            clientes: 0,
            tarefasFinalizadas: 0,
            seasonDates: this.seasonDates
          };
          this.cdr.markForCheck();
        },
        complete: () => {
          }
      });
  }
  
  /**
   * Load additional season progress details:
   * - Metas: count of achieved goals (entrega vs entrega_goal, cnpj_resp count vs cnpj_goal)
   * - Clientes: count of CNPJs in player's cnpj_resp (assigned portfolio)
   * - Tarefas finalizadas: ALL action_log entries for the season (no month filter)
   * 
   * NOTE: The left sidebar (Progresso da Temporada) shows SEASON-WIDE data.
   * It is NOT affected by the month selector. Only the center-right "Meu Progresso" section
   * is filtered by the month selector.
   */
  private loadSeasonProgressDetails(): void {
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    const playerId: string = (usuario?._id || usuario?.email || '') as string;
    
    if (!playerId) {
      return;
    }

    // Load clientes count from player's extra.cnpj_resp (assigned portfolio count)
    // cnpj_resp is a comma-separated string of CNPJ IDs
    // This is SEASON-WIDE data - not affected by month selector
    if (this.playerStatus?.extra?.cnpj_resp) {
      const cnpjRespStr = this.playerStatus.extra.cnpj_resp;
      const cnpjList = cnpjRespStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
      const clientesCount = cnpjList.length;
      if (this.seasonProgress) {
        this.seasonProgress = {
          ...this.seasonProgress,
          clientes: clientesCount
        };
        this.cdr.markForCheck();
      }
    } else {
      if (this.seasonProgress) {
        this.seasonProgress = {
          ...this.seasonProgress,
          clientes: 0
        };
        this.cdr.markForCheck();
      }
    }
    
    // Load tarefas finalizadas from action_log WITHOUT date filter (season-wide)
    // Pass undefined for month to get ALL action_log entries
    this.actionLogService.getCompletedTasksCount(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (count: number) => {
          if (this.seasonProgress) {
            this.seasonProgress = {
              ...this.seasonProgress,
              tarefasFinalizadas: count
            };
            this.cdr.markForCheck();
          }
        },
        error: (err: Error) => {
                  }
      });
  }
  
  /**
   * Load company portfolio data
   */
  private loadCompanyData(): void {
    this.isLoadingCompanies = true;
    
    const playerId = this.getPlayerId();
    
    this.companyService.getCompanies(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (companies) => {
          this.companies = companies;
          this.isLoadingCompanies = false;
          
          // Note: clientes count is now loaded from action_log unique CNPJs
          // in loadSeasonProgressDetails(), not from companies.length
          
          this.cdr.markForCheck();
        },
        error: (error) => {
                    this.toastService.error('Erro ao carregar carteira de empresas');
          this.isLoadingCompanies = false;
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Load carteira data from player's extra.cnpj_resp (assigned portfolio)
   * and enrich with KPI data from cnpj__c collection
   * 
   * Data source: player.extra.cnpj_resp â†’ cnpj__c collection
   * Company names are fetched from empid_cnpj__c collection using CnpjLookupService
   * This shows all companies assigned to the player, not just ones with action_log entries
   */
  private loadCarteiraData(): void {
    this.isLoadingCarteira = true;
    
    const playerId = this.getPlayerId();
    
    if (!playerId) {
            this.isLoadingCarteira = false;
      this.cdr.markForCheck();
      return;
    }
    
    // Use companyService to get companies from extra.cnpj_resp â†’ cnpj__c
    // This shows all assigned companies, not just ones with action_log entries
    this.companyService.getCompanies(playerId)
      .pipe(
        switchMap(companies => {
          // Extract CNPJ IDs to look up company names from empid_cnpj__c
          const cnpjIds = companies.map(c => c.cnpj).filter(id => id);
          if (cnpjIds.length === 0) {
            return of({ companies, nameMap: new Map<string, string>() });
          }
          
          // Enrich company names from empid_cnpj__c collection
          return this.cnpjLookupService.enrichCnpjList(cnpjIds).pipe(
            map(nameMap => ({ companies, nameMap })),
            catchError(error => {
                            return of({ companies, nameMap: new Map<string, string>() });
            })
          );
        }),
        switchMap(({ companies, nameMap }) => {
          // "Toda temporada" => selectedMonth = undefined, so we intentionally skip the monthly count query.
          if (this.selectedMonth === undefined) {
            return of({ companies, nameMap, actionCounts: [] as { cnpj: string; actionCount: number }[] });
          }

          const cnpjList = companies.map(c => c.cnpj).filter(Boolean);

          return this.actionLogService.getCnpjListWithCountForAllExecutors(cnpjList, this.selectedMonth).pipe(
            map(actionCounts => ({ companies, nameMap, actionCounts })),
            catchError(() => of({ companies, nameMap, actionCounts: [] as { cnpj: string; actionCount: number }[] }))
          );
        }),
        map(({ companies, nameMap, actionCounts }) => {
          // Store the name map for later use in getCompanyDisplayName
          nameMap.forEach((name, cnpj) => {
            this.cnpjNameMap.set(cnpj, name);
          });

          // actionCounts.cnpj contains the action_log CNPJ string; extract the CNPJ ID for matching.
          const actionCountByCnpjId = new Map<string, number>();
          for (const item of actionCounts) {
            const extractedId = this.companyKpiService.extractCnpjId(item.cnpj) || item.cnpj;
            const prev = actionCountByCnpjId.get(extractedId) || 0;
            actionCountByCnpjId.set(extractedId, prev + (item.actionCount || 0));
          }

          // Convert Company[] to CompanyDisplay[] format
          // Use enriched company name from empid_cnpj__c, fallback to cnpj ID
          return companies.map(company => {
            const enrichedName = nameMap.get(company.cnpj) || company.name;
            const lookupKey = this.companyKpiService.extractCnpjId(company.cnpj) || company.cnpj;
            return {
              cnpj: enrichedName, // Use enriched company name for display
              cnpjId: company.cnpj, // The CNPJ ID from cnpj__c._id
              actionCount: actionCountByCnpjId.get(lookupKey) || 0,
              deliveryKpi: company.healthScore !== undefined ? {
                id: 'delivery',
                label: 'Entregas no Prazo',
                current: company.healthScore,
                target: 90,
                unit: '%',
                percentage: Math.min((company.healthScore / 90) * 100, 100),
                color: company.healthScore >= 90 ? 'green' as const : company.healthScore >= 50 ? 'yellow' as const : 'red' as const
              } : undefined
            } as CompanyDisplay;
          });
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (carteiraClientes) => {
          this.carteiraClientes = carteiraClientes;
          this.isLoadingCarteira = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
                    this.isLoadingCarteira = false;
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Load KPI data
   */
  private loadKPIData(): void {
    this.isLoadingKPIs = true;
    
    const playerId = this.getPlayerId();
    
    // Pass selectedMonth and actionLogService to getPlayerKPIs
    this.kpiService.getPlayerKPIs(playerId, this.selectedMonth, this.actionLogService)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (kpis) => {
          this.playerKPIs = kpis || [];
          this.isLoadingKPIs = false;
          
          // Update metas based on player goals (not KPIs)
          // Metas calculation uses player.extra values, not KPI data
          this.updateMetasFromPlayerGoals();
          
          this.cdr.markForCheck();
        },
        error: (error) => {
                    this.toastService.error('Erro ao carregar KPIs');
          this.isLoadingKPIs = false;
          // Don't update metas on error - preserve existing values
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Update metas count based on player goals from player.extra
   * Metas = count of achieved goals (0, 1, or 2):
   *   - +1 if entrega >= entrega_goal (fallback: 90)
   *   - +1 if cnpj_resp count >= cnpj_goal (fallback: 100)
   * Always shows X/2 (duas metas fixas)
   */
  private updateMetasFromPlayerGoals(): void {
    if (!this.seasonProgress) {
            return;
    }

    if (!this.playerStatus) {
            return;
    }

    const extra = this.playerStatus.extra;

    // Get values from player.extra with fallback defaults
    const entrega = extra?.entrega ? parseFloat(extra.entrega) : 0;
    const entregaGoal = extra?.entrega_goal ?? 90; // Default fallback: 90

    // cnpj_resp is a comma-separated string of CNPJs
    const cnpjRespStr = extra?.cnpj_resp || '';
    const cnpjRespCount = cnpjRespStr ? cnpjRespStr.split(',').filter(c => c.trim()).length : 0;
    const cnpjGoal = extra?.cnpj_goal ?? 100; // Default fallback: 100

    // Calculate achievements
    const entregaAchieved = entrega >= entregaGoal ? 1 : 0;
    const cnpjAchieved = cnpjRespCount >= cnpjGoal ? 1 : 0;
    const metasAchieved = entregaAchieved + cnpjAchieved;

    // Fixed denominator: always 2 (duas metas)
    const totalMetas = 2;

    // Update with goals-based values
    this.seasonProgress = {
      ...this.seasonProgress,
      metas: {
        current: metasAchieved,
        target: totalMetas
      }
    };

    }

  
  /**
   * Load activity and macro progress data from action_log
   */
  private loadProgressData(): void {
    this.isLoadingProgress = true;
    
    // Get player email/id for action log query
    // Funifier uses email as the player ID
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    const playerId: string = (usuario?._id || usuario?.email || '') as string;
    
    if (!playerId) {
            // Use default values if no player ID
      this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
      this.processMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
      this.isLoadingProgress = false;
      this.cdr.markForCheck();
      return;
    }

    this.actionLogService.getProgressMetrics(playerId, this.selectedMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          this.activityMetrics = metrics.activity;
          this.processMetrics = metrics.processo;
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
                    // Use default values on error
          this.activityMetrics = { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 };
          this.processMetrics = { pendentes: 0, incompletas: 0, finalizadas: 0 };
          this.isLoadingProgress = false;
          this.cdr.markForCheck();
        }
      });

    // Load monthly points breakdown
    this.actionLogService.getMonthlyPointsBreakdown(playerId, this.selectedMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (breakdown) => {
          this.monthlyPointsBreakdown = breakdown;
          this.cdr.markForCheck();
        },
        error: (error) => {
                    this.monthlyPointsBreakdown = { desbloqueados: 0 };
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Handle month change event from c4u-seletor-mes
   * @param monthsAgo - Number of months ago (0 = current month)
   * 
   * NOTE: Month change only affects the center-right "Meu Progresso" section.
   * The left sidebar (Progresso da Temporada) shows season-wide data and is NOT affected.
   */
  onMonthChange(monthsAgo: number): void {
    // Handle "Toda temporada" (-1) — undefined means no month filtering (season-wide)
    if (monthsAgo === -1) {
      this.selectedMonth = undefined;
      this.announceToScreenReader('Filtro alterado para toda temporada');
    } else {
      const date = new Date();
      date.setMonth(date.getMonth() - monthsAgo);
      this.selectedMonth = date;
      const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      this.announceToScreenReader(`Mês alterado para ${monthName}`);
    }
    
    // Clear caches to force fresh data for the new month
    this.actionLogService.clearCache();
    
    // Only reload month-filtered data (center-right section)
    // Do NOT reload player data or season progress (left sidebar)
    this.loadKPIData();
    this.loadProgressData();
    this.loadCarteiraData();
  }
  
  /**
   * Handle company selection from table
   */
  onCompanySelected(company: Company): void {
    this.selectedCompany = company;
    this.isCompanyModalOpen = true;
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    this.announceToScreenReader(`Abrindo detalhes de ${company.name}`);
  }

  /**
   * Handle company selection from carteira list
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
   * Handle company modal close
   */
  onCompanyModalClosed(): void {
    const companyName = this.selectedCompany?.name || 'empresa';
    this.isCompanyModalOpen = false;
    this.selectedCompany = null;
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
   * Handle progress card click from c4u-activity-progress
   */
  onProgressCardClicked(cardType: ProgressCardType): void {
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    
    // Map card type to modal type
    switch (cardType) {
      case 'atividades-finalizadas':
        this.progressModalType = 'atividades';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de atividades finalizadas');
        break;
      case 'atividades-pontos':
        this.progressModalType = 'pontos';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de pontos');
        break;
      case 'processos-pendentes':
        this.progressModalType = 'processos-pendentes';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de processos pendentes');
        break;
      case 'processos-finalizados':
        this.progressModalType = 'processos-finalizados';
        this.isProgressModalOpen = true;
        this.announceToScreenReader('Abrindo lista de processos finalizados');
        break;
    }
  }
  
  /**
   * Handle progress modal close
   */
  onProgressModalClosed(): void {
    this.isProgressModalOpen = false;
    this.announceToScreenReader('Modal de progresso fechado');
    
    if (this.focusedElementBeforeModal) {
      setTimeout(() => {
        this.focusedElementBeforeModal?.focus();
        this.focusedElementBeforeModal = null;
      }, 100);
    }
  }
  
  /**
   * Open carteira modal
   */
  openCarteiraModal(): void {
    this.focusedElementBeforeModal = document.activeElement as HTMLElement;
    this.isCarteiraModalOpen = true;
    this.announceToScreenReader('Abrindo carteira de clientes');
  }
  
  /**
   * Handle carteira modal close
   */
  onCarteiraModalClosed(): void {
    this.isCarteiraModalOpen = false;
    this.announceToScreenReader('Modal de carteira fechado');
    
    if (this.focusedElementBeforeModal) {
      setTimeout(() => {
        this.focusedElementBeforeModal?.focus();
        this.focusedElementBeforeModal = null;
      }, 100);
    }
  }
  
  /**
   * Switch between Carteira and Participação sub-tabs in the Clientes section
   */
  switchClientesTab(tab: 'carteira' | 'participacao'): void {
    this.clientesActiveTab = tab;
    if (tab === 'participacao' && this.participacaoCnpjs.length === 0 && !this.isLoadingParticipacao) {
      this.loadParticipacaoData();
    }
  }
  
  /**
   * Load participação data from player's extra.cnpj (CNPJs the player has participated with)
   */
  private loadParticipacaoData(): void {
    this.isLoadingParticipacao = true;
    this.cdr.markForCheck();
    
    const playerId = this.getPlayerId();
    
    if (!playerId) {
      this.isLoadingParticipacao = false;
      this.cdr.markForCheck();
      return;
    }
    
    // Get player data to access extra.cnpj
    this.playerService.getPlayerStatus(playerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (player) => {
          const extra = player?.extra as Record<string, unknown> | undefined;
          const cnpjStr = (extra?.['cnpj'] as string) || '';
          if (!cnpjStr) {
            this.participacaoCnpjs = [];
            this.isLoadingParticipacao = false;
            this.cdr.markForCheck();
            return;
          }
          
          // Parse comma-separated CNPJs
          const cnpjList = cnpjStr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          
          // Enrich with company names from empid_cnpj__c
          this.cnpjLookupService.enrichCnpjList(cnpjList)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (nameMap) => {
                this.participacaoCnpjs = cnpjList.map((cnpj: string) => ({
                  cnpj: cnpj,
                  playerName: player?.name || '',
                  companyName: nameMap.get(cnpj) || cnpj
                }));
                this.isLoadingParticipacao = false;
                this.cdr.markForCheck();
              },
              error: () => {
                // Fallback without enriched names
                this.participacaoCnpjs = cnpjList.map((cnpj: string) => ({
                  cnpj: cnpj,
                  playerName: player?.name || '',
                  companyName: cnpj
                }));
                this.isLoadingParticipacao = false;
                this.cdr.markForCheck();
              }
            });
        },
        error: () => {
          this.participacaoCnpjs = [];
          this.isLoadingParticipacao = false;
          this.cdr.markForCheck();
        }
      });
  }
  
  /**
   * Get current player ID for modals (email-based)
   */
  get currentPlayerId(): string {
    const usuario = this.sessaoProvider.usuario as { _id?: string; email?: string } | null;
    if (!usuario) {
      return '';
    }
    return (usuario._id || usuario.email || '') as string;
  }
  
  /**
   * Manual refresh mechanism
   */
  refreshData(): void {
    this.toastService.alert('Atualizando dados...');
    this.announceToScreenReader('Atualizando dados do painel');
    // Clear cache to force fresh data
    this.playerService.clearCache();
    this.loadDashboardData();
  }
  
  /**
   * Toggle sidebar collapsed state
   */
  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.announceToScreenReader(this.sidebarCollapsed ? 'Menu recolhido' : 'Menu expandido');
  }
  
  /**
   * Track by function for KPI list
   */
  trackByKpiId(_index: number, kpi: KPIData): string {
    return kpi.id;
  }

  /**
   * Round a number to remove decimal places
   */
  roundValue(value: number): number {
    return Math.round(value);
  }

  /**
   * Get enabled KPIs (excluding commented/disabled ones)
   * Currently excludes 'numero-empresas' (Clientes na Carteira)
   */
  get enabledKPIs(): KPIData[] {
    return this.playerKPIs;
  }

  /**
   * Format KPI value as integer with percentage symbol for compact display
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
   * 
   * For carteira data from extra.cnpj_resp, the cnpj field already contains the company name.
   * For action_log data, uses the enriched CNPJ name map from the lookup service.
   */
  getCompanyDisplayName(cnpj: string): string {
    if (!cnpj) {
      return '';
    }
    // First check if we have an enriched name in the map (for action_log data)
    const displayName = this.cnpjNameMap.get(cnpj);
    if (displayName) {
      return displayName;
    }
    // Otherwise return the cnpj as-is (for extra.cnpj_resp data, it's already the company name)
    return cnpj;
  }
  
  /**
   * Calculate the average KPI percentage across all player KPIs based on their targets (goals)
   * Target = 100%, 0 = 0%. This is used for the level indicator in the sidebar.
   * 
   * Example: If one KPI is at 101% of goal and another is at 85% of goal,
   * the average would be (101 + 85) / 2 = 93%
   */
  get kpiAveragePercent(): number {
    if (!this.playerKPIs || this.playerKPIs.length === 0) {
      return 0;
    }
    
    const totalPercent = this.playerKPIs.reduce((sum, kpi) => {
      // Calculate percentage based on target (goal = 100%)
      const target = kpi.target || 1; // Avoid division by zero
      const percent = target > 0 ? (kpi.current / target) * 100 : 0;
      return sum + percent; // Don't cap - allow values above 100%
    }, 0);
    
    return Math.round(totalPercent / this.playerKPIs.length);
  }

  /**
   * Count how many KPIs have beaten their target (goal)
   * Used to determine the color of the level indicator
   */
  get kpiGoalsBeatenCount(): number {
    if (!this.playerKPIs || this.playerKPIs.length === 0) {
      return 0;
    }
    
    return this.playerKPIs.filter(kpi => kpi.current >= kpi.target).length;
  }

  /**
   * Get the color class for the level indicator based on how many goals are beaten
   * - Red: No goals beaten (0 of 2)
   * - Yellow: One goal beaten (1 of 2)
   * - Green: All goals beaten (2 of 2)
   */
  get kpiLevelColorClass(): 'red' | 'yellow' | 'green' {
    const beaten = this.kpiGoalsBeatenCount;
    const total = this.playerKPIs?.length || 0;
    
    if (total === 0) return 'red';
    if (beaten === 0) return 'red';
    if (beaten < total) return 'yellow';
    return 'green';
  }
  
  /**
   * Check if any section is loading
   */
  get isLoading(): boolean {
    return this.isLoadingPlayer || 
           this.isLoadingCompanies || 
           this.isLoadingKPIs || 
           this.isLoadingProgress;
  }
  
  /**
   * Get formatted last refresh time
   */
  get formattedRefreshTime(): string {
    if (!this.lastRefreshTime) return '';
    
    const now = new Date();
    const diff = now.getTime() - this.lastRefreshTime.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Agora mesmo';
    if (minutes === 1) return 'Há 1 minuto';
    return `Há ${minutes} minutos`;
  }

  private async confirmLogoutStep(title: string, message: string): Promise<boolean> {
    const modalRef = this.modalService.open(ModalConfirmLogoutComponent, {
      size: 'sm',
      backdrop: 'static',
      keyboard: false
    });

    modalRef.componentInstance.title = title;
    modalRef.componentInstance.message = message;
    modalRef.componentInstance.confirmLabel = 'Desconectar';

    const result = await modalRef.result.catch(() => null);
    return !!result?.confirmed;
  }

  /**
   * Logout user and redirect to login page
   * Includes double confirmation to prevent accidental logout
   */
  async logout(): Promise<void> {
    const firstConfirm = await this.confirmLogoutStep(
      'Sair do sistema',
      'Tem certeza que deseja sair do sistema?'
    );
    if (!firstConfirm) return;

    const secondConfirm = await this.confirmLogoutStep(
      'Desconectar do sistema',
      'Esta ação irá desconectar você do sistema. Deseja continuar?'
    );
    if (!secondConfirm) return;

    // If both confirmations are accepted, proceed with logout
    this.announceToScreenReader('Saindo do sistema...');
    this.sessaoProvider.logout();
  }
}

