# Company KPI Indicators - Requirements

## Overview
Restore the company-level KPI indicators in the Carteira (wallet) company table on the Player Dashboard. Each company should display its delivery performance metric extracted from the `cnpj__c` collection.

## User Stories

### 1. As a player, I want to see KPI indicators for each company in my wallet
**Acceptance Criteria**:
- 1.1 Each company row in the company table displays a KPI indicator
- 1.2 The KPI indicator shows the `entrega` (delivery) value from `cnpj__c`
- 1.3 The indicator visual style matches the existing player KPI indicator design
- 1.4 The indicator updates when company data is refreshed

### 2. As a player, I want the company KPI to correlate correctly with action log data
**Acceptance Criteria**:
- 2.1 System extracts company ID from action_log `cnpj` field format: `"[ID|...]"`
- 2.2 System matches extracted ID with `cnpj__c._id` field
- 2.3 System retrieves `entrega` value from matching `cnpj__c` document
- 2.4 Missing or invalid company IDs are handled gracefully (show N/A or 0)

### 3. As a player, I want the KPI indicator to be visually consistent
**Acceptance Criteria**:
- 3.1 KPI indicator uses the same circular progress component as player KPI
- 3.2 Color scheme matches the dashboard theme
- 3.3 Indicator is appropriately sized for the company table row
- 3.4 Tooltip or label clearly identifies the metric as "Entregas" (Deliveries)

## Data Structure

### Action Log CNPJ Format
```json
{
  "_id": "697788e5434ba0101740fa24",
  "actionId": "acessorias",
  "userId": "AMANDA.IASMYM@HOTMAIL.COM",
  "time": 1769441509064,
  "attributes": {
    "delivery_title": "[CTB] FECHAMENTO CONTÁBIL - PERNAMBUCO",
    "delivery_id": 479559,
    "acao": "Conferir Saldos das Contas do Imobilizado/Depreciação Acumulada",
    "cnpj": "RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]",
    "integration_id": 2310439
  }
}
```

### CNPJ Collection Format
```json
{
  "_id": "2000",
  "entrega": 89
}
```

### Extraction Logic
- Input: `"RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]"`
- Extract: Characters between `[` and `|` starting from position 9 onwards
- Result: `"2000"`

## Technical Constraints

1. **Performance**: KPI data should be fetched efficiently, ideally batched with company data
2. **Caching**: Consider caching `cnpj__c` data to minimize API calls
3. **Error Handling**: Gracefully handle missing or malformed CNPJ data
4. **Scalability**: Solution should work with multiple companies per player

## Out of Scope

- Multiple KPI indicators per company (future enhancement)
- Historical KPI trends
- KPI filtering or sorting
- Gestor dashboard company KPIs (separate feature)

## Dependencies

- Existing company table component (`c4u-company-table`)
- Existing KPI circular progress component (`c4u-kpi-circular-progress`)
- Funifier API access to `cnpj__c` collection
- Action log service for CNPJ data (provides company list with CNPJ strings)

## Success Metrics

- Company KPI indicators display correctly for 100% of companies with valid CNPJ data
- Page load time increase < 200ms
- Zero console errors related to KPI fetching
- Visual consistency score: 100% match with player KPI design
