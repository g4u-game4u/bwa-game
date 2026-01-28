import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';

export interface Team {
  id: string;
  name: string;
  memberCount: number;
}

@Component({
  selector: 'c4u-team-selector',
  templateUrl: './c4u-team-selector.component.html',
  styleUrls: ['./c4u-team-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uTeamSelectorComponent implements OnInit {
  @Input() teams: Team[] = [];
  @Input() selectedTeam: string = '';
  @Output() teamSelected = new EventEmitter<string>();

  private readonly STORAGE_KEY = 'selectedTeamId';

  ngOnInit(): void {
    this.restoreSelection();
  }

  onTeamChange(teamId: string): void {
    this.selectedTeam = teamId;
    this.saveSelection(teamId);
    this.teamSelected.emit(teamId);
  }

  private restoreSelection(): void {
    const storedTeamId = localStorage.getItem(this.STORAGE_KEY);
    
    if (storedTeamId && this.teams.some(t => t.id === storedTeamId)) {
      this.selectedTeam = storedTeamId;
    } else if (this.teams.length > 0) {
      this.selectedTeam = this.teams[0].id;
    }
  }

  private saveSelection(teamId: string): void {
    localStorage.setItem(this.STORAGE_KEY, teamId);
  }
}
