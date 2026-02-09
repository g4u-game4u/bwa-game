# CNPJ Lookup 401 Unauthorized Fix

## Problem
The CNPJ lookup service was getting 401 Unauthorized errors when calling the Funifier database endpoint:
```
GET https://service2.funifier.com/v3/database/empid_cnpj__c
```

## Root Cause Analysis
The service was already using the correct approach (HttpClient directly with Basic Auth headers), but we needed enhanced logging to diagnose the issue.

## Solution Applied

### 1. Enhanced Logging
Added comprehensive logging to track:
- API URL being called
- Basic token presence and partial value
- Request headers being sent
- HTTP request lifecycle
- Detailed error information

### 2. Implementation Details

The service now:
1. Uses `HttpClient` directly (not through `FunifierApiService`)
2. Sets explicit Basic Auth headers:
   ```typescript
   const headers = new HttpHeaders({
     'Authorization': `Basic ${this.basicToken}`,
     'Content-Type': 'application/json'
   });
   ```
3. Calls the database endpoint directly:
   ```typescript
   this.http.get<CnpjEntry[]>(this.apiUrl, { headers })
   ```

### 3. Interceptor Behavior
The `AuthInterceptor` is configured to:
- Detect database endpoints by URL pattern (`/database`)
- Pass through requests that already have Authorization header
- Not modify database requests (they use Basic Auth, not Bearer)

## Testing Steps

1. **Clear browser cache and refresh**
   ```bash
   # In browser DevTools Console
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

2. **Check console logs**
   Look for these log messages:
   ```
   📊 Fetching CNPJ database from empid_cnpj__c
   📊 API URL: https://service2.funifier.com/v3/database/empid_cnpj__c
   📊 Basic token present: true
   📊 Request headers: { Authorization: 'Basic ***', Content-Type: 'application/json' }
   📊 HTTP request sent successfully
   📊 CNPJ database loaded: X entries
   ```

3. **Verify in Network tab**
   - Request URL should be correct
   - Request Headers should include: `Authorization: Basic NjkwYTc4NWNlMTc5ZDQ2ZmNlNTllZDY1OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==`
   - Response should be 200 OK with JSON array

4. **Check Carteira display**
   - Open Carteira modal
   - CNPJ entries should show clean company names (empresa field)
   - Example: "2A MEDEIROS LTDA" instead of "48.465.297/0001-97"

## Expected Behavior

### Before Fix
```html
<span class="carteira-cnpj">1063</span>
<!-- Shows raw empid or CNPJ -->
```

### After Fix
```html
<span class="carteira-cnpj">EMPRESA NAME LTDA</span>
<!-- Shows clean company name from database -->
```

## Debugging Guide

If 401 errors persist:

1. **Verify Basic Token**
   ```typescript
   console.log('Token:', environment.funifier_basic_token);
   // Should output: NjkwYTc4NWNlMTc5ZDQ2ZmNlNTllZDY1OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==
   ```

2. **Test Manual Request**
   ```javascript
   // In browser console
   fetch('https://service2.funifier.com/v3/database/empid_cnpj__c', {
     headers: {
       'Authorization': 'Basic NjkwYTc4NWNlMTc5ZDQ2ZmNlNTllZDY1OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ==',
       'Content-Type': 'application/json'
     }
   }).then(r => r.json()).then(console.log);
   ```

3. **Check Interceptor**
   - Look for: `🔐 Interceptor: Passing through request with existing auth or database endpoint`
   - If not present, interceptor might be modifying the request

4. **Verify Environment**
   ```typescript
   // In src/environments/environment.ts
   funifier_basic_token: 'NjkwYTc4NWNlMTc5ZDQ2ZmNlNTllZDY1OjY3ZWM0ZTRhMjMyN2Y3NGYzYTJmOTZmNQ=='
   ```

## Files Modified

1. **src/app/services/cnpj-lookup.service.ts**
   - Added enhanced logging
   - Added `tap` operator import
   - Improved error logging with full error details

## Related Documentation

- [CNPJ Lookup Implementation](./CNPJ_LOOKUP_IMPLEMENTATION.md)
- [CNPJ Lookup Summary](./CNPJ_LOOKUP_SUMMARY.md)
- [Authentication Guide](./AUTHENTICATION_GUIDE.md)
- [401 Unauthorized Fix](./401_UNAUTHORIZED_FIX.md)

## Success Criteria

✅ No 401 errors in console
✅ CNPJ database loads successfully
✅ Carteira displays clean company names
✅ Console shows: "📊 CNPJ database loaded: X entries"
✅ Network tab shows 200 OK response

## Next Steps

1. Test in browser with DevTools open
2. Verify console logs show successful database fetch
3. Check Carteira modal displays company names correctly
4. If issues persist, review interceptor logs and manual fetch test
