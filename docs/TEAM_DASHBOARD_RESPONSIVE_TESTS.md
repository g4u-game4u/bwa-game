# Team Management Dashboard - Responsive Behavior Tests

## Overview

This document describes the comprehensive unit tests created for the team management dashboard's responsive behavior, validating Requirements 15.1-15.5.

## Test File

**Location:** `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.responsive.spec.ts`

## Test Coverage

### 1. Breakpoint Detection (Requirement 15.1)

Tests that the dashboard correctly detects different screen sizes:

- **Desktop breakpoint (1920px+)**: Validates layout at standard desktop resolution
- **Large desktop (2560px)**: Ensures rendering at very large screens
- **Tablet breakpoint (768px-1024px)**: Tests tablet layout at lower and upper bounds
- **Mobile breakpoint (<768px)**: Validates mobile layout at 375px
- **Small mobile (320px)**: Tests minimum mobile width
- **Breakpoint transitions**: Ensures smooth transitions between breakpoints
- **State preservation**: Verifies component state is maintained across breakpoint changes

**Key Assertions:**
- Window.innerWidth is set correctly
- Dashboard elements render at all breakpoints
- Component state (selectedTeam, activeTab) persists through viewport changes

### 2. Layout Changes at Different Sizes (Requirement 15.2)

Tests that the dashboard layout adapts appropriately:

- **Grid layout on desktop**: Validates CSS grid display
- **Grid column adjustment on tablet**: Ensures proper column widths
- **Content stacking on mobile**: Tests single-column layout
- **Sidebar visibility**: Confirms sidebar renders at all sizes
- **Content reordering on mobile**: Validates CSS order changes
- **Header layout adaptation**: Tests header flex layout on mobile
- **Padding adjustments**: Ensures appropriate spacing at different sizes
- **Gap adjustments**: Validates element spacing changes
- **Horizontal scroll prevention**: Tests overflow-x handling

**Key Assertions:**
- display: grid is applied correctly
- Sidebar and main content are visible
- overflow-x is set to hidden/auto/clip
- Padding and gap values are defined

### 3. Chart Responsiveness (Requirement 15.3)

Tests that charts resize appropriately:

- **Chart container rendering**: Validates tab-content exists at all sizes
- **Padding adjustments**: Tests chart container padding on mobile
- **Aspect ratio maintenance**: Ensures charts maintain proportions
- **Data update handling**: Tests chart data updates at different viewports
- **Minimum height on mobile**: Validates reasonable chart heights

**Key Assertions:**
- Tab content renders at desktop, tablet, and mobile
- Chart data remains consistent across viewport changes
- Minimum height is defined and reasonable

### 4. Mobile-Friendly Interactions (Requirement 15.4)

Tests that dropdowns and interactive elements work on touch devices:

- **Dropdown selectors**: Validates all selectors render on mobile
- **Team selector**: Tests team dropdown on mobile
- **Collaborator selector**: Tests collaborator dropdown on mobile
- **Month selector**: Tests month dropdown on mobile
- **Touch target sizes**: Validates buttons have adequate size
- **Tab buttons**: Tests tab navigation on mobile
- **Tab switching**: Validates tab functionality on mobile
- **Refresh button**: Tests refresh button on mobile
- **Button text sizing**: Validates font size adjustments
- **Interactive element accessibility**: Ensures all interactive elements are visible
- **Selector functionality**: Tests selector change handlers on mobile

**Key Assertions:**
- All selector components render
- Buttons have width and height > 0
- Tab switching works correctly
- Refresh button triggers refreshData()
- Interactive elements are visible (not display:none)

### 5. Component Rendering at Different Screen Sizes (Requirement 15.5)

Tests that all components render correctly:

- **Main sections rendering**: Validates header, sidebar, and main content at all sizes
- **Team sidebar component**: Tests c4u-team-sidebar at all viewports
- **Tab navigation**: Validates tab-navigation at all sizes
- **Goals tab content**: Tests goals tab on mobile
- **Productivity tab content**: Tests productivity tab on mobile
- **Text readability**: Ensures font sizes are reasonable (≥12px)
- **Loading states**: Tests loading overlay at all sizes
- **Error states**: Tests error message display at all sizes
- **Selector labels**: Validates labels render at all sizes
- **Component hierarchy**: Ensures DOM structure is maintained

**Key Assertions:**
- All major components exist at all breakpoints
- Font sizes are ≥12px
- Loading and error states render correctly
- Component hierarchy is preserved

### 6. Responsive Edge Cases

Additional tests for boundary conditions:

- **Very small viewport (320px)**: Tests minimum mobile width
- **Very large viewport (3840px - 4K)**: Tests ultra-wide displays
- **Rapid viewport changes**: Tests stability during quick resizes
- **Data integrity during resize**: Ensures data persists
- **Orientation changes**: Tests portrait to landscape transitions
- **Breakpoint boundaries**: Tests exact breakpoint values (767, 768, 1024, 1025)
- **Missing optional elements**: Tests graceful degradation
- **Empty data states**: Validates rendering with no data
- **Box-sizing consistency**: Ensures border-box at all sizes

**Key Assertions:**
- Dashboard renders at extreme viewport sizes
- Data integrity is maintained
- Component remains stable through rapid changes
- box-sizing: border-box is applied

## Test Utilities

### Helper Functions

1. **setViewportWidth(width: number)**
   - Sets window.innerWidth
   - Dispatches resize event
   - Triggers change detection

2. **getComputedStyleOf(selector: string)**
   - Queries element by selector
   - Returns computed CSS styles
   - Returns null if element not found

## Breakpoint Constants

```typescript
const BREAKPOINTS = {
  MOBILE_MAX: 767,
  TABLET_MIN: 768,
  TABLET_MAX: 1024,
  DESKTOP_MIN: 1920
};
```

## Test Statistics

- **Total Test Suites**: 6
- **Total Test Cases**: 80+
- **Breakpoints Tested**: 320px, 375px, 667px, 768px, 1024px, 1920px, 2560px, 3840px
- **Components Tested**: Dashboard, Header, Sidebar, Main Content, Tabs, Selectors, Charts
- **Requirements Validated**: 15.1, 15.2, 15.3, 15.4, 15.5

## Running the Tests

```bash
# Run all responsive tests
npm test -- --include='**/team-management-dashboard.responsive.spec.ts'

# Run with coverage
npm test -- --include='**/team-management-dashboard.responsive.spec.ts' --code-coverage

# Run in headless mode
npm test -- --include='**/team-management-dashboard.responsive.spec.ts' --browsers=ChromeHeadless --watch=false
```

## Known Limitations

1. **CSS Media Queries**: Media query styles may not fully apply in the test environment. The tests verify that:
   - Elements exist and are visible
   - Basic layout properties are set
   - Component state is maintained

2. **Actual Rendering**: Tests verify DOM structure and computed styles but don't validate pixel-perfect rendering. Visual regression testing should be done separately.

3. **Touch Events**: Tests verify touch target sizes and element visibility but don't simulate actual touch events.

## Integration with CI/CD

These tests are part of the standard test suite and will run automatically in the CI/CD pipeline. They ensure that responsive behavior is maintained across code changes.

## Future Enhancements

1. **Visual Regression Testing**: Add screenshot comparison tests
2. **Touch Event Simulation**: Add tests for actual touch interactions
3. **Performance Testing**: Measure rendering performance at different viewport sizes
4. **Accessibility Testing**: Add tests for screen reader compatibility at different sizes

## Related Documentation

- [Team Management Dashboard Implementation](./TEAM_MANAGEMENT_DASHBOARD_MAIN_COMPONENT.md)
- [Requirements Document](../.kiro/specs/team-management-dashboard/requirements.md)
- [Design Document](../.kiro/specs/team-management-dashboard/design.md)
- [Tasks Document](../.kiro/specs/team-management-dashboard/tasks.md)

## Conclusion

The responsive behavior tests provide comprehensive coverage of the team management dashboard's adaptive layout capabilities. They ensure that the dashboard works correctly across all target devices and screen sizes, from small mobile phones (320px) to large desktop displays (1920px+).
