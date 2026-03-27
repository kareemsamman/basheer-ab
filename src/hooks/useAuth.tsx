import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
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

  // Deduplication refs
  const initialSessionHandled = useRef(false);
  const currentProfileUserId = useRef<string | null>(null);
  const loadingResolved = useRef(false);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  const resolveLoading = () => {
    if (!loadingResolved.current) {
      loadingResolved.current = true;
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string, userEmail: string | undefined) => {
    // Skip if already fetching/fetched for this user
    if (currentProfileUserId.current === userId) {
      return null;
    }
    currentProfileUserId.current = userId;
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

      setProfileLoading(false);
      return profileData as UserProfile;
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setProfileLoading(false);
      return null;
    }
  };

  const handleAuthUser = (authUser: User) => {
    // Always mark session active for admin guard
    sessionStorage.setItem(SESSION_KEY, 'true');

    setSession(s => s); // keep current
    setUser(authUser);

    fetchUserProfile(authUser.id, authUser.email).then(p => {
      if (p) setProfile(p);
    });
  };

  const signOut = async () => {
    currentProfileUserId.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setBranchName(null);
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;

        initialSessionHandled.current = true;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Always set session flag for admin guard
        if (newSession?.user) {
          sessionStorage.setItem(SESSION_KEY, 'true');
        }

        if (event === 'TOKEN_REFRESHED') {
          // Only update session/user, do NOT re-fetch profile
          resolveLoading();
          return;
        }

        if (newSession?.user) {
          fetchUserProfile(newSession.user.id, newSession.user.email).then(p => {
            if (isMounted && p) setProfile(p);
          });
        } else {
          currentProfileUserId.current = null;
          setProfile(null);
          setIsAdmin(false);
          setBranchName(null);
          setProfileLoading(false);
        }

        resolveLoading();
      }
    );

    // Fallback: getSession only if onAuthStateChange hasn't fired yet
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!isMounted) return;
      if (initialSessionHandled.current) {
        // Already handled by onAuthStateChange, skip
        resolveLoading();
        return;
      }

      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      if (existingSession?.user) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        fetchUserProfile(existingSession.user.id, existingSession.user.email).then(p => {
          if (isMounted && p) setProfile(p);
        });
      } else {
        setProfileLoading(false);
      }

      resolveLoading();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Admin session guard
  useEffect(() => {
    const userEmail = user?.email;
    const isNonSuperAdmin = userEmail !== SUPER_ADMIN_EMAIL && isAdmin;

    if (!user || !isNonSuperAdmin) return;

    // Skip on OAuth callback
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
  }, [user, isAdmin]);

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
