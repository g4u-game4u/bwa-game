import { Injectable } from '@angular/core';
import { SystemParams, SystemParamValue } from '../model/system-params.model';
import { environment } from '../../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { joinApiPath } from '../../environments/backend-url';

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

  constructor(private http: HttpClient) {}

  /**
   * Inicializa os parâmetros do sistema no primeiro acesso
   * Pode ser chamado mesmo sem autenticação (ex: página de login)
   * Implementa singleton pattern para evitar múltiplas requisições simultâneas
   */
  public async initializeSystemParams(): Promise<SystemParams> {
    // Se já foi inicializado e o cache é válido, retorna imediatamente
    if (this.isInitialized && this.isCacheValid()) {
      return this.cachedParams!;
    }

    // Se já está inicializando, retorna a promise existente
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Cria nova promise de inicialização
    this.initializationPromise = this.performInitialization();

    try {
      const params = await this.initializationPromise;
      return params;
    } finally {
      // Limpa a promise após a inicialização
      this.initializationPromise = null;
    }
  }

  /**
   * Executa a inicialização real dos parâmetros
   */
  private async performInitialization(): Promise<SystemParams> {
    try {
      const params = await this.fetchFromApi();
      this.isInitialized = true;
      return params;
    } catch (error) {
      console.error('Erro na inicialização dos parâmetros do sistema:', error);
      
      // Se falhar na inicialização, tenta usar cache mesmo que expirado
      const storedData = this.getFromStorage();
      if (storedData) {
        console.warn('Usando dados do cache para inicialização devido a erro na API');
        this.cachedParams = storedData.params;
        this.lastFetchTime = storedData.timestamp;
        this.isInitialized = true;
        return this.cachedParams;
      }
      
      throw error;
    }
  }

  /**
   * Obtém os parâmetros do sistema, garantindo que foram inicializados
   */
  public async getSystemParams(): Promise<SystemParams> {
    // Se não foi inicializado, inicializa primeiro
    if (!this.isInitialized) {
      return this.initializeSystemParams();
    }

    // Verifica se há dados em cache válidos
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

    // Se não há cache válido, busca da API
    return this.fetchFromApi();
  }

  /**
   * Força a atualização dos parâmetros da API
   */
  public async refreshSystemParams(): Promise<SystemParams> {
    return this.fetchFromApi();
  }

  /**
   * Obtém um parâmetro específico do sistema
   * Aguarda a inicialização se necessário
   */
  public async getParam<T>(paramName: keyof SystemParams): Promise<T | null> {
    const params = await this.getSystemParams();
    const param = params[paramName];
    
    // Verifica se o parâmetro tem a propriedade 'value' (SystemParamValue)
    if (param && typeof param === 'object' && 'value' in param) {
      return (param as SystemParamValue).value;
    }
    
    // Para parâmetros que não seguem o padrão SystemParamValue (como reward_rules)
    return param as T;
  }

  /**
   * Verifica se um recurso está habilitado
   */
  public async isFeatureEnabled(featureName: keyof SystemParams): Promise<boolean> {
    const value = await this.getParam<boolean>(featureName);
    return value === true;
  }

  /**
   * Verifica se os parâmetros já foram inicializados
   */
  public isParamsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Verifica se está carregando os parâmetros
   */
  public isLoading(): boolean {
    return this.initializationPromise !== null;
  }

  /**
   * Limpa o cache dos parâmetros
   */
  public clearCache(): void {
    this.cachedParams = null;
    this.lastFetchTime = 0;
    this.isInitialized = false;
    this.initializationPromise = null;
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * GET público `/client/system-params` (endpoint Game4U; não exige Bearer).
   */
  private async fetchFromApi(): Promise<SystemParams> {
    const base = (environment.backend_url_base || '').trim().replace(/\/$/, '');
    if (!base) {
      const params = this.getDefaultSystemParams();
      this.cachedParams = params;
      this.lastFetchTime = Date.now();
      this.saveToStorage(params);
      return params;
    }

    try {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        ...(environment.client_id ? { client_id: environment.client_id } : {})
      });
      const url = joinApiPath(base, '/client/system-params');
      const raw = await firstValueFrom(this.http.get<unknown>(url, { headers }));
      const payload = this.unwrapSystemParamsPayload(raw);
      const params = this.mergeWithDefaults(payload);

      this.cachedParams = params;
      this.lastFetchTime = Date.now();
      this.saveToStorage(params);

      return params;
    } catch (error) {
      console.error('Erro ao buscar parâmetros do sistema:', error);

      if (this.cachedParams) {
        console.warn('Retornando dados do cache expirado devido a erro na API');
        return this.cachedParams;
      }

      const storedData = this.getFromStorage();
      if (storedData?.params) {
        return storedData.params;
      }

      const fallback = this.getDefaultSystemParams();
      this.cachedParams = fallback;
      this.lastFetchTime = Date.now();
      this.saveToStorage(fallback);
      return fallback;
    }
  }

  private unwrapSystemParamsPayload(raw: unknown): Partial<SystemParams> | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const o = raw as Record<string, unknown>;
    if ('data' in o && o['data'] != null && typeof o['data'] === 'object') {
      return o['data'] as Partial<SystemParams>;
    }
    return o as Partial<SystemParams>;
  }

  private mergeWithDefaults(partial: Partial<SystemParams> | null): SystemParams {
    const defaults = this.getDefaultSystemParams();
    if (!partial) {
      return defaults;
    }
    const out = { ...defaults };
    (Object.keys(defaults) as (keyof SystemParams)[]).forEach((key) => {
      if (partial[key] !== undefined && partial[key] !== null) {
        (out as Record<string, unknown>)[key as string] = partial[key] as unknown;
      }
    });
    return out;
  }

  private getDefaultSystemParams(): SystemParams {
    return {
      max_level: { value: 100, inherited: false },
      client_name: { value: 'Game4U', inherited: false },
      coins_alias: { value: 'Moedas', inherited: false },
      action_alias: { value: 'Ações', inherited: false },
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
  }

  /**
   * Verifica se o cache em memória é válido
   */
  private isCacheValid(): boolean {
    return this.cachedParams !== null && 
           (Date.now() - this.lastFetchTime) < this.CACHE_DURATION;
  }

  /**
   * Verifica se os dados do localStorage são válidos
   */
  private isStorageValid(timestamp: number): boolean {
    return (Date.now() - timestamp) < this.CACHE_DURATION;
  }

  /**
   * Obtém dados do localStorage
   */
  private getFromStorage(): { params: SystemParams; timestamp: number } | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Erro ao ler parâmetros do localStorage:', error);
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
      console.error('Erro ao salvar parâmetros no localStorage:', error);
    }
  }
}
