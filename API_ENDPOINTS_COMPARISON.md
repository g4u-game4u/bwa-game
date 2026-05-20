# API Endpoints Comparison

## Summary

The application uses **two different endpoints** for fetching user actions, each with different capabilities:

## 1. `/game/actions` (Legacy - Game4U Gateway)

### Endpoint
```
GET /game/actions
```

### Supported Parameters
```javascript
{
  start: "2026-05-01T03:00:00.000Z",
  end: "2026-06-01T02:59:59.999Z",
  user: "user@example.com",
  status: "DONE",                    // Optional
  next_page_token: "..."             // For pagination
}
```

### ❌ NOT Supported
- `limit` - Backend returns 400 error: "property limit should not exist"
- `page` - Only supports token-based pagination
- `sort` - No ordering control
- Date filtering by `finished_at` - Only supports `start`/`end` range

### Pagination
- Token-based: Uses `next_page_token` in response
- Unpredictable page sizes (backend default: ~100 items)
- Must fetch all pages until no `next_page_token` is returned

### Response Format
```json
{
  "items": [...],
  "next_page_token": "eyJ..."  // Optional, only if more pages exist
}
```

### Use Cases
- ✅ Fetching all actions for a user across a date range
- ✅ Team management dashboard (when not using month-specific queries)
- ❌ Month-specific queries (inefficient - fetches too much data)
- ❌ Ordering by specific fields

---

## 2. `/user-action/search` (New - Direct Backend)

### Endpoint
```
GET /user-action/search
```

### Supported Parameters
```javascript
{
  user_email: "user@example.com",
  finished_at_start: "2026-05-01T00:00:00.000Z",
  finished_at_end: "2026-05-31T23:59:59.999Z",
  limit: "500",                      // ✅ Supported!
  page: "1",                         // ✅ Supported!
  delivery_id: "12345",              // Optional
  status: "DONE",                    // Optional
  dismissed: "false",                // Optional
  approved: "true"                   // Optional
}
```

### ✅ Supported Features
- `limit` - Control page size (default: 10, max: 500)
- `page` - Page-based pagination
- `finished_at_start` / `finished_at_end` - Precise date filtering
- Multiple filter options

### ❌ NOT Supported
- `sort` - Backend returns 400 error: "property sort should not exist"
  - **Solution**: Sort on client side after fetching all pages

### Pagination
- Page-based: Uses `page` and `limit`
- Predictable page sizes
- Response includes `totalPages` metadata

### Response Format
```json
{
  "items": [...],
  "total": 1234,
  "page": 1,
  "limit": 500,
  "totalPages": 3
}
```

### Use Cases
- ✅ Month-specific queries (Carteira/Clientes list)
- ✅ Delivery-specific queries
- ✅ Ordering by date fields
- ✅ Efficient pagination with large datasets

---

## Current Implementation

### Carteira (Clientes) List
**Uses**: `/user-action/search` ✅

**Why**: 
- Month-specific filtering (`finished_at_start`/`finished_at_end`)
- Ordering by newest first (`sort=finished_at:desc`)
- Efficient pagination (`limit=500`)

**Code**:
```typescript
// user-action-dashboard.service.ts
fetchAllUserActionsForMonthViaSearch(userEmail, month)
  → GET /user-action/search?user_email=...&finished_at_start=...&limit=500&sort=finished_at:desc
```

### Other Dashboards (Gestor, Team Management)
**Uses**: `/game/actions` (when not using Carteira)

**Why**:
- Legacy code
- Fetches broader date ranges
- No `limit` parameter needed (uses `next_page_token`)

**Code**:
```typescript
// user-action-dashboard.service.ts
fetchAllUserActionsWithParams({ user: email })
  → GET /game/actions?start=...&end=...&user=...
```

---

## Error Fixed

### Before (Broken)
```javascript
GET /game/actions?start=...&end=...&user=...&limit=500
// ❌ Error: "property limit should not exist"
```

### After (Fixed)
```javascript
GET /game/actions?start=...&end=...&user=...
// ✅ Works - no limit parameter
```

---

## Recommendations

### For New Features
- **Use `/user-action/search`** when:
  - You need month-specific data
  - You need ordering control
  - You need efficient pagination
  - You need multiple filter options

- **Use `/game/actions`** when:
  - You need broad date ranges (season-wide)
  - You're working with existing code that uses it
  - You don't need ordering control

### Migration Path
Consider migrating all dashboards to `/user-action/search` for:
- Better performance (server-side filtering)
- More control (ordering, pagination)
- Cleaner code (page-based vs token-based pagination)

---

## Testing

### Check Console Logs

**For `/game/actions`**:
```
[API Request] GET /game/actions: https://...?start=...&end=...&user=...
[fetchAllUserActions] Page 1: fetched 100 items...
```

**For `/user-action/search`**:
```
[API Request] GET /user-action/search: https://...?user_email=...&finished_at_start=...&limit=500&sort=finished_at:desc
[fetchUserActionSearchAllPages] Page 1: fetched 500 items...
```

### Verify
1. No 400 errors in console
2. All data loads correctly
3. Pagination works as expected
4. Ordering is correct (newest first for Carteira)
