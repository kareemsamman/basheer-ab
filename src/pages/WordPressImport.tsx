import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Trash2, FileJson, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface PreviewCounts {
  insuranceCompanies: number;
  pricingRules: number;
  brokers: number;
  clients: number;
  cars: number;
  policies: number;
  payments: number;
  outsideCheques: number;
  invoices: number;
  mediaFiles: number;
  carAccidents: number;
}

interface ImportStats {
  [key: string]: { inserted: number; updated: number; errors: string[] };
}

interface ImportStep {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  count: number;
}

const BATCH_SIZE = 50; // Process 50 items at a time

const WordPressImport = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [jsonData, setJsonData] = useState<any>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<PreviewCounts | null>(null);
  const [clearBeforeImport, setClearBeforeImport] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [steps, setSteps] = useState<ImportStep[]>([]);

  const entityLabels: Record<string, string> = {
    companies: "شركات التأمين",
    brokers: "الوسطاء",
    clients: "العملاء",
    cars: "السيارات",
    policies: "الوثائق",
    payments: "المدفوعات",
    outsideCheques: "الشيكات الخارجية",
    media: "ملفات الوسائط",
    insuranceCompanies: "شركات التأمين",
    pricingRules: "قواعد التسعير",
    invoices: "الفواتير",
    mediaFiles: "ملفات الوسائط",
    carAccidents: "حوادث السيارات",
  };

  // Extract unique companies from policies
  const extractCompaniesFromPolicies = (policies: any[]): any[] => {
    const companiesMap = new Map<string, any>();
    for (const policy of policies || []) {
      if (policy.company_details && policy.company_name) {
        const companyName = policy.company_name.toLowerCase();
        if (!companiesMap.has(companyName)) {
          companiesMap.set(companyName, {
            name: policy.company_name,
            legacy_wp_id: policy.company_legacy_id,
            category_parent: mapCategoryFromParentTerm(policy.company_details.parent_term_name),
          });
        }
      }
    }
    return Array.from(companiesMap.values());
  };

  const mapCategoryFromParentTerm = (termName: string | null | undefined): string | null => {
    if (!termName) return null;
    const mapping: Record<string, string> = {
      'الزامي': 'ELZAMI',
      'ثالث/شامل': 'THIRD_FULL',
      'خدمات الطريق': 'ROAD_SERVICE',
      'اعفاء رسوم حادث': 'ACCIDENT_FEE_EXEMPTION',
    };
    return mapping[termName] || null;
  };

  // Extract unique cars from policies
  const extractCarsFromPolicies = (policies: any[]): any[] => {
    const carsMap = new Map<string, any>();
    for (const policy of policies || []) {
      if (policy.car_details && policy.car_number) {
        const carNumber = policy.car_number;
        if (!carsMap.has(carNumber)) {
          carsMap.set(carNumber, {
            ...policy.car_details,
            car_number: carNumber,
            client_id_number: policy.client_details?.id_number,
          });
        }
      }
    }
    return Array.from(carsMap.values());
  };

  // Extract policies with simplified structure
  const extractPolicies = (policies: any[]): any[] => {
    return (policies || []).map(p => ({
      legacy_wp_id: p.legacy_wp_id,
      policy_number_hint: p.policy_number_hint,
      client_id_number: p.client_details?.id_number,
      car_number: p.car_number,
      company_name: p.company_name,
      broker_name: p.broker_name,
      policy_type_parent: p.policy_type_parent,
      policy_type_child: p.policy_type_child,
      start_date: p.start_date,
      end_date: p.end_date,
      insurance_price: p.insurance_price,
      profit: p.profit,
      payed_for_company: p.payed_for_company,
      is_under_24: p.is_under_24,
      cancelled: p.cancelled,
      transferred: p.transferred,
      transferred_car_number: p.transferred_car_number,
      notes: p.notes,
      calc_status: p.calc_status,
    }));
  };

  // Extract payments from policies - enhanced to handle payment_way and notes
  const extractPayments = (policies: any[]): any[] => {
    const payments: any[] = [];
    for (const policy of policies || []) {
      // Extract payment_way from policy notes for mapping
      const policyNotes = policy.notes || '';
      const paymentWay = policy.payment_way || '';
      
      for (const payment of policy.payments || []) {
        // Use payment_type from payment, fallback to payment_way, then check notes
        let paymentType = payment.payment_type || paymentWay;
        if (!paymentType && policyNotes.includes('Payment Way:')) {
          const match = policyNotes.match(/Payment Way:\s*(\w+)/i);
          if (match) paymentType = match[1];
        }
        
        payments.push({
          policy_legacy_wp_id: policy.legacy_wp_id,
          payment_type: paymentType,
          check_number: payment.check_number || payment.cheque_number || '',
          amount: payment.amount,
          date: payment.date,
          check_image_url: payment.check_image_url || payment.cheque_image_url || '',
          refused_status: payment.refused_status,
          policy_notes: policyNotes, // Pass notes for server-side fallback
        });
      }
    }
    return payments;
  };

  // Extract media (images array) from policies
  const extractMedia = (policies: any[]): any[] => {
    const media: any[] = [];
    for (const policy of policies || []) {
      for (const url of policy.images || []) {
        if (url) {
          media.push({
            policy_legacy_wp_id: policy.legacy_wp_id,
            url,
          });
        }
      }
    }
    return media;
  };

  // Extract invoices (PDFs) from policies
  const extractInvoices = (policies: any[]): any[] => {
    const invoices: any[] = [];
    for (const policy of policies || []) {
      for (const invoice of policy.invoices || []) {
        if (invoice.pdf) {
          invoices.push({
            policy_legacy_wp_id: policy.legacy_wp_id,
            pdf: invoice.pdf,
            date: invoice.date,
            amount: invoice.amount_of_fatoorah,
          });
        }
      }
    }
    return invoices;
  };

  // Count data for preview
  const countData = (data: any): PreviewCounts => {
    const policies = data.policies || [];
    const companiesMap = new Map<string, any>();
    const carsMap = new Map<string, any>();
    let paymentsCount = 0;
    let mediaCount = 0;
    let invoicesCount = 0;

    for (const policy of policies) {
      if (policy.company_name) companiesMap.set(policy.company_name.toLowerCase(), true);
      if (policy.car_number) carsMap.set(policy.car_number, true);
      paymentsCount += (policy.payments || []).length;
      mediaCount += (policy.images || []).length;
      invoicesCount += (policy.invoices || []).filter((i: any) => i.pdf).length;
    }

    return {
      insuranceCompanies: companiesMap.size,
      pricingRules: 0,
      brokers: (data.brokers || []).length,
      clients: (data.clients || []).length,
      cars: carsMap.size,
      policies: policies.length,
      payments: paymentsCount,
      outsideCheques: (data.outside_cheques || []).length,
      invoices: invoicesCount,
      mediaFiles: mediaCount,
      carAccidents: 0,
    };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({ title: "خطأ", description: "يرجى اختيار ملف JSON", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    setImportStats(null);
    setSteps([]);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setJsonData(data);

      // Calculate preview counts locally (no API call needed for large files)
      const counts = countData(data);
      setPreview(counts);
      toast({ title: "تم تحميل الملف", description: `${(file.size / 1024 / 1024).toFixed(2)} MB` });
    } catch (err: any) {
      toast({ title: "خطأ في قراءة الملف", description: err.message, variant: "destructive" });
      setJsonData(null);
      setPreview(null);
    }
  };

  // Chunk array into batches
  const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  const handleImport = async () => {
    if (!jsonData) return;

    setImporting(true);
    setProgress(0);
    setImportStats(null);

    const stats: ImportStats = {
      companies: { inserted: 0, updated: 0, errors: [] },
      brokers: { inserted: 0, updated: 0, errors: [] },
      clients: { inserted: 0, updated: 0, errors: [] },
      cars: { inserted: 0, updated: 0, errors: [] },
      policies: { inserted: 0, updated: 0, errors: [] },
      payments: { inserted: 0, updated: 0, errors: [] },
      media: { inserted: 0, updated: 0, errors: [] },
      invoices: { inserted: 0, updated: 0, errors: [] },
      outsideCheques: { inserted: 0, updated: 0, errors: [] },
    };

    // Initialize steps
    const initialSteps: ImportStep[] = [
      { key: 'clear', label: 'تنظيف البيانات', status: 'pending', count: 0 },
      { key: 'companies', label: 'شركات التأمين', status: 'pending', count: 0 },
      { key: 'brokers', label: 'الوسطاء', status: 'pending', count: 0 },
      { key: 'clients', label: 'العملاء', status: 'pending', count: 0 },
      { key: 'cars', label: 'السيارات', status: 'pending', count: 0 },
      { key: 'policies', label: 'الوثائق', status: 'pending', count: 0 },
      { key: 'payments', label: 'المدفوعات', status: 'pending', count: 0 },
      { key: 'media', label: 'ملفات الوسائط', status: 'pending', count: 0 },
      { key: 'invoices', label: 'فواتير PDF', status: 'pending', count: 0 },
      { key: 'outsideCheques', label: 'الشيكات الخارجية', status: 'pending', count: 0 },
    ];
    setSteps(initialSteps);

    const updateStep = (key: string, status: ImportStep['status'], count?: number) => {
      setSteps(prev => prev.map(s => s.key === key ? { ...s, status, count: count ?? s.count } : s));
      setCurrentStep(key);
    };

    try {
      // Step 1: Clear data if requested
      if (clearBeforeImport) {
        updateStep('clear', 'running');
        const { error } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'clear' }
        });
        if (error) throw error;
        updateStep('clear', 'done');
      } else {
        updateStep('clear', 'done');
      }
      setProgress(5);

      // Step 2: Get existing mappings
      const { data: mappingsResult } = await supabase.functions.invoke('wordpress-import', {
        body: { action: 'getMappings' }
      });
      let mappings = mappingsResult?.mappings || { companies: {}, brokers: {}, clients: {}, cars: {}, policies: {} };

      // Step 3: Import companies
      const companies = extractCompaniesFromPolicies(jsonData.policies || []);
      updateStep('companies', 'running', companies.length);
      for (const batch of chunkArray(companies, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'companies', batch, data: { mappings } }
        });
        if (result) {
          stats.companies.inserted += result.stats.inserted;
          stats.companies.updated += result.stats.updated;
          stats.companies.errors.push(...result.stats.errors);
          mappings.companies = { ...mappings.companies, ...result.newMappings };
        }
      }
      updateStep('companies', 'done', companies.length);
      setProgress(15);

      // Step 4: Import brokers
      const brokers = jsonData.brokers || [];
      updateStep('brokers', 'running', brokers.length);
      for (const batch of chunkArray(brokers, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'brokers', batch, data: { mappings } }
        });
        if (result) {
          stats.brokers.inserted += result.stats.inserted;
          stats.brokers.updated += result.stats.updated;
          stats.brokers.errors.push(...result.stats.errors);
          mappings.brokers = { ...mappings.brokers, ...result.newMappings };
        }
      }
      updateStep('brokers', 'done', brokers.length);
      setProgress(25);

      // Step 5: Import clients
      const clients = jsonData.clients || [];
      updateStep('clients', 'running', clients.length);
      for (const batch of chunkArray(clients, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'clients', batch, data: { mappings } }
        });
        if (result) {
          stats.clients.inserted += result.stats.inserted;
          stats.clients.updated += result.stats.updated;
          stats.clients.errors.push(...result.stats.errors);
          mappings.clients = { ...mappings.clients, ...result.newMappings };
        }
      }
      updateStep('clients', 'done', clients.length);
      setProgress(40);

      // Step 6: Import cars
      const cars = extractCarsFromPolicies(jsonData.policies || []);
      updateStep('cars', 'running', cars.length);
      for (const batch of chunkArray(cars, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'cars', batch, data: { mappings } }
        });
        if (result) {
          stats.cars.inserted += result.stats.inserted;
          stats.cars.updated += result.stats.updated;
          stats.cars.errors.push(...result.stats.errors);
          mappings.cars = { ...mappings.cars, ...result.newMappings };
        }
      }
      updateStep('cars', 'done', cars.length);
      setProgress(55);

      // Step 7: Import policies
      const policies = extractPolicies(jsonData.policies || []);
      updateStep('policies', 'running', policies.length);
      for (const batch of chunkArray(policies, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'policies', batch, data: { mappings } }
        });
        if (result) {
          stats.policies.inserted += result.stats.inserted;
          stats.policies.updated += result.stats.updated;
          stats.policies.errors.push(...result.stats.errors);
          mappings.policies = { ...mappings.policies, ...result.newMappings };
        }
      }
      updateStep('policies', 'done', policies.length);
      setProgress(75);

      // Step 8: Import payments
      const payments = extractPayments(jsonData.policies || []);
      updateStep('payments', 'running', payments.length);
      for (const batch of chunkArray(payments, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'payments', batch, data: { mappings } }
        });
        if (result) {
          stats.payments.inserted += result.stats.inserted;
          stats.payments.updated += result.stats.updated;
          stats.payments.errors.push(...result.stats.errors);
        }
      }
      updateStep('payments', 'done', payments.length);
      setProgress(85);

      // Step 9: Import media
      const media = extractMedia(jsonData.policies || []);
      updateStep('media', 'running', media.length);
      for (const batch of chunkArray(media, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'media', batch, data: { mappings } }
        });
        if (result) {
          stats.media.inserted += result.stats.inserted;
          stats.media.updated += result.stats.updated;
          stats.media.errors.push(...result.stats.errors);
        }
      }
      updateStep('media', 'done', media.length);
      setProgress(88);

      // Step 10: Import invoices (PDFs)
      const invoices = extractInvoices(jsonData.policies || []);
      updateStep('invoices', 'running', invoices.length);
      for (const batch of chunkArray(invoices, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'invoices', batch, data: { mappings } }
        });
        if (result) {
          stats.invoices.inserted += result.stats.inserted;
          stats.invoices.updated += result.stats.updated;
          stats.invoices.errors.push(...result.stats.errors);
        }
      }
      updateStep('invoices', 'done', invoices.length);
      setProgress(94);

      // Step 11: Import outside cheques
      const outsideCheques = jsonData.outside_cheques || [];
      updateStep('outsideCheques', 'running', outsideCheques.length);
      for (const batch of chunkArray(outsideCheques, BATCH_SIZE)) {
        const { data: result } = await supabase.functions.invoke('wordpress-import', {
          body: { action: 'importBatch', entityType: 'outsideCheques', batch, data: { mappings } }
        });
        if (result) {
          stats.outsideCheques.inserted += result.stats.inserted;
          stats.outsideCheques.updated += result.stats.updated;
          stats.outsideCheques.errors.push(...result.stats.errors);
        }
      }
      updateStep('outsideCheques', 'done', outsideCheques.length);
      setProgress(100);

      setImportStats(stats);
      setCurrentStep("");
      toast({ title: "تم الاستيراد بنجاح", description: "تم استيراد البيانات من WordPress" });
    } catch (err: any) {
      toast({ title: "خطأ في الاستيراد", description: err.message, variant: "destructive" });
      updateStep(currentStep, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleClearAll = async () => {
    if (deleteConfirmText !== "DELETE ALL") return;

    setClearing(true);
    try {
      const { error } = await supabase.functions.invoke('wordpress-import', {
        body: { action: 'clear' }
      });

      if (error) throw error;
      toast({ title: "تم الحذف", description: "تم حذف جميع البيانات بنجاح" });
      setDeleteConfirmText("");
    } catch (err: any) {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">ليس لديك صلاحية الوصول لهذه الصفحة</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">استيراد بيانات WordPress</h1>
          <p className="text-muted-foreground">استيراد البيانات من نظام WordPress القديم</p>
        </div>

        {/* File Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              تحميل ملف JSON
            </CardTitle>
            <CardDescription>قم بتحميل ملف التصدير من WordPress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full">
              <Upload className="h-4 w-4 ml-2" />
              {fileName || "اختر ملف JSON"}
            </Button>

            {preview && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                {Object.entries(preview).map(([key, count]) => (
                  <div key={key} className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">{entityLabels[key]}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Import Options */}
        {jsonData && (
          <Card>
            <CardHeader>
              <CardTitle>خيارات الاستيراد</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="clear"
                  checked={clearBeforeImport}
                  onCheckedChange={(v) => setClearBeforeImport(v === true)}
                />
                <Label htmlFor="clear" className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  حذف جميع البيانات قبل الاستيراد
                </Label>
              </div>

              {importing && (
                <div className="space-y-3">
                  <Progress value={progress} className="w-full" />
                  <div className="text-sm text-muted-foreground text-center">
                    {progress}%
                  </div>
                </div>
              )}

              {/* Import Steps Progress */}
              {steps.length > 0 && (
                <div className="space-y-2 border rounded-lg p-4">
                  {steps.map((step) => (
                    <div key={step.key} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {step.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-muted" />}
                        {step.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                        {step.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {step.status === 'error' && <XCircle className="w-4 h-4 text-destructive" />}
                        <span className={step.status === 'running' ? 'font-medium text-primary' : ''}>{step.label}</span>
                      </div>
                      {step.count > 0 && <Badge variant="outline">{step.count}</Badge>}
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={handleImport} disabled={importing} className="w-full">
                {importing ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Upload className="h-4 w-4 ml-2" />}
                {importing ? "جاري الاستيراد..." : "بدء الاستيراد"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Import Results */}
        {importStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                نتائج الاستيراد
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(importStats).map(([key, stats]) => (
                  <div key={key} className="flex items-center justify-between p-2 border rounded">
                    <span>{entityLabels[key]}</span>
                    <div className="flex gap-2">
                      <Badge variant="default">{stats.inserted} جديد</Badge>
                      <Badge variant="secondary">{stats.updated} محدث</Badge>
                      {stats.errors.length > 0 && (
                        <Badge variant="destructive">{stats.errors.length} أخطاء</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {Object.values(importStats).some(s => s.errors.length > 0) && (
                <div className="mt-4">
                  <Separator className="my-4" />
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    الأخطاء
                  </h4>
                  <ScrollArea className="h-40 border rounded p-2">
                    {Object.entries(importStats).map(([key, stats]) =>
                      stats.errors.map((err, i) => (
                        <p key={`${key}-${i}`} className="text-sm text-destructive">{err}</p>
                      ))
                    )}
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Clear All Data */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              حذف جميع البيانات
            </CardTitle>
            <CardDescription>
              سيتم حذف: العملاء، السيارات، الوثائق، المدفوعات، الفواتير، الوسائط، الحوادث، الوسطاء
              <br />
              <strong>لن يتم حذف:</strong> شركات التأمين، قواعد التسعير، الفروع، المستخدمين
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف جميع البيانات
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                  <AlertDialogDescription>
                    هذا الإجراء لا يمكن التراجع عنه. اكتب "DELETE ALL" للتأكيد.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE ALL"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearAll}
                    disabled={deleteConfirmText !== "DELETE ALL" || clearing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {clearing ? "جاري الحذف..." : "حذف"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default WordPressImport;
