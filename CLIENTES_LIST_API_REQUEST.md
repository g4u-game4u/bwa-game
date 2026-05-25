# Clientes List API Request Flow

## Current Implementation

When the **Carteira (Clientes)** modal opens with `useBackendUserActions = true`, here's the exact flow:

### 1. Component Call
```typescript
// modal-carteira.component.ts
this.userActionDashboard.getCarteiraEnriched(playerId, month)
```

### 2. Service Chain
```typescript
// user-action-dashboard.service.ts

getCarteiraEnriched(playerId, month)
  ↓
getActions(playerId)
  ↓
fetchAllUserActions(playerKey)
  ↓
fetchAllUserActionsWithParams({ user: email })
```

### 3. Actual API Request

**Endpoint**: `GET /game/actions`

**Query Parameters**:
```javascript
{
  start: "2026-04-01T00:00:00.000Z",  // SEASON_GAME_ACTION_RANGE.start
  end: "2026-05-20T23:59:59.999Z",     // Current date (or SEASON_GAME_ACTION_RANGE.end)
  user: "user.email@example.com",      // User's email
  client_id: "your-client-id"          // From environment config
}
```

**Headers**:
```javascript
{
  "client_id": "your-client-id",
  "Authorization": "Bearer <token>"  // Added by AuthInterceptor
}
```

### 4. Pagination

The code **does support pagination** via `next_page_token`:

```typescript
// First request
GET /game/actions?start=...&end=...&user=...

// If response contains next_page_token
GET /game/actions?start=...&end=...&user=...&next_page_token=<token>

// Continues until no next_page_token is returned
```

**Maximum iterations**: 200 pages

### 5. Current Issues

#### Issue 1: 100 Item Limit
- **Symptom**: Only 100 items are returned
- **Possible Causes**:
  1. Backend has a default limit of 100 items per page
  2. Backend is not returning `next_page_token` in the response
  3. Backend is not implementing pagination correctly

#### Issue 2: Sorting
- **Previous behavior**: Sorted by `actionCount` (number of actions per delivery)
- **New behavior**: Sorted by **most recent action timestamp** first, then by `actionCount`

### 6. Debugging

With the new console logs, you can see:

```javascript
// API request details
[API Request] GET /game/actions: <full-url> params: { start, end, user }

// Pagination progress
[fetchAllUserActions] Page 1: fetched 100 items, total so far: 100
[fetchAllUserActions] Found next_page_token, continuing to page 2
[fetchAllUserActions] Page 2: fetched 50 items, total so far: 150
[fetchAllUserActions] No more pages. Total items fetched: 150
[fetchAllUserActions] After deduplication: 148 unique items

// Carteira building
[buildCarteiraCompanies] Built 45 deliveries, sorted by most recent action first
```

### 7. Expected Backend Response Format

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
      "deal": "CNPJ or client identifier",
      "points": 10
    }
    // ... more items
  ],
  "next_page_token": "eyJwYWdlIjoyLCJvZmZzZXQiOjEwMH0="  // Optional, for pagination
}
```

### 8. Backend Requirements

To fix the 100-item limit, the backend needs to:

1. **Return `next_page_token`** in the response when there are more items
2. **Accept `next_page_token`** in the query parameters for subsequent requests
3. **Return all items** across multiple pages (not just the first 100)

### 9. Alternative: Check if there's a `limit` parameter

Some APIs require an explicit `limit` parameter. Check if the backend supports:

```
GET /game/actions?start=...&end=...&user=...&limit=500
```

If so, we can add this to the request in `fetchAllUserActionsWithParams`.
