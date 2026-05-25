# Backend API Limitations - Important Notes

## Summary

During the migration to `/user-action/search`, we discovered that the backend has specific limitations on what parameters it accepts.

## ❌ Parameters NOT Supported

### 1. `/game/actions` - Does NOT support `limit`

**Error**:
```json
{
  "statusCode": 400,
  "message": "Validation error",
  "errors": ["property limit should not exist"]
}
```

**Request that fails**:
```
GET /game/actions?start=...&end=...&user=...&limit=500
```

**Solution**: Remove `limit` parameter, use only `next_page_token` for pagination

**Correct request**:
```
GET /game/actions?start=...&end=...&user=...
GET /game/actions?start=...&end=...&user=...&next_page_token=eyJ...
```

---

### 2. `/user-action/search` - Does NOT support `sort`

**Error**:
```json
{
  "statusCode": 400,
  "message": "Validation error",
  "errors": ["property sort should not exist"]
}
```

**Request that fails**:
```
GET /user-action/search?user_email=...&finished_at_start=...&sort=finished_at:desc
```

**Solution**: Remove `sort` parameter, sort on client side after fetching

**Correct request**:
```
GET /user-action/search?user_email=...&finished_at_start=...&limit=500&page=1
```

**Client-side sorting**:
```typescript
// After fetching all pages
items.sort((a, b) => {
  const aTime = this.referenceTimestamp(a);
  const bTime = this.referenceTimestamp(b);
  return bTime - aTime; // Descending (newest first)
});
```

---

## ✅ What IS Supported

### `/game/actions`
```javascript
{
  start: "2026-05-01T03:00:00.000Z",     // ✅ Required
  end: "2026-06-01T02:59:59.999Z",       // ✅ Required
  user: "user@example.com",              // ✅ Required
  status: "DONE",                        // ✅ Optional
  next_page_token: "eyJ..."              // ✅ For pagination
}
```

### `/user-action/search`
```javascript
{
  user_email: "user@example.com",        // ✅ Optional (filter)
  delivery_id: "12345",                  // ✅ Optional (filter)
  finished_at_start: "2026-05-01...",    // ✅ Optional (filter)
  finished_at_end: "2026-05-31...",      // ✅ Optional (filter)
  status: "DONE",                        // ✅ Optional (filter)
  dismissed: "false",                    // ✅ Optional (filter)
  approved: "true",                      // ✅ Optional (filter)
  limit: "500",                          // ✅ Page size (1-500)
  page: "1",                             // ✅ Page number
  page_token: "eyJ..."                   // ✅ Alternative to page
}
```

---

## 🔧 Implementation Details

### Pagination Strategy

**`/game/actions`**:
```typescript
// Token-based pagination
let pageToken: string | null = null;
do {
  const response = await api.getGameActions({
    start, end, user,
    next_page_token: pageToken
  });
  items.push(...response.items);
  pageToken = response.next_page_token;
} while (pageToken);
```

**`/user-action/search`**:
```typescript
// Page-based pagination
let page = 1;
do {
  const response = await api.getUserActionSearch({
    user_email, finished_at_start, finished_at_end,
    limit: '500',
    page: String(page)
  });
  items.push(...response.items);
  page++;
} while (page <= response.totalPages);

// Sort on client side (backend doesn't support sort parameter)
items.sort((a, b) => b.finished_at - a.finished_at);
```

---

## 📊 Performance Impact

### Without `sort` parameter
- **Impact**: Minimal - sorting happens in memory after fetch
- **Cost**: O(n log n) for ~500-1000 items = ~5-10ms
- **User experience**: No noticeable difference

### Without `limit` on `/game/actions`
- **Impact**: Backend controls page size (~100 items)
- **Workaround**: Use `next_page_token` to fetch all pages
- **User experience**: May require more API calls, but still fast

---

## 🐛 Errors Fixed

### Before
```javascript
// ❌ This caused 400 errors
GET /game/actions?...&limit=500
GET /user-action/search?...&sort=finished_at:desc
```

### After
```javascript
// ✅ This works
GET /game/actions?...
GET /user-action/search?...&limit=500
// Sort on client side after fetching
```

---

## 📝 Code Changes

### Removed `limit` from `/game/actions`
```typescript
// backend-user-action-api.service.ts
getGameActions(q: {
  start: string;
  end: string;
  user: string;
  status?: string;
  next_page_token?: string;
  // ❌ limit?: string;  // REMOVED - backend doesn't support it
})
```

### Removed `sort` from `/user-action/search`
```typescript
// user-action-dashboard.service.ts
private async fetchUserActionSearchAllPages(base: Record<string, string>) {
  // Remove sort parameter as backend doesn't support it
  const baseWithoutSort = { ...base };
  delete baseWithoutSort['sort'];
  
  // ... fetch all pages ...
  
  // Sort on client side
  deduped.sort((a, b) => {
    const aTime = this.referenceTimestamp(a);
    const bTime = this.referenceTimestamp(b);
    return bTime - aTime; // Descending (newest first)
  });
}
```

---

## ✅ Testing

### Verify No Errors

Check browser console for:
```
✅ [API Request] GET /game/actions: ...?start=...&end=...&user=...
✅ [API Request] GET /user-action/search: ...?user_email=...&limit=500&page=1

❌ Should NOT see:
   "property limit should not exist"
   "property sort should not exist"
```

### Verify Sorting Works

Check that:
- Carteira shows newest deliveries first
- Activity lists show newest actions first
- Timestamps are correct (using `finished_at` when available)

---

## 🚀 Future Backend Improvements

If the backend team adds support for these parameters in the future:

1. **Add `limit` to `/game/actions`**:
   - Would reduce number of API calls
   - Could request 500 items per page instead of ~100

2. **Add `sort` to `/user-action/search`**:
   - Would eliminate client-side sorting
   - Slightly better performance (though minimal impact)

Until then, current workarounds are efficient and work well! ✅
