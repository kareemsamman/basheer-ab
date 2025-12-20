import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Save, Loader2, MessageSquare, Send, Settings2, FileSignature, Image, Upload, X } from "lucide-react";
import { Navigate } from "react-router-dom";

interface SmsSettings {
  id?: string;
  provider: string;
  sms_user: string;
  sms_token: string;
  sms_source: string;
  is_enabled: boolean;
  invoice_sms_template?: string | null;
  signature_sms_template?: string | null;
  // Signature page branding from invoice_templates default_signature_template_id
}

interface SignaturePageSettings {
  logo_url: string;
  header_html: string;
  body_html: string;
  footer_html: string;
}

export default function SmsSettings() {
  const { toast } = useToast();
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  const [settings, setSettings] = useState<SmsSettings>({
    provider: "019sms",
    sms_user: "",
    sms_token: "",
    sms_source: "",
    is_enabled: false,
    invoice_sms_template: null,
    signature_sms_template: null,
  });

  const [signaturePageSettings, setSignaturePageSettings] = useState<SignaturePageSettings>({
    logo_url: "",
    header_html: "",
    body_html: "",
    footer_html: "",
  });
  
  const [signatureTemplateId, setSignatureTemplateId] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_settings")
        .select("*, invoice_templates:default_signature_template_id(*)")
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
          invoice_sms_template: data.invoice_sms_template ?? null,
          signature_sms_template: data.signature_sms_template ?? null,
        });

        // Load signature template settings
        if (data.default_signature_template_id && data.invoice_templates) {
          const template = data.invoice_templates as any;
          setSignatureTemplateId(data.default_signature_template_id);
          setSignaturePageSettings({
            logo_url: template.logo_url || "",
            header_html: template.header_html || "",
            body_html: template.body_html || "",
            footer_html: template.footer_html || "",
          });
        }
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
            invoice_sms_template: settings.invoice_sms_template ?? null,
            signature_sms_template: settings.signature_sms_template ?? null,
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
            invoice_sms_template: settings.invoice_sms_template ?? null,
            signature_sms_template: settings.signature_sms_template ?? null,
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

  const handleSaveSignaturePage = async () => {
    setSaving(true);
    try {
      if (signatureTemplateId) {
        // Update existing signature template
        const { error } = await supabase
          .from("invoice_templates")
          .update({
            logo_url: signaturePageSettings.logo_url || null,
            header_html: signaturePageSettings.header_html || null,
            body_html: signaturePageSettings.body_html || null,
            footer_html: signaturePageSettings.footer_html || null,
          })
          .eq("id", signatureTemplateId);

        if (error) throw error;
      } else {
        // Create new signature template
        const { data: newTemplate, error: createError } = await supabase
          .from("invoice_templates")
          .insert({
            name: "Signature Page Template",
            template_type: "signature",
            language: "ar",
            direction: "rtl",
            is_active: true,
            logo_url: signaturePageSettings.logo_url || null,
            header_html: signaturePageSettings.header_html || null,
            body_html: signaturePageSettings.body_html || null,
            footer_html: signaturePageSettings.footer_html || null,
          })
          .select()
          .single();

        if (createError) throw createError;

        // Update sms_settings with the new template id
        if (settings.id) {
          const { error: updateError } = await supabase
            .from("sms_settings")
            .update({ default_signature_template_id: newTemplate.id })
            .eq("id", settings.id);

          if (updateError) throw updateError;
        }

        setSignatureTemplateId(newTemplate.id);
      }

      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات صفحة التوقيع بنجاح" });
    } catch (error: any) {
      console.error("Error saving signature page settings:", error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ الإعدادات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'signature_logo');
      // entity_id في media_files هو UUID، لذلك لا نرسل "global".
      if (signatureTemplateId) {
        formData.append('entity_id', signatureTemplateId);
      }

      const { data, error } = await supabase.functions.invoke('upload-media', {
        body: formData,
      });

      if (error) {
        throw new Error(error.message || 'Upload failed');
      }

      const uploaded = data?.file;
      if (!uploaded?.cdn_url) {
        throw new Error('Upload failed');
      }

      setSignaturePageSettings(prev => ({ ...prev, logo_url: uploaded.cdn_url }));
      toast({ title: "تم الرفع", description: "تم رفع الشعار بنجاح" });
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في رفع الشعار", 
        variant: "destructive" 
      });
    } finally {
      setUploadingLogo(false);
      event.target.value = '';
    }
  };

  const handleTestSms = async () => {
    if (!testPhone.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال رقم الهاتف للاختبار", variant: "destructive" });
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          phone: testPhone,
          message: "رسالة اختبار من AB Insurance CRM - Test message from AB Insurance CRM",
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to send SMS");
      }

      toast({ title: "تم الإرسال", description: data?.message || "تم إرسال رسالة الاختبار بنجاح" });
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
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="settings" className="gap-2">
              <Settings2 className="h-4 w-4" />
              الإعدادات
            </TabsTrigger>
            <TabsTrigger value="signature" className="gap-2">
              <FileSignature className="h-4 w-4" />
              صفحة التوقيع
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

                  {/* Templates */}
                  <div className="space-y-2">
                    <Label htmlFor="signature_sms_template">نص رسالة التوقيع</Label>
                    <Textarea
                      id="signature_sms_template"
                      value={settings.signature_sms_template || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, signature_sms_template: e.target.value }))
                      }
                      placeholder="مرحباً {{client_name}}، يرجى التوقيع على الرابط التالي: {{signature_url}}"
                      className="min-h-[110px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      المتغيرات المتاحة: {"{{client_name}}"} ، {"{{signature_url}}"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice_sms_template">نص رسالة الفواتير</Label>
                    <Textarea
                      id="invoice_sms_template"
                      value={settings.invoice_sms_template || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, invoice_sms_template: e.target.value }))
                      }
                      placeholder="مرحباً {{client_name}}، تم إصدار فواتير وثيقة التأمين رقم {{policy_number}}. فاتورة AB: {{ab_invoice_url}} فاتورة شركة التأمين: {{insurance_invoice_url}}"
                      className="min-h-[110px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      المتغيرات المتاحة: {"{{client_name}}"} ، {"{{policy_number}}"} ، {"{{ab_invoice_url}}"} ، {"{{insurance_invoice_url}}"}
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

          {/* Signature Page Editor Tab */}
          <TabsContent value="signature" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-primary" />
                  إعدادات صفحة التوقيع
                </CardTitle>
                <CardDescription>
                  تخصيص المحتوى الذي يظهر للعميل عند فتح رابط التوقيع
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo Upload */}
                <div className="space-y-2">
                  <Label>شعار الشركة</Label>
                  <div className="flex items-center gap-4">
                    {signaturePageSettings.logo_url ? (
                      <div className="relative">
                        <img 
                          src={signaturePageSettings.logo_url} 
                          alt="الشعار" 
                          className="h-16 w-auto rounded border"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6"
                          onClick={() => setSignaturePageSettings(prev => ({ ...prev, logo_url: "" }))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          disabled={uploadingLogo}
                        />
                        <Button variant="outline" disabled={uploadingLogo}>
                          {uploadingLogo ? (
                            <Loader2 className="h-4 w-4 animate-spin ml-2" />
                          ) : (
                            <Upload className="h-4 w-4 ml-2" />
                          )}
                          رفع شعار
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Header HTML */}
                <div className="space-y-2">
                  <Label htmlFor="header_html">العنوان (يمكن إضافة HTML)</Label>
                  <Textarea
                    id="header_html"
                    value={signaturePageSettings.header_html}
                    onChange={(e) =>
                      setSignaturePageSettings(prev => ({ ...prev, header_html: e.target.value }))
                    }
                    placeholder="<h2>عنوان الصفحة</h2>"
                    className="min-h-[80px] font-mono text-sm"
                    dir="rtl"
                  />
                  <p className="text-xs text-muted-foreground">
                    يظهر في أعلى صفحة التوقيع
                  </p>
                </div>

                {/* Body HTML */}
                <div className="space-y-2">
                  <Label htmlFor="body_html">المحتوى الرئيسي (يمكن إضافة HTML)</Label>
                  <Textarea
                    id="body_html"
                    value={signaturePageSettings.body_html}
                    onChange={(e) =>
                      setSignaturePageSettings(prev => ({ ...prev, body_html: e.target.value }))
                    }
                    placeholder="<p>أقرّ أنا الموقع أدناه بأنني قد اطلعت على شروط التأمين وأوافق عليها.</p>"
                    className="min-h-[150px] font-mono text-sm"
                    dir="rtl"
                  />
                  <p className="text-xs text-muted-foreground">
                    النص الذي يجب على العميل قراءته قبل التوقيع
                  </p>
                </div>

                {/* Footer HTML */}
                <div className="space-y-2">
                  <Label htmlFor="footer_html">التذييل (يمكن إضافة HTML)</Label>
                  <Textarea
                    id="footer_html"
                    value={signaturePageSettings.footer_html}
                    onChange={(e) =>
                      setSignaturePageSettings(prev => ({ ...prev, footer_html: e.target.value }))
                    }
                    placeholder="<p>جميع الحقوق محفوظة © AB Insurance</p>"
                    className="min-h-[60px] font-mono text-sm"
                    dir="rtl"
                  />
                </div>

                {/* Preview */}
                {(signaturePageSettings.header_html || signaturePageSettings.body_html || signaturePageSettings.footer_html) && (
                  <div className="space-y-2">
                    <Label>معاينة</Label>
                    <div className="border rounded-lg p-4 bg-muted/30 prose prose-sm max-w-none" dir="rtl">
                      {signaturePageSettings.logo_url && (
                        <img src={signaturePageSettings.logo_url} alt="الشعار" className="h-12 mx-auto mb-4" />
                      )}
                      {signaturePageSettings.header_html && (
                        <div dangerouslySetInnerHTML={{ __html: signaturePageSettings.header_html }} />
                      )}
                      {signaturePageSettings.body_html && (
                        <div dangerouslySetInnerHTML={{ __html: signaturePageSettings.body_html }} />
                      )}
                      {signaturePageSettings.footer_html && (
                        <div dangerouslySetInnerHTML={{ __html: signaturePageSettings.footer_html }} />
                      )}
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <Button onClick={handleSaveSignaturePage} disabled={saving} className="w-full">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Save className="h-4 w-4 ml-2" />
                  )}
                  حفظ إعدادات صفحة التوقيع
                </Button>
              </CardContent>
            </Card>
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
