# Funifier Authentication Guide

## Overview
The Game4U dashboard now uses Funifier's authentication system for user login and session management.

## Authentication Flow

### 1. User Login
When a user logs in through the app's login page:

```typescript
// User enters email and password
const email = "user@example.com";
const password = "password123";

// AuthProvider sends request to Funifier
POST https://service2.funifier.com/v3/auth/token
Body: {
  "apiKey": "68ffd888e179d46fce277c00",
  "grant_type": "password",
  "username": "user@example.com",
  "password": "password123"
}
```

### 2. Funifier Response
Funifier returns a Bearer token:

```json
{
  "access_token": "eyJhbGciOiJIUzUxMiIsImNhbGciOiJHWklQIn0...",
  "token_type": "Bearer",
  "expires_in": 1695751444626
}
```

### 3. Token Storage
The token is stored in localStorage:
- `funifier_token` - The Bearer token
- `funifier_token_expiry` - Token expiration timestamp
- `funifier_user` - Username/email

### 4. Authenticated Requests
All subsequent API requests include the Bearer token:

```
GET https://service2.funifier.com/v3/player/me/status
Headers:
  Authorization: Bearer eyJhbGciOiJIUzUxMiIsImNhbGciOiJHWklQIn0...
  Content-Type: application/json
```

### 5. Token Expiry
When the token expires:
- User is redirected to login page
- Old token is cleared from localStorage
- User must re-authenticate

## Implementation Details

### Services Involved

#### 1. AuthProvider (`src/app/providers/auth/auth.provider.ts`)
- **Purpose:** Main authentication service used by the app
- **Methods:**
  - `login(email, password)` - Authenticates with Funifier
  - `userInfo()` - Gets user info from player status
  - `requestPasswordReset()` - Password reset (if supported)
  - `resetPassword()` - Confirm password reset

#### 2. FunifierApiService (`src/app/services/funifier-api.service.ts`)
- **Purpose:** Low-level Funifier API communication
- **Methods:**
  - `authenticate(credentials)` - Calls auth endpoint
  - `isAuthenticated()` - Checks if token is valid
  - `getToken()` - Returns current token
  - `clearAuth()` - Clears stored token
  - `get(endpoint)` - Authenticated GET request
  - `post(endpoint, body)` - Authenticated POST request

#### 3. AuthService (`src/app/services/auth.service.ts`)
- **Purpose:** Higher-level auth state management
- **Methods:**
  - `login(username, password)` - Login wrapper
  - `logout()` - Clears session
  - `isLoggedIn()` - Check login status
  - `getCurrentUser()` - Get current username
  - `getCurrentUser$()` - Observable of current user

### Token Management

#### Automatic Token Loading
On app initialization, the service checks localStorage:
```typescript
constructor() {
  this.loadStoredToken();
}

private loadStoredToken(): void {
  const token = localStorage.getItem('funifier_token');
  const expiry = localStorage.getItem('funifier_token_expiry');
  
  if (token && expiry && Date.now() < parseInt(expiry)) {
    this.authToken = token;
    this.tokenExpiry = parseInt(expiry);
  } else {
    this.clearAuth(); // Token expired
  }
}
```

#### Token Validation
Before each request, token validity is checked:
```typescript
isAuthenticated(): boolean {
  if (!this.authToken || !this.tokenExpiry) {
    return false;
  }
  return Date.now() < this.tokenExpiry;
}
```

## Testing Authentication

### Test Credentials
You'll need valid Funifier user credentials. Example:
```
Username: test@example.com
Password: testpassword123
```

### Testing Steps

1. **Start the app:**
   ```bash
   npm start
   ```

2. **Navigate to login page**

3. **Enter credentials and login**

4. **Check browser console:**
   ```
   ✓ Funifier authentication successful
   ✓ Token stored: eyJhbGci...
   ✓ Token expiry: 1695751444626
   ```

5. **Check localStorage:**
   - Open DevTools → Application → Local Storage
   - Verify `funifier_token` is present
   - Verify `funifier_token_expiry` is present
   - Verify `funifier_user` is present

6. **Test authenticated requests:**
   - Navigate to dashboard
   - Check Network tab for API calls
   - Verify `Authorization: Bearer ...` header is present

7. **Test token expiry:**
   - Manually set expiry to past date in localStorage
   - Refresh page
   - Should redirect to login

### Common Issues

#### Issue: "401 Unauthorized"
**Cause:** Invalid credentials or expired token  
**Solution:** 
- Verify username/password are correct
- Check if token has expired
- Try logging out and back in

#### Issue: "Token not being sent"
**Cause:** Token not loaded from localStorage  
**Solution:**
- Check browser console for errors
- Verify token exists in localStorage
- Check `isAuthenticated()` returns true

#### Issue: "CORS errors"
**Cause:** Browser blocking cross-origin requests  
**Solution:**
- Ensure Funifier API allows your domain
- Check CORS headers in response
- May need to configure Funifier CORS settings

## Security Considerations

### Token Storage
- Tokens are stored in localStorage (not sessionStorage)
- Tokens persist across browser sessions
- Tokens are cleared on logout

### Token Transmission
- Tokens sent via HTTPS only
- Tokens in Authorization header (not URL)
- Tokens never logged to console in production

### Token Expiry
- Tokens have expiration time
- Expired tokens automatically cleared
- User must re-authenticate after expiry

## Migration from Old Auth

### Before (Old Backend)
```typescript
POST http://localhost/auth/login
Body: { email, password }
Response: { access_token, refresh_token }
```

### After (Funifier)
```typescript
POST https://service2.funifier.com/v3/auth/token
Body: { apiKey, grant_type, username, password }
Response: { access_token, token_type, expires_in }
```

### Key Differences
1. **Endpoint:** Changed from `/auth/login` to `/v3/auth/token`
2. **API Key:** Now required in request body
3. **Grant Type:** Must specify "password"
4. **Username:** Field name changed from "email" to "username"
5. **No Refresh Token:** Funifier doesn't use refresh tokens (yet)

## Next Steps

1. **Test Login Flow:** Verify users can log in successfully
2. **Test Token Persistence:** Check token survives page refresh
3. **Test Token Expiry:** Verify expired tokens are handled
4. **Test Logout:** Ensure logout clears all data
5. **Add Error Handling:** Improve error messages for users
6. **Add Loading States:** Show loading during authentication

---

**Authentication is now fully integrated with Funifier! Users can log in and access their gamification data.**

