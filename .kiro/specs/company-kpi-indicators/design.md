# Company KPI Indicators - Design Document

## Architecture Overview

This feature adds company-level KPI indicators to the Player Dashboard's company table (Carteira section). The solution reuses existing components and services while adding a new service to handle CNPJ-to-KPI data correlation.

**Key Simplification**: This feature works directly with action_log data. The ActionLogService already provides company CNPJ strings via `getPlayerCnpjListWithCount()`. We extract IDs from these strings and fetch KPI data from `cnpj__c`.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ GamificationDashboardComponent                              │
│  └─ C4uCompanyTableComponent (Enhanced)                     │
│      └─ C4uKpiCircularProgressComponent (Reused)            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Services Layer                                              │
│  ├─ CompanyKpiService (New)                                 │
│  └─ ActionLogService (Existing - provides CNPJ strings)     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Funifier API                                                │
│  ├─ cnpj__c (KPI data)                                      │
│  └─ action_log (CNPJ strings)                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. CNPJ ID Extraction

**Input**: Action log CNPJ string
```typescript
"RODOPRIMA LOGISTICA LTDA l 0001 [2000|0001-60]"
```

**Extraction Logic**:
```typescript
function extractCnpjId(cnpjString: string): string | null {
  // Find text between [ and |
  const match = cnpjString.match(/\[([^\|]+)\|/);
  return match ? match[1].trim() : null;
}
// Result: "2000"
```

**Property**: CNPJ ID extraction is idempotent and deterministic
- For any valid CNPJ string with format `[ID|...]`, extraction always returns the same ID
- Invalid formats return null consistently

### 2. KPI Data Retrieval

**API Endpoint**: `/v3/database/cnpj__c/aggregate`

**Query**:
```typescript
[
  { $match: { _id: { $in: ["2000", "1218", "9654"] } } }
]
```

**Response**:
```typescript
[
  { "_id": "2000", "entrega": 89 },
  { "_id": "1218", "entrega": 45 },
  { "_id": "9654", "entrega": 102 }
]
```

**Property**: KPI data retrieval is consistent
- Same CNPJ IDs always return same KPI values within cache window
- Missing IDs return empty results, not errors

### 3. Data Mapping

**Data Mapping**:

**Company Display Model** (Simplified):
```typescript
interface CompanyDisplay {
  cnpj: string; // Full CNPJ string from action_log
  cnpjId?: string; // Extracted ID for KPI lookup
  actionCount: number; // Number of actions for this company
  deliveryKpi?: KPIData; // Delivery KPI from cnpj__c
}
```

**Note**: We don't use the existing `Company` model from `gamification-dashboard.model.ts` because that model is tied to `cnpj_performance__c` data. Instead, we work directly with action_log CNPJ strings and create a simpler display model.

**KPI Mapping**:
```typescript
{
  id: 'delivery',
  label: 'Entregas',
  current: 89,
  target: 100, // Configurable or from system params
  unit: 'entregas',
  percentage: 89
}
```

## Service Design

### CompanyKpiService (New)

**Responsibilities**:
- Extract CNPJ IDs from action_log CNPJ strings
- Fetch KPI data from `cnpj__c` collection
- Enrich company display data with KPI information
- Cache KPI data to minimize API calls

**Interface**:
```typescript
@Injectable({ providedIn: 'root' })
export class CompanyKpiService {
  constructor(
    private funifierApi: FunifierApiService
  ) {}

  /**
   * Extract CNPJ ID from full CNPJ string
   * Format: "COMPANY NAME l CODE [ID|SUFFIX]"
   * Returns: ID between [ and |
   */
  extractCnpjId(cnpjString: string): string | null;

  /**
   * Fetch KPI data for multiple CNPJ IDs
   * Returns: Map of CNPJ ID to KPI data
   */
  getKpiData(cnpjIds: string[]): Observable<Map<string, CnpjKpiData>>;

  /**
   * Enrich company display items with KPI data
   * Takes action_log CNPJ data and adds deliveryKpi property
   */
  enrichCompaniesWithKpis(
    companies: { cnpj: string; actionCount: number }[]
  ): Observable<CompanyDisplay[]>;

  /**
   * Clear KPI cache
   */
  clearCache(): void;
}

interface CnpjKpiData {
  _id: string;
  entrega: number;
}

interface CompanyDisplay {
  cnpj: string;
  cnpjId?: string;
  actionCount: number;
  deliveryKpi?: KPIData;
}
```

**Caching Strategy**:
- Cache duration: 10 minutes (same as CompanyService)
- Cache key: Comma-separated sorted CNPJ IDs
- Cache invalidation: Manual via `clearCache()` or automatic after duration

**Error Handling**:
- Invalid CNPJ format: Return null ID, skip KPI lookup
- Missing KPI data: Return company without deliveryKpi property
- API errors: Log error, return companies without KPI data

### GamificationDashboardComponent Enhancement

**Changes**:
```typescript
// In the component that displays the company table
loadCompanyData(playerId: string, month: Date): void {
  // Get CNPJ list from action_log
  this.actionLogService.getPlayerCnpjListWithCount(playerId, month).pipe(
    switchMap(cnpjList => 
      // Enrich with KPI data
      this.companyKpiService.enrichCompaniesWithKpis(cnpjList)
    )
  ).subscribe(companies => {
    this.companies = companies;
  });
}
```

**Note**: We don't modify CompanyService or CompanyMapper because they work with `cnpj_performance__c` data, which is deprecated. Instead, we work directly with action_log data.

## Component Design

### C4uCompanyTableComponent Enhancement

**Template Changes**:
```html
<div class="company-row" *ngFor="let company of companies; trackBy: trackByCompanyCnpj">
  <!-- Company CNPJ/Name -->
  <div class="company-name">{{ getCompanyDisplayName(company.cnpj) }}</div>
  
  <!-- Action Count -->
  <div class="company-actions">{{ company.actionCount }} ações</div>
  
  <!-- NEW: Delivery KPI Column -->
  <div class="company-kpi" *ngIf="company.deliveryKpi">
    <c4u-kpi-circular-progress
      [label]="company.deliveryKpi.label"
      [current]="company.deliveryKpi.current"
      [target]="company.deliveryKpi.target"
      [size]="'small'"
    ></c4u-kpi-circular-progress>
  </div>
  <div class="company-kpi" *ngIf="!company.deliveryKpi">
    <span class="kpi-na">N/A</span>
  </div>
</div>
```

**Component Logic**:
```typescript
export class C4uCompanyTableComponent {
  @Input() companies: CompanyDisplay[] = [];
  @Input() showDeliveryKpi: boolean = true;
  
  // Extract company name from CNPJ string
  getCompanyDisplayName(cnpj: string): string {
    // Format: "COMPANY NAME l CODE [ID|SUFFIX]"
    const match = cnpj.match(/^([^l]+)/);
    return match ? match[1].trim() : cnpj;
  }
  
  trackByCompanyCnpj(index: number, company: CompanyDisplay): string {
    return company.cnpj;
  }
}
```

**Styling**:
```scss
.company-kpi {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  
  .kpi-na {
    color: var(--text-muted);
    font-size: 0.875rem;
    font-style: italic;
  }
}

// Small size variant for table display
c4u-kpi-circular-progress[size="small"] {
  ::ng-deep {
    .kpi-container {
      width: 60px;
      height: 60px;
    }
    
    .kpi-label {
      font-size: 0.75rem;
    }
    
    .kpi-value {
      font-size: 0.875rem;
    }
  }
}
```

### C4uKpiCircularProgressComponent Enhancement

**New Input**:
```typescript
@Input() size: 'small' | 'medium' | 'large' = 'medium';
```

**Size Mapping**:
- `small`: 60px diameter (for table rows)
- `medium`: 80px diameter (default, existing)
- `large`: 120px diameter (for emphasis)

## API Integration

### Funifier API Endpoints

**1. Fetch KPI Data**:
```
POST /v3/database/cnpj__c/aggregate?strict=true
Body: [{ $match: { _id: { $in: ["2000", "1218"] } } }]
Response: [{ "_id": "2000", "entrega": 89 }, ...]
```

**2. Fetch Company CNPJ List** (Existing - ActionLogService):
```
POST /v3/database/action_log/aggregate?strict=true
Body: [
  { $match: { userId: "player@email.com", time: { $gte: ..., $lte: ... } } },
  { $group: { _id: "$attributes.cnpj", count: { $sum: 1 } } }
]
Response: [{ "_id": "COMPANY NAME l CODE [ID|SUFFIX]", "count": 5 }, ...]
```

## Performance Considerations

### Optimization Strategies

1. **Batch KPI Fetching**:
   - Fetch KPI data for all companies in single API call
   - Use `$in` operator with array of CNPJ IDs

2. **Caching**:
   - Cache KPI data for 10 minutes
   - Share cache across multiple component instances
   - Use RxJS `shareReplay` for in-flight request deduplication

3. **Lazy Loading**:
   - KPI data fetched only when companies are loaded
   - No separate API call if no companies exist

4. **Virtual Scrolling** (Existing):
   - Company table already uses virtual scrolling for 50+ items
   - KPI indicators rendered only for visible rows

### Performance Targets

- KPI data fetch: < 500ms
- Total page load increase: < 200ms
- Memory overhead: < 1MB for 100 companies
- No visual jank during KPI rendering

## Error Handling

### Error Scenarios

1. **Invalid CNPJ Format**:
   ```typescript
   // Input: "INVALID FORMAT"
   // Result: cnpjId = null, skip KPI lookup
   // Display: "N/A" in KPI column
   ```

2. **Missing KPI Data**:
   ```typescript
   // CNPJ ID "2000" not found in cnpj__c
   // Result: company.deliveryKpi = undefined
   // Display: "N/A" in KPI column
   ```

3. **API Error**:
   ```typescript
   // API returns 500 or network error
   // Result: Log error, return companies without KPI data
   // Display: "N/A" for all companies
   // User notification: Toast message (optional)
   ```

4. **Partial Data**:
   ```typescript
   // Some CNPJ IDs have KPI data, others don't
   // Result: Show KPI for available data, "N/A" for missing
   // No error thrown
   ```

### Error Recovery

- **Retry Logic**: No automatic retry (rely on cache and manual refresh)
- **Fallback**: Display companies without KPI data
- **User Feedback**: Optional toast notification for API errors
- **Logging**: Console errors for debugging

## Testing Strategy

### Unit Tests

**CompanyKpiService**:
```typescript
describe('CompanyKpiService', () => {
  describe('extractCnpjId', () => {
    it('should extract ID from valid CNPJ string');
    it('should return null for invalid format');
    it('should handle edge cases (empty, null, undefined)');
  });
  
  describe('getKpiData', () => {
    it('should fetch KPI data for multiple IDs');
    it('should return empty map for empty input');
    it('should handle API errors gracefully');
  });
  
  describe('enrichCompaniesWithKpis', () => {
    it('should add deliveryKpi to companies with valid data');
    it('should skip companies with invalid CNPJ format');
    it('should handle missing KPI data');
  });
});
```

**C4uCompanyTableComponent**:
```typescript
describe('C4uCompanyTableComponent', () => {
  it('should display delivery KPI when available');
  it('should display N/A when KPI missing');
  it('should hide KPI column when showDeliveryKpi is false');
  it('should render KPI with correct size');
  it('should extract company name from CNPJ string');
});
```

### Property-Based Tests

**CNPJ ID Extraction**:
```typescript
describe('extractCnpjId property tests', () => {
  it('should be idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (cnpj) => {
        const result1 = extractCnpjId(cnpj);
        const result2 = extractCnpjId(cnpj);
        expect(result1).toEqual(result2);
      })
    );
  });
  
  it('should extract ID from valid format', () => {
    fc.assert(
      fc.property(
        fc.string(), // company name
        fc.string(), // code
        fc.string(), // id
        fc.string(), // suffix
        (name, code, id, suffix) => {
          const cnpj = `${name} l ${code} [${id}|${suffix}]`;
          const result = extractCnpjId(cnpj);
          expect(result).toBe(id);
        }
      )
    );
  });
});
```

### Integration Tests

**End-to-End Flow**:
```typescript
describe('Company KPI Integration', () => {
  it('should load companies with KPI data', async () => {
    // 1. Mock action_log response with CNPJ strings
    // 2. Mock cnpj__c response with KPI data
    // 3. Verify companies have deliveryKpi property
    // 4. Verify KPI displayed in table
  });
  
  it('should handle missing KPI data gracefully', async () => {
    // 1. Mock action_log with valid CNPJ strings
    // 2. Mock empty cnpj__c response
    // 3. Verify companies display without errors
    // 4. Verify "N/A" displayed in KPI column
  });
});
```

## Correctness Properties

### Property 1: CNPJ ID Extraction Correctness
**Validates: Requirements 2.1, 2.2**

For any CNPJ string in format `"NAME l CODE [ID|SUFFIX]"`:
- Extraction always returns the same ID
- ID is the substring between `[` and `|`
- Invalid formats return null consistently

**Test Strategy**: Property-based testing with fast-check

### Property 2: KPI Data Consistency
**Validates: Requirements 2.3**

For any set of CNPJ IDs:
- Same IDs always return same KPI data within cache window
- Missing IDs return empty results, not errors
- API errors don't corrupt existing data

**Test Strategy**: Unit tests with mocked API responses

### Property 3: UI Rendering Correctness
**Validates: Requirements 1.1, 1.3, 3.1, 3.2**

For any company with KPI data:
- KPI indicator is rendered in table
- Indicator shows correct current/target values
- Indicator uses correct color based on percentage
- Indicator size matches specified size prop

**Test Strategy**: Component tests with TestBed

### Property 4: Error Handling Robustness
**Validates: Requirements 2.4**

For any error scenario:
- Application continues to function
- Companies display without KPI data
- No console errors for expected failures
- User sees "N/A" for missing data

**Test Strategy**: Error scenario tests with mocked failures

## Migration Strategy

### Phase 1: Service Implementation
1. Create `CompanyKpiService`
2. Implement CNPJ ID extraction
3. Implement KPI data fetching
4. Add unit tests

### Phase 2: Component Integration
1. Update `GamificationDashboardComponent` to load company data from action_log
2. Integrate `CompanyKpiService` to enrich with KPI data
3. Add integration tests

### Phase 3: Component Enhancement
1. Update `C4uCompanyTableComponent` template
2. Add KPI column to table
3. Add component tests

### Phase 4: Polish & Testing
1. Add property-based tests
2. Performance testing
3. Error scenario testing
4. Visual polish

### Rollback Plan

If issues arise:
1. Remove KPI column from template (feature flag)
2. Remove `CompanyKpiService` injection from dashboard component
3. Revert to displaying companies without KPI data
4. No data migration needed (additive changes only)

## Future Enhancements

### Multiple KPIs per Company
- Extend `cnpj__c` schema with additional KPI fields
- Update `CompanyKpiService` to map multiple KPIs
- Add KPI selector/toggle in UI

### KPI Targets Configuration
- Add system parameter for delivery target
- Allow per-company target overrides
- Admin UI for target management

### Historical KPI Trends
- Store KPI history in separate collection
- Add trend indicators (↑↓) next to current value
- Mini sparkline charts in table

### KPI Filtering & Sorting
- Filter companies by KPI performance
- Sort table by KPI values
- KPI performance badges (gold/silver/bronze)

## Dependencies

### Existing Services
- `FunifierApiService`: API communication
- `ActionLogService`: Provides CNPJ strings from action_log

### Existing Components
- `C4uCompanyTableComponent`: Company list display
- `C4uKpiCircularProgressComponent`: KPI visualization

### New Dependencies
- None (uses existing Angular/RxJS)

## Configuration

### System Parameters

**Delivery Target** (Optional):
```typescript
// In system_params collection
{
  "delivery_target": 100
}
```

**Feature Flag** (Optional):
```typescript
// In environment.ts
{
  features: {
    companyKpiIndicators: true
  }
}
```

## Accessibility

### ARIA Labels
```html
<c4u-kpi-circular-progress
  [label]="'Entregas'"
  [current]="89"
  [target]="100"
  [attr.aria-label]="'Entregas: 89 de 100'"
  [attr.role]="'progressbar'"
  [attr.aria-valuenow]="89"
  [attr.aria-valuemin]="0"
  [attr.aria-valuemax]="100"
></c4u-kpi-circular-progress>
```

### Keyboard Navigation
- KPI indicators are not interactive (display only)
- Table row navigation remains unchanged
- Screen reader announces KPI values

### Color Contrast
- Ensure KPI colors meet WCAG AA standards
- Provide text labels in addition to colors
- Test with color blindness simulators

## Documentation

### Developer Documentation
- Service API documentation (JSDoc)
- Component usage examples
- Integration guide

### User Documentation
- Feature announcement
- KPI interpretation guide
- FAQ for missing data

## Success Criteria

- ✅ KPI indicators display for all companies with valid CNPJ data
- ✅ Page load time increase < 200ms
- ✅ Zero console errors related to KPI fetching
- ✅ Visual consistency with player KPI indicators
- ✅ All unit tests passing
- ✅ All property-based tests passing
- ✅ Accessibility compliance (WCAG AA)
