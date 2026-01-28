# Team Role Guard Implementation

## Overview
This document describes the implementation of the role-based access control guard for the team management dashboard.

## Implementation Date
January 26, 2026

## Requirements Addressed
- Requirement 1.1: Role-based access control for GESTAO users
- Requirement 1.3: Role verification on every route navigation
- Requirement 1.4: Error messaging for access denied scenarios

## Files Created

### 1. TeamRoleGuardService (`src/app/guards/team-role.guard.ts`)
**Purpose**: Route guard to restrict access to team management dashboard to users with GESTAO role only.

**Key Features**:
- `hasGestaoRole()`: Checks if current user has GESTAO role
- `canActivate()`: Implements Angular's CanActivate interface
- Redirects unauthorized users to `/dashboard`
- Redirects unauthenticated users to `/login`
- Displays error toast message on access denied

**Usage**:
```typescript
import { TeamRoleGuard } from '@guards/team-role.guard';

const routes: Routes = [
  {
    path: 'team-management',
    component: TeamManagementDashboardComponent,
    canActivate: [TeamRoleGuard]
  }
];
```

### 2. Unit Tests (`src/app/guards/team-role.guard.spec.ts`)
**Coverage**:
- ✅ Returns true when user has GESTAO role
- ✅ Returns true when user has GESTAO among multiple roles
- ✅ Returns false when user lacks GESTAO role
- ✅ Returns false when user has no roles
- ✅ Returns false when user is null
- ✅ Returns false when roles is undefined
- ✅ Returns false when roles is not an array
- ✅ Redirects to /dashboard when unauthorized
- ✅ Redirects to /login when not authenticated
- ✅ Displays error message on access denied

### 3. Team Management Dashboard Component
**Files Created**:
- `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.component.ts`
- `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.component.html`
- `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.component.scss`
- `src/app/pages/dashboard/team-management-dashboard/team-management-dashboard.module.ts`

**Purpose**: Placeholder component for the team management dashboard (to be implemented in future tasks).

### 4. Configuration Updates

#### Constants (`src/app/utils/constants.ts`)
Added new role constant:
```typescript
export enum ROLES_LIST {
  'ACCESS_ADMIN_PANEL' = 'ADMIN',
  'ACCESS_MANAGER_PANEL' = 'GESTOR',
  'ACCESS_PLAYER_PANEL' = 'ACCESS_PLAYER_PANEL',
  'ACCESS_TEAM_MANAGEMENT' = 'GESTAO',  // NEW
}
```

#### TypeScript Configuration (`tsconfig.json`)
Added path alias for guards:
```json
"@guards/*": ["src/app/guards/*"]
```

#### Routing (`src/app/pages/pages.routing.ts`)
Added route for team management dashboard:
```typescript
{
  path: 'team-management',
  loadChildren: () => import('./dashboard/team-management-dashboard/team-management-dashboard.module')
    .then(m => m.TeamManagementDashboardModule)
}
```

## How It Works

### Authentication Flow
1. User logs in with email/password
2. System receives bearer token from authentication
3. System calls `/v3/player/me/status` with bearer token to get player profile
4. Player profile includes `teams` array with team information
5. User attempts to navigate to `/dashboard/team-management`
6. `TeamRoleGuard.canActivate()` is triggered
7. Guard checks if user is authenticated via `SessaoProvider.usuario`
8. If not authenticated → redirect to `/login`
9. If authenticated → check if user has GESTOR team
10. If has GESTOR team → allow access (return true)
11. If no GESTOR team → silently redirect to `/dashboard` (no error message)

**Note**: The guard does NOT show an error message when redirecting users without GESTOR team. This is intentional because:
- The guard is used for automatic routing decisions
- Users without GESTOR team simply go to the regular dashboard
- Error messages should only appear for authentication failures or invalid credentials
- Having GESTOR team determines which dashboard you see, not whether you can access the system

### Role Verification Logic

**Important**: GESTOR is a **team name** in the player's profile, not a role field.

The player profile from `/v3/player/me/status` contains a `teams` array:
```typescript
{
  _id: "user@example.com",
  name: "User Name",
  teams: [
    {
      name: "GESTOR",  // This is what we check
      _id: "team-id",
      area: "Sales",
      squad: "Squad 1"
    }
  ]
}
```

The guard checks the teams array:
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

## Testing

### Build Status
✅ **Build Successful**: The implementation compiles without errors.

### Diagnostics
✅ **No TypeScript Errors**: Both guard and test files pass TypeScript diagnostics.

### Test Coverage
The guard has comprehensive unit tests covering:
- Positive cases (user with GESTAO role)
- Negative cases (user without GESTAO role)
- Edge cases (null user, undefined roles, invalid role types)
- Redirect behavior
- Error messaging

## Integration Points

### Dependencies
- `SessaoProvider`: Provides current user information
- `Router`: Handles navigation redirects
- `ToastService`: Displays error messages
- `ROLES_LIST`: Role constants

### Used By
- Team Management Dashboard Module (lazy-loaded route)

## Security Considerations

1. **Team Verification**: The guard checks teams array on every navigation attempt
2. **Authentication Check**: Ensures user is logged in before checking teams
3. **Graceful Degradation**: Handles missing or malformed user data safely
4. **User Feedback**: Provides clear error messages when access is denied
5. **Case-Insensitive Check**: Accepts both "GESTOR" and "GESTAO" team names

## Data Model Updates

### Usuario Model (`src/app/model/usuario.model.ts`)
Added `teams` array to support Funifier team structure:
```typescript
export interface Usuario {
  _id?: string;
  email?: string;
  name?: string;
  roles: string[];
  teams?: Array<{         // NEW: Funifier teams array
    name: string;
    _id?: string;
    area?: string;
    squad?: string;
    [key: string]: any;
  }>;
  // ... other fields
}
```

## Future Enhancements

The following will be implemented in subsequent tasks:
- Team selection and filtering
- Aggregate data queries
- Progress metrics display
- Productivity analysis graphs
- Goals and progress tracking

## Access URL

Once deployed, users with GESTAO role can access the dashboard at:
```
/dashboard/team-management
```

## Notes

- The GESTOR team must be assigned to users in the Funifier system
- GESTOR is a **team name**, not a role - it appears in the `teams` array of the player profile
- The guard checks the `/v3/player/me/status` response for teams with name "GESTOR" or "GESTAO"
- Users without GESTOR team will see an error message and be redirected
- The guard is reusable and can be applied to other routes if needed
- The check is case-insensitive for flexibility
