

## Root Cause: Token Refresh Storm + Duplicate Profile Fetches

The auth logs reveal the smoking gun: **~50+ token refresh events within 2 seconds**, hitting **429 rate limits**. Here's the cascade:

1. Google OAuth callback redirects back to the app
2. Both `onAuthStateChange` AND `getSession()` fire simultaneously, both calling `setUser`/`setSession`
3. Each state update triggers `fetchUserProfile`, which makes Supabase API calls
4. Each API call can trigger token refresh → emits another `TOKEN_REFRESHED` event → triggers another `onAuthStateChange` → another profile fetch → **infinite loop**
5. Eventually hits 429 rate limit → Supabase may invalidate the session → `user` becomes null → ProtectedRoute redirects to `/login`

Additionally, the `admin_session_active` flag is only set in `Login.tsx`'s useEffect, but on OAuth redirect the user lands on `/` (not `/login`), so the flag may not be set before the admin session guard checks it.

## Fix (3 changes in `src/hooks/useAuth.tsx`)

### 1. Deduplicate profile fetches
Add a ref to track in-flight profile fetches. Skip if already fetching for the same user ID.

```typescript
const fetchingRef = useRef<string | null>(null);

const fetchUserProfile = async (userId: string, userEmail: string | undefined) => {
  if (fetchingRef.current === userId) return profile; // already fetching
  fetchingRef.current = userId;
  // ... existing logic
  fetchingRef.current = null;
  return profileData;
};
```

### 2. Skip redundant `getSession` profile fetch
In the `getSession().then(...)` block, only fetch profile if `onAuthStateChange` hasn't already handled it (check if user is already set):

```typescript
supabase.auth.getSession().then(({ data: { session } }) => {
  if (!isMounted) return;
  setSession(session);
  setUser(session?.user ?? null);
  
  if (session?.user) {
    // Only fetch if not already being fetched by onAuthStateChange
    if (!fetchingRef.current) {
      fetchUserProfile(session.user.id, session.user.email).then(p => {
        if (isMounted) setProfile(p);
      });
    }
  } else {
    setProfileLoading(false);
  }
  setLoading(false);
});
```

### 3. Set `admin_session_active` flag in `onAuthStateChange`
Set the session flag immediately when a SIGNED_IN or TOKEN_REFRESHED event fires, not just in Login.tsx:

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (!isMounted) return;
  
  // Set admin session flag on any successful auth event
  if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
    sessionStorage.setItem('admin_session_active', 'true');
  }
  
  setSession(session);
  setUser(session?.user ?? null);
  // ... rest unchanged
});
```

These three changes break the token refresh storm and ensure the session guard never fires prematurely.

