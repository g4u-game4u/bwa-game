import { Injectable } from '@angular/core';
import { SystemParamsService } from './system-params.service';
import { BehaviorSubject, Observable } from 'rxjs';

export interface SystemFeatures {
  // Update Notes
  enableUpdateNotes: boolean;
  
  // Mascot
  enableMascot: boolean;
  mascotImgUrl: string | null;
  
  // Gamification
  enableLevels: boolean;
  enableAchievements: boolean;
  enableLeaderboards: boolean;
  enableChallenges: boolean;
  enableCashDistribution: boolean;
  enableFreeChallenge: boolean;
  
  // Social & Store
  enableSocialFeatures: boolean;
  enableVirtualStore: boolean;
  
  // Language & Localization
  languageMultilingual: boolean;
  defaultLanguage: string;
  
  // Theme
  allowThemeSwitch: boolean;
  defaultTheme: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeaturesService {
  private featuresSubject = new BehaviorSubject<SystemFeatures | null>(null);
  public features$ = this.featuresSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.isLoadingSubject.asObservable();

  constructor(private systemParamsService: SystemParamsService) {}

  /**
   * Inicializa as funcionalidades do sistema
   */
  async initializeFeatures(): Promise<void> {
    try {
      this.isLoadingSubject.next(true);
      
      const systemParams = await this.systemParamsService.getSystemParams();
      
      const features: SystemFeatures = {
        // Update Notes
        enableUpdateNotes: this.getBooleanParam(systemParams, 'enable_update_notes'),
        
        // Mascot
        enableMascot: this.getBooleanParam(systemParams, 'enable_mascot'),
        mascotImgUrl: this.getStringParam(systemParams, 'mascot_img_url'),
        
        // Gamification
        enableLevels: this.getBooleanParam(systemParams, 'enable_levels_and_status'),
        enableAchievements: this.getBooleanParam(systemParams, 'enable_achievements'),
        enableLeaderboards: this.getBooleanParam(systemParams, 'enable_leaderboards'),
        enableChallenges: this.getBooleanParam(systemParams, 'enable_challenges'),
        enableCashDistribution: this.getBooleanParam(systemParams, 'enable_goals_and_cash_distribution'),
        enableFreeChallenge: this.getBooleanParam(systemParams, 'enable_free_challenges'),

        // Social & Store
        enableSocialFeatures: this.getBooleanParam(systemParams, 'enable_social_features'),
        enableVirtualStore: this.getBooleanParam(systemParams, 'enable_virtual_store'),
        
        // Language & Localization
        languageMultilingual: this.getBooleanParam(systemParams, 'language_multilingual'),
        defaultLanguage: this.getStringParam(systemParams, 'default_language') || 'pt-br',
        
        // Theme
        allowThemeSwitch: this.getBooleanParam(systemParams, 'allow_theme_switch'),
        defaultTheme: this.getStringParam(systemParams, 'default_theme') || 'dark'
      };

      this.featuresSubject.next(features);
    } catch (error) {
      console.error('Erro ao carregar funcionalidades do sistema:', error);
      this.featuresSubject.next(this.getDefaultFeatures());
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  /**
   * Obtém as funcionalidades atuais
   */
  getFeatures(): SystemFeatures | null {
    return this.featuresSubject.value;
  }

  /**
   * Obtém as funcionalidades como Observable
   */
  getFeaturesObservable(): Observable<SystemFeatures | null> {
    return this.features$;
  }

  /**
   * Verifica se uma funcionalidade específica está habilitada
   */
  isFeatureEnabled(feature: keyof SystemFeatures): boolean {
    const features = this.getFeatures();
    if (!features) return false;
    
    return features[feature] as boolean;
  }

  /**
   * Obtém o valor de uma funcionalidade específica
   */
  getFeatureValue<T>(feature: keyof SystemFeatures): T | null {
    const features = this.getFeatures();
    if (!features) return null;
    
    return features[feature] as T;
  }

  // Métodos específicos para funcionalidades comuns

  /**
   * Verifica se as notas de atualização estão habilitadas
   */
  isUpdateNotesEnabled(): boolean {
    return this.isFeatureEnabled('enableUpdateNotes');
  }

  /**
   * Verifica se a mascote está habilitada
   */
  isMascotEnabled(): boolean {
    return this.isFeatureEnabled('enableMascot');
  }

  /**
   * Obtém a URL da imagem da mascote
   */
  getMascotImageUrl(): string | null {
    return this.getFeatureValue<string>('mascotImgUrl');
  }

  /**
   * Verifica se os níveis estão habilitados
   */
  isLevelsEnabled(): boolean {
    return this.isFeatureEnabled('enableLevels');
  }

  /**
   * Verifica se os achievements estão habilitados
   */
  isAchievementsEnabled(): boolean {
    return this.isFeatureEnabled('enableAchievements');
  }

  /**
   * Verifica se os leaderboards estão habilitados
   */
  isLeaderboardsEnabled(): boolean {
    return this.isFeatureEnabled('enableLeaderboards');
  }

  /**
   * Verifica se os desafios estão habilitados
   */
  isChallengesEnabled(): boolean {
    return this.isFeatureEnabled('enableChallenges');
  }

  isFreeChallengeEnabled(): boolean {
    return this.isFeatureEnabled('enableFreeChallenge');
  }

  /**
   * Verifica se as funcionalidades sociais estão habilitadas
   */
  isSocialFeaturesEnabled(): boolean {
    return this.isFeatureEnabled('enableSocialFeatures');
  }

  /**
   * Verifica se a loja virtual está habilitada
   */
  isVirtualStoreEnabled(): boolean {
    return this.isFeatureEnabled('enableVirtualStore');
  }

  /**
   * Verifica se a distribuição de cash está habilitada
   */
  isCashDistributionEnabled(): boolean {
    return this.isFeatureEnabled('enableCashDistribution');
  }

  /**
   * Verifica se o sistema é multilíngue
   */
  isMultilingual(): boolean {
    return this.isFeatureEnabled('languageMultilingual');
  }

  /**
   * Obtém o idioma padrão
   */
  getDefaultLanguage(): string {
    return this.getFeatureValue<string>('defaultLanguage') || 'pt-br';
  }

  /**
   * Verifica se a troca de tema está permitida
   */
  isThemeSwitchAllowed(): boolean {
    return this.isFeatureEnabled('allowThemeSwitch');
  }

  /**
   * Obtém o tema padrão
   */
  getDefaultTheme(): string {
    return this.getFeatureValue<string>('defaultTheme') || 'dark';
  }

  /**
   * Verifica se o sistema está carregando
   */
  isLoading(): boolean {
    return this.isLoadingSubject.value;
  }

  /**
   * Obtém o estado de carregamento como Observable
   */
  getLoadingObservable(): Observable<boolean> {
    return this.isLoading$;
  }

  // Métodos privados auxiliares

  private getBooleanParam(systemParams: any, paramName: string): boolean {
    try {
      const param = systemParams[paramName];
      return param?.value === true;
    } catch {
      return false;
    }
  }

  private getStringParam(systemParams: any, paramName: string): string | null {
    try {
      const param = systemParams[paramName];
      return param?.value || null;
    } catch {
      return null;
    }
  }

  private getDefaultFeatures(): SystemFeatures {
    return {
      enableUpdateNotes: false,
      enableMascot: false,
      mascotImgUrl: null,
      enableLevels: false,
      enableAchievements: false,
      enableLeaderboards: false,
      enableChallenges: false,
      enableCashDistribution: false,
      enableFreeChallenge: false,
      enableSocialFeatures: false,
      enableVirtualStore: false,
      languageMultilingual: false,
      defaultLanguage: 'pt-br',
      allowThemeSwitch: false,
      defaultTheme: 'dark'
    };
  }
} 