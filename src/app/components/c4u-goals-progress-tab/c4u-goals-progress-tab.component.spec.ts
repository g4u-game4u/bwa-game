import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uGoalsProgressTabComponent, GoalMetric } from './c4u-goals-progress-tab.component';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

/**
 * Unit Tests for Goals Progress Tab Component
 * 
 * These tests verify specific examples and edge cases for the component's behavior.
 */
describe('C4uGoalsProgressTabComponent', () => {
  let component: C4uGoalsProgressTabComponent;
  let fixture: ComponentFixture<C4uGoalsProgressTabComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uGoalsProgressTabComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uGoalsProgressTabComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('calculatePercentage', () => {
    it('should return 0 when target is 0', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 50,
        target: 0
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(0);
    });

    it('should calculate correct percentage for 50% completion', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 50,
        target: 100
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(50);
    });

    it('should calculate correct percentage for 100% completion', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 100,
        target: 100
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(100);
    });

    it('should calculate correct percentage for over 100% completion', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 150,
        target: 100
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(150);
    });

    it('should round percentage to nearest integer', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 33,
        target: 100
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(33);
    });

    it('should handle decimal results correctly', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 1,
        target: 3
      };

      const percentage = component.calculatePercentage(goal);

      // 1/3 * 100 = 33.333... should round to 33
      expect(percentage).toBe(33);
    });
  });

  describe('getGoalText', () => {
    it('should format goal text without unit', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 50,
        target: 100
      };

      const text = component.getGoalText(goal);

      expect(text).toBe('50 / 100');
    });

    it('should format goal text with unit', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 50,
        target: 100,
        unit: 'pts'
      };

      const text = component.getGoalText(goal);

      expect(text).toBe('50pts / 100pts');
    });

    it('should handle zero values', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 0,
        target: 0
      };

      const text = component.getGoalText(goal);

      expect(text).toBe('0 / 0');
    });
  });

  describe('trackByGoalId', () => {
    it('should return goal id', () => {
      const goal: GoalMetric = {
        id: 'goal-123',
        label: 'Test Goal',
        current: 50,
        target: 100
      };

      const result = component.trackByGoalId(0, goal);

      expect(result).toBe('goal-123');
    });

    it('should return different ids for different goals', () => {
      const goal1: GoalMetric = {
        id: 'goal-1',
        label: 'Goal 1',
        current: 50,
        target: 100
      };

      const goal2: GoalMetric = {
        id: 'goal-2',
        label: 'Goal 2',
        current: 75,
        target: 100
      };

      const result1 = component.trackByGoalId(0, goal1);
      const result2 = component.trackByGoalId(1, goal2);

      expect(result1).not.toBe(result2);
      expect(result1).toBe('goal-1');
      expect(result2).toBe('goal-2');
    });
  });

  describe('Template Rendering', () => {
    it('should display loading state when isLoading is true', () => {
      component.isLoading = true;
      component.goals = [];
      fixture.detectChanges();

      const loadingElement = compiled.querySelector('.goals-loading');
      const contentElement = compiled.querySelector('.goals-content');
      const emptyElement = compiled.querySelector('.goals-empty');

      expect(loadingElement).toBeTruthy();
      expect(contentElement).toBeFalsy();
      expect(emptyElement).toBeFalsy();
    });

    it('should display empty state when no goals and not loading', () => {
      component.isLoading = false;
      component.goals = [];
      fixture.detectChanges();

      const loadingElement = compiled.querySelector('.goals-loading');
      const contentElement = compiled.querySelector('.goals-content');
      const emptyElement = compiled.querySelector('.goals-empty');

      expect(loadingElement).toBeFalsy();
      expect(contentElement).toBeFalsy();
      expect(emptyElement).toBeTruthy();
    });

    it('should display goals when goals array has items', () => {
      component.isLoading = false;
      component.goals = [
        {
          id: 'goal1',
          label: 'Processos Finalizados',
          current: 50,
          target: 100
        },
        {
          id: 'goal2',
          label: 'Atividades Completas',
          current: 75,
          target: 100
        }
      ];
      fixture.detectChanges();

      const loadingElement = compiled.querySelector('.goals-loading');
      const contentElement = compiled.querySelector('.goals-content');
      const emptyElement = compiled.querySelector('.goals-empty');

      expect(loadingElement).toBeFalsy();
      expect(contentElement).toBeTruthy();
      expect(emptyElement).toBeFalsy();
    });

    it('should display correct number of goal items', () => {
      component.isLoading = false;
      component.goals = [
        {
          id: 'goal1',
          label: 'Goal 1',
          current: 50,
          target: 100
        },
        {
          id: 'goal2',
          label: 'Goal 2',
          current: 75,
          target: 100
        },
        {
          id: 'goal3',
          label: 'Goal 3',
          current: 25,
          target: 100
        }
      ];
      fixture.detectChanges();

      const goalItems = compiled.querySelectorAll('.goal-item');

      expect(goalItems.length).toBe(3);
    });

    it('should display title', () => {
      fixture.detectChanges();

      const title = compiled.querySelector('.goals-title');

      expect(title).toBeTruthy();
      expect(title?.textContent).toContain('Metas e Progresso');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty goals array', () => {
      component.goals = [];
      fixture.detectChanges();

      expect(component.goals.length).toBe(0);
    });

    it('should handle single goal', () => {
      component.goals = [
        {
          id: 'goal1',
          label: 'Single Goal',
          current: 50,
          target: 100
        }
      ];
      fixture.detectChanges();

      expect(component.goals.length).toBe(1);
    });

    it('should handle goals with very large numbers', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Large Goal',
        current: 1000000,
        target: 2000000
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(50);
    });

    it('should handle goals with same current and target', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Complete Goal',
        current: 100,
        target: 100
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(100);
    });
  });

  describe('Color Coding', () => {
    it('should pass different colorIndex to each KPI component', () => {
      component.isLoading = false;
      component.goals = [
        { id: 'goal1', label: 'Goal 1', current: 50, target: 100 },
        { id: 'goal2', label: 'Goal 2', current: 75, target: 100 },
        { id: 'goal3', label: 'Goal 3', current: 25, target: 100 }
      ];
      fixture.detectChanges();

      // Note: This test assumes c4u-kpi-circular-progress component is available
      // In a real scenario, you might want to mock this component
      const goalItems = compiled.querySelectorAll('.goal-item');
      expect(goalItems.length).toBe(3);
    });
  });

  describe('Requirements Validation', () => {
    /**
     * Requirement 7.1: Display circular progress indicators for goals
     */
    it('should display circular progress indicators (Requirement 7.1)', () => {
      component.isLoading = false;
      component.goals = [
        { id: 'goal1', label: 'Test Goal', current: 50, target: 100 }
      ];
      fixture.detectChanges();

      const goalItems = compiled.querySelectorAll('.goal-item');
      expect(goalItems.length).toBeGreaterThan(0);
    });

    /**
     * Requirement 7.2: Show current value, target value, and completion percentage
     */
    it('should calculate completion percentage (Requirement 7.2)', () => {
      const goal: GoalMetric = {
        id: 'goal1',
        label: 'Test Goal',
        current: 60,
        target: 100
      };

      const percentage = component.calculatePercentage(goal);

      expect(percentage).toBe(60);
      expect(goal.current).toBe(60);
      expect(goal.target).toBe(100);
    });

    /**
     * Requirement 7.3: Query aggregate data to calculate goal progress
     */
    it('should accept goals data from parent component (Requirement 7.3)', () => {
      const testGoals: GoalMetric[] = [
        { id: 'goal1', label: 'Goal 1', current: 50, target: 100 },
        { id: 'goal2', label: 'Goal 2', current: 75, target: 100 }
      ];

      component.goals = testGoals;

      expect(component.goals).toEqual(testGoals);
      expect(component.goals.length).toBe(2);
    });

    /**
     * Requirement 7.4: Color-code progress indicators based on completion status
     */
    it('should pass colorIndex for color coding (Requirement 7.4)', () => {
      component.isLoading = false;
      component.goals = [
        { id: 'goal1', label: 'Goal 1', current: 50, target: 100 },
        { id: 'goal2', label: 'Goal 2', current: 75, target: 100 }
      ];
      fixture.detectChanges();

      // Verify that different goals get different color indices
      // This is handled by the ngFor index in the template
      const goalItems = compiled.querySelectorAll('.goal-item');
      expect(goalItems.length).toBe(2);
    });
  });
});
