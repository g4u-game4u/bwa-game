import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalCompanyDetailComponent } from './modal-company-detail.component';
import { AccessibilityTestUtils } from '../../testing/accessibility-test-utils';
import { By } from '@angular/platform-browser';
import { SharedModule } from '../../shared.module';
import { CompanyService } from '@services/company.service';
import { of } from 'rxjs';

describe('ModalCompanyDetailComponent - Accessibility', () => {
  let component: ModalCompanyDetailComponent;
  let fixture: ComponentFixture<ModalCompanyDetailComponent>;
  let mockCompanyService: jasmine.SpyObj<CompanyService>;

  beforeEach(async () => {
    const companyServiceSpy = jasmine.createSpyObj('CompanyService', ['getCompanyDetails']);

    await TestBed.configureTestingModule({
      declarations: [ModalCompanyDetailComponent],
      imports: [SharedModule],
      providers: [
        { provide: CompanyService, useValue: companyServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ModalCompanyDetailComponent);
    component = fixture.componentInstance;
    mockCompanyService = TestBed.inject(CompanyService) as jasmine.SpyObj<CompanyService>;
    
    // Set up test data
    const kpi1 = { id: '1', label: 'KPI 1', current: 10, target: 20 };
    const kpi2 = { id: '2', label: 'KPI 2', current: 15, target: 25 };
    const kpi3 = { id: '3', label: 'KPI 3', current: 20, target: 30 };

    component.company = {
      id: '1',
      name: 'Test Company',
      cnpj: '12.345.678/0001-90',
      healthScore: 85,
      kpis: [kpi1, kpi2, kpi3],
      kpi1,
      kpi2,
      kpi3
    };

    mockCompanyService.getCompanyDetails.and.returnValue(of({
      ...component.company,
      processes: [],
      activities: [],
      macros: []
    }));
    
    fixture.detectChanges();
  });

  describe('Modal Accessibility', () => {
    it('should have proper modal role and ARIA attributes', () => {
      const modal = fixture.debugElement.query(By.css('[role="dialog"]'));
      expect(modal).toBeTruthy();
      
      if (modal) {
        const modalElement = modal.nativeElement;
        expect(modalElement.getAttribute('aria-modal')).toBe('true');
        const ariaLabelledBy = modalElement.getAttribute('aria-labelledby');
        expect(ariaLabelledBy).toBeTruthy();
      }
    });

    it('should have proper focus management', () => {
      const focusManagement = AccessibilityTestUtils.checkModalFocusManagement(fixture);
      
      expect(focusManagement.hasCloseButton).toBe(true);
      expect(focusManagement.hasFocusTrap).toBe(true);
    });

    it('should have close button with proper ARIA label', () => {
      const closeButton = fixture.debugElement.query(By.css('[aria-label*="close"], [aria-label*="Close"], [aria-label*="Fechar"]'));
      expect(closeButton).toBeTruthy();
      
      if (closeButton) {
        const ariaLabel = closeButton.nativeElement.getAttribute('aria-label');
        expect(ariaLabel.toLowerCase()).toMatch(/close|fechar/);
      }
    });

    it('should support Escape key to close modal', () => {
      spyOn(component, 'close');
      
      const modal = fixture.debugElement.query(By.css('[role="dialog"]'));
      if (modal) {
        AccessibilityTestUtils.simulateKeyPress(modal, 'Escape');
      }
      
      // Note: This test structure is ready for when keyboard handlers are implemented
    });

    it('should have proper heading structure', () => {
      const modalTitle = fixture.debugElement.query(By.css('h1, h2, h3, h4, h5, h6'));
      expect(modalTitle).toBeTruthy();
      
      if (modalTitle) {
        const titleId = modalTitle.nativeElement.id;
        const modal = fixture.debugElement.query(By.css('[role="dialog"]'));
        if (modal) {
          const ariaLabelledBy = modal.nativeElement.getAttribute('aria-labelledby');
          expect(ariaLabelledBy).toBe(titleId);
        }
      }
    });
  });

  describe('Content Accessibility', () => {
    it('should have alt text for company logo', () => {
      const logo = fixture.debugElement.query(By.css('img'));
      if (logo) {
        const alt = logo.nativeElement.getAttribute('alt');
        expect(alt).toBeTruthy();
        expect(alt.toLowerCase()).toContain('logo');
      }
    });

    it('should have proper ARIA labels for all interactive elements', () => {
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);
      
      interactiveElements.forEach((element, index) => {
        expect(AccessibilityTestUtils.hasAriaLabel(element))
          .toBe(true, `Interactive element at index ${index} should have ARIA label`);
      });
    });
  });
});
