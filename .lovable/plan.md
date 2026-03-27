

## Fix: Admin Users Page Shows 0 Users

### Root Cause Analysis

The database has **11 profiles** and the RLS policies are correctly configured. The super admin (`morshed500@gmail.com`) has an `admin` role in `user_roles`, and the `has_role` SECURITY DEFINER function works properly.

The most likely cause is a **race condition**: when the super admin logs in, `isAdmin` becomes `true` (via the `isSuperAdmin` check on `user.email`) before the Supabase client's session/JWT is fully established internally. The `fetchUsers` query fires immediately but the Supabase client sends the request without a valid JWT, so the RLS `has_role(auth.uid(), 'admin')` check fails (because `auth.uid()` is null), returning an empty result set with no error.

### Fix

**File: `src/pages/AdminUsers.tsx`**

1. Add the `session` from `useAuth` to the dependency check — only fetch when both `isAdmin` AND `session` are available:

```typescript
const { isAdmin, loading: authLoading, session } = useAuth();

useEffect(() => {
  if (isAdmin && session) {
    fetchUsers();
  }
}, [isAdmin, session]);
```

2. Add error logging inside `fetchUsers` to catch silent failures:

```typescript
const fetchUsers = async () => {
  setLoading(true);
  try {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.error('Profiles fetch error:', profilesError);
      throw profilesError;
    }
    
    console.log('Fetched profiles count:', profiles?.length);
    // ... rest unchanged
```

**File: `src/hooks/useAuth.tsx`**

3. Ensure `session` is exposed in the context (it already is), and ensure the `admin_session_active` flag is set for super admin too in `Login.tsx` — currently it's only set for non-super-admins, which could cause issues on page refresh:

**File: `src/pages/Login.tsx`** (line ~45)

Change the session flag logic to set it for ALL authenticated users:
```typescript
sessionStorage.setItem('admin_session_active', 'true');
```

This ensures `fetchUsers` only runs after the Supabase client has a valid JWT, so the RLS policies can identify the user as admin.

