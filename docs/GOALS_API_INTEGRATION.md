# Goals API Integration & Canceled Points Feature

## Overview
This document describes the implementation of fetching KPIs from the G4U Goals API and adding canceled points to the player dashboard.

## Changes Made

### 1. New Goals API Service (`src/app/services/goals-api.service.ts`)

Created a new service to fetch goal data from the G4U API endpoint `/goals/logs`.

**Key Features:**
- Fetches all goal logs from the API
- Filters by goal template IDs for specific KPIs
- Returns the most recent log for each goal
- Handles both Receita Concedida template IDs (checks both and returns newest)
- Parses numeric values from various formats (handles Brazilian number format)
- Provides team-specific KPIs based on team name

**Goal Template IDs:**
- `126bfa2d-5845-4a3f-94d0-301b988dac33` - Meta de Aposentadorias Concedidas
- `6429c552-989a-47fe-82b8-ee57ee685dc5` - Receita concedida (template 1)
- `ddda4928-6e01-452a-bbac-edaf4d873b85` - Receita concedida (template 2)
- `b96dd54a-2847-4267-b234-2bd02e63b118` - Meta de Protocolo

**Team-Specific KPIs:**
- **Financeiro**: Receita Concedida only
- **Jurídico**: Meta de Protocolo + Aposentadorias Concedidas
- **CS**: Meta de Protocolo + Aposentadorias Concedidas

### 2. Updated KPI Service (`src/app/services/kpi.service.ts`)

Modified to fetch KPIs from the Goals API instead of using hardcoded values.

**Changes:**
- Added `GoalsApiService` dependency injection
- Updated `getPlayerKPIs()` to fetch from goals API based on team
- Updated `getPlayerKPIsForDateRange()` to use goals API
- Added fallback mechanism to use hardcoded values if goals API fails
- Maintains backward compatibility with existing KPI structure

**Data Flow:**
1. Fetch player data to get team name
2. Call `goalsApi.getAllKpisForTeam(teamName)` to get goals
3. Convert goal data to KPIData format
4. Map goal template IDs to KPI IDs
5. Calculate super targets (1.5x target)
6. Determine colors based on current vs target vs super target

**Fallback Behavior:**
- If goals API fails, falls back to hardcoded values from player extra data
- Logs warnings when using fallback
- Ensures UI never breaks due to API failures

### 3. Canceled Points Feature

#### 3.1 Updated PointWallet Model (`src/app/model/gamification-dashboard.model.ts`)
Added optional `cancelados` field to the `PointWallet` interface.

#### 3.2 Updated User Action Dashboard Service (`src/app/services/user-action-dashboard.service.ts`)
Added `getCanceledPoints()` method:
- Fetches all user actions with status `CANCELLED`
- Uses `/user-action/search` endpoint with `status=CANCELLED` filter
- Sums points from all canceled actions
- Returns total canceled points

#### 3.3 Updated Gamification Dashboard Component
Modified `loadPlayerData()` and `loadPlayerDataFromGame4u()`:
- Added `loadCanceledPoints()` method
- Fetches canceled points after loading point wallet
- Updates point wallet with canceled points value
- Uses user email for the API call

#### 3.4 Updated Point Wallet Component
**HTML (`src/app/components/c4u-point-wallet/c4u-point-wallet.component.html`):**
- Added new row for canceled points
- Only displays if `cancelados` is defined and greater than 0
- Uses `ri-close-circle-fill` icon
- Includes info button for tooltip

**SCSS (`src/app/components/c4u-point-wallet/c4u-point-wallet.component.scss`):**
- Added `.cancelados` icon styling with red color (`#fa5252`)

## API Endpoints Used

### Goals API
- **GET** `/goals/logs` - Fetches all goal logs
  - Returns array of goal log objects
  - Each log contains: `id`, `title`, `goal_template_id`, `current_goal_value`, `updated_value`, `cumulative_value`, `cumulative_percentual_progress`, `updated_at`

### User Actions API
- **GET** `/user-action/search?user_email={email}&status=CANCELLED&limit=500`
  - Fetches all canceled actions for a user
  - Supports pagination with `page` or `page_token`
  - Returns array of user action objects with `points` field

## Data Mapping

### Goals to KPIs
```typescript
Goal Log → KPI Data
{
  goal_template_id → id (mapped to KPI ID)
  title → label
  cumulative_value or updated_value → current
  current_goal_value → target
  target * 1.5 → superTarget
  cumulative_percentual_progress → percentage
}
```

### KPI ID Mapping
- `126bfa2d-5845-4a3f-94d0-301b988dac33` → `aposentadorias-concedidas`
- `6429c552-989a-47fe-82b8-ee57ee685dc5` → `receita-concedida`
- `ddda4928-6e01-452a-bbac-edaf4d873b85` → `receita-concedida`
- `b96dd54a-2847-4267-b234-2bd02e63b118` → `meta-protocolo`

## Error Handling

### Goals API Errors
- Logs warning to console
- Falls back to hardcoded values from player extra data
- UI continues to function normally
- User sees KPIs even if goals API is unavailable

### Canceled Points Errors
- Logs error to console
- Canceled points field remains undefined
- Point wallet component hides canceled points row
- Other point types display normally

## Testing Recommendations

1. **Goals API Integration:**
   - Test with each team (Financeiro, Jurídico, CS)
   - Verify correct KPIs are displayed for each team
   - Test with missing goal logs
   - Test with invalid goal template IDs
   - Verify fallback behavior when API fails

2. **Canceled Points:**
   - Test with user who has canceled actions
   - Test with user who has no canceled actions
   - Verify points are summed correctly
   - Test with large number of canceled actions (pagination)

3. **UI Display:**
   - Verify canceled points row only shows when > 0
   - Check icon and color styling
   - Test info button tooltip
   - Verify number formatting (Brazilian locale)

## Performance Considerations

- Goals API calls are cached for 3 minutes (existing cache mechanism)
- Canceled points are fetched once per dashboard load
- Pagination handles large datasets (500 items per page)
- All API calls are non-blocking (Observable pattern)

## Future Enhancements

1. **Goals API:**
   - Add month filtering for goals (currently uses most recent)
   - Cache goal template ID resolution
   - Add retry logic for failed API calls

2. **Canceled Points:**
   - Add date range filtering
   - Show breakdown by month
   - Add modal to view canceled actions details
   - Cache canceled points with TTL

3. **UI:**
   - Add loading indicators for canceled points
   - Add tooltips explaining each point type
   - Add trend indicators (up/down arrows)

## Migration Notes

- **No breaking changes** - all changes are backward compatible
- Existing KPI functionality preserved with fallback
- New canceled points field is optional
- No database migrations required
- No environment variable changes needed

## Rollback Plan

If issues arise:
1. Goals API can be disabled by removing `GoalsApiService` injection
2. KPI service will automatically fall back to hardcoded values
3. Canceled points can be hidden by removing the row from HTML template
4. All changes are isolated to specific services/components
