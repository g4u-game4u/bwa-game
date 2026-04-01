import { Injectable } from '@angular/core';
import { ApiProvider } from '../providers/api.provider';
import { ResumoMes } from '../model/resumoMes.model';
import { TIPO_CONSULTA_TIME } from '@app/pages/dashboard/dashboard.component';
import { MesAtualService } from './mes-atual.service';
import { MesAnteriorService } from './mes-anterior.service';

export interface TeamStatsCacheKey {
  teamId: number;
  period: 'current' | 'previous';
  monthsAgo?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TeamStatsCacheService {
  private cache = new Map<string, { data: ResumoMes; timestamp: number }>();
  private loadingPromises = new Map<string, Promise<ResumoMes>>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  constructor(
    private api: ApiProvider,
    private mesAtualService: MesAtualService,
    private mesAnteriorService: MesAnteriorService
  ) {}

  /**
   * Obtém dados do time com cache
   */
  async getTeamStats(teamId: number, tipo: number, monthsAgo: number = 0): Promise<ResumoMes> {
    const cacheKey = this.createCacheKey({ teamId, period: monthsAgo > 0 ? 'previous' : 'current', monthsAgo });

    // Verifica se já está carregando
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!;
    }

    // Verifica se há dados em cache válidos
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`📊 Usando cache para team-stats: ${cacheKey}`);
      return cached.data;
    }

    // Faz a requisição
    console.log(`📊 Fazendo requisição para team-stats: ${cacheKey}`);
    const promise = this.fetchTeamStats(teamId, tipo, monthsAgo);
    this.loadingPromises.set(cacheKey, promise);

    try {
      const data = await promise;
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } finally {
      this.loadingPromises.delete(cacheKey);
    }
  }

  /**
   * Faz a requisição real para a API
   */
  private async fetchTeamStats(teamId: number, tipo: number, monthsAgo: number): Promise<ResumoMes> {
    if (monthsAgo > 0) {
      return this.mesAnteriorService.getDadosMesAnteriorDashboard(teamId, tipo, monthsAgo);
    } else {
      return this.mesAtualService.getDadosMesAtualDashboard(teamId, tipo);
    }
  }

  /**
   * Cria uma chave única para o cache
   */
  private createCacheKey(key: TeamStatsCacheKey): string {
    return `${key.teamId}-${key.period}-${key.monthsAgo || 0}`;
  }

  /**
   * Limpa o cache para um time específico
   */
  clearTeamCache(teamId: number): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${teamId}-`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Limpa todo o cache
   */
  clearAllCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Obtém estatísticas do cache
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
} 