import { Injectable } from '@angular/core';
import { ApiProvider } from '../providers/api.provider';
import { SystemParams, SystemParamValue } from '../model/system-params.model';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SystemParamsService {

  private readonly STORAGE_KEY = 'system_params';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas em millisegundos
  private cachedParams: SystemParams | null = null;
  private lastFetchTime: number = 0;
  private isInitialized = false;
  private initializationPromise: Promise<SystemParams> | null = null;

  constructor(private api: ApiProvider, private http: HttpClient) {}

  /**
   * Inicializa os parÃ¢metros do sistema no primeiro acesso
   * Pode ser chamado mesmo sem autenticaÃ§Ã£o (ex: pÃ¡gina de login)
   * Implementa singleton pattern para evitar mÃºltiplas requisiÃ§Ãµes simultÃ¢neas
   */
  public async initializeSystemParams(): Promise<SystemParams> {
    // Se jÃ¡ foi inicializado e o cache Ã© vÃ¡lido, retorna imediatamente
    if (this.isInitialized && this.isCacheValid()) {
      return this.cachedParams!;
    }

    // Se jÃ¡ estÃ¡ inicializando, retorna a promise existente
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Cria nova promise de inicializaÃ§Ã£o
    this.initializationPromise = this.performInitialization();

    try {
      const params = await this.initializationPromise;
      return params;
    } finally {
      // Limpa a promise apÃ³s a inicializaÃ§Ã£o
      this.initializationPromise = null;
    }
  }

  /**
   * Executa a inicializaÃ§Ã£o real dos parÃ¢metros
   */
  private async performInitialization(): Promise<SystemParams> {
    try {
      const params = await this.fetchFromApi();
      this.isInitialized = true;
      return params;
    } catch (error) {
      // Se falhar na inicializaÃ§Ã£o, tenta usar cache mesmo que expirado
      const storedData = this.getFromStorage();
      if (storedData) {
        this.cachedParams = storedData.params;
        this.lastFetchTime = storedData.timestamp;
        this.isInitialized = true;
        return this.cachedParams;
      }
      
      throw error;
    }
  }

  /**
   * ObtÃ©m os parÃ¢metros do sistema, garantindo que foram inicializados
   */
  public async getSystemParams(): Promise<SystemParams> {
    // Se nÃ£o foi inicializado, inicializa primeiro
    if (!this.isInitialized) {
      return this.initializeSystemParams();
    }

    // Verifica se hÃ¡ dados em cache vÃ¡lidos
    if (this.isCacheValid()) {
      return this.cachedParams!;
    }

    // Busca dados do localStorage
    const storedData = this.getFromStorage();
    if (storedData && this.isStorageValid(storedData.timestamp)) {
      this.cachedParams = storedData.params;
      this.lastFetchTime = storedData.timestamp;
      return this.cachedParams;
    }

    // Se nÃ£o hÃ¡ cache vÃ¡lido, busca da API
    return this.fetchFromApi();
  }

  /**
   * ForÃ§a a atualizaÃ§Ã£o dos parÃ¢metros da API
   */
  public async refreshSystemParams(): Promise<SystemParams> {
    return this.fetchFromApi();
  }

  /**
   * ObtÃ©m um parÃ¢metro especÃ­fico do sistema
   * Aguarda a inicializaÃ§Ã£o se necessÃ¡rio
   */
  public async getParam<T>(paramName: keyof SystemParams): Promise<T | null> {
    const params = await this.getSystemParams();
    const param = params[paramName];
    
    // Verifica se o parÃ¢metro tem a propriedade 'value' (SystemParamValue)
    if (param && typeof param === 'object' && 'value' in param) {
      return (param as SystemParamValue).value;
    }
    
    // Para parÃ¢metros que nÃ£o seguem o padrÃ£o SystemParamValue (como reward_rules)
    return param as T;
  }

  /**
   * Verifica se um recurso estÃ¡ habilitado
   */
  public async isFeatureEnabled(featureName: keyof SystemParams): Promise<boolean> {
    const value = await this.getParam<boolean>(featureName);
    return value === true;
  }

  /**
   * Verifica se os parÃ¢metros jÃ¡ foram inicializados
   */
  public isParamsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Verifica se estÃ¡ carregando os parÃ¢metros
   */
  public isLoading(): boolean {
    return this.initializationPromise !== null;
  }

  /**
   * Limpa o cache dos parÃ¢metros
   */
  public clearCache(): void {
    this.cachedParams = null;
    this.lastFetchTime = 0;
    this.isInitialized = false;
    this.initializationPromise = null;
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Busca os parÃ¢metros da API
   * NOTA: Como migramos para Funifier, nÃ£o temos mais o endpoint /client/system-params
   * Retornamos valores padrÃ£o para manter a compatibilidade
   */
  private async fetchFromApi(): Promise<SystemParams> {
    try {
      // Valores padrÃ£o para manter a aplicaÃ§Ã£o funcionando
      const params: SystemParams = {
        max_level: { value: 100, inherited: false },
        client_name: { value: 'Game4U', inherited: false },
        coins_alias: { value: 'Moedas', inherited: false },
        action_alias: { value: 'AÃ§Ãµes', inherited: false },
        points_alias: { value: 'Pontos', inherited: false },
        reward_rules: { tiers: [] },
        default_theme: { value: 'light', inherited: false },
        enable_mascot: { value: false, inherited: false },
        primary_color: { value: '#1976d2', inherited: false },
        delivery_alias: { value: 'Entregas', inherited: false },
        mascot_img_url: { value: '', inherited: false },
        season_end_date: { value: '2025-12-31', inherited: false },
        secondary_color: { value: '#424242', inherited: false },
        default_language: { value: 'pt-BR', inherited: false },
        points_per_level: { value: 1000, inherited: false },
        enable_challenges: { value: true, inherited: false },
        season_start_date: { value: '2025-01-01', inherited: false },
        team_monthly_goal: { value: 10000, inherited: false },
        allow_theme_switch: { value: true, inherited: false },
        enable_achievements: { value: true, inherited: false },
        enable_leaderboards: { value: true, inherited: false },
        enable_update_notes: { value: false, inherited: false },
        client_dark_logo_url: { value: '', inherited: false },
        enable_virtual_store: { value: true, inherited: false },
        points_exchange_rate: { value: 1, inherited: false },
        client_light_logo_url: { value: '', inherited: false },
        delivery_redirect_url: { value: '', inherited: false },
        language_multilingual: { value: false, inherited: false },
        enable_social_features: { value: true, inherited: false },
        individual_monthly_goal: { value: 1000, inherited: false },
        user_action_redirect_url: { value: '', inherited: false },
        client_login_background_url: { value: '', inherited: false },
        team_redirect_urls: {}
      };
      
      // Atualiza o cache
      this.cachedParams = params;
      this.lastFetchTime = Date.now();
      
      // Salva no localStorage
      this.saveToStorage(params);
      
      return params;
    } catch (error) {
      // Se falhar, tenta retornar dados do cache mesmo que expirados
      if (this.cachedParams) {
        return this.cachedParams;
      }
      
      throw error;
    }
  }

  /**
   * Verifica se o cache em memÃ³ria Ã© vÃ¡lido
   */
  private isCacheValid(): boolean {
    return this.cachedParams !== null && 
           (Date.now() - this.lastFetchTime) < this.CACHE_DURATION;
  }

  /**
   * Verifica se os dados do localStorage sÃ£o vÃ¡lidos
   */
  private isStorageValid(timestamp: number): boolean {
    return (Date.now() - timestamp) < this.CACHE_DURATION;
  }

  /**
   * ObtÃ©m dados do localStorage
   */
  private getFromStorage(): { params: SystemParams; timestamp: number } | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Salva dados no localStorage
   */
  private saveToStorage(params: SystemParams): void {
    try {
      const data = {
        params,
        timestamp: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      // Silently fail - localStorage is not critical
    }
  }
} 