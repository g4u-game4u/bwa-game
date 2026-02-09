import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges, SimpleChanges, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';

export interface Collaborator {
  userId: string;
  name: string;
  email: string;
}

@Component({
  selector: 'c4u-collaborator-selector',
  templateUrl: './c4u-collaborator-selector.component.html',
  styleUrls: ['./c4u-collaborator-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uCollaboratorSelectorComponent implements OnChanges, AfterViewChecked {
  @Input() collaborators: Collaborator[] = [];
  @Input() selectedCollaborator: string | null = null;
  @Output() collaboratorSelected = new EventEmitter<string | null>();
  @ViewChild('collaboratorSelect', { static: false }) selectElement?: ElementRef<HTMLSelectElement>;

  private lastSelectedValue: string | null = null;
  private needsUpdate: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Detect changes when selectedCollaborator or collaborators are updated
    if (changes['selectedCollaborator'] || changes['collaborators']) {
      // Se os colaboradores mudaram, verificar se o selectedCollaborator ainda é válido
      if (changes['collaborators'] && this.selectedCollaborator) {
        const exists = this.collaborators.some(c => c.userId === this.selectedCollaborator);
        if (!exists && this.selectedCollaborator) {
          // Não resetar aqui, apenas marcar para atualização
          // O componente pai vai lidar com a validação
          console.warn('Selected collaborator not in new list, but keeping selection for parent to handle');
        }
      }
      
      // Marcar que precisa atualizar o select se o valor mudou
      if (changes['selectedCollaborator'] && this.selectedCollaborator !== this.lastSelectedValue) {
        this.needsUpdate = true;
        this.lastSelectedValue = this.selectedCollaborator;
      }
      
      this.cdr.markForCheck();
    }
  }

  ngAfterViewChecked(): void {
    // Garantir que o select está sincronizado com o valor
    if (this.needsUpdate && this.selectElement?.nativeElement) {
      const select = this.selectElement.nativeElement;
      const expectedValue = this.selectedCollaborator || '';
      
      // Só atualizar se o valor estiver diferente
      if (select.value !== expectedValue) {
        select.value = expectedValue;
        console.log('🔄 Forced select update to:', expectedValue);
      }
      
      this.needsUpdate = false;
    }
  }

  getSelectValue(): string {
    // Return empty string if no collaborator is selected (shows "Escolha um colaborador")
    return this.selectedCollaborator || '';
  }

  getSelectedCollaboratorName(): string | null {
    if (!this.selectedCollaborator) {
      return null;
    }
    const collaborator = this.collaborators.find(c => c.userId === this.selectedCollaborator);
    return collaborator?.name || null;
  }

  onCollaboratorChange(userId: string): void {
    if (userId === '' || userId === 'RESET') {
      // Reset selection - show all collaborators
      this.selectedCollaborator = null;
      this.lastSelectedValue = null;
      this.collaboratorSelected.emit(null);
    } else {
      // Select specific collaborator
      this.selectedCollaborator = userId;
      this.lastSelectedValue = userId;
      this.collaboratorSelected.emit(userId);
    }
    this.cdr.markForCheck();
  }
}
