import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldX, Mail, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function NoAccess() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };
    getUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border shadow-lg animate-scale-in">
        <CardHeader className="text-center space-y-4">
          {/* Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
              لا تملك صلاحية الدخول
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              حسابك بانتظار موافقة المدير
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg bg-secondary/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">تم تسجيل الدخول بـ:</span>
            </div>
            <p className="font-medium text-foreground" dir="ltr">{userEmail || "..."}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              يحتاج المدير إلى الموافقة على طلب دخولك قبل أن تتمكن من استخدام النظام.
            </p>
            <p className="text-sm text-muted-foreground text-center">
              إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع:
            </p>
            <p className="text-sm font-medium text-primary text-center" dir="ltr">
              morshed500@gmail.com
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="outline" className="w-full gap-2" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
