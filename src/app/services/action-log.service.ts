import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, switchMap } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { ATTRIBUTES_DEAL_UNWIND_STAGES } from './action-log-deal-aggregate.util';
import { ActivityMetrics, ProcessMetrics } from '@model/gamification-dashboard.model';
import dayjs from 'dayjs';

export interface ActionLogEntry {
  _id: string;
  actionId: string; // Action type identifier (e.g., 'acessorias', 'desbloquear')
  userId: string; // User's email
  time: number | { $date: string }; // Timestamp when action was logged (can be number or { $date: "ISO string" })
  attributes?: {
    delivery_title?: string; // Process title
    delivery_id?: number; // Process ID (number)
    delivery?: number; // Used in desbloquear action to reference delivery_id
    acao?: string; // Action title to display
    stage?: string; // Stage of action (used to match achievements)
    deal?: string | string[]; // Deal/CNPJ reference (string or array from API)
    id?: string | number; // Action identifier used in achievement.extra.id
    cnpj?: string; // Client CNPJ
    integration_id?: number;
    [key: string]: unknown;
  };
  extra?: {
    processed?: boolean;
    processed_at?: number;
    [key: string]: unknown;
  };
  // Legacy fields (may not exist in all entries)
  action?: string;
  action_title?: string;
  status?: string;
  points?: number;
  player?: string; // Deprecated: use userId
  created?: number; // Deprecated: use time
  updated?: number;
  delivery_id?: string; // Deprecated: use attributes.delivery_id
  delivery_title?: string; // Deprecated: use attributes.delivery_title
}

export interface ActivityListItem {
  id: string;
  title: string; // attributes.acao
  points: number;
  pointsLocked?: boolean; // true when achievement.item === 'locked_points'
  created: number;
  player?: string; // userId (email do executor)
  status?: 'finalizado' | 'pendente' | 'dispensado'; // Status da atividade
  cnpj?: string; // CNPJ da empresa associada à atividade
}

export interface ProcessListItem {
  deliveryId: string;
  title: string; // delivery_title
  actionCount: number;
  isFinalized: boolean;
  cnpj?: string; // CNPJ da empresa associada ao processo
}

export interface ClienteListItem {
  cnpj: string;
  actions: ClienteActionItem[];
}

export interface ClienteActionItem {
  id: string;
  title: string; // attributes.acao
  player: string; // userId (email do executor)
  created: number; // timestamp
  status?: 'finalizado' | 'pendente' | 'dispensado'; // Status da tarefa
  points?: number; // Points from achievement
  pointsLocked?: boolean; // true when achievement.item === 'locked_points'
}

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

/**
 * Helper to extract timestamp from Funifier's time field
 * Funifier may return time as a number or as { $date: "ISO string" }
 */
function extractTimestamp(time: number | { $date: string } | undefined): number {
  if (!time) return 0;
  if (typeof time === 'number') return time;
  if (typeof time === 'object' && '$date' in time) {
    const date = new Date(time.$date);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

/** First non-empty deal string from attributes.deal (scalar or array). */
function normalizeAttributesDealToString(deal: unknown): string | undefined {
  if (typeof deal === 'string' && deal.trim() !== '') {
    return deal;
  }
  if (Array.isArray(deal)) {
    const first = deal.find((x): x is string => typeof x === 'string' && x.trim() !== '');
    return first;
  }
  return undefined;
}

/**
 * Extract process label from action_log id string.
 * Example:
 * "...pipeConcessão de AposentadoriastageComunicar Concessão (CS)"
 * -> "Concessão de AposentadoriastageComunicar Concessão (CS)"
 */
function extractProcessTitleFromActionLogId(actionLogId: string | undefined): string | undefined {
  if (typeof actionLogId !== 'string' || actionLogId.trim() === '') {
    return undefined;
  }

  const match = actionLogId.match(/pipe(.+)$/i);
  if (!match || typeof match[1] !== 'string') {
    return undefined;
  }

  const parsedTitle = match[1].trim();
  return parsedTitle !== '' ? parsedTitle : undefined;
}

/**
 * Helper to generate Funifier date expressions (relative or absolute)
 * Funifier supports: -0d-, -0d+, -1d-, -0M-, -0M+, -0y-, etc.
 * - `-0M-` = start of current month
 * - `-0M+` = end of current month
 * - `-1M-` = start of previous month
 * - `-1M+` = end of previous month
 * 
 * Also supports absolute dates: { $date: "2026-01-01T00:00:00.000Z" }
 * 
 * Logic:
 * - When February 2026 is selected (current month), start date includes January (01/01/2026)
 * - When January 2026 is selected, returns only January (01/01/2026 to 31/01/2026)
 * - Minimum date is always 01/01/2026
 */
function getRelativeDateExpression(month: Date | undefined, position: 'start' | 'end'): { $date: string } | number {
  const targetMonth = month || new Date();
  const targetMonthNum = targetMonth.getMonth();
  const targetYear = targetMonth.getFullYear();
  
  // Season start date: 01/01/2026
  const seasonStartDate = new Date('2026-01-01T00:00:00.000Z');
  
  // Calculate the start or end of the selected month
  if (position === 'start') {
    const monthStart = new Date(targetYear, targetMonthNum, 1, 0, 0, 0, 0);
    // Ensure we don't go before season start
    if (monthStart < seasonStartDate) {
      return { $date: seasonStartDate.toISOString() };
    }
    return { $date: monthStart.toISOString() };
  } else {
    // End of the selected month
    const monthEnd = new Date(targetYear, targetMonthNum + 1, 0, 23, 59, 59, 999);
    return { $date: monthEnd.toISOString() };
  }
}

@Injectable({
  providedIn: 'root'
})
export class ActionLogService {
  private readonly CACHE_DURATION = 3 * 60 * 1000; // 3 minutes
  private actionLogCache = new Map<string, CacheEntry<ActionLogEntry[]>>();
  private metricsCache = new Map<string, CacheEntry<{ activity: ActivityMetrics; processo: ProcessMetrics }>>();
  private activityCountCache = new Map<string, CacheEntry<number>>(); // Cache for activity counts
  private uniqueClientesCache = new Map<string, CacheEntry<number>>();
  private uniqueDealsCache = new Map<string, CacheEntry<string[]>>();
  private cnpjListWithCountCache = new Map<string, CacheEntry<{ cnpj: string; actionCount: number; processCount: number }[]>>();
  private activitiesByDayCache = new Map<string, CacheEntry<{ day: number; count: number }[]>>();
  private activitiesByProcessCache = new Map<string, CacheEntry<ActivityListItem[]>>();
  private processListCache = new Map<string, CacheEntry<ProcessListItem[]>>();
  private processFinalizationCache = new Map<string, CacheEntry<Set<number>>>();
  private actionsByCnpjCache = new Map<string, CacheEntry<ClienteActionItem[]>>();
  private processMetricsCache = new Map<string, CacheEntry<ProcessMetrics>>();
  private pontosForMonthCache = new Map<string, CacheEntry<number>>();
  private monthlyPointsBreakdownCache = new Map<string, CacheEntry<{ bloqueados: number; desbloqueados: number }>>();

  constructor(private funifierApi: FunifierApiService) {}

  private normalizeStringValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  /**
   * Fetch points from action_template__c by matching attributes.acao as _id.
   * Returns a Map from action _id to its points value.
   */
  private getPointsByActionTemplate(actions: ActionLogEntry[]): Observable<Map<string, number>> {
    const acaoByActionId = new Map<string, string>();
    const uniqueAcaos = new Set<string>();

    actions.forEach(action => {
      const stage = this.normalizeStringValue(action.attributes?.stage);
      if (stage) {
        acaoByActionId.set(action._id, stage);
        uniqueAcaos.add(stage);
      }
    });

    if (uniqueAcaos.size === 0) {
      return of(new Map<string, number>());
    }

    const acaoList = Array.from(uniqueAcaos);
    const aggregateBody = [
      { $match: { _id: { $in: acaoList } } }
    ];
    return this.funifierApi.post<any>(
      '/v3/database/action_template__c/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        const pointsByAcao = new Map<string, number>();
        const docs = Array.isArray(response) ? response : [];
        docs.forEach((doc: any) => {
          if (doc?._id && doc?.points != null) {
            pointsByAcao.set(doc._id, Number(doc.points));
          }
        });
        const pointsByActionId = new Map<string, number>();
        acaoByActionId.forEach((acao, actionId) => {
          const pts = pointsByAcao.get(acao);
          if (pts != null) {
            pointsByActionId.set(actionId, pts);
          }
        });

        return pointsByActionId;
      }),
      catchError(error => {
        console.error('Error fetching points from action_template__c:', error);
        return of(new Map<string, number>());
      })
    );
  }

  /**
   * Fetch points for actions by matching achievement.extra fields:
   * - extra.id    <= action.attributes.id
   * - extra.acao  <= action.attributes.stage
   */
  private getAchievementPointsByActions(actions: ActionLogEntry[]): Observable<Map<string, { total: number; locked: boolean }>> {
      type MatchTuple = { id: string; acao: string };

      const tuplesByActionId = new Map<string, MatchTuple>();
      const uniqueTuples = new Map<string, MatchTuple>();

      actions.forEach(action => {
        const acao = this.normalizeStringValue(action.attributes?.stage);
        const rawId = action.attributes?.id;
        const id = rawId != null ? String(rawId).trim() : '';
        if (!acao || !id) return;

        const tuple: MatchTuple = { id, acao };
        const tupleKey = `${id}__${acao}`;
        tuplesByActionId.set(action._id, tuple);
        uniqueTuples.set(tupleKey, tuple);
      });

      if (uniqueTuples.size === 0) {
        return of(new Map<string, { total: number; locked: boolean }>());
      }

      // Single aggregate with $or for all tuples
      const orConditions = Array.from(uniqueTuples.values()).map(t => ({
        'extra.id': t.id,
        'extra.acao': t.acao
      }));

      const aggregateBody = [
        { $match: { $or: orConditions } }
      ];
      return this.funifierApi.post<Array<{ total?: number; item?: string; extra?: { id?: string; acao?: string } }>>(
        '/v3/database/achievement/aggregate?strict=true',
        aggregateBody
      ).pipe(
        map(response => {
          const docs = Array.isArray(response) ? response : [];
          // Group results by tuple key
          const tuplePoints = new Map<string, { total: number; locked: boolean }>();

          docs.forEach(doc => {
            const docId = String((doc as any)?.extra?.id || '').trim();
            const docAcao = String((doc as any)?.extra?.acao || '').trim();
            if (!docId || !docAcao) return;

            const tupleKey = `${docId}__${docAcao}`;
            const existing = tuplePoints.get(tupleKey) || { total: 0, locked: false };
            existing.total += Number(doc?.total || 0);
            if (String(doc?.item || '').trim() === 'locked_points') {
              existing.locked = true;
            }
            tuplePoints.set(tupleKey, existing);
          });

          const pointsByActionId = new Map<string, { total: number; locked: boolean }>();
          tuplesByActionId.forEach((tuple, actionId) => {
            const tupleKey = `${tuple.id}__${tuple.acao}`;
            pointsByActionId.set(actionId, tuplePoints.get(tupleKey) || { total: 0, locked: false });
          });

          return pointsByActionId;
        }),
        catchError(error => {
          console.error('Error fetching achievement points:', error);
          return of(new Map<string, { total: number; locked: boolean }>());
        })
      );
    }


  /**
   * Get action log entries for a player for the current month
   * Uses userId field to match the user's email
   * Uses Funifier's relative date expressions for time filtering
   * Note: action_log uses 'time' field for timestamp, not 'created'
   */
  getPlayerActionLogForMonth(playerId: string, month?: Date): Observable<ActionLogEntry[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.actionLogCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax for time filtering
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    // Aggregate query to get action log for this player in the target month
    // Uses userId field and time field with Funifier $date expressions
    // Add $limit with high value to avoid MongoDB default limit of 100 documents
    const aggregateBody = [
      { 
        $match: { 
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        } 
      },
      { $sort: { time: -1 } },
      { $limit: 10000 } // High limit to get all documents (MongoDB default is 100)
    ];
    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        return Array.isArray(response) ? response : [];
      }),
      catchError(error => {
        console.error('Error fetching action log:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionLogCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get count of activities finalizadas (entries in action_log for the month)
   * Uses $count aggregation for better performance and to avoid MongoDB default limit
   */
  getAtividadesFinalizadas(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `count_${playerId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.activityCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax for time filtering
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    // Use $count aggregation to get total count without returning all documents
    // This avoids MongoDB default limit of 100 documents
    const aggregateBody = [
      { 
        $match: { 
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        } 
      },
      {
        $count: 'total'
      }
    ];
    const request$ = this.funifierApi.post<{ total: number }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        // $count returns array with single object: [{ total: number }]
        if (Array.isArray(response) && response.length > 0 && response[0]?.total !== undefined) {
          return response[0].total;
        }
        return 0;
      }),
      catchError(error => {
        console.error('Error fetching activity count:', error);
        // Fallback to old method if $count doesn't work
        return this.getPlayerActionLogForMonth(playerId, month).pipe(
          map(actions => actions.length)
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );
    
    // Store in cache
    this.setCachedData(this.activityCountCache, cacheKey, request$);
    return request$;
  }

  /**
   * Alias for getAtividadesFinalizadas for backward compatibility
   */
  getCompletedTasksCount(playerId: string): Observable<number> {
    return this.getAtividadesFinalizadas(playerId);
  }

  /**
   * Get monthly points breakdown (blocked and unlocked)
   * Queries achievement collection for type=0 entries, separated by item field
   * Uses Funifier's relative date expressions
   * Cached with shareReplay to avoid duplicate requests
   */
  /**
   * Get monthly points breakdown for the selected month.
   * 
   * Two-step process:
   * 1. Fetch action_log IDs for the player in the selected month
   * 2. Use those IDs in an achievement aggregate with extra.id filter to get locked_points total
   * 
   * This ensures we only count points that are associated with actions in the selected month.
   */
  getMonthlyPointsBreakdown(playerId: string, month?: Date): Observable<{ bloqueados: number; desbloqueados: number }> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_points_breakdown`;
    const cached = this.getCachedData(this.monthlyPointsBreakdownCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Step 1: Get action_log IDs for the selected month
    const request$ = this.getActionLogIdsForMonth(playerId, month).pipe(
      switchMap(actionLogIds => {
        if (actionLogIds.length === 0) {
          // No actions in this month, return zeros
          return of({ bloqueados: 0, desbloqueados: 0 });
        }

        // Step 2: Aggregate achievements using extra.id filter with action_log IDs
        return forkJoin({
          bloqueados: this.getPointsFromAchievementByActionIds(playerId, 'locked_points', actionLogIds),
          desbloqueados: this.getPointsFromAchievementByActionIds(playerId, 'points', actionLogIds)
        });
      }),
      catchError(error => {
        console.error('Error fetching monthly points breakdown:', error);
        return of({ bloqueados: 0, desbloqueados: 0 });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.monthlyPointsBreakdownCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get action_log IDs for a player in the selected month.
   * Returns array of _id strings from action_log entries.
   */
  private getActionLogIdsForMonth(playerId: string, month?: Date): Observable<string[]> {
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $project: { _id: 1 }
      },
      { $limit: 10000 }
    ];
    return this.funifierApi.post<{ _id: string }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        const ids = Array.isArray(response) ? response.map(item => item._id) : [];
        return ids;
      }),
      catchError(error => {
        console.error('Error fetching action_log IDs:', error);
        return of([]);
      })
    );
  }

  /**
   * Get points total from achievement collection filtered by extra.id (action_log IDs).
   * 
   * @param playerId - Player ID (email)
   * @param item - Point category: 'locked_points' or 'points'
   * @param actionLogIds - Array of action_log _id values to filter by
   */
  private getPointsFromAchievementByActionIds(
    playerId: string,
    item: 'locked_points' | 'points',
    actionLogIds: string[]
  ): Observable<number> {
    if (actionLogIds.length === 0) {
      return of(0);
    }

    const aggregateBody = [
      {
        $match: {
          player: playerId,
          type: 0, // type 0 = points
          item: item,
          'extra.id': { $in: actionLogIds }
        }
      },
      {
        $group: {
          _id: null,
          soma_total: { $sum: '$total' }
        }
      }
    ];
    return this.funifierApi.post<{ _id: null; soma_total: number }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        const total = Array.isArray(response) && response.length > 0 
          ? (response[0].soma_total || 0) 
          : 0;
        return total;
      }),
      catchError(error => {
        console.error(`Error fetching ${item} from achievement:`, error);
        return of(0);
      })
    );
  }

  /**
   * Get points from achievements for the month
   * Queries achievement collection for type=0 entries
   * Uses Funifier's relative date expressions
   * Note: achievement collection uses 'time' field for timestamp
   * Cached with shareReplay to avoid duplicate requests
   */
  getPontosForMonth(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_pontos`;
    const cached = this.getCachedData(this.pontosForMonthCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          player: playerId,
          type: 0, // type 0 = points
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      }
    ];
    const request$ = this.funifierApi.post<{ _id: null; total: number }[]>(
      '/v3/database/achievement/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        if (Array.isArray(response) && response.length > 0) {
          return response[0].total || 0;
        }
        return 0;
      }),
      catchError(error => {
        console.error('Error fetching achievement points:', error);
        return of(0);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.pontosForMonthCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get unique CNPJs count from user's action_log
   * Uses Funifier's relative date expressions
   * Cached with shareReplay to avoid duplicate requests
   */
  getUniqueClientesCount(playerId: string, month?: Date): Observable<number> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_unique_cnpjs`;
    const cached = this.getCachedData(this.uniqueClientesCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      ...ATTRIBUTES_DEAL_UNWIND_STAGES,
      {
        $group: {
          _id: '$dealValues'
        }
      },
      {
        $match: {
          _id: { $ne: null }
        }
      },
      {
        $count: 'total'
      }
    ];
    const request$ = this.funifierApi.post<{ total: number }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        if (Array.isArray(response) && response.length > 0) {
          return response[0].total || 0;
        }
        return 0;
      }),
      catchError(error => {
        console.error('Error counting unique CNPJs:', error);
        return of(0);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.uniqueClientesCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get unique deals from user's action_log (attributes.deals).
   * Returns a de-duplicated list of values for the selected month.
   */
  getUniqueDeals(playerId: string, month?: Date): Observable<string[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_unique_deals`;
    const cached = this.getCachedData(this.uniqueDealsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      ...ATTRIBUTES_DEAL_UNWIND_STAGES,
      {
        $group: {
          _id: null,
          deals: { $addToSet: '$dealValues' }
        }
      },
      { $project: { _id: 0, deals: 1 } }
    ];
    const request$ = this.funifierApi
      .post<{ deals: unknown[] }[]>(
        '/v3/database/action_log/aggregate?strict=true',
        aggregateBody
      )
      .pipe(
        map(response => {
          if (Array.isArray(response) && response.length > 0) {
            const deals = (response[0] as any)?.deals;
            if (Array.isArray(deals)) {
              return deals.map(d => String(d)).filter(d => d && d.trim().length > 0);
            }
          }
          return [];
        }),
        catchError(error => {
          console.error('Error fetching unique deals:', error);
          return of([]);
        }),
        shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
      );

    this.setCachedData(this.uniqueDealsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get process metrics for a player
   * A Process is identified by unique attributes.delivery_id (number) in action_log
   * Process is Finalizado if there's a "desbloquear" action with attributes.delivery = delivery_id
   * Otherwise it's Pendente/Incompleto
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessMetrics(playerId: string, month?: Date): Observable<ProcessMetrics> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_process_metrics`;
    const cached = this.getCachedData(this.processMetricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Get unique delivery_ids from user's actions (attributes.delivery_id is a number)
        const deliveryIds = [...new Set(
          userActions
            .map(a => a.attributes?.delivery_id)
            .filter((id): id is number => id != null)
        )];
        if (deliveryIds.length === 0) {
          return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
        }

        // Query action_log for "desbloquear" actions with matching delivery_ids
        // Note: actionId field contains the action type, attributes.delivery matches delivery_id
        const aggregateBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: deliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];
        return this.funifierApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const desbloqueadosIds = new Set(desbloqueados.map(d => d._id));
            // Count finalizadas (have desbloquear action)
            const finalizadas = deliveryIds.filter(id => desbloqueadosIds.has(id)).length;
            
            // Count pendentes/incompletas (don't have desbloquear action)
            const pendentesIncompletas = deliveryIds.length - finalizadas;

            return {
              pendentes: pendentesIncompletas,
              incompletas: 0, // Combined with pendentes
              finalizadas
            };
          }),
          catchError(error => {
            console.error('Error fetching desbloquear actions:', error);
            return of({ pendentes: deliveryIds.length, incompletas: 0, finalizadas: 0 });
          })
        );
      }),
      catchError(error => {
        console.error('Error calculating process metrics:', error);
        return of({ pendentes: 0, incompletas: 0, finalizadas: 0 });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.processMetricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get activity and process metrics for a player
   * This provides data for "Meu Progresso" section
   * - Atividades: Finalizadas (count of action_log entries), Pontos (from achievement)
   * - Processos: Finalizados, Pendentes/Incompletos (based on desbloquear action)
   */
  getProgressMetrics(playerId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    const cacheKey = `metrics_${playerId}_${dayjs(month || new Date()).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.metricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = forkJoin({
      finalizadas: this.getAtividadesFinalizadas(playerId, month),
      pontos: this.getPontosForMonth(playerId, month),
      processo: this.getProcessMetrics(playerId, month)
    }).pipe(
      map(({ finalizadas, pontos, processo }) => ({
        activity: {
          pendentes: 0, // Not used anymore
          emExecucao: 0, // Not used anymore
          finalizadas,
          pontos
        },
        processo
      })),
      catchError(error => {
        console.error('Error calculating progress metrics:', error);
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.metricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get list of activities for modal display
   * Returns list with attributes.stage as title (fallback to attributes.acao)
   */
  getActivityList(playerId: string, month?: Date): Observable<ActivityListItem[]> {
    return this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(actions => forkJoin({
        achievementPoints: this.getAchievementPointsByActions(actions),
        templatePoints: this.getPointsByActionTemplate(actions)
      }).pipe(
        map(({ achievementPoints, templatePoints }) => actions.map(a => {
        // Determine status based on action data
        let status: 'finalizado' | 'pendente' | 'dispensado' | undefined;

        const stageForStatusRaw = a.attributes?.['stage'];
        const stageForStatus =
          typeof stageForStatusRaw === 'string' ? stageForStatusRaw.trim().toLowerCase() : '';
        const hasStage = stageForStatus.length > 0;
        const stageIndicatesFinalizado =
          stageForStatus === 'done' ||
          stageForStatus === 'delivered' ||
          stageForStatus === 'finalizado' ||
          stageForStatus === 'finalizada' ||
          stageForStatus.includes('finaliz') ||
          stageForStatus.includes('entreg') ||
          stageForStatus.includes('conclu');
        
        // Check if action is dismissed (highest priority)
        if (a.extra?.['dismissed'] === true || a.attributes?.['dismissed'] === true || a.status === 'CANCELLED') {
          status = 'dispensado';
        }
        // Check if action is completed/finalized
        else if (a.extra?.processed === true || 
                 a.status === 'DONE' || 
                 a.status === 'DELIVERED' ||
                 a.actionId === 'desbloquear' ||
                 stageIndicatesFinalizado ||
                 hasStage) {
          status = 'finalizado';
        }
        // Check if action is pending or in progress
        else if (a.status === 'PENDING' || 
                 a.status === 'DOING' || 
                 a.status === 'INCOMPLETE' ||
                 !a.status) {
          status = 'pendente';
        }

        const stageFromAttributes = a.attributes?.['stage'];
        const acaoFromAttributes = a.attributes?.['acao'];
        const title =
          (typeof stageFromAttributes === 'string' && stageFromAttributes.trim() !== '')
            ? stageFromAttributes
            : (typeof acaoFromAttributes === 'string' && acaoFromAttributes.trim() !== '')
              ? acaoFromAttributes
              : (a.action_title || a.actionId || 'Ação sem título');

          const pointsInfo = achievementPoints.get(a._id);
          const templatePts = templatePoints.get(a._id);

          return {
          id: a._id,
          title,
          points: templatePts ?? pointsInfo?.total ?? (a.points || 0),
          pointsLocked: pointsInfo?.locked ?? false,
          created: extractTimestamp(a.time as number | { $date: string } | undefined),
          player: a.userId || '',
          status,
          cnpj: normalizeAttributesDealToString(a.attributes?.['deal'])
          };
        }))
      )),
      catchError(error => {
        console.error('Error fetching activity list:', error);
        return of([]);
      })
    );
  }

  /**
   * Get list of processes for modal display
   * Groups by attributes.delivery_id (number), shows attributes.delivery_title and action count
   * Note: delivery_id is a number in attributes, not a string
   * Cached with shareReplay to avoid duplicate requests
   */
  getProcessList(playerId: string, month?: Date): Observable<ProcessListItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_process_list`;
    const cached = this.getCachedData(this.processListCache, cacheKey);
    if (cached) {
      return cached;
    }

    const request$ = this.getPlayerActionLogForMonth(playerId, month).pipe(
      switchMap(userActions => {
        // Group actions by a robust key:
        // 1) attributes.delivery_id (legacy/structured)
        // 2) parsed process title from action_log._id (new payload shape)
        // 3) action_log._id as last fallback
        const deliveryMap = new Map<string, { title: string; count: number; cnpj?: string; numericDeliveryId?: number }>();
        
        userActions.forEach(action => {
          const rawDeliveryId = action.attributes?.delivery_id;
          const numericDeliveryId = typeof rawDeliveryId === 'number' ? rawDeliveryId : undefined;
          const titleFromActionLogId = extractProcessTitleFromActionLogId(action._id);

          const deliveryKey =
            numericDeliveryId != null
              ? String(numericDeliveryId)
              : (titleFromActionLogId && titleFromActionLogId.trim() !== '')
                ? `pipe:${titleFromActionLogId}`
                : `log:${action._id}`;

          const existing = deliveryMap.get(deliveryKey);
          if (existing) {
            existing.count++;
            // Keep numeric delivery id if we discover it later
            if (existing.numericDeliveryId == null && numericDeliveryId != null) {
              existing.numericDeliveryId = numericDeliveryId;
            }
            // Update CNPJ if not set yet and this action has one
            if (!existing.cnpj) {
              const cnpj = normalizeAttributesDealToString(action.attributes?.['deal']);
              if (cnpj) {
                existing.cnpj = cnpj;
              }
            }
          } else {
            deliveryMap.set(deliveryKey, {
              title:
                titleFromActionLogId ||
                action.attributes?.delivery_title ||
                (numericDeliveryId != null ? `Processo ${numericDeliveryId}` : 'Processo sem título'),
              count: 1,
              cnpj: normalizeAttributesDealToString(action.attributes?.['deal']),
              numericDeliveryId
            });
          }
        });

        const deliveryKeys = [...deliveryMap.keys()];
        const numericDeliveryIds = [...new Set(
          Array.from(deliveryMap.values())
            .map(info => info.numericDeliveryId)
            .filter((id): id is number => id != null)
        )];
        if (deliveryKeys.length === 0) {
          return of([]);
        }

        // If we have no numeric delivery IDs, we cannot check desbloquear relation by delivery.
        // In this case keep all as "not finalized" so they appear in pending list.
        if (numericDeliveryIds.length === 0) {
          return of(
            deliveryKeys.map(deliveryKey => {
              const info = deliveryMap.get(deliveryKey)!;
              return {
                deliveryId: deliveryKey,
                title: info.title,
                actionCount: info.count,
                isFinalized: false,
                cnpj: info.cnpj
              };
            })
          );
        }

        // Check cache for finalization status first (numeric delivery ids only)
        const finalizationCacheKey = `${dayjs(targetMonth).format('YYYY-MM')}_finalized_${numericDeliveryIds.sort((a, b) => a - b).join(',')}`;
        const cachedFinalized = this.getCachedData(this.processFinalizationCache, finalizationCacheKey);
        
        if (cachedFinalized) {
          return cachedFinalized.pipe(
            map(finalizedIds => {
              return deliveryKeys.map(deliveryKey => {
                const info = deliveryMap.get(deliveryKey)!;
                return {
                  deliveryId: deliveryKey,
                  title: info.title,
                  actionCount: info.count,
                  isFinalized: info.numericDeliveryId != null ? finalizedIds.has(info.numericDeliveryId) : false,
                  cnpj: info.cnpj
                };
              });
            })
          );
        }

        // Check which processes are finalized (have desbloquear action with matching attributes.delivery)
        // Note: attributes.delivery in desbloquear action matches delivery_id
        const aggregateBody = [
          {
            $match: {
              actionId: 'desbloquear',
              'attributes.delivery': { $in: numericDeliveryIds }
            }
          },
          {
            $group: {
              _id: '$attributes.delivery'
            }
          }
        ];
        const finalizationRequest$ = this.funifierApi.post<{ _id: number }[]>(
          '/v3/database/action_log/aggregate?strict=true',
          aggregateBody
        ).pipe(
          map(desbloqueados => {
            const finalizedIds = new Set(desbloqueados.map(d => d._id));
            return finalizedIds;
          }),
          catchError(() => {
            // If desbloquear query fails, return empty set (all not finalized)
            return of(new Set<number>());
          }),
          shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
        );

        // Cache finalization status
        this.setCachedData(this.processFinalizationCache, finalizationCacheKey, finalizationRequest$);

        return finalizationRequest$.pipe(
          map(finalizedIds => {
            return deliveryKeys.map(deliveryKey => {
              const info = deliveryMap.get(deliveryKey)!;
              return {
                deliveryId: deliveryKey,
                title: info.title,
                actionCount: info.count,
                isFinalized: info.numericDeliveryId != null ? finalizedIds.has(info.numericDeliveryId) : false,
                cnpj: info.cnpj
              };
            });
          })
        );
      }),
      catchError(error => {
        console.error('Error fetching process list:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.processListCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get list of unique CNPJs from player's action_log WITH action count and process count
   * Returns CNPJ, action count, and unique process count (delivery_id) for each CNPJ
   * Uses userId field and time field with Funifier relative dates
   * Cached with shareReplay to avoid duplicate requests
   */
  getPlayerCnpjListWithCount(playerId: string, month?: Date): Observable<{ cnpj: string; actionCount: number; processCount: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_cnpj_list_count`;
    const cached = this.getCachedData(this.cnpjListWithCountCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    // First query: get action count per deal (attributes.deal string or array)
    const actionCountBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      ...ATTRIBUTES_DEAL_UNWIND_STAGES,
      {
        $group: {
          _id: '$dealValues',
          count: { $sum: 1 }
        }
      }
    ];

    // Second query: get unique process count (delivery_id) per deal
    const processCountBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate },
          'attributes.delivery_id': { $ne: null }
        }
      },
      ...ATTRIBUTES_DEAL_UNWIND_STAGES,
      {
        $group: {
          _id: {
            cnpj: '$dealValues',
            delivery_id: '$attributes.delivery_id'
          }
        }
      },
      {
        $group: {
          _id: '$_id.cnpj',
          processCount: { $sum: 1 }
        }
      }
    ];
    const request$ = forkJoin([
      this.funifierApi.post<{ _id: string; count: number }[]>(
        '/v3/database/action_log/aggregate?strict=true',
        actionCountBody
      ),
      this.funifierApi.post<{ _id: string; processCount: number }[]>(
        '/v3/database/action_log/aggregate?strict=true',
        processCountBody
      )
    ]).pipe(
      map(([actionResponse, processResponse]) => {
        // Create a map of CNPJ to process count
        const processCountMap = new Map<string, number>();
        processResponse
          .filter(r => r._id != null)
          .forEach(r => processCountMap.set(r._id, r.processCount));
        
        // Combine action count with process count
        return actionResponse
          .filter(r => r._id != null)
          .map(r => ({
            cnpj: r._id,
            actionCount: r.count,
            processCount: processCountMap.get(r._id) || 0
          }));
      }),
      catchError(error => {
        console.error('Error fetching player CNPJs with count:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.cnpjListWithCountCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get list of unique CNPJs from player's action_log
   * Uses userId field and time field with Funifier relative dates
   */
  getPlayerCnpjList(playerId: string, month?: Date): Observable<string[]> {
    return this.getPlayerCnpjListWithCount(playerId, month).pipe(
      map(items => items.map(i => i.cnpj))
    );
  }

  /**
   * Get all actions for a specific CNPJ (by all players)
   * Uses time field with Funifier relative dates
   * Cached with shareReplay to avoid duplicate requests
   */
  getActionsByCnpj(cnpj: string, month?: Date): Observable<ClienteActionItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${cnpj}_${dayjs(targetMonth).format('YYYY-MM')}_actions_by_cnpj`;
    const cached = this.getCachedData(this.actionsByCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    // Use Funifier's relative date syntax
    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          'attributes.deal': cnpj,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      { $sort: { time: -1 } },
      { $limit: 100 }
    ];
    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      switchMap(actions => forkJoin({
        achievementPoints: this.getAchievementPointsByActions(actions),
        templatePoints: this.getPointsByActionTemplate(actions)
      }).pipe(
        map(({ achievementPoints, templatePoints }) => {
          return actions.map(a => {
            // Determine status based on action data
            let status: 'finalizado' | 'pendente' | 'dispensado' | undefined;

            // Some deployments encode completion inside attributes.stage (instead of extra.processed/status).
            const stageForStatusRaw = a.attributes?.['stage'];
            const stageForStatus =
              typeof stageForStatusRaw === 'string' ? stageForStatusRaw.trim().toLowerCase() : '';
            const hasStage = stageForStatus.length > 0;
            const stageIndicatesFinalizado =
              stageForStatus === 'done' ||
              stageForStatus === 'delivered' ||
              stageForStatus === 'finalizado' ||
              stageForStatus === 'finalizada' ||
              stageForStatus.includes('finaliz') ||
              stageForStatus.includes('entreg') ||
              stageForStatus.includes('conclu');
            
            // Check if action is dismissed (highest priority)
            if (a.extra?.['dismissed'] === true || a.attributes?.['dismissed'] === true || a.status === 'CANCELLED') {
              status = 'dispensado';
            }
            // Check if action is completed/finalized
            else if (a.extra?.processed === true || 
                     a.status === 'DONE' || 
                     a.status === 'DELIVERED' ||
                     a.actionId === 'desbloquear' ||
                     stageIndicatesFinalizado ||
                     hasStage) {
              status = 'finalizado';
            }
            // Check if action is pending or in progress
            else if (a.status === 'PENDING' || 
                     a.status === 'DOING' || 
                     a.status === 'INCOMPLETE' ||
                     !a.status) {
              status = 'pendente';
            }
            // Default to pendente if status is unknown
            else {
              status = 'pendente';
            }
            
            const stageFromAttributes = a.attributes?.['stage'];
            const acaoFromAttributes = a.attributes?.['acao'];
            const title =
              (typeof stageFromAttributes === 'string' && stageFromAttributes.trim() !== '')
                ? stageFromAttributes
                : (typeof acaoFromAttributes === 'string' && acaoFromAttributes.trim() !== '')
                  ? acaoFromAttributes
                  : (a.action_title || a.actionId || 'Ação sem título');

            const pointsInfo = achievementPoints.get(a._id);
            const templatePts = templatePoints.get(a._id);

            return {
              id: a._id,
              title,
              player: a.userId || '',
              created: extractTimestamp(a.time as number | { $date: string } | undefined),
              status,
              cnpj: normalizeAttributesDealToString(a.attributes?.['deal']),
              points: templatePts ?? pointsInfo?.total ?? 0,
              pointsLocked: pointsInfo?.locked ?? false
            };
          });
        })
      )),
      catchError(error => {
        console.error('Error fetching actions by CNPJ:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.actionsByCnpjCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get cliente list with actions for carteira section
   */
  getCarteiraClientes(playerId: string, month?: Date): Observable<ClienteListItem[]> {
    return this.getPlayerCnpjList(playerId, month).pipe(
      switchMap(cnpjs => {
        if (cnpjs.length === 0) {
          return of([]);
        }

        // Fetch actions for each CNPJ
        const requests = cnpjs.map(cnpj => 
          this.getActionsByCnpj(cnpj, month).pipe(
            map(actions => ({ cnpj, actions }))
          )
        );

        return forkJoin(requests);
      }),
      catchError(error => {
        console.error('Error fetching carteira clientes:', error);
        return of([]);
      })
    );
  }

  /**
   * Get activities for a specific process (delivery_id)
   * Returns list of activities for the given delivery_id
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByProcess(deliveryId: number, playerId: string, month?: Date): Observable<ActivityListItem[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${deliveryId}_${dayjs(targetMonth).format('YYYY-MM')}_activities_by_process`;
    const cached = this.getCachedData(this.activitiesByProcessCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(month, 'start');
    const endDate = getRelativeDateExpression(month, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          'attributes.delivery_id': deliveryId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      { $sort: { time: -1 } }
    ];
    const request$ = this.funifierApi.post<ActionLogEntry[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(actions => {
        return actions.map(a => {
          // Determine status based on action data
          let status: 'finalizado' | 'pendente' | 'dispensado' | undefined;

          const stageForStatusRaw = a.attributes?.['stage'];
          const stageForStatus =
            typeof stageForStatusRaw === 'string' ? stageForStatusRaw.trim().toLowerCase() : '';
          const hasStage = stageForStatus.length > 0;
          const stageIndicatesFinalizado =
            stageForStatus === 'done' ||
            stageForStatus === 'delivered' ||
            stageForStatus === 'finalizado' ||
            stageForStatus === 'finalizada' ||
            stageForStatus.includes('finaliz') ||
            stageForStatus.includes('entreg') ||
            stageForStatus.includes('conclu');
          
          // Check if action is dismissed (highest priority)
          if (a.extra?.['dismissed'] === true || a.attributes?.['dismissed'] === true || a.status === 'CANCELLED') {
            status = 'dispensado';
          }
          // Check if action is completed/finalized
          else if (a.extra?.processed === true || 
                   a.status === 'DONE' || 
                   a.status === 'DELIVERED' ||
                   a.actionId === 'desbloquear' ||
                   stageIndicatesFinalizado ||
                   hasStage) {
            status = 'finalizado';
          }
          // Check if action is pending or in progress
          else if (a.status === 'PENDING' || 
                   a.status === 'DOING' || 
                   a.status === 'INCOMPLETE' ||
                   !a.status) {
            status = 'pendente';
          }

          const stageFromAttributes = a.attributes?.['stage'];
          const acaoFromAttributes = a.attributes?.['acao'];
          const title =
            (typeof stageFromAttributes === 'string' && stageFromAttributes.trim() !== '')
              ? stageFromAttributes
              : (typeof acaoFromAttributes === 'string' && acaoFromAttributes.trim() !== '')
                ? acaoFromAttributes
                : (a.action_title || a.actionId || 'Ação sem título');

          return {
            id: a._id,
            title,
            points: a.points || 0,
            created: extractTimestamp(a.time as number | { $date: string } | undefined),
            player: a.userId || '',
            status,
            cnpj: normalizeAttributesDealToString(a.attributes?.['deal'])
          };
        });
      }),
      catchError(error => {
        console.error('Error fetching activities by process:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.activitiesByProcessCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get activities count grouped by day of the month
   * Returns an array with count for each day of the month
   * Cached with shareReplay to avoid duplicate requests
   */
  getActivitiesByDay(playerId: string, month?: Date): Observable<{ day: number; count: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `${playerId}_${dayjs(targetMonth).format('YYYY-MM')}_activities_by_day`;
    const cached = this.getCachedData(this.activitiesByDayCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

    const aggregateBody = [
      {
        $match: {
          userId: playerId,
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $addFields: {
          timeAsDate: {
            $cond: {
              if: { $eq: [{ $type: '$time' }, 'number'] },
              then: { $toDate: '$time' },
              else: {
                $cond: {
                  if: { $eq: [{ $type: '$time' }, 'object'] },
                  then: { $toDate: '$time.$date' },
                  else: { $toDate: '$time' }
                }
              }
            }
          }
        }
      },
      {
        $project: {
          day: { $dayOfMonth: '$timeAsDate' }
        }
      },
      {
        $group: {
          _id: '$day',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];
    const request$ = this.funifierApi.post<{ _id: number; count: number }[]>(
      '/v3/database/action_log/aggregate?strict=true',
      aggregateBody
    ).pipe(
      map(response => {
        const result = response.map(r => ({ day: r._id, count: r.count }));
        return result;
      }),
      catchError(error => {
        console.error('Error fetching activities by day:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.activitiesByDayCache, cacheKey, request$);
    return request$;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.actionLogCache.clear();
    this.metricsCache.clear();
    this.activityCountCache.clear();
    this.uniqueClientesCache.clear();
    this.uniqueDealsCache.clear();
    this.cnpjListWithCountCache.clear();
    this.activitiesByDayCache.clear();
    this.activitiesByProcessCache.clear();
    this.processListCache.clear();
    this.processFinalizationCache.clear();
    this.actionsByCnpjCache.clear();
    this.processMetricsCache.clear();
    this.pontosForMonthCache.clear();
    this.monthlyPointsBreakdownCache.clear();
    this.teamMetricsCache.clear();
    this.teamCnpjCache.clear();
    this.teamPointsBreakdownCache.clear();
  }

  // ============================================
  // TEAM AGGREGATE METHODS (OPTIMIZED)
  // These methods use $lookup to fetch data for all team members in a single query
  // ============================================

  private teamMetricsCache = new Map<string, CacheEntry<any>>();
  private teamCnpjCache = new Map<string, CacheEntry<any>>();
  private teamPointsBreakdownCache = new Map<string, CacheEntry<any>>();

  /**
   * Get progress metrics for all team members in a single aggregate query.
   * Uses $lookup to join player data and filter by team.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering
   * @returns Observable of aggregated metrics for the team
   */
  getTeamProgressMetrics(teamId: string, month?: Date): Observable<{ activity: ActivityMetrics; processo: ProcessMetrics }> {
    const targetMonth = month || new Date();
    const cacheKey = `team_metrics_${teamId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.teamMetricsCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

    // Single aggregate query to get all action counts for the team
    const activityAggregateBody = [
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
          time: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $count: 'total'
      }
    ];

    // Query for process metrics (desbloquear actions = finalized processes)
    const processAggregateBody = [
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
          time: { $gte: startDate, $lte: endDate },
          actionId: 'desbloquear'
        }
      },
      {
        $group: {
          _id: '$attributes.delivery'
        }
      },
      {
        $count: 'finalizados'
      }
    ];

    // Query for unique processes (delivery_id) to calculate incomplete
    const uniqueProcessesBody = [
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
          time: { $gte: startDate, $lte: endDate },
          'attributes.delivery_id': { $ne: null }
        }
      },
      {
        $group: {
          _id: '$attributes.delivery_id'
        }
      },
      {
        $count: 'total'
      }
    ];
    const request$ = forkJoin([
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', activityAggregateBody),
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', processAggregateBody),
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', uniqueProcessesBody)
    ]).pipe(
      map(([activityResult, processResult, uniqueProcessResult]) => {
        const finalizadas = activityResult[0]?.total || 0;
        const processosFinalizados = processResult[0]?.finalizados || 0;
        const totalProcessos = uniqueProcessResult[0]?.total || 0;
        const processosIncompletos = Math.max(0, totalProcessos - processosFinalizados);
        return {
          activity: {
            pendentes: 0,
            emExecucao: 0,
            finalizadas,
            pontos: 0 // Points are loaded separately
          },
          processo: {
            pendentes: 0,
            incompletas: processosIncompletos,
            finalizadas: processosFinalizados
          }
        };
      }),
      catchError(error => {
        console.error('Error fetching team progress metrics:', error);
        return of({
          activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
          processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamMetricsCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get CNPJ list with action counts for all team members in a single aggregate query.
   * Uses $lookup to join player data and filter by team.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering
   * @returns Observable of CNPJ list with action and process counts
   */
  getTeamCnpjListWithCount(teamId: string, month?: Date): Observable<{ cnpj: string; actionCount: number; processCount: number }[]> {
    const targetMonth = month || new Date();
    const cacheKey = `team_cnpj_${teamId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.teamCnpjCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

    // Single aggregate query to get action count per CNPJ for the team
    const actionCountBody = [
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
          time: { $gte: startDate, $lte: endDate }
        }
      },
      ...ATTRIBUTES_DEAL_UNWIND_STAGES,
      {
        $group: {
          _id: '$dealValues',
          count: { $sum: 1 }
        }
      }
    ];

    // Single aggregate query to get unique process count per CNPJ for the team
    const processCountBody = [
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
          time: { $gte: startDate, $lte: endDate },
          'attributes.delivery_id': { $ne: null }
        }
      },
      ...ATTRIBUTES_DEAL_UNWIND_STAGES,
      {
        $group: {
          _id: {
            cnpj: '$dealValues',
            delivery_id: '$attributes.delivery_id'
          }
        }
      },
      {
        $group: {
          _id: '$_id.cnpj',
          processCount: { $sum: 1 }
        }
      }
    ];
    const request$ = forkJoin([
      this.funifierApi.post<{ _id: string; count: number }[]>('/v3/database/action_log/aggregate?strict=true', actionCountBody),
      this.funifierApi.post<{ _id: string; processCount: number }[]>('/v3/database/action_log/aggregate?strict=true', processCountBody)
    ]).pipe(
      map(([actionResponse, processResponse]) => {
        // Create a map of CNPJ to process count
        const processCountMap = new Map<string, number>();
        processResponse
          .filter(r => r._id != null)
          .forEach(r => processCountMap.set(r._id, r.processCount));

        // Combine action count with process count
        const result = actionResponse
          .filter(r => r._id != null)
          .map(r => ({
            cnpj: r._id,
            actionCount: r.count,
            processCount: processCountMap.get(r._id) || 0
          }));
        return result;
      }),
      catchError(error => {
        console.error('Error fetching team CNPJ list:', error);
        return of([]);
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamCnpjCache, cacheKey, request$);
    return request$;
  }

  /**
   * Get monthly points breakdown (bloqueados and desbloqueados) for all team members.
   * Uses aggregate query on achievement collection with player lookup.
   * 
   * @param teamId - Team ID (e.g., 'pessoal--rn--andreza-soares')
   * @param month - Target month for filtering
   * @returns Observable of points breakdown
   */
  getTeamMonthlyPointsBreakdown(teamId: string, month?: Date): Observable<{ bloqueados: number; desbloqueados: number }> {
    const targetMonth = month || new Date();
    const cacheKey = `team_points_breakdown_${teamId}_${dayjs(targetMonth).format('YYYY-MM')}`;
    const cached = this.getCachedData(this.teamPointsBreakdownCache, cacheKey);
    if (cached) {
      return cached;
    }

    const startDate = getRelativeDateExpression(targetMonth, 'start');
    const endDate = getRelativeDateExpression(targetMonth, 'end');

    // Query for bloqueados (locked points) - actions that are NOT desbloquear
    const bloqueadosBody = [
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
          time: { $gte: startDate, $lte: endDate },
          actionId: { $ne: 'desbloquear' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$points', 0] } }
        }
      }
    ];

    // Query for desbloqueados (unlocked points) - desbloquear actions
    const desbloqueadosBody = [
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
          time: { $gte: startDate, $lte: endDate },
          actionId: 'desbloquear'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$points', 0] } }
        }
      }
    ];
    const request$ = forkJoin([
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', bloqueadosBody),
      this.funifierApi.post<any[]>('/v3/database/action_log/aggregate?strict=true', desbloqueadosBody)
    ]).pipe(
      map(([bloqueadosResult, desbloqueadosResult]) => {
        const bloqueados = Math.floor(bloqueadosResult[0]?.total || 0);
        const desbloqueados = Math.floor(desbloqueadosResult[0]?.total || 0);
        return { bloqueados, desbloqueados };
      }),
      catchError(error => {
        console.error('Error fetching team monthly points breakdown:', error);
        return of({ bloqueados: 0, desbloqueados: 0 });
      }),
      shareReplay({ bufferSize: 1, refCount: true, windowTime: this.CACHE_DURATION })
    );

    this.setCachedData(this.teamPointsBreakdownCache, cacheKey, request$);
    return request$;
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
