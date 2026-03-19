import { Component, OnInit } from '@angular/core';
import { FeaturesService, SystemFeatures } from '../../services/features.service';

@Component({
  selector: 'app-features-demo',
  templateUrl: './features-demo.component.html',
  styleUrls: ['./features-demo.component.scss']
})
export class FeaturesDemoComponent implements OnInit {
  features: SystemFeatures | null = null;
  isLoading = false;

  constructor(private featuresService: FeaturesService) {}

  ngOnInit(): void {
    this.loadFeatures();
  }

  async loadFeatures(): Promise<void> {
    this.isLoading = true;
    
    try {
      await this.featuresService.initializeFeatures();
      this.features = this.featuresService.getFeatures();
    } catch (error) {
      console.error('Erro ao carregar funcionalidades:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Métodos de conveniência para o template
  isUpdateNotesEnabled(): boolean {
    return this.featuresService.isUpdateNotesEnabled();
  }

  isMascotEnabled(): boolean {
    return this.featuresService.isMascotEnabled();
  }

  getMascotImageUrl(): string | null {
    return this.featuresService.getMascotImageUrl();
  }

  isAchievementsEnabled(): boolean {
    return this.featuresService.isAchievementsEnabled();
  }

  isLeaderboardsEnabled(): boolean {
    return this.featuresService.isLeaderboardsEnabled();
  }

  isChallengesEnabled(): boolean {
    return this.featuresService.isChallengesEnabled();
  }

  isSocialFeaturesEnabled(): boolean {
    return this.featuresService.isSocialFeaturesEnabled();
  }

  isVirtualStoreEnabled(): boolean {
    return this.featuresService.isVirtualStoreEnabled();
  }

  isMultilingual(): boolean {
    return this.featuresService.isMultilingual();
  }

  getDefaultLanguage(): string {
    return this.featuresService.getDefaultLanguage();
  }

  isThemeSwitchAllowed(): boolean {
    return this.featuresService.isThemeSwitchAllowed();
  }

  getDefaultTheme(): string {
    return this.featuresService.getDefaultTheme();
  }

  // Métodos para o resumo
  getActiveFeaturesCount(): number {
    if (!this.features) return 0;
    
    let count = 0;
    if (this.features.enableUpdateNotes) count++;
    if (this.features.enableMascot) count++;
    if (this.features.enableAchievements) count++;
    if (this.features.enableLeaderboards) count++;
    if (this.features.enableChallenges) count++;
    if (this.features.enableSocialFeatures) count++;
    if (this.features.enableVirtualStore) count++;
    
    return count;
  }

  getTotalFeaturesCount(): number {
    return 7; // Número total de funcionalidades booleanas
  }
} 