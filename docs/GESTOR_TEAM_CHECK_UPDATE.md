# GESTOR Team Check Update

## Overview
Updated the team role guard to check for GESTOR as a **team name** in the player's profile, rather than as a role. This aligns with the actual Funifier API structure where GESTOR is a team that players belong to.

## Date
January 27, 2026

## Changes Made

### 1. Team Role Guard (`src/app/guards/team-role.guard.ts`)

**Before**: Checked `user.roles` array for GESTAO role
```typescript
hasGestaoRole(): boolean {
  const user = this.sessao.usuario;
  
  if (!user || !user.roles || !Array.isArray(user.roles)) {
    return false;
  }

  return user.roles.some(role => 
    role && typeof role === 'string' && role.includes(ROLES_LIST.ACCESS_TEAM_MANAGEMENT)
  );
}
```

**After**: Checks `user.teams` array for GESTOR team name
```typescript
hasGestaoRole(): boolean {
  const user = this.sessao.usuario;
  
  if (!user) {
    return false;
  }

  // Check if user has teams array
  if (!user.teams || !Array.isArray(user.teams)) {
    return false;
  }

  // Check if any team has the name "GESTOR" or "GESTAO"
  return user.teams.some((team: any) => 
    team && team.name && 
    (team.name.toUpperCase() === 'GESTOR' || team.name.toUpperCase() === 'GESTAO')
  );
}
```

### 2. Usuario Model (`src/app/model/usuario.model.ts`)

Added `teams` array to support Funifier team structure:
```typescript
export interface Usuario {
  _id?: string;
  user_id?: string;
  created_at?: string;
  email?: string;
  avatar_url?: string;
  full_name?: string;
  name?: string;
  deactivated_at?: string | null;
  roles: string[];
  team_id?: number;
  extra?: Record<string, any>;
  pointCategories?: Record<string, number>;
  teams?: Array<{         // NEW: Funifier teams array
    name: string;
    _id?: string;
    area?: string;
    squad?: string;
    [key: string]: any;
  }>;
}
```

### 3. Documentation Updates

Updated `docs/TEAM_ROLE_GUARD_IMPLEMENTATION.md` to reflect:
- GESTOR is a team name, not a role
- Authentication flow includes `/v3/player/me/status` call
- Team verification logic explanation
- Data model updates
- Security considerations

## How It Works

### API Response Structure

When a player logs in, the system calls `/v3/player/me/status` with the bearer token. The response includes:

```json
{
  "_id": "user@example.com",
  "name": "User Name",
  "teams": [
    {
      "name": "GESTOR",
      "_id": "team-id",
      "area": "Sales",
      "squad": "Squad 1"
    }
  ],
  "extra": { ... },
  "point_categories": { ... }
}
```

### Authentication Flow

1. User logs in with email/password
2. System receives bearer token
3. System calls `/v3/player/me/status` with bearer token
4. Response includes player profile with `teams` array
5. `SessaoProvider` stores user data including teams
6. When user navigates to team management dashboard:
   - `TeamRoleGuard` checks if user has teams array
   - Looks for team with name "GESTOR" or "GESTAO" (case-insensitive)
   - If found, allows access
   - If not found, redirects to regular dashboard with error message

## Benefits

1. **Accurate Role Checking**: Aligns with actual Funifier API structure
2. **Flexible Matching**: Accepts both "GESTOR" and "GESTAO" team names
3. **Case-Insensitive**: Works regardless of team name casing
4. **Type Safety**: Updated Usuario model provides proper TypeScript types
5. **Clear Documentation**: Updated docs explain the team-based approach

## Testing Considerations

When testing the team management dashboard:
- Ensure test users have a team with name "GESTOR" in their Funifier profile
- The team must be present in the `/v3/player/me/status` response
- Users without GESTOR team will be denied access

## Migration Notes

No migration is needed for existing users. The change is purely in how we check for access:
- **Before**: Looked for GESTAO in roles array
- **After**: Looks for GESTOR in teams array

Ensure that users who should have access to the team management dashboard have the GESTOR team assigned in Funifier.

## Related Files

- `src/app/guards/team-role.guard.ts` - Updated guard logic
- `src/app/model/usuario.model.ts` - Added teams array
- `docs/TEAM_ROLE_GUARD_IMPLEMENTATION.md` - Updated documentation
- `src/app/providers/sessao/sessao.provider.ts` - Stores user data with teams
- `src/app/services/player-mapper.service.ts` - Maps player data including teams

## Verification

To verify the implementation:
1. Build completes successfully ✅
2. No TypeScript diagnostics errors ✅
3. Guard checks teams array instead of roles ✅
4. Usuario model includes teams property ✅
5. Documentation updated ✅
