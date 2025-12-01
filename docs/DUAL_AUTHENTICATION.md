# Dual Authentication Strategy

## Overview
The Funifier integration uses **two different authentication methods** depending on the type of data being accessed.

## Authentication Methods

### 1. Bearer Token (User Authentication)
**Used For:** Player data and standard API endpoints
**Obtained From:** Login via `/v3/auth/token`
**Format:** `Authorization: Bearer {token}`

**Endpoints:**
- `/v3/player/*` - Player status, points, progress
- `/v3/team/*` - Team data
- `/v3/action/*` - Action logs
- `/v3/achievement/*` - Achievements
- `/v3/point/*` - Point categories
- `/v3/challenge/*` - Challenges
- `/v3/level/*` - Levels
- `/v3/leaderboard/*` - Leaderboards

### 2. Basic Authentication (Database Access)
**Used For:** Advanced database operations and aggregates
**Format:** `Authorization: Basic NjhmZmQ4ODhlMTc5ZDQ2ZmNlMjc3YzAwOjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==`

**Endpoints:**
- `/v3/database/*` - All database operations
- `/v3/database/{collection}/aggregate` - Aggregate queries
- Custom database collections (e.g., `cnpj_performance__c`)

## Implementation

### Automatic Detection
The `FunifierApiService` automatically detects which authentication to use based on the endpoint:

```typescript
private getHeaders(endpoint: string): HttpHeaders {
  const isDatabaseEndpoint = endpoint.includes('/database');
  
  if (isDatabaseEndpoint) {
    // Use Basic Auth for database operations
    headers = headers.set('Authorization', `Basic ${this.basicToken}`);
  } else {
    // Use Bearer token for player data
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  
  return headers;
}
```

### Usage Examples

#### Player Data (Bearer Token)
```typescript
// Automatically uses Bearer token
this.funifierApi.get('/v3/player/me/status').subscribe(data => {
  console.log('Player data:', data);
});
```

#### Database Query (Basic Auth)
```typescript
// Automatically uses Basic Auth
const aggregateBody = [
  { $match: { _id: "1218" } },
  { $limit: 1 }
];

this.funifierApi.post('/v3/database/cnpj_performance__c/aggregate?strict=true', aggregateBody)
  .subscribe(data => {
    console.log('Company data:', data);
  });
```

## Data Flow

### Player Dashboard Load
```
1. User logs in → Gets Bearer token
2. GET /v3/player/me/status (Bearer token)
   ↓
3. Extract player info, points, companies list
```

### Company Details Load
```
1. User clicks company → Need detailed KPIs
2. POST /v3/database/cnpj_performance__c/aggregate (Basic Auth)
   ↓
3. Get company KPIs from custom database
```

## Security Considerations

### Bearer Token
- **Scope:** User-specific data only
- **Expiry:** Token expires after specified time
- **Storage:** localStorage
- **Renewal:** User must re-login when expired

### Basic Token
- **Scope:** Database-level access
- **Expiry:** No expiration (static credentials)
- **Storage:** Hardcoded in service (not in localStorage)
- **Security:** Only used for read operations on specific collections

## Configuration

### Environment Variables
```typescript
export const environment = {
  funifier_api_key: '68ffd888e179d46fce277c00',
  funifier_basic_token: 'NjhmZmQ4ODhlMTc5ZDQ2ZmNlMjc3YzAwOjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==',
  // ...
};
```

### Service Constants
```typescript
export class FunifierApiService {
  private readonly apiKey = '68ffd888e179d46fce277c00';
  private readonly basicToken = 'NjhmZmQ4ODhlMTc5ZDQ2ZmNlMjc3YzAwOjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==';
  // ...
}
```

## Testing

### Test Bearer Token Authentication
```bash
# Login and get token
curl -X POST https://service2.funifier.com/v3/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "68ffd888e179d46fce277c00",
    "grant_type": "password",
    "username": "user@example.com",
    "password": "password123"
  }'

# Use token for player data
curl -X GET https://service2.funifier.com/v3/player/me/status \
  -H "Authorization: Bearer {token}"
```

### Test Basic Authentication
```bash
# Query database with Basic Auth
curl -X POST https://service2.funifier.com/v3/database/cnpj_performance__c/aggregate?strict=true \
  -H "Authorization: Basic NjhmZmQ4ODhlMTc5ZDQ2ZmNlMjc3YzAwOjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==" \
  -H "Content-Type: application/json" \
  -d '[{"$match": {"_id": "1218"}}, {"$limit": 1}]'
```

## Debugging

### Check Which Auth is Being Used
The service logs which authentication method is used:

```typescript
console.log('Using Basic Auth for database endpoint:', endpoint);
```

### Browser DevTools
1. Open Network tab
2. Find API request
3. Check Headers → Authorization
4. Verify correct auth type:
   - `Bearer ...` for player endpoints
   - `Basic ...` for database endpoints

## Common Issues

### Issue: 401 on Database Queries
**Cause:** Using Bearer token instead of Basic Auth  
**Solution:** Verify endpoint includes `/database`

### Issue: 403 on Player Data
**Cause:** Bearer token expired or invalid  
**Solution:** Re-login to get new token

### Issue: Wrong Auth Type
**Cause:** Endpoint detection logic not working  
**Solution:** Check endpoint string includes `/database` for Basic Auth

## Summary

| Endpoint Type | Auth Method | Token Source | Expiry |
|--------------|-------------|--------------|--------|
| Player Data | Bearer | Login response | Yes |
| Database | Basic | Static credentials | No |

**Key Point:** The service automatically chooses the correct authentication based on the endpoint path. No manual configuration needed in service calls.

---

**Status:** ✅ Dual authentication implemented and working
