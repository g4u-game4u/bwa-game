import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';

import { SeasonDatesService } from '@services/season-dates.service';

@Component({
  selector: 'c4u-seletor-mes',
  templateUrl: './c4u-seletor-mes.component.html',
  styleUrls: ['./c4u-seletor-mes.component.scss']
})
export class C4uSeletorMesComponent implements OnInit, OnChanges {
  @Output()
  onSelectedMonth = new EventEmitter<Date>();

  @Input()
  playerId: string | null = null;

  months: Array<{ id: number; name: string; date: Date }> = [];
  selected = 0;
  prevEnabled = true;
  nextEnabled = false;
  isLoading = true;

  constructor(private seasonDatesService: SeasonDatesService) {}

  async ngOnInit(): Promise<void> {
    await this.initializeMonths();
  }

  /**
   * Não reage a dados da sidebar/temporada — só a troca explícita de jogador (gamificação / gestão),
   * para não reiniciar o mês nem disparar onSelectedMonth quando o page-season atualiza.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const p = changes['playerId'];
    if (!p || p.isFirstChange() || p.previousValue === p.currentValue) {
      return;
    }
    this.months = [];
    this.isLoading = true;
    void this.initializeMonths();
  }

  /**
   * Meses = interseção da temporada (campanha). Navegação só entre eles (ex. março e abril).
   */
  private async initializeMonths(): Promise<void> {
    try {
      this.isLoading = true;
      const available = await this.seasonDatesService.getAvailableMonths();
      const desc = [...available].sort((a, b) => b.date.getTime() - a.date.getTime());
      this.months = desc.map((m, i) => ({
        id: i,
        name: m.name,
        date: new Date(m.date.getFullYear(), m.date.getMonth(), 1)
      }));

      if (this.months.length === 0) {
        const d = new Date();
        this.months = [
          {
            id: 0,
            name: this.seasonDatesService.formatMonthAbbrevPtBr(d),
            date: new Date(d.getFullYear(), d.getMonth(), 1)
          }
        ];
      }

      this.selected = 0;
      setTimeout(() => {
        this.syncNavButtons();
        this.emitSelectedMonth();
        this.isLoading = false;
      }, 100);
    } catch (error) {
      console.error('Erro ao inicializar meses:', error);
      const d = new Date();
      this.months = [
        {
          id: 0,
          name: this.seasonDatesService.formatMonthAbbrevPtBr(d),
          date: new Date(d.getFullYear(), d.getMonth(), 1)
        }
      ];
      this.selected = 0;
      setTimeout(() => {
        this.syncNavButtons();
        this.emitSelectedMonth();
        this.isLoading = false;
      }, 100);
    }
  }

  private emitSelectedMonth(): void {
    const row = this.months[this.selected];
    if (row) {
      this.onSelectedMonth.emit(new Date(row.date.getFullYear(), row.date.getMonth(), 1));
    }
  }

  private syncNavButtons(): void {
    if (this.months.length === 0) {
      this.prevEnabled = false;
      this.nextEnabled = false;
      return;
    }
    this.prevEnabled = this.selected < this.months.length - 1;
    this.nextEnabled = this.selected > 0;
  }

  getPrevMonth(): string {
    if (this.prevEnabled && this.selected < this.months.length - 1) {
      return this.months[this.selected + 1].name;
    }
    return '';
  }

  getNextMonth(): string {
    if (this.nextEnabled && this.selected > 0) {
      return this.months[this.selected - 1].name;
    }
    return '';
  }

  onChange(): void {
    this.syncNavButtons();
    this.emitSelectedMonth();
  }

  goLeft(): void {
    if (this.prevEnabled && this.selected < this.months.length - 1) {
      this.selected++;
      this.onChange();
    }
  }

  goRight(): void {
    if (this.nextEnabled && this.selected > 0) {
      this.selected--;
      this.onChange();
    }
  }
}
