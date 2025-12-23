import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Upload, Database, FileJson, FileCode, Image, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TABLES_TO_EXPORT = [
  'branches',
  'brokers',
  'insurance_companies',
  'insurance_categories',
  'pricing_rules',
  'clients',
  'cars',
  'car_accidents',
  'policies',
  'policy_payments',
  'outside_cheques',
  'media_files',
  'invoice_templates',
  'invoices',
  'customer_signatures',
  'sms_settings',
  'payment_settings',
  'profiles',
  'user_roles',
  'notifications',
  'login_attempts'
];

export default function DatabaseMigration() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTable, setCurrentTable] = useState("");
  const [exportedData, setExportedData] = useState<Record<string, any[]> | null>(null);

  const exportAllData = async () => {
    setExporting(true);
    setProgress(0);
    const allData: Record<string, any[]> = {};
    
    try {
      for (let i = 0; i < TABLES_TO_EXPORT.length; i++) {
        const table = TABLES_TO_EXPORT[i];
        setCurrentTable(table);
        setProgress(Math.round((i / TABLES_TO_EXPORT.length) * 100));
        
        const { data, error } = await supabase
          .from(table as any)
          .select('*');
        
        if (error) {
          console.warn(`Error exporting ${table}:`, error.message);
          allData[table] = [];
        } else {
          allData[table] = data || [];
        }
      }
      
      setExportedData(allData);
      setProgress(100);
      
      // Download as JSON file
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ab-insurance-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("تم تصدير البيانات بنجاح");
    } catch (error: any) {
      toast.error("خطأ في التصدير: " + error.message);
    } finally {
      setExporting(false);
      setCurrentTable("");
    }
  };

  const exportMediaLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('media_files')
        .select('cdn_url, original_name, entity_type, entity_id')
        .is('deleted_at', null);
      
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `media-links-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`تم تصدير ${data?.length || 0} رابط وسائط`);
    } catch (error: any) {
      toast.error("خطأ في تصدير روابط الوسائط: " + error.message);
    }
  };

  const downloadMigrationSQL = () => {
    window.open('/migration.sql', '_blank');
  };

  const downloadMigrationGuide = () => {
    window.open('/migration-guide.md', '_blank');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setProgress(0);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Import order matters due to foreign keys
      const importOrder = [
        'branches',
        'brokers',
        'insurance_companies',
        'insurance_categories',
        'pricing_rules',
        'clients',
        'cars',
        'car_accidents',
        'policies',
        'policy_payments',
        'outside_cheques',
        'media_files',
        'invoice_templates',
        'invoices',
        'customer_signatures',
        'sms_settings',
        'payment_settings',
        'notifications'
      ];
      
      for (let i = 0; i < importOrder.length; i++) {
        const table = importOrder[i];
        setCurrentTable(table);
        setProgress(Math.round((i / importOrder.length) * 100));
        
        if (data[table] && data[table].length > 0) {
          // Insert in batches of 100
          const batchSize = 100;
          for (let j = 0; j < data[table].length; j += batchSize) {
            const batch = data[table].slice(j, j + batchSize);
            const { error } = await supabase
              .from(table as any)
              .upsert(batch, { onConflict: 'id' });
            
            if (error) {
              console.warn(`Error importing ${table}:`, error.message);
            }
          }
        }
      }
      
      setProgress(100);
      toast.success("تم استيراد البيانات بنجاح");
    } catch (error: any) {
      toast.error("خطأ في الاستيراد: " + error.message);
    } finally {
      setImporting(false);
      setCurrentTable("");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-3xl font-bold">نقل قاعدة البيانات</h1>
          <p className="text-muted-foreground">
            تصدير واستيراد البيانات للنقل إلى Supabase خارجي
          </p>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>تحذير مهم</AlertTitle>
          <AlertDescription>
            تأكد من تصدير البيانات قبل إلغاء اشتراك Lovable. بعد الإلغاء لن تتمكن من الوصول إلى قاعدة البيانات.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="export" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="export">تصدير البيانات</TabsTrigger>
            <TabsTrigger value="import">استيراد البيانات</TabsTrigger>
            <TabsTrigger value="guide">دليل النقل</TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileJson className="h-5 w-5" />
                    تصدير كل البيانات (JSON)
                  </CardTitle>
                  <CardDescription>
                    تحميل كل الجداول كملف JSON واحد
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={exportAllData} 
                    disabled={exporting}
                    className="w-full"
                  >
                    {exporting ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري التصدير... {currentTable}
                      </>
                    ) : (
                      <>
                        <Download className="ml-2 h-4 w-4" />
                        تصدير البيانات
                      </>
                    )}
                  </Button>
                  {exporting && (
                    <Progress value={progress} className="mt-4" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCode className="h-5 w-5" />
                    تحميل SQL Schema
                  </CardTitle>
                  <CardDescription>
                    ملف SQL كامل لإنشاء الجداول في Supabase جديد
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={downloadMigrationSQL}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="ml-2 h-4 w-4" />
                    تحميل migration.sql
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    تصدير روابط الوسائط
                  </CardTitle>
                  <CardDescription>
                    قائمة بكل روابط Bunny CDN
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={exportMediaLinks}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="ml-2 h-4 w-4" />
                    تصدير روابط الصور
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    الجداول المصدّرة
                  </CardTitle>
                  <CardDescription>
                    {TABLES_TO_EXPORT.length} جدول
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground max-h-32 overflow-y-auto">
                    {TABLES_TO_EXPORT.map(table => (
                      <div key={table} className="py-0.5">{table}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  استيراد البيانات
                </CardTitle>
                <CardDescription>
                  رفع ملف JSON المصدّر لاستيراد البيانات
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    استخدم هذه الميزة فقط في Supabase الجديد بعد تشغيل migration.sql
                  </AlertDescription>
                </Alert>
                
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    disabled={importing}
                    className="flex-1"
                  />
                </div>
                
                {importing && (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      جاري استيراد: {currentTable}
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guide" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>خطوات النقل إلى Supabase خارجي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      1
                    </div>
                    <div>
                      <h4 className="font-semibold">إنشاء مشروع Supabase مجاني</h4>
                      <p className="text-sm text-muted-foreground">
                        اذهب إلى <a href="https://supabase.com" target="_blank" className="text-primary underline">supabase.com</a> وأنشئ مشروع جديد
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      2
                    </div>
                    <div>
                      <h4 className="font-semibold">تشغيل migration.sql</h4>
                      <p className="text-sm text-muted-foreground">
                        في Supabase Dashboard → SQL Editor → انسخ والصق محتوى migration.sql
                      </p>
                      <Button 
                        onClick={downloadMigrationSQL}
                        variant="link"
                        className="p-0 h-auto"
                      >
                        تحميل migration.sql
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      3
                    </div>
                    <div>
                      <h4 className="font-semibold">تصدير البيانات من هنا</h4>
                      <p className="text-sm text-muted-foreground">
                        اضغط على "تصدير البيانات" في تبويب التصدير
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      4
                    </div>
                    <div>
                      <h4 className="font-semibold">تحديث .env في الكود</h4>
                      <p className="text-sm text-muted-foreground">
                        غيّر VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY إلى قيم المشروع الجديد
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      5
                    </div>
                    <div>
                      <h4 className="font-semibold">استيراد البيانات</h4>
                      <p className="text-sm text-muted-foreground">
                        في النسخة الجديدة → استخدم تبويب الاستيراد لرفع ملف JSON
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      6
                    </div>
                    <div>
                      <h4 className="font-semibold">نشر على Plesk</h4>
                      <p className="text-sm text-muted-foreground">
                        npm run build → ارفع مجلد dist إلى Plesk
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      7
                    </div>
                    <div>
                      <h4 className="font-semibold">نشر Edge Functions</h4>
                      <p className="text-sm text-muted-foreground">
                        استخدم Supabase CLI: supabase functions deploy --project-ref YOUR_PROJECT_ID
                      </p>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={downloadMigrationGuide}
                  className="w-full"
                >
                  <Download className="ml-2 h-4 w-4" />
                  تحميل دليل النقل الكامل
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
