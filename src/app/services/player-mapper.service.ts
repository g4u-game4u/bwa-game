import { Injectable } from '@angular/core';
import { PlayerStatus, PointWallet, SeasonProgress, PlayerMetadata } from '@model/gamification-dashboard.model';

@Injectable({
  providedIn: 'root'
})
export class PlayerMapper {
  /**
   * Map Funifier API response to PlayerStatus model
   * Based on actual /v3/player/me/status response structure
   */
  toPlayerStatus(apiResponse: any): PlayerStatus {
    const levelProgress = apiResponse.level_progress || {};
    const nextLevel = levelProgress.next_level || {};
    
    return {
      _id: apiResponse._id || '',
      name: apiResponse.name || '',
      email: apiResponse._id || '', // _id is the email in Funifier
      level: nextLevel.position || 0,
      seasonLevel: nextLevel.position || 0,
      levelName: nextLevel.level || '',
      percentCompleted: levelProgress.percent_completed || 0,
      metadata: this.extractMetadata(apiResponse),
      created: apiResponse.created || Date.now(),
      updated: apiResponse.updated || Date.now()
    };
  }

  /**
   * Extract player metadata from API response
   * Teams info comes from teams array
   */
  private extractMetadata(apiResponse: any): PlayerMetadata {
    const extra = apiResponse.extra || {};
    const teams = apiResponse.teams || [];
    
    // Extract team info if available
    const teamInfo = teams.length > 0 ? teams[0] : {};
    
    return {
      area: extra.area || teamInfo.area || '',
      time: teamInfo.name || extra.time || '',
      squad: extra.squad || teamInfo.squad || '',
      ...extra
    };
  }

  /**
   * Map Funifier API response to PointWallet model
   * API fields from point_categories:
   * - locked_points -> Bloqueados
   * - points -> Desbloqueados  
   * - coins -> Moedas
   */
  toPointWallet(apiResponse: any): PointWallet {
    console.log('📊 Point wallet mapping - FULL API response keys:', Object.keys(apiResponse || {}));
    
    // Get point_categories from response (can be snake_case or camelCase)
    const pointCategories = apiResponse?.point_categories || apiResponse?.pointCategories || {};
    
    console.log('📊 Point wallet mapping - point_categories:', JSON.stringify(pointCategories));
    
    // Extract values from point_categories
    const bloqueados = Number(pointCategories.locked_points) || Number(pointCategories.lockedPoints) || 0;
    const desbloqueados = Number(pointCategories.points) || 0;
    const moedas = Number(pointCategories.coins) || 0;
    
    console.log('📊 Point wallet FINAL result:', { bloqueados, desbloqueados, moedas });
    
    return {
      bloqueados,
      desbloqueados,
      moedas
    };
  }

  /**
   * Map Funifier API response to SeasonProgress model
   * Note: clientes count will be populated separately from action_log aggregate
   * - metas: will be populated separately from metric_targets__c
   * - tarefasFinalizadas: will be populated from action_log aggregate
   */
  toSeasonProgress(apiResponse: any, seasonDates: { start: Date; end: Date }): SeasonProgress {
    // Note: clientes is now calculated from unique CNPJs in action_log
    // This will be populated by the component using ActionLogService.getUniqueClientesCount()
    
    return {
      metas: {
        current: 0, // Will be populated from KPI data
        target: 0   // Will be populated from metric_targets__c
      },
      clientes: 0, // Will be populated from action_log unique CNPJs
      tarefasFinalizadas: 0, // Will be populated from action_log aggregate
      seasonDates
    };
  }

  /**
   * Count values in a string separated by ; or ,
   */
  private countSeparatedValues(str: string): number {
    if (!str || typeof str !== 'string') return 0;
    
    // Split by ; or , and filter out empty values
    const values = str.split(/[;,]/)
      .map(v => v.trim())
      .filter(v => v.length > 0);
    
    return values.length;
  }

  /**
   * Parse KPI values from extra.kpi string
   * Returns array of numbers in order
   */
  parseKpiValues(kpiString: string): number[] {
    if (!kpiString || typeof kpiString !== 'string') return [];
    
    return kpiString.split(/[;,]/)
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => parseFloat(v) || 0);
  }

  /**
   * Parse companies from extra.companies string
   * Returns array of company identifiers
   */
  parseCompanies(companiesString: string): string[] {
    if (!companiesString || typeof companiesString !== 'string') return [];
    
    return companiesString.split(/[;,]/)
      .map(v => v.trim())
      .filter(v => v.length > 0);
  }
}
