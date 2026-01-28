import * as fc from 'fast-check';
import { C4uProcessAccordionComponent } from './c4u-process-accordion.component';
import { Process, ProcessStatus, TaskStatus } from '@model/gamification-dashboard.model';

/**
 * Property-Based Tests for Process Accordion Component
 * Using fast-check library to verify universal properties
 */
describe('C4uProcessAccordionComponent - Property-Based Tests', () => {
  
  /**
   * Feature: gamification-dashboard, Property 7: Process Accordion Expansion
   * Validates: Requirements 9.2, 9.4
   * 
   * Property: For any process in the accordion, clicking the process header should 
   * toggle its expansion state without affecting other processes' expansion states.
   */
  describe('Property 7: Process Accordion Expansion', () => {
    
    // Generator for TaskStatus
    const taskStatusArb = fc.constantFrom<TaskStatus>(
      'pending',
      'in-progress',
      'completed'
    );

    // Generator for ProcessStatus
    const processStatusArb = fc.constantFrom<ProcessStatus>(
      'pending',
      'in-progress',
      'completed',
      'blocked'
    );

    // Generator for Task
    const taskArb = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      responsible: fc.string({ minLength: 1, maxLength: 30 }),
      status: taskStatusArb,
      dueDate: fc.option(fc.date(), { nil: undefined })
    });

    // Generator for Process
    const processArb = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      status: processStatusArb,
      tasks: fc.array(taskArb, { minLength: 0, maxLength: 10 }),
      expanded: fc.boolean()
    });

    it('should toggle expansion state for any process', () => {
      fc.assert(
        fc.property(
          processArb,
          (process: Process) => {
            const component = new C4uProcessAccordionComponent();
            component.processes = [process];
            const initialState = process.expanded;

            component.toggleProcess(0);
            expect(component.processes[0].expanded).toBe(!initialState);

            component.toggleProcess(0);
            expect(component.processes[0].expanded).toBe(initialState);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not affect other processes when toggling one process', () => {
      fc.assert(
        fc.property(
          fc.array(processArb, { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 0, max: 9 }),
          (processes: Process[], targetIndex: number) => {
            // Ensure targetIndex is within bounds
            if (targetIndex >= processes.length) {
              targetIndex = processes.length - 1;
            }

            const component = new C4uProcessAccordionComponent();
            component.processes = processes;
            
            // Store initial states of all processes
            const initialStates = processes.map(p => p.expanded);
            
            // Toggle the target process
            component.toggleProcess(targetIndex);
            
            // Verify only the target process changed
            component.processes.forEach((process, index) => {
              if (index === targetIndex) {
                expect(process.expanded).toBe(!initialStates[index]);
              } else {
                expect(process.expanded).toBe(initialStates[index]);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow multiple processes to be expanded simultaneously', () => {
      fc.assert(
        fc.property(
          fc.array(processArb, { minLength: 2, maxLength: 10 }),
          (processes: Process[]) => {
            const component = new C4uProcessAccordionComponent();
            component.processes = processes;
            
            // Set all processes to collapsed
            component.processes.forEach(p => p.expanded = false);
            
            // Expand all processes
            component.processes.forEach((p, index) => component.toggleProcess(index));
            
            // Verify all are expanded
            const allExpanded = component.processes.every(p => p.expanded === true);
            expect(allExpanded).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain expansion state through multiple toggles', () => {
      fc.assert(
        fc.property(
          processArb,
          fc.integer({ min: 0, max: 20 }),
          (process: Process, toggleCount: number) => {
            const component = new C4uProcessAccordionComponent();
            component.processes = [process];
            const initialState = process.expanded;
            
            // Toggle multiple times
            for (let i = 0; i < toggleCount; i++) {
              component.toggleProcess(0);
            }
            
            // After even number of toggles, should be back to initial state
            // After odd number of toggles, should be opposite of initial state
            const expectedState = toggleCount % 2 === 0 ? initialState : !initialState;
            expect(component.processes[0].expanded).toBe(expectedState);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle processes with varying numbers of tasks', () => {
      fc.assert(
        fc.property(
          fc.array(processArb, { minLength: 1, maxLength: 5 }),
          (processes: Process[]) => {
            const component = new C4uProcessAccordionComponent();
            component.processes = processes;
            
            // Toggle each process and verify it works regardless of task count
            component.processes.forEach((process, index) => {
              const initialState = process.expanded;
              component.toggleProcess(index);
              expect(component.processes[index].expanded).toBe(!initialState);
              
              // Verify tasks array is not affected
              expect(Array.isArray(component.processes[index].tasks)).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve process data when toggling expansion', () => {
      fc.assert(
        fc.property(
          processArb,
          (process: Process) => {
            const component = new C4uProcessAccordionComponent();
            component.processes = [process];
            
            // Store original data
            const originalId = process.id;
            const originalName = process.name;
            const originalStatus = process.status;
            const originalTaskCount = process.tasks.length;
            
            // Toggle expansion
            component.toggleProcess(0);
            
            // Verify all other data remains unchanged
            expect(component.processes[0].id).toBe(originalId);
            expect(component.processes[0].name).toBe(originalName);
            expect(component.processes[0].status).toBe(originalStatus);
            expect(component.processes[0].tasks.length).toBe(originalTaskCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Status Mapping Properties', () => {
    it('should always return a valid CSS class for any status', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (status: string) => {
            const component = new C4uProcessAccordionComponent();
            const cssClass = component.getStatusClass(status);
            
            // Should always return a string
            expect(typeof cssClass).toBe('string');
            
            // Should return either a valid status class or empty string
            const validClasses = ['status-pending', 'status-in-progress', 'status-completed', 'status-blocked', ''];
            expect(validClasses.includes(cssClass)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return a non-null label for any status', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (status: string) => {
            const component = new C4uProcessAccordionComponent();
            const label = component.getStatusLabel(status);
            
            // Should always return a string (either mapped or original)
            expect(typeof label).toBe('string');
            // For empty input, should return empty string (which is valid)
            if (status === '') {
              expect(label).toBe('');
            } else {
              expect(label).toBeTruthy();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should map known statuses consistently', () => {
      const component = new C4uProcessAccordionComponent();
      const knownStatuses: ProcessStatus[] = ['pending', 'in-progress', 'completed', 'blocked'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...knownStatuses),
          (status: ProcessStatus) => {
            const cssClass = component.getStatusClass(status);
            const label = component.getStatusLabel(status);
            
            // Known statuses should always have a CSS class
            expect(cssClass).toBeTruthy();
            expect(cssClass).toContain('status-');
            
            // Known statuses should have Portuguese labels
            expect(label).toBeTruthy();
            expect(label).not.toBe(status); // Should be translated
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
