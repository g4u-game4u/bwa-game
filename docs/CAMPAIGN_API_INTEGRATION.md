# Campaign API Integration

## Overview
Updated the `CampaignService` to fetch campaign data from the backend API endpoint `/campaign/current` instead of using only hardcoded default values.

## Implementation Details

### API Endpoint
- **Endpoint**: `GET /campaign/current`
- **Expected Response Format**:
```json
{
  "id": 1,
  "created_at": "2024-05-01T12:00:00.000Z",
  "name": "Campanha de Maio",
  "client_id": "cliente-123",
  "starts_at": "2024-05-01",
  "finishes_at": "2024-05-31"
}
```

### Changes Made

#### 1. API Integration (`fetchCurrentCampaign()`)
- Calls `apiProvider.get<any>('/campaign/current')` to fetch campaign data
- Validates response has required fields: `id`, `starts_at`, `finishes_at`
- Sets `isDefault: false` for API-fetched campaigns
- Falls back to `getDefaultCampaign()` if:
  - API call fails (network error, 404, etc.)
  - Response is missing required fields
  - Response format is invalid

#### 2. Extended Default Campaign
- **Previous**: March-April 2026 (2 months)
- **Current**: March-May 2026 (3 months)
- **Dates**: `2026-03-01` to `2026-05-31`
- **Name**: "Temporada Mar–Mai 2026"

#### 3. Type Safety
- Added `<any>` type annotation to `apiProvider.get()` call
- Prevents TypeScript errors when accessing response properties
- Maintains type safety with validation checks

#### 4. Debug Logging
Added console logging for debugging:
- `📡 Fetching campaign from /campaign/current...` - When API call starts
- `✅ Campaign fetched from API: {...}` - When API returns data
- `⚠️ API response format invalid, using default campaign` - When validation fails
- `❌ Erro ao carregar campanha atual da API: {...}` - When API call fails
- `🔄 Usando campanha padrão como fallback` - When falling back to default

### Behavior

#### Success Path
1. Service calls `/campaign/current`
2. API returns valid campaign data
3. Service validates response has required fields
4. Returns campaign with `isDefault: false`
5. Month selector shows months from API-provided date range

#### Fallback Path
1. Service calls `/campaign/current`
2. API fails (network error, 404, etc.) OR returns invalid data
3. Service logs error/warning
4. Returns default campaign with `isDefault: true`
5. Month selector shows March, April, May 2026

### Testing

#### Manual Testing Steps
1. Open browser DevTools console
2. Navigate to player dashboard
3. Check console for campaign fetch logs
4. Verify month selector shows correct months
5. Test with API available and unavailable

#### Expected Console Output (API Success)
```
📡 Fetching campaign from /campaign/current...
✅ Campaign fetched from API: {id: 1, name: "Campanha de Maio", ...}
```

#### Expected Console Output (API Failure)
```
📡 Fetching campaign from /campaign/current...
❌ Erro ao carregar campanha atual da API: Error: ...
🔄 Usando campanha padrão como fallback
```

### Files Modified
- `src/app/services/campaign.service.ts`

### Related Components
- `c4u-seletor-mes` - Month selector component (uses campaign dates)
- `SeasonDatesService` - Season dates service (uses campaign dates)
- `ApiProvider` - HTTP client wrapper (makes API calls)

### API Provider Configuration
The `ApiProvider` uses environment variables for the base URL:
- `environment.g4u_api_base` - Primary API base URL
- `environment.backend_url_base` - Fallback API base URL
- Current production: `https://g4u-api-bwa.onrender.com`

### Future Improvements
1. Add loading state indicator while fetching campaign
2. Add retry logic for failed API calls
3. Add cache invalidation strategy
4. Add UI notification when falling back to default campaign
5. Consider adding campaign refresh button for managers
6. Add unit tests for API integration
7. Add integration tests with mock API responses

### Commit
- **Hash**: `f4df7df`
- **Branch**: `revisaupgrades`
- **Message**: "feat: fetch campaign from API endpoint /campaign/current"

### Related Documentation
- [API Integration Guide](./API_INTEGRATION.md)
- [Environment Configuration](./DEPLOYMENT_GUIDE.md)
- [Month Selector Component](../src/app/components/c4u-seletor-mes/README.md)
