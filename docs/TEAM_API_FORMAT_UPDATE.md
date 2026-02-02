# Team API Format Update

## Overview
Updated the team role guard to handle the correct API response format where teams are returned as a simple array of team IDs, not as objects with `_id` and `name` properties.

## Date
February 2, 2026

## Problem
The team role guard was expecting teams to be returned as objects:
```typescript
teams: [
  { _id: 'FkgMSNO', name: 'GESTAO' },
  { _id: 'other-team', name: 'Other Team' }
]
```

But the actual API response format is a simple array of team IDs:
```typescript
teams: ['FkgMSNO', 'other-team-id']
```

## Solution
Updated the `hasGestaoRole()` method to use `Array.includes()` instead of `Array.some()` with object property checking.

## Files Modified

### 1. `src/app/guards/team-role.guard.ts`

**Before:**
```typescript
return user.teams.some((team: any) => 
  team && team._id === 'FkgMSNO'
);
```

**After:**
```typescript
return user.teams.includes('FkgMSNO');
```

**Benefits:**
- Simpler and more efficient code
- Matches actual API response format
- No need for object property checking
- Better performance with direct array search

### 2. `src/app/guards/team-role.guard.spec.ts`

**Updated all test cases to use simple array format:**

**Before:**
```typescript
teams: [
  { _id: 'FkgMSNO', name: 'GESTAO' },
  { _id: 'other-team', name: 'Other Team' }
]
```

**After:**
```typescript
teams: ['FkgMSNO', 'other-team']
```

**Added new test case:**
- Test for invalid team array containing non-string values

### 3. Documentation Updates

**Updated files:**
- `docs/TEAM_ROLE_GUARD_IMPLEMENTATION.md`
- `docs/GESTOR_TEAM_CHECK_UPDATE.md`

**Changes:**
- Corrected API response format examples
- Updated code examples to show `includes()` method
- Simplified team structure documentation

## API Response Format

### Correct Format (Now Supported):
```typescript
{
  _id: "user@example.com",
  name: "User Name",
  teams: ["FkgMSNO", "other-team-id"]  // Array of team IDs
}
```

### Previous Incorrect Assumption:
```typescript
{
  _id: "user@example.com",
  name: "User Name",
  teams: [
    { _id: "FkgMSNO", name: "GESTAO" },
    { _id: "other-team", name: "Other Team" }
  ]
}
```

## Logic Flow

### Updated Team Verification Process:
1. Check if user is authenticated
2. Check if user has `teams` array property
3. Check if `teams` is actually an array
4. Use `teams.includes('FkgMSNO')` to check for GESTAO team membership
5. Grant/deny access based on result

### Code Comparison:

**Old Logic (Complex):**
```typescript
return user.teams.some((team: any) => 
  team && team._id === 'FkgMSNO'
);
```

**New Logic (Simple):**
```typescript
return user.teams.includes('FkgMSNO');
```

## Testing Results

### Unit Tests:
All tests pass with the new simple array format:

```
✅ PASS User with GESTAO team (simple array): true
✅ PASS User without GESTAO team: false
✅ PASS User with only GESTAO team: true
✅ PASS User with empty teams: false
```

### TypeScript Compilation:
✅ No compilation errors
✅ All diagnostics pass

## Benefits of the Update

1. **Accuracy**: Matches actual API response format
2. **Simplicity**: Much simpler code with `includes()` method
3. **Performance**: Direct array search is faster than object iteration
4. **Maintainability**: Easier to understand and modify
5. **Reliability**: No risk of undefined property access

## Impact Assessment

### Positive Impact:
- Correct handling of actual API response format
- Improved code performance and readability
- More reliable team membership checking

### No Breaking Changes:
- Same public API (`hasGestaoRole()` method)
- Same routing behavior
- Same user experience

## Verification

To verify the updated functionality:

1. **Check API Response Format:**
   ```javascript
   // Call /v3/player/me/status
   // Verify teams is an array of strings: ["FkgMSNO", "other-team"]
   ```

2. **Test GESTOR Access:**
   ```javascript
   const hasGestorAccess = user.teams?.includes('FkgMSNO');
   ```

3. **Manual Testing:**
   - User with `teams: ['FkgMSNO']` → Should have GESTOR access
   - User with `teams: ['other-team']` → Should NOT have GESTOR access
   - User with `teams: []` → Should NOT have GESTOR access

## Future Considerations

- The team ID "FkgMSNO" remains the canonical identifier for GESTAO team
- Any future team-based features should expect simple array format
- Consider adding type definitions for the teams array if needed

## Deployment Notes

- No database changes required
- No API changes required (this fixes a client-side assumption)
- No environment configuration changes needed
- Backward compatible with existing authentication system
- Users with GESTAO team membership will continue to work correctly

This update ensures the team role guard correctly handles the actual API response format and provides more efficient team membership checking.