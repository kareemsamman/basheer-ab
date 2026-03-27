import { ReactNode, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
  children: ReactNode;
}

// Check if Supabase has a stored session (token may need refresh)
function hasStoredSession(): boolean {
  try {
    const keys = Object.keys(localStorage);
    return keys.some(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
  } catch {
    return false;
  }
}

/**
 * Route guard that only allows admin users to access the route.
 * Workers will be redirected to the dashboard.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading, profileLoading, profile, isActive, isAdmin, isSuperAdmin } = useAuth();
  const [sessionVerified, setSessionVerified] = useState(false);

  // If auth says no user but localStorage has a session, re-verify once
  useEffect(() => {
    if (!loading && !user && hasStoredSession() && !sessionVerified) {
      supabase.auth.getSession().then(() => {
        setSessionVerified(true);
      });
    } else if (user) {
      setSessionVerified(true);
    }
  }, [loading, user, sessionVerified]);

  // Block during initial auth resolution
  const needsProfileLoading = user && !isSuperAdmin && profileLoading && !profile;

  // Show loading while auth is resolving or while re-verifying a stored session
  if (loading || needsProfileLoading || (!user && hasStoredSession() && !sessionVerified)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // No user = go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Not active = no access page
  if (!isActive) {
    return <Navigate to="/no-access" replace />;
  }

  // Not admin = redirect to dashboard (workers can't access admin routes)
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
