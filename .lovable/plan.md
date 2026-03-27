

## Fix Login → Dashboard → Login Redirect Loop

### Root Cause

The auth logs show a **token refresh storm**: dozens of `token_revoked` + `TOKEN_REFRESHED` events per second, hitting **429 rate limits**. This happens because:

1. On mount, both `getSession()` AND `onAuthStateChange()` fire and both call `setUser()` + `fetchUserProfile()`
2. Each state update causes re-renders, which can trigger more token refreshes
3. Eventually the 429 rate limit causes a token refresh to fail, the session becomes invalid, and `ProtectedRoute` redirects to `/login`
4. `/login` detects no user → stays. But Supabase retries token refresh, succeeds → user appears → navigate to `/` → loop restarts

### Fix (single file: `src/hooks/useAuth.tsx`)

**1. Deduplicate `getSession` vs `onAuthStateChange`**
- Add a `ref` flag (`initialSessionHandled`) so `getSession()` only processes if `onAuthStateChange` hasn't already fired
- This prevents double profile fetches and double state updates on initial load

**2. Deduplicate profile fetches**
- Add a `ref` to track the current profile fetch user ID, skip if already fetching for the same user
- Prevents concurrent profile fetch calls that waste network and cause extra re-renders

**3. Set `loading = false` only once**
- Use a ref to ensure we don't re-trigger state transitions after the initial resolution

**4. Always set `admin_session_active` for ALL authenticated users on auth events** (not just non-super-admins)
- The guard already skips super admin, so setting the flag for everyone is harmless and prevents edge cases

### Technical Details

```text
Current flow (broken):
  mount → getSession() ──→ setUser + fetchProfile ──→ re-render
       → onAuthStateChange ──→ setUser + fetchProfile ──→ re-render
       → TOKEN_REFRESHED ──→ setUser + fetchProfile ──→ re-render
       → TOKEN_REFRESHED ──→ 429 error ──→ session lost ──→ /login

Fixed flow:
  mount → onAuthStateChange(INITIAL_SESSION) ──→ setUser + fetchProfile (once)
       → getSession() ──→ skipped (already handled)
       → TOKEN_REFRESHED ──→ update session only (no re-fetch profile)
```

Key changes in `useAuth.tsx`:
- `initialSessionHandled` ref to skip `getSession` result if auth listener already fired
- `currentProfileUserId` ref to skip redundant profile fetches
- On `TOKEN_REFRESHED`: only update session/user, do NOT re-fetch profile (it hasn't changed)
- `loading` set to false via ref guard (only once)

