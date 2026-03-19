import { Injectable } from '@angular/core';
import { SystemParamsService } from './system-params.service';

/**
 * Interface que define a estrutura dos aliases
 */
export interface SystemAliases {
  pointAlias: string;
  coinsAlias: string;
  deliveryAlias: string;
  actionAlias: string;
  userActionRedirectUrl: string | null;
  deliveryRedirectUrl: string | null;
  teamRedirectUrl: Record<string, {
    userActionRedirectUrl: string | null;
    deliveryRedirectUrl: string | null;
  }> | null;
}

/**
 * Serviço responsável por gerenciar os aliases dos parâmetros do sistema
 * Fornece acesso tipado aos aliases: point_alias, coins_alias, delivery_alias, action_alias,
 * user_action_redirect_url e delivery_redirect_url
 */
@Injectable({
  providedIn: 'root'
})
export class AliasService {
  private aliases: SystemAliases | null = null;
  private isLoading = false;
  private loadPromise: Promise<SystemAliases> | null = null;

  constructor(private systemParamsService: SystemParamsService) {}

  /**
   * Carrega todos os aliases do sistema
   * @returns Promise com os aliases carregados
   */
  async loadAliases(): Promise<SystemAliases> {
    // Se já está carregando, retorna a promise existente
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Se já foi carregado, retorna os dados em cache
    if (this.aliases) {
      return this.aliases;
    }

    this.isLoading = true;
    this.loadPromise = this.fetchAliases();

    try {
      this.aliases = await this.loadPromise;
      return this.aliases;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }

  /**
   * Busca os aliases do sistema params
   * Aguarda a inicialização do SystemParamsService se necessário
   */
  private async fetchAliases(): Promise<SystemAliases> {
    try {
      // Aguarda a inicialização do SystemParamsService se necessário
      await this.systemParamsService.initializeSystemParams();

      const [
        pointAlias,
        coinsAlias,
        deliveryAlias,
        actionAlias
      ] = await Promise.all([
        this.systemParamsService.getParam<string>('points_alias'),
        this.systemParamsService.getParam<string>('coins_alias'),
        this.systemParamsService.getParam<string>('delivery_alias'),
        this.systemParamsService.getParam<string>('action_alias')
      ]);

      // Busca team_redirect_url diretamente do SystemParams completo
      const systemParams = await this.systemParamsService.getSystemParams();
      // O parâmetro correto é 'team_redirect_urls' (com 's')
      const teamRedirectUrlData = systemParams?.team_redirect_urls;

      // Processa a nova estrutura de team_redirect_url
      const teamRedirectUrl = this.processTeamRedirectUrl(teamRedirectUrlData);

      const aliases: SystemAliases = {
        pointAlias: pointAlias || 'Pontos',
        coinsAlias: coinsAlias || 'Moedas',
        deliveryAlias: deliveryAlias || 'Entregas',
        actionAlias: actionAlias || 'Ações',
        userActionRedirectUrl: null, // Mantido para compatibilidade
        deliveryRedirectUrl: null, // Mantido para compatibilidade
        teamRedirectUrl: teamRedirectUrl
      };

      return aliases;
    } catch (error) {
      console.error('Erro ao carregar aliases:', error);
      
      // Retorna valores padrão em caso de erro
      return {
        pointAlias: 'Pontos',
        coinsAlias: 'Moedas',
        deliveryAlias: 'Entregas',
        actionAlias: 'Ações',
        userActionRedirectUrl: null,
        deliveryRedirectUrl: null,
        teamRedirectUrl: null
      };
    }
  }

  /**
   * Processa a estrutura de team_redirect_url do system params
   * Extrai os valores das URLs de cada time
   * @param teamRedirectUrlData Dados do team_redirect_url do system params
   * @returns Objeto com URLs organizadas por time
   */
  private processTeamRedirectUrl(teamRedirectUrlData: any): Record<string, { userActionRedirectUrl: string | null; deliveryRedirectUrl: string | null }> | null {
    
    if (!teamRedirectUrlData || typeof teamRedirectUrlData !== 'object') {
      console.warn('⚠️ processTeamRedirectUrl - Dados inválidos ou vazios');
      return null;
    }

    const processed: Record<string, { userActionRedirectUrl: string | null; deliveryRedirectUrl: string | null }> = {};

    Object.entries(teamRedirectUrlData).forEach(([teamKey, teamData]: [string, any]) => {
      
      // Extrai o número do time (ex: "team_16" -> "16")
      const teamId = teamKey.replace('team_', '');
      
      // Processa as URLs do time, extraindo o campo "value"
      processed[teamId] = {
        userActionRedirectUrl: teamData?.userActionRedirectUrl?.value || null,
        deliveryRedirectUrl: teamData?.deliveryRedirectUrl?.value || null
      };
      
    });

    return Object.keys(processed).length > 0 ? processed : null;
  }

  /**
   * Obtém todos os aliases
   * @returns Promise com todos os aliases
   */
  async getAliases(): Promise<SystemAliases> {
    return this.loadAliases();
  }

  /**
   * Obtém um alias específico
   * @param aliasType Tipo do alias desejado
   * @returns Promise com o valor do alias
   */
  async getAlias<K extends keyof SystemAliases>(aliasType: K): Promise<SystemAliases[K]> {
    const aliases = await this.loadAliases();
    return aliases[aliasType];
  }

  /**
   * Obtém o alias de pontos
   */
  async getPointAlias(): Promise<string> {
    return this.getAlias('pointAlias');
  }

  /**
   * Obtém o alias de moedas
   */
  async getCoinsAlias(): Promise<string> {
    return this.getAlias('coinsAlias');
  }

  /**
   * Obtém o alias de entregas
   */
  async getDeliveryAlias(): Promise<string> {
    return this.getAlias('deliveryAlias');
  }

  /**
   * Obtém o alias de ações
   */
  async getActionAlias(): Promise<string> {
    return this.getAlias('actionAlias');
  }

  /**
   * Obtém a URL de redirecionamento para ações do usuário
   */
  async getUserActionRedirectUrl(): Promise<string | null> {
    return this.getAlias('userActionRedirectUrl');
  }

  /**
   * Obtém a URL de redirecionamento para entregas
   */
  async getDeliveryRedirectUrl(): Promise<string | null> {
    return this.getAlias('deliveryRedirectUrl');
  }

  /**
   * Verifica se os aliases estão sendo carregados
   */
  isLoadingAliases(): boolean {
    return this.isLoading;
  }

  /**
   * Verifica se os aliases já foram carregados
   */
  isAliasesLoaded(): boolean {
    return this.aliases !== null;
  }

  /**
   * Limpa o cache dos aliases (útil para testes ou recarregamento)
   */
  clearCache(): void {
    this.aliases = null;
    this.loadPromise = null;
  }

  /**
   * Recarrega os aliases (limpa cache e carrega novamente)
   */
  async reloadAliases(): Promise<SystemAliases> {
    this.clearCache();
    return this.loadAliases();
  }
} 