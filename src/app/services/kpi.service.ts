import { Injectable } from '@angular/core';
import { Observable, throwError, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { KPIMapper } from './kpi-mapper.service';
import { KPIData } from '@model/gamification-dashboard.model';
import { PlayerService } from './player.service';
import { UserActionDashboardService } from './user-action-dashboard.service';
import { GoalsApiService } from './goals-api.service';
import { META_PROTOCOLO_TARGET, APOSENTADORIAS_TARGET } from '../constants/kpi-targets.constants';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { resolveTeamDisplayNameForPlayerSidebar } from '@utils/game4u-user-id.util';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

interface MetricTarget {
  _id: string;
  name: string;
  label: string;
  target: number;
  unit?: string;
  order?: number;
}

@Injectable({
  providedIn: 'root'
})
export class KPIService {
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes
  private playerKPICache = new Map<string, CacheEntry<KPIData[]>>();
  private companyKPICache = new Map<string, CacheEntry<KPIData[]>>();
  private metricTargetsCache: Observable<MetricTarget[]> | null = null;

  constructor(
    private funifierApi: FunifierApiService,
    private mapper: KPIMapper,
    private playerService: PlayerService,
    private userActionDashboard: UserActionDashboardService,
    private goalsApi: GoalsApiService,
    private sessaoProvider: SessaoProvider
  ) {}

  /**
   * Nome de time para `GoalsApiService.getAllKpisForTeam`: o painel individual nem sempre
   * traz `metadata.time` no jogador Funifier; usa o mesmo critério da sidebar (perfil `/auth/user`).
   */
  private resolveTeamNameForGoals(playerStatus: Record<string, unknown>): string {
    const extra =
      playerStatus['extra'] && typeof playerStatus['extra'] === 'object' && !Array.isArray(playerStatus['extra'])
        ? (playerStatus['extra'] as Record<string, unknown>)
        : undefined;
    const meta = playerStatus['metadata'] && typeof playerStatus['metadata'] === 'object' && !Array.isArray(playerStatus['metadata'])
      ? (playerStatus['metadata'] as Record<string, unknown>)
      : undefined;

    const fromPlayer = String(
      meta?.['time'] ?? extra?.['time'] ?? extra?.['team_name'] ?? extra?.['teamName'] ?? ''
    )
      .toLowerCase()
      .trim();

    const user = this.sessaoProvider.usuario as Record<string, unknown> | null | undefined;
    let fromSession = '';
    if (user) {
      const teams = user['teams'];
      const first = Array.isArray(teams) && teams.length > 0 ? teams[0] : undefined;
      const uExtra =
        user['extra'] && typeof user['extra'] === 'object' && !Array.isArray(user['extra'])
          ? (user['extra'] as Record<string, unknown>)
          : undefined;
      fromSession = resolveTeamDisplayNameForPlayerSidebar(first, uExtra, user).toLowerCase().trim();
    }

    const goalsRelevant = (s: string): boolean =>
      !!s &&
      (s.includes('financeiro') ||
        s.includes('juridico') ||
        s.includes('jurídico') ||
        s === 'cs' ||
        s.includes('cs'));

    if (goalsRelevant(fromPlayer)) {
      return fromPlayer;
    }
    if (goalsRelevant(fromSession)) {
      return fromSession;
    }
    return fromPlayer || fromSession;
  }

  /**
   * Get metric targets from database (uses Basic Auth)
   * This defines the KPI names, order, and target values
   */
  getMetricTargets(): Observable<MetricTarget[]> {
    if (this.metricTargetsCache) {
      return this.metricTargetsCache;
    }

    // Query metric_targets__c database
    const aggregateBody = [
      { $sort: { order: 1 } } // Sort by order field
    ];

    this.metricTargetsCache = this.funifierApi.post<MetricTarget[]>(
      '/v3/database/metric_targets__c/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        if (Array.isArray(response) && response.length > 0) {
          return response;
        }
        console.warn('📊 No metric targets found in database, returning empty array');
        return [];
      }),
      catchError(error => {
        console.error('📊 Error fetching metric targets from database:', error);
        // Return empty array - no hardcoded fallback
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    return this.metricTargetsCache;
  }

  /**
   * Get player KPIs from goals API based on team:
   * - Financeiro: Receita Concedida
   * - Jurídico: Meta de Protocolo + Aposentadorias Concedidas
   * - CS: Meta de Protocolo + Aposentadorias Concedidas
   * - Porcentagem de Entregas no Prazo - value from extra.entrega (only for current month)
   * 
   * @param playerId - Player ID or 'me' for current player
   * @param selectedMonth - Selected month for filtering (optional, defaults to current month)
   * @param _actionLogService - Legado; ignorado.
   */
  getPlayerKPIs(playerId: string, selectedMonth?: Date, _actionLogService?: unknown): Observable<KPIData[]> {
    // Create cache key that includes month to avoid cache conflicts
    const monthKey = selectedMonth ? `_${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}` : '_current';
    const cacheKey = `${playerId}${monthKey}`;
    const cached = this.getCachedData(this.playerKPICache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use faster getCurrentPlayerData for 'me' or current player
    const playerData$ = playerId === 'me'
      ? this.playerService.getCurrentPlayerData()
      : this.playerService.getRawPlayerData(playerId);

    const request$: Observable<KPIData[]> = playerData$.pipe(
      switchMap((playerStatus): Observable<KPIData[]> => {
        const kpis: KPIData[] = [];
        const now = new Date();
        const isCurrentMonth = !selectedMonth || 
          (selectedMonth.getFullYear() === now.getFullYear() && 
           selectedMonth.getMonth() === now.getMonth());

        // Get team name from player metadata - check multiple sources
        const teamName = this.resolveTeamNameForGoals(playerStatus as Record<string, unknown>);

        console.log('📊 [KPI Service] Player team name:', teamName, 'Full metadata:', playerStatus.metadata, 'Extra:', playerStatus.extra);

        // Porcentagem de Entregas no Prazo - only for current month
        if (isCurrentMonth && playerStatus.extra?.entrega) {
          const deliveryPercentage = parseFloat(playerStatus.extra.entrega);
          
          kpis.push({
            id: 'entregas-prazo',
            label: 'Entregas no Prazo',
            current: deliveryPercentage,
            target: 90,
            superTarget: 100,
            unit: '%',
            color: this.getKPIColorByGoals(deliveryPercentage, 90, 100),
            percentage: Math.min(deliveryPercentage / 100 * 100, 100)
          });
        }

        // Fetch KPIs from goals API based on team
        console.log('📊 [KPI Service] Fetching KPIs for team:', teamName);
        return this.goalsApi.getAllKpisForTeam(teamName, selectedMonth).pipe(
          switchMap(goalKpis => {
            console.log('📊 [KPI Service] Received', goalKpis.length, 'KPIs from Goals API');

            if (goalKpis.length === 0) {
              console.warn('📊 [KPI Service] No KPIs from Goals API, using fallback');
              if (teamName.includes('juridico') || teamName.includes('jurídico') || teamName.includes('cs')) {
                return this.getFallbackKPIs(playerStatus, teamName).pipe(
                  map(fb => [...kpis, ...fb])
                );
              }
              if (teamName.includes('financeiro')) {
                return of([
                  ...kpis,
                  {
                    id: 'receita-concedida',
                    label: 'Receita concedida',
                    current: 0,
                    target: 775000,
                    superTarget: 1162500,
                    unit: 'R$',
                    color: 'red',
                    percentage: 0
                  } as KPIData
                ]);
              }
              return of([...kpis]);
            }

            // Convert goal KPIs to KPIData format
            for (const goalKpi of goalKpis) {
              const superTarget = Math.ceil(goalKpi.target * 1.5);
              let unit = '';
              let label = goalKpi.title;

              if (goalKpi.title.toLowerCase().includes('receita')) {
                unit = 'R$';
              }

              let kpiId = 'unknown';
              if (goalKpi.id === '126bfa2d-5845-4a3f-94d0-301b988dac33') {
                kpiId = 'aposentadorias-concedidas';
                label = 'Volume de concessões';
                unit = 'concessões';
              } else if (goalKpi.id === '75274eb5-0412-4c2b-8bcf-ac5c34ea904b') {
                kpiId = 'receita-concedida';
                label = 'Receita concedida';
                unit = 'R$';
              } else if (goalKpi.id === 'b96dd54a-2847-4267-b234-2bd02e63b118') {
                kpiId = 'meta-protocolo';
                label = 'Valor de protocolos';
                unit = 'R$';
              } else if (goalKpi.title.toLowerCase().includes('protocolo')) {
                unit = unit || 'R$';
              } else if (goalKpi.title.toLowerCase().includes('aposentadoria')) {
                unit = unit || 'concedidos';
              }

              if (kpiId === 'unknown') {
                continue;
              }

              kpis.push({
                id: kpiId,
                label: label,
                current: goalKpi.current,
                target: goalKpi.target,
                superTarget: superTarget,
                unit: unit,
                color: this.getKPIColorByGoals(goalKpi.current, goalKpi.target, superTarget),
                percentage: goalKpi.percentage
              });
            }

            console.log('📊 [KPI Service] Generated', kpis.length, 'KPIs from goals API');
            return of(kpis);
          }),
          catchError(error => {
            console.error('📊 [KPI Service] Error fetching KPIs from goals API:', error);
            if (teamName.includes('juridico') || teamName.includes('jurídico') || teamName.includes('cs')) {
              return this.getFallbackKPIs(playerStatus, teamName).pipe(
                map(fb => [...kpis, ...fb])
              );
            }
            if (teamName.includes('financeiro')) {
              return of([
                ...kpis,
                {
                  id: 'receita-concedida',
                  label: 'Receita concedida',
                  current: 0,
                  target: 775000,
                  superTarget: 1162500,
                  unit: 'R$',
                  color: 'red',
                  percentage: 0
                } as KPIData
              ]);
            }
            return of([...kpis]);
          })
        );
      }),
      catchError(error => {
        console.error('📊 Error fetching player KPIs:', error);
        // Return empty array instead of throwing - don't block the UI
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.playerKPICache, cacheKey, request$);
    return request$;
  }

  /**
   * Fallback KPIs when goals API is unavailable (uses hardcoded values from player extra)
   */
  private getFallbackKPIs(playerStatus: any, teamName: string): Observable<KPIData[]> {
    const kpis: KPIData[] = [];

    if (teamName.includes('juridico') || teamName.includes('jurídico') || teamName.includes('cs')) {
      const currentAposent = parseFloat(playerStatus.extra?.aposentadorias_concedidas) || 0;
      const targetAposent = APOSENTADORIAS_TARGET;
      const superTargetAposent = Math.ceil(targetAposent * 1.5);
      kpis.push({
        id: 'aposentadorias-concedidas',
        label: 'Volume de concessões',
        current: currentAposent,
        target: targetAposent,
        superTarget: superTargetAposent,
        unit: 'concessões',
        color: this.getKPIColorByGoals(currentAposent, targetAposent, superTargetAposent),
        percentage: targetAposent > 0 ? Math.round((currentAposent / targetAposent) * 100) : 0
      });

      const currentMeta = parseFloat(playerStatus.extra?.meta_protocolo) || 0;
      const targetMeta = META_PROTOCOLO_TARGET;
      const superTargetMeta = Math.ceil(targetMeta * 1.5);
      kpis.push({
        id: 'meta-protocolo',
        label: 'Valor de protocolos',
        current: currentMeta,
        target: targetMeta,
        superTarget: superTargetMeta,
        unit: 'R$',
        color: this.getKPIColorByGoals(currentMeta, targetMeta, superTargetMeta),
        percentage: targetMeta > 0 ? Math.round((currentMeta / targetMeta) * 100) : 0
      });
    }

    console.log('📊 Using fallback KPIs:', kpis);
    return of(kpis);
  }

  /**
   * KPIs para um intervalo explícito (ex.: temporada fixa), via goals API.
   * Usado pelo cartão de progresso da temporada para não seguir o filtro de mês do painel.
   */
  getPlayerKPIsForDateRange(
    playerId: string,
    rangeStart: Date,
    rangeEnd: Date
  ): Observable<KPIData[]> {
    const cacheKey = `${playerId}_range_${rangeStart.getTime()}_${rangeEnd.getTime()}`;
    const cached = this.getCachedData(this.playerKPICache, cacheKey);
    if (cached) {
      return cached;
    }

    const playerData$ = playerId === 'me'
      ? this.playerService.getCurrentPlayerData()
      : this.playerService.getRawPlayerData(playerId);

    const request$: Observable<KPIData[]> = playerData$.pipe(
      switchMap((playerStatus): Observable<KPIData[]> => {
        const kpis: KPIData[] = [];
        const now = new Date();
        const inRange =
          now.getTime() >= rangeStart.getTime() && now.getTime() <= rangeEnd.getTime();

        // Get team name from player metadata
        const teamName = this.resolveTeamNameForGoals(playerStatus as Record<string, unknown>);

        // Porcentagem de Entregas no Prazo - only when current date is within range
        if (inRange && playerStatus.extra?.entrega) {
          const deliveryPercentage = parseFloat(playerStatus.extra.entrega);
          kpis.push({
            id: 'entregas-prazo',
            label: 'Entregas no Prazo',
            current: deliveryPercentage,
            target: 90,
            superTarget: 100,
            unit: '%',
            color: this.getKPIColorByGoals(deliveryPercentage, 90, 100),
            percentage: Math.min((deliveryPercentage / 100) * 100, 100)
          });
        }

        // Intervalo de temporada: não filtrar por mês do painel (logs sem mês ou agregados).
        return this.goalsApi.getAllKpisForTeam(teamName, undefined).pipe(
          switchMap(goalKpis => {
            if (goalKpis.length === 0) {
              if (teamName.includes('juridico') || teamName.includes('jurídico') || teamName.includes('cs')) {
                return this.getFallbackKPIs(playerStatus, teamName).pipe(
                  map(fb => [...kpis, ...fb])
                );
              }
              if (teamName.includes('financeiro')) {
                return of([
                  ...kpis,
                  {
                    id: 'receita-concedida',
                    label: 'Receita concedida',
                    current: 0,
                    target: 775000,
                    superTarget: 1162500,
                    unit: 'R$',
                    color: 'red',
                    percentage: 0
                  } as KPIData
                ]);
              }
              return of([...kpis]);
            }

            // Convert goal KPIs to KPIData format
            for (const goalKpi of goalKpis) {
              const superTarget = Math.ceil(goalKpi.target * 1.5);
              let unit = '';
              let label = goalKpi.title;

              if (goalKpi.title.toLowerCase().includes('receita')) {
                unit = 'R$';
              }

              let kpiId = 'unknown';
              if (goalKpi.id === '126bfa2d-5845-4a3f-94d0-301b988dac33') {
                kpiId = 'aposentadorias-concedidas';
                label = 'Volume de concessões';
                unit = 'concessões';
              } else if (goalKpi.id === '75274eb5-0412-4c2b-8bcf-ac5c34ea904b') {
                kpiId = 'receita-concedida';
                label = 'Receita concedida';
                unit = 'R$';
              } else if (goalKpi.id === 'b96dd54a-2847-4267-b234-2bd02e63b118') {
                kpiId = 'meta-protocolo';
                label = 'Valor de protocolos';
                unit = 'R$';
              } else if (goalKpi.title.toLowerCase().includes('protocolo')) {
                unit = unit || 'R$';
              } else if (goalKpi.title.toLowerCase().includes('aposentadoria')) {
                unit = unit || 'concedidos';
              }

              if (kpiId === 'unknown') {
                continue;
              }

              kpis.push({
                id: kpiId,
                label: label,
                current: goalKpi.current,
                target: goalKpi.target,
                superTarget: superTarget,
                unit: unit,
                color: this.getKPIColorByGoals(goalKpi.current, goalKpi.target, superTarget),
                percentage: goalKpi.percentage
              });
            }

            console.log('📊 Generated KPIs (date range) from goals API:', kpis, `(${kpis.length} KPIs)`, inRange ? '(in range)' : '(out of range)');
            return of(kpis);
          }),
          catchError(error => {
            console.error('📊 Error fetching KPIs from goals API for date range, falling back:', error);
            return this.getFallbackKPIs(playerStatus, teamName).pipe(
              map(fb => [...kpis, ...fb])
            );
          })
        );
      }),
      catchError(error => {
        console.error('📊 Error fetching player KPIs (date range):', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.playerKPICache, cacheKey, request$);
    return request$;
  }

  /**
   * Parse KPI values from string (separated by ; or ,)
   */
  private parseKpiValues(kpiString: string): number[] {
    if (!kpiString || typeof kpiString !== 'string') return [];
    
    return kpiString.split(/[;,]/)
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => parseFloat(v) || 0);
  }

  /**
   * Get company KPIs from cnpj_performance__c database
   * companyId is the CNPJ
   */
  getCompanyKPIs(companyId: string): Observable<KPIData[]> {
    const cached = this.getCachedData(this.companyKPICache, companyId);
    if (cached) {
      return cached;
    }

    // Query the custom database with aggregate
    const aggregateBody = [
      { $match: { _id: companyId } },
      { $limit: 1 }
    ];

    const request$ = this.funifierApi.post<any[]>(
      `/v3/database/cnpj_performance__c/aggregate?strict=true`,
      aggregateBody
    ).pipe(
      map(response => {
        // Response is an array, get first item
        const companyData = response && response.length > 0 ? response[0] : null;
        
        if (!companyData) {
          console.warn(`Company KPI data not found for CNPJ ${companyId}`);
          return [];
        }
        
        // Extract KPIs from company data (nps, multas, eficiencia, extra, prazo)
        return this.mapper.toKPIDataArray(companyData);
      }),
      catchError(error => {
        console.error('Error fetching company KPIs:', error);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.companyKPICache, companyId, request$);
    return request$;
  }

  /**
   * Calculate KPI progress percentage
   */
  calculateKPIProgress(current: number, target: number): number {
    if (target === 0) {
      return 0;
    }
    return Math.round((current / target) * 100);
  }

  /**
   * Determine KPI color based on goal and super goal thresholds
   * Below goal: red, Above goal: yellow, Above super goal: green
   */
  getKPIColorByGoals(current: number, goal: number, superGoal: number): 'red' | 'yellow' | 'green' {
    if (current >= superGoal) {
      return 'green';
    } else if (current >= goal) {
      return 'yellow';
    } else {
      return 'red';
    }
  }

  /**
   * Determine KPI color based on completion percentage (legacy method)
   */
  getKPIColor(current: number, target: number): 'red' | 'yellow' | 'green' {
    const percentage = this.calculateKPIProgress(current, target);
    
    if (percentage >= 80) {
      return 'green';
    } else if (percentage >= 50) {
      return 'yellow';
    }
    
    return 'red';
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.playerKPICache.clear();
    this.companyKPICache.clear();
  }

  /**
   * Get cached data if valid
   */
  private getCachedData<T>(cache: Map<string, CacheEntry<T>>, key: string): Observable<T> | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_DURATION) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached data
   */
  private setCachedData<T>(cache: Map<string, CacheEntry<T>>, key: string, data: Observable<T>): void {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
