import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from '@angular/core';

@Component({
  selector: 'c4u-porcentagem-circular',
  templateUrl: './c4u-porcentagem-circular.component.html',
  styleUrls: ['./c4u-porcentagem-circular.component.scss']
})
export class C4uPorcentagemCircularComponent implements OnChanges, OnDestroy {
  @ViewChild('circle', { static: true })
  circleRef!: ElementRef<SVGElement>;

  private _percent = 0;
  private rafIds: Array<number | null> = [null, null];

  @Input() valor: number | string | null = null;

  @Input() total: number | string | null = null;

  @Input() theme: 'red' | 'gold' | 'green' | 'blue' | 'purple' = 'green';

  /** Progresso final do anel (0–100+); visualmente limitado a 100. */
  @Input()
  set percent(val: number) {
    const n = Number(val);
    this._percent = Number.isFinite(n) ? n : 0;
  }

  get percent(): number {
    return this._percent;
  }

  /** Quando `enableRingAnimation` é true, o traço começa neste % (ex. penúltimo log). */
  @Input() animationFromPercent: number | null = null;

  @Input() enableRingAnimation = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.circleRef?.nativeElement) {
      return;
    }
    const pct = this.clampedVisualPercent(this._percent);
    const fromRaw = this.animationFromPercent;
    const from =
      fromRaw != null && Number.isFinite(Number(fromRaw))
        ? this.clampedVisualPercent(Number(fromRaw))
        : null;
    const wantAnim =
      this.enableRingAnimation &&
      from != null &&
      Math.abs(pct - from) >= 0.35 &&
      (changes['percent'] || changes['animationFromPercent'] || changes['enableRingAnimation']);

    if (wantAnim) {
      this.cancelRingAnimFrames();
      const el = this.circleRef.nativeElement;
      el.classList.add('no-dash-transition');
      this.applyDashOffset(el, from);
      this.rafIds[0] = requestAnimationFrame(() => {
        this.rafIds[1] = requestAnimationFrame(() => {
          this.rafIds[0] = null;
          this.rafIds[1] = null;
          el.classList.remove('no-dash-transition');
          this.applyDashOffset(el, pct);
        });
      });
    } else if (changes['percent'] || changes['animationFromPercent'] || changes['enableRingAnimation']) {
      this.cancelRingAnimFrames();
      const el = this.circleRef.nativeElement;
      el.classList.remove('no-dash-transition');
      this.applyDashOffset(el, pct);
    }
  }

  ngOnDestroy(): void {
    this.cancelRingAnimFrames();
  }

  private cancelRingAnimFrames(): void {
    for (let i = 0; i < this.rafIds.length; i++) {
      const id = this.rafIds[i];
      if (id != null) {
        cancelAnimationFrame(id);
      }
      this.rafIds[i] = null;
    }
  }

  private clampedVisualPercent(val: number): number {
    return Math.min(100, Math.max(0, val));
  }

  /** Mesma fórmula que antes: traço proporcional até 100% do círculo. */
  private applyDashOffset(el: SVGElement, visualPercent: number): void {
    const v = this.clampedVisualPercent(visualPercent);
    if (v >= 100) {
      el.style.strokeDashoffset = '0';
    } else {
      el.style.strokeDashoffset = String(380 - (v / 100) * (380 - 8));
    }
  }
}
