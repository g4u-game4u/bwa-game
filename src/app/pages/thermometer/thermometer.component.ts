import { Component, OnInit, ViewChild } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Router } from '@angular/router';
import { FeaturesService } from 'src/app/services/features.service';
import { TemporadaDashboard } from '@model/temporadaDashboard.model';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { AcessoService } from 'src/app/services/acesso.service';
import { SeasonDatesService } from 'src/app/services/season-dates.service';

interface StageMarker {
  percentage: number;
  label: string;
  color: string;
  reward: string;
}

interface RewardTier {
  percentage: number;
  tier: string;
  color: string;
}

export const TIPO_CONSULTA_COLABORADOR = 0;
export const TIPO_CONSULTA_TIME = 1;


@Component({
    selector: 'app-thermometer',
    templateUrl: './thermometer.component.html',
    styleUrls: ['./thermometer.component.scss']
  })
  export class ThermometerComponent implements OnInit {
    @ViewChild('menu')
    menu: any;

    @ViewChild('menuShadow')
    menuShadow: any;
  
    // Sidenav/season properties

  
    // Mock data - em uma aplicação real, isso viria da sua API
    mockData = {
      currentProgress: 67, // 67% da meta
      goalAmount: 1000000, // Meta de $1M
      currentAmount: 670000, // $670K alcançado
      teamSize: 25,
    };

      currentProgress: number = 0;
  goalAmount: number = 0;
  currentAmount: number = 0;
  teamSize: number = 0;
  currentTier!: RewardTier;
  nextTier: RewardTier | null = null;
  totalReward: number = 0;
  individualReward: number = 0;
  stageMarkers: StageMarker[] = [];
  seasonData: TemporadaDashboard | null = null;
  seasonShellReady = false;
  menuOpen = true;
  idConsulta: number | any;
  tipoConsulta: number = TIPO_CONSULTA_COLABORADOR;
  nomeConsulta: string = '';
  time: { id: number; nome: string } | any;
    dashReady = false;


    
    constructor(
      public router: Router,
      private sessao: SessaoProvider,
    private acessoService: AcessoService,
    private seasonDatesService: SeasonDatesService,
    ) {
      this.currentProgress = this.mockData.currentProgress;
      this.goalAmount = this.mockData.goalAmount;
      this.currentAmount = this.mockData.currentAmount;
      this.teamSize = this.mockData.teamSize;
      
      this.stageMarkers = [
        { percentage: 25, label: '> 50%', color: '#EF4444', reward: '0.1%' },
        { percentage: 50, label: '50%', color: '#F59E0B', reward: '0.2%' },
        { percentage: 70, label: '70%', color: '#06B6D4', reward: '0.5%' },
        { percentage: 100, label: '100%', color: '#10B981', reward: '0.9%' },
      ];

      this.calculateRewards();
    }
  
    async ngOnInit(): Promise<void> {
      try {
        await this.seasonDatesService.ensureCampaignDatesLoaded();
      } catch (e) {
        console.error('Termómetro: campanha/datas antes do season shell:', e);
      }
      this.idConsulta = this.sessao.usuario?.email;
      this.nomeConsulta = this.sessao.usuario?.full_name || this.sessao.usuario?.name || '';
      this.tipoConsulta = TIPO_CONSULTA_COLABORADOR;
      this.time = this.sessao.usuario?.team_id;
      this.seasonShellReady = true;
    }
    
    // Calcula o tier de recompensa baseado no progresso
    getRewardTier(progress: number): RewardTier {
      if (progress >= 100) return { percentage: 4, tier: 'CHAMPION', color: 'text-green-400' };
      if (progress >= 70) return { percentage: 3, tier: 'ELITE', color: 'text-orange-400' };
      if (progress >= 50) return { percentage: 2, tier: 'RISING', color: 'text-cyan-400' };
      return { percentage: 1, tier: 'BUILDING', color: 'text-red-400' };
    }

    // Obtém a cor do termômetro baseada no progresso atual
    getThermometerColor(progress: number): string {
      if (progress >= 100) return '#10B981'; // Verde
      if (progress >= 70) return '#F59E0B'; // Laranja
      if (progress >= 50) return '#06B6D4'; // Ciano
      return '#EF4444'; // Vermelho
    }

    // Calcula as recompensas
    calculateRewards(): void {
      this.currentTier = this.getRewardTier(this.currentProgress);
      this.nextTier = this.currentProgress < 100 ? this.getRewardTier(Math.min(this.currentProgress + 1, 100)) : null;
      
      // Calcula recompensa total
      this.totalReward = (this.currentAmount * this.currentTier.percentage) / 100;
      this.individualReward = this.totalReward / this.teamSize;
    }

    // Verifica se é o tier atual
    isCurrentTier(index: number): boolean {
      return (
        (index === 0 && this.currentProgress < 50) ||
        (index === 1 && this.currentProgress >= 50 && this.currentProgress < 70) ||
        (index === 2 && this.currentProgress >= 70 && this.currentProgress < 100) ||
        (index === 3 && this.currentProgress >= 100)
      );
    }

    // Obtém o próximo tier necessário
    getNextTierRequired(): string {
      if (this.currentProgress >= 70) return '100%';
      if (this.currentProgress >= 50) return '70%';
      return '50%';
    }

    // Calcula o potencial máximo por pessoa
    getMaxPotentialPerPerson(): number {
      return (this.goalAmount * 0.04) / this.teamSize;
    }

    // Calcula o potencial do próximo tier
    getNextTierPotential(): number {
      if (!this.nextTier) return 0;
      return (this.goalAmount * this.nextTier.percentage) / 100 / this.teamSize;
    }


    getSeasonData(data: TemporadaDashboard) {
      this.seasonData = data;
  }

  toggleMenu() {
    this.menu.nativeElement.style.left = this.menuOpen
        ? `-${this.menu.nativeElement.offsetWidth - 56}px`
        : null;
    this.menuShadow.nativeElement.style.width = this.menuOpen ? '56px' : null;
    this.menuShadow.nativeElement.style.minWidth = this.menuOpen
        ? '56px'
        : null;
    this.menuOpen = !this.menuOpen;
}

get showDashColaborador() {
  return (
      this.dashReady &&
      (this.sessao.isColaborador() || (this.showDashGestor && !this.isTeam))
  );
}

get isTeam() {
  return this.tipoConsulta === TIPO_CONSULTA_TIME;
}

get showDashGestor() {
  return (
      this.sessao.isAdmin() ||
      this.sessao.isGerente()
  );
}

  } 