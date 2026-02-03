import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { AggregateQueryBuilderService, AggregateQuery } from './aggregate-query-builder.service';
import { PerformanceMonitorService } from './performance-monitor.service';

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
 * aggregate queries and the FunifierApiService to execute them. It processes
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
    private funifierApi: FunifierApiService,
    private queryBuilder: AggregateQueryBuilderService,
    private performanceMonitor: PerformanceMonitorService
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
    
    return this.funifierApi.post<T[] | { result: T[] }>(endpoint, aggregatePipeline).pipe(
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
}
