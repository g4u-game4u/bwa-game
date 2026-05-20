# Carteira API Refactor - Using `/user-action/search`

## Summary

Refactored the Clientes (Carteira) list to use **`GET /user-action/search`** instead of **`GET /game/actions`** for better control, pagination, and ordering.

## Why This Change?

### Before: `GET /game/actions`
- ❌ Token-based pagination (`next_page_token`) - less predictable
- ❌ No explicit ordering control
- ❌ Fetches ALL actions from season start, then filters in memory
- ❌ Less efficient for month-specific queries
- ❌ No `limit` parameter support (backend default: 100)

### After: `GET /user-action/search`
- ✅ Page-based pagination (`page`, `limit`, `totalPages`) - more predictable
- ✅ **Explicit ordering**: `sort=finished_at:desc` (newest first)
- ✅ **Server-side filtering**: `finished_at_start` and `finished_at_end`
- ✅ More efficient - only fetches actions for the selected month
- ✅ Proper `limit` parameter (default: 500 items per page)
- ✅ Better response structure with metadata

## New API Request

### Endpoint
```
GET /user-action/search
```

### Query Parameters
```javascript
{
  user_email: "user@example.com",
  finished_at_start: "2026-05-01T00:00:00.000Z",  // Start of selected month
  finished_at_end: "2026-05-31T23:59:59.999Z",    // End of selected month
  limit: "500",                                    // Items per page
  page: "1",                                       // Current page
  sort: "finished_at:desc"                         // Order by newest first
}
```

### Response Format
```json
{
  "items": [
    {
      "id": "action-id",
      "action_title": "Task title",
      "user_email": "user@example.com",
      "status": "DONE",
      "created_at": "2026-05-15T10:30:00Z",
      "finished_at": "2026-05-15T14:30:00Z",
      "delivery_id": "12345",
      "delivery_title": "Client Name",
      "deal": "CNPJ",
      "points": 10
    }
  ],
  "total": 1234,
  "page": 1,
  "limit": 500,
  "totalPages": 3
}
```

## Code Changes

### 1. New Method: `fetchAllUserActionsForMonthViaSearch`
```typescript
// user-action-dashboard.service.ts
async fetchAllUserActionsForMonthViaSearch(
  userEmail: string,
  month: Date
): Promise<UserActionRow[]>
```

- Fetches actions for a specific month using `/user-action/search`
- Uses `finished_at_start` and `finished_at_end` for server-side filtering
- More efficient than fetching all season data

### 2. Updated: `getCarteiraEnriched`
```typescript
getCarteiraEnriched(
  playerId: string,
  month: Date,
  roster?: ReadonlyArray<GameActionsUserRosterEntry> | null
): Observable<CompanyDisplay[]>
```

- Now uses `fetchAllUserActionsForMonthViaSearch` instead of `getActions`
- Directly fetches month-specific data
- No need to filter large datasets in memory

### 3. Enhanced: `fetchUserActionSearchAllPages`
```typescript
private async fetchUserActionSearchAllPages(
  base: Record<string, string>
): Promise<UserActionRow[]>
```

**Changes:**
- ✅ Increased default `limit` from 200 to 500
- ✅ Added `sort: 'finished_at:desc'` for newest-first ordering
- ✅ Added detailed console logging for debugging
- ✅ Better pagination handling with `totalPages` metadata

### 4. Updated: `buildCarteiraCompanies` & `buildCarteiraCompaniesInRange`
```typescript
buildCarteiraCompanies(items: UserActionRow[], month: Date)
buildCarteiraCompaniesInRange(items: UserActionRow[], rangeStart: Date, rangeEnd: Date)
```

**Changes:**
- ✅ Now sorts by **most recent action timestamp** first (descending)
- ✅ Then by `actionCount` as secondary sort
- ✅ Adds `latestActionTimestamp` to each delivery for sorting
- ✅ Console logging for debugging

## Benefits

### 1. Performance
- **Before**: Fetch ~3 months of data (Apr-Jun 2026), filter in memory
- **After**: Fetch only the selected month's data from the server

### 2. Ordering
- **Before**: Sorted by action count only
- **After**: Sorted by most recent action first (what users expect)

### 3. Pagination
- **Before**: Token-based, unpredictable page sizes
- **After**: Page-based with explicit `totalPages`, predictable

### 4. Debugging
- Comprehensive console logs show:
  - Exact API request URL and parameters
  - Items fetched per page
  - Total items and pages
  - Deduplication results

## Testing

### Console Logs to Check

```javascript
// API request
[API Request] GET /user-action/search: https://...?user_email=...&finished_at_start=...&sort=finished_at:desc

// Pagination progress
[fetchUserActionSearchAllPages] Page 1: fetched 500 items, total so far: 500
[fetchUserActionSearchAllPages] Page 2: fetched 234 items, total so far: 734
[fetchUserActionSearchAllPages] Completed. Total pages: 2, Total items: 734
[fetchUserActionSearchAllPages] After deduplication: 730 unique items

// Carteira building
[buildCarteiraCompanies] Built 87 deliveries, sorted by most recent action first
```

### Expected Behavior

1. **All deliveries shown** (not capped at 100)
2. **Newest deliveries first** (by most recent action)
3. **Efficient loading** (only fetches selected month)
4. **Proper pagination** (handles large datasets)

## Rollback Plan

If issues occur, the old `/game/actions` approach is still available via:
```typescript
getActions(playerId, roster).pipe(
  switchMap(items => {
    const companies = this.buildCarteiraCompanies(items, month);
    return this.companyKpiService.enrichCompaniesWithKpis(companies);
  })
)
```

## Next Steps

1. Test in browser console
2. Verify ordering (newest first)
3. Check pagination (all items loaded)
4. Monitor performance (should be faster)
5. If backend doesn't support `sort` parameter, remove it and rely on client-side sorting
