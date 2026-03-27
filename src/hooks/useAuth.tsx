import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const SUPER_ADMIN_EMAIL = 'morshed500@gmail.com';
const SESSION_KEY = 'admin_session_active';

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
  const [profileLoading, setProfileLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [branchName, setBranchName] = useState<string | null>(null);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  // Auth/profile flow refs
  const hasHandledInitialAuth = useRef(false);
  const loadingResolved = useRef(false);
  const profileFetchInFlightForUserId = useRef<string | null>(null);
  const lastLoadedProfileUserId = useRef<string | null>(null);

  const resolveLoading = () => {
    if (!loadingResolved.current) {
      loadingResolved.current = true;
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string, userEmail: string | undefined) => {
    // Avoid duplicate in-flight fetches
    if (profileFetchInFlightForUserId.current === userId) {
      return null;
    }

    // Reuse already loaded profile for same user
    if (lastLoadedProfileUserId.current === userId && profile) {
      setProfileLoading(false);
      return profile;
    }

    profileFetchInFlightForUserId.current = userId;
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
        return null;
      }

      const isSuperAdminUser = userEmail === SUPER_ADMIN_EMAIL;

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

      lastLoadedProfileUserId.current = userId;
      setProfileLoading(false);
      return profileData as UserProfile;
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setProfileLoading(false);
      return null;
    } finally {
      profileFetchInFlightForUserId.current = null;
    }
  };

  const signOut = async () => {
    profileFetchInFlightForUserId.current = null;
    lastLoadedProfileUserId.current = null;

    await supabase.auth.signOut();

    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setBranchName(null);
  };

  useEffect(() => {
    let isMounted = true;

    const applySession = (nextSession: Session | null, authEvent?: string) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        profileFetchInFlightForUserId.current = null;
        lastLoadedProfileUserId.current = null;
        setProfile(null);
        setIsAdmin(false);
        setBranchName(null);
        setProfileLoading(false);
        resolveLoading();
        return;
      }

      // Keep session marker active for admin browser-session guard
      sessionStorage.setItem(SESSION_KEY, 'true');

      const shouldSkipProfileFetch =
        authEvent === 'TOKEN_REFRESHED' &&
        lastLoadedProfileUserId.current === nextSession.user.id;

      if (shouldSkipProfileFetch) {
        setProfileLoading(false);
        resolveLoading();
        return;
      }

      fetchUserProfile(nextSession.user.id, nextSession.user.email)
        .then((p) => {
          if (isMounted && p) {
            setProfile(p);
          }
        })
        .finally(() => {
          if (isMounted) {
            resolveLoading();
          }
        });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      // Some environments emit INITIAL_SESSION with null before storage restore.
      // In that case, let getSession() do the initial restore.
      if (event === 'INITIAL_SESSION' && !nextSession) {
        return;
      }

      hasHandledInitialAuth.current = true;
      applySession(nextSession, event);
    });

    // Fallback / storage restore path.
    supabase.auth.getSession().then(({ data: { session: restoredSession } }) => {
      if (!isMounted) return;

      if (hasHandledInitialAuth.current) {
        resolveLoading();
        return;
      }

      hasHandledInitialAuth.current = true;
      applySession(restoredSession, 'GET_SESSION');
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Admin session guard - force logout for non-super admins on new browser session
  // IMPORTANT: Skip guard on fresh OAuth callback (hash contains access_token)
  useEffect(() => {
    const isNonSuperAdmin = !!user && isAdmin && !isSuperAdmin;

    if (!isNonSuperAdmin) {
      return;
    }

    const hash = window.location.hash;
    if (hash.includes('access_token') || hash.includes('type=recovery')) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      return;
    }

    const wasActive = sessionStorage.getItem(SESSION_KEY);

    if (!wasActive) {
      console.log('[AdminSessionGuard] New browser session detected for admin, forcing logout');
      supabase.auth.signOut().then(() => {
        window.location.href = '/login';
      });
      return;
    }

    sessionStorage.setItem(SESSION_KEY, 'true');
  }, [user, isAdmin, isSuperAdmin]);

  // Order: super admin → admin → active status
  const isActive = isSuperAdmin || isAdmin || profile?.status === 'active';
  const branchId = profile?.branch_id || null;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
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
