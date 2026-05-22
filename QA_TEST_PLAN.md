# QA Test Plan - Empty Modal Fix & User Action Search Migration

## Overview
Testing the fix for empty modal issue and migration to `/user-action/search` endpoint with status filtering.

---

## Test Environment Setup

### Prerequisites
- [ ] Application running on `http://localhost:4200/`
- [ ] Backend API accessible at `https://g4u-api-bwa.onrender.com`
- [ ] Browser DevTools open (Console + Network tabs)
- [ ] Test user with actions in current month
- [ ] Test user with multiple deliveries

### Test Users
- **Colaborador**: User with their own actions
- **Gestor**: User managing a team with multiple members

---

## 1. Dashboard Colaborador - Clientes List

### Test Case 1.1: Clientes List Loads Correctly
**Steps:**
1. Login as a colaborador user
2. Navigate to Dashboard Colaborador
3. Observe the "Clientes" section

**Expected Results:**
- [ ] Clientes list loads without errors
- [ ] Shows deliveries with action counts
- [ ] Deliveries are sorted by most recent action first (newest at top)
- [ ] Action counts are > 0 for deliveries with finished actions

**Console Verification:**
```
✅ [fetchAllUserActionsForMonthViaSearch] Fetching DONE and DELIVERED actions for user@example.com
✅ [fetchAllUserActionsForMonthViaSearch] Fetched X DONE + Y DELIVERED = Z unique actions
✅ [buildCarteiraCompanies] Built N deliveries, sorted by most recent action first
```

**Network Verification:**
```
✅ GET /user-action/search?user_email=...&status=DONE&finished_at_start=...&limit=500
✅ GET /user-action/search?user_email=...&status=DELIVERED&finished_at_start=...&limit=500
✅ Both requests return 200 OK
```

---

### Test Case 1.2: Clientes List Pagination
**Steps:**
1. Check if user has > 500 actions in the month
2. Observe console logs for pagination

**Expected Results:**
- [ ] Multiple pages are fetched automatically
- [ ] Console shows: "Page 1: fetched X items, total so far: X"
- [ ] Console shows: "Page 2: fetched Y items, total so far: X+Y"
- [ ] All pages are combined and deduplicated

**Console Verification:**
```
✅ [fetchUserActionSearchAllPages] Page 1: fetched 500 items, total so far: 500
✅ [fetchUserActionSearchAllPages] Page 2: fetched 200 items, total so far: 700
✅ [fetchUserActionSearchAllPages] After deduplication and sorting: 700 unique items
```

---

### Test Case 1.3: Clientes List Sorting
**Steps:**
1. Note the order of deliveries in the list
2. Check the timestamps of actions in each delivery

**Expected Results:**
- [ ] Deliveries with most recent actions appear first
- [ ] Older deliveries appear at the bottom
- [ ] Within same timestamp, sorted by action count (descending)

---

## 2. Modal Carteira - Delivery Details

### Test Case 2.1: Modal Opens with Matching Data
**Steps:**
1. Note the action count for a delivery in the list (e.g., "Cliente A - 5 ações")
2. Click on that delivery to open the modal
3. Count the actions shown in the modal

**Expected Results:**
- [ ] Modal opens without errors
- [ ] Number of actions in modal matches the count in the list
- [ ] All actions have valid timestamps (not null)
- [ ] Actions are sorted by most recent first

**Console Verification:**
```
✅ [getClienteActionsForDelivery] playerId: ..., userEmail: ..., deliveryId: ...
✅ [getClienteActionsForDelivery] Fetched X total actions for user@example.com
✅ [getClienteActionsForDelivery] Filtered to Y actions for delivery 123
```

**Network Verification:**
```
✅ GET /user-action/search?user_email=...&status=DONE&finished_at_start=...
✅ GET /user-action/search?user_email=...&status=DELIVERED&finished_at_start=...
✅ Both requests return 200 OK
```

---

### Test Case 2.2: Modal Shows Only Finished Actions
**Steps:**
1. Open modal for a delivery
2. Check the status of each action shown
3. Verify timestamps are present

**Expected Results:**
- [ ] All actions have status "finalizado" or "dispensado"
- [ ] No actions with status "pendente" are shown
- [ ] All actions have `finished_at` timestamp (not null)
- [ ] Timestamps are formatted correctly (DD/MM/YYYY)

**Console Verification:**
```
❌ Should NOT see:
   [referenceTimestamp] No finished_at, using created_at for action...
```

---

### Test Case 2.3: Modal with Multiple Deliveries
**Steps:**
1. Open modal for first delivery, note action count
2. Close modal
3. Open modal for second delivery, note action count
4. Verify each modal shows different actions

**Expected Results:**
- [ ] Each modal shows actions specific to that delivery
- [ ] Action counts are different for different deliveries
- [ ] No duplicate actions across deliveries
- [ ] Modal data refreshes correctly when switching deliveries

---

### Test Case 2.4: Modal with Dismissed Actions
**Steps:**
1. Open modal for a delivery that has dismissed actions
2. Check if dismissed actions are shown separately

**Expected Results:**
- [ ] Dismissed actions are shown (if applicable)
- [ ] Dismissed actions have status "dispensado"
- [ ] Dismissed actions don't count toward metrics
- [ ] Both dismissed=false and dismissed=true are fetched

**Network Verification:**
```
✅ GET /user-action/search?delivery_id=...&dismissed=false&status=DONE
✅ GET /user-action/search?delivery_id=...&dismissed=true&status=DONE
✅ GET /user-action/search?delivery_id=...&dismissed=false&status=DELIVERED
✅ GET /user-action/search?delivery_id=...&dismissed=true&status=DELIVERED
```

---

## 3. Dashboard Gestor - Team Management

### Test Case 3.1: Team Metrics Load Correctly
**Steps:**
1. Login as a gestor user
2. Navigate to Dashboard Gestor
3. Observe team metrics (activities, deliveries, points)

**Expected Results:**
- [ ] Team metrics load without errors
- [ ] Activity count shows only finished actions
- [ ] Delivery count matches number of unique deliveries
- [ ] Points are calculated correctly

**Console Verification:**
```
✅ [fetchAllUserActionsForMonthViaSearch] Fetching DONE and DELIVERED actions for each team member
✅ No errors about "property limit should not exist"
✅ No errors about "property sort should not exist"
```

---

### Test Case 3.2: Team Clientes List
**Steps:**
1. Check the team's Clientes list
2. Note action counts for deliveries

**Expected Results:**
- [ ] Shows deliveries with aggregated action counts from all team members
- [ ] Sorted by most recent action first
- [ ] Action counts are sum of all team members' actions

---

### Test Case 3.3: Team Modal Carteira
**Steps:**
1. Click on a delivery in the team's Clientes list
2. Observe the modal content

**Expected Results:**
- [ ] Modal shows actions from all team members for that delivery
- [ ] Each action shows the user email (player)
- [ ] Action count in list matches total actions in modal
- [ ] Actions are sorted by most recent first

**Console Verification:**
```
✅ [getClienteActionsForDeliveryForPlayers] Fetching for multiple players
✅ Actions from all players are merged and sorted
```

---

## 4. Gamification Dashboard

### Test Case 4.1: Activity Metrics
**Steps:**
1. Navigate to Gamification Dashboard
2. Check activity metrics (finalizadas, pontos)

**Expected Results:**
- [ ] Metrics load without errors
- [ ] "Finalizadas" count shows only DONE/DELIVERED actions
- [ ] Points are calculated correctly
- [ ] No pending actions are counted

**Console Verification:**
```
✅ [fetchAllUserActionsForMonthViaSearch] Fetching DONE and DELIVERED actions
✅ [getActivityMetricsFromActions] Calculating metrics from finished actions only
```

---

### Test Case 4.2: Activity List
**Steps:**
1. Check the activity list on the dashboard
2. Verify all activities shown are finished

**Expected Results:**
- [ ] All activities have status "finalizado"
- [ ] All activities have valid timestamps
- [ ] Activities are sorted by most recent first
- [ ] No pending activities are shown

---

## 5. Month Selector

### Test Case 5.1: Change Month
**Steps:**
1. Note current month's data
2. Change to previous month using month selector
3. Observe data refresh

**Expected Results:**
- [ ] Data refreshes for new month
- [ ] API requests use correct date range for new month
- [ ] Clientes list updates with new month's deliveries
- [ ] Metrics update for new month

**Network Verification:**
```
✅ GET /user-action/search?finished_at_start=2026-04-01&finished_at_end=2026-04-30
✅ Date range matches selected month
```

---

### Test Case 5.2: Month with No Actions
**Steps:**
1. Select a month with no actions (e.g., future month)
2. Observe behavior

**Expected Results:**
- [ ] Clientes list shows empty state
- [ ] No errors in console
- [ ] Metrics show 0 for all counts
- [ ] No API errors (200 OK with empty results)

---

## 6. API Error Handling

### Test Case 6.1: No Invalid Parameters
**Steps:**
1. Monitor Network tab for all API requests
2. Check for 400 errors

**Expected Results:**
- [ ] No 400 errors with "property limit should not exist"
- [ ] No 400 errors with "property sort should not exist"
- [ ] All requests return 200 OK or valid error codes

**Network Verification:**
```
❌ Should NOT see:
   GET /game/actions?...&limit=500 → 400 Bad Request
   GET /user-action/search?...&sort=finished_at:desc → 400 Bad Request
```

---

### Test Case 6.2: Network Failure Handling
**Steps:**
1. Simulate network failure (disconnect internet briefly)
2. Try to load dashboard

**Expected Results:**
- [ ] Graceful error handling
- [ ] User-friendly error message
- [ ] No console errors that crash the app
- [ ] Retry works when network is restored

---

## 7. Performance Testing

### Test Case 7.1: Load Time
**Steps:**
1. Clear browser cache
2. Reload dashboard
3. Measure time to load Clientes list

**Expected Results:**
- [ ] Clientes list loads in < 3 seconds
- [ ] No noticeable delay compared to previous version
- [ ] Parallel requests (DONE + DELIVERED) don't slow down loading

---

### Test Case 7.2: Large Dataset
**Steps:**
1. Test with user who has > 500 actions in month
2. Observe pagination and performance

**Expected Results:**
- [ ] All pages are fetched automatically
- [ ] No timeout errors
- [ ] Data is deduplicated correctly
- [ ] UI remains responsive during loading

---

## 8. Edge Cases

### Test Case 8.1: User with No Email
**Steps:**
1. Test with user ID that doesn't resolve to email
2. Observe behavior

**Expected Results:**
- [ ] Graceful handling
- [ ] Console warning: "[getActivityMetricsForPlayer] Invalid user email"
- [ ] Returns empty results instead of crashing
- [ ] No API requests with invalid parameters

---

### Test Case 8.2: Delivery with No Actions
**Steps:**
1. Find a delivery that appears in list but has 0 actions
2. Click to open modal

**Expected Results:**
- [ ] Modal opens
- [ ] Shows empty state or "No actions found"
- [ ] No errors in console
- [ ] Can close modal normally

---

### Test Case 8.3: Actions with Missing finished_at
**Steps:**
1. Check if any actions in modal have null finished_at
2. Verify they are not shown

**Expected Results:**
- [ ] No actions with null finished_at are shown
- [ ] Only DONE/DELIVERED actions (which always have finished_at) are displayed
- [ ] Console shows no warnings about missing finished_at

---

### Test Case 8.4: Actions Finished Before Created
**Steps:**
1. Find actions where finished_at < created_at
2. Verify they are handled correctly

**Expected Results:**
- [ ] Actions are shown correctly
- [ ] finished_at is used as reference timestamp (not created_at)
- [ ] Sorting is based on finished_at
- [ ] No errors about invalid timestamps

---

## 9. Console Log Verification

### Test Case 9.1: Expected Logs
**Check console for these logs:**

```
✅ [fetchAllUserActionsForMonthViaSearch] Fetching DONE and DELIVERED actions for user@example.com
✅ [fetchAllUserActionsForMonthViaSearch] Month: 2026-05
✅ [fetchAllUserActionsForMonthViaSearch] Date range: 2026-05-01 to 2026-05-31
✅ [fetchUserActionSearchAllPages] Page 1: fetched X items, total so far: X
✅ [fetchUserActionSearchAllPages] After deduplication and sorting: X unique items
✅ [fetchAllUserActionsForMonthViaSearch] Fetched X DONE + Y DELIVERED = Z unique actions
✅ [buildCarteiraCompanies] Built N deliveries, sorted by most recent action first
```

---

### Test Case 9.2: Logs That Should NOT Appear
**Check console does NOT show:**

```
❌ [referenceTimestamp] No finished_at, using created_at for action...
❌ Error: property limit should not exist
❌ Error: property sort should not exist
❌ 400 Bad Request
❌ Validation error
```

---

## 10. Network Request Verification

### Test Case 10.1: Correct API Endpoints
**Verify these requests are made:**

```
✅ GET /user-action/search?user_email=...&status=DONE&finished_at_start=2026-05-01&finished_at_end=2026-05-31&limit=500&page=1
✅ GET /user-action/search?user_email=...&status=DELIVERED&finished_at_start=2026-05-01&finished_at_end=2026-05-31&limit=500&page=1
✅ GET /user-action/search?delivery_id=...&status=DONE&finished_at_start=2026-05-01&finished_at_end=2026-05-31&limit=200&page=1
✅ GET /user-action/search?delivery_id=...&status=DELIVERED&finished_at_start=2026-05-01&finished_at_end=2026-05-31&limit=200&page=1
```

---

### Test Case 10.2: Request Parameters
**Verify parameters are correct:**

- [ ] `status` is either "DONE" or "DELIVERED" (not both in same request)
- [ ] `finished_at_start` is first day of month (YYYY-MM-01)
- [ ] `finished_at_end` is last day of month (YYYY-MM-DD)
- [ ] `limit` is 500 for user actions, 200 for delivery actions
- [ ] `page` starts at 1 and increments
- [ ] NO `sort` parameter (backend doesn't support it)
- [ ] NO `limit` parameter on `/game/actions` (backend doesn't support it)

---

## 11. Data Consistency

### Test Case 11.1: List vs Modal Consistency
**Steps:**
1. For each delivery in the list, note the action count
2. Open modal and count actions
3. Verify counts match

**Expected Results:**
- [ ] Action count in list = number of actions in modal
- [ ] No discrepancies between list and modal
- [ ] Both use same data source (DONE + DELIVERED actions)

---

### Test Case 11.2: Metrics Consistency
**Steps:**
1. Check "Finalizadas" count in metrics
2. Count actions in Clientes list
3. Verify they match

**Expected Results:**
- [ ] Total actions in Clientes list = "Finalizadas" count
- [ ] Points calculation is consistent
- [ ] Delivery count matches unique deliveries in list

---

## 12. Regression Testing

### Test Case 12.1: Existing Features Still Work
**Verify these features are not broken:**

- [ ] Login/logout works
- [ ] Navigation between dashboards works
- [ ] Month selector works
- [ ] Point wallet displays correctly
- [ ] Activity progress bars work
- [ ] Team management features work
- [ ] Ranking page works

---

### Test Case 12.2: Legacy Mode (if applicable)
**If there's a legacy mode without backend user actions:**

- [ ] Legacy mode still works
- [ ] Can switch between modes
- [ ] Data is consistent in both modes

---

## Test Summary Template

### Test Execution Summary

**Date:** ___________  
**Tester:** ___________  
**Environment:** ___________  
**Build Version:** ___________

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 Clientes List Loads | ⬜ Pass / ⬜ Fail | |
| 1.2 Clientes List Pagination | ⬜ Pass / ⬜ Fail | |
| 1.3 Clientes List Sorting | ⬜ Pass / ⬜ Fail | |
| 2.1 Modal Opens with Matching Data | ⬜ Pass / ⬜ Fail | |
| 2.2 Modal Shows Only Finished Actions | ⬜ Pass / ⬜ Fail | |
| 2.3 Modal with Multiple Deliveries | ⬜ Pass / ⬜ Fail | |
| 2.4 Modal with Dismissed Actions | ⬜ Pass / ⬜ Fail | |
| 3.1 Team Metrics Load | ⬜ Pass / ⬜ Fail | |
| 3.2 Team Clientes List | ⬜ Pass / ⬜ Fail | |
| 3.3 Team Modal Carteira | ⬜ Pass / ⬜ Fail | |
| 4.1 Activity Metrics | ⬜ Pass / ⬜ Fail | |
| 4.2 Activity List | ⬜ Pass / ⬜ Fail | |
| 5.1 Change Month | ⬜ Pass / ⬜ Fail | |
| 5.2 Month with No Actions | ⬜ Pass / ⬜ Fail | |
| 6.1 No Invalid Parameters | ⬜ Pass / ⬜ Fail | |
| 6.2 Network Failure Handling | ⬜ Pass / ⬜ Fail | |
| 7.1 Load Time | ⬜ Pass / ⬜ Fail | |
| 7.2 Large Dataset | ⬜ Pass / ⬜ Fail | |
| 8.1 User with No Email | ⬜ Pass / ⬜ Fail | |
| 8.2 Delivery with No Actions | ⬜ Pass / ⬜ Fail | |
| 8.3 Actions with Missing finished_at | ⬜ Pass / ⬜ Fail | |
| 8.4 Actions Finished Before Created | ⬜ Pass / ⬜ Fail | |
| 9.1 Expected Logs | ⬜ Pass / ⬜ Fail | |
| 9.2 Logs That Should NOT Appear | ⬜ Pass / ⬜ Fail | |
| 10.1 Correct API Endpoints | ⬜ Pass / ⬜ Fail | |
| 10.2 Request Parameters | ⬜ Pass / ⬜ Fail | |
| 11.1 List vs Modal Consistency | ⬜ Pass / ⬜ Fail | |
| 11.2 Metrics Consistency | ⬜ Pass / ⬜ Fail | |
| 12.1 Existing Features Still Work | ⬜ Pass / ⬜ Fail | |
| 12.2 Legacy Mode | ⬜ Pass / ⬜ Fail | |

**Overall Status:** ⬜ Pass / ⬜ Fail  
**Critical Issues Found:** ___________  
**Notes:** ___________

---

## Bug Report Template

If you find issues, use this template:

### Bug Report

**Bug ID:** ___________  
**Severity:** ⬜ Critical / ⬜ High / ⬜ Medium / ⬜ Low  
**Test Case:** ___________  

**Description:**
[Describe what went wrong]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Console Errors:**
```
[Paste console errors here]
```

**Network Errors:**
```
[Paste network errors here]
```

**Screenshots:**
[Attach screenshots if applicable]

**Environment:**
- Browser: ___________
- OS: ___________
- User: ___________

---

## Quick Smoke Test (5 minutes)

If you need a quick verification, run these critical tests:

1. **Load Dashboard** - Verify Clientes list loads
2. **Open Modal** - Click a delivery, verify modal shows actions
3. **Check Console** - No errors about "property limit/sort should not exist"
4. **Verify Counts** - List count matches modal count
5. **Check Network** - Requests use `status=DONE` and `status=DELIVERED`

If all 5 pass, the fix is working correctly! ✅
