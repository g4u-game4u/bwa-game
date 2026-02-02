# Team Role Guard Implementation

## Overview
This document describes the implementation of the team-based access control guard for the team management dashboard.

## Implementation Date
January 26, 2026 (Updated: February 2, 2026)

## Requirements Addressed
- Requirement 1.1: Team-based access control for GESTAO users
- Requirement 1.3: Team verification on every route navigation
- Requirement 1.4: Silent redirection for unauthorized access

## Files Updated

### 1. TeamRoleGuardService (`src/app/guards/team-role.guard.ts`)
**Purpose**: Route guard to restrict access to team management dashboard to users belonging to the GESTAO team (ID: FkgMSNO) only.

**Key Features**:
- `hasGestaoRole()`: Checks if current user belongs to GESTAO team (ID: FkgMSNO)
- `canActivate()`: Implements Angular's CanActivate interface
- Redirects unauthorized users to `/dashboard`
- Redirects unauthenticated users to `/login`
- Silent redirection (no error messages for team-based access control)

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
- ✅ Returns true when user belongs to GESTAO team (FkgMSNO)
- ✅ Returns true when user belongs to GESTAO among multiple teams
- ✅ Returns false when user doesn't belong to GESTAO team
- ✅ Returns false when user has no teams
- ✅ Returns false when user is null
- ✅ Returns false when teams is undefined
- ✅ Returns false when teams is not an array
- ✅ Redirects to /dashboard when unauthorized
- ✅ Redirects to /login when not authenticated
- ✅ Silent redirection (no error messages)

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
9. If authenticated → check if user belongs to GESTAO team (ID: FkgMSNO)
10. If belongs to GESTAO team → allow access (return true)
11. If doesn't belong to GESTAO team → silently redirect to `/dashboard`

**Note**: The guard does NOT show an error message when redirecting users without GESTAO team. This is intentional because:
- The guard is used for automatic routing decisions
- Users without GESTAO team simply go to the regular dashboard
- Error messages should only appear for authentication failures or invalid credentials
- Having GESTAO team membership determines which dashboard you see, not whether you can access the system

### Team Verification Logic

**Important**: GESTOR is determined by **team membership** with the specific team ID "FkgMSNO" (GESTAO team).

The player profile from `/v3/player/me/status` contains a `teams` array:
```typescript
{
  _id: "user@example.com",
  name: "User Name",
  teams: [
    {
      _id: "FkgMSNO",  // This is what we check
      name: "GESTAO",
      area: "Management",
      squad: "Leadership"
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

  // Check if any team has the ID "FkgMSNO" (GESTAO team)
  return user.teams.some((team: any) => 
    team && team._id === 'FkgMSNO'
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

1. **Team ID Verification**: The guard checks for specific team ID "FkgMSNO" on every navigation attempt
2. **Authentication Check**: Ensures user is logged in before checking team membership
3. **Graceful Degradation**: Handles missing or malformed user data safely
4. **Silent Redirection**: No error messages for team-based access control (UX improvement)
5. **Exact Match**: Uses exact team ID matching for security (no case-insensitive checks needed)

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

- Users must be assigned to the GESTAO team (ID: FkgMSNO) in the Funifier system
- GESTOR is determined by **team membership**, not a role - it checks for team ID "FkgMSNO"
- The guard checks the `/v3/player/me/status` response for teams with ID "FkgMSNO"
- Users without GESTAO team membership will be silently redirected (no error message)
- The guard is reusable and can be applied to other routes if needed
- The check uses exact team ID matching for security and reliability
