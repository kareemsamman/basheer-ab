import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        }
      });
      
      if (error) {
        toast.error("حدث خطأ في تسجيل الدخول");
        console.error("Login error:", error);
      }
    } catch (error) {
      toast.error("حدث خطأ غير متوقع");
      console.error("Unexpected error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border shadow-lg animate-scale-in">
        <CardHeader className="text-center space-y-4">
          {/* Logo */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-primary">
              AB تأمين
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              نظام إدارة وكيل التأمين
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              سجل الدخول بحساب Google للوصول إلى النظام
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full h-12 text-base gap-3 border-border hover:border-primary/50 hover:bg-secondary/50"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول بـ Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">تسجيل دخول آمن</span>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            فقط المستخدمون المصرح لهم يمكنهم الوصول إلى النظام.
            <br />
            تواصل مع المدير للحصول على صلاحية الدخول.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
