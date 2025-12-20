import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Save, Loader2, MessageSquare, Send, FileSignature, Settings2 } from "lucide-react";
import { Navigate } from "react-router-dom";

interface SmsSettings {
  id?: string;
  provider: string;
  sms_user: string;
  sms_token: string;
  sms_source: string;
  is_enabled: boolean;
}

export default function SmsSettings() {
  const { toast } = useToast();
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  
  const [settings, setSettings] = useState<SmsSettings>({
    provider: "019sms",
    sms_user: "",
    sms_token: "",
    sms_source: "",
    is_enabled: false,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSettings({
          id: data.id,
          provider: data.provider || "019sms",
          sms_user: data.sms_user || "",
          sms_token: data.sms_token || "",
          sms_source: data.sms_source || "",
          is_enabled: data.is_enabled || false,
        });
      }
    } catch (error) {
      console.error("Error fetching SMS settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.id) {
        // Update existing
        const { error } = await supabase
          .from("sms_settings")
          .update({
            sms_user: settings.sms_user,
            sms_token: settings.sms_token,
            sms_source: settings.sms_source,
            is_enabled: settings.is_enabled,
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("sms_settings")
          .insert({
            provider: "019sms",
            sms_user: settings.sms_user,
            sms_token: settings.sms_token,
            sms_source: settings.sms_source,
            is_enabled: settings.is_enabled,
          })
          .select()
          .single();

        if (error) throw error;
        setSettings((prev) => ({ ...prev, id: data.id }));
      }

      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات SMS بنجاح" });
    } catch (error: any) {
      console.error("Error saving SMS settings:", error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ الإعدادات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSms = async () => {
    if (!testPhone.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال رقم الهاتف للاختبار", variant: "destructive" });
      return;
    }

    setTesting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: testPhone,
            message: "رسالة اختبار من AB Insurance CRM - Test message from AB Insurance CRM",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send SMS");
      }

      toast({ title: "تم الإرسال", description: "تم إرسال رسالة الاختبار بنجاح" });
    } catch (error: any) {
      console.error("Error sending test SMS:", error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال رسالة الاختبار",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  if (authLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <MainLayout>
      <Header title="إعدادات SMS" subtitle="إدارة خدمة الرسائل النصية" />

      <div className="p-6 space-y-6">
        <Tabs defaultValue="settings" dir="rtl">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="settings" className="gap-2">
              <Settings2 className="h-4 w-4" />
              الإعدادات
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-2">
              <Send className="h-4 w-4" />
              اختبار
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-6">
            {loading ? (
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-60" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    إعدادات 019sms
                  </CardTitle>
                  <CardDescription>
                    قم بإدخال بيانات الاتصال بخدمة 019sms لإرسال الرسائل النصية
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Enable/Disable Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="font-medium">تفعيل خدمة SMS</Label>
                      <p className="text-sm text-muted-foreground">
                        تفعيل أو تعطيل إرسال الرسائل النصية
                      </p>
                    </div>
                    <Switch
                      checked={settings.is_enabled}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({ ...prev, is_enabled: checked }))
                      }
                    />
                  </div>

                  {/* SMS User */}
                  <div className="space-y-2">
                    <Label htmlFor="sms_user">اسم المستخدم (SMSUSER)</Label>
                    <Input
                      id="sms_user"
                      placeholder="أدخل اسم المستخدم..."
                      value={settings.sms_user}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, sms_user: e.target.value }))
                      }
                      dir="ltr"
                    />
                  </div>

                  {/* SMS Token */}
                  <div className="space-y-2">
                    <Label htmlFor="sms_token">رمز API (SMSTOKEN)</Label>
                    <Input
                      id="sms_token"
                      type="password"
                      placeholder="أدخل رمز API..."
                      value={settings.sms_token}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, sms_token: e.target.value }))
                      }
                      dir="ltr"
                    />
                  </div>

                  {/* SMS Source */}
                  <div className="space-y-2">
                    <Label htmlFor="sms_source">مصدر الرسالة (SMSSOURCE)</Label>
                    <Input
                      id="sms_source"
                      placeholder="اسم المرسل (مثال: ABInsurance)..."
                      value={settings.sms_source}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, sms_source: e.target.value }))
                      }
                      dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground">
                      الاسم الذي سيظهر للعميل كمرسل الرسالة
                    </p>
                  </div>

                  {/* Save Button */}
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Save className="h-4 w-4 ml-2" />
                    )}
                    حفظ الإعدادات
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="test" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" />
                  اختبار الإرسال
                </CardTitle>
                <CardDescription>
                  أرسل رسالة اختبار للتأكد من صحة الإعدادات
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="test_phone">رقم الهاتف</Label>
                  <Input
                    id="test_phone"
                    placeholder="05xxxxxxxx"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    dir="ltr"
                  />
                </div>

                <Button
                  onClick={handleTestSms}
                  disabled={testing || !settings.is_enabled}
                  className="w-full"
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Send className="h-4 w-4 ml-2" />
                  )}
                  إرسال رسالة اختبار
                </Button>

                {!settings.is_enabled && (
                  <p className="text-sm text-amber-600 text-center">
                    يجب تفعيل خدمة SMS أولاً من تبويب الإعدادات
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
