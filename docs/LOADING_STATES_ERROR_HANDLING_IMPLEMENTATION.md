# Loading States and Error Handling Implementation

## Overview

This document describes the implementation of loading states and error handling for the Team Management Dashboard, completing Task 12 of the team-management-dashboard spec.

## Requirements Addressed

- **14.1**: Loading spinners for all data-dependent sections
- **14.2**: Error display for failed aggregate queries
- **14.3**: Retry buttons for failed requests
- **14.4**: Toast notifications for user feedback
- **14.5**: Empty data states with appropriate messages

## Implementation Summary

### 1. Error Message Component

Created a reusable error message component (`C4uErrorMessageComponent`) that provides:

**Features:**
- Customizable error messages
- Optional retry button with loading state
- Icon-based visual feedback
- Accessible design with ARIA labels
- Spinning icon animation during retry

**Files:**
- `src/app/components/c4u-error-message/c4u-error-message.component.ts`
- `src/app/components/c4u-error-message/c4u-error-message.component.html`
- `src/app/components/c4u-error-message/c4u-error-message.component.scss`
- `src/app/components/c4u-error-message/c4u-error-message.component.spec.ts`

**Usage Example:**
```html
<c4u-error-message
  [message]="errorMessage"
  [showRetry]="true"
  [isRetrying]="isLoading"
  (retry)="retryData()">
</c4u-error-message>
```

### 2. Enhanced Dashboard Component

Updated `TeamManagementDashboardComponent` with comprehensive error handling:

**Error State Tracking:**
```typescript
// Error states
hasError: boolean = false;
errorMessage: string = '';
hasSidebarError: boolean = false;
sidebarErrorMessage: string = '';
hasGoalsError: boolean = false;
goalsErrorMessage: string = '';
hasProductivityError: boolean = false;
productivityErrorMessage: string = '';
```

**Retry Methods:**
- `retrySidebarData()`: Retry loading sidebar metrics
- `retryGoalsData()`: Retry loading goals data
- `retryProductivityData()`: Retry loading productivity data

**Error Handling Pattern:**
```typescript
this.teamAggregateService
  .getTeamSeasonPoints(this.selectedTeam, dateRange.start, dateRange.end)
  .pipe(
    takeUntil(this.destroy$),
    finalize(() => this.isLoadingSidebar = false)
  )
  .subscribe({
    next: (points) => {
      this.seasonPoints = points;
      this.hasSidebarError = false;
    },
    error: (error) => {
      console.error('Error loading season points:', error);
      this.seasonPoints = { total: 0, bloqueados: 0, desbloqueados: 0 };
      this.hasSidebarError = true;
      this.sidebarErrorMessage = 'Erro ao carregar pontos da temporada';
      this.toastService.error('Erro ao carregar pontos da temporada');
    }
  });
```

### 3. Updated HTML Template

Enhanced the dashboard template with error states and retry functionality:

**Sidebar Error Handling:**
```html
<div class="sidebar-metrics" *ngIf="!isLoadingSidebar && !hasSidebarError; else sidebarLoadingOrError">
  <c4u-team-sidebar ...></c4u-team-sidebar>
</div>

<ng-template #sidebarLoadingOrError>
  <div *ngIf="isLoadingSidebar" class="loading-section">
    <div class="spinner-border text-primary" role="status">
      <span class="sr-only">Carregando...</span>
    </div>
    <p class="loading-text">Carregando métricas...</p>
  </div>
  
  <div *ngIf="hasSidebarError && !isLoadingSidebar">
    <c4u-error-message
      [message]="sidebarErrorMessage"
      [showRetry]="true"
      [isRetrying]="isLoadingSidebar"
      (retry)="retrySidebarData()">
    </c4u-error-message>
  </div>
</ng-template>
```

**Goals Tab Error Handling:**
```html
<div class="tab-pane" *ngIf="activeTab === 'goals'" [@fadeIn]>
  <div *ngIf="!isLoadingGoals && !hasGoalsError">
    <c4u-goals-progress-tab ...></c4u-goals-progress-tab>
  </div>

  <div *ngIf="isLoadingGoals" class="loading-section">
    <!-- Loading spinner -->
  </div>

  <div *ngIf="hasGoalsError && !isLoadingGoals">
    <c4u-error-message
      [message]="goalsErrorMessage"
      [showRetry]="true"
      [isRetrying]="isLoadingGoals"
      (retry)="retryGoalsData()">
    </c4u-error-message>
  </div>
</div>
```

**Productivity Tab Error Handling:**
```html
<div class="tab-pane" *ngIf="activeTab === 'productivity'" [@fadeIn]>
  <div *ngIf="!isLoadingProductivity && !hasProductivityError">
    <c4u-productivity-analysis-tab ...></c4u-productivity-analysis-tab>
  </div>

  <div *ngIf="isLoadingProductivity" class="loading-section">
    <!-- Loading spinner -->
  </div>

  <div *ngIf="hasProductivityError && !isLoadingProductivity">
    <c4u-error-message
      [message]="productivityErrorMessage"
      [showRetry]="true"
      [isRetrying]="isLoadingProductivity"
      (retry)="retryProductivityData()">
    </c4u-error-message>
  </div>
</div>
```

### 4. Empty State Handling

Child components already implement empty state messages:

**Goals Progress Tab:**
```html
<div class="goals-empty" *ngIf="!isLoading && goals.length === 0">
  <i class="ri-bar-chart-line empty-icon"></i>
  <p class="empty-text">Nenhuma meta disponível</p>
</div>
```

**Productivity Analysis Tab:**
```html
<div *ngIf="!isLoading && (!graphData || graphData.length === 0)" class="empty-state">
  <i class="bi bi-graph-up empty-icon"></i>
  <p class="empty-text">Nenhum dado disponível para o período selecionado</p>
</div>
```

### 5. Toast Notifications

Toast notifications are triggered on all error scenarios using the existing `ToastService`:

```typescript
this.toastService.error('Erro ao carregar pontos da temporada');
this.toastService.error('Erro ao carregar métricas de progresso');
this.toastService.error('Erro ao carregar dados de metas');
this.toastService.error('Erro ao carregar dados de produtividade');
```

### 6. Module Configuration

Created `C4uProductivityAnalysisTabModule` to properly encapsulate the productivity analysis tab component and its dependencies.

Updated `TeamManagementDashboardModule` to:
- Import the new error message component
- Import the productivity analysis tab module
- Ensure SharedModule provides necessary pipes (NumberFormatPipe, DateFormatPipe)

## Testing

### Unit Tests

Comprehensive unit tests were added to `team-management-dashboard.component.spec.ts`:

**Test Categories:**
1. **Loading Spinner Display** (Requirement 14.1)
   - Tests loading state for sidebar, goals, and productivity tabs
   - Verifies spinners appear and disappear correctly

2. **Error Message Display** (Requirement 14.2)
   - Tests error messages appear when queries fail
   - Verifies correct error messages are displayed
   - Tests toast notifications are triggered

3. **Retry Button Functionality** (Requirement 14.3)
   - Tests retry buttons trigger new requests
   - Verifies retry count increases
   - Tests error state is reset during retry

4. **Empty Data State Display** (Requirement 14.5)
   - Tests empty state messages for goals
   - Tests empty state messages for graph data
   - Tests empty state for collaborators

5. **Error Logging** (Requirement 14.2)
   - Tests errors are logged to console for debugging

6. **Toast Notifications** (Requirement 14.4)
   - Tests toast service is called on errors
   - Verifies correct error messages

7. **Error State Reset**
   - Tests error states are cleared when retrying
   - Verifies clean state after successful retry

### Error Message Component Tests

Comprehensive tests for `C4uErrorMessageComponent`:

1. **Error Message Display**
   - Default and custom error messages
   - Error icon display

2. **Retry Button**
   - Show/hide based on `showRetry` input
   - Emit retry event on click
   - Disabled state when retrying
   - Text changes during retry
   - Spinning icon animation

3. **Accessibility**
   - ARIA labels
   - Keyboard accessibility
   - Focus management

## User Experience

### Loading States

Users see clear loading indicators for each section:
- **Sidebar**: "Carregando métricas..."
- **Goals Tab**: "Carregando metas..."
- **Productivity Tab**: "Carregando análise de produtividade..."
- **Global**: Full-screen overlay with "Carregando dados..."

### Error States

When errors occur, users see:
1. **Error Icon**: Warning triangle icon
2. **Error Message**: Clear, user-friendly message in Portuguese
3. **Retry Button**: "Tentar Novamente" button
4. **Toast Notification**: Brief error notification at top of screen

### Retry Flow

1. User clicks "Tentar Novamente"
2. Button text changes to "Tentando..."
3. Button is disabled with spinning icon
4. Error state is cleared
5. New request is made
6. On success: Data is displayed
7. On failure: Error state returns with updated message

### Empty States

When no data is available:
- **Goals**: "Nenhuma meta disponível" with chart icon
- **Productivity**: "Nenhum dado disponível para o período selecionado" with graph icon

## Error Handling Best Practices

1. **Graceful Degradation**: Failed requests return empty data structures instead of breaking the UI
2. **User Feedback**: Multiple feedback mechanisms (error messages, toasts, console logs)
3. **Retry Logic**: Users can manually retry failed requests
4. **State Management**: Clear separation of loading, error, and success states
5. **Accessibility**: Error messages are screen-reader friendly
6. **Logging**: All errors are logged to console for debugging

## Future Enhancements

Potential improvements for future iterations:

1. **Automatic Retry**: Implement exponential backoff for automatic retries
2. **Offline Detection**: Detect network connectivity and show appropriate messages
3. **Error Analytics**: Track error rates and types for monitoring
4. **Partial Data Display**: Show partial data when some queries succeed
5. **Error Recovery**: Implement more sophisticated error recovery strategies
6. **Rate Limiting**: Handle rate limit errors with appropriate messaging

## Conclusion

The loading states and error handling implementation provides a robust, user-friendly experience for the Team Management Dashboard. All requirements (14.1-14.5) have been fully implemented with comprehensive testing and documentation.

Users now have clear visibility into:
- When data is loading
- When errors occur
- How to recover from errors
- When no data is available

The implementation follows Angular best practices and maintains consistency with the existing gamification dashboard patterns.
