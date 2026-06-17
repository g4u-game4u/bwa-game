import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-help-center-search',
  templateUrl: './help-center-search.component.html',
  styleUrls: ['./help-center-search.component.scss'],
})
export class HelpCenterSearchComponent {
  @Input() value = '';
  @Input() placeholder = 'Buscar na central de ajuda...';
  @Output() valueChange = new EventEmitter<string>();

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.valueChange.emit(target.value);
  }

  clear(): void {
    this.valueChange.emit('');
  }
}
