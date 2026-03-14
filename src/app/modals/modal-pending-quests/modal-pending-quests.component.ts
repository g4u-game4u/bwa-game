import {Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild} from '@angular/core';
import {C4uModalComponent} from "../../components/c4u-modal/c4u-modal.component";
import {BotaoSelecaoItemModel} from "../../components/c4u-botao-selecao/c4u-botao-selecao.component";
import {TabBarItemModel} from "../../components/c4u-tabbar/c4u-tabbar.component";
import { SessaoProvider } from 'src/app/providers/sessao/sessao.provider';
import { AliasService } from 'src/app/services/alias.service';

@Component({
  selector: 'modal-pending-quests',
  templateUrl: './modal-pending-quests.component.html',
  styleUrls: ['./modal-pending-quests.component.scss']
})
export class ModalPendingQuestsComponent implements OnChanges, OnInit {
  constructor(private sessao: SessaoProvider, private aliasService: AliasService) {}

  @ViewChild(C4uModalComponent)
  private modal: C4uModalComponent | null = null;

  @Input()
  data: ModalData | undefined;
  aliases: any;
  modalData: ModalData = <any>{};

  private firstPage = 1;
  private defaultPageSize = 10;

  showLoading: boolean = false;

  get typeButtons(): Array<BotaoSelecaoItemModel> | undefined {
    return this.modalData?.types?.map(tp => tp.btn);
  }

  get tabsByType(): Array<TabBarItemModel> | undefined {
    return this.modalData?.types[this.modalData?.typeSelected].tabItens?.map(ti => ti.tabBarItem);
  }

  get currentTab(): TabItemModal | undefined {
    return this.modalData?.types[this.modalData?.typeSelected]?.tabItens[this.modalData?.tabSelected];
  }

  get dataByTab(): ApiDataModal | undefined {
    return this.modalData?.types[this.modalData?.typeSelected].tabItens[this.modalData?.tabSelected]?.data;
  }

  get titleByTab(): string {
    return this.modalData?.types[this.modalData?.typeSelected].tabItens[this.modalData?.tabSelected]?.title || "";
  }

  selectType(type: number) {
    this.modalData.typeSelected = type;
    this.modalData.tabSelected = 0;
    this.getData();
  }
  

  selectTab(tab: number) {
    this.modalData.tabSelected = tab;
    this.getData();
  }

  getData() {
    let tabItem = this.currentTab;
    if (tabItem) {
      if (!tabItem.data && tabItem.dataApi) {
        this.updateData(tabItem);
      }
    }
  }

  updateData(tabItem: TabItemModal, page: number = this.firstPage, pageSize: number = this.defaultPageSize, previousData?: Array<any>) {
    if (tabItem && tabItem.dataApi) {
      tabItem.dataApi(page, pageSize, previousData).then(dt => {
        if (this.currentTab) {
          this.currentTab.data = dt;
          this.showLoading = false;
        }
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.modalData = this.data ? this.data : <any>{};
  }

  ngOnInit() {
    this.modalData = this.data ? this.data : <any>{};
    this.getData();
    this.loadAliases();
  }

  nextPage() {
    this.showLoading = true;
    let currentData = this.currentTab?.data;
    if (this.currentTab && this.currentTab?.data) {
      this.currentTab.data.hasNext = false;
      this.updateData(this.currentTab, (currentData?.page || this.firstPage) + 1, currentData?.pageSize, currentData?.results);
    }
  }

  openDetailLink(url: string | undefined) {
        if (url) {
      window.open(url, "_blank");
    }
    return false;
  }

  /**
   * Manipula o clique no link
   * @param event Evento de clique
   * @param item Dados do item clicado
   * @param isUserAction Se é uma ação do usuário (true) ou entrega (false)
   */
  handleLinkClick(event: Event, item: any, isUserAction: boolean) {
    event.preventDefault();
    event.stopPropagation();
    
        if (!this.aliases) {
            return;
    }
    
    if (!this.getRedirectUrl(isUserAction, item)) {
            return;
    }

    let url: string;
    let idToUse: string | number;
    
    if (isUserAction) {
      const integrationId = item.integration_id || item.delivery_id;
      // Extrai apenas o conteúdo após o underline se houver
      idToUse = this.extractIdAfterUnderline(integrationId);
      url = this.userActionRedirectUrl(idToUse);
          } else {
      // Extrai apenas o conteúdo após o underline se houver
      idToUse = this.extractIdAfterUnderline(item.id);
      url = this.deliveryRedirectUrl(idToUse);
          }

    if (url && url.trim().length > 0) {
            const newWindow = window.open(url, "_blank");
      if (!newWindow) {
                alert('Pop-up bloqueada. Por favor, permita pop-ups para este site.');
      }
    } else {
          }
  }

  /**
   * Extrai apenas o conteúdo após o underline (_) se existir
   * @param id ID a ser processado
   * @returns ID sem o prefixo antes do underline
   * @example "prefix_12345" -> "12345"
   * @example "12345" -> "12345" (sem underline, retorna original)
   */
  private extractIdAfterUnderline(id: string | number | undefined): string | number {
    if (!id) {
      return '';
    }

    const idString = id.toString();
    
    // Verifica se há underline no texto
    const hasUnderline = /_/.test(idString);
    
    if (hasUnderline) {
      // Usa regex para capturar apenas o conteúdo após o último underline
      const match = idString.match(/_([^_]+)$/);
      if (match && match[1]) {
                return match[1];
      }
    }
    
        return id;
  }

  formatEmailToName(email: string): string {
    if (!email) return '';
    
    // Remove a parte do domínio do email
    const namePart = email.split('@')[0];
    
    // Verifica se o nome contém um ponto final
    if (namePart.includes('.')) {
      // Se contém ponto, separa por ponto e capitaliza ambas as partes
      const parts = namePart.split('.');
      return parts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    } else {
      // Se não contém ponto, capitaliza somente o primeiro nome
      return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
    }
  }

  hasAdminRole(): boolean {
    return this.sessao.isAdmin() || false;
  }

  /**
   * Obtém o team_id do usuário logado
   * @returns team_id do usuário ou undefined se não disponível
   */
  getTeamId(): number | undefined {
    return this.modalData.teamSelected || this.sessao.usuario?.team_id;
  }

  /**
   * Obtém o team_id formatado como string para corresponder às chaves do team_redirect_url
   * Exemplo: 16 -> "16"
   * @returns team_id formatado como string ou undefined se não disponível
   */
  getFormattedTeamId(): string | undefined {
    const teamId = this.getTeamId();
    return teamId ? teamId.toString() : undefined;
  }

  async loadAliases() {
    this.aliases = await this.aliasService.getAliases();
          }

  /**
   * Gera a URL de redirecionamento para ações do usuário
   * Substitui o placeholder $(id) pelo integration_id real
   * @param integrationId ID da integração
   * @returns URL formatada ou string vazia se não configurada
   */
  userActionRedirectUrl(integrationId: string | number): string {
    const teamId = this.getFormattedTeamId();
    const baseUrl = teamId ? this.aliases?.teamRedirectUrl?.[teamId]?.userActionRedirectUrl : '';
    
        if (!baseUrl || !integrationId) {
      return '';
    }
    
    return this.replaceUrlPlaceholder(baseUrl, integrationId);
  }

  /**
   * Gera a URL de redirecionamento para entregas
   * Substitui o placeholder $(id) pelo id real
   * @param deliveryId ID da entrega
   * @returns URL formatada ou string vazia se não configurada
   */
  deliveryRedirectUrl(deliveryId: string | number): string {
    const teamId = this.getFormattedTeamId();
    const baseUrl = teamId ? this.aliases?.teamRedirectUrl?.[teamId]?.deliveryRedirectUrl : '';
    
        if (!baseUrl || !deliveryId) {
      return '';
    }
    
    return this.replaceUrlPlaceholder(baseUrl, deliveryId);
  }

  /**
   * Substitui o placeholder $(id) na URL pelo ID real
   * @param url URL base com placeholder
   * @param id ID real para substituição
   * @returns URL com placeholder substituído
   */
  private replaceUrlPlaceholder(url: string, id: string | number): string {
    try {
      // Remove espaços em branco e caracteres especiais do início/fim
      const cleanUrl = url.trim();
      
      // Substitui o placeholder $(id) pelo ID real
      const formattedUrl = cleanUrl.replace(/\$\(id\)/g, id.toString());
      
      // Valida se a URL resultante é válida
      if (this.isValidUrl(formattedUrl)) {
        return formattedUrl;
      } else {
                return '';
      }
    } catch (error) {
            return '';
    }
  }

  /**
   * Valida se uma URL é válida
   * @param url URL para validar
   * @returns true se a URL for válida
   */
  private isValidUrl(url: string): boolean {
    try {
      // Verifica se é uma URL válida
      new URL(url);
      return true;
    } catch {
      // Se não conseguir criar um objeto URL, tenta validar como URL relativa
      return url.startsWith('/') || url.startsWith('./') || url.startsWith('../');
    }
  }

  /**
   * Obtém a URL base de redirecionamento para ações do usuário
   */
  get userActionRedirectUrlBase(): string {
    return this.aliases?.userActionRedirectUrl || '';
  }

  /**
   * Obtém a URL base de redirecionamento para entregas
   */
  get deliveryRedirectUrlBase(): string {
    return this.aliases?.deliveryRedirectUrl || '';
  }

  /**
   * Verifica se existe uma URL de redirecionamento disponível para o item
   * @param isUserAction Se é uma ação do usuário (true) ou entrega (false)
   * @param item Dados do item
   * @returns true se existe URL de redirecionamento configurada
   */
  getRedirectUrl(isUserAction: boolean, item: any): boolean {
    if (!this.aliases) {
            return false;
    }

    const teamId = this.getFormattedTeamId();
        if (isUserAction) {
      const integrationId = item.integration_id || item.delivery_id;
      const hasUrl = !!(teamId && this.aliases?.teamRedirectUrl?.[teamId!]?.userActionRedirectUrl && integrationId);
            return hasUrl;
    } else {
      const hasUrl = !!(teamId && this.aliases?.teamRedirectUrl?.[teamId!]?.deliveryRedirectUrl && item.id);
            return hasUrl;
    }
  }
}


export interface ModalData {
  teamSelected: number | null;
  title: string;
  typeSelected: number;
  tabSelected: number;
  types: Array<TypeModalData>
}

export interface TabItemModal {
  tabBarItem: TabBarItemModel,
  title: any,
  data?: ApiDataModal,
  dataApi?: (page: number, pageSize: number, previousResults?: Array<any>) => Promise<ApiDataModal>
}

export interface TypeModalData {
  btn: BotaoSelecaoItemModel,
  tabItens: Array<TabItemModal>
}

export interface DetailModalData {
  id?: string,
  url?: string,
  name?: string,
  text?: string
}

export interface SectionDetailModalData {
  title?: string,
  details?: Array<any>
}

export interface ApiDataModal {
  hasNext?: boolean,
  page?: number,
  pageSize?: number,
  total?: number,
  results?: Array<any>,
  sections: Array<SectionDetailModalData>
}

