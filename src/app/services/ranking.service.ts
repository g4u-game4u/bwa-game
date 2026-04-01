import { Injectable } from '@angular/core';
import { ApiProvider } from '../providers/api.provider';

/**
 * Converte uma data para string relativa no formato esperado pela API
 * @param dateStr Data em formato string
 * @param isStart Se é data de início (true) ou fim (false)
 * @returns String no formato -Xd- para início ou -Xd+ para fim
 */
export function dateToRelativeString(dateStr: string, isStart: boolean): string {
  const today = new Date();
  const date = new Date(dateStr);
  // Zero out time for both
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  // Calculate difference in days
  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  // API expects -Xd- for start, -Xd+ for end
  return `-${diffDays}d${isStart ? '-' : '+'}`;
}

// Interfaces para a API real
export interface RankingOperation {
  type: number;
  achievement_type: number;
  item: string;
  filters: any[];
  sort: number;
  sub: boolean;
}

export interface ApiRankingPeriod {
  type: number;
  timeAmount: number;
  timeScale: number;
}

export interface RankingTechnique {
  id: string;
  name: string;
  description?: string;
}

export interface RankingExtra {
  [key: string]: any;
}

export interface ApiRankingType {
  _id: string;
  title: string;
  principalType: number;
  operation: RankingOperation;
  period: ApiRankingPeriod;
  techniques: string[];
  extra: RankingExtra;
}

// Interfaces para uso interno (mantidas para compatibilidade)
export interface RankingType {
  id: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
}

export interface RankingPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface RankingPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface RankingParticipant {
  id: number;
  name: string;
  teamName: string;
  position: number;
  points: number;
  avatar?: string;
  level: number;
  achievements: number;
  progress: number;
  lastUpdated: string;
  movement?: 'up' | 'down' | 'stop' | 'new';
  previousPosition?: number;
  previousPoints?: number;
}

export interface RankingData {
  id: string;
  type: RankingType;
  period: RankingPeriod;
  participants: RankingParticipant[];
  totalParticipants: number;
  lastUpdated: string;
  metadata?: {
    maxPoints: number;
    averagePoints: number;
    topPerformer?: RankingParticipant;
  };
}

export interface RankingListResponse {
  rankings: RankingType[];
  periods: RankingPeriod[];
  totalCount: number;
}

export interface RankingDetailResponse {
  ranking: RankingData;
  success: boolean;
  message?: string;
}

// Interface para participante da API
export interface ApiRankingParticipant {
  _id: string;
  total: number;
  position: number;
  previous_total: number;
  previous_position: number;
  move: 'up' | 'down' | 'stop' | 'new';
  player: string;
  name: string;
  teamName: string;
  extra: {
    cache?: string;
    [key: string]: any;
  };
  boardId: string;
}

// Interface para resposta da API de detalhes do ranking
export interface ApiRankingDetailResponse {
  ranking: {
    _id: string;
    title: string;
    principalType: number;
    operation: RankingOperation;
    period: ApiRankingPeriod;
    techniques: string[];
    extra: RankingExtra;
    participants?: ApiRankingParticipant[];
    totalParticipants?: number;
    lastUpdated?: string;
  };
  success?: boolean;
  message?: string;
}

// Interface para resposta direta do endpoint /leaderboards/{id}
export interface ApiLeaderboardResponse extends Array<ApiRankingParticipant> {}

@Injectable({
  providedIn: 'root'
})
export class RankingService {
  private rankingsCache: RankingType[] | null = null;
  private periodsCache: RankingPeriod[] | null = null;
  private isLoadingRankings = false;
  private loadRankingsPromise: Promise<RankingListResponse> | null = null;

  constructor(private apiProvider: ApiProvider) {}

  /**
   * Busca a lista de rankings disponíveis
   * @returns Promise com a lista de rankings e períodos
   */
  async getRankingsList(): Promise<RankingListResponse> {
    // Se já está carregando, retorna a promise existente
    if (this.loadRankingsPromise) {
      return this.loadRankingsPromise;
    }

    // Se já foi carregado, retorna os dados em cache
    if (this.rankingsCache && this.periodsCache) {
      return {
        rankings: this.rankingsCache,
        periods: this.periodsCache,
        totalCount: this.rankingsCache.length
      };
    }

    this.isLoadingRankings = true;
    this.loadRankingsPromise = this.fetchRankingsList();

    try {
      const response = await this.loadRankingsPromise;
      this.rankingsCache = response.rankings;
      this.periodsCache = response.periods;
      return response;
    } finally {
      this.isLoadingRankings = false;
      this.loadRankingsPromise = null;
    }
  }

  /**
   * Busca os dados de um ranking específico
   * @param rankingId ID do ranking
   * @param dateRange Período de data (opcional)
   * @returns Promise com os dados do ranking
   */
  async getRankingDetails(rankingId: string, dateRange?: DateRange): Promise<RankingDetailResponse> {
    try {
      let endpoint = `/leaderboards/${rankingId}`;
      
      if (dateRange) {
        const startPeriod = dateToRelativeString(dateRange.startDate, true);
        const endPeriod = dateToRelativeString(dateRange.endDate, false);
        // Usa separador simples ';' e '+' - a codificação será feita automaticamente pelo browser
        const combinedPeriod = `${startPeriod};${endPeriod}`;
        endpoint += `?period=${combinedPeriod}`;
      }


      // A resposta direta do endpoint é um array de participantes
      const participants: ApiLeaderboardResponse = await this.apiProvider.post(endpoint, {});
      
      // Busca informações do ranking para complementar os dados
      const rankingInfo = await this.getRankingInfo(rankingId);
      
      // Valida e formata a resposta
      const rankingData = this.validateAndFormatRankingResponse(participants, rankingInfo, dateRange);
      
      return {
        ranking: rankingData,
        success: true
      };
    } catch (error) {
      console.error('❌ Erro ao buscar dados do ranking:', error);
      
      return {
        ranking: this.getDefaultRankingData(rankingId),
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Busca informações básicas do ranking
   */
  private async getRankingInfo(rankingId: string): Promise<ApiRankingType | null> {
    try {
      const rankings = await this.getRankingsList();
      const ranking = rankings.rankings.find(r => r.id === rankingId);
      
      if (ranking) {
        // Busca o ranking original da API para obter informações completas
        const allRankings: ApiRankingType[] = await this.apiProvider.get('/leaderboards');
        return allRankings.find(r => r._id === rankingId) || null;
      }
      
      return null;
    } catch (error) {
      console.warn('Erro ao buscar informações do ranking:', error);
      return null;
    }
  }

  /**
   * Busca a lista de rankings da API
   */
  private async fetchRankingsList(): Promise<RankingListResponse> {
    try {
      const response: ApiRankingType[] = await this.apiProvider.get('/leaderboards');
      
      // Valida e formata a resposta
      const rankings = this.validateAndFormatRankingsList(response);
      const periods = this.getDefaultPeriods();
      
      return {
        rankings,
        periods,
        totalCount: rankings.length
      };
    } catch (error) {
      console.error('❌ Erro ao carregar lista de rankings:', error);
      
      // Retorna dados padrão em caso de erro
      return {
        rankings: this.getDefaultRankings(),
        periods: this.getDefaultPeriods(),
        totalCount: 4
      };
    }
  }

  /**
   * Valida e formata a resposta da lista de rankings
   */
  private validateAndFormatRankingsList(response: any): RankingType[] {
    if (!response || !Array.isArray(response)) {
      console.warn('Resposta da API não é um array:', response);
      return this.getDefaultRankings();
    }

    return response.map((item: ApiRankingType) => ({
      id: item._id,
      name: item.title,
      description: this.getRankingDescription(item),
      category: this.getRankingCategory(item),
      isActive: true
    }));
  }

  /**
   * Gera descrição do ranking baseada no tipo
   */
  private getRankingDescription(ranking: ApiRankingType): string {
    const descriptions: { [key: number]: string } = {
      0: 'Ranking baseado em produtividade geral',
      1: 'Ranking baseado em vendas',
      2: 'Ranking baseado em qualidade',
      3: 'Ranking baseado em engajamento',
      4: 'Ranking baseado em metas específicas'
    };
    
    return descriptions[ranking.principalType] || 'Ranking personalizado';
  }

  /**
   * Determina categoria do ranking baseada no tipo
   */
  private getRankingCategory(ranking: ApiRankingType): string {
    const categories: { [key: number]: string } = {
      0: 'performance',
      1: 'revenue',
      2: 'quality',
      3: 'participation',
      4: 'custom'
    };
    
    return categories[ranking.principalType] || 'general';
  }

  /**
   * Valida e formata a resposta de detalhes do ranking
   */
  private validateAndFormatRankingResponse(participants: ApiLeaderboardResponse, rankingInfo: ApiRankingType | null, dateRange?: DateRange): RankingData {
    if (!participants || !Array.isArray(participants)) {
      console.warn('Resposta da API não contém participantes válidos:', participants);
      return this.getDefaultRankingData('default');
    }

    // Se não temos informações do ranking, usa dados padrão
    if (!rankingInfo) {
      return {
        id: 'default',
        type: {
          id: 'default',
          name: 'Ranking Padrão',
          description: 'Ranking baseado em dados padrão',
          category: 'general',
          isActive: true
        },
        period: {
          id: dateRange ? `custom_${dateRange.startDate}_${dateRange.endDate}` : 'current',
          name: dateRange ? this.formatDateRangeName(dateRange) : 'Mês Atual',
          startDate: dateRange?.startDate || new Date().toISOString(),
          endDate: dateRange?.endDate || new Date().toISOString(),
          isCurrent: !dateRange
        },
        participants: this.formatApiParticipants(participants),
        totalParticipants: participants.length,
        lastUpdated: new Date().toISOString(),
        metadata: {
          maxPoints: Math.max(...participants.map(p => p.total), 3000),
          averagePoints: participants.length > 0 ? participants.reduce((sum, p) => sum + p.total, 0) / participants.length : 2000
        }
      };
    }

    return {
      id: rankingInfo._id,
      type: {
        id: rankingInfo._id,
        name: rankingInfo.title,
        description: this.getRankingDescription(rankingInfo),
        category: this.getRankingCategory(rankingInfo),
        isActive: true
      },
      period: {
        id: `period_${rankingInfo.period.type}_${rankingInfo.period.timeAmount}_${rankingInfo.period.timeScale}`,
        name: this.getPeriodName(rankingInfo.period),
        startDate: this.calculatePeriodStartDate(rankingInfo.period),
        endDate: this.calculatePeriodEndDate(rankingInfo.period),
        isCurrent: rankingInfo.period.type === 0
      },
      participants: this.formatApiParticipants(participants),
      totalParticipants: participants.length,
      lastUpdated: new Date().toISOString(),
      metadata: {
        maxPoints: Math.max(...participants.map(p => p.total), 3000),
        averagePoints: participants.length > 0 ? participants.reduce((sum, p) => sum + p.total, 0) / participants.length : 2000
      }
    };
  }

  /**
   * Gera nome do período baseado nos parâmetros da API
   */
  private getPeriodName(period: ApiRankingPeriod): string {
    const timeScaleNames: { [key: number]: string } = {
      1: 'Dia',
      2: 'Semana', 
      3: 'Mês',
      4: 'Trimestre',
      5: 'Semestre',
      6: 'Ano'
    };
    
    const typeNames: { [key: number]: string } = {
      0: 'Atual',
      1: 'Anterior',
      2: 'Específico'
    };
    
    const scaleName = timeScaleNames[period.timeScale] || 'Período';
    const typeName = typeNames[period.type] || 'Desconhecido';
    
    return `${scaleName} ${typeName}`;
  }

  /**
   * Calcula data de início do período
   */
  private calculatePeriodStartDate(period: ApiRankingPeriod): string {
    const now = new Date();
    let startDate = new Date();
    
    switch (period.timeScale) {
      case 1: // Dia
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - period.timeAmount);
        break;
      case 2: // Semana
        startDate = new Date(now.getTime() - (period.timeAmount * 7 * 24 * 60 * 60 * 1000));
        break;
      case 3: // Mês
        startDate = new Date(now.getFullYear(), now.getMonth() - period.timeAmount, 1);
        break;
      case 4: // Trimestre
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - period.timeAmount * 3, 1);
        break;
      case 5: // Semestre
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 6) * 6 - period.timeAmount * 6, 1);
        break;
      case 6: // Ano
        startDate = new Date(now.getFullYear() - period.timeAmount, 0, 1);
        break;
    }
    
    return startDate.toISOString();
  }

  /**
   * Calcula data de fim do período
   */
  private calculatePeriodEndDate(period: ApiRankingPeriod): string {
    const now = new Date();
    let endDate = new Date();
    
    switch (period.timeScale) {
      case 1: // Dia
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 2: // Semana
        endDate = new Date(now.getTime());
        break;
      case 3: // Mês
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 4: // Trimestre
        endDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
        break;
      case 5: // Semestre
        endDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 6) * 6 + 6, 0);
        break;
      case 6: // Ano
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
    }
    
    return endDate.toISOString();
  }

  /**
   * Formata a lista de participantes da API
   */
  private formatApiParticipants(participants: ApiRankingParticipant[]): RankingParticipant[] {
    if (!Array.isArray(participants)) {
      return this.getDefaultParticipants();
    }

    return participants.map((participant: ApiRankingParticipant) => ({
      id: parseInt(participant._id.split('_')[0]) || Math.random(),
      name: participant.name,
      teamName: participant.teamName,
      position: participant.position,
      points: participant.total,
      avatar: this.generateAvatarUrl(participant.player),
      level: this.calculateLevel(participant.total),
      achievements: this.calculateAchievements(participant),
      progress: this.calculateProgress(participant),
      lastUpdated: new Date().toISOString(),
      movement: participant.move,
      previousPosition: participant.previous_position,
      previousPoints: participant.previous_total
    }));
  }

  /**
   * Formata a lista de participantes (método legado)
   */
  private formatParticipants(participants: any[]): RankingParticipant[] {
    if (!Array.isArray(participants)) {
      return this.getDefaultParticipants();
    }

    return participants.map((participant: any, index: number) => ({
      id: participant.id || index + 1,
      name: participant.name || `Participante ${index + 1}`,
      teamName: participant.teamName || 'Equipe Padrão',
      position: participant.position || index + 1,
      points: participant.points || Math.floor(Math.random() * 3000) + 1000,
      avatar: participant.avatar,
      level: participant.level || Math.floor(Math.random() * 20) + 1,
      achievements: participant.achievements || Math.floor(Math.random() * 10),
      progress: participant.progress || Math.floor(Math.random() * 100),
      lastUpdated: participant.lastUpdated || new Date().toISOString()
    }));
  }

  /**
   * Gera URL do avatar baseada no email
   */
  private generateAvatarUrl(email: string): string {
    // Pode ser implementado com serviços como Gravatar ou avatares gerados
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(email.split('@')[0])}&background=random`;
  }

  /**
   * Calcula nível baseado nos pontos
   */
  private calculateLevel(points: number): number {
    return Math.floor(points / 100) + 1;
  }

  /**
   * Calcula conquistas baseadas no movimento e posição
   */
  private calculateAchievements(participant: ApiRankingParticipant): number {
    let achievements = 0;
    
    // Conquista por estar no topo
    if (participant.position <= 3) achievements += 1;
    
    // Conquista por movimento positivo
    if (participant.move === 'up') achievements += 1;
    
    // Conquista por manter posição
    if (participant.move === 'stop' && participant.position <= 5) achievements += 1;
    
    // Conquista por pontuação alta
    if (participant.total > 1000) achievements += 1;
    
    return achievements;
  }

  /**
   * Calcula progresso baseado na posição e pontuação
   */
  private calculateProgress(participant: ApiRankingParticipant): number {
    // Progresso baseado na posição (quanto menor a posição, maior o progresso)
    const positionProgress = Math.max(0, 100 - (participant.position - 1) * 10);
    
    // Progresso baseado na pontuação (assumindo máximo de 3000 pontos)
    const pointsProgress = Math.min(100, (participant.total / 3000) * 100);
    
    // Média dos dois progressos
    return Math.round((positionProgress + pointsProgress) / 2);
  }

  /**
   * Formata nome do período baseado no range de datas
   */
  private formatDateRangeName(dateRange: DateRange): string {
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    
    const startFormatted = startDate.toLocaleDateString('pt-BR');
    const endFormatted = endDate.toLocaleDateString('pt-BR');
    
    return `${startFormatted} - ${endFormatted}`;
  }

  /**
   * Retorna rankings padrão em caso de erro
   */
  private getDefaultRankings(): RankingType[] {
    return [
      {
        id: 'productivity',
        name: 'Produtividade',
        description: 'Ranking baseado em metas de produtividade',
        category: 'performance',
        isActive: true
      },
      {
        id: 'sales',
        name: 'Vendas',
        description: 'Ranking baseado em volume de vendas',
        category: 'revenue',
        isActive: true
      },
      {
        id: 'quality',
        name: 'Qualidade',
        description: 'Ranking baseado em indicadores de qualidade',
        category: 'quality',
        isActive: true
      },
      {
        id: 'engagement',
        name: 'Engajamento',
        description: 'Ranking baseado em participação e engajamento',
        category: 'participation',
        isActive: true
      }
    ];
  }

  /**
   * Retorna períodos padrão
   */
  private getDefaultPeriods(): RankingPeriod[] {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    return [
      {
        id: 'current',
        name: 'Mês Atual',
        startDate: currentMonth.toISOString(),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
        isCurrent: true
      },
      {
        id: 'previous',
        name: 'Mês Anterior',
        startDate: previousMonth.toISOString(),
        endDate: new Date(now.getFullYear(), now.getMonth(), 0).toISOString(),
        isCurrent: false
      },
      {
        id: 'quarter',
        name: 'Último Trimestre',
        startDate: quarterStart.toISOString(),
        endDate: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0).toISOString(),
        isCurrent: false
      },
      {
        id: 'year',
        name: 'Ano Atual',
        startDate: yearStart.toISOString(),
        endDate: new Date(now.getFullYear(), 11, 31).toISOString(),
        isCurrent: false
      }
    ];
  }

  /**
   * Retorna participantes padrão
   */
  private getDefaultParticipants(): RankingParticipant[] {
    const names = [
      'João Silva', 'Maria Santos', 'Pedro Costa', 'Ana Oliveira', 'Carlos Ferreira',
      'Lucia Pereira', 'Roberto Lima', 'Fernanda Rocha', 'Marcos Alves', 'Patricia Gomes'
    ];

    const teams = ['Vendas Norte', 'Vendas Sul', 'Vendas Leste', 'Vendas Oeste'];

    return names.map((name, index) => ({
      id: index + 1,
      name,
      teamName: teams[index % teams.length],
      position: index + 1,
      points: Math.floor(Math.random() * 2000) + 1000,
      level: Math.floor(Math.random() * 15) + 5,
      achievements: Math.floor(Math.random() * 8),
      progress: Math.floor(Math.random() * 100),
      lastUpdated: new Date().toISOString()
    }));
  }

  /**
   * Retorna dados padrão de ranking
   */
  private getDefaultRankingData(rankingId: string): RankingData {
    return {
      id: rankingId,
      type: {
        id: 'productivity',
        name: 'Produtividade',
        description: 'Ranking baseado em metas de produtividade',
        category: 'performance',
        isActive: true
      },
      period: {
        id: 'current',
        name: 'Mês Atual',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        isCurrent: true
      },
      participants: this.getDefaultParticipants(),
      totalParticipants: 10,
      lastUpdated: new Date().toISOString(),
      metadata: {
        maxPoints: 3000,
        averagePoints: 2000
      }
    };
  }

  /**
   * Verifica se está carregando rankings
   */
  isLoadingRankingsList(): boolean {
    return this.isLoadingRankings;
  }

  /**
   * Limpa o cache dos rankings
   */
  clearCache(): void {
    this.rankingsCache = null;
    this.periodsCache = null;
    this.loadRankingsPromise = null;
  }

  /**
   * Recarrega a lista de rankings
   */
  async reloadRankings(): Promise<RankingListResponse> {
    this.clearCache();
    return this.getRankingsList();
  }
}
