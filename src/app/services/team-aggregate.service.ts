import { Injectable } from '@angular/core';
import { Observable, of, throwError, forkJoin } from 'rxjs';
import { PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG } from '@app/constants/pontos-por-atividade-action-log';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { BackendApiService } from './backend-api.service';
import { AggregateQueryBuilderService, AggregateQuery } from './aggregate-query-builder.service';
import { PerformanceMonitorService } from './performance-monitor.service';
import { isGame4uDataEnabled, Game4uUserActionModel } from '@model/game4u-api.model';
import { Game4uApiService } from './game4u-api.service';
import {
  computeGame4uDrPrazoMetaBoost,
  computeMonthlyPointsFromGame4uActions,
  filterGame4uActionsByCompetenceMonth,
  getGame4uMonthlyPointsCircularFromActionStats,
  mapGame4uStatsToActivityMetrics,
  mapGame4uStatsToPointWallet,
  mapGame4uStatsToTeamProgressMetrics,
  mapGame4uStatsToTeamSeasonPoints,
  mapGame4uFinishedDeliveryRowsToParticipacaoCnpjRows,
  mapGame4uUserActionsToParticipacaoCnpjRows
} from './game4u-game-mapper';

/**
 * Team season points model
 */
export interface TeamSeasonPoints {
  total: number;
  bloqueados: number;
  desbloqueados: number;
}

/**
 * Team progress metrics model
 */
export interface TeamProgressMetrics {
  processosIncompletos: number;
  atividadesFinalizadas: number;
  processosFinalizados: number;
}

/**
 * Collaborator (team member) model
 */
export interface Collaborator {
  userId: string;
  name: string;
  email: string;
}

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service for managing team aggregate data queries and processing.
 * 
 * This service uses the AggregateQueryBuilderService to construct MongoDB
 * aggregate queries and the BackendApiService to execute them. It processes
 * the raw aggregate results into component-ready models.
 * 
 * Implements caching with 5-minute TTL to optimize performance and reduce
 * API calls for frequently accessed data.
 */
@Injectable({
  providedIn: 'root'
})
export class TeamAggregateService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(
    private backendApi: BackendApiService,
    private queryBuilder: AggregateQueryBuilderService,
    private performanceMonitor: PerformanceMonitorService,
    private game4u: Game4uApiService
  ) { }

  /**
   * Get team season points with caching.
   * 
   * Fetches aggregate point data for a team within a date range, including
   * total points, blocked points (locked_points), and unlocked points.
   * Results are cached for 5 minutes to improve performance.
   * 
   * @param teamId - Team/department name (e.g., "Departamento Pessoal")
   * @param seasonStart - Start date of the season
   * @param seasonEnd - End date of the season
   * @returns Observable of TeamSeasonPoints
   * 
   * @example
   * getTeamSeasonPoints('Departamento Pessoal', startDate, endDate)
   *   .subscribe(points => console.log(points.total));
   */
  getTeamSeasonPoints(
    teamId: string,
    seasonStart: Date,
    seasonEnd: Date
  ): Observable<TeamSeasonPoints> {
    const cacheKey = `points_${teamId}_${seasonStart.getTime()}_${seasonEnd.getTime()}`;
    
    // Check cache first
    const cached = this.getFromCache<TeamSeasonPoints>(cacheKey);
    if (cached) {
      return of(cached);
    }

    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const range = this.game4u.toIsoRange(seasonStart, seasonEnd);
      return this.game4u.getGameTeamStats({ team: teamId, ...range }).pipe(
        map(mapGame4uStatsToTeamSeasonPoints),
        tap(data => this.setCache(cacheKey, data)),
        catchError(error => this.handleAggregateError('getTeamSeasonPoints', error))
      );
    }
    
    // Build and execute query
    const query = this.queryBuilder.buildPointsAggregateQuery(teamId, seasonStart, seasonEnd);
    
    return this.executeAggregateQuery<any>('achievement', query).pipe(
      map(result => this.processPointsAggregate(result)),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => this.handleAggregateError('getTeamSeasonPoints', error))
    );
  }

  /**
   * Get team progress metrics.
   * 
   * Fetches aggregate action counts for a team within a date range and
   * processes them into progress metrics (incomplete processes, completed
   * activities, completed processes).
   * 
   * @param teamId - Team/department name
   * @param seasonStart - Start date of the season
   * @param seasonEnd - End date of the season
   * @returns Observable of TeamProgressMetrics
   * 
   * @example
   * getTeamProgressMetrics('Departamento Pessoal', startDate, endDate)
   *   .subscribe(metrics => console.log(metrics.processosFinalizados));
   */
  getTeamProgressMetrics(
    teamId: string,
    seasonStart: Date,
    seasonEnd: Date
  ): Observable<TeamProgressMetrics> {
    const cacheKey = `progress_${teamId}_${seasonStart.getTime()}_${seasonEnd.getTime()}`;
    
    // Check cache first
    const cached = this.getFromCache<TeamProgressMetrics>(cacheKey);
    if (cached) {
      return of(cached);
    }

    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const range = this.game4u.toIsoRange(seasonStart, seasonEnd);
      return this.game4u.getGameTeamStats({ team: teamId, ...range }).pipe(
        map(mapGame4uStatsToTeamProgressMetrics),
        tap(data => this.setCache(cacheKey, data)),
        catchError(error => this.handleAggregateError('getTeamProgressMetrics', error))
      );
    }
    
    // Build and execute query
    const query = this.queryBuilder.buildProgressAggregateQuery(teamId, seasonStart, seasonEnd);
    
    return this.executeAggregateQuery<any>('action_log', query).pipe(
      map(result => this.processProgressAggregate(result)),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => this.handleAggregateError('getTeamProgressMetrics', error))
    );
  }

  /**
   * Get list of team members (collaborators).
   * 
   * Fetches unique user IDs from action_log for a specific team and
   * returns them as a list of collaborators.
   * 
   * @param teamId - Team/department name
   * @returns Observable of Collaborator array
   * 
   * @example
   * getTeamMembers('Departamento Pessoal')
   *   .subscribe(members => console.log(members.length));
   */
  getTeamMembers(teamId: string): Observable<Collaborator[]> {
    const cacheKey = `members_${teamId}`;
    
    // Check cache first
    const cached = this.getFromCache<Collaborator[]>(cacheKey);
    if (cached) {
      return of(cached);
    }
    
    // Build and execute query
    const query = this.queryBuilder.buildCollaboratorListQuery(teamId);
    
    return this.executeAggregateQuery<any>('action_log', query).pipe(
      map(result => this.processCollaboratorList(result)),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => this.handleAggregateError('getTeamMembers', error))
    );
  }

  /**
   * Get all player status data for a team using aggregate query.
   * This replaces individual player status requests with a single optimized query.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param batchSize - Number of items per batch (default: 100)
   * @returns Observable of player status array
   * 
   * @example
   * getTeamPlayersStatus('pessoal--rn--andreza-soares')
   *   .subscribe(players => console.log(players.length));
   */
  getTeamPlayersStatus(teamId: string, batchSize: number = 100): Observable<any[]> {
    const cacheKey = `players_status_${teamId}`;
    
    // Check cache first
    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached) {
      return of(cached);
    }
    
    // Build aggregate query to match players by team
    const aggregateQuery = [
      {
        $match: {
          teams: teamId
        }
      }
    ];
    
    // Execute with pagination support
    return this.executeAggregateQueryWithPagination<any>('player_status', aggregateQuery, batchSize).pipe(
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => this.handleAggregateError('getTeamPlayersStatus', error))
    );
  }

  /**
   * Get all action logs for a team using aggregate query with $lookup.
   * This replaces individual action log requests with a single optimized query.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @param batchSize - Number of items per batch (default: 100)
   * @returns Observable of action log array with player data
   * 
   * @example
   * getTeamActionLogs('pessoal--rn--andreza-soares', startDate, endDate)
   *   .subscribe(logs => console.log(logs.length));
   */
  getTeamActionLogs(
    teamId: string,
    startDate?: Date,
    endDate?: Date,
    batchSize: number = 100
  ): Observable<any[]> {
    const cacheKey = `action_logs_${teamId}_${startDate?.getTime()}_${endDate?.getTime()}`;
    
    // Check cache first
    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached) {
      return of(cached);
    }
    
    // Build aggregate query with $lookup to join player data
    const aggregateQuery: any[] = [
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
          'playerData.teams': teamId
        }
      }
    ];
    
    // Add date filter if provided
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) {
        dateMatch.$gte = { $date: startDate.toISOString() };
      }
      if (endDate) {
        dateMatch.$lte = { $date: endDate.toISOString() };
      }
      
      // Insert date match after the team match
      aggregateQuery.push({
        $match: {
          time: dateMatch
        }
      });
    }
    
    // Execute with pagination support
    return this.executeAggregateQueryWithPagination<any>('action_log', aggregateQuery, batchSize).pipe(
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => this.handleAggregateError('getTeamActionLogs', error))
    );
  }

  /**
   * Get collaborator-specific data.
   * 
   * Fetches aggregate data for a specific user within a date range.
   * This can be used to filter team metrics to show only one collaborator's
   * performance.
   * 
   * @param userId - User ID (email) of the collaborator
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @returns Observable of any (flexible structure for different data types)
   * 
   * @example
   * getCollaboratorData('user@example.com', startDate, endDate)
   *   .subscribe(data => console.log(data));
   */
  getCollaboratorData(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Observable<any> {
    const cacheKey = `collaborator_${userId}_${startDate.getTime()}_${endDate.getTime()}`;
    
    // Check cache first
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) {
      return of(cached);
    }
    
    // Build custom query for individual collaborator
    const query: AggregateQuery = {
      aggregate: [
        {
          $match: {
            userId: userId,
            time: {
              $gte: { $date: startDate.toISOString() },
              $lte: { $date: endDate.toISOString() }
            }
          }
        },
        {
          $group: {
            _id: '$actionId',
            count: { $sum: 1 }
          }
        }
      ]
    };
    
    return this.executeAggregateQuery<any>('action_log', query).pipe(
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => this.handleAggregateError('getCollaboratorData', error))
    );
  }

  /**
   * Clear all cached data.
   * 
   * Useful for manual refresh operations to ensure fresh data is fetched.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache entries for a specific team.
   * 
   * @param teamId - Team/department name
   */
  clearTeamCache(teamId: string): void {
    const keysToDelete: string[] = [];
    
    this.cache.forEach((_, key) => {
      if (key.includes(teamId)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Execute an aggregate query via Funifier API.
   * 
   * @param collection - Collection name (e.g., 'achievement', 'action_log')
   * @param query - Aggregate query object
   * @returns Observable of aggregate result array
   */
  private executeAggregateQuery<T>(
    collection: string,
    query: AggregateQuery
  ): Observable<T[]> {
    const endpoint = `/v3/database/${collection}/aggregate?strict=true`;
    
    // Start performance monitoring
    const endMeasure = this.performanceMonitor.measureRenderTime(`aggregate_${collection}`);
    const startTime = performance.now();
    
    // Funifier API expects the aggregate pipeline array directly, not wrapped in an object
    // Send query.aggregate (the array of stages) instead of the whole query object
    const aggregatePipeline = query.aggregate;
    
    console.log(`🔍 Executing aggregate query on ${collection}:`, JSON.stringify(aggregatePipeline));
    
    return this.backendApi.post<T[] | { result: T[] }>(endpoint, aggregatePipeline).pipe(
      map(response => {
        // Funifier may return results in a 'result' property or directly as an array
        if (response && Array.isArray(response)) {
          return response;
        }
        // Handle case where response has a 'result' property
        if (response && typeof response === 'object' && 'result' in response && Array.isArray((response as any).result)) {
          return (response as any).result;
        }
        // Return empty array if no valid result
        console.warn('Unexpected aggregate response format:', response);
        return [];
      }),
      tap(() => {
        // End performance monitoring
        endMeasure();
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Log slow queries (> 1 second)
        if (duration > 1000) {
          console.warn(`Slow aggregate query on ${collection}: ${duration.toFixed(2)}ms`);
        }
      })
    );
  }

  /**
   * Execute an aggregate query with pagination support using Range header.
   * Automatically fetches all pages and combines results.
   * 
   * @param collection - Collection name (e.g., 'player_status', 'action_log')
   * @param aggregatePipeline - Aggregate pipeline array
   * @param batchSize - Number of items per batch (default: 100)
   * @returns Observable of complete aggregate result array
   */
  private executeAggregateQueryWithPagination<T>(
    collection: string,
    aggregatePipeline: any[],
    batchSize: number = 100
  ): Observable<T[]> {
    const endpoint = `/database/${collection}/aggregate?strict=true`;
    
    console.log(`🔍 Executing paginated aggregate query on ${collection} with batch size ${batchSize}`);
    
    // Start with first batch
    return this.fetchBatch<T>(endpoint, aggregatePipeline, 0, batchSize).pipe(
      map(allResults => {
        console.log(`✅ Fetched ${allResults.length} total items from ${collection}`);
        return allResults;
      })
    );
  }

  /**
   * Recursively fetch batches until all data is retrieved.
   * 
   * @param endpoint - API endpoint
   * @param aggregatePipeline - Aggregate pipeline array
   * @param startIndex - Starting index for this batch
   * @param batchSize - Number of items per batch
   * @param accumulatedResults - Results accumulated so far
   * @returns Observable of all results
   */
  private fetchBatch<T>(
    endpoint: string,
    aggregatePipeline: any[],
    startIndex: number,
    batchSize: number,
    accumulatedResults: T[] = []
  ): Observable<T[]> {
    // Set Range header: "items=startIndex-batchSize"
    // Example: "items=0-100" for first 100, "items=100-100" for next 100
    const rangeHeader = `items=${startIndex}-${batchSize}`;
    
    console.log(`📦 Fetching batch: ${rangeHeader}`);
    
    return this.backendApi.post<T[]>(
      endpoint,
      aggregatePipeline,
      { headers: { 'Range': rangeHeader } }
    ).pipe(
      map(response => {
        // Handle response format
        let batchResults: T[] = [];
        if (response && Array.isArray(response)) {
          batchResults = response;
        } else if (response && typeof response === 'object' && 'result' in response && Array.isArray((response as any).result)) {
          batchResults = (response as any).result;
        }
        
        return batchResults;
      }),
      switchMap(batchResults => {
        // Accumulate results
        const allResults = [...accumulatedResults, ...batchResults];
        
        // If we got a full batch, there might be more data
        if (batchResults.length === batchSize) {
          console.log(`📦 Batch complete (${batchResults.length} items), fetching next batch...`);
          // Fetch next batch
          return this.fetchBatch<T>(
            endpoint,
            aggregatePipeline,
            startIndex + batchSize,
            batchSize,
            allResults
          );
        } else {
          // Last batch (partial or empty), return all accumulated results
          console.log(`✅ Final batch (${batchResults.length} items), total: ${allResults.length}`);
          return of(allResults);
        }
      }),
      catchError(error => {
        console.error(`Error fetching batch at index ${startIndex}:`, error);
        // Return accumulated results so far on error
        return of(accumulatedResults);
      })
    );
  }

  /**
   * Process points aggregate result into TeamSeasonPoints model.
   * 
   * @param result - Raw aggregate result from Funifier API
   * @returns TeamSeasonPoints object
   */
  private processPointsAggregate(result: any[]): TeamSeasonPoints {
    if (!result || result.length === 0) {
      return { total: 0, bloqueados: 0, desbloqueados: 0 };
    }
    
    const data = result[0];
    return {
      total: data.totalPoints || 0,
      bloqueados: data.blockedPoints || 0,
      desbloqueados: data.unlockedPoints || 0
    };
  }

  /**
   * Process progress aggregate result into TeamProgressMetrics model.
   * 
   * Maps actionId counts to specific progress metrics based on action types.
   * 
   * @param result - Raw aggregate result from Funifier API
   * @returns TeamProgressMetrics object
   */
  private processProgressAggregate(result: any[]): TeamProgressMetrics {
    if (!result || result.length === 0) {
      return {
        processosIncompletos: 0,
        atividadesFinalizadas: 0,
        processosFinalizados: 0
      };
    }
    
    // Initialize metrics
    const metrics: TeamProgressMetrics = {
      processosIncompletos: 0,
      atividadesFinalizadas: 0,
      processosFinalizados: 0
    };
    
    // Map actionId to metrics
    // This mapping should be adjusted based on actual action IDs in the system
    result.forEach(item => {
      const actionId = item._id;
      const count = item.count || 0;
      
      // Map specific action IDs to metrics
      // These mappings should match the actual action IDs in your Funifier setup
      if (actionId === 'processo_incompleto' || actionId === 'incomplete_process') {
        metrics.processosIncompletos += count;
      } else if (actionId === 'atividade_finalizada' || actionId === 'completed_activity') {
        metrics.atividadesFinalizadas += count;
      } else if (actionId === 'processo_finalizado' || actionId === 'completed_process') {
        metrics.processosFinalizados += count;
      }
      // For now, count all actions as activities finalized if no specific mapping
      else {
        metrics.atividadesFinalizadas += count;
      }
    });
    
    return metrics;
  }

  /**
   * Process collaborator list aggregate result into Collaborator array.
   * 
   * @param result - Raw aggregate result from Funifier API
   * @returns Array of Collaborator objects
   */
  private processCollaboratorList(result: any[]): Collaborator[] {
    if (!result || result.length === 0) {
      return [];
    }
    
    return result.map(item => ({
      userId: item._id,
      name: item._id, // Use userId as name initially, can be enriched later
      email: item._id
    }));
  }

  /**
   * Get data from cache if valid.
   * 
   * @param key - Cache key
   * @returns Cached data or null if expired/not found
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache entry is still valid
    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  /**
   * Store data in cache with timestamp.
   * 
   * @param key - Cache key
   * @param data - Data to cache
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Handle aggregate query errors.
   * 
   * @param methodName - Name of the method where error occurred
   * @param error - Error object
   * @returns Observable that throws formatted error
   */
  private handleAggregateError(methodName: string, error: any): Observable<never> {
    console.error(`TeamAggregateService.${methodName} error:`, error);
    
    let errorMessage = 'Erro ao carregar dados da equipe';
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    return throwError(() => new Error(errorMessage));
  }

  /**
   * OPTIMIZED: Get activity metrics for all team members in a single aggregate query.
   * Replaces individual getProgressMetrics calls per member.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @returns Observable of aggregated activity metrics
   */
  getTeamActivityMetrics(
    teamId: string,
    startDate: Date,
    endDate: Date
  ): Observable<{
    finalizadas: number;
    pontos: number;
    processosFinalizados: number;
    processosIncompletos: number;
    pontosDone?: number;
    pontosTodosStatus?: number;
  }> {
    const cacheKey = `team_activity_${teamId}_${startDate.getTime()}_${endDate.getTime()}`;
    
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) {
      return of(cached);
    }

    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const range = this.game4u.toIsoRange(startDate, endDate);
      const sameCalendarMonth =
        startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth();
      const monthAnchor = sameCalendarMonth
        ? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        : null;

      if (!monthAnchor) {
        return this.game4u.getGameTeamStats({ team: teamId, ...range }).pipe(
          map(stats => {
            const prog = mapGame4uStatsToTeamProgressMetrics(stats);
            const activity = mapGame4uStatsToActivityMetrics(stats);
            return {
              finalizadas: activity.finalizadas,
              pontos: activity.pontos,
              processosFinalizados: prog.processosFinalizados,
              processosIncompletos: prog.processosIncompletos,
              pontosDone: activity.pontosDone,
              pontosTodosStatus: activity.pontosTodosStatus
            };
          }),
          tap(data => this.setCache(cacheKey, data)),
          catchError(error => {
            console.error('Error in getTeamActivityMetrics:', error);
            return of({ finalizadas: 0, pontos: 0, processosFinalizados: 0, processosIncompletos: 0 });
          })
        );
      }

      const y = monthAnchor.getFullYear();
      const actionsRangeStart = new Date(y, 0, 1, 0, 0, 0, 0);
      const actionsRange = this.game4u.toIsoRange(actionsRangeStart, endDate);

      return forkJoin({
        stats: this.game4u.getGameTeamStats({ team: teamId, ...range }),
        actions: this.game4u
          .getGameTeamActions({ team: teamId, ...actionsRange })
          .pipe(catchError(() => of([] as Game4uUserActionModel[])))
      }).pipe(
        map(({ stats, actions }) => {
          const prog = mapGame4uStatsToTeamProgressMetrics(stats);
          const drPrazoMetaBoost = computeGame4uDrPrazoMetaBoost(actions, monthAnchor);
          const circular = getGame4uMonthlyPointsCircularFromActionStats(stats);
          const byCompetence = filterGame4uActionsByCompetenceMonth(actions, monthAnchor);

          let finalizadas: number;
          let pontos: number;
          let pontosDone: number;
          let pontosTodosStatus: number;

          if (circular) {
            finalizadas = circular.finalizadas;
            pontosDone = circular.pontosDone;
            pontosTodosStatus = circular.pontosTodosStatus + drPrazoMetaBoost;
            pontos = pontosDone;
          } else {
            const pts = computeMonthlyPointsFromGame4uActions(byCompetence);
            finalizadas = pts.finalizadas;
            pontosDone = pts.pontosDone;
            pontosTodosStatus = pts.pontosTodosStatus + drPrazoMetaBoost;
            pontos = pts.pontos;
          }

          return {
            finalizadas,
            pontos,
            processosFinalizados: prog.processosFinalizados,
            processosIncompletos: prog.processosIncompletos,
            pontosDone,
            pontosTodosStatus
          };
        }),
        tap(data => this.setCache(cacheKey, data)),
        catchError(error => {
          console.error('Error in getTeamActivityMetrics:', error);
          return of({ finalizadas: 0, pontos: 0, processosFinalizados: 0, processosIncompletos: 0 });
        })
      );
    }

    // Single aggregate query with $lookup to get all action logs for team members
    const aggregateQuery = [
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
          'playerData.teams': teamId,
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalActions: { $sum: 1 },
          uniqueProcesses: { $addToSet: '$attributes.delivery_id' },
          desbloqueados: {
            $sum: {
              $cond: [{ $eq: ['$actionId', 'desbloquear'] }, 1, 0]
            }
          }
        }
      }
    ];

    console.log('🔍 Team activity metrics aggregate query');

    return this.backendApi.post<any[]>(
      '/database/action_log/aggregate?strict=true',
      aggregateQuery
    ).pipe(
      map(response => {
        const result = Array.isArray(response) && response.length > 0 ? response[0] : {};
        const finalizadas = result.totalActions || 0;
        const metrics = {
          finalizadas,
          pontos: Math.floor(finalizadas * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG),
          processosFinalizados: result.desbloqueados || 0,
          processosIncompletos: (result.uniqueProcesses?.length || 0) - (result.desbloqueados || 0)
        };
        console.log('✅ Team activity metrics (OPTIMIZED):', metrics);
        return metrics;
      }),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => {
        console.error('Error in getTeamActivityMetrics:', error);
        return of({ finalizadas: 0, pontos: 0, processosFinalizados: 0, processosIncompletos: 0 });
      })
    );
  }

  /**
   * Contagem de registros no action_log por membro (escopo time + intervalo).
   * Usada para pontos = count × PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG (regra provisória).
   */
  getTeamMemberActionLogCounts(
    teamId: string,
    startDate: Date,
    endDate: Date
  ): Observable<Map<string, number>> {
    const cacheKey = `team_member_action_counts_${teamId}_${startDate.getTime()}_${endDate.getTime()}`;

    const cached = this.getFromCache<Map<string, number>>(cacheKey);
    if (cached) {
      return of(cached);
    }

    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const range = this.game4u.toIsoRange(startDate, endDate);
      return this.game4u.getGameTeamActions({ team: teamId, ...range }).pipe(
        map(actions => {
          const m = new Map<string, number>();
          for (const a of actions) {
            const uid = String(a.user_email ?? '').trim();
            if (!uid) {
              continue;
            }
            m.set(uid, (m.get(uid) || 0) + 1);
          }
          return m;
        }),
        tap(data => this.setCache(cacheKey, data)),
        catchError(error => {
          console.error('Error in getTeamMemberActionLogCounts:', error);
          return of(new Map<string, number>());
        })
      );
    }

    const aggregateQuery = [
      {
        $lookup: {
          from: 'player',
          localField: 'userId',
          foreignField: '_id',
          as: 'playerData'
        }
      },
      { $unwind: '$playerData' },
      {
        $match: {
          'playerData.teams': teamId,
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
          }
        }
      },
      {
        $group: {
          _id: '$userId',
          actionCount: { $sum: 1 }
        }
      }
    ];

    return this.backendApi.post<any[]>(
      '/database/action_log/aggregate?strict=true',
      aggregateQuery
    ).pipe(
      map(response => {
        const map = new Map<string, number>();
        (Array.isArray(response) ? response : []).forEach((item: any) => {
          if (item._id != null) {
            map.set(String(item._id), item.actionCount || 0);
          }
        });
        return map;
      }),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => {
        console.error('Error in getTeamMemberActionLogCounts:', error);
        return of(new Map<string, number>());
      })
    );
  }

  /**
   * OPTIMIZED: Get CNPJ list with action counts for all team members in a single aggregate query.
   * Replaces individual getPlayerCnpjListWithCount calls per member.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @returns Observable of CNPJ list with aggregated counts
   */
  getTeamCnpjListWithCount(
    teamId: string,
    startDate: Date,
    endDate: Date,
    opts?: { game4uBwaTeamScopeId?: string }
  ): Observable<{ cnpj: string; actionCount: number; processCount: number }[]> {
    const scopeId = (opts?.game4uBwaTeamScopeId ?? '').trim();
    const cacheKey = scopeId
      ? `team_cnpj_rpt_${scopeId}_${startDate.getTime()}_${endDate.getTime()}`
      : `team_cnpj_ad_${teamId}_${startDate.getTime()}_${endDate.getTime()}`;

    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached) {
      return of(cached);
    }

    if (isGame4uDataEnabled() && this.game4u.isConfigured() && scopeId) {
      const range = this.game4u.toIsoRange(startDate, endDate);
      return this.game4u
        .getGameReportsFinishedDeliveries({
          team_id: scopeId,
          finished_at_start: range.start,
          finished_at_end: range.end
        })
        .pipe(
          map(rows => mapGame4uFinishedDeliveryRowsToParticipacaoCnpjRows(rows)),
          tap(data => this.setCache(cacheKey, data)),
          catchError(error => {
            console.error('Error in getTeamCnpjListWithCount (reports):', error);
            return of([]);
          })
        );
    }

    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      const range = this.game4u.toIsoRange(startDate, endDate);
      const base = { team: teamId, ...range };
      return forkJoin({
        done: this.game4u.getGameTeamActions({ ...base, status: 'DONE' }).pipe(
          catchError(() => of([] as Game4uUserActionModel[]))
        ),
        delivered: this.game4u.getGameTeamActions({ ...base, status: 'DELIVERED' }).pipe(
          catchError(() => of([] as Game4uUserActionModel[]))
        )
      }).pipe(
        map(({ done, delivered }) =>
          mapGame4uUserActionsToParticipacaoCnpjRows([...done, ...delivered])
        ),
        tap(data => this.setCache(cacheKey, data)),
        catchError(error => {
          console.error('Error in getTeamCnpjListWithCount:', error);
          return of([]);
        })
      );
    }

    // Single aggregate query with $lookup to get all CNPJs for team members
    const actionCountQuery = [
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
          'playerData.teams': teamId,
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
          },
          'attributes.deal': { $ne: null }
        }
      },
      {
        $group: {
          _id: '$attributes.deal',
          actionCount: { $sum: 1 },
          uniqueProcesses: { $addToSet: '$attributes.delivery_id' }
        }
      },
      {
        $project: {
          _id: 1,
          actionCount: 1,
          processCount: { $size: '$uniqueProcesses' }
        }
      },
      {
        $sort: { actionCount: -1 }
      }
    ];

    console.log('🔍 Team CNPJ list aggregate query');

    return this.backendApi.post<any[]>(
      '/database/action_log/aggregate?strict=true',
      actionCountQuery
    ).pipe(
      map(response => {
        const result = Array.isArray(response) ? response : [];
        const cnpjList = result
          .filter(item => item._id != null)
          .map(item => ({
            cnpj: item._id,
            actionCount: item.actionCount || 0,
            processCount: item.processCount || 0
          }));
        console.log('✅ Team CNPJ list (OPTIMIZED):', cnpjList.length, 'unique CNPJs');
        return cnpjList;
      }),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => {
        console.error('Error in getTeamCnpjListWithCount:', error);
        return of([]);
      })
    );
  }

  /**
   * Breakdown mensal/equipe: bloqueados vêm do achievement (carteira); desbloqueados =
   * atividades no action_log (escopo time) × pontos por atividade (regra provisória, alinhada ao gamification).
   */
  getTeamMonthlyPointsBreakdown(
    teamId: string,
    memberIds: string[],
    startDate: Date,
    endDate: Date
  ): Observable<{ bloqueados: number; desbloqueados: number }> {
    const cacheKey = `team_points_breakdown_v2_${teamId}_${memberIds.join('_')}_${startDate.getTime()}_${endDate.getTime()}`;

    const cached = this.getFromCache<{ bloqueados: number; desbloqueados: number }>(cacheKey);
    if (cached) {
      return of(cached);
    }

    if (isGame4uDataEnabled() && this.game4u.isConfigured()) {
      if (!teamId) {
        return of({ bloqueados: 0, desbloqueados: 0 });
      }
      const range = this.game4u.toIsoRange(startDate, endDate);
      return this.game4u.getGameTeamStats({ team: teamId, ...range }).pipe(
        map(stats => {
          const w = mapGame4uStatsToPointWallet(stats);
          const result = { bloqueados: w.bloqueados, desbloqueados: w.desbloqueados };
          console.log('✅ Team monthly points breakdown (Game4U):', result);
          return result;
        }),
        tap(data => this.setCache(cacheKey, data)),
        catchError(error => {
          console.error('Error in getTeamMonthlyPointsBreakdown:', error);
          return of({ bloqueados: 0, desbloqueados: 0 });
        })
      );
    }

    if (memberIds.length === 0 || !teamId) {
      return of({ bloqueados: 0, desbloqueados: 0 });
    }

    const achievementQuery = [
      {
        $match: {
          player: { $in: memberIds },
          type: 0,
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
          }
        }
      },
      {
        $group: {
          _id: '$item',
          total: { $sum: '$total' }
        }
      }
    ];

    console.log('🔍 Team monthly points breakdown (achievement + action_log)');

    return forkJoin({
      ach: this.backendApi.post<any[]>(
        '/database/achievement/aggregate?strict=true',
        achievementQuery
      ),
      activity: this.getTeamActivityMetrics(teamId, startDate, endDate)
    }).pipe(
      map(({ ach, activity }) => {
        let bloqueados = 0;
        if (Array.isArray(ach)) {
          ach.forEach(item => {
            if (item._id === 'locked_points' || item._id === 'bloqueados') {
              bloqueados = Math.floor(item.total || 0);
            }
          });
        }
        const desbloqueados = Math.floor(activity.pontos || 0);
        const result = { bloqueados, desbloqueados };
        console.log('✅ Team monthly points breakdown:', result);
        return result;
      }),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => {
        console.error('Error in getTeamMonthlyPointsBreakdown:', error);
        return of({ bloqueados: 0, desbloqueados: 0 });
      })
    );
  }

  /**
   * Total de pontos de atividade (action_log no intervalo, todos os membros indicados) × pontos por tarefa.
   * Regra provisória alinhada ao gamification; não usa soma de achievement.
   */
  getTeamTotalPoints(
    memberIds: string[],
    startDate: Date,
    endDate: Date
  ): Observable<number> {
    const cacheKey = `team_total_activity_points_${memberIds.join('_')}_${startDate.getTime()}_${endDate.getTime()}`;

    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) {
      return of(cached);
    }

    if (memberIds.length === 0) {
      return of(0);
    }

    const aggregateQuery = [
      {
        $match: {
          userId: { $in: memberIds },
          time: {
            $gte: { $date: startDate.toISOString() },
            $lte: { $date: endDate.toISOString() }
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 }
        }
      }
    ];

    console.log('🔍 Team total activity points (action_log count × constant)');

    return this.backendApi.post<any[]>(
      '/database/action_log/aggregate?strict=true',
      aggregateQuery
    ).pipe(
      map(response => {
        const count =
          Array.isArray(response) && response.length > 0 ? Math.floor(response[0].total || 0) : 0;
        const total = Math.floor(count * PONTOS_POR_ATIVIDADE_FINALIZADA_ACTION_LOG);
        console.log('✅ Team total activity points:', total);
        return total;
      }),
      tap(data => this.setCache(cacheKey, data)),
      catchError(error => {
        console.error('Error in getTeamTotalPoints:', error);
        return of(0);
      })
    );
  }
}
