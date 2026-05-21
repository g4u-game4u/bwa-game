# Empty Modal Fix - Status DONE and DELIVERED Filter

## Problem
The Clientes list was showing action counts for deliveries, but when clicking to open the modal detail, it showed "Nenhuma atividade encontrada" (no activities found).

## Root Cause
Actions in the list included **pending/in-progress actions** (with `finished_at: null`), but the modal was querying by `finished_at` date range, which returned 0 results for pending actions.

Console logs showed many messages like:
```
[referenceTimestamp] No finished_at, using created_at for action f9eb1b3f-ad2f-41c1-b197-8cfe22b7374f: 2026-05-20T15:06:06.844Z finished_at was: null
```

## Solution
Filter to only fetch **finished actions** (DONE or DELIVERED status, which always have `finished_at` set) by adding `status: ['DONE', 'DELIVERED']` parameter to the API requests.

## Changes Made

### 1. `backend-user-action-api.service.ts`
**Purpose**: Update API service to support array of status values

**Changes**:
- Updated `getUserActionSearch` to accept `Record<string, string | string[]>` instead of `Record<string, string>`
- Updated `buildQueryUrl` to support array values
- Arrays are encoded as multiple query parameters (e.g., `status=DONE&status=DELIVERED`)

### 2. `fetchAllUserActionsForMonthViaSearch` (line 487)
**Purpose**: Fetch user actions for a specific month using `/user-action/search`

**Change**: Added `status: ['DONE', 'DELIVERED']` to the base parameters
```typescript
const base: Record<string, string | string[]> = {
  user_email: userEmail,
  finished_at_start: finishedAtStart,
  finished_at_end: finishedAtEnd,
  limit: '500',
  status: ['DONE', 'DELIVERED'] // Fetch both finished statuses
};
```

**Impact**: 
- ✅ `getCarteiraEnriched` (Clientes list) - now shows only finished deliveries
- ✅ `getActivityMetricsForPlayer` (Dashboard metrics) - counts only finished actions
- ✅ `getDeliveryCount` (Delivery counter) - counts only finished deliveries
- ✅ `getClienteActionsForDelivery` (Modal detail) - shows only finished actions
- ✅ Gamification Dashboard - metrics based on finished actions only

### 3. `fetchDeliveryActionsViaUserActionSearch` (line 375)
**Purpose**: Fetch all actions for a specific delivery in a date range

**Change**: Added `status: ['DONE', 'DELIVERED']` to the base parameters
```typescript
const base: Record<string, string | string[]> = {
  delivery_id: did,
  finished_at_start: finishedAtStart,
  finished_at_end: finishedAtEnd,
  limit: '200',
  status: ['DONE', 'DELIVERED'] // Fetch both finished statuses
};
```

**Impact**:
- ✅ `getDeliveryDetailActionsFromUserActionSearch` (Modal detail alternative method) - shows only finished actions

### 4. `fetchUserActionSearchAllPages` (line 320)
**Purpose**: Paginate through all pages of `/user-action/search` results

**Changes**:
- Updated to accept `Record<string, string | string[]>` to support array values
- Removed the line that was deleting `status` from entries (now preserves status filter)
- Updated type of `entries` variable to support arrays

## Why This Works

1. **Consistent data source**: Both list and modal now fetch the same set of actions (DONE + DELIVERED only)
2. **finished_at is reliable**: Both DONE and DELIVERED actions always have `finished_at` set by the integration
3. **No more null timestamps**: Eliminates the fallback to `created_at` for pending actions
4. **Accurate counts**: Action counts in the list match what's shown in the modal
5. **Complete coverage**: Includes both DONE (awaiting approval) and DELIVERED (fully completed) actions

## Status Workflow

Based on the codebase analysis:
- **PENDING**: Action created but not started
- **DOING**: Action in progress
- **DONE**: Action finished by user, may be awaiting approval (`finished_at` is set)
- **DELIVERED**: Action fully completed and approved (`finished_at` is set)
- **CANCELLED**: Action cancelled
- **INCOMPLETE**: Action incomplete

Only **DONE** and **DELIVERED** have `finished_at` reliably set.

## User Clarification

From the user:
> "created_at is when I create it in the system, the reliable info is always finished_at as it is set by the integration for when the user finished the action, which may be even before created_at."

> "status can be done or delivered, not only done"

This confirms that:
- `finished_at` is the source of truth (set by integration when user completes the action)
- `created_at` is when the action is registered in the system (may be after `finished_at`)
- Both DONE and DELIVERED actions have `finished_at` set
- Pending/in-progress actions have `finished_at: null`

## Testing Checklist

To verify the fix works:

1. ✅ Refresh the page and check the Clientes list
2. ✅ Verify action counts are accurate (may be lower than before since pending actions are excluded)
3. ✅ Click on a delivery to open the modal
4. ✅ Verify the modal shows the same actions that were counted in the list
5. ✅ Check console logs for:
   - `[fetchAllUserActionsForMonthViaSearch] Total finished actions fetched: X`
   - `[getClienteActionsForDelivery] Fetched X total actions for user@email.com`
   - `[getClienteActionsForDelivery] Filtered to Y actions for delivery 123`
6. ✅ Verify no more "Nenhuma atividade encontrada" errors for deliveries with actions
7. ✅ Verify no more `[referenceTimestamp] No finished_at` warnings in console
8. ✅ Verify both DONE and DELIVERED actions appear in the list and modal

## API Query Format

The status parameter is sent as multiple query parameters:
```
GET /user-action/search?status=DONE&status=DELIVERED&finished_at_start=...&finished_at_end=...
```

This is handled by the `buildGame4uQueryString` utility which converts arrays to repeated parameters.

## Related Files

- `e:\Projetos\bwa-game\src\app\services\user-action-dashboard.service.ts` - Main service with the fix
- `e:\Projetos\bwa-game\src\app\services\backend-user-action-api.service.ts` - API service updated to support array values
- `e:\Projetos\bwa-game\src\app\modals\modal-carteira\modal-carteira.component.ts` - Modal component
- `e:\Projetos\bwa-game\src\app\pages\dashboard\gamification-dashboard\gamification-dashboard.component.ts` - Dashboard using the fixed method
- `e:\Projetos\bwa-game\src\app\utils\game4u-query-encode.util.ts` - Query string builder supporting arrays

## API Endpoint Used

**GET `/user-action/search`**
- Supports `status` parameter as string or array (e.g., `status=DONE&status=DELIVERED`)
- Supports `finished_at_start` and `finished_at_end` for date filtering
- Supports pagination with `limit` and `page` parameters
- Does NOT support `sort` parameter (sorting done client-side)

## Previous Documentation

- `USER_ACTION_SEARCH_MIGRATION.md` - Migration from `/game/actions` to `/user-action/search`
- `API_ENDPOINTS_COMPARISON.md` - Comparison of different API endpoints
- `BACKEND_API_LIMITATIONS.md` - Known API parameter limitations
- `CARTEIRA_API_REFACTOR.md` - Carteira API refactoring details
