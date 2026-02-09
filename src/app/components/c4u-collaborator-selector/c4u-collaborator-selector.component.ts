import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';

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
export class C4uCollaboratorSelectorComponent implements OnChanges {
  @Input() collaborators: Collaborator[] = [];
  @Input() selectedCollaborator: string | null = null;
  @Output() collaboratorSelected = new EventEmitter<string | null>();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Detect changes when selectedCollaborator or collaborators are updated
    // Don't reset selectedCollaborator here - let the parent component handle validation
    // This ensures the selection persists during data loading
    if (changes['selectedCollaborator'] || changes['collaborators']) {
      this.cdr.markForCheck();
    }
  }

  onCollaboratorChange(userId: string): void {
    if (userId === '') {
      this.selectedCollaborator = null;
      this.collaboratorSelected.emit(null);
    } else {
      this.selectedCollaborator = userId;
      this.collaboratorSelected.emit(userId);
    }
    this.cdr.markForCheck();
  }
}
