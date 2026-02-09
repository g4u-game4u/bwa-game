import { Component, OnInit } from '@angular/core';
import * as moment from 'moment';
import { Chart } from 'chart.js';
import { TranslateProvider } from '@providers/translate.provider';
import { iconList } from 'src/assets/svgs/constants';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import {LoadingProvider} from "@providers/loading.provider";
import {SystemParamsService} from "@services/system-params.service";
import {Title} from "@angular/platform-browser";
import {SystemInitService} from "@services/system-init.service";
import { VercelAnalyticsService } from '@services/vercel-analytics.service';

@Component({
  selector: 'page-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  translateReady: boolean = false;
  paramReady: boolean = false;

  constructor(
    translate: TranslateProvider,
    private iconRegistry: MatIconRegistry,
    private sanitizer: DomSanitizer,
    protected loadingProvider: LoadingProvider,
    private systemParamsService: SystemParamsService,
    private titleService: Title,
    private systemInitService: SystemInitService,
    private vercelAnalytics: VercelAnalyticsService
  ) {
    this.configChartJS();
    this.configMoment();
    this.configNgxTranslate(translate);

    iconList.map((item) => {
      this.iconRegistry.addSvgIcon(
        item,
        this.sanitizer.bypassSecurityTrustResourceUrl(`assets/svgs/${item}.svg`)
      );
    });
  }


  ngOnInit() {
    // Initialize Vercel Analytics
    this.vercelAnalytics.initialize();
    
    // Initialize system params asynchronously without blocking
    // This prevents NullInjectorError issues with async initialization
    this.initializeSystem();
  }

  private async initializeSystem() {
    try {
      console.log('🚀 Iniciando aplicação (modo simplificado)...');
      
      // Skip system initialization to avoid errors
      // Just set the page title with default value
      this.titleService.setTitle('Game BWA');
      this.paramReady = true;
      
      console.log('✅ Aplicação pronta!');
    } catch (error) {
      console.error('❌ Erro ao inicializar:', error);
      this.paramReady = true;
    }
  }

  /**
   * Atualiza o título da página com o nome do cliente
   */
  private async updatePageTitle() {
    try {
      const clientName = await this.systemParamsService.getParam<string>('client_name');
      if (clientName) {
        const newTitle = `Game | ${clientName}`;
        this.titleService.setTitle(newTitle);
      } else {
        // Fallback para título padrão se não conseguir obter o nome do cliente
        this.titleService.setTitle('Game | Sistema');
      }
    } catch (error) {
      console.error('Erro ao atualizar título da página:', error);
      // Mantém o título padrão em caso de erro
      this.titleService.setTitle('Game | Sistema');
    }
  }

  /**
   * Atualiza o favicon com a logo do cliente | Deixar comentado por enquanto, pois devemos criar um input de favicon para o admin depois.
   */
  private async updateFavicon() {
    // try {
    //   // Tenta obter a logo clara primeiro, depois a escura
    //   const logoUrl = await this.systemParamsService.getParam<string>('client_dark_logo_url') || 
    //                  await this.systemParamsService.getParam<string>('client_light_logo_url');
      
    //   if (logoUrl) {
    //     // Remove favicons existentes
    //     this.removeExistingFavicon();
        
    //     // Adiciona novo favicon com tipo detectado automaticamente
    //     this.addFavicon(logoUrl);
        
    //   } else {
    //     // Garante que o favicon padrão esteja presente
    //     this.ensureDefaultFavicon();
    //   }
    // } catch (error) {
    //   console.error('Erro ao atualizar favicon:', error);
    //   // Em caso de erro, garante que o favicon padrão esteja presente
    //   this.ensureDefaultFavicon();
    // }
  }

  /**
   * Remove favicons existentes
   */
  private removeExistingFavicon() {
    const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
    existingFavicons.forEach(favicon => favicon.remove());
  }

  /**
   * Adiciona novo favicon
   */
  private addFavicon(logoUrl: string) {
    const link = document.createElement('link');
    link.rel = 'icon';
    
    // Detecta o tipo de imagem baseado na extensão da URL
    const imageType = this.getImageTypeFromUrl(logoUrl);
    link.type = imageType;
    
    link.href = logoUrl;
    document.head.appendChild(link);
  }

  /**
   * Detecta o tipo de imagem baseado na extensão da URL
   */
  private getImageTypeFromUrl(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'svg':
        return 'image/svg+xml';
      case 'ico':
        return 'image/x-icon';
      default:
        return 'image/x-icon'; // Fallback
    }
  }

  /**
   * Garante que o favicon padrão esteja presente
   */
  private ensureDefaultFavicon() {
    const existingFavicon = document.querySelector('link[rel="icon"]');
    if (!existingFavicon) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/x-icon';
      link.href = 'favicon.ico';
      document.head.appendChild(link);
    }
  }

  private configMoment() {
    moment.locale(navigator.language);
  }

  private configNgxTranslate(translate: TranslateProvider) {
    translate.t.setDefaultLang(navigator.language);
    translate.t.use(navigator.language);
    translate.t.get('LANG').subscribe((_) => (this.translateReady = true));
  }

  private configChartJS() {
    Chart.defaults.font.size = 14;
    Chart.defaults.font.family = 'Urbanist';
    Chart.defaults.color = 'white';
    Chart.defaults.borderColor = 'white';
  }
}
