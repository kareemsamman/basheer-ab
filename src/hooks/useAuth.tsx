import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const SUPER_ADMIN_EMAIL = 'morshed500@gmail.com';

const normalizeEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() ?? '';

const isSuperAdminEmail = (email: string | null | undefined) =>
  normalizeEmail(email) === normalizeEmail(SUPER_ADMIN_EMAIL);

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  status: 'pending' | 'active' | 'blocked';
  avatar_url: string | null;
  branch_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isReady: boolean;
  profileLoading: boolean;
  isActive: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  branchId: string | null;
  branchName: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [branchName, setBranchName] = useState<string | null>(null);

  const resolvedUserEmail = user?.email ?? profile?.email ?? null;

  // Super admin check based on email - this is the authoritative check
  const isSuperAdmin = isSuperAdminEmail(resolvedUserEmail);

  const fetchingRef = useRef<string | null>(null);

  const fetchUserProfile = async (userId: string, userEmail: string | undefined) => {
    // Deduplicate: skip if already fetching for this user
    if (fetchingRef.current === userId) return profile;
    fetchingRef.current = userId;
    setProfileLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        setProfileLoading(false);
        fetchingRef.current = null;
        return null;
      }

      // Check if user has admin role OR is super admin
      const isSuperAdminUser = isSuperAdminEmail(userEmail || profileData?.email || null);
      
      if (isSuperAdminUser) {
        setIsAdmin(true);
      } else {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .single();

        setIsAdmin(!!roleData);
      }

      // Fetch branch name if user has a branch
      if (profileData.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name_ar, name')
          .eq('id', profileData.branch_id)
          .single();
        
        if (branchData) {
          setBranchName(branchData.name_ar || branchData.name);
        }
      } else {
        setBranchName(null);
      }

      setProfileLoading(false);
      fetchingRef.current = null;
      return profileData as UserProfile;
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setProfileLoading(false);
      fetchingRef.current = null;
      return null;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setBranchName(null);
  };

  useEffect(() => {
    let isMounted = true;

    // Single initialization source: onAuthStateChange handles everything.
    // We do NOT call getSession() separately — doing so races with
    // onAuthStateChange and causes duplicate token refreshes that
    // exhaust the refresh token, leading to SIGNED_OUT.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        // TOKEN_REFRESHED: Supabase manages tokens internally.
        // Updating React state here causes cascading re-renders/queries
        // that trigger more refreshes, exhausting the refresh token.
        if (event === 'TOKEN_REFRESHED') {
          return;
        }

        // Keep session guard flag synced
        if (session) {
          try { sessionStorage.setItem('admin_session_active', 'true'); } catch {}
        }

        setSession(session);
        setUser(session?.user ?? null);

        // INITIAL_SESSION = initialization complete (page load / OAuth redirect)
        if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            setTimeout(() => {
              if (isMounted) {
                fetchUserProfile(session.user.id, session.user.email).then(p => {
                  if (isMounted) setProfile(p);
                });
              }
            }, 0);
          } else {
            setProfileLoading(false);
          }
          setIsReady(true);
          setLoading(false);
          return;
        }

        // SIGNED_IN / USER_UPDATED: refetch profile
        if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
          setTimeout(() => {
            if (isMounted) {
              fetchUserProfile(session.user.id, session.user.email).then(p => {
                if (isMounted) setProfile(p);
              });
            }
          }, 0);
        }

        // SIGNED_OUT: clear everything
        if (!session?.user) {
          setProfile(null);
          setIsAdmin(false);
          setBranchName(null);
          setProfileLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Admin session guard - force logout for non-super admins on new browser session
  useEffect(() => {
    const SESSION_KEY = 'admin_session_active';
    const effectiveEmail = user?.email ?? profile?.email ?? null;
    const canEvaluateAdminGuard = Boolean(effectiveEmail);
    const isNonSuperAdmin = canEvaluateAdminGuard && !isSuperAdminEmail(effectiveEmail) && isAdmin;

    if (!isReady || !session || !user || !isNonSuperAdmin) {
      return;
    }

    // Skip guard if sessionStorage is not available (e.g. restricted iframe)
    let wasActive: string | null = null;
    try {
      wasActive = sessionStorage.getItem(SESSION_KEY);
    } catch {
      // sessionStorage blocked (iframe restriction) - skip guard entirely
      return;
    }

    if (!wasActive) {
      // This is a new browser session after browser was closed - force logout
      console.log('[AdminSessionGuard] New browser session detected for admin, forcing logout');
      supabase.auth.signOut().then(() => {
        window.location.href = '/login';
      });
      return;
    }

    // Keep session flag active
    try { sessionStorage.setItem(SESSION_KEY, 'true'); } catch {}
  }, [isReady, session, user, profile?.email, isAdmin]);

  // CRITICAL: Super admin and admins bypass status checks entirely
  // Order: super admin → admin → active status
  const isActive = isSuperAdmin || isAdmin || profile?.status === 'active';

  // User's branch - admins can see all, workers only their branch
  const branchId = profile?.branch_id || null;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      isReady,
      profileLoading,
      isActive,
      isAdmin: isAdmin || isSuperAdmin,
      isSuperAdmin,
      branchId,
      branchName,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
