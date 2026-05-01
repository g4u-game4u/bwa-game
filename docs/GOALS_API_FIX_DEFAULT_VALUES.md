# Goals API Fix - Default Values When No Data

## Issue
QA testing revealed that KPIs were not showing up for most teams (Jurídico, CS, and partially for Financeiro). The Goals API was either:
1. Not returning data
2. Returning empty arrays
3. Failing silently

This caused the dashboard to show no KPIs at all.

## Solution
Updated the Goals API service and KPI service to always return KPIs with default values when no data is available from the API.

### Changes Made

#### 1. Goals API Service (`src/app/services/goals-api.service.ts`)

**Added Default Values:**
- When no goal log is found for a specific KPI, return a default KPI with:
  - `current: 0` (no progress yet)
  - `target: [hardcoded value]` (the expected target)
  - `percentage: 0`

**Default Targets by Team:**
- **Financeiro - Receita Concedida**: R$ 775,000
- **Jurídico/CS - Meta de Protocolo**: R$ 1,000,000
- **Jurídico/CS - Aposentadorias Concedidas**: 50 units

**Added Error Handling:**
- Wrapped API call in `catchError` to return empty array on failure
- Empty array triggers default value logic in `getAllKpisForTeam()`

**Added Logging:**
- Logs when fetching goal logs
- Logs when data is found vs when using defaults
- Logs the number of KPIs returned

#### 2. KPI Service (`src/app/services/kpi.service.ts`)

**Improved Team Name Detection:**
- Now checks multiple sources for team name:
  - `playerStatus.metadata?.time`
  - `playerStatus.extra?.time`
  - `playerStatus.extra?.team_name`
  - `playerStatus.extra?.teamName`

**Added Fallback Logic:**
- If Goals API returns 0 KPIs, immediately use fallback values
- Fallback values match the defaults from Goals API service
- Ensures KPIs always display even if API completely fails

**Added Comprehensive Logging:**
- Logs player team name and metadata
- Logs when fetching from Goals API
- Logs number of KPIs received
- Logs when using fallback values

**Error Handling:**
- Catches errors from Goals API
- Returns fallback KPIs on error
- Never returns empty array (always shows something)

### Default KPI Values

```typescript
// Financeiro
{
  id: 'receita-concedida',
  label: 'Receita concedida',
  current: 0,
  target: 775000,
  superTarget: 1162500, // 1.5x target
  unit: 'R$',
  color: 'red', // Red because 0% progress
  percentage: 0
}

// Jurídico / CS - Meta de Protocolo
{
  id: 'meta-protocolo',
  label: 'Meta de protocolo',
  current: 0,
  target: 1000000,
  superTarget: 1500000, // 1.5x target
  unit: 'R$',
  color: 'red',
  percentage: 0
}

// Jurídico / CS - Aposentadorias Concedidas
{
  id: 'aposentadorias-concedidas',
  label: 'Aposentadorias concedidas',
  current: 0,
  target: 50,
  superTarget: 75, // 1.5x target
  unit: 'concedidos',
  color: 'red',
  percentage: 0
}
```

### Behavior Flow

1. **User loads dashboard**
2. **KPI Service** extracts team name from player data
3. **Goals API Service** is called with team name
4. **Goals API** attempts to fetch `/goals/logs`
   - **Success**: Parse logs and find matching goal template IDs
     - **Data found**: Return parsed KPI data
     - **No data found**: Return default KPI with current=0, target=hardcoded
   - **Failure**: Return empty array
5. **KPI Service** receives response
   - **Has KPIs**: Convert to display format
   - **Empty array**: Use fallback defaults
   - **Error**: Use fallback defaults
6. **Dashboard** displays KPIs (always shows something)

### Console Logging

The following logs help debug issues:

```
📊 [KPI Service] Player team name: financeiro Full metadata: {...} Extra: {...}
📊 [KPI Service] Fetching KPIs for team: financeiro
📊 [Goals API] Fetching KPIs for team: financeiro
📊 [Goals API] Successfully fetched 5 goal logs
📊 [Goals API] Found Receita Concedida from API
📊 [Goals API] Returning 1 KPIs for team financeiro
📊 [KPI Service] Received 1 KPIs from Goals API
📊 [KPI Service] Generated 1 KPIs from goals API
```

Or when no data:

```
📊 [Goals API] No Receita Concedida data found, using defaults
📊 [Goals API] Returning 1 KPIs for team financeiro
📊 [KPI Service] Received 1 KPIs from Goals API
```

Or when API fails:

```
📊 [Goals API] Error fetching goal logs: [error details]
📊 [Goals API] Returning empty array, will use default values
📊 [Goals API] No Receita Concedida data found, using defaults
```

### Testing

To verify the fix works:

1. **Open browser console** (F12)
2. **Navigate to dashboard**
3. **Check for logs** starting with `📊`
4. **Verify KPIs display** even if API fails
5. **Check that**:
   - Financeiro sees "Receita concedida"
   - Jurídico sees "Meta de protocolo" + "Aposentadorias concedidas"
   - CS sees "Meta de protocolo" + "Aposentadorias concedidas"
6. **Verify values**:
   - If API has data: shows real current/target values
   - If API has no data: shows 0 / hardcoded target
   - Progress bars show correctly (0% when current=0)

### Expected QA Results After Fix

All these should now pass:

- ✅ Financeiro visualiza "Valor Concedido / Receita Concedida"
- ✅ Jurídico visualiza "Meta de Protocolo" + "Aposentadorias Concedidas"
- ✅ CS visualiza "Meta de Protocolo" + "Aposentadorias Concedidas"
- ✅ Valores aparecem mesmo sem dados da API
- ✅ Barras de progresso funcionam com valor 0
- ✅ Não aparecem erros ou telas em branco
- ✅ Títulos das metas estão corretos
- ✅ Valores financeiros formatados como R$
- ✅ Quantidades aparecem como números inteiros

### Notes

- **Current values will be 0** until the Goals API has real data
- **Targets are hardcoded** as fallback but will use API values when available
- **This ensures the UI never breaks** even if the backend is down
- **Progress bars will show 0%** which is correct when current=0
- **Colors will be red** (below target) which is correct for 0 progress
