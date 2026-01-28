import * as fc from 'fast-check';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uTeamSelectorComponent } from './c4u-team-selector.component';
import { FormsModule } from '@angular/forms';

/**
 * Property 8: Team Selection Persistence
 * Validates: Requirements 2.4, 18.5
 * 
 * For any team selection, the selected team should be remembered across
 * component recreations and stored in local storage.
 */
describe('C4uTeamSelectorComponent Property-Based Tests', () => {
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

  it('Property 8: should persist team selection across component recreations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            memberCount: fc.integer({ min: 1, max: 100 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.integer({ min: 0, max: 9 }),
        (teams, selectedIndex) => {
          // Ensure unique team IDs
          const uniqueTeams = teams.filter((team, index, self) =>
            index === self.findIndex(t => t.id === team.id)
          );

          if (uniqueTeams.length === 0) return true;

          const actualIndex = selectedIndex % uniqueTeams.length;
          const selectedTeam = uniqueTeams[actualIndex];

          // First component instance - select a team
          component.teams = uniqueTeams;
          component.selectedTeam = selectedTeam.id;
          fixture.detectChanges();

          // Simulate selection (which should save to localStorage)
          component.onTeamChange(selectedTeam.id);

          // Verify localStorage has the selection
          const storedTeamId = localStorage.getItem('selectedTeamId');
          expect(storedTeamId).toBe(selectedTeam.id);

          // Create a new component instance (simulating page refresh)
          const newFixture = TestBed.createComponent(C4uTeamSelectorComponent);
          const newComponent = newFixture.componentInstance;
          newComponent.teams = uniqueTeams;
          newFixture.detectChanges();

          // Component should restore the selection from localStorage
          newComponent.ngOnInit();
          newFixture.detectChanges();

          expect(newComponent.selectedTeam).toBe(selectedTeam.id);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 8: should handle missing localStorage gracefully', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            memberCount: fc.integer({ min: 1, max: 100 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (teams) => {
          const uniqueTeams = teams.filter((team, index, self) =>
            index === self.findIndex(t => t.id === team.id)
          );

          if (uniqueTeams.length === 0) return true;

          // Clear localStorage
          localStorage.clear();

          component.teams = uniqueTeams;
          fixture.detectChanges();
          component.ngOnInit();

          // Should default to first team when no stored selection
          expect(component.selectedTeam).toBe(uniqueTeams[0].id);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 8: should handle invalid stored team ID', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            memberCount: fc.integer({ min: 1, max: 100 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        (teams, invalidTeamId) => {
          const uniqueTeams = teams.filter((team, index, self) =>
            index === self.findIndex(t => t.id === team.id)
          );

          if (uniqueTeams.length === 0) return true;

          // Ensure invalidTeamId is not in the teams list
          if (uniqueTeams.some(t => t.id === invalidTeamId)) return true;

          // Store an invalid team ID
          localStorage.setItem('selectedTeamId', invalidTeamId);

          component.teams = uniqueTeams;
          fixture.detectChanges();
          component.ngOnInit();

          // Should default to first team when stored ID is invalid
          expect(component.selectedTeam).toBe(uniqueTeams[0].id);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
