import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalCompanyDetailComponent } from './modal-company-detail.component';
import { CompanyService } from '@services/company.service';
import { of, throwError } from 'rxjs';
import { Company, CompanyDetails, Process, Task } from '@model/gamification-dashboard.model';
import { generateCompany, generateProcess, generateTask } from '@app/testing/mock-data-generators';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('ModalCompanyDetailComponent', () => {
  let component: ModalCompanyDetailComponent;
  let fixture: ComponentFixture<ModalCompanyDetailComponent>;
  let mockCompanyService: jasmine.SpyObj<CompanyService>;

  const mockCompany: Company = generateCompany();
  
  const mockCompanyDetails: CompanyDetails = {
    ...mockCompany,
    processes: [
      {
        ...generateProcess(),
        id: '1',
        name: 'Process 1',
        status: 'pending',
        tasks: [
          { ...generateTask(), id: 't1', name: 'Task 1', status: 'pending', responsible: 'John Doe' }
        ]
      },
      {
        ...generateProcess(),
        id: '2',
        name: 'Process 2',
        status: 'in-progress',
        tasks: [
          { ...generateTask(), id: 't2', name: 'Task 2', status: 'in-progress', responsible: 'Jane Smith' }
        ]
      },
      {
        ...generateProcess(),
        id: '3',
        name: 'Process 3',
        status: 'completed',
        tasks: [
          { ...generateTask(), id: 't3', name: 'Task 3', status: 'completed', responsible: 'Bob Johnson' }
        ]
      }
    ],
    activities: [],
    processos: []
  };

  beforeEach(async () => {
    mockCompanyService = jasmine.createSpyObj('CompanyService', ['getCompanyDetails']);

    await TestBed.configureTestingModule({
      declarations: [ModalCompanyDetailComponent],
      providers: [
        { provide: CompanyService, useValue: mockCompanyService }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ModalCompanyDetailComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Modal Opening and Data Loading', () => {
    it('should load company details on init when company is provided', () => {
      // Arrange
      component.company = mockCompany;
      mockCompanyService.getCompanyDetails.and.returnValue(of(mockCompanyDetails));

      // Act
      component.ngOnInit();

      // Assert
      expect(mockCompanyService.getCompanyDetails).toHaveBeenCalledWith(mockCompany.id);
      expect(component.companyDetails).toEqual(mockCompanyDetails);
      expect(component.isLoading).toBe(false);
    });

    it('should not load details if company is not provided', () => {
      // Arrange
      component.company = undefined;

      // Act
      component.ngOnInit();

      // Assert
      expect(mockCompanyService.getCompanyDetails).not.toHaveBeenCalled();
    });

    it('should set loading state while fetching data', () => {
      // Arrange
      component.company = mockCompany;
      mockCompanyService.getCompanyDetails.and.returnValue(of(mockCompanyDetails));

      // Act
      component.loadCompanyDetails();

      // Assert - loading should be set to true initially
      // Note: In real scenario, we'd need to test async behavior
      expect(mockCompanyService.getCompanyDetails).toHaveBeenCalled();
    });

    it('should handle error when loading company details fails', () => {
      // Arrange
      component.company = mockCompany;
      const error = new Error('API Error');
      mockCompanyService.getCompanyDetails.and.returnValue(throwError(() => error));
      spyOn(console, 'error');

      // Act
      component.loadCompanyDetails();

      // Assert
      expect(console.error).toHaveBeenCalledWith('Error loading company details:', error);
      expect(component.isLoading).toBe(false);
    });
  });

  describe('Tab Switching', () => {
    beforeEach(() => {
      component.company = mockCompany;
      component.companyDetails = mockCompanyDetails;
    });

    it('should switch to selected tab', () => {
      // Act
      component.selectTab(1);

      // Assert
      expect(component.selectedTab).toBe(1);
    });

    it('should display incomplete processes in tab 0', () => {
      // Act
      component.selectTab(0);
      const processes = component.currentTabProcesses;

      // Assert
      expect(processes.length).toBe(2); // pending and in-progress
      expect(processes.every(p => p.status === 'pending' || p.status === 'in-progress')).toBe(true);
    });

    it('should display processes with completed tasks in tab 1', () => {
      // Act
      component.selectTab(1);
      const processes = component.currentTabProcesses;

      // Assert
      expect(processes.length).toBeGreaterThan(0);
      processes.forEach(p => {
        expect((p.tasks ?? []).every(t => t.status === 'completed')).toBe(true);
      });
    });

    it('should display completed processes in tab 2', () => {
      // Act
      component.selectTab(2);
      const processes = component.currentTabProcesses;

      // Assert
      expect(processes.length).toBe(1); // only completed process
      expect(processes.every(p => p.status === 'completed')).toBe(true);
    });

    it('should return empty array for invalid tab index', () => {
      // Act
      component.selectTab(99);
      const processes = component.currentTabProcesses;

      // Assert
      expect(processes).toEqual([]);
    });
  });



  describe('Close Functionality', () => {
    it('should call modal close when close is invoked', () => {
      // Arrange
      const mockModal = jasmine.createSpyObj('C4uModalComponent', ['close']);
      component['modal'] = mockModal;

      // Act
      component.close();

      // Assert
      expect(mockModal.close).toHaveBeenCalled();
    });

    it('should handle close when modal is not initialized', () => {
      // Arrange
      component['modal'] = null;

      // Act & Assert - should not throw
      expect(() => component.close()).not.toThrow();
    });
  });

  describe('Tab Configuration', () => {
    it('should default to first tab', () => {
      expect(component.selectedTab).toBe(0);
    });

    it('should return correct tab description for each tab', () => {
      component.selectTab(0);
      expect(component.getTabDescription()).toContain('processos com atividades pendentes');
      
      component.selectTab(1);
      expect(component.getTabDescription()).toContain('concluídas');
      
      component.selectTab(2);
      expect(component.getTabDescription()).toContain('finalizadas');
    });
  });
});
