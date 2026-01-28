# Team Management Dashboard - Troubleshooting Guide

This comprehensive guide helps you diagnose and resolve common issues with the Team Management Dashboard.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Access and Authentication Issues](#access-and-authentication-issues)
3. [Data Loading Issues](#data-loading-issues)
4. [Chart and Visualization Issues](#chart-and-visualization-issues)
5. [Performance Issues](#performance-issues)
6. [Compilation and Build Errors](#compilation-and-build-errors)
7. [Browser Compatibility Issues](#browser-compatibility-issues)
8. [API and Network Issues](#api-and-network-issues)
9. [Styling and Display Issues](#styling-and-display-issues)
10. [Getting Additional Help](#getting-additional-help)

## Quick Diagnostics

### First Steps for Any Issue

1. **Refresh the Page**: Press F5 or Ctrl+R (Cmd+R on Mac)
2. **Clear Cache**: Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
3. **Check Console**: Press F12 and look for errors in the Console tab
4. **Try Incognito**: Open in private/incognito mode to rule out extensions
5. **Check Network**: F12 → Network tab → look for failed requests (red)

### Quick Checks

```javascript
// Open browser console (F12) and run:

// 1. Check if user is logged in
console.log(sessionStorage.getItem('user'));

// 2. Check user roles
const user = JSON.parse(sessionStorage.getItem('user') || '{}');
console.log('Roles:', user.extra?.roles);

// 3. Check API connectivity
fetch('https://api.funifier.com/v3/health')
  .then(r => r.json())
  .then(d => console.log('API Status:', d))
  .catch(e => console.error('API Error:', e));

// 4. Check for JavaScript errors
console.log('Errors:', window.onerror);
```

## Access and Authentication Issues

### Issue: "Access Denied" Message

**Symptoms**:
- Redirected to personal dashboard
- Error message: "Acesso negado. Você não tem permissão para acessar esta página."

**Causes**:
1. User doesn't have GESTAO role
2. Session expired
3. Role not properly cached

**Solutions**:

**Solution 1: Verify GESTAO Role**
```bash
# Check via Funifier API
curl -X GET https://api.funifier.com/v3/player/YOUR_EMAIL \
  -H "Authorization: Bearer YOUR_API_KEY"

# Look for: "extra": { "roles": ["GESTAO"] }
```

**Solution 2: Clear Session and Re-login**
```javascript
// In browser console
localStorage.clear();
sessionStorage.clear();
location.reload();
// Then log in again
```

**Solution 3: Contact Administrator**
- Request GESTAO role assignment
- See [Role Configuration Guide](TEAM_DASHBOARD_ROLE_CONFIGURATION.md)

### Issue: Session Expired

**Symptoms**:
- Suddenly logged out
- 401 Unauthorized errors
- Redirected to login page

**Solutions**:

**Solution 1: Re-authenticate**
1. Log out completely
2. Clear browser cache
3. Log back in
4. Navigate to team dashboard

**Solution 2: Check Token Expiration**
```javascript
// In browser console
const token = sessionStorage.getItem('auth_token');
if (token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expiry = new Date(payload.exp * 1000);
  console.log('Token expires:', expiry);
  console.log('Is expired:', expiry < new Date());
}
```

**Solution 3: Extend Session Timeout**
- Contact administrator to increase session timeout
- Configure in authentication service

### Issue: Infinite Redirect Loop

**Symptoms**:
- Page keeps redirecting
- URL changes rapidly
- Browser becomes unresponsive

**Solutions**:

**Solution 1: Clear All Storage**
```javascript
// In browser console
localStorage.clear();
sessionStorage.clear();
indexedDB.deleteDatabase('game4u');
location.href = '/login';
```

**Solution 2: Check Route Guard**
```typescript
// Verify TeamRoleGuardService is not causing loop
// Check for circular redirects in guard logic
```

**Solution 3: Disable Extensions**
- Open in incognito mode
- Disable all browser extensions
- Try again

## Data Loading Issues

### Issue: No Data Displayed

**Symptoms**:
- Metrics show zero
- "No data available" message
- Empty charts

**Causes**:
1. No data exists for selected period
2. Team name mismatch
3. API query error
4. Network connectivity issue

**Solutions**:

**Solution 1: Verify Data Exists**
```bash
# Check if team has data in Funifier
curl -X POST https://api.funifier.com/v3/database/action_log/aggregate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "aggregate": [
      { "$match": { "attributes.team": "Departamento Pessoal" } },
      { "$group": { "_id": null, "count": { "$sum": 1 } } }
    ]
  }'
```

**Solution 2: Check Team Name**
- Verify team name is exact match (case-sensitive)
- Check for extra spaces or special characters
- Try different team from dropdown

**Solution 3: Check Date Range**
- Select different month
- Try current month
- Verify season dates are configured

**Solution 4: Check Browser Console**
```javascript
// Look for errors in console (F12)
// Common errors:
// - "Failed to fetch"
// - "404 Not Found"
// - "Invalid aggregate query"
```

### Issue: Data Loads Slowly

**Symptoms**:
- Loading spinner for extended time
- Page feels sluggish
- Timeout errors

**Solutions**:

**Solution 1: Reduce Time Period**
- Use 7 or 15 days instead of 90 days
- Smaller date ranges load faster

**Solution 2: Clear Cache**
```javascript
// In browser console
localStorage.clear();
sessionStorage.clear();
location.reload();
```

**Solution 3: Check Network Speed**
```javascript
// Test network speed
const start = performance.now();
fetch('https://api.funifier.com/v3/health')
  .then(() => {
    const duration = performance.now() - start;
    console.log(`Network latency: ${duration}ms`);
  });
```

**Solution 4: Optimize Queries**
- Contact administrator to add database indexes
- Review aggregate query performance
- Consider data archiving for old records

### Issue: Stale Data

**Symptoms**:
- Data doesn't update
- Shows old values
- Refresh doesn't help

**Solutions**:

**Solution 1: Force Refresh**
1. Click refresh button in dashboard
2. Wait for loading to complete
3. Verify last refresh timestamp

**Solution 2: Clear Service Cache**
```javascript
// In browser console
// This clears the 5-minute cache
window.location.reload(true); // Hard reload
```

**Solution 3: Check Cache TTL**
```typescript
// Verify cache TTL in TeamAggregateService
private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
// Reduce if needed for more real-time data
```

## Chart and Visualization Issues

### Issue: Charts Not Rendering

**Symptoms**:
- Blank space where chart should be
- "Chart.js is not defined" error
- Loading spinner never stops

**Solutions**:

**Solution 1: Verify Chart.js Loaded**
```javascript
// In browser console
console.log('Chart.js loaded:', typeof Chart !== 'undefined');
```

**Solution 2: Check for JavaScript Errors**
- Open console (F12)
- Look for errors related to Chart.js
- Check if chart container exists

**Solution 3: Reinstall Dependencies**
```bash
npm install chart.js --save
npm install
ng serve
```

**Solution 4: Check Chart Data Format**
```typescript
// Verify data is in correct format
console.log('Chart data:', this.graphData);
// Should be: [{ date: Date, value: number }, ...]
```

### Issue: Chart Shows Incorrect Data

**Symptoms**:
- Values don't match sidebar metrics
- Missing data points
- Wrong dates on X-axis

**Solutions**:

**Solution 1: Verify Data Processing**
```typescript
// Check GraphDataProcessorService
// Ensure fillMissingDates is working correctly
const filled = this.graphDataProcessor.fillMissingDates(data, start, end);
console.log('Filled data points:', filled.length);
```

**Solution 2: Check Date Formatting**
```typescript
// Verify dates are formatted correctly
console.log('Date format:', dayjs(date).format('YYYY-MM-DD'));
```

**Solution 3: Verify Aggregate Query**
```typescript
// Log the aggregate query being sent
console.log('Query:', JSON.stringify(query, null, 2));
```

### Issue: Chart Tooltips Not Working

**Symptoms**:
- Hover doesn't show tooltip
- Tooltip shows wrong values
- Tooltip appears in wrong position

**Solutions**:

**Solution 1: Check Chart.js Configuration**
```typescript
// Verify tooltip configuration
const options = {
  plugins: {
    tooltip: {
      enabled: true,
      mode: 'index',
      intersect: false
    }
  }
};
```

**Solution 2: Check Z-Index**
```css
/* Ensure tooltip is above other elements */
.chart-container {
  position: relative;
  z-index: 1;
}
```

**Solution 3: Update Chart.js**
```bash
npm update chart.js
```

## Performance Issues

### Issue: Dashboard Loads Slowly

**Symptoms**:
- Initial load takes > 5 seconds
- White screen for extended time
- Browser becomes unresponsive

**Solutions**:

**Solution 1: Check Bundle Size**
```bash
ng build --stats-json
npx webpack-bundle-analyzer dist/stats.json
```

**Solution 2: Enable Production Mode**
```bash
ng build --configuration=production
```

**Solution 3: Lazy Load Components**
```typescript
// Ensure lazy loading is configured
const routes: Routes = [
  {
    path: 'team-management',
    loadChildren: () => import('./team-management/team-management.module')
      .then(m => m.TeamManagementModule)
  }
];
```

**Solution 4: Optimize Images**
- Compress images
- Use appropriate formats (WebP, SVG)
- Lazy load images

### Issue: High Memory Usage

**Symptoms**:
- Browser tab uses excessive RAM
- Browser becomes slow
- Tab crashes

**Solutions**:

**Solution 1: Check for Memory Leaks**
```typescript
// Ensure proper unsubscribe
private destroy$ = new Subject<void>();

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

**Solution 2: Limit Data Size**
```typescript
// Add limit to aggregate queries
{
  $limit: 1000  // Limit results
}
```

**Solution 3: Clear Cache Periodically**
```typescript
// Clear cache every hour
setInterval(() => {
  this.teamAggregateService.clearCache();
}, 60 * 60 * 1000);
```

### Issue: Slow Chart Rendering

**Symptoms**:
- Chart takes long to render
- UI freezes during chart update
- Animations are choppy

**Solutions**:

**Solution 1: Reduce Data Points**
```typescript
// Limit number of data points
const maxPoints = 90;
if (data.length > maxPoints) {
  data = this.sampleData(data, maxPoints);
}
```

**Solution 2: Disable Animations**
```typescript
const options = {
  animation: {
    duration: 0  // Disable animations
  }
};
```

**Solution 3: Use OnPush Change Detection**
```typescript
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush
})
```

## Compilation and Build Errors

### Issue: TypeScript Compilation Errors

**Symptoms**:
- `ng serve` fails
- Type errors in console
- Build fails

**Common Errors and Solutions**:

**Error: "Cannot find module '@services/...'"**
```typescript
// Solution: Check tsconfig.json paths
{
  "compilerOptions": {
    "paths": {
      "@services/*": ["src/app/services/*"],
      "@components/*": ["src/app/components/*"]
    }
  }
}
```

**Error: "Property 'extra' does not exist on type 'User'"**
```typescript
// Solution: Add to user interface
interface User {
  id: string;
  name: string;
  email: string;
  extra?: {
    roles?: string[];
    teams?: string[];
  };
}
```

**Error: "Type 'Observable<unknown>' is not assignable"**
```typescript
// Solution: Add proper typing
getTeamPoints(): Observable<TeamSeasonPoints> {
  return this.http.post<{ result: any[] }>(endpoint, query).pipe(
    map(response => this.processPoints(response.result))
  );
}
```

### Issue: SCSS Compilation Errors

**Symptoms**:
- SCSS files won't compile
- Missing variables errors
- Import errors

**Solutions**:

**Solution 1: Check SCSS Imports**
```scss
// Ensure correct import path
@import 'src/styles/variables';
@import 'src/styles/mixins';
```

**Solution 2: Install SCSS Dependencies**
```bash
npm install sass --save-dev
```

**Solution 3: Check angular.json Configuration**
```json
{
  "projects": {
    "game4u": {
      "architect": {
        "build": {
          "options": {
            "stylePreprocessorOptions": {
              "includePaths": ["src/styles"]
            }
          }
        }
      }
    }
  }
}
```

### Issue: Module Not Found Errors

**Symptoms**:
- "Module not found" errors
- Import statements fail
- Components not recognized

**Solutions**:

**Solution 1: Install Missing Dependencies**
```bash
npm install
# or
npm install chart.js dayjs --save
```

**Solution 2: Check Module Imports**
```typescript
// Ensure module is imported in app.module.ts or feature module
import { TeamManagementDashboardModule } from './team-management-dashboard.module';

@NgModule({
  imports: [
    TeamManagementDashboardModule
  ]
})
```

**Solution 3: Clear Node Modules**
```bash
rm -rf node_modules package-lock.json
npm install
```

## Browser Compatibility Issues

### Issue: Dashboard Doesn't Work in Internet Explorer

**Symptoms**:
- Blank page in IE
- JavaScript errors
- Styles not applied

**Solution**:
Internet Explorer is not supported. Use a modern browser:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

### Issue: Safari-Specific Issues

**Symptoms**:
- Charts render incorrectly
- Date picker doesn't work
- Styles look different

**Solutions**:

**Solution 1: Add Safari-Specific Styles**
```scss
/* Safari-specific fixes */
@supports (-webkit-appearance: none) {
  .chart-container {
    /* Safari-specific styles */
  }
}
```

**Solution 2: Check Date Handling**
```typescript
// Safari has strict date parsing
// Use ISO format
const date = new Date('2024-01-15T00:00:00.000Z'); // ✅
const date = new Date('2024-01-15'); // ❌ May fail in Safari
```

### Issue: Mobile Browser Issues

**Symptoms**:
- Touch events don't work
- Layout broken on mobile
- Charts not interactive

**Solutions**:

**Solution 1: Add Touch Event Handlers**
```typescript
// Add touch support for charts
const options = {
  interaction: {
    mode: 'nearest',
    intersect: false
  }
};
```

**Solution 2: Test Responsive Breakpoints**
```scss
// Ensure mobile breakpoints are correct
@media (max-width: 768px) {
  .sidebar {
    width: 100%;
  }
}
```

## API and Network Issues

### Issue: CORS Errors

**Symptoms**:
- "Access-Control-Allow-Origin" error
- API requests blocked
- Network tab shows CORS error

**Solutions**:

**Solution 1: Check API Configuration**
- Verify Funifier API allows your domain
- Contact Funifier support to whitelist domain

**Solution 2: Use Proxy in Development**
```json
// proxy.conf.json
{
  "/api": {
    "target": "https://api.funifier.com",
    "secure": true,
    "changeOrigin": true,
    "pathRewrite": {
      "^/api": ""
    }
  }
}
```

```bash
ng serve --proxy-config proxy.conf.json
```

### Issue: 401 Unauthorized Errors

**Symptoms**:
- All API requests fail with 401
- "Unauthorized" in console
- Redirected to login

**Solutions**:

**Solution 1: Check API Key**
```typescript
// Verify API key is correct
console.log('API Key:', environment.apiKey);
```

**Solution 2: Check Authorization Header**
```javascript
// In Network tab (F12), check request headers
// Should have: Authorization: Bearer YOUR_API_KEY
```

**Solution 3: Refresh Token**
```typescript
// Re-authenticate
this.authService.refreshToken().subscribe();
```

### Issue: 429 Rate Limit Errors

**Symptoms**:
- "Too Many Requests" error
- API stops responding
- 429 status code

**Solutions**:

**Solution 1: Reduce Request Frequency**
```typescript
// Add debouncing
this.searchInput$.pipe(
  debounceTime(500),
  switchMap(query => this.search(query))
).subscribe();
```

**Solution 2: Implement Retry with Backoff**
```typescript
retry({
  count: 3,
  delay: (error, retryCount) => timer(retryCount * 1000)
})
```

**Solution 3: Contact Administrator**
- Request higher rate limit
- Review API usage patterns

## Styling and Display Issues

### Issue: Styles Not Applied

**Symptoms**:
- Components look unstyled
- Wrong colors
- Layout broken

**Solutions**:

**Solution 1: Check SCSS Compilation**
```bash
# Verify SCSS files are compiling
ng serve --verbose
```

**Solution 2: Check Style Imports**
```scss
// In component SCSS
@import 'src/styles/variables';
@import 'src/styles/mixins';
```

**Solution 3: Clear Browser Cache**
```
Ctrl+Shift+Delete → Clear cached images and files
```

**Solution 4: Check ViewEncapsulation**
```typescript
@Component({
  encapsulation: ViewEncapsulation.None  // If needed
})
```

### Issue: Dark Theme Not Applied

**Symptoms**:
- Dashboard shows light theme
- Colors don't match design
- Contrast issues

**Solutions**:

**Solution 1: Check Theme Class**
```html
<!-- Verify body has theme class -->
<body class="dark-theme">
```

**Solution 2: Check CSS Variables**
```scss
// Verify CSS variables are defined
:root {
  --primary-color: #1a1a1a;
  --background-color: #0d0d0d;
}
```

**Solution 3: Force Theme**
```typescript
// In app.component.ts
ngOnInit() {
  document.body.classList.add('dark-theme');
}
```

## Getting Additional Help

### Before Contacting Support

Gather this information:

1. **Error Details**:
   - Exact error message
   - Screenshot of error
   - Browser console output (F12)

2. **Environment**:
   - Browser and version
   - Operating system
   - Screen resolution

3. **Steps to Reproduce**:
   - What you were doing
   - What you expected
   - What actually happened

4. **Network Information**:
   - Network tab from browser (F12)
   - Failed requests (red items)
   - Request/response details

### Debug Information to Collect

```javascript
// Run in browser console and save output
const debugInfo = {
  userAgent: navigator.userAgent,
  screenSize: `${window.screen.width}x${window.screen.height}`,
  viewportSize: `${window.innerWidth}x${window.innerHeight}`,
  user: JSON.parse(sessionStorage.getItem('user') || '{}'),
  localStorage: { ...localStorage },
  sessionStorage: { ...sessionStorage },
  errors: window.onerror,
  timestamp: new Date().toISOString()
};

console.log(JSON.stringify(debugInfo, null, 2));
```

### Contact Channels

1. **System Administrator**: First point of contact
2. **Technical Support**: For technical issues
3. **Funifier Support**: For API-related issues
4. **GitHub Issues**: For bug reports (if applicable)

### Additional Resources

- [Manager Usage Guide](TEAM_DASHBOARD_MANAGER_GUIDE.md)
- [Role Configuration Guide](TEAM_DASHBOARD_ROLE_CONFIGURATION.md)
- [API Integration Patterns](TEAM_DASHBOARD_API_INTEGRATION.md)
- [Aggregate Query Patterns](TEAM_DASHBOARD_AGGREGATE_QUERIES.md)

---

**Last Updated**: January 2024  
**Version**: 1.0  
**For**: Game4U Team Management Dashboard
