import { Injectable } from '@angular/core';
import { SystemParamsService } from './system-params.service';
import { AliasService } from './alias.service';
import { GoalsConfigService } from './goals-config.service';
import { SeasonDatesService } from './season-dates.service';
import { FeaturesService } from './features.service';
import { CampaignService } from './campaign.service';

/**
 * Interface que define o status de inicializaÃ§Ã£o de todos os serviÃ§os
 */
export interface SystemInitStatus {
  systemParams: boolean;
  aliases: boolean;
  goalsConfig: boolean;
  seasonDates: boolean;
  features: boolean;
  campaign: boolean;
  allReady: boolean;
}

/**
 * ServiÃ§o centralizador responsÃ¡vel por inicializar todos os parÃ¢metros do sistema
 * de forma otimizada, garantindo que apenas uma requisiÃ§Ã£o seja feita para o endpoint
 */
@Injectable({
  providedIn: 'root'
})
export class SystemInitService {
  private initPromise: Promise<SystemInitStatus> | null = null;
  private initStatus: SystemInitStatus = {
    systemParams: false,
    aliases: false,
    goalsConfig: false,
    seasonDates: false,
    features: false,
    campaign: false,
    allReady: false
  };

  constructor(
    private systemParamsService: SystemParamsService,
    private aliasService: AliasService,
    private goalsConfigService: GoalsConfigService,
    private seasonDatesService: SeasonDatesService,
    private featuresService: FeaturesService,
    private campaignService: CampaignService
  ) {}

  /**
   * Inicializa todos os parÃ¢metros do sistema de forma otimizada
   * Garante que apenas uma requisiÃ§Ã£o seja feita para o endpoint client/system-params
   */
  async initializeAll(): Promise<SystemInitStatus> {
    // Se jÃ¡ estÃ¡ inicializando, retorna a promise existente
    if (this.initPromise) {
      return this.initPromise;
    }

    // Se jÃ¡ foi inicializado, retorna o status
    if (this.initStatus.allReady) {
      return this.initStatus;
    }

    this.initPromise = this.performInitialization();

    try {
      this.initStatus = await this.initPromise;
      return this.initStatus;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Executa a inicializaÃ§Ã£o real de todos os serviÃ§os
   */
  private async performInitialization(): Promise<SystemInitStatus> {
    
    try {
      // 1. Inicializa o SystemParamsService primeiro (faz a Ãºnica requisiÃ§Ã£o)
      await this.systemParamsService.initializeSystemParams();
      this.initStatus.systemParams = true;

      // 2. Inicializa todos os outros serviÃ§os em paralelo
      const [aliases, goalsConfig, seasonDates, features, campaign] = await Promise.all([
        this.aliasService.loadAliases(),
        this.goalsConfigService.loadGoalsConfig(),
        this.seasonDatesService.getSeasonDates(),
        this.featuresService.initializeFeatures(),
        this.campaignService.getCurrentCampaign()
      ]);

      this.initStatus.aliases = true;
      this.initStatus.goalsConfig = true;
      this.initStatus.seasonDates = true;
      this.initStatus.features = true;
      this.initStatus.campaign = true;
      this.initStatus.allReady = true;



      return this.initStatus;
    } catch (error) {
      console.error('âŒ Erro durante a inicializaÃ§Ã£o dos parÃ¢metros do sistema:', error);
      
      // Retorna o status atual mesmo com erro
      return this.initStatus;
    }
  }

  /**
   * Verifica se todos os serviÃ§os estÃ£o prontos
   */
  isAllReady(): boolean {
    return this.initStatus.allReady;
  }

  /**
   * ObtÃ©m o status atual de inicializaÃ§Ã£o
   */
  getInitStatus(): SystemInitStatus {
    return { ...this.initStatus };
  }

  /**
   * Verifica se estÃ¡ carregando
   */
  isLoading(): boolean {
    return this.initPromise !== null;
  }

  /**
   * Limpa o cache de todos os serviÃ§os
   */
  clearAllCache(): void {
    this.systemParamsService.clearCache();
    this.aliasService.clearCache();
    this.goalsConfigService.clearCache();
    this.seasonDatesService.clearCache();
    this.campaignService.clearCache();
    // FeaturesService nÃ£o tem cache para limpar
    
    this.initStatus = {
      systemParams: false,
      aliases: false,
      goalsConfig: false,
      seasonDates: false,
      features: false,
      campaign: false,
      allReady: false
    };
    this.initPromise = null;
    
    }

  /**
   * Recarrega todos os parÃ¢metros
   */
  async reloadAll(): Promise<SystemInitStatus> {
    this.clearAllCache();
    return this.initializeAll();
  }
} 