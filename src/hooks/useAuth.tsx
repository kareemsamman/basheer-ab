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

  // Super admin check based on email - this is the authoritative check
  const isSuperAdmin = isSuperAdminEmail(user?.email);

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
      const isSuperAdminUser = isSuperAdminEmail(userEmail);
      
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
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        // Keep session guard flag synced whenever a valid session exists
        if (session) {
          sessionStorage.setItem('admin_session_active', 'true');
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            if (isMounted) {
              fetchUserProfile(session.user.id, session.user.email).then(p => {
                if (isMounted) setProfile(p);
              });
            }
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          setBranchName(null);
          setProfileLoading(false);
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        sessionStorage.setItem('admin_session_active', 'true');

        // Only fetch if not already being fetched by onAuthStateChange
        if (!fetchingRef.current) {
          fetchUserProfile(session.user.id, session.user.email).then(p => {
            if (isMounted) setProfile(p);
          });
        }
      } else {
        setProfileLoading(false);
      }
      
      setIsReady(true);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Admin session guard - force logout for non-super admins on new browser session
  useEffect(() => {
    const SESSION_KEY = 'admin_session_active';
    const userEmail = user?.email;
    const isNonSuperAdmin = !isSuperAdminEmail(userEmail) && isAdmin;
    
    if (!isReady || !session || !user || !isNonSuperAdmin) {
      return;
    }

    const wasActive = sessionStorage.getItem(SESSION_KEY);
    
    if (!wasActive) {
      // This is a new browser session after browser was closed - force logout
      console.log('[AdminSessionGuard] New browser session detected for admin, forcing logout');
      supabase.auth.signOut().then(() => {
        window.location.href = '/login';
      });
      return;
    }

    // Keep session flag active
    sessionStorage.setItem(SESSION_KEY, 'true');
  }, [isReady, session, user, isAdmin]);

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
