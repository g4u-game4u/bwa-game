# Team Management Dashboard - Role Configuration Guide

This guide explains how to configure and assign the GESTAO role required to access the Team Management Dashboard.

## Table of Contents

1. [Overview](#overview)
2. [Understanding the GESTAO Role](#understanding-the-gestao-role)
3. [Role Storage in Funifier](#role-storage-in-funifier)
4. [Assigning the GESTAO Role](#assigning-the-gestao-role)
5. [Verifying User Roles](#verifying-user-roles)
6. [Troubleshooting Role Access](#troubleshooting-role-access)
7. [Security Considerations](#security-considerations)
8. [Role Management Best Practices](#role-management-best-practices)

## Overview

The Team Management Dashboard is protected by role-based access control (RBAC). Only users with the **GESTAO** (management) role can access this dashboard. This ensures that sensitive team-level aggregate data is only visible to authorized managers.

### Key Concepts

- **GESTAO Role**: Management role that grants access to team-level data
- **Role Guard**: Angular route guard that checks for the GESTAO role
- **Funifier API**: Stores user roles in the player's `extra` field
- **Session Provider**: Caches user information including roles

## Understanding the GESTAO Role

### What is GESTAO?

- **Name**: GESTAO (Portuguese for "management")
- **Purpose**: Grants access to team management and supervisory features
- **Scope**: Team-level aggregate data visibility
- **Permissions**: View team metrics, collaborator data, and historical trends

### What GESTAO Does NOT Grant

- **Admin Access**: Does not provide system administration capabilities
- **Data Modification**: Cannot modify team data or configurations
- **User Management**: Cannot create or delete users
- **System Settings**: Cannot change system-wide settings

### Role Hierarchy

```
System Administrator
    ├── GESTAO (Manager)
    │   └── Can view team data
    └── Regular User
        └── Can view personal data only
```

## Role Storage in Funifier

### Data Structure

Roles are stored in the Funifier player object's `extra` field:

```json
{
  "id": "user@example.com",
  "name": "John Manager",
  "email": "user@example.com",
  "extra": {
    "roles": ["GESTAO"],
    "teams": ["Departamento Pessoal", "Financeiro"],
    "department": "Management"
  }
}
```

### Field Details

- **extra.roles**: Array of role strings
- **extra.teams**: Array of team names the manager can access (optional)
- **extra.department**: User's department (optional)

### API Endpoint

Roles are fetched via the Funifier API:

```
GET /v3/player/{userId}
```

Response includes the `extra` field with roles.

## Assigning the GESTAO Role

### Method 1: Via Funifier Dashboard (Recommended)

1. **Log into Funifier Dashboard**:
   - Navigate to https://funifier.com
   - Log in with administrator credentials

2. **Navigate to Players**:
   - Click on "Players" in the main menu
   - Search for the user by email or name

3. **Edit Player**:
   - Click on the player's name to open their profile
   - Scroll to the "Extra Fields" section

4. **Add GESTAO Role**:
   - Find or create the `roles` field
   - Add "GESTAO" to the roles array
   - Format: `["GESTAO"]` or `["GESTAO", "OTHER_ROLE"]`

5. **Add Team Assignments** (Optional):
   - Find or create the `teams` field
   - Add team names the manager should access
   - Format: `["Departamento Pessoal", "Financeiro"]`

6. **Save Changes**:
   - Click "Save" or "Update Player"
   - Changes take effect immediately

### Method 2: Via Funifier API

Use the Funifier API to programmatically assign roles:

```bash
curl -X PUT https://api.funifier.com/v3/player/user@example.com \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "extra": {
      "roles": ["GESTAO"],
      "teams": ["Departamento Pessoal", "Financeiro"]
    }
  }'
```

### Method 3: Bulk Assignment via CSV Import

1. **Prepare CSV File**:
```csv
email,roles,teams
manager1@example.com,"[""GESTAO""]","[""Departamento Pessoal""]"
manager2@example.com,"[""GESTAO""]","[""Financeiro"", ""Comercial""]"
```

2. **Import via Funifier Dashboard**:
   - Navigate to Players > Import
   - Upload CSV file
   - Map columns to player fields
   - Confirm import

### Method 4: Via Custom Admin Interface

If you have a custom admin interface:

```typescript
// Example Angular service method
assignGestaoRole(userId: string, teams: string[]): Observable<any> {
  const updateData = {
    extra: {
      roles: ['GESTAO'],
      teams: teams
    }
  };
  
  return this.http.put(`/v3/player/${userId}`, updateData);
}
```

## Verifying User Roles

### Method 1: Check in Application

1. **Log in as the User**:
   - Log into the Game4U application with the user's credentials

2. **Check Navigation Menu**:
   - If GESTAO role is assigned, "Gestão de Equipe" option appears in menu
   - If not assigned, option is hidden

3. **Try Accessing Dashboard**:
   - Navigate to `/team-management`
   - If role is assigned: Dashboard loads
   - If not assigned: Redirected to personal dashboard with error message

### Method 2: Check via Browser Console

1. **Open Browser Console** (F12)

2. **Check Session Data**:
```javascript
// In browser console
console.log(sessionStorage.getItem('user'));
// Look for "roles": ["GESTAO"] in the output
```

3. **Check Local Storage**:
```javascript
// In browser console
console.log(localStorage.getItem('currentUser'));
```

### Method 3: Check via Funifier API

```bash
curl -X GET https://api.funifier.com/v3/player/user@example.com \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Look for the `extra.roles` field in the response.

### Method 4: Check via Application Logs

Enable debug logging in the application:

```typescript
// In browser console
localStorage.setItem('debug', 'true');
```

Then check console logs for role verification messages:
```
[TeamRoleGuard] Checking GESTAO role for user@example.com
[TeamRoleGuard] User has roles: ["GESTAO"]
[TeamRoleGuard] Access granted
```

## Troubleshooting Role Access

### Issue 1: "Access Denied" Despite Having GESTAO Role

**Symptoms**:
- User has GESTAO role in Funifier
- Still sees "Access Denied" message

**Possible Causes**:
1. **Cached Session Data**: Old session without role
2. **Role Format**: Incorrect role format in Funifier
3. **Case Sensitivity**: Role stored as "gestao" instead of "GESTAO"

**Solutions**:

1. **Clear Session and Re-login**:
```typescript
// User should log out and log back in
localStorage.clear();
sessionStorage.clear();
// Then log in again
```

2. **Verify Role Format**:
```json
// ✅ Correct
"extra": {
  "roles": ["GESTAO"]
}

// ❌ Incorrect
"extra": {
  "roles": "GESTAO"  // Should be array
}

// ❌ Incorrect
"extra": {
  "role": ["GESTAO"]  // Should be "roles" (plural)
}
```

3. **Check Case Sensitivity**:
```json
// ✅ Correct
"roles": ["GESTAO"]

// ❌ Incorrect
"roles": ["gestao"]  // Wrong case
"roles": ["Gestao"]  // Wrong case
```

### Issue 2: Role Not Appearing After Assignment

**Symptoms**:
- Role assigned in Funifier
- Not reflected in application

**Solutions**:

1. **Wait for Cache Expiration**:
   - Session cache may take up to 5 minutes to expire
   - Force refresh by logging out and back in

2. **Clear Application Cache**:
```typescript
// In browser console
localStorage.clear();
sessionStorage.clear();
location.reload();
```

3. **Verify API Response**:
```bash
# Check if Funifier API returns the role
curl -X GET https://api.funifier.com/v3/player/user@example.com \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Issue 3: Multiple Roles Conflict

**Symptoms**:
- User has multiple roles
- GESTAO role not being recognized

**Solution**:

Ensure roles array is properly formatted:
```json
// ✅ Correct
"extra": {
  "roles": ["GESTAO", "ADMIN", "USER"]
}

// ❌ Incorrect
"extra": {
  "roles": ["GESTAO,ADMIN,USER"]  // Should be separate array items
}
```

### Issue 4: Role Guard Not Checking Correctly

**Symptoms**:
- Role is assigned correctly
- Route guard still denies access

**Debug Steps**:

1. **Check Route Configuration**:
```typescript
// Verify route has guard
{
  path: 'team-management',
  component: TeamManagementDashboardComponent,
  canActivate: [TeamRoleGuardService]  // Guard must be present
}
```

2. **Check Guard Implementation**:
```typescript
// TeamRoleGuardService should check for GESTAO
hasGestaoRole(): Observable<boolean> {
  return this.authService.getCurrentUser().pipe(
    map(user => {
      const roles = user?.extra?.roles || [];
      return roles.includes('GESTAO');  // Exact match
    })
  );
}
```

3. **Enable Debug Logging**:
```typescript
// Add console logs to guard
console.log('User roles:', user?.extra?.roles);
console.log('Has GESTAO:', roles.includes('GESTAO'));
```

## Security Considerations

### Principle of Least Privilege

- Only assign GESTAO role to users who need team-level access
- Regularly review role assignments
- Remove role when no longer needed

### Role Assignment Audit

Keep track of role assignments:

```typescript
// Log role assignments
interface RoleAssignment {
  userId: string;
  role: string;
  assignedBy: string;
  assignedAt: Date;
  reason: string;
}

// Store in audit log
const assignment: RoleAssignment = {
  userId: 'user@example.com',
  role: 'GESTAO',
  assignedBy: 'admin@example.com',
  assignedAt: new Date(),
  reason: 'Promoted to team manager'
};
```

### Data Access Implications

Users with GESTAO role can:
- ✅ View aggregate team metrics
- ✅ View individual collaborator data
- ✅ Export team reports (if enabled)
- ❌ Modify team data
- ❌ Delete records
- ❌ Access other teams' data (unless explicitly assigned)

### Team Scope Limitation

Limit managers to specific teams:

```json
{
  "extra": {
    "roles": ["GESTAO"],
    "teams": ["Departamento Pessoal"]  // Only this team
  }
}
```

Then check team access in the application:
```typescript
canAccessTeam(teamId: string): boolean {
  const user = this.sessaoProvider.usuario;
  const allowedTeams = user?.extra?.teams || [];
  
  // If no teams specified, allow all
  if (allowedTeams.length === 0) return true;
  
  // Check if team is in allowed list
  return allowedTeams.includes(teamId);
}
```

## Role Management Best Practices

### 1. Document Role Assignments

Maintain a spreadsheet or database of role assignments:

| User Email | Role | Teams | Assigned Date | Assigned By | Notes |
|------------|------|-------|---------------|-------------|-------|
| manager1@example.com | GESTAO | Dept. Pessoal | 2024-01-15 | admin@example.com | New team lead |

### 2. Regular Role Audits

- Review role assignments quarterly
- Remove roles for users who changed positions
- Verify team assignments are still accurate

### 3. Onboarding Process

When promoting a user to manager:

1. Assign GESTAO role in Funifier
2. Assign specific teams they'll manage
3. Send welcome email with dashboard link
4. Provide training on dashboard usage
5. Document assignment in audit log

### 4. Offboarding Process

When a manager leaves or changes roles:

1. Remove GESTAO role from Funifier
2. Clear team assignments
3. Document removal in audit log
4. Verify they can no longer access dashboard

### 5. Testing Role Changes

After assigning or removing roles:

1. Have the user log out and log back in
2. Verify navigation menu shows/hides correctly
3. Test dashboard access
4. Verify team data visibility

### 6. Role Naming Convention

Use consistent role names:
- ✅ "GESTAO" (all caps, Portuguese)
- ❌ "gestao", "Gestao", "MANAGER", "manager"

### 7. Backup Role Data

Regularly backup role assignments:

```bash
# Export all players with GESTAO role
curl -X GET "https://api.funifier.com/v3/player?filter=extra.roles:GESTAO" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  > gestao_users_backup.json
```

## API Reference

### Get User Roles

```typescript
getUserRoles(userId: string): Observable<string[]> {
  return this.http.get<Player>(`/v3/player/${userId}`).pipe(
    map(player => player.extra?.roles || [])
  );
}
```

### Assign Role

```typescript
assignRole(userId: string, role: string): Observable<void> {
  return this.getUserRoles(userId).pipe(
    switchMap(currentRoles => {
      const updatedRoles = [...currentRoles, role];
      return this.http.put(`/v3/player/${userId}`, {
        extra: { roles: updatedRoles }
      });
    })
  );
}
```

### Remove Role

```typescript
removeRole(userId: string, role: string): Observable<void> {
  return this.getUserRoles(userId).pipe(
    switchMap(currentRoles => {
      const updatedRoles = currentRoles.filter(r => r !== role);
      return this.http.put(`/v3/player/${userId}`, {
        extra: { roles: updatedRoles }
      });
    })
  );
}
```

### Check Role

```typescript
hasRole(userId: string, role: string): Observable<boolean> {
  return this.getUserRoles(userId).pipe(
    map(roles => roles.includes(role))
  );
}
```

## Additional Resources

- [Manager Usage Guide](TEAM_DASHBOARD_MANAGER_GUIDE.md)
- [Troubleshooting Guide](TEAM_DASHBOARD_TROUBLESHOOTING.md)
- [Funifier API Documentation](https://funifier.com/docs)
- [TeamRoleGuard Source Code](../src/app/guards/team-role.guard.ts)

## Support

For role configuration issues:

1. Check this guide first
2. Review troubleshooting section
3. Contact your Funifier administrator
4. Reach out to technical support with:
   - User email
   - Expected role
   - Current role (from API)
   - Error messages
   - Screenshots

---

**Last Updated**: January 2024  
**Version**: 1.0  
**For**: Game4U Team Management Dashboard
