# CNPJ Lookup Service

## Overview

The `CnpjLookupService` provides clean company name lookups from messy CNPJ data by fetching from the Funifier `empid_cnpj__c` custom collection.

## Quick Start

```typescript
import { CnpjLookupService } from '@services/cnpj-lookup.service';

constructor(private cnpjLookup: CnpjLookupService) {}

// Single lookup
this.cnpjLookup.getCompanyName('1748').subscribe(name => {
  console.log(name); // "JLUZ COMERCIO DE ROUPAS LTDA"
});

// Batch lookup (recommended for multiple CNPJs)
const cnpjList = ['1748', 'INCENSE [10010|0001-76]', '10380'];
this.cnpjLookup.enrichCnpjList(cnpjList).subscribe(nameMap => {
  cnpjList.forEach(cnpj => {
    console.log(`${cnpj} → ${nameMap.get(cnpj)}`);
  });
});
```

## API Reference

### `extractEmpid(cnpj: string): number | null`

Extracts the empid from various CNPJ formats.

**Examples:**
```typescript
extractEmpid('1748')                                    // → 1748
extractEmpid('COMPANY [10010|0001-76]')                // → 10010
extractEmpid('INVALID')                                 // → null
```

**Logic:**
- If ≤ 8 digits: Direct conversion to number
- If > 8 digits: Extract from pattern `[empid|...]`
- Otherwise: Return null

---

### `getCompanyName(cnpj: string): Observable<string>`

Gets the clean company name for a single CNPJ.

**Parameters:**
- `cnpj` - The CNPJ string to lookup

**Returns:**
- `Observable<string>` - Clean company name or original CNPJ if not found

**Example:**
```typescript
this.cnpjLookup.getCompanyName('1748').subscribe(name => {
  console.log(name); // "JLUZ COMERCIO DE ROUPAS LTDA"
});
```

---

### `enrichCnpjList(cnpjList: string[]): Observable<Map<string, string>>`

Enriches multiple CNPJs with company names in a single operation.

**Parameters:**
- `cnpjList` - Array of CNPJ strings

**Returns:**
- `Observable<Map<string, string>>` - Map of original CNPJ → clean company name

**Example:**
```typescript
const cnpjList = ['1748', '10380', 'INVALID'];
this.cnpjLookup.enrichCnpjList(cnpjList).subscribe(nameMap => {
  console.log(nameMap.get('1748'));    // "JLUZ COMERCIO DE ROUPAS LTDA"
  console.log(nameMap.get('10380'));   // "2A MEDEIROS LTDA"
  console.log(nameMap.get('INVALID')); // "INVALID" (fallback)
});
```

**Performance Note:** This is more efficient than calling `getCompanyName()` multiple times because it only makes one API call.

---

### `clearCache(): void`

Clears the cached CNPJ database, forcing a fresh fetch on the next request.

**Example:**
```typescript
this.cnpjLookup.clearCache();
```

**Use Cases:**
- Manual refresh requested by user
- Testing different data sets
- After database updates

## Data Source

**Endpoint:** `https://service2.funifier.com/v3/database/empid_cnpj__c`

**Authentication:** Basic token (from `environment.funifier_basic_token`)

**Response Format:**
```json
[
  {
    "_id": 1748,
    "cnpj": "29.170.984/0002-11",
    "empresa": "JLUZ COMERCIO DE ROUPAS LTDA"
  },
  {
    "_id": 10380,
    "cnpj": "48.465.297/0001-97",
    "empresa": "2A MEDEIROS LTDA"
  }
]
```

## Caching Strategy

- **Duration:** 30 minutes
- **Scope:** Service-level (shared across all components)
- **Invalidation:** Automatic after 30 minutes or manual via `clearCache()`
- **Benefits:** Reduces API calls, improves performance

## CNPJ Format Support

### Format 1: Simple empid (≤ 8 digits)
```
Input:  "1748"
Empid:  1748
Output: "JLUZ COMERCIO DE ROUPAS LTDA"
```

### Format 2: Pattern with brackets
```
Input:  "INCENSE PERFUMARIA E COSMETICOS LTDA. EPP [10010|0001-76]"
Empid:  10010 (extracted from [10010|...])
Output: "INCENSE PERFUMARIA E COSMETICOS LTDA. EPP"
```

### Format 3: Invalid/Unknown
```
Input:  "INVALID FORMAT"
Empid:  null
Output: "INVALID FORMAT" (fallback to original)
```

## Error Handling

The service handles errors gracefully:

1. **API Errors:** Returns empty map, components fall back to original CNPJ
2. **Extraction Failures:** Returns null empid, falls back to original CNPJ
3. **Missing Data:** Returns original CNPJ if empid not found in database

**Example:**
```typescript
// Even if API fails, your code won't break
this.cnpjLookup.getCompanyName('1748').subscribe(name => {
  // name will be either the clean name or "1748" (fallback)
  console.log(name);
});
```

## Performance Considerations

### Single Lookup
```typescript
// ❌ Inefficient for multiple CNPJs
cnpjList.forEach(cnpj => {
  this.cnpjLookup.getCompanyName(cnpj).subscribe(name => {
    // This makes N API calls (first time)
  });
});
```

### Batch Lookup (Recommended)
```typescript
// ✅ Efficient - only 1 API call
this.cnpjLookup.enrichCnpjList(cnpjList).subscribe(nameMap => {
  cnpjList.forEach(cnpj => {
    const name = nameMap.get(cnpj);
    // All names available immediately
  });
});
```

## Testing

### Unit Tests
```bash
npm test -- --include="**/cnpj-lookup.service.spec.ts"
```

### Manual Testing
```typescript
// In browser console
const service = TestBed.inject(CnpjLookupService);

// Test extraction
console.log(service.extractEmpid('1748'));                    // 1748
console.log(service.extractEmpid('COMPANY [10010|0001-76]')); // 10010

// Test lookup
service.getCompanyName('1748').subscribe(console.log);
```

## Integration Examples

### Example 1: Component with Single CNPJ
```typescript
export class CompanyDetailComponent {
  companyName$: Observable<string>;

  constructor(private cnpjLookup: CnpjLookupService) {}

  ngOnInit() {
    this.companyName$ = this.cnpjLookup.getCompanyName(this.cnpj);
  }
}
```

```html
<h2>{{ companyName$ | async }}</h2>
```

### Example 2: Component with Multiple CNPJs
```typescript
export class CompanyListComponent {
  companies: Company[];
  cnpjNameMap = new Map<string, string>();

  constructor(private cnpjLookup: CnpjLookupService) {}

  loadCompanies() {
    this.companyService.getCompanies().pipe(
      switchMap(companies => {
        const cnpjList = companies.map(c => c.cnpj);
        return forkJoin({
          companies: of(companies),
          names: this.cnpjLookup.enrichCnpjList(cnpjList)
        });
      })
    ).subscribe(({ companies, names }) => {
      this.companies = companies;
      this.cnpjNameMap = names;
    });
  }

  getDisplayName(cnpj: string): string {
    return this.cnpjNameMap.get(cnpj) || cnpj;
  }
}
```

```html
<div *ngFor="let company of companies">
  <h3>{{ getDisplayName(company.cnpj) }}</h3>
</div>
```

### Example 3: Pipe (Advanced)
```typescript
@Pipe({ name: 'cnpjName' })
export class CnpjNamePipe implements PipeTransform {
  constructor(private cnpjLookup: CnpjLookupService) {}

  transform(cnpj: string): Observable<string> {
    return this.cnpjLookup.getCompanyName(cnpj);
  }
}
```

```html
<h2>{{ cnpj | cnpjName | async }}</h2>
```

## Troubleshooting

### Issue: Names not showing
**Check:**
1. Is `funifier_basic_token` set in environment?
2. Is API endpoint accessible?
3. Does `empid_cnpj__c` collection exist?
4. Check browser console for errors

### Issue: Wrong names displayed
**Check:**
1. Verify empid extraction logic
2. Check database data matches action_log patterns
3. Clear cache and retry: `cnpjLookup.clearCache()`

### Issue: Slow performance
**Check:**
1. Are you using `enrichCnpjList()` for batch operations?
2. Is caching working? (Check network tab)
3. Is API response time acceptable?

## Related Services

- `ActionLogService` - Provides CNPJ data from action_log
- `CompanyKpiService` - Enriches companies with KPI data
- `FunifierApiService` - Handles API communication

## Documentation

- [Full Implementation Guide](../../../docs/CNPJ_LOOKUP_IMPLEMENTATION.md)
- [Visual Examples](../../../docs/CNPJ_LOOKUP_VISUAL_EXAMPLE.md)
- [Deployment Checklist](../../../docs/CNPJ_LOOKUP_CHECKLIST.md)

---

**Version:** 1.0.0  
**Last Updated:** 2026-02-09  
**Maintainer:** Development Team
