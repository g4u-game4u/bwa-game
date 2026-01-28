import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { C4uTeamSelectorComponent } from './c4u-team-selector.component';

describe('C4uTeamSelectorComponent', () => {
  let component: C4uTeamSelectorComponent;
  let fixture: ComponentFixture<C4uTeamSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uTeamSelectorComponent],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uTeamSelectorComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit correct team ID when team is selected', (done) => {
    const teams = [
      { id: 'team1', name: 'Team 1', memberCount: 5 },
      { id: 'team2', name: 'Team 2', memberCount: 10 }
    ];

    component.teams = teams;
    component.selectedTeam = 'team1';
    fixture.detectChanges();

    component.teamSelected.subscribe((teamId: string) => {
      expect(teamId).toBe('team2');
      done();
    });

    component.onTeamChange('team2');
  });

  it('should save selected team to localStorage', () => {
    const teams = [
      { id: 'team1', name: 'Team 1', memberCount: 5 },
      { id: 'team2', name: 'Team 2', memberCount: 10 }
    ];

    component.teams = teams;
    fixture.detectChanges();

    component.onTeamChange('team2');

    expect(localStorage.getItem('selectedTeamId')).toBe('team2');
  });

  it('should restore selected team from localStorage on init', () => {
    localStorage.setItem('selectedTeamId', 'team2');

    const teams = [
      { id: 'team1', name: 'Team 1', memberCount: 5 },
      { id: 'team2', name: 'Team 2', memberCount: 10 }
    ];

    component.teams = teams;
    fixture.detectChanges();
    component.ngOnInit();

    expect(component.selectedTeam).toBe('team2');
  });

  it('should default to first team when no stored selection', () => {
    const teams = [
      { id: 'team1', name: 'Team 1', memberCount: 5 },
      { id: 'team2', name: 'Team 2', memberCount: 10 }
    ];

    component.teams = teams;
    fixture.detectChanges();
    component.ngOnInit();

    expect(component.selectedTeam).toBe('team1');
  });

  it('should default to first team when stored ID is invalid', () => {
    localStorage.setItem('selectedTeamId', 'invalid-team');

    const teams = [
      { id: 'team1', name: 'Team 1', memberCount: 5 },
      { id: 'team2', name: 'Team 2', memberCount: 10 }
    ];

    component.teams = teams;
    fixture.detectChanges();
    component.ngOnInit();

    expect(component.selectedTeam).toBe('team1');
  });

  it('should display all available teams in dropdown', () => {
    const teams = [
      { id: 'team1', name: 'Team 1', memberCount: 5 },
      { id: 'team2', name: 'Team 2', memberCount: 10 },
      { id: 'team3', name: 'Team 3', memberCount: 15 }
    ];

    component.teams = teams;
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select');
    const options = select.querySelectorAll('option');

    expect(options.length).toBe(3);
    expect(options[0].textContent).toContain('Team 1');
    expect(options[1].textContent).toContain('Team 2');
    expect(options[2].textContent).toContain('Team 3');
  });
});
