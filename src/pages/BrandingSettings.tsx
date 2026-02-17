import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Trash2, Image, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings, useUpdateSiteSettings } from "@/hooks/useSiteSettings";
import { Skeleton } from "@/components/ui/skeleton";

function ImageUploadField({
  label,
  description,
  currentUrl,
  onUpload,
  onRemove,
  accept = "image/*",
}: {
  label: string;
  description: string;
  currentUrl: string | null;
  onUpload: (url: string) => void;
  onRemove: () => void;
  accept?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("branding")
        .getPublicUrl(path);

      onUpload(publicUrl);
      toast.success("تم رفع الملف بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("فشل في رفع الملف");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      {currentUrl ? (
        <div className="flex items-center gap-4">
          <img
            src={currentUrl}
            alt={label}
            className="h-16 w-auto rounded-lg border bg-muted object-contain p-1"
          />
          <Button variant="destructive" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4 ml-1" />
            حذف
          </Button>
        </div>
      ) : (
        <div
          className="flex items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Upload className="h-4 w-4" />
              اضغط لرفع الصورة
            </div>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
    </div>
  );
}

export default function BrandingSettings() {
  const { data: settings, isLoading } = useSiteSettings();
  const updateSettings = useUpdateSiteSettings();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize form from fetched settings
  if (settings && !initialized) {
    setTitle(settings.site_title);
    setDescription(settings.site_description);
    setLogoUrl(settings.logo_url);
    setFaviconUrl(settings.favicon_url);
    setOgImageUrl(settings.og_image_url);
    setInitialized(true);
  }

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        site_title: title,
        site_description: description,
        logo_url: logoUrl,
        favicon_url: faviconUrl,
        og_image_url: ogImageUrl,
      });
      toast.success("تم حفظ الإعدادات بنجاح");
    } catch {
      toast.error("فشل في حفظ الإعدادات");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-4 max-w-2xl">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">إعدادات العلامة التجارية</h1>
          <p className="text-muted-foreground text-sm mt-1">
            تخصيص شعار الموقع، العنوان، والوصف
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              معلومات الموقع
            </CardTitle>
            <CardDescription>
              هذه الإعدادات تظهر في عنوان المتصفح ونتائج البحث
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="site-title">عنوان الموقع</Label>
              <Input
                id="site-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="AB تأمين"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="site-desc">وصف الموقع</Label>
              <Textarea
                id="site-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="نظام إدارة وكيل التأمين"
                rows={3}
              />
            </div>

            <ImageUploadField
              label="شعار الموقع"
              description="يظهر في الشريط الجانبي وصفحة تسجيل الدخول"
              currentUrl={logoUrl}
              onUpload={setLogoUrl}
              onRemove={() => setLogoUrl(null)}
            />

            <ImageUploadField
              label="أيقونة المتصفح (Favicon)"
              description="الأيقونة الصغيرة التي تظهر في تبويب المتصفح"
              currentUrl={faviconUrl}
              onUpload={setFaviconUrl}
              onRemove={() => setFaviconUrl(null)}
            />

            <ImageUploadField
              label="صورة المشاركة (OG Image)"
              description="تظهر عند مشاركة رابط الموقع على وسائل التواصل"
              currentUrl={ogImageUrl}
              onUpload={setOgImageUrl}
              onRemove={() => setOgImageUrl(null)}
            />

            <Button
              className="w-full gap-2"
              onClick={handleSave}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ الإعدادات
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
