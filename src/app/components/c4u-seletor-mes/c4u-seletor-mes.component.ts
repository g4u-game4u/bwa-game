import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import {SessaoProvider} from '@providers/sessao/sessao.provider';
import * as moment from "moment";

import {TemporadaDashboard} from 'src/app/model/temporadaDashboard.model';
import {SeasonDatesService} from "@services/season-dates.service";
import {ActionLogService} from "@services/action-log.service";
import {firstValueFrom} from "rxjs";

@Component({
    selector: 'c4u-seletor-mes',
    templateUrl: './c4u-seletor-mes.component.html',
    styleUrls: ['./c4u-seletor-mes.component.scss']
})
export class C4uSeletorMesComponent implements OnInit, OnChanges {
  private PREV_MONTHS: number = 0;
    private IS_TESTER = false;

    @Output()
    onSelectedMonth = new EventEmitter();

    @Input()
    seasonData: TemporadaDashboard | null = null;
    
    @Input()
    playerId: string | null = null;

    /** Painel individual: ocultar filtro "Toda temporada" e forçar sempre um mês. */
    @Input()
    showTodaTemporadaButton = true;

    static readonly TODA_TEMPORADA_ID = -1;

    months: Array<any> = []
    selected: number = 0;
    prevEnabled = true;
    nextEnabled = false;
    isLoading = true;
    isTodaTemporada = false;

    constructor(
      private sessao: SessaoProvider,
      private seasonDatesService: SeasonDatesService,
      private actionLogService: ActionLogService
    ) {}

    async ngOnInit() {
      await this.initializeMonths();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['showTodaTemporadaButton']?.currentValue === false && this.isTodaTemporada) {
            this.isTodaTemporada = false;
        }
        // const slaDate =
        //   moment(moment().diff(this.seasonData?.datas.dataInicio)).month() + 1;
        // const slaDate = this.PREV_MONTHS;
        this.months = [];
        this.isLoading = true;
        this.populateFields(this.PREV_MONTHS);
    }

    private async initializeMonths() {
      try {
        this.isLoading = true; // Ativa loading
        
        // Verifica se o usuário é ADMIN
        if (this.sessao.isAdmin()) {
          this.PREV_MONTHS = 6;
        } else {
          // this.PREV_MONTHS = 10 - (moment().month()); //ENQUANTO ESTIVERMOS EM AUDITORIA, NÃO PERMITIR ACESSO A MESES ANTERIORES
          const month = await this.seasonDatesService.getMonthsSinceSeasonStart();
          if (month > 0) {
            this.PREV_MONTHS = month;
          } else {
            // Se a temporada ainda não começou, mostra pelo menos 1 mês
            this.PREV_MONTHS = 1;
          }
        }

        // Verifica se há dados de janeiro e inclui janeiro se necessário
        await this.checkAndIncludeJanuary();

        this.populateFields(this.PREV_MONTHS, true); // Suppress initial emit - dashboard already loads data
      } catch (error) {
                // Fallback para valores padrão
        this.PREV_MONTHS = 1;
        this.populateFields(this.PREV_MONTHS, true);
      } finally {
        // Garante que loading seja desativado mesmo em caso de erro
        setTimeout(() => {
          this.isLoading = false;
        }, 100);
      }
    }

    /**
     * Verifica se há dados de janeiro para o jogador e inclui janeiro na lista se necessário
     */
    private async checkAndIncludeJanuary(): Promise<void> {
      const playerId = this.playerId || (this.sessao.usuario as { _id?: string; email?: string } | null)?._id || 
                      (this.sessao.usuario as { _id?: string; email?: string } | null)?.email;
      
      if (!playerId) {
        return; // Não há playerId disponível
      }

      try {
        // Verifica se estamos em fevereiro de 2026 ou posterior
        const now = moment();
        const currentYear = now.year();
        const currentMonth = now.month(); // 0-indexed: 0 = January, 1 = February
        
        // Se estamos em fevereiro de 2026 ou posterior, verifica se há dados de janeiro
        if (currentYear === 2026 && currentMonth >= 1) {
          const januaryDate = moment('2026-01-01');
          
          // Verifica se há dados de janeiro no action_log
          const januaryData = await firstValueFrom(
            this.actionLogService.getPlayerActionLogForMonth(playerId, januaryDate.toDate())
          );
          
          // Se há dados de janeiro, garante que janeiro esteja incluído
          if (januaryData && januaryData.length > 0) {
            // Se estamos em fevereiro (month 1) e PREV_MONTHS é 1 (apenas fevereiro),
            // precisamos adicionar janeiro (PREV_MONTHS deve ser pelo menos 2)
            if (currentMonth === 1 && this.PREV_MONTHS === 1) {
              this.PREV_MONTHS = 2;
                          }
            // Para meses posteriores, se PREV_MONTHS não inclui janeiro, garantimos que inclua
            else if (currentMonth > 1) {
              const seasonStart = await this.seasonDatesService.getSeasonStartDate();
              if (seasonStart.getFullYear() === 2026 && seasonStart.getMonth() === 0) {
                // Temporada começou em janeiro, então precisamos garantir que janeiro esteja incluído
                // PREV_MONTHS deve ser pelo menos (currentMonth + 1) para incluir janeiro
                const minMonths = currentMonth + 1;
                if (this.PREV_MONTHS < minMonths) {
                  this.PREV_MONTHS = minMonths;
                                  }
              }
            }
          }
        }
      } catch (error) {
                // Não bloqueia a inicialização se houver erro
      }
    }

    private populateFields(value: number, suppressEmit: boolean = false) {
        this.months = []; // Limpa meses anteriores
        
        if (value && value > 0) {
            Array(value).fill(0).forEach((_, i) => {
                const month = moment().subtract(i, 'months');
                this.months.push({id: i, name: month.format("MMM/YY").toUpperCase()});
            });
        } else {
            // Fallback: pelo menos um mês
            const currentMonth = moment();
            this.months.push({id: 0, name: currentMonth.format("MMM/YY").toUpperCase()});
        }

        setTimeout(() => {
            if (!suppressEmit) {
                this.onChange();
            } else {
                // Still update prev/next button states without emitting
                if (this.months.length > 0) {
                    this.prevEnabled = (this.selected !== this.months.length - 1);
                    this.nextEnabled = (this.selected !== 0);
                }
            }
            this.isLoading = false;
        }, 150);
    }

    getPrevMonth() {
        if (this.prevEnabled && this.months.length > 0 && this.selected < this.months.length - 1) {
            return this.months[this.selected + 1].name;
        } else {
            return moment().subtract(this.PREV_MONTHS, 'months').format("MMM/YY").toUpperCase();
        }
    }

    getNextMonth() {
        if (this.nextEnabled && this.months.length > 0 && this.selected > 0) {
            return this.months[this.selected - 1].name;
        } else {
            return moment().add(1, 'months').format("MMM/YY").toUpperCase();
        }
    }

    onChange() {
        if (this.isTodaTemporada) {
            this.prevEnabled = false;
            this.nextEnabled = false;
            this.onSelectedMonth.emit(C4uSeletorMesComponent.TODA_TEMPORADA_ID);
            return;
        }
        if (this.months.length > 0) {
            this.prevEnabled = (this.selected !== this.months.length - 1);
            this.nextEnabled = (this.selected !== 0);
            this.onSelectedMonth.emit(this.selected);
        }
    }

    onMonthDropdownChange() {
        // When user picks a month from the dropdown, exit "Toda temporada" mode
        this.isTodaTemporada = false;
        this.onChange();
    }

    selectTodaTemporada() {
        this.isTodaTemporada = true;
        this.onChange();
    }

    selectMonth(index?: number) {
        if (this.isTodaTemporada) {
            this.isTodaTemporada = false;
            if (index !== undefined) {
                this.selected = index;
            }
            this.onChange();
        }
    }

    goLeft() {
        if (this.isTodaTemporada) return;
        if ((this.prevEnabled || this.IS_TESTER) && this.months.length > 0 && this.selected < this.months.length - 1) {
            this.selected++;
            this.onChange();
        }
    }

    goRight() {
        if (this.isTodaTemporada) return;
        if ((this.nextEnabled || this.IS_TESTER) && this.months.length > 0 && this.selected > 0) {
            this.selected--;
            this.onChange();
        }
    }
}

