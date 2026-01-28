import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

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
export class C4uCollaboratorSelectorComponent {
  @Input() collaborators: Collaborator[] = [];
  @Input() selectedCollaborator: string | null = null;
  @Output() collaboratorSelected = new EventEmitter<string | null>();

  onCollaboratorChange(userId: string): void {
    if (userId === '') {
      this.selectedCollaborator = null;
      this.collaboratorSelected.emit(null);
    } else {
      this.selectedCollaborator = userId;
      this.collaboratorSelected.emit(userId);
    }
  }
}
