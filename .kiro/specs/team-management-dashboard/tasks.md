# Implementation Plan

- [x] 1. Role Guard and Access Control
  - Create TeamRoleGuardService to check for GESTAO role
  - Implement canActivate method with role verification
  - Add route configuration for team management dashboard
  - Implement redirect logic for unauthorized users
  - Add error messaging for access denied scenarios
  - _Requirements: 1.1, 1.3, 1.4_

  - [x] 1.1 Write unit tests for role guard
    - Test canActivate returns true for GESTAO role
    - Test canActivate returns false and redirects for non-GESTAO users
    - Test error message display on access denied
    - _Requirements: 1.1, 1.3, 1.4_

- [x] 2. Aggregate Query Builder Service
  - Create AggregateQueryBuilderService
  - Implement buildPointsAggregateQuery method
  - Implement buildProgressAggregateQuery method
  - Implement buildGraphDataQuery method with date grouping
  - Implement buildCollaboratorListQuery method
  - Add date formatting utilities for Funifier relative dates
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 2.1 Write property test for query structure validity
    - **Property 6: Aggregate Query Structure Validity**
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [x] 2.2 Write unit tests for query builder
    - Test points query structure is correct
    - Test progress query structure is correct
    - Test graph query with day grouping
    - Test graph query with week grouping
    - Test date formatting for various inputs
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 3. Team Aggregate Service
  - Create TeamAggregateService
  - Implement getTeamSeasonPoints method with caching
  - Implement getTeamProgressMetrics method
  - Implement getTeamMembers method
  - Implement getCollaboratorData method
  - Add aggregate result processing methods
  - Implement error handling for aggregate queries
  - _Requirements: 4.2, 5.2, 12.5, 13.1, 13.2, 13.3_

  - [x] 3.1 Write property test for team points aggregation
    - **Property 1: Team Points Aggregation Accuracy**
    - **Validates: Requirements 4.2, 4.3**

  - [x] 3.2 Write property test for date range filtering
    - **Property 3: Date Range Filtering Consistency**
    - **Validates: Requirements 6.2, 6.3, 11.4**

  - [x] 3.3 Write unit tests for team aggregate service
    - Test getTeamSeasonPoints returns correct structure
    - Test getTeamProgressMetrics processes data correctly
    - Test caching mechanism works
    - Test error handling for failed queries
    - _Requirements: 4.2, 5.2, 12.5, 13.1_

- [x] 4. Graph Data Processor Service
  - Create GraphDataProcessorService
  - Implement processGraphData method
  - Implement groupByDate method
  - Implement fillMissingDates method to handle gaps
  - Implement createChartDatasets method
  - Add color palette for multiple datasets
  - _Requirements: 8.4, 13.4, 13.5_

  - [x] 4.1 Write property test for graph data completeness
    - **Property 4: Graph Data Completeness**
    - **Validates: Requirements 9.1, 9.5, 10.5**

  - [x] 4.2 Write property test for time period boundary
    - **Property 10: Time Period Selector Boundary**
    - **Validates: Requirements 11.3, 11.4**

  - [x] 4.3 Write unit tests for graph processor
    - Test processGraphData fills missing dates
    - Test groupByDate aggregates correctly
    - Test createChartDatasets formats for Chart.js
    - Test color assignment for multiple datasets
    - _Requirements: 8.4, 13.4, 13.5_

- [x] 5. Team and Collaborator Selector Components
  - Create TeamSelectorComponent with dropdown
  - Create CollaboratorSelectorComponent with dropdown
  - Implement team selection event emission
  - Implement collaborator selection event emission
  - Add "All" option for collaborator filter
  - Style components according to Figma design
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 5.1 Write property test for team selection persistence
    - **Property 8: Team Selection Persistence**
    - **Validates: Requirements 2.4, 18.5**

  - [x] 5.2 Write unit tests for selector components
    - Test TeamSelectorComponent emits correct team ID
    - Test CollaboratorSelectorComponent emits correct user ID
    - Test "All" option clears collaborator filter
    - Test dropdown displays all available options
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

- [x] 6. Team Sidebar Component
  - Create TeamSidebarComponent
  - Display team name and season date range
  - Display season points (Total, Bloqueados, Desbloqueados)
  - Display progress metrics (Processos incompletos, Atividades finalizadas, Processos finalizados)
  - Implement responsive layout for sidebar
  - Style according to Figma design with icons
  - _Requirements: 4.1, 4.4, 5.1, 5.3_

  - [x] 6.1 Write unit tests for team sidebar
    - Test sidebar displays team name correctly
    - Test season points render with correct values
    - Test progress metrics render with correct values
    - Test responsive layout adjustments
    - _Requirements: 4.1, 4.4, 5.1, 5.3_

- [x] 7. Goals Progress Tab Component
  - Create GoalsProgressTabComponent
  - Display circular progress indicators for goals
  - Reuse KPICircularProgressComponent from existing dashboard
  - Implement goal data fetching and processing
  - Calculate completion percentages
  - Style according to Figma design
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.1 Write property test for progress metric calculation
    - **Property 9: Progress Metric Calculation**
    - **Validates: Requirements 5.2, 5.3**

  - [x] 7.2 Write unit tests for goals tab
    - Test circular progress displays correct percentages
    - Test goal metrics render with current and target values
    - Test color coding based on completion status
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Chart Components (Line and Bar)
  - Install and configure Chart.js library
  - Create LineChartComponent with Chart.js integration
  - Create BarChartComponent with Chart.js integration
  - Implement tooltip formatting
  - Implement responsive chart sizing
  - Add chart update methods for data changes
  - Style charts according to Figma design
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3_

  - [x] 8.1 Write unit tests for chart components
    - Test LineChartComponent renders with data
    - Test BarChartComponent renders with data
    - Test chart updates when data changes
    - Test tooltip displays correct values
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2_

- [x] 9. Time Period Selector Component
  - Create TimePeriodSelectorComponent
  - Implement dropdown with period options (7, 15, 30, 60, 90 days)
  - Implement period selection event emission
  - Display selected period in Portuguese format
  - Style according to Figma design
  - _Requirements: 11.1, 11.2, 11.3_

  - [x] 9.1 Write unit tests for time period selector
    - Test dropdown displays all period options
    - Test period selection emits correct value
    - Test period formatting in Portuguese
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 10. Productivity Analysis Tab Component
  - Create ProductivityAnalysisTabComponent
  - Integrate TimePeriodSelectorComponent
  - Integrate LineChartComponent and BarChartComponent
  - Implement chart type toggle (line/bar)
  - Implement data fetching based on selected period
  - Handle loading states for graph data
  - Style according to Figma design
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 10.1 Write property test for chart type toggle preservation
    - **Property 7: Chart Type Toggle Preservation**
    - **Validates: Requirements 8.3, 16.3**

  - [x] 10.2 Write unit tests for productivity tab
    - Test chart type toggle switches between line and bar
    - Test period change triggers data reload
    - Test loading indicator displays during fetch
    - Test graph data updates correctly
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 11. Main Team Management Dashboard Component
  - Implement complete layout with sidebar and main content area
  - Integrate TeamSidebarComponent with real data
  - Integrate TeamSelectorComponent and CollaboratorSelectorComponent
  - Integrate MonthSelectorComponent (reuse from existing dashboard)
  - Implement tab switching between Goals and Productivity tabs
  - Wire up all data flow between components (team selection → data fetch → display)
  - Implement refresh mechanism with cache clearing
  - Add loading states for all data sections
  - Fetch team list from Funifier API or user metadata
  - Fetch collaborator list based on selected team
  - Fetch season points and progress metrics for selected team/collaborator
  - _Requirements: All_

  - [x] 11.1 Write property test for collaborator filter isolation
    - **Property 2: Collaborator Filter Isolation**
    - **Validates: Requirements 3.3, 3.4**

  - [x] 11.2 Write integration tests for dashboard
    - Test dashboard loads all child components
    - Test team selection updates all sections
    - Test collaborator filter updates metrics
    - Test month change triggers data reload
    - Test tab switching preserves selections
    - _Requirements: All_

- [x] 12. Loading States and Error Handling
  - Add loading spinners to all data-dependent sections
  - Implement error display for failed aggregate queries
  - Add retry buttons for failed requests
  - Implement toast notifications for user feedback
  - Handle empty data states with appropriate messages
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 12.1 Write unit tests for error scenarios
    - Test loading spinner displays during data fetch
    - Test error message displays on query failure
    - Test retry button triggers new request
    - Test empty state message displays when no data
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 13. Data Refresh and State Management
  - Implement manual refresh button in dashboard header
  - Add refresh timestamp display
  - Implement state preservation during refresh (team, collaborator, month, tab)
  - Clear cache on manual refresh
  - Add loading indicators during refresh
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 13.1 Write unit tests for refresh mechanism
    - Test manual refresh clears cache and reloads data
    - Test refresh preserves user selections
    - Test refresh timestamp updates correctly
    - Test loading indicators display during refresh
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 14. Responsive Design Implementation
  - Implement responsive breakpoints for team dashboard
  - Adjust sidebar layout for tablet and mobile
  - Optimize chart sizing for smaller screens
  - Ensure dropdowns work on touch devices
  - Test all components at different screen sizes
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 14.1 Write unit tests for responsive behavior
    - Test breakpoint detection
    - Test layout changes at different sizes
    - Test chart responsiveness
    - Test mobile-friendly interactions
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 15. Navigation Between Dashboards
  - Add navigation menu item for team management dashboard in main layout
  - Implement dashboard switcher component or menu in header/sidebar
  - Add conditional rendering based on GESTAO role
  - Update route configuration if needed
  - Implement session storage for last visited dashboard
  - Display current dashboard name in header or breadcrumb
  - Test navigation flow between personal and team dashboards
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 15.1 Write unit tests for navigation
    - Test navigation menu displays for GESTAO users
    - Test navigation menu hidden for non-GESTAO users
    - Test dashboard switcher navigates correctly
    - Test last visited dashboard is remembered
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 16. Performance Optimization
  - Verify caching implementation in TeamAggregateService (already implemented)
  - Add OnPush change detection strategy to all dashboard components
  - Optimize chart rendering with debouncing on data changes
  - Implement lazy loading for chart library if not already present
  - Review and optimize bundle size
  - Add performance monitoring for aggregate queries
  - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 16.1 Write performance tests
    - Test caching reduces API calls
    - Test change detection optimization
    - Test chart rendering performance
    - Measure bundle size impact
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [x] 17. Styling and Visual Polish
  - Apply dark theme consistent with existing gamification dashboard
  - Style TeamManagementDashboardComponent layout (sidebar + main content)
  - Add hover effects and transitions to interactive elements
  - Implement focus states for accessibility
  - Add animations for tab switching
  - Polish spacing and typography across all components
  - Ensure color contrast meets WCAG AA standards
  - Match Figma design specifications
  - _Requirements: All_

- [x] 18. Accessibility Implementation
  - Add ARIA labels to all interactive elements
  - Implement keyboard navigation for all components
  - Add screen reader announcements for data updates
  - Test with screen reader (NVDA or JAWS)
  - Ensure all charts have accessible alternatives
  - Test keyboard-only navigation
  - _Requirements: All_

  - [x] 18.1 Write accessibility tests
    - Test ARIA labels are present
    - Test keyboard navigation works
    - Test screen reader announcements
    - Test color contrast ratios
    - _Requirements: All_

- [x] 19. Final Integration and Testing
  - Run all unit tests and ensure they pass
  - Run all property-based tests and verify they pass
  - Test with real Funifier API aggregate queries using actual data
  - Verify all requirements are met against requirements document
  - Test role-based access control end-to-end (GESTAO vs non-GESTAO)
  - Test with multiple teams and collaborators
  - Test all filter combinations (team + collaborator + month)
  - Perform cross-browser testing (Chrome, Firefox, Safari, Edge)
  - Test on different screen sizes and devices
  - _Requirements: All_

  - [x] 19.1 Run complete test suite
    - Run all unit tests
    - Run all property-based tests
    - Run integration tests
    - Generate coverage report
    - _Requirements: All_

- [x] 20. Documentation
  - Document aggregate query patterns and examples
  - Create usage guide for managers (how to use the dashboard)
  - Document role configuration requirements (how to assign GESTAO role)
  - Add inline code documentation (JSDoc comments)
  - Update main README with team dashboard information
  - Document API integration patterns
  - Create troubleshooting guide for common issues
  - _Requirements: All_
