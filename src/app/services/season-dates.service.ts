import { Injectable } from '@angular/core';
import { CampaignService } from './campaign.service';

@Injectable({
  providedIn: 'root'
})
export class SeasonDatesService {

  constructor(private campaignService: CampaignService) {}

  /**
   * Obtém a data de início da temporada (campanha)
   */
  public async getSeasonStartDate(): Promise<Date> {
    return this.campaignService.getCampaignStartDate();
  }

  /**
   * Obtém a data de fim da temporada (campanha)
   */
  public async getSeasonEndDate(): Promise<Date> {
    return this.campaignService.getCampaignEndDate();
  }

  /**
   * Obtém as datas da temporada como string no formato ISO
   */
  public async getSeasonStartDateISO(): Promise<string> {
    const date = await this.getSeasonStartDate();
    return date.toISOString();
  }

  public async getSeasonEndDateISO(): Promise<string> {
    const date = await this.getSeasonEndDate();
    return date.toISOString();
  }

  /**
   * Obtém as datas da temporada como string no formato YYYY-MM-DD
   */
  public async getSeasonStartDateString(): Promise<string> {
    const date = await this.getSeasonStartDate();
    return date.toISOString().split('T')[0];
  }

  public async getSeasonEndDateString(): Promise<string> {
    const date = await this.getSeasonEndDate();
    return date.toISOString().split('T')[0];
  }

  /**
   * Obtém objeto com as datas da temporada
   */
  public async getSeasonDates(): Promise<{ start: Date; end: Date }> {
    const [start, end] = await Promise.all([
      this.getSeasonStartDate(),
      this.getSeasonEndDate()
    ]);

    return { start, end };
  }

  /**
   * Verifica se a data atual está dentro da temporada
   */
  public async isCurrentDateInSeason(): Promise<boolean> {
    const now = new Date();
    const { start, end } = await this.getSeasonDates();
    
    return now >= start && now <= end;
  }

  /**
   * Obtém o número de meses desde o início da temporada
   */
  public async getMonthsSinceSeasonStart(): Promise<number> {
    const startDate = await this.getSeasonStartDate();
    const now = new Date();
    
    const monthDiff = now.getFullYear() * 12 + now.getMonth() - 
                     startDate.getFullYear() * 12 - startDate.getMonth();
    
    return Math.max(0, monthDiff);
  }

  /**
   * Obtém o número total de meses da temporada
   */
  public async getTotalSeasonMonths(): Promise<number> {
    const { start, end } = await this.getSeasonDates();
    
    const monthDiff = end.getFullYear() * 12 + end.getMonth() - 
                     start.getFullYear() * 12 - start.getMonth();
    
    return Math.max(1, monthDiff + 1); // +1 para incluir o mês inicial
  }

  /**
   * Obtém os meses disponíveis para seleção baseado na temporada
   */
  public async getAvailableMonths(): Promise<{ id: number; name: string; date: Date }[]> {
    const { start, end } = await this.getSeasonDates();
    const months: { id: number; name: string; date: Date }[] = [];
    
    let currentDate = new Date(start);
    let id = 0;
    
    while (currentDate <= end) {
      const monthName = currentDate.toLocaleDateString('pt-BR', { 
        month: 'short', 
        year: '2-digit' 
      }).toUpperCase();
      
      months.push({
        id: id++,
        name: monthName,
        date: new Date(currentDate)
      });
      
      // Avança para o próximo mês
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return months;
  }

  /**
   * Obtém o índice do mês atual na temporada
   */
  public async getCurrentMonthIndex(): Promise<number> {
    const months = await this.getAvailableMonths();
    const now = new Date();
    
    // Encontra o mês atual ou o mais próximo
    for (let i = 0; i < months.length; i++) {
      const monthDate = months[i].date;
      if (now.getFullYear() === monthDate.getFullYear() && 
          now.getMonth() === monthDate.getMonth()) {
        return i;
      }
    }
    
    // Se não encontrou, retorna o último mês disponível
    return Math.max(0, months.length - 1);
  }

  /**
   * Obtém informações da campanha atual
   */
  public async getCampaignInfo(): Promise<{ id: number; name: string; clientId: string }> {
    const campaign = await this.campaignService.getCurrentCampaign();
    return {
      id: campaign.id,
      name: campaign.name,
      clientId: campaign.client_id
    };
  }

  /**
   * Obtém o nome da campanha atual
   */
  public async getCampaignName(): Promise<string> {
    return this.campaignService.getCampaignName();
  }

  /**
   * Obtém o ID da campanha atual
   */
  public async getCampaignId(): Promise<number> {
    return this.campaignService.getCampaignId();
  }

  /**
   * Verifica se está carregando
   */
  public isLoading(): boolean {
    return this.campaignService.isLoadingCampaign();
  }

  /**
   * Verifica se os dados já foram carregados
   */
  public isLoaded(): boolean {
    return this.campaignService.isCampaignLoaded();
  }

  /**
   * Método de debug para verificar as datas da temporada
   */
  public async debugSeasonDates(): Promise<void> {
    try {
      const { start, end } = await this.getSeasonDates();
      const months = await this.getAvailableMonths();
      const currentIndex = await this.getCurrentMonthIndex();
      const campaignInfo = await this.getCampaignInfo();
      const now = new Date();
      
    } catch (error) {
      console.error('Erro no debug:', error);
    }
  }

  /**
   * Converte uma string de data para Date, suportando múltiplos formatos
   */
  public parseDate(dateString: string): Date {
    // Se já está no formato ISO completo
    if (dateString.includes('T')) {
      return new Date(dateString);
    }
    
    // Se está no formato YYYY-MM-DD, assume início do dia
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return new Date(dateString + 'T00:00:00.000Z');
    }
    
    // Tenta parsear como está
    return new Date(dateString);
  }

  /**
   * Formata uma data para o formato ISO completo
   */
  public formatToISO(date: Date): string {
    return date.toISOString();
  }

  /**
   * Formata uma data para o formato YYYY-MM-DD
   */
  public formatToDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Limpa o cache das datas
   */
  public clearCache(): void {
    this.campaignService.clearCache();
  }

  /**
   * Recarrega os dados da campanha
   */
  public async reload(): Promise<void> {
    await this.campaignService.reloadCampaign();
  }
} 