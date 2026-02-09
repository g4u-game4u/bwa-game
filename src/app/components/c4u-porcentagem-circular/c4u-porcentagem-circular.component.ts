import {Component, Input, ViewChild} from '@angular/core';

@Component({
    selector: 'c4u-porcentagem-circular',
    templateUrl: './c4u-porcentagem-circular.component.html',
    styleUrls: ['./c4u-porcentagem-circular.component.scss']
})
export class C4uPorcentagemCircularComponent {
    @ViewChild('circle', {static: true})
    circle: any

    private _percent: number = 0;

    @Input()
    valor: number | string | null = null;

    @Input()
    total: number | string | null = null;

    @Input()
    theme: 'red' | 'gold' | 'green' | 'blue' | 'purple' = 'green';

    @Input()
    set percent(val: number) {
        if (this.circle) {
            // Cap the visual progress at 100% for the circle (full circle)
            // But allow displaying percentages above 100% in the text
            const visualPercent = Math.min(val, 100);
            if (visualPercent < 100) {
                this.circle.nativeElement.style.strokeDashoffset = 380 - (visualPercent / 100) * (380 - 8);
            } else {
                this.circle.nativeElement.style.strokeDashoffset = 0;
            }
        }

        this._percent = val;
    }

    get percent(): number {
        return this._percent;
    }
}
