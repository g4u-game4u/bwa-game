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
        if (this.circle && val < 100) {
            this.circle.nativeElement.style.strokeDashoffset = 380 - (val / 100) * (380 - 8);
        } else if (val >= 100) {
            this.circle.nativeElement.style.strokeDashoffset = 0;
        }

        this._percent = val;
    }

    get percent(): number {
        return this._percent;
    }
}
