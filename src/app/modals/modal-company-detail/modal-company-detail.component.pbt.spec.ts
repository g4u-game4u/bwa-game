import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalCompanyDetailComponent } from './modal-company-detail.component';
import { CompanyService } from '@services/company.service';
import { of } from 'rxjs';
import * as fc from 'fast-check';
import { Company, CompanyDetails, Process, ProcessStatus } from '@model/gamification-dashboard.model';
import { generateCompany, generateProcess } from '@app/testing/mock-data-generators';

describe('ModalCompanyDetailComponent - Property-Based Tests', () => {
  let component: ModalCompanyDetailComponent;
  let fixture: ComponentFixture<ModalCompanyDetailComponent>;
  let mockCompanyService: jasmine.SpyObj<CompanyService>;

  beforeEach(async () => {
    mockCompanyService = jasmine.createSpyObj('CompanyService', ['getCompanyDetails']);

    await TestBed.configureTestingModule({
      declarations: [ModalCompanyDetailComponent],
      providers: [
        { provide: CompanyService, useValue: mockCompanyService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ModalCompanyDetailComponent);
    component = fixture.componentInstance;
  });

  /**
   * Feature: gamification-dashboard, Property 6: Modal Tab Content Isolation
   * Validates: Requirements 8.3, 8.4
   * 
   * For any tab selection in the company detail modal, switching tabs should display 
   * only the content associated with that tab and hide content from other tabs.
   */
  it('should isolate tab content - switching tabs displays only relevant processes', () => {
    fc.assert(
      fc.property(
        // Generate a company with random processes
        fc.record({
          company: fc.constant(generateCompany()),
          processes: fc.array(
            fc.record({
              process: fc.constant(generateProcess()),
              status: fc.constantFrom<ProcessStatus>('pending', 'in-progress', 'completed', 'blocked')
            }),
            { minLength: 5, maxLength: 20 }
          )
        }),
        ({ company, processes }) => {
          // Create company details with processes of various statuses
          // Ensure unique IDs by adding index to each process
          const processesWithStatus = processes.map(({ process, status }, index) => ({
            ...process,
            id: `process-${index}`,
            status
          }));

          const companyDetails: CompanyDetails = {
            ...company,
            processes: processesWithStatus,
            activities: [],
            processos: []
          };

          // Setup component
          component.company = company;
          mockCompanyService.getCompanyDetails.and.returnValue(of(companyDetails));
          component.ngOnInit();
          component.companyDetails = companyDetails;

          // Test Tab 0: Macros incompletas (pending or in-progress)
          component.selectedTab = 0;
          const tab0Processes = component.currentTabProcesses;
          const allTab0AreIncomplete = tab0Processes.every(
            p => p.status === 'pending' || p.status === 'in-progress'
          );
          expect(allTab0AreIncomplete).toBe(true, 'Tab 0 should only show incomplete processes');

          // Test Tab 1: Atividades finalizadas (processes with completed tasks)
          component.selectedTab = 1;
          const tab1Processes = component.currentTabProcesses;
          const allTab1HaveCompletedTasks = tab1Processes.every(
            p => (p.tasks ?? []).every(t => t.status === 'completed')
          );
          expect(allTab1HaveCompletedTasks).toBe(true, 'Tab 1 should only show processes with completed tasks');

          // Test Tab 2: Macros finalizadas (completed processes)
          component.selectedTab = 2;
          const tab2Processes = component.currentTabProcesses;
          const allTab2AreCompleted = tab2Processes.every(
            p => p.status === 'completed'
          );
          expect(allTab2AreCompleted).toBe(true, 'Tab 2 should only show completed processes');

          // Verify no overlap between tabs
          const tab0Ids = new Set(tab0Processes.map(p => p.id));
          const tab2Ids = new Set(tab2Processes.map(p => p.id));
          
          // Tab 0 (incomplete) and Tab 2 (completed) should have no overlap
          const hasOverlap = [...tab0Ids].some(id => tab2Ids.has(id));
          expect(hasOverlap).toBe(false, 'Incomplete and completed tabs should not share processes');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: Tab switching preserves process expansion state
   * Validates that UI state is maintained when switching between tabs
   */
  it('should maintain independent expansion states across tabs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constant(generateProcess()), { minLength: 3, maxLength: 10 }),
        (processes) => {
          const company = generateCompany();
          const companyDetails: CompanyDetails = {
            ...company,
            processes: processes.map(p => ({ ...p, status: 'pending' as ProcessStatus })),
            activities: [],
            processos: []
          };

          component.company = company;
          mockCompanyService.getCompanyDetails.and.returnValue(of(companyDetails));
          component.ngOnInit();
          component.companyDetails = companyDetails;

          // Expand some processes in tab 0
          component.selectedTab = 0;
          const tab0Processes = component.currentTabProcesses;
          if (tab0Processes.length > 0) {
            // Manually toggle expansion state
            tab0Processes[0].expanded = !tab0Processes[0].expanded;
            const wasExpanded = tab0Processes[0].expanded;

            // Switch to another tab and back
            component.selectedTab = 1;
            component.selectedTab = 0;

            // Verify expansion state is preserved
            const sameProcessAfterSwitch = component.currentTabProcesses[0];
            expect(sameProcessAfterSwitch.expanded).toBe(wasExpanded, 'Process expansion state should be preserved');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
