import { Component, OnInit } from '@angular/core';
import { RankingService, RankingType, RankingPeriod, RankingParticipant, RankingData, DateRange } from '../../services/ranking.service';

@Component({
  selector: 'app-ranking',
  templateUrl: './ranking.component.html',
  styleUrls: ['./ranking.component.scss']
})
export class RankingComponent implements OnInit {
  
  constructor(private rankingService: RankingService) {}
  
  // Dados do serviço
  rankingTypes: RankingType[] = [];
  rankingPeriods: RankingPeriod[] = [];
  participants: RankingParticipant[] = [];

  // Estado do componente
  selectedRankingType: RankingType | null = null;
  selectedDateRange: DateRange = this.getDefaultDateRange();
  isLoading = false;
  filteredParticipants: RankingParticipant[] = [];
  currentRankingData: RankingData | null = null;
  hasGeneratedRanking = false;

  ngOnInit() {
    this.loadInitialData();
  }

  async loadInitialData() {
    try {
      this.isLoading = true;
      
      // Carrega a lista de rankings disponíveis
      const rankingsResponse = await this.rankingService.getRankingsList();
      this.rankingTypes = rankingsResponse.rankings;
      this.rankingPeriods = rankingsResponse.periods;
      
      // Seleciona o primeiro ranking por padrão
      if (this.rankingTypes.length > 0) {
        this.selectedRankingType = this.rankingTypes[0];
      }
      
      // Não carrega dados automaticamente - aguarda o usuário clicar em "Gerar Ranking"
    } catch (error) {
          } finally {
      this.isLoading = false;
    }
  }

  async onRankingTypeChange(type: RankingType) {
    this.selectedRankingType = type;
    this.hasGeneratedRanking = false;
    this.clearRankingData();
  }

  async onDateRangeChange(dateRange: DateRange) {
    this.selectedDateRange = dateRange;
    this.hasGeneratedRanking = false;
    this.clearRankingData();
  }

  async generateRanking() {
    if (!this.selectedRankingType) {
      return;
    }

    try {
      this.isLoading = true;
      
      const response = await this.rankingService.getRankingDetails(
        this.selectedRankingType.id,
        this.selectedDateRange
      );
      
      if (response.success) {
        this.currentRankingData = response.ranking;
        this.participants = response.ranking.participants;
        this.filteredParticipants = [...this.participants];
        this.hasGeneratedRanking = true;
      } else {
                // Usa dados padrão em caso de erro
        this.participants = this.getDefaultParticipants();
        this.filteredParticipants = [...this.participants];
        this.hasGeneratedRanking = true;
      }
    } catch (error) {
            // Usa dados padrão em caso de erro
      this.participants = this.getDefaultParticipants();
      this.filteredParticipants = [...this.participants];
      this.hasGeneratedRanking = true;
    } finally {
      this.isLoading = false;
    }
  }

  clearRankingData() {
    this.participants = [];
    this.filteredParticipants = [];
    this.currentRankingData = null;
    this.hasGeneratedRanking = false;
  }

  getPositionClass(position: number): string {
    if (position === 1) return 'position-gold';
    if (position === 2) return 'position-silver';
    if (position === 3) return 'position-bronze';
    return 'position-regular';
  }

  getPositionIcon(position: number): string {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return position.toString();
  }

  trackByParticipant(index: number, participant: RankingParticipant): number {
    return participant.id;
  }

  getMovementText(movement: 'up' | 'down' | 'stop' | 'new' | undefined): string {
    if (!movement) return '';
    
    const movementTexts: { [key: string]: string } = {
      'up': 'Subiu',
      'down': 'Desceu',
      'stop': 'Manteve',
      'new': 'Novo'
    };
    
    return movementTexts[movement] || '';
  }

  getDefaultDateRange(): DateRange {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  formatDateRangeName(dateRange: DateRange): string {
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    
    const startFormatted = startDate.toLocaleDateString('pt-BR');
    const endFormatted = endDate.toLocaleDateString('pt-BR');
    
    return `${startFormatted} - ${endFormatted}`;
  }

  // Método para dados padrão em caso de erro
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
}

