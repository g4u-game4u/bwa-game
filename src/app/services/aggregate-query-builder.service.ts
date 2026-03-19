import { Injectable } from '@angular/core';

/**
 * Represents a MongoDB aggregate pipeline stage
 */
export interface AggregateStage {
  $match?: any;
  $group?: any;
  $project?: any;
  $sort?: any;
  $limit?: number;
}

/**
 * Represents a complete MongoDB aggregate query
 */
export interface AggregateQuery {
  aggregate: AggregateStage[];
}

/**
 * Service for building MongoDB aggregate pipeline queries for Funifier API.
 * 
 * This service constructs aggregate queries to fetch team performance data,
 * including points, progress metrics, and historical graph data.
 * 
 * Uses Funifier relative date expressions:
 * - "-0M-" = start of current month
 * - "-0M+" = end of current month
 * - "-7d-" = 7 days ago
 * - "-0d+" = end of today
 */
@Injectable({
  providedIn: 'root'
})
export class AggregateQueryBuilderService {

  constructor() { }

  /**
   * Build aggregate query to sum team points from achievement collection.
   * 
   * Aggregates total points, blocked points (locked_points), and unlocked points
   * for a specific team within a date range.
   * 
   * @param teamId - Team/department name to filter by (e.g., "Departamento Pessoal")
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @returns Aggregate query object
   * 
   * @example
   * const query = buildPointsAggregateQuery('Departamento Pessoal', startDate, endDate);
   * // Returns query that groups by null and sums points by type
   */
  buildPointsAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery {
    return {
      aggregate: [
        {
          $match: {
            'extra.team': teamId,
            time: {
              $gte: { $date: this.formatDateForFunifier(startDate) },
              $lte: { $date: this.formatDateForFunifier(endDate) }
            },
            type: 0 // points only
          }
        },
        {
          $group: {
            _id: null,
            totalPoints: { $sum: '$total' },
            blockedPoints: {
              $sum: {
                $cond: [
                  { $eq: ['$item', 'locked_points'] },
                  '$total',
                  0
                ]
              }
            },
            unlockedPoints: {
              $sum: {
                $cond: [
                  { $eq: ['$item', 'unlocked_points'] },
                  '$total',
                  0
                ]
              }
            }
          }
        }
      ]
    };
  }

  /**
   * Build aggregate query to count team progress actions from action_log collection.
   * 
   * Groups actions by actionId and counts occurrences for a specific team
   * within a date range.
   * 
   * @param teamId - Team/department name to filter by
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @returns Aggregate query object
   * 
   * @example
   * const query = buildProgressAggregateQuery('Departamento Pessoal', startDate, endDate);
   * // Returns query that groups by actionId and counts
   */
  buildProgressAggregateQuery(teamId: string, startDate: Date, endDate: Date): AggregateQuery {
    return {
      aggregate: [
        {
          $match: {
            'attributes.team': teamId,
            time: {
              $gte: { $date: this.formatDateForFunifier(startDate) },
              $lte: { $date: this.formatDateForFunifier(endDate) }
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
  }

  /**
   * Build aggregate query for historical graph data with date grouping.
   * 
   * Groups action_log entries by date and actionId, counting occurrences.
   * Supports daily or weekly grouping for trend analysis.
   * 
   * @param teamId - Team/department name to filter by
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @param groupBy - Grouping granularity: 'day' or 'week'
   * @returns Aggregate query object
   * 
   * @example
   * const query = buildGraphDataQuery('Departamento Pessoal', startDate, endDate, 'day');
   * // Returns query that groups by date and actionId with daily granularity
   */
  buildGraphDataQuery(
    teamId: string,
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' = 'day'
  ): AggregateQuery {
    // Date format for grouping: daily or weekly
    const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%U';

    return {
      aggregate: [
        {
          $match: {
            'attributes.team': teamId,
            time: {
              $gte: { $date: this.formatDateForFunifier(startDate) },
              $lte: { $date: this.formatDateForFunifier(endDate) }
            }
          }
        },
        {
          $project: {
            date: {
              $dateToString: {
                format: dateFormat,
                date: { $toDate: '$time' }
              }
            },
            actionId: 1
          }
        },
        {
          $group: {
            _id: {
              date: '$date',
              actionId: '$actionId'
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.date': 1 }
        }
      ]
    };
  }

  /**
   * Build aggregate query to get list of collaborators (team members).
   * 
   * Extracts unique user IDs from action_log for a specific team.
   * 
   * @param teamId - Team/department name to filter by
   * @returns Aggregate query object
   * 
   * @example
   * const query = buildCollaboratorListQuery('Departamento Pessoal');
   * // Returns query that groups by userId to get unique team members
   */
  buildCollaboratorListQuery(teamId: string): AggregateQuery {
    return {
      aggregate: [
        {
          $match: {
            'attributes.team': teamId
          }
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id': 1 }
        }
      ]
    };
  }

  /**
   * Format a Date object for Funifier API queries.
   * 
   * Funifier supports relative date expressions like "-0M-" (start of month)
   * or absolute ISO date strings. This method converts JavaScript Date objects
   * to ISO strings for use in aggregate queries.
   * 
   * @param date - Date to format
   * @returns ISO date string
   * 
   * @example
   * formatDateForFunifier(new Date('2024-01-15'))
   * // Returns "2024-01-15T00:00:00.000Z"
   */
  private formatDateForFunifier(date: Date): string {
    return date.toISOString();
  }

  /**
   * Get Funifier relative date expression for common date ranges.
   * 
   * Funifier supports special date expressions for relative date calculations:
   * - "-0M-" = start of current month
   * - "-0M+" = end of current month
   * - "-1M-" = start of previous month
   * - "-7d-" = 7 days ago
   * - "-0d+" = end of today
   * 
   * @param type - Type of relative date expression
   * @returns Funifier relative date string
   * 
   * @example
   * getRelativeDateExpression('currentMonthStart')
   * // Returns "-0M-"
   */
  getRelativeDateExpression(
    type: 'currentMonthStart' | 'currentMonthEnd' | 'previousMonthStart' | 'previousMonthEnd' | 'today' | 'daysAgo'
  ): string {
    switch (type) {
      case 'currentMonthStart':
        return '-0M-';
      case 'currentMonthEnd':
        return '-0M+';
      case 'previousMonthStart':
        return '-1M-';
      case 'previousMonthEnd':
        return '-1M+';
      case 'today':
        return '-0d+';
      default:
        return '-0M-';
    }
  }

  /**
   * Get Funifier relative date expression for N days ago.
   * 
   * @param days - Number of days ago
   * @returns Funifier relative date string
   * 
   * @example
   * getDaysAgoExpression(7)
   * // Returns "-7d-"
   */
  getDaysAgoExpression(days: number): string {
    return `-${days}d-`;
  }
}
