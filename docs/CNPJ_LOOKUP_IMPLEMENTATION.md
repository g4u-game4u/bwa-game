# CNPJ Lookup Implementation

## Overview

This document describes the implementation of the CNPJ lookup feature that displays clean company names in the Carteira modal instead of messy raw CNPJ data.

## Problem

The Carteira modal was displaying raw CNPJ data from the `action_log` collection's `attributes.cnpj` field, which came in various formats:
- Simple empid: `"1748"`, `"10380"`
- Complex format: `"INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]"`
- Other variations with inconsistent formatting

This resulted in a messy, unprofessional look.

## Solution

Created a new service (`CnpjLookupService`) that:
1. Fetches company data from the Funifier custom collection `empid_cnpj__c`
2. Extracts the `empid` from various CNPJ formats
3. Maps the empid to clean company names (`empresa` field)
4. Caches the data for 30 minutes to minimize API calls

## Data Source

**API Endpoint:** `https://service2.funifier.com/v3/database/empid_cnpj__c`

**Authentication:** Basic token (already configured in environment)

**Data Structure:**
```json
{
  "_id": 1748,
  "cnpj": "29.170.984/0002-11",
  "empresa": "29.170.984/0002-11JLUZ COMERCIO DE ROUPAS LTDA"
}
```

## Extraction Logic

The service uses the following logic to extract the `empid` from CNPJ strings:

### Case 1: Simple numeric string (≤ 8 digits)
- Input: `"1748"` or `"10380"`
- Output: `1748` or `10380`
- Logic: Direct conversion to number

### Case 2: Pattern with brackets `[empid|...]`
- Input: `"INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]"`
- Output: `10010`
- Logic: Extract number between `[` and `|` using regex `/\[(\d+)\|/`

### Case 3: Invalid format
- Input: `"INVALID FORMAT"` or `"123456789"` (> 8 digits without pattern)
- Output: `null`
- Fallback: Display original CNPJ string

## Implementation Files

### New Files Created

1. **`src/app/services/cnpj-lookup.service.ts`**
   - Main service with extraction and lookup logic
   - Caching mechanism (30 minutes)
   - Methods:
     - `extractEmpid(cnpj: string): number | null`
     - `getCompanyName(cnpj: string): Observable<string>`
     - `enrichCnpjList(cnpjList: string[]): Observable<Map<string, string>>`
     - `clearCache(): void`

2. **`src/app/services/cnpj-lookup.service.spec.ts`**
   - Comprehensive unit tests
   - Tests for all extraction scenarios
   - Tests for caching behavior
   - Tests for error handling

3. **`src/app/modals/modal-carteira/modal-carteira.component.spec.ts`**
   - Component tests for the modal
   - Tests for CNPJ enrichment integration

### Modified Files

1. **`src/app/modals/modal-carteira/modal-carteira.component.ts`**
   - Added `CnpjLookupService` injection
   - Added `cnpjNameMap` property to store enriched names
   - Modified `loadClientes()` to enrich CNPJ list
   - Simplified `getCompanyDisplayName()` to use the map

2. **`src/app/modals/modal-carteira/modal-carteira.component.html`**
   - No changes needed (uses existing `getCompanyDisplayName()` method)

## Usage Example

```typescript
// In any component
constructor(private cnpjLookupService: CnpjLookupService) {}

// Get single company name
this.cnpjLookupService.getCompanyName('1748').subscribe(name => {
  console.log(name); // "29.170.984/0002-11JLUZ COMERCIO DE ROUPAS LTDA"
});

// Enrich multiple CNPJs
const cnpjList = ['1748', 'INCENSE [10010|0001-76]', '10380'];
this.cnpjLookupService.enrichCnpjList(cnpjList).subscribe(nameMap => {
  console.log(nameMap.get('1748')); // Clean company name
});
```

## Performance Considerations

1. **Caching:** The service caches the entire CNPJ database for 30 minutes
2. **Single API Call:** Only one API call is made per cache period, regardless of how many lookups are performed
3. **Batch Processing:** The `enrichCnpjList()` method processes multiple CNPJs in a single operation
4. **Fallback:** If lookup fails, the original CNPJ is displayed (graceful degradation)

## Testing

Run tests with:
```bash
npm test -- --include="**/cnpj-lookup.service.spec.ts"
```

## Future Enhancements

1. Add support for more CNPJ formats if needed
2. Implement background refresh of cache before expiry
3. Add metrics/logging for lookup success rate
4. Consider adding a manual refresh button in the UI

## Related Files

- `src/app/services/action-log.service.ts` - Provides CNPJ data from action_log
- `src/app/services/company-kpi.service.ts` - Enriches companies with KPI data
- `src/app/modals/modal-carteira/` - Carteira modal component

## API Reference

### CnpjLookupService

#### `extractEmpid(cnpj: string): number | null`
Extracts the empid from a CNPJ string.

**Parameters:**
- `cnpj` - The CNPJ string to parse

**Returns:**
- `number` - The extracted empid
- `null` - If extraction fails

#### `getCompanyName(cnpj: string): Observable<string>`
Gets the clean company name for a CNPJ.

**Parameters:**
- `cnpj` - The CNPJ string to lookup

**Returns:**
- `Observable<string>` - The clean company name or original CNPJ if not found

#### `enrichCnpjList(cnpjList: string[]): Observable<Map<string, string>>`
Enriches multiple CNPJs with company names.

**Parameters:**
- `cnpjList` - Array of CNPJ strings

**Returns:**
- `Observable<Map<string, string>>` - Map of original CNPJ → clean company name

#### `clearCache(): void`
Clears the cached CNPJ database, forcing a fresh fetch on next request.

## Deployment Notes

- No environment variable changes needed
- Uses existing `funifier_basic_token` for authentication
- No database migrations required
- Backward compatible (falls back to original CNPJ if lookup fails)
