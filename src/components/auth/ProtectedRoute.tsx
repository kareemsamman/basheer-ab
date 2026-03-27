import { ReactNode, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
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

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, profileLoading, profile, isActive, isSuperAdmin } = useAuth();
  const [sessionVerified, setSessionVerified] = useState(false);

  // If auth says no user but localStorage has a session, re-verify once
  useEffect(() => {
    if (!loading && !user && hasStoredSession() && !sessionVerified) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSessionVerified(true);
        // If getSession returns null, the stored session is truly invalid
        // The redirect to login will proceed on next render
      });
    } else if (user) {
      setSessionVerified(true);
    }
  }, [loading, user, sessionVerified]);

  // CRITICAL: Block during initial auth resolution
  // Super admin bypasses profile loading requirement
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

  // Super admin and admins always have access (isActive includes this check)
  // Only show No Access for non-admin users with inactive status
  if (!isActive) {
    return <Navigate to="/no-access" replace />;
  }

  return <>{children}</>;
}
