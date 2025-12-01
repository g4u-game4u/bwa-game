# Quick Start - Funifier Integration

## 🚀 Ready to Test!

Your Game4U dashboard is now fully integrated with Funifier API. Here's what you need to know:

## Authentication

The app now uses Funifier authentication:
- **API Key:** `68ffd888e179d46fce277c00`
- **Base URL:** `https://service2.funifier.com`
- **Auth Endpoint:** `POST /v3/auth/token`

### Login Flow
1. User enters email/username and password
2. App sends POST to `/v3/auth/token` with:
   ```json
   {
     "apiKey": "68ffd888e179d46fce277c00",
     "grant_type": "password",
     "username": "user@example.com",
     "password": "password123"
   }
   ```
3. Funifier returns Bearer token:
   ```json
   {
     "access_token": "eyJhbGci...",
     "token_type": "Bearer",
     "expires_in": 1695751444626
   }
   ```
4. Token is stored and used for all subsequent API calls

## How to Test

### 1. Start the Application
```bash
npm start
```

### 2. Login/Access Dashboard
The app will automatically use the configured Funifier credentials.

### 3. What to Check

#### ✅ Player Dashboard
- **Season Level Badge:** Should show level from `level_progress.next_level.position`
- **Player Name:** Should display from player status
- **Point Wallet:** Should show coins, xp, history from `point_categories`

#### ✅ Season Progress
- **Metas:** Current/Target from `extra.metas_current` and `extra.metas_target`
- **Clientes:** From `extra.clientes`
- **Tarefas Finalizadas:** From `extra.tarefas_finalizadas`

#### ✅ Player KPIs
- Should load from `extra.kpi` in player status
- If missing, shows "Data not available"

#### ✅ Company Table
- Should load from `extra.companies` in player status
- Each company shows CNPJ, health score, and 3 KPIs
- Click on company to see details

#### ✅ Company Details Modal
- Loads data from `/v3/database/cnpj_performance__c/aggregate`
- Shows KPIs: NPS, Multas, Eficiência, Prazo
- Health score calculated from KPI averages

## API Endpoints Used

### Primary Endpoint
```
GET /v3/player/me/status
```
This single endpoint provides:
- Player info
- Points
- Level progress
- Companies list (extra.companies)
- Player KPIs (extra.kpi)
- Season progress data (extra.*)

### Secondary Endpoint
```
POST /v3/database/cnpj_performance__c/aggregate?strict=true
Body: [
  { "$match": { "_id": "CNPJ_HERE" } },
  { "$limit": 1 }
]
```
This provides company-specific KPI data.

## Expected Data Structure

### Player Status Response
```json
{
  "_id": "taira.rabelo@cidadania4u.com.br",
  "name": "Tairã Rabelo",
  "total_points": 30.625,
  "point_categories": {
    "coins": 13.125,
    "xp": 10,
    "history": 7.5
  },
  "level_progress": {
    "percent_completed": 0.03,
    "next_level": {
      "level": "Teste",
      "position": 0
    }
  },
  "extra": {
    "companies": [
      {
        "cnpj": "12345678000190",
        "nps": 7,
        "multas": 0,
        "eficiencia": 9
      }
    ],
    "kpi": {
      "nps": 7,
      "eficiencia": 8
    },
    "metas_current": 15,
    "metas_target": 50,
    "clientes": 8,
    "tarefas_finalizadas": 42
  }
}
```

### Company Performance Response
```json
[
  {
    "_id": "1218",
    "nps": 7,
    "multas": 0,
    "eficiencia": 9,
    "extra": 1,
    "prazo": 1
  }
]
```

## Troubleshooting

### Issue: "Data not available" messages
**Cause:** Missing `extra.*` fields in player status  
**Solution:** Add the required fields to player status in Funifier Studio

### Issue: Companies not showing
**Cause:** `extra.companies` is empty or missing  
**Solution:** Populate `extra.companies` array in player status

### Issue: Company details not loading
**Cause:** CNPJ not found in cnpj_performance__c database  
**Solution:** Add company data to the custom database

### Issue: Authentication errors
**Cause:** Invalid credentials  
**Solution:** Verify Basic Auth token is correct

## Browser Console

Open browser DevTools (F12) to see:
- API requests being made
- Response data structure
- Any warnings about missing data
- Error messages if something fails

## Next Steps

1. **Populate Test Data:** Add sample data to Funifier:
   - Set `extra.companies` in player status
   - Add records to cnpj_performance__c database
   - Set `extra.kpi` with player KPIs
   - Set season progress fields in `extra`

2. **Test Each Feature:** Go through each dashboard component

3. **Check Error Handling:** Remove some data to verify graceful degradation

4. **Performance:** Monitor API response times and caching

## Need Help?

Check these files for details:
- `docs/FUNIFIER_INTEGRATION.md` - Complete integration guide
- `docs/FUNIFIER_INTEGRATION_CHANGES.md` - All changes made
- Browser console - Real-time debugging info

## Quick Commands

```bash
# Start development server
npm start

# Run tests
npm test

# Build for production
npm run build

# Check for errors
npm run lint
```

---

**Everything is configured and ready to go! Just start the app and test with real Funifier data.**

