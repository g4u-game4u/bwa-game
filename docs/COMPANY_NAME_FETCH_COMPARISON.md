# Company Name Fetching - Dashboard Comparison

## Summary

After reviewing both dashboards, here's the status of company name fetching via `empid_cnpj__c`:

### ✅ Gamification Dashboard (Individual Player)
**Status:** FULLY IMPLEMENTED with `empid_cnpj__c` lookup

**Implementation:**
- Uses `CnpjLookupService.enrichCnpjList()` to fetch clean company names from `empid_cnpj__c`
- Stores results in `cnpjNameMap: Map<string, string>`
- `getCompanyDisplayName()` uses the enriched map for display
- Caches results for 30 minutes

**Code Location:** `src/app/pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts`

```typescript
// In loadCarteiraData():
this.cnpjLookupService.enrichCnpjList(cnpjList).pipe(
  switchMap(cnpjNames => {
    // Store the CNPJ name map for display
    this.cnpjNameMap = cnpjNames;
    // Enrich companies with KPI data from cnpj__c collection
    return this.companyKpiService.enrichCompaniesWithKpis(clientes);
  })
)

// Display method:
getCompanyDisplayName(cnpj: string): string {
  if (!cnpj) return '';
  // Use the enriched name from the map, fallback to original
  const displayName = this.cnpjNameMap.get(cnpj);
  return displayName || cnpj;
}
```

---

### ❌ Team Management Dashboard (Manager View)
**Status:** NOT IMPLEMENTED - Uses regex extraction only

**Current Implementation:**
- Uses simple regex to extract company name from CNPJ string
- Does NOT fetch from `empid_cnpj__c` collection
- Does NOT use `CnpjLookupService`
- No caching or enrichment

**Code Location:** `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.component.ts`

```typescript
// Current implementation (line ~2537):
getCompanyDisplayName(cnpj: string): string {
  if (!cnpj) return '';
  // Extract text before " l " separator
  const match = cnpj.match(/^([^l]+)/);
  return match ? match[1].trim() : cnpj;
}
```

**Missing:**
- No `cnpjNameMap` property
- No call to `CnpjLookupService.enrichCnpjList()`
- No integration in `loadTeamCarteiraData()` method

---

## Recommendation

The Team Management Dashboard should be updated to match the Gamification Dashboard implementation:

### Required Changes:

1. **Add property:**
   ```typescript
   cnpjNameMap = new Map<string, string>();
   ```

2. **Inject service:**
   ```typescript
   constructor(
     // ... existing services
     private cnpjLookupService: CnpjLookupService
   ) {}
   ```

3. **Update `loadTeamCarteiraData()` method:**
   ```typescript
   // After aggregating carteira data, before enriching with KPIs:
   const cnpjList = aggregatedCarteira.map(c => c.cnpj);
   
   // Enrich CNPJs with clean company names
   const cnpjNames = await firstValueFrom(
     this.cnpjLookupService.enrichCnpjList(cnpjList)
       .pipe(takeUntil(this.destroy$))
   );
   this.cnpjNameMap = cnpjNames;
   
   // Then continue with KPI enrichment...
   ```

4. **Update `getCompanyDisplayName()` method:**
   ```typescript
   getCompanyDisplayName(cnpj: string): string {
     if (!cnpj) return '';
     // Use the enriched name from the map, fallback to original
     const displayName = this.cnpjNameMap.get(cnpj);
     return displayName || cnpj;
   }
   ```

5. **Same for `loadCollaboratorCarteiraData()` method** (for individual collaborator view)

---

## Benefits of Using `empid_cnpj__c`

1. **Consistent naming** - Same clean company names across all dashboards
2. **Centralized data** - Single source of truth in Funifier
3. **Better formatting** - Removes messy CNPJ codes and IDs
4. **Caching** - 30-minute cache reduces API calls
5. **Fallback handling** - Gracefully handles missing data

---

## Files to Update

- `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.component.ts`
  - Add `cnpjNameMap` property
  - Inject `CnpjLookupService`
  - Update `loadTeamCarteiraData()` method
  - Update `loadCollaboratorCarteiraData()` method
  - Update `getCompanyDisplayName()` method

---

## Testing Checklist

After implementing:
- [ ] Verify company names display correctly in team dashboard
- [ ] Verify company names display correctly in collaborator view
- [ ] Verify fallback to original CNPJ if lookup fails
- [ ] Verify caching works (check network tab for API calls)
- [ ] Verify consistency with gamification dashboard names
- [ ] Test with empty/null CNPJ values
- [ ] Test with CNPJs not in `empid_cnpj__c` collection
