# Funifier API Integration Guide

## Overview
This document describes how the Game4U dashboard integrates with the Funifier API to fetch gamification data.

## Authentication
- **Base URL:** `https://service2.funifier.com`
- **API Key:** `68ffd888e179d46fce277c00`
- **Auth Method:** Bearer Token (obtained via login)
- **Auth Endpoint:** `POST /v3/auth/token`

### Authentication Flow
1. **Login:** User provides username/email and password
2. **Token Request:** POST to `/v3/auth/token` with credentials
3. **Token Storage:** Bearer token stored in localStorage
4. **API Calls:** All requests use `Authorization: Bearer {token}` header
5. **Token Expiry:** Token expires after specified time, user must re-login

## Data Sources

### 0. Authentication
**Endpoint:** `POST /v3/auth/token`

**Request Body:**
```json
{
  "apiKey": "68ffd888e179d46fce277c00",
  "grant_type": "password",
  "username": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzUxMiIsImNhbGciOiJHWklQIn0...",
  "token_type": "Bearer",
  "expires_in": 1695751444626
}
```

**Used For:**
- User authentication
- Obtaining Bearer token for API requests
- Token stored in localStorage for session persistence

### 1. Player Status
**Endpoint:** `GET /v3/player/{playerId}/status` or `GET /v3/player/me/status`

**Response Structure:**
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
    "next_points": 99969,
    "next_level": {
      "level": "Teste",
      "position": 0,
      "minPoints": 100000
    }
  },
  "extra": {
    "companies": [...],
    "kpi": {...},
    "metas_current": 15,
    "metas_target": 50,
    "clientes": 8,
    "tarefas_finalizadas": 42
  }
}
```

**Used For:**
- Player basic info (name, email, level)
- Point wallet (bloqueados, desbloqueados, moedas)
- Season progress (metas, clientes, tarefas)
- Company list (from `extra.companies`)
- Player KPIs (from `extra.kpi`)

### 2. Company Performance Database
**Endpoint:** `POST /v3/database/cnpj_performance__c/aggregate?strict=true`

**Request Body:**
```json
[
  { "$match": { "_id": "12345678000190" } },
  { "$limit": 1 }
]
```

**Response Structure:**
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

**Used For:**
- Company details (KPIs by CNPJ)
- Company KPIs (nps, multas, eficiencia, prazo)

**Note:** The `_id` field is the company's CNPJ and serves as the unique identifier.

## Data Mapping

### Point Wallet
Maps from `point_categories` in player status:
- `bloqueados` → Not directly available, defaults to 0
- `desbloqueados` → Sum of all point categories or specific category
- `moedas` → `point_categories.coins`

### Season Progress
Maps from `extra` fields in player status:
- `metas.current` → `extra.metas_current`
- `metas.target` → `extra.metas_target`
- `clientes` → `extra.clientes`
- `tarefasFinalizadas` → `extra.tarefas_finalizadas`

### Company List
Maps from `extra.companies` array in player status.

### Company KPIs
Maps from cnpj_performance__c database:
- `nps` → NPS score (0-10 scale)
- `multas` → Number of fines (target: 0)
- `eficiencia` → Efficiency score (0-10 scale)
- `prazo` → Deadline compliance (0-10 scale)

### Player KPIs
Calculated as average of player's companies KPIs, stored in `extra.kpi`.

## Error Handling

### Missing Data
When `extra.*` fields are not present in the response:
- Display "Data not available" message
- Do NOT throw errors
- Return empty arrays or default values

### API Errors
- Retry failed requests up to 3 times with 1-second delay
- Cache last known good data for offline fallback
- Display user-friendly error messages

## Caching Strategy

### Cache Durations
- Player Status: 5 minutes
- Company Data: 10 minutes
- KPI Data: 3 minutes

### Cache Keys
- Player data: `playerId`
- Company list: `${playerId}_${JSON.stringify(filter)}`
- Company details: `companyId` (CNPJ)
- Season progress: `${playerId}_${startDate}_${endDate}`

## Implementation Notes

1. **CNPJ as ID:** Companies are identified by CNPJ, not by name
2. **No Company Names:** First version doesn't use company names, only CNPJ
3. **Graceful Degradation:** Missing data shows "Data not available" instead of errors
4. **Basic Auth:** Uses Basic Authentication with provided token
5. **Aggregate Queries:** Company details use MongoDB-style aggregate queries

## Testing

To test the integration:
1. Use player ID: `taira.rabelo@cidadania4u.com.br` or `me` for current user
2. Check that all data displays correctly
3. Verify error handling when data is missing
4. Test with different CNPJs in the performance database

## Future Enhancements

- Add support for processes, tasks, and macros (currently empty)
- Implement company name lookup
- Add more detailed activity tracking
- Support for multiple seasons

