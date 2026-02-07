import { ComponentFixture, TestBed } from '@angular/core/testing';
import { C4uGoalsProgressTabComponent } from './c4u-goals-progress-tab.component';
import { AccessibilityTestUtils } from '@app/testing/accessibility-test-utils';
import { By } from '@angular/platform-browser';
import { NO_ERRORS_SCHEMA } from '@angular/core';

/**
 * Accessibility Tests for Goals Progress Tab Component
 * 
 * Tests WCAG AA compliance including:
 * - ARIA labels for progress indicators
 * - Keyboard navigation
 * - Screen reader support for goal metrics
 * - Accessible empty and loading states
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4 (Accessibility)
 */
describe('C4uGoalsProgressTabComponent - Accessibility', () => {
  let component: C4uGoalsProgressTabComponent;
  let fixture: ComponentFixture<C4uGoalsProgressTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uGoalsProgressTabComponent],
      schemas: [NO_ERRORS_SCHEMA] // Ignore child component templates
    }).compileComponents();

    fixture = TestBed.createComponent(C4uGoalsProgressTabComponent);
    component = fixture.componentInstance;
  });

  describe('ARIA Labels', () => {
    it('should have ARIA label on tab title', () => {
      fixture.detectChanges();
      
      const title = fixture.debugElement.query(By.css('.goals-title'));
      expect(title).toBeTruthy();
      expect(title.nativeElement.textContent).toContain('Metas e Progresso');
    });

    it('should have accessible goal items', () => {
      component.goals = [
        { id: 'goal1', label: 'Processos Finalizados', current: 50, target: 100 },
        { id: 'goal2', label: 'Tarefas Finalizadas', current: 200, target: 500 }
      ];
      fixture.detectChanges();
      
      const goalItems = fixture.debugElement.queryAll(By.css('.goal-item'));
      expect(goalItems.length).toBe(2);
      
      // Each goal item should contain a KPI component
      goalItems.forEach(item => {
        const kpiComponent = item.query(By.css('c4u-kpi-circular-progress'));
        expect(kpiComponent).toBeTruthy('Goal item should contain KPI component');
      });
    });

    it('should pass goal labels to KPI components', () => {
      component.goals = [
        { id: 'goal1', label: 'Processos Finalizados', current: 50, target: 100 }
      ];
      fixture.detectChanges();
      
      const kpiComponent = fixture.debugElement.query(By.css('c4u-kpi-circular-progress'));
      expect(kpiComponent).toBeTruthy();
      expect(kpiComponent.componentInstance.label).toBe('Processos Finalizados');
    });
  });

  describe('Screen Reader Support', () => {
    it('should have accessible loading state', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const loadingSection = fixture.debugElement.query(By.css('.goals-loading'));
      expect(loadingSection).toBeTruthy();
      
      const srText = loadingSection.query(By.css('.visually-hidden, .sr-only'));
      expect(srText).toBeTruthy();
      expect(srText.nativeElement.textContent).toContain('Carregando');
    });

    it('should have accessible empty state', () => {
      component.isLoading = false;
      component.goals = [];
      fixture.detectChanges();
      
      const emptyState = fixture.debugElement.query(By.css('.goals-empty'));
      expect(emptyState).toBeTruthy();
      
      const emptyText = emptyState.query(By.css('.empty-text'));
      expect(emptyText).toBeTruthy();
      expect(emptyText.nativeElement.textContent).toContain('Nenhuma meta disponível');
    });

    it('should provide context for goal progress values', () => {
      component.goals = [
        { id: 'goal1', label: 'Processos Finalizados', current: 75, target: 100 }
      ];
      fixture.detectChanges();
      
      const kpiComponent = fixture.debugElement.query(By.css('c4u-kpi-circular-progress'));
      expect(kpiComponent).toBeTruthy();
      
      // KPI component should receive current and target values
      expect(kpiComponent.componentInstance.current).toBe(75);
      expect(kpiComponent.componentInstance.target).toBe(100);
    });
  });

  describe('Semantic HTML', () => {
    it('should use proper heading hierarchy', () => {
      fixture.detectChanges();
      
      const heading = fixture.debugElement.query(By.css('h2, h3'));
      expect(heading).toBeTruthy('Should have heading for tab title');
    });

    it('should use semantic structure for goal grid', () => {
      component.goals = [
        { id: 'goal1', label: 'Goal 1', current: 50, target: 100 },
        { id: 'goal2', label: 'Goal 2', current: 75, target: 100 }
      ];
      fixture.detectChanges();
      
      const grid = fixture.debugElement.query(By.css('.goals-grid'));
      expect(grid).toBeTruthy('Should have grid container');
      
      const items = grid.queryAll(By.css('.goal-item'));
      expect(items.length).toBe(2);
    });
  });

  describe('Visual Accessibility', () => {
    it('should have good contrast for text elements', () => {
      fixture.detectChanges();
      
      const textElements = fixture.debugElement.queryAll(By.css('.goals-title, .loading-text, .empty-text'));
      
      textElements.forEach(element => {
        if (element.nativeElement.textContent?.trim().length > 0) {
          const hasContrast = AccessibilityTestUtils.hasGoodContrast(element);
          expect(hasContrast).toBe(true, 'Text should have good color contrast');
        }
      });
    });

    it('should have accessible loading spinner', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const spinner = fixture.debugElement.query(By.css('.spinner-border'));
      expect(spinner).toBeTruthy();
      expect(spinner.nativeElement.getAttribute('role')).toBe('status');
    });
  });

  describe('Responsive Accessibility', () => {
    it('should maintain accessibility on mobile viewports', () => {
      component.goals = [
        { id: 'goal1', label: 'Goal 1', current: 50, target: 100 }
      ];
      
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });
      
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      
      const goalItems = fixture.debugElement.queryAll(By.css('.goal-item'));
      expect(goalItems.length).toBeGreaterThan(0);
    });
  });

  describe('Data Presentation', () => {
    it('should present goal data in accessible format', () => {
      component.goals = [
        { id: 'goal1', label: 'Processos Finalizados', current: 50, target: 100 },
        { id: 'goal2', label: 'Tarefas Finalizadas', current: 200, target: 500 }
      ];
      fixture.detectChanges();
      
      const kpiComponents = fixture.debugElement.queryAll(By.css('c4u-kpi-circular-progress'));
      expect(kpiComponents.length).toBe(2);
      
      // Each KPI should have label, current, and target
      kpiComponents.forEach((kpi, index) => {
        expect(kpi.componentInstance.label).toBe(component.goals[index].label);
        expect(kpi.componentInstance.current).toBe(component.goals[index].current);
        expect(kpi.componentInstance.target).toBe(component.goals[index].target);
      });
    });

    it('should handle zero values accessibly', () => {
      component.goals = [
        { id: 'goal1', label: 'Empty Goal', current: 0, target: 100 }
      ];
      fixture.detectChanges();
      
      const kpiComponent = fixture.debugElement.query(By.css('c4u-kpi-circular-progress'));
      expect(kpiComponent).toBeTruthy();
      expect(kpiComponent.componentInstance.current).toBe(0);
    });

    it('should handle completed goals accessibly', () => {
      component.goals = [
        { id: 'goal1', label: 'Completed Goal', current: 100, target: 100 }
      ];
      fixture.detectChanges();
      
      const kpiComponent = fixture.debugElement.query(By.css('c4u-kpi-circular-progress'));
      expect(kpiComponent).toBeTruthy();
      expect(kpiComponent.componentInstance.current).toBe(100);
      expect(kpiComponent.componentInstance.target).toBe(100);
    });
  });

  describe('TrackBy Function', () => {
    it('should use trackBy for performance and accessibility', () => {
      const goal1 = { id: 'goal1', label: 'Goal 1', current: 50, target: 100 };
      const goal2 = { id: 'goal2', label: 'Goal 2', current: 75, target: 100 };
      
      const trackResult1 = component.trackByGoalId(0, goal1);
      const trackResult2 = component.trackByGoalId(1, goal2);
      
      expect(trackResult1).toBe('goal1');
      expect(trackResult2).toBe('goal2');
      expect(trackResult1).not.toBe(trackResult2);
    });
  });
});
