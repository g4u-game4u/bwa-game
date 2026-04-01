import { Injectable } from '@angular/core';
import { SystemParamsService } from './system-params.service';

/**
 * Interface que define a estrutura das configurações de metas
 */
export interface GoalsConfig {
  individualMonthlyGoal: number;
  teamMonthlyGoal: number;
  maxLevel: number;
  pointsPerLevel: number;
}

/**
 * Serviço responsável por gerenciar o cache dos parâmetros de metas e configurações do sistema
 * Fornece acesso tipado aos parâmetros: individual_monthly_goal, team_monthly_goal, max_level e points_per_level
 */
@Injectable({
  providedIn: 'root'
})
export class GoalsConfigService {
  private config: GoalsConfig | null = null;
  private isLoading = false;
  private loadPromise: Promise<GoalsConfig> | null = null;

  constructor(private systemParamsService: SystemParamsService) {}

  /**
   * Carrega todas as configurações de metas do sistema
   * @returns Promise com as configurações carregadas
   */
  async loadGoalsConfig(): Promise<GoalsConfig> {
    // Se já está carregando, retorna a promise existente
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Se já foi carregado, retorna os dados em cache
    if (this.config) {
      return this.config;
    }

    this.isLoading = true;
    this.loadPromise = this.fetchGoalsConfig();

    try {
      this.config = await this.loadPromise;
      return this.config;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }

  /**
   * Busca as configurações de metas do sistema params
   * Aguarda a inicialização do SystemParamsService se necessário
   */
  private async fetchGoalsConfig(): Promise<GoalsConfig> {
    try {
      // Aguarda a inicialização do SystemParamsService se necessário
      await this.systemParamsService.initializeSystemParams();

      const [
        individualMonthlyGoal,
        teamMonthlyGoal,
        maxLevel,
        pointsPerLevel
      ] = await Promise.all([
        this.systemParamsService.getParam<number>('individual_monthly_goal'),
        this.systemParamsService.getParam<number>('team_monthly_goal'),
        this.systemParamsService.getParam<number>('max_level'),
        this.systemParamsService.getParam<number>('points_per_level')
      ]);

      const config: GoalsConfig = {
        individualMonthlyGoal: individualMonthlyGoal || 100,
        teamMonthlyGoal: teamMonthlyGoal || 400,
        maxLevel: maxLevel || 30,
        pointsPerLevel: pointsPerLevel || 500
      };

      return config;
    } catch (error) {
      console.error('Erro ao carregar configurações de metas:', error);
      
      // Retorna valores padrão em caso de erro
      return {
        individualMonthlyGoal: 100,
        teamMonthlyGoal: 400,
        maxLevel: 30,
        pointsPerLevel: 500
      };
    }
  }

  /**
   * Obtém todas as configurações de metas
   * @returns Promise com todas as configurações
   */
  async getGoalsConfig(): Promise<GoalsConfig> {
    return this.loadGoalsConfig();
  }

  /**
   * Obtém uma configuração específica
   * @param configType Tipo da configuração desejada
   * @returns Promise com o valor da configuração
   */
  async getConfig<K extends keyof GoalsConfig>(configType: K): Promise<GoalsConfig[K]> {
    const config = await this.loadGoalsConfig();
    return config[configType];
  }

  /**
   * Obtém a meta mensal individual
   */
  async getIndividualMonthlyGoal(): Promise<number> {
    return this.getConfig('individualMonthlyGoal');
  }

  /**
   * Obtém a meta mensal do time
   */
  async getTeamMonthlyGoal(): Promise<number> {
    return this.getConfig('teamMonthlyGoal');
  }

  /**
   * Obtém o nível máximo
   */
  async getMaxLevel(): Promise<number> {
    return this.getConfig('maxLevel');
  }

  /**
   * Obtém os pontos por nível
   */
  async getPointsPerLevel(): Promise<number> {
    return this.getConfig('pointsPerLevel');
  }

  /**
   * Calcula a meta de macros do time (individual * 4)
   */
  async getTeamMacrosGoal(): Promise<number> {
    const individualGoal = await this.getIndividualMonthlyGoal();
    return individualGoal * 4;
  }

  /**
   * Verifica se as configurações estão sendo carregadas
   */
  isLoadingConfig(): boolean {
    return this.isLoading;
  }

  /**
   * Verifica se as configurações já foram carregadas
   */
  isConfigLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Limpa o cache das configurações (útil para testes ou recarregamento)
   */
  clearCache(): void {
    this.config = null;
    this.loadPromise = null;
  }

  /**
   * Recarrega as configurações (limpa cache e carrega novamente)
   */
  async reloadConfig(): Promise<GoalsConfig> {
    this.clearCache();
    return this.loadGoalsConfig();
  }
} 