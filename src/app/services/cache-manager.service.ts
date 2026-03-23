import { Injectable } from '@angular/core';
import { ActionLogService } from './action-log.service';
import { PlayerService } from './player.service';
import { CompanyKpiService } from './company-kpi.service';
import { CompanyService } from './company.service';
import { KPIService } from './kpi.service';
import { TeamStatsCacheService } from './team-stats-cache.service';
import { TeamAggregateService } from './team-aggregate.service';
import { ACLService } from './acl.service';
import { AcessoService } from './acesso.service';
import { CampaignService } from './campaign.service';
import { AliasService } from './alias.service';
import { GoalsConfigService } from './goals-config.service';
import { RankingService } from './ranking.service';
import { HelpTextsService } from './help-texts.service';
import { FeaturesService } from './features.service';

/**
 * Centralized cache management service.
 * 
 * Clears all application caches on login/logout to prevent
 * stale data from persisting between user sessions.
 */
@Injectable({
  providedIn: 'root'
})
export class CacheManagerService {
  constructor(
    private actionLogService: ActionLogService,
    private playerService: PlayerService,
    private companyKpiService: CompanyKpiService,
    private companyService: CompanyService,
    private kpiService: KPIService,
    private teamStatsCacheService: TeamStatsCacheService,
    private teamAggregateService: TeamAggregateService,
    private aclService: ACLService,
    private acessoService: AcessoService,
    private campaignService: CampaignService,
    private aliasService: AliasService,
    private goalsConfigService: GoalsConfigService,
    private rankingService: RankingService,
    private helpTextsService: HelpTextsService,
    private featuresService: FeaturesService
  ) {}

  /**
   * Clear all application caches.
   * Call this on login and logout to ensure fresh data.
   */
  clearAllCaches(): void {
    console.log('🧹 Clearing all application caches...');
    
    try {
      // Action log caches (13 different caches)
      this.actionLogService.clearCache();
      
      // Player data cache
      this.playerService.clearCache();
      
      // Company KPI cache
      this.companyKpiService.clearCache();
      
      // Company list and details cache
      this.companyService.clearCache();
      
      // KPI cache (player and company)
      this.kpiService.clearCache();
      
      // Team stats cache
      this.teamStatsCacheService.clearAllCache();
      
      // Team aggregate cache
      this.teamAggregateService.clearCache();
      
      // ACL cache (permissions)
      this.aclService.clearCache();
      
      // Acesso service cache (times and colaboradores)
      this.acessoService.clearAllCache();
      
      // Campaign cache
      this.campaignService.clearCache();
      
      // Alias cache
      this.aliasService.clearCache();
      
      // Goals config cache
      this.goalsConfigService.clearCache();
      
      // Ranking cache
      this.rankingService.clearCache();
      
      // Help texts cache
      this.helpTextsService.clearCache();
      
      // Features cache
      this.featuresService.clearCache();
      
      console.log('✅ All caches cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing caches:', error);
    }
  }

  /**
   * Clear localStorage items related to user session.
   */
  clearLocalStorage(): void {
    console.log('🧹 Clearing localStorage...');
    
    // Clear Funifier user
    localStorage.removeItem('funifier_user');
    
    // Clear session timestamp
    localStorage.removeItem('session_login_timestamp');
    
    console.log('✅ localStorage cleared');
  }

  /**
   * Full cleanup - clears all caches and storage.
   * Use this on logout or when switching users.
   */
  fullCleanup(): void {
    this.clearAllCaches();
    this.clearLocalStorage();
  }
}
