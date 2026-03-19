import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { from, Observable } from 'rxjs';

import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { AcessoService } from 'src/app/services/acesso.service';
import { TemporadaDashboard } from 'src/app/model/temporadaDashboard.model';
import { FeaturesService } from 'src/app/services/features.service';
import { CampaignService } from 'src/app/services/campaign.service';
import { SystemParamsService } from 'src/app/services/system-params.service';
import { DashboardColaboradorComponent } from './dashboard-colaborador/dashboard-colaborador.component';
import { BreakpointProvider } from '@providers/breakpoint-provider';

export const TIPO_CONSULTA_COLABORADOR = 0;
export const TIPO_CONSULTA_TIME = 1;

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements AfterViewInit, OnInit {
    @ViewChild('menu')
    menu: any;

    @ViewChild('menuShadow')
    menuShadow: any;

    @ViewChild('rightMenu')
    rightMenu: any;

    @ViewChild('rightMenuHandler')
    rightMenuHandler: any;

    @ViewChild(DashboardColaboradorComponent) dashboardColaboradorComp?: DashboardColaboradorComponent;

    menuOpen = true;
    rightMenuOpen = true;

    dashReady = false;

    timesReady = false;
    colaboradoresReady = false;

    idConsulta: number | any;
    tipoConsulta: number = TIPO_CONSULTA_COLABORADOR;
    nomeConsulta: string = '';
    time: { id: number; nome: string } | any;
    mesAnterior: number = 0;

    times: Array<any> | any;
    colaboradores: Array<any> | any;
    timeSelecionado: { id: number; nome: string } | any;
    colaboradorSelecionado: any;

    seasonData: TemporadaDashboard | null = null;
    hasActiveCampaign = true;
    isLoadingCampaign = true;

    getSeasonData(data: TemporadaDashboard) {
        this.seasonData = data;
    }

    async checkActiveCampaign() {
        try {
            this.isLoadingCampaign = true;

            // Usa o novo método que verifica se há uma campanha real ativa
            this.hasActiveCampaign = await this.campaignService.hasActiveRealCampaign();

            const campaign = await this.campaignService.getCurrentCampaign();

        } catch (error) {
            console.error('❌ Erro ao verificar campanha ativa:', error);
            this.hasActiveCampaign = false;
        } finally {
            this.isLoadingCampaign = false;
        }
    }

    async retryCampaignCheck() {
        // Limpa o cache da campanha antes de verificar novamente
        this.campaignService.clearCache();
        await this.checkActiveCampaign();
    }

    forceNoCampaign() {
        this.hasActiveCampaign = false;
        this.isLoadingCampaign = false;
    }

    forceActiveCampaign() {
        this.hasActiveCampaign = true;
        this.isLoadingCampaign = false;
    }

    $servicoColaborador = (term: string) => {
        return from(
            new Observable((observer) => {
                observer.next(
                    this.colaboradores.filter((colaborador: any) => {
                        // Filtrar por nome e por status ativo (deactivated_at deve ser null)
                        const nomeMatch = colaborador.full_name.toLowerCase().includes(term.toLowerCase());
                        const isAtivo = colaborador.deactivated_at === null || colaborador.deactivated_at === undefined;
                        return nomeMatch && isAtivo;
                    })
                );
                observer.complete();
            })
        )
    };

    $servicoTime = (term: string) => {
        // filter times by name
        return from(
            new Observable(
                (observer) => {
                    observer.next(
                        this.times.filter((time: any) =>
                            time.name.toLowerCase().includes(term.toLowerCase())
                        )
                    );
                    observer.complete();
                }
            )
        )
    };

    constructor(
        private breakpointProvider: BreakpointProvider,
        private sessao: SessaoProvider,
        private acessoService: AcessoService,
        private featuresService: FeaturesService,
        private campaignService: CampaignService,
        private systemParamsService: SystemParamsService
    ) {
    }

    protected clientLogoUrl: string | null = null;

    async ngOnInit() {
        await this.checkActiveCampaign();
        this.clientLogoUrl = await this.systemParamsService.getParam<string>('client_dark_logo_url') || '/assets/images/game4u_logo.png';
    }

    async ngAfterViewInit() {
        if(this.breakpointProvider.isMobile()) {
            if(!this.sessao.isColaborador()) {
                this.toggleMenu();
                this.toggleRightMenu();
            }
        } else {
            this.toggleMenu();
            this.toggleRightMenu();
        }

        if (this.showSeletores) {
            this.getTimesGestor();
            this.getColaboradoresGestor();
        } else {
            this.idConsulta = this.sessao.usuario?.email;
            this.nomeConsulta = this.sessao.usuario?.full_name || this.sessao.usuario?.name || '';
            this.tipoConsulta = TIPO_CONSULTA_COLABORADOR;
            this.time = this.sessao.usuario?.team_id;
            this.toggleMenu();
        }

        // Aguarda a verificação da campanha antes de definir dashReady
        if (!this.isLoadingCampaign) {
            this.dashReady = true;
        } else {
            // Se ainda está carregando, aguarda um pouco e verifica novamente
            setTimeout(() => {
                this.dashReady = true;
            }, 1000);
        }
    }

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        this.menu.nativeElement.classList.toggle('menu-open', this.menuOpen);
        this.menu.nativeElement.classList.toggle('menu-closed', !this.menuOpen);
        this.menuShadow.nativeElement.classList.toggle('menu-shadow-open', this.menuOpen);
        this.menuShadow.nativeElement.classList.toggle('menu-shadow-closed', !this.menuOpen);
    }

    toggleRightMenu() {
        // this.rightMenu.nativeElement.style.right = this.rightMenuOpen ? '0px' : null;
        // this.rightMenuHandler.nativeElement.style.right = this.rightMenuOpen ? `${this.rightMenuHandler.nativeElement.offsetWidth + 56}px` : null;
        this.rightMenuOpen = !this.rightMenuOpen;
    }

    mesSelecionado(mesesAnteriores: number) {
        this.mesAnterior = mesesAnteriores;
    }

    selecionaTime(time: any) {
        if (time) {
            this.colaboradorSelecionado = null;
            this.time = time;
            this.idConsulta = time.id;
            this.nomeConsulta = time.name;
            this.tipoConsulta = TIPO_CONSULTA_TIME;
            this.timeSelecionado = time;
            this.getColaboradoresGestor(undefined, time.id);
            if (!this.breakpointProvider.isMobile() && !this.menuOpen) {
                this.toggleMenu();
            }
        } else {
            this.reset(true);
            if (!this.breakpointProvider.isMobile()) {
                this.toggleMenu();
            }
            this.getColaboradoresGestor();
            if (this.colaboradorSelecionado) {
                this.selecionaColaborador(this.colaboradorSelecionado);
            }
        }
    }

    selecionaColaborador(colaborador: any) {
        if (colaborador) {
            this.time = colaborador.team_id;
            this.idConsulta = colaborador.email;
            this.nomeConsulta = colaborador.full_name;
            this.tipoConsulta = TIPO_CONSULTA_COLABORADOR;
            this.colaboradorSelecionado = colaborador;
            if (!this.breakpointProvider.isMobile() && !this.menuOpen) {
                this.toggleMenu();
            }

        } else {
            if (this.dashboardColaboradorComp) {
                this.dashboardColaboradorComp.clearStatsCache();
            }
            this.reset();
            if (!this.breakpointProvider.isMobile()) {
                this.toggleMenu();
            }
            this.getColaboradoresGestor();
            if (this.timeSelecionado) {
                this.selecionaTime(this.timeSelecionado);
            }
        }
    }

    reset(time?: boolean) {
        if (time) {
            this.timeSelecionado = null;
        } else {
            this.colaboradorSelecionado = null;
        }
        this.time = null;
        this.idConsulta = null;
        this.nomeConsulta = '';
    }

    get showSeletores() {
        return this.showDashGestor;
    }

    private getTimesGestor() {
        this.acessoService.timesGestor().then((times) => {
            this.times = times;
            this.timesReady = true;
        });
    }

    getColaboradoresGestor(nome?: string, time?: number) {
        if (!time) {
            time = this.timeSelecionado ? this.timeSelecionado.id : null;
        }
        this.acessoService.colaboradoresGestor(time).then((colaboradores) => {
            this.colaboradores = colaboradores;
            this.colaboradoresReady = true;
        });
    }

    get isTeam() {
        return this.tipoConsulta === TIPO_CONSULTA_TIME;
    }

    get showDashColaborador() {
        return (
            this.dashReady &&
            (this.sessao.isColaborador() || (this.showDashGestor && !this.isTeam))
        );
    }

    get showDashGestor(): boolean {
        return (
            (this.sessao.isAdmin() ?? false) ||
            (this.sessao.isGerente() ?? false)
        );
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

    get showTeamSelectionState(): boolean {
        return (
            !this.isLoadingCampaign && 
            this.hasActiveCampaign && 
            this.showDashGestor && 
            !this.idConsulta
        );
    }

    focusTeamSelector() {
        // Foca no campo de seleção de time
        const teamSelector = document.querySelector('c4u-typeahead[nameField="name"]') as any;
        if (teamSelector) {
            const input = teamSelector.querySelector('input');
            if (input) {
                input.focus();
            }
        }
    }
}
