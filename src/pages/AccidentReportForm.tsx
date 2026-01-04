import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertTriangle,
  ArrowRight,
  Save,
  Send,
  FileText,
  Download,
  Loader2,
  User,
  Car,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Users,
  Building2,
  CheckCircle,
} from "lucide-react";
import { AccidentThirdPartyForm } from "@/components/accident-reports/AccidentThirdPartyForm";

interface Policy {
  id: string;
  policy_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  cancelled: boolean | null;
  clients: {
    id: string;
    full_name: string;
    id_number: string;
    phone_number: string | null;
  };
  cars: {
    id: string;
    car_number: string;
    manufacturer_name: string | null;
    model: string | null;
    year: number | null;
  } | null;
  insurance_companies: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
}

interface AccidentReport {
  id: string;
  policy_id: string;
  client_id: string;
  car_id: string | null;
  company_id: string | null;
  branch_id: string | null;
  status: string;
  accident_date: string;
  accident_time: string | null;
  accident_location: string | null;
  accident_description: string | null;
  driver_name: string | null;
  driver_id_number: string | null;
  driver_phone: string | null;
  driver_license_number: string | null;
  police_reported: boolean;
  police_station: string | null;
  police_report_number: string | null;
  croquis_url: string | null;
  generated_pdf_url: string | null;
}

interface ThirdParty {
  id: string;
  full_name: string;
  id_number: string | null;
  phone: string | null;
  address: string | null;
  vehicle_number: string | null;
  vehicle_type: string | null;
  vehicle_manufacturer: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  insurance_company: string | null;
  insurance_policy_number: string | null;
  damage_description: string | null;
  sort_order: number;
  isNew?: boolean;
}

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُقدَّم",
  closed: "مُغلق",
};

const statusColors: Record<string, string> = {
  draft: "bg-yellow-500/10 text-yellow-700",
  submitted: "bg-blue-500/10 text-blue-700",
  closed: "bg-green-500/10 text-green-700",
};

export default function AccidentReportForm() {
  const { policyId, reportId } = useParams<{ policyId: string; reportId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, branchId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [report, setReport] = useState<AccidentReport | null>(null);
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);

  // Form state
  const [accidentDate, setAccidentDate] = useState("");
  const [accidentTime, setAccidentTime] = useState("");
  const [accidentLocation, setAccidentLocation] = useState("");
  const [accidentDescription, setAccidentDescription] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverIdNumber, setDriverIdNumber] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [policeReported, setPoliceReported] = useState(false);
  const [policeStation, setPoliceStation] = useState("");
  const [policeReportNumber, setPoliceReportNumber] = useState("");

  const [activeTab, setActiveTab] = useState("accident");

  const fetchPolicy = useCallback(async () => {
    if (!policyId) return;

    const { data, error } = await supabase
      .from("policies")
      .select(`
        id,
        policy_number,
        policy_type_parent,
        policy_type_child,
        start_date,
        end_date,
        cancelled,
        clients!inner(id, full_name, id_number, phone_number),
        cars(id, car_number, manufacturer_name, model, year),
        insurance_companies(id, name, name_ar)
      `)
      .eq("id", policyId)
      .single();

    if (error) {
      console.error("Error fetching policy:", error);
      toast({ title: "خطأ", description: "فشل في تحميل بيانات الوثيقة", variant: "destructive" });
      return;
    }

    setPolicy(data as Policy);

    // Pre-fill driver info from client
    if (!reportId) {
      setDriverName(data.clients.full_name);
      setDriverIdNumber(data.clients.id_number);
      setDriverPhone(data.clients.phone_number || "");
    }
  }, [policyId, reportId, toast]);

  const fetchReport = useCallback(async () => {
    if (!reportId || reportId === "new") return;

    const { data, error } = await supabase
      .from("accident_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (error) {
      console.error("Error fetching report:", error);
      toast({ title: "خطأ", description: "فشل في تحميل بلاغ الحادث", variant: "destructive" });
      return;
    }

    setReport(data);

    // Populate form
    setAccidentDate(data.accident_date || "");
    setAccidentTime(data.accident_time || "");
    setAccidentLocation(data.accident_location || "");
    setAccidentDescription(data.accident_description || "");
    setDriverName(data.driver_name || "");
    setDriverIdNumber(data.driver_id_number || "");
    setDriverPhone(data.driver_phone || "");
    setDriverLicenseNumber(data.driver_license_number || "");
    setPoliceReported(data.police_reported || false);
    setPoliceStation(data.police_station || "");
    setPoliceReportNumber(data.police_report_number || "");

    // Fetch third parties
    const { data: tpData } = await supabase
      .from("accident_third_parties")
      .select("*")
      .eq("accident_report_id", reportId)
      .order("sort_order");

    if (tpData) setThirdParties(tpData);
  }, [reportId, toast]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchPolicy();
      await fetchReport();
      setLoading(false);
    };
    init();
  }, [fetchPolicy, fetchReport]);

  const handleSave = async () => {
    if (!policy) return;

    if (!accidentDate) {
      toast({ title: "خطأ", description: "تاريخ الحادث مطلوب", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const reportData = {
        policy_id: policy.id,
        client_id: policy.clients.id,
        car_id: policy.cars?.id || null,
        company_id: policy.insurance_companies?.id || null,
        branch_id: branchId || null,
        accident_date: accidentDate,
        accident_time: accidentTime || null,
        accident_location: accidentLocation || null,
        accident_description: accidentDescription || null,
        driver_name: driverName || null,
        driver_id_number: driverIdNumber || null,
        driver_phone: driverPhone || null,
        driver_license_number: driverLicenseNumber || null,
        police_reported: policeReported,
        police_station: policeStation || null,
        police_report_number: policeReportNumber || null,
      };

      let savedReportId = report?.id;

      if (report) {
        // Update existing
        const { error } = await supabase
          .from("accident_reports")
          .update(reportData)
          .eq("id", report.id);

        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("accident_reports")
          .insert({
            ...reportData,
            created_by_admin_id: profile?.id,
            status: "draft",
          })
          .select("id")
          .single();

        if (error) throw error;
        savedReportId = data.id;

        // Update URL to include report ID
        navigate(`/policies/${policyId}/accident/${savedReportId}`, { replace: true });
      }

      // Save third parties
      if (savedReportId) {
        // Delete removed third parties
        const existingIds = thirdParties.filter(tp => !tp.isNew).map(tp => tp.id);
        await supabase
          .from("accident_third_parties")
          .delete()
          .eq("accident_report_id", savedReportId)
          .not("id", "in", `(${existingIds.length > 0 ? existingIds.join(",") : "''"})`);

        // Upsert third parties
        for (let i = 0; i < thirdParties.length; i++) {
          const tp = thirdParties[i];
          const tpData = {
            accident_report_id: savedReportId,
            full_name: tp.full_name,
            id_number: tp.id_number,
            phone: tp.phone,
            address: tp.address,
            vehicle_number: tp.vehicle_number,
            vehicle_type: tp.vehicle_type,
            vehicle_manufacturer: tp.vehicle_manufacturer,
            vehicle_model: tp.vehicle_model,
            vehicle_year: tp.vehicle_year,
            vehicle_color: tp.vehicle_color,
            insurance_company: tp.insurance_company,
            insurance_policy_number: tp.insurance_policy_number,
            damage_description: tp.damage_description,
            sort_order: i,
          };

          if (tp.isNew) {
            const { data } = await supabase
              .from("accident_third_parties")
              .insert(tpData)
              .select("id")
              .single();
            if (data) {
              tp.id = data.id;
              tp.isNew = false;
            }
          } else {
            await supabase
              .from("accident_third_parties")
              .update(tpData)
              .eq("id", tp.id);
          }
        }
      }

      toast({ title: "تم الحفظ", description: "تم حفظ بلاغ الحادث بنجاح" });
      
      // Refresh data
      await fetchReport();
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast({ title: "خطأ", description: error.message || "فشل في حفظ البلاغ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!report) {
      toast({ title: "خطأ", description: "يجب حفظ البلاغ أولاً", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("accident_reports")
        .update({ status: "submitted" })
        .eq("id", report.id);

      if (error) throw error;

      toast({ title: "تم التقديم", description: "تم تقديم بلاغ الحادث بنجاح" });
      await fetchReport();
    } catch (error: any) {
      console.error("Error submitting report:", error);
      toast({ title: "خطأ", description: "فشل في تقديم البلاغ", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!report) {
      toast({ title: "خطأ", description: "يجب حفظ البلاغ أولاً", variant: "destructive" });
      return;
    }

    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-accident-pdf", {
        body: { accident_report_id: report.id },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({ title: "تم الإنشاء", description: "تم إنشاء ملف PDF بنجاح" });
      await fetchReport();
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في إنشاء ملف PDF", 
        variant: "destructive" 
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const addThirdParty = () => {
    setThirdParties([
      ...thirdParties,
      {
        id: crypto.randomUUID(),
        full_name: "",
        id_number: null,
        phone: null,
        address: null,
        vehicle_number: null,
        vehicle_type: null,
        vehicle_manufacturer: null,
        vehicle_model: null,
        vehicle_year: null,
        vehicle_color: null,
        insurance_company: null,
        insurance_policy_number: null,
        damage_description: null,
        sort_order: thirdParties.length,
        isNew: true,
      },
    ]);
  };

  const removeThirdParty = (id: string) => {
    setThirdParties(thirdParties.filter(tp => tp.id !== id));
  };

  const updateThirdParty = (id: string, updates: Partial<ThirdParty>) => {
    setThirdParties(thirdParties.map(tp => 
      tp.id === id ? { ...tp, ...updates } : tp
    ));
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-6 p-6" dir="rtl">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!policy) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4" dir="rtl">
          <AlertTriangle className="h-16 w-16 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">لم يتم العثور على الوثيقة</p>
          <Button onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </MainLayout>
    );
  }

  // Check if policy type is eligible
  if (policy.policy_type_child !== "THIRD" && policy.policy_type_child !== "FULL") {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4" dir="rtl">
          <AlertTriangle className="h-16 w-16 text-amber-500" />
          <p className="text-lg text-muted-foreground">بلاغ الحادث متاح فقط لوثائق طرف ثالث وشامل</p>
          <Button onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
                بلاغ حادث
              </h1>
              <p className="text-muted-foreground text-sm">
                وثيقة: {policy.policy_number || policy.id.slice(0, 8)} • 
                {policy.clients.full_name} • 
                {policy.cars?.car_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {report && (
              <Badge className={statusColors[report.status]}>
                {statusLabels[report.status]}
              </Badge>
            )}
          </div>
        </div>

        {/* Policy Info Card */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">العميل</p>
                <p className="font-medium flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {policy.clients.full_name}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">السيارة</p>
                <p className="font-medium flex items-center gap-1">
                  <Car className="h-4 w-4" />
                  {policy.cars?.car_number || "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">الشركة</p>
                <p className="font-medium flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {policy.insurance_companies?.name_ar || policy.insurance_companies?.name || "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">نوع الوثيقة</p>
                <p className="font-medium">
                  {policy.policy_type_child === "THIRD" ? "طرف ثالث" : "شامل"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="accident" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              تفاصيل الحادث
            </TabsTrigger>
            <TabsTrigger value="driver" className="gap-2">
              <User className="h-4 w-4" />
              السائق / المؤمن له
            </TabsTrigger>
            <TabsTrigger value="third-party" className="gap-2">
              <Users className="h-4 w-4" />
              الطرف الثالث
              {thirdParties.length > 0 && (
                <Badge variant="secondary" className="mr-1">{thirdParties.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="attachments" className="gap-2">
              <FileText className="h-4 w-4" />
              المرفقات
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(100vh-400px)] mt-4">
            {/* Accident Details Tab */}
            <TabsContent value="accident" className="space-y-4 m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">تفاصيل الحادث</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>تاريخ الحادث *</Label>
                      <Input
                        type="date"
                        value={accidentDate}
                        onChange={(e) => setAccidentDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>وقت الحادث</Label>
                      <Input
                        type="time"
                        value={accidentTime}
                        onChange={(e) => setAccidentTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>موقع الحادث</Label>
                    <div className="relative">
                      <MapPin className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={accidentLocation}
                        onChange={(e) => setAccidentLocation(e.target.value)}
                        className="pr-10"
                        placeholder="العنوان / الموقع بالتفصيل"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>وصف الحادث</Label>
                    <Textarea
                      value={accidentDescription}
                      onChange={(e) => setAccidentDescription(e.target.value)}
                      placeholder="وصف تفصيلي لظروف وملابسات الحادث..."
                      rows={5}
                    />
                  </div>

                  {/* Police Section */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <Label className="text-base font-medium">هل تم التبليغ للشرطة؟</Label>
                      <Switch
                        checked={policeReported}
                        onCheckedChange={setPoliceReported}
                      />
                    </div>

                    {policeReported && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>مخفر الشرطة</Label>
                          <Input
                            value={policeStation}
                            onChange={(e) => setPoliceStation(e.target.value)}
                            placeholder="اسم المخفر"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>رقم المحضر</Label>
                          <Input
                            value={policeReportNumber}
                            onChange={(e) => setPoliceReportNumber(e.target.value)}
                            placeholder="رقم محضر الشرطة"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Driver Tab */}
            <TabsContent value="driver" className="space-y-4 m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">بيانات السائق / المؤمن له</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>الاسم الكامل</Label>
                      <Input
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="اسم السائق"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>رقم الهوية</Label>
                      <Input
                        value={driverIdNumber}
                        onChange={(e) => setDriverIdNumber(e.target.value)}
                        placeholder="رقم الهوية"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>رقم الهاتف</Label>
                      <div className="relative">
                        <Phone className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={driverPhone}
                          onChange={(e) => setDriverPhone(e.target.value)}
                          className="pr-10"
                          placeholder="رقم الهاتف"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>رقم رخصة القيادة</Label>
                      <Input
                        value={driverLicenseNumber}
                        onChange={(e) => setDriverLicenseNumber(e.target.value)}
                        placeholder="رقم الرخصة"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Third Party Tab */}
            <TabsContent value="third-party" className="space-y-4 m-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">الأطراف الثالثة</h3>
                <Button onClick={addThirdParty} size="sm">
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة طرف ثالث
                </Button>
              </div>

              {thirdParties.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لم يتم إضافة أطراف ثالثة بعد</p>
                    <Button onClick={addThirdParty} variant="outline" className="mt-4">
                      <Plus className="h-4 w-4 ml-2" />
                      إضافة طرف ثالث
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {thirdParties.map((tp, index) => (
                    <AccidentThirdPartyForm
                      key={tp.id}
                      thirdParty={tp}
                      index={index}
                      onChange={(updates) => updateThirdParty(tp.id, updates)}
                      onRemove={() => removeThirdParty(tp.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Attachments Tab */}
            <TabsContent value="attachments" className="space-y-4 m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">المرفقات والملفات</CardTitle>
                </CardHeader>
                <CardContent>
                  {report?.generated_pdf_url ? (
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-red-500" />
                        <div>
                          <p className="font-medium">بلاغ الحادث (PDF)</p>
                          <p className="text-sm text-muted-foreground">تم الإنشاء</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(report.generated_pdf_url!, "_blank")}
                        >
                          <Download className="h-4 w-4 ml-2" />
                          تحميل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGeneratePdf}
                          disabled={generatingPdf}
                        >
                          {generatingPdf ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "إعادة الإنشاء"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>لم يتم إنشاء ملف PDF بعد</p>
                      <p className="text-sm">احفظ البلاغ ثم اضغط على "إنشاء PDF"</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            إلغاء
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Save className="h-4 w-4 ml-2" />
              )}
              حفظ المسودة
            </Button>

            {report && (
              <>
                <Button
                  variant="outline"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                >
                  {generatingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <FileText className="h-4 w-4 ml-2" />
                  )}
                  إنشاء PDF
                </Button>

                {report.status === "draft" && (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Send className="h-4 w-4 ml-2" />
                    )}
                    تقديم البلاغ
                  </Button>
                )}

                {report.status === "submitted" && (
                  <Badge className="bg-green-500/10 text-green-700 gap-1 py-2">
                    <CheckCircle className="h-4 w-4" />
                    تم التقديم
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
