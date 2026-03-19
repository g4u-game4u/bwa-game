import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { Reward } from './components/rewards-store/rewards-store.component';
import { TemporadaDashboard } from '../../model/temporadaDashboard.model';
import { SessaoProvider } from '../../providers/sessao/sessao.provider';
import { TemporadaService } from '../../services/temporada.service';
import { TIPO_CONSULTA_COLABORADOR } from '../dashboard/dashboard.component';
import { RecompensasService, CatalogResponse, ItemResponse, Catalog, Achievement } from '../../services/recompensas.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConvertPointsModalComponent } from './components/convert-points-modal/convert-points-modal.component';
import { Router } from '@angular/router';
import { FeaturesService } from '../../services/features.service';
import { NotificationService } from '../../services/notification.service';
import { PlayerRedeemLog } from './components/rewards-store/rewards-store.component';

// Placeholder para imagem - será tratado no template
const GIFT_ICON_PLACEHOLDER = 'placeholder-gift-icon';

@Component({
  selector: 'app-rewards',
  templateUrl: './rewards.component.html',
  styleUrls: ['./rewards.component.scss']
})
export class RewardsComponent implements AfterViewInit, OnInit {
  @ViewChild('menu')
  menu: any;

  @ViewChild('menuShadow')
  menuShadow: any;

  @ViewChild('rightMenu')
  rightMenu: any;

  @ViewChild('rightMenuHandler')
  rightMenuHandler: any;

  menuOpen = true;
  rightMenuOpen = false;

  dashReady = false;

  showDashColaborador = true

  coins = 901.2;
  points = 9012;
  price = 10;
  distributionPotAmount = 999999;
  lastUpdate = new Date();

  // Sidenav/season properties
  idConsulta: any = null;
  nomeConsulta: string = '';
  tipoConsulta: number = TIPO_CONSULTA_COLABORADOR;
  seasonData: TemporadaDashboard | null = null;

  categories: string[] = [];
  rewards: Reward[] = [];
  playerRedeemLogs: PlayerRedeemLog[] = [];
  isLoadingRewards: boolean = true;

  constructor(
    private sessao: SessaoProvider,
    private temporadaService: TemporadaService,
    private recompensasService: RecompensasService,
    private modalService: NgbModal,
    public router: Router,
    private featuresService: FeaturesService,
    private notificationService: NotificationService
  ) { }

  async ngOnInit(): Promise<void> {
    // Inicializa os dados no localStorage
    this.initializeLocalStorageData();
    this.loadMetricsFromStorage();
    this.listAchievements();

    // Garante que o usuário está carregado da API
    await this.sessao.init(true);
    const usuario = this.sessao.usuario;
    if (usuario) {
      this.idConsulta = usuario.email;
      this.nomeConsulta = usuario.full_name || usuario.name || '';
      this.tipoConsulta = TIPO_CONSULTA_COLABORADOR;
      // Note: Removed call to temporadaService.getDadosTemporadaDashboard as it uses
      // the old /game/stats endpoint which is no longer available.
      // Season data will be loaded from Funifier API via the sidenav component if needed.
    }

    // Carrega categorias e recompensas da API
    this.loadRewardsData();
  }

  private listAchievements() {
    this.recompensasService.listAchievements().subscribe((response) => {
      console.log('Achievements:', response);
    });
  }

  private initializeLocalStorageData() {
    // Inicializa as moedas se não existirem
    if (!localStorage.getItem('coins')) {
      localStorage.setItem('coins', this.coins.toString());
    }

    // Inicializa os pontos desbloqueados se não existirem
    if (!localStorage.getItem('points')) {
      localStorage.setItem('points', this.points.toString());
    }

    if (!localStorage.getItem('price')) {
      localStorage.setItem('price', this.price.toString());
    }

    // Inicializa o array de recompensas resgatadas se não existir
    if (!localStorage.getItem('redeemed_rewards')) {
      localStorage.setItem('redeemed_rewards', JSON.stringify([]));
    }
  }

  loadMetricsFromStorage() {
    this.points = parseInt(localStorage.getItem('points') || '0', 10);
    this.coins = parseInt(localStorage.getItem('coins') || '0', 10);
    this.price = parseInt(localStorage.getItem('price') || '1', 10);
  }

  ngAfterViewInit() {
    // this.toggleMenu();
    // this.nomeConsulta = 'teste';
    // this.tipoConsulta = 1;
    // this.time = {id: 1, nome: 'teste'};
    // this.toggleMenu();
    // this.dashReady = true;
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

  getSeasonData(data: TemporadaDashboard) {
    this.seasonData = data;
  }

  openConvertPointsModal() {
    const modalRef = this.modalService.open(ConvertPointsModalComponent, { size: 'md', centered: true });
    modalRef.componentInstance.price = this.price;
    modalRef.result.then((result) => {
      if (result === 'converted') {
        this.loadMetricsFromStorage();
      }
    }, () => {});
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }

  isVirtualStoreEnabled(): boolean {
    return this.featuresService.isVirtualStoreEnabled();
  }

  isLeaderboardsEnabled(): boolean {
    return this.featuresService.isLeaderboardsEnabled();
  }

  isCashDistributionEnabled(): boolean {
    return this.featuresService.isCashDistributionEnabled();
  }

  toggleRightMenu() {
    this.rightMenuOpen = !this.rightMenuOpen;
  }

  onMenuItemHover(label: string) {
    console.log('Mouse entered on:', label);
  }

  // Método para verificar se uma imagem é o placeholder
  isPlaceholderImage(imageUrl: string): boolean {
    return !imageUrl || imageUrl === GIFT_ICON_PLACEHOLDER;
  }

  // Método para obter estatísticas de imagens
  getImageStats() {
    const totalRewards = this.rewards.length;
    const placeholderCount = this.rewards.filter(r => this.isPlaceholderImage(r.imageUrl)).length;
    const realImageCount = totalRewards - placeholderCount;
    
    return {
      total: totalRewards,
      realImages: realImageCount,
      placeholders: placeholderCount,
      placeholderPercentage: (placeholderCount / totalRewards) * 100
    };
  }

  private loadRewardsData() {
    this.isLoadingRewards = true;
    this.recompensasService.listCatalogs().subscribe({
      next: (catalogResponse: CatalogResponse | Catalog[]) => {
        const catalogs = Array.isArray(catalogResponse) ? catalogResponse : (catalogResponse?.data || []);
        console.log('CatalogResponse:', catalogs);
        const catalogMap = new Map<string, string>();
        catalogs.forEach(cat => {
          catalogMap.set(String(cat._id).trim(), cat.catalog);
        });
        console.log('CatalogMap:', Array.from(catalogMap.entries()));

        this.recompensasService.listItems().subscribe({
          next: (itemResponse: ItemResponse) => {
            const items = Array.isArray(itemResponse) ? itemResponse : (itemResponse?.data || []);
            // console.log('Itens recebidos:', items);
            // Extrai os nomes dos catálogos usados nos items
            this.categories = Array.from(
              new Set(
                items
                  .map(item => {
                    const catalogId = String(item.catalogId).trim();
                    return catalogMap.get(catalogId) || 'Outros';
                  })
                  .filter(Boolean)
              )
            );
            if (this.categories.length === 0 && items.length > 0) {
              this.categories = ['Outros'];
            }
            console.log('Categorias finais:', this.categories);
            this.processItems(items, catalogMap);
            console.log('Rewards disponíveis para mapeamento:', this.rewards);
            // Após processar os itens, buscar achievements e mapear
            this.recompensasService.listAchievements().subscribe((achievements: Achievement[]) => {
              console.log('Achievements recebidos da API:', achievements);
              this.playerRedeemLogs = this.mapAchievementsToCards(achievements, this.rewards);
              console.log('Logs de resgate mapeados para cards:', this.playerRedeemLogs);
              this.isLoadingRewards = false;
            });
          },
          error: (itemError) => {
            console.error('Erro ao carregar itens:', itemError);
            this.notificationService.showSuccess('Erro ao carregar recompensas. Usando dados de demonstração.', false);
            this.isLoadingRewards = false;
          }
        });
      },
      error: (catalogError) => {
        this.notificationService.showSuccess('Erro ao carregar categorias. Usando dados de demonstração.', false);
        this.isLoadingRewards = false;
      }
    });
  }

  private processItems(items: any[], catalogMap: Map<string, string>) {
    this.rewards = items.map((item) => {
      const catalogId = String(item.catalogId).trim();
      const categoryName = catalogMap.get(catalogId) || 'Outros';
      // console.log('Item:', item, 'CatalogId:', catalogId, 'Categoria mapeada:', categoryName);
      const isLimited = item.amount > 0 && item.amount <= 10;
      const isHighlighted = item.techniques?.includes('premium') || 
                          item.techniques?.includes('featured') ||
                          false;
      const description = item.i18n?.['pt-BR']?.['description'] || 
                        item.extra?.['description'] || 
                        '';
      return {
        id: item._id || item.catalogId + '-' + item.name,
        title: item.i18n?.['pt-BR']?.name || item.name,
        amount: item.amount,
        owned: item.owned || 0,
        description: description,
        imageUrl: item.image?.medium?.url || 
                 item.image?.original?.url || 
                 item.image?.small?.url || 
                 GIFT_ICON_PLACEHOLDER,
        cost: item.requires?.[0]?.total || 0,
        category: categoryName,
        isHighlighted: isHighlighted,
        isLimited: isLimited,
        requires: item.requires || [{ item: 'coins' }]
      };
    });
    // console.log('Rewards finais:', this.rewards);
  }

  mapAchievementsToCards(achievements: Achievement[], items: Reward[]): PlayerRedeemLog[] {
    return achievements.map(ach => {
      const item = items.find(i => i.id === ach.item);
      return {
        id: ach._id.slice(-6), // agora pega os últimos 6 dígitos
        itemName: item?.title || 'Desconhecido',
        imageUrl: item?.imageUrl || '',
        redeemedAt: new Date(ach.time).toISOString(),
        price: item?.cost || 0,
        currency: item?.requires?.[0]?.item || '',
        quantity: ach.total,
        category: item?.category || '',
        requires: item?.requires || []
      };
    });
  }
} 