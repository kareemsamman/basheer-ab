import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2, ExternalLink, AlertCircle, Mail, Smartphone, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput } from "@/components/auth/OtpInput";

type AuthStep = "method" | "otp";
type AuthMethod = "google" | "email" | "sms";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const navigate = useNavigate();
  const { user, isActive, loading: authLoading } = useAuth();
  
  // OTP state
  const [authStep, setAuthStep] = useState<AuthStep>("method");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("google");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      if (isActive) {
        navigate('/', { replace: true });
      } else {
        navigate('/no-access', { replace: true });
      }
    }
  }, [user, isActive, authLoading, navigate]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleGoogleLogin = async () => {
    if (isInIframe) {
      window.open(window.location.href, '_blank');
      return;
    }
    
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        }
      });
      
      if (error) {
        if (error.message.includes('provider is not enabled')) {
          toast.error("مزود Google غير مفعل. يرجى تفعيله من إعدادات Lovable Cloud.");
        } else {
          toast.error("حدث خطأ في تسجيل الدخول");
        }
        console.error("Login error:", error);
      }
    } catch (error) {
      toast.error("حدث خطأ غير متوقع");
      console.error("Unexpected error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInNewTab = () => {
    window.open(window.location.origin + '/login', '_blank');
  };

  const handleEmailStart = async () => {
    if (!email || !email.includes("@")) {
      toast.error("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("auth-email-start", {
        body: { email },
      });

      if (response.error) {
        // Try to extract the real error message from the function response body
        let message = response.error.message;
        const ctx = (response as any).response ?? (response.error as any).context;

        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // ignore JSON parsing errors
          }
        }

        throw new Error(message);
      }

      if (!response.data?.success) {
        toast.error(response.data?.error || "فشل في إرسال رمز التحقق");
        return;
      }

      toast.success("تم إرسال رمز التحقق إلى بريدك الإلكتروني");
      setAuthStep("otp");
      setAuthMethod("email");
      setCountdown(60);
    } catch (error: unknown) {
      console.error("Email OTP error:", error);
      toast.error(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  const handleSmsStart = async () => {
    if (!phone || phone.length < 9) {
      toast.error("يرجى إدخال رقم هاتف صحيح");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("auth-sms-start", {
        body: { phone },
      });

      if (response.error) {
        // Try to extract the real error message from the function response body
        let message = response.error.message;
        const ctx = (response as any).response ?? (response.error as any).context;

        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) message = body.error;
          } catch {
            // ignore JSON parsing errors
          }
        }

        throw new Error(message);
      }

      if (!response.data?.success) {
        toast.error(response.data?.error || "فشل في إرسال رمز التحقق");
        return;
      }

      // Check if this is a pending registration
      if (response.data?.pending) {
        toast.info(response.data.message || "طلبك قيد المراجعة");
        navigate("/no-access", { replace: true });
        return;
      }

      toast.success("تم إرسال رمز التحقق إلى هاتفك");
      setAuthStep("otp");
      setAuthMethod("sms");
      setCountdown(60);
    } catch (error: unknown) {
      console.error("SMS OTP error:", error);
      toast.error(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (otpCode.length !== 6) {
      toast.error("يرجى إدخال رمز التحقق المكون من 6 أرقام");
      return;
    }

    setLoading(true);
    try {
      const endpoint = authMethod === "email" ? "auth-email-verify" : "auth-sms-verify";
      const body = authMethod === "email" 
        ? { email, code: otpCode }
        : { phone, code: otpCode };

      const response = await supabase.functions.invoke(endpoint, { body });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        toast.error(response.data?.error || "رمز التحقق غير صحيح");
        return;
      }

      // User verified successfully
      if (response.data.is_active) {
        // Sign in with the magic link token if available
        if (response.data.magic_link_token) {
          const { error: signInError } = await supabase.auth.verifyOtp({
            token_hash: response.data.magic_link_token,
            type: "magiclink",
          });
          
          if (signInError) {
            console.error("Sign in error:", signInError);
            // Fallback: direct navigation with user info
          }
        }
        
        toast.success("تم تسجيل الدخول بنجاح");
        navigate("/", { replace: true });
      } else {
        // User needs approval
        toast.info("تم التحقق. حسابك بانتظار موافقة المدير.");
        navigate("/no-access", { replace: true });
      }
    } catch (error: unknown) {
      console.error("OTP verify error:", error);
      toast.error(error instanceof Error ? error.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    
    if (authMethod === "email") {
      await handleEmailStart();
    } else {
      await handleSmsStart();
    }
  };

  const handleBack = () => {
    setAuthStep("method");
    setOtpCode("");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // OTP verification step
  if (authStep === "otp") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border shadow-lg animate-scale-in">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md">
              {authMethod === "email" ? (
                <Mail className="h-8 w-8 text-primary-foreground" />
              ) : (
                <Smartphone className="h-8 w-8 text-primary-foreground" />
              )}
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-primary">
                رمز التحقق
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                {authMethod === "email" 
                  ? `أدخل الرمز المرسل إلى ${email}`
                  : `أدخل الرمز المرسل إلى ${phone}`
                }
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <OtpInput
              value={otpCode}
              onChange={setOtpCode}
              disabled={loading}
            />

            <Button
              className="w-full h-12 text-base gap-2"
              onClick={handleOtpVerify}
              disabled={loading || otpCode.length !== 6}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowRight className="h-5 w-5" />
              )}
              {loading ? "جاري التحقق..." : "تأكيد"}
            </Button>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                لم تستلم الرمز؟
              </p>
              <Button
                variant="link"
                onClick={handleResend}
                disabled={countdown > 0 || loading}
                className="text-primary"
              >
                {countdown > 0 
                  ? `إعادة الإرسال بعد ${countdown} ثانية`
                  : "إعادة إرسال الرمز"
                }
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={handleBack}
            >
              العودة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border shadow-lg animate-scale-in">
        <CardHeader className="text-center space-y-4">
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
          {isInIframe && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 text-sm mr-2">
                تسجيل الدخول بـ Google لا يعمل داخل المعاينة. افتح التطبيق في تبويب جديد.
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="google" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="google" className="text-xs sm:text-sm">
                Google
              </TabsTrigger>
              <TabsTrigger value="email" className="text-xs sm:text-sm gap-1">
                <Mail className="h-3 w-3 hidden sm:block" />
                بريد
              </TabsTrigger>
              <TabsTrigger value="sms" className="text-xs sm:text-sm gap-1">
                <Smartphone className="h-3 w-3 hidden sm:block" />
                رسالة
              </TabsTrigger>
            </TabsList>

            <TabsContent value="google" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground text-center">
                سجل الدخول بحساب Google للوصول إلى النظام
              </p>

              {isInIframe ? (
                <Button
                  className="w-full h-12 text-base gap-3"
                  onClick={handleOpenInNewTab}
                >
                  <ExternalLink className="h-5 w-5" />
                  افتح في تبويب جديد لتسجيل الدخول
                </Button>
              ) : (
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
              )}
            </TabsContent>

            <TabsContent value="email" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your-email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ltr-input"
                  disabled={loading}
                />
              </div>
              <Button
                className="w-full h-12 text-base gap-2"
                onClick={handleEmailStart}
                disabled={loading || !email}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Mail className="h-5 w-5" />
                )}
                {loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}
              </Button>
            </TabsContent>

            <TabsContent value="sms" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="05XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="ltr-input"
                  disabled={loading}
                />
              </div>
              <Button
                className="w-full h-12 text-base gap-2"
                onClick={handleSmsStart}
                disabled={loading || !phone}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Smartphone className="h-5 w-5" />
                )}
                {loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}
              </Button>
            </TabsContent>
          </Tabs>

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
