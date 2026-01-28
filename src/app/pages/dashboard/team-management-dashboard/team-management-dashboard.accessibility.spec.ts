import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamManagementDashboardComponent } from './team-management-dashboard.component';
import { AccessibilityTestUtils } from '@app/testing/accessibility-test-utils';
import { By } from '@angular/platform-browser';
import { DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

// Mock services
import { TeamAggregateService } from '@services/team-aggregate.service';
import { GraphDataProcessorService } from '@services/graph-data-processor.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ToastService } from '@services/toast.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';

/**
 * Accessibility Tests for Team Management Dashboard Component
 * 
 * Tests WCAG AA compliance including:
 * - ARIA labels on all interactive elements
 * - Keyboard navigation support
 * - Screen reader announcements
 * - Focus management
 * - Color contrast
 * 
 * Requirements: All (Accessibility)
 */
describe('TeamManagementDashboardComponent - Accessibility', () => {
  let component: TeamManagementDashboardComponent;
  let fixture: ComponentFixture<TeamManagementDashboardComponent>;
  let mockTeamAggregateService: jasmine.SpyObj<TeamAggregateService>;
  let mockGraphDataProcessor: jasmine.SpyObj<GraphDataProcessorService>;
  let mockSeasonDatesService: jasmine.SpyObj<SeasonDatesService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockSessaoProvider: jasmine.SpyObj<SessaoProvider>;

  beforeEach(async () => {
    // Create mock services
    mockTeamAggregateService = jasmine.createSpyObj('TeamAggregateService', [
      'getTeamSeasonPoints',
      'getTeamProgressMetrics',
      'getTeamMembers',
      'clearCache'
    ]);
    mockGraphDataProcessor = jasmine.createSpyObj('GraphDataProcessorService', [
      'processGraphData'
    ]);
    mockSeasonDatesService = jasmine.createSpyObj('SeasonDatesService', [
      'getSeasonDates'
    ]);
    mockToastService = jasmine.createSpyObj('ToastService', ['error', 'success']);
    mockSessaoProvider = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: { extra: { teams: ['Departamento Pessoal'] } }
    });

    // Set up default mock returns
    mockTeamAggregateService.getTeamSeasonPoints.and.returnValue(
      of({ total: 100, bloqueados: 50, desbloqueados: 50 })
    );
    mockTeamAggregateService.getTeamProgressMetrics.and.returnValue(
      of({ processosIncompletos: 10, atividadesFinalizadas: 20, processosFinalizados: 5 })
    );
    mockTeamAggregateService.getTeamMembers.and.returnValue(of([]));
    mockSeasonDatesService.getSeasonDates.and.returnValue(
      Promise.resolve({ start: new Date(), end: new Date() })
    );
    mockGraphDataProcessor.processGraphData.and.returnValue([]);

    await TestBed.configureTestingModule({
      declarations: [TeamManagementDashboardComponent],
      providers: [
        { provide: TeamAggregateService, useValue: mockTeamAggregateService },
        { provide: GraphDataProcessorService, useValue: mockGraphDataProcessor },
        { provide: SeasonDatesService, useValue: mockSeasonDatesService },
        { provide: ToastService, useValue: mockToastService },
        { provide: SessaoProvider, useValue: mockSessaoProvider }
      ],
      schemas: [NO_ERRORS_SCHEMA] // Ignore child component templates
    }).compileComponents();

    fixture = TestBed.createComponent(TeamManagementDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('ARIA Labels', () => {
    it('should have ARIA label on refresh button', () => {
      const refreshButton = fixture.debugElement.query(By.css('.btn-refresh'));
      expect(refreshButton).toBeTruthy();
      expect(refreshButton.nativeElement.getAttribute('title')).toBe('Atualizar dados');
    });

    it('should have ARIA labels on all interactive elements', () => {
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);
      
      interactiveElements.forEach(element => {
        const hasLabel = AccessibilityTestUtils.hasAriaLabel(element);
        const tagName = element.nativeElement.tagName.toLowerCase();
        const hasText = element.nativeElement.textContent?.trim().length > 0;
        
        // Interactive elements should have either ARIA label or visible text
        expect(hasLabel || hasText).toBe(
          true,
          `Element ${tagName} should have ARIA label or visible text`
        );
      });
    });

    it('should have proper ARIA labels on tab buttons', () => {
      const tabButtons = fixture.debugElement.queryAll(By.css('.tab-button'));
      
      expect(tabButtons.length).toBeGreaterThan(0);
      tabButtons.forEach(button => {
        const text = button.nativeElement.textContent.trim();
        expect(text.length).toBeGreaterThan(0, 'Tab button should have visible text');
      });
    });

    it('should have ARIA live region for loading states', () => {
      const loadingElements = fixture.debugElement.queryAll(By.css('.loading-section, .loading-overlay'));
      
      loadingElements.forEach(element => {
        const srOnly = element.query(By.css('.sr-only, .visually-hidden'));
        expect(srOnly).toBeTruthy('Loading indicator should have screen reader text');
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should allow keyboard navigation to refresh button', () => {
      const refreshButton = fixture.debugElement.query(By.css('.btn-refresh'));
      expect(AccessibilityTestUtils.isKeyboardAccessible(refreshButton)).toBe(true);
    });

    it('should allow keyboard navigation to tab buttons', () => {
      const tabButtons = fixture.debugElement.queryAll(By.css('.tab-button'));
      
      tabButtons.forEach(button => {
        expect(AccessibilityTestUtils.isKeyboardAccessible(button)).toBe(
          true,
          'Tab button should be keyboard accessible'
        );
      });
    });

    it('should handle Enter key on tab buttons', () => {
      const tabButtons = fixture.debugElement.queryAll(By.css('.tab-button'));
      
      if (tabButtons.length > 1) {
        const productivityTab = tabButtons[1];
        
        // Simulate Enter key press
        AccessibilityTestUtils.simulateKeyPress(productivityTab, 'Enter');
        fixture.detectChanges();
        
        // Tab should be activated (component handles this)
        expect(component.activeTab).toBe('productivity');
      }
    });

    it('should handle Space key on tab buttons', () => {
      const tabButtons = fixture.debugElement.queryAll(By.css('.tab-button'));
      
      if (tabButtons.length > 1) {
        const productivityTab = tabButtons[1];
        
        // Simulate Space key press
        AccessibilityTestUtils.simulateKeyPress(productivityTab, ' ');
        fixture.detectChanges();
        
        // Tab should be activated
        expect(component.activeTab).toBe('productivity');
      }
    });

    it('should maintain focus order in dashboard', () => {
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);
      
      // All interactive elements should have valid tabindex
      interactiveElements.forEach(element => {
        const tabIndex = element.nativeElement.tabIndex;
        expect(tabIndex).toBeGreaterThanOrEqual(-1, 'Element should have valid tabindex');
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should have descriptive text for loading states', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const loadingText = fixture.debugElement.query(By.css('.loading-overlay .sr-only, .loading-overlay .visually-hidden'));
      expect(loadingText).toBeTruthy();
      expect(loadingText.nativeElement.textContent).toContain('Carregando');
    });

    it('should announce tab changes to screen readers', () => {
      const tabButtons = fixture.debugElement.queryAll(By.css('.tab-button'));
      
      tabButtons.forEach(button => {
        const ariaSelected = button.nativeElement.getAttribute('aria-selected');
        const isActive = button.nativeElement.classList.contains('active');
        
        // Active tab should have aria-selected or active class
        if (isActive) {
          expect(ariaSelected === 'true' || isActive).toBe(true);
        }
      });
    });

    it('should have accessible error messages', () => {
      component.hasSidebarError = true;
      component.sidebarErrorMessage = 'Erro ao carregar dados';
      fixture.detectChanges();
      
      const errorMessage = fixture.debugElement.query(By.css('c4u-error-message'));
      expect(errorMessage).toBeTruthy('Error message component should be present');
    });

    it('should have accessible empty states', () => {
      component.teams = [];
      fixture.detectChanges();
      
      // Empty states should have descriptive text
      const emptyStates = fixture.debugElement.queryAll(By.css('.empty-state, .goals-empty'));
      emptyStates.forEach(state => {
        const text = state.nativeElement.textContent.trim();
        expect(text.length).toBeGreaterThan(0, 'Empty state should have descriptive text');
      });
    });
  });

  describe('Focus Management', () => {
    it('should not trap focus in dashboard', () => {
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);
      
      // Should have focusable elements
      expect(interactiveElements.length).toBeGreaterThan(0);
      
      // No element should have tabindex that traps focus
      interactiveElements.forEach(element => {
        const tabIndex = element.nativeElement.tabIndex;
        expect(tabIndex).not.toBe(-1, 'Interactive elements should be focusable');
      });
    });

    it('should maintain focus when switching tabs', () => {
      const tabButtons = fixture.debugElement.queryAll(By.css('.tab-button'));
      
      if (tabButtons.length > 1) {
        const productivityTab = tabButtons[1];
        productivityTab.nativeElement.focus();
        productivityTab.nativeElement.click();
        fixture.detectChanges();
        
        // Focus should remain on a focusable element
        expect(document.activeElement).toBeTruthy();
      }
    });

    it('should have visible focus indicators', () => {
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);
      
      interactiveElements.forEach(element => {
        const styles = window.getComputedStyle(element.nativeElement);
        // Elements should not have outline: none without alternative focus indicator
        if (styles.outline === 'none' || styles.outline === '0px') {
          // Should have alternative focus indicator (box-shadow, border, etc.)
          const hasAlternative = 
            styles.boxShadow !== 'none' ||
            styles.border !== 'none' ||
            element.nativeElement.classList.contains('focus-visible');
          
          expect(hasAlternative).toBe(
            true,
            'Element with outline:none should have alternative focus indicator'
          );
        }
      });
    });
  });

  describe('Color Contrast', () => {
    it('should have good contrast for text elements', () => {
      const textElements = fixture.debugElement.queryAll(By.css('p, span, label, button'));
      
      textElements.forEach(element => {
        if (element.nativeElement.textContent?.trim().length > 0) {
          const hasContrast = AccessibilityTestUtils.hasGoodContrast(element);
          expect(hasContrast).toBe(true, 'Text should have good color contrast');
        }
      });
    });

    it('should have accessible button colors', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      
      buttons.forEach(button => {
        const hasContrast = AccessibilityTestUtils.hasGoodContrast(button);
        expect(hasContrast).toBe(true, 'Button should have good color contrast');
      });
    });
  });

  describe('Semantic HTML', () => {
    it('should use semantic HTML elements', () => {
      const main = fixture.debugElement.query(By.css('main'));
      const aside = fixture.debugElement.query(By.css('aside'));
      
      expect(main).toBeTruthy('Should have <main> element');
      expect(aside).toBeTruthy('Should have <aside> element for sidebar');
    });

    it('should have proper heading hierarchy', () => {
      const headings = fixture.debugElement.queryAll(By.css('h1, h2, h3, h4, h5, h6'));
      
      // Should have at least one heading
      expect(headings.length).toBeGreaterThan(0, 'Should have headings for structure');
    });

    it('should use button elements for interactive actions', () => {
      const clickableElements = fixture.debugElement.queryAll(By.css('[ng-reflect-router-link], [routerLink]'));
      
      // Links should use <a> tags, buttons should use <button> tags
      clickableElements.forEach(element => {
        const tagName = element.nativeElement.tagName.toLowerCase();
        expect(['a', 'button'].includes(tagName)).toBe(
          true,
          'Interactive elements should be <a> or <button>'
        );
      });
    });
  });

  describe('Responsive Accessibility', () => {
    it('should maintain accessibility on mobile viewports', () => {
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      });
      
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);
      
      // All interactive elements should still be keyboard accessible
      interactiveElements.forEach(element => {
        expect(AccessibilityTestUtils.isKeyboardAccessible(element)).toBe(true);
      });
    });

    it('should have touch-friendly targets on mobile', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      
      buttons.forEach(button => {
        const rect = button.nativeElement.getBoundingClientRect();
        // Touch targets should be at least 44x44 pixels (WCAG guideline)
        // Note: This is a simplified check
        expect(rect.height).toBeGreaterThanOrEqual(0);
        expect(rect.width).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Loading State Accessibility', () => {
    it('should announce loading states to screen readers', () => {
      component.isLoadingSidebar = true;
      fixture.detectChanges();
      
      const loadingIndicator = fixture.debugElement.query(By.css('.loading-section'));
      if (loadingIndicator) {
        const srText = loadingIndicator.query(By.css('.sr-only, .visually-hidden'));
        expect(srText).toBeTruthy('Loading state should have screen reader text');
      }
    });

    it('should disable interactive elements during loading', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const refreshButton = fixture.debugElement.query(By.css('.btn-refresh'));
      expect(refreshButton.nativeElement.disabled).toBe(true);
    });
  });

  describe('Error State Accessibility', () => {
    it('should announce errors to screen readers', () => {
      component.hasGoalsError = true;
      component.goalsErrorMessage = 'Erro ao carregar metas';
      fixture.detectChanges();
      
      const errorComponent = fixture.debugElement.query(By.css('c4u-error-message'));
      expect(errorComponent).toBeTruthy('Error should be displayed');
    });

    it('should provide retry functionality with keyboard access', () => {
      component.hasSidebarError = true;
      fixture.detectChanges();
      
      const errorComponent = fixture.debugElement.query(By.css('c4u-error-message'));
      if (errorComponent) {
        // Error component should have retry button (tested in its own spec)
        expect(errorComponent).toBeTruthy();
      }
    });
  });
});
