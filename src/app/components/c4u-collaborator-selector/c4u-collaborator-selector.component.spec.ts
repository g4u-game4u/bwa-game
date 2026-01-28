import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { C4uCollaboratorSelectorComponent } from './c4u-collaborator-selector.component';

describe('C4uCollaboratorSelectorComponent', () => {
  let component: C4uCollaboratorSelectorComponent;
  let fixture: ComponentFixture<C4uCollaboratorSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uCollaboratorSelectorComponent],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uCollaboratorSelectorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit correct user ID when collaborator is selected', (done) => {
    const collaborators = [
      { userId: 'user1@example.com', name: 'User 1', email: 'user1@example.com' },
      { userId: 'user2@example.com', name: 'User 2', email: 'user2@example.com' }
    ];

    component.collaborators = collaborators;
    component.selectedCollaborator = 'user1@example.com';
    fixture.detectChanges();

    component.collaboratorSelected.subscribe((userId: string | null) => {
      expect(userId).toBe('user2@example.com');
      done();
    });

    component.onCollaboratorChange('user2@example.com');
  });

  it('should emit null when "All" option is selected', (done) => {
    const collaborators = [
      { userId: 'user1@example.com', name: 'User 1', email: 'user1@example.com' },
      { userId: 'user2@example.com', name: 'User 2', email: 'user2@example.com' }
    ];

    component.collaborators = collaborators;
    component.selectedCollaborator = 'user1@example.com';
    fixture.detectChanges();

    component.collaboratorSelected.subscribe((userId: string | null) => {
      expect(userId).toBeNull();
      done();
    });

    component.onCollaboratorChange('');
  });

  it('should clear collaborator filter when "All" is selected', () => {
    const collaborators = [
      { userId: 'user1@example.com', name: 'User 1', email: 'user1@example.com' }
    ];

    component.collaborators = collaborators;
    component.selectedCollaborator = 'user1@example.com';
    fixture.detectChanges();

    component.onCollaboratorChange('');

    expect(component.selectedCollaborator).toBeNull();
  });

  it('should display "All" option in dropdown', () => {
    const collaborators = [
      { userId: 'user1@example.com', name: 'User 1', email: 'user1@example.com' },
      { userId: 'user2@example.com', name: 'User 2', email: 'user2@example.com' }
    ];

    component.collaborators = collaborators;
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select');
    const options = select.querySelectorAll('option');

    expect(options.length).toBe(3); // "All" + 2 collaborators
    expect(options[0].textContent).toContain('Todos');
    expect(options[0].value).toBe('');
  });

  it('should display all available collaborators in dropdown', () => {
    const collaborators = [
      { userId: 'user1@example.com', name: 'User 1', email: 'user1@example.com' },
      { userId: 'user2@example.com', name: 'User 2', email: 'user2@example.com' },
      { userId: 'user3@example.com', name: 'User 3', email: 'user3@example.com' }
    ];

    component.collaborators = collaborators;
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select');
    const options = select.querySelectorAll('option');

    expect(options.length).toBe(4); // "All" + 3 collaborators
    expect(options[1].textContent).toContain('User 1');
    expect(options[2].textContent).toContain('User 2');
    expect(options[3].textContent).toContain('User 3');
  });

  it('should handle empty collaborators list', () => {
    component.collaborators = [];
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select');
    const options = select.querySelectorAll('option');

    expect(options.length).toBe(1); // Only "All" option
    expect(options[0].textContent).toContain('Todos');
  });
});
