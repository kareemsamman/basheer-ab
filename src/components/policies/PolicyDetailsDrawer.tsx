import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  User,
  Car,
  Building2,
  Pencil,
  CreditCard,
  Phone,
  Banknote,
  ImageIcon,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  AlertTriangle,
  Send,
  Loader2,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PolicyEditDrawer } from "./PolicyEditDrawer";
import { PolicyPaymentsSection } from "./PolicyPaymentsSection";
import { PolicyFilesSection } from "./PolicyFilesSection";
import { PolicyInvoicesSection } from "./PolicyInvoicesSection";

interface PolicyDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string | null;
  onUpdated?: () => void;
  onViewRelatedPolicy?: (policyId: string) => void;
}

interface PolicyDetails {
  id: string;
  policy_type_parent: string;
  policy_type_child: string | null;
  policy_number: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  payed_for_company: number | null;
  profit: number | null;
  cancelled: boolean | null;
  transferred: boolean | null;
  transferred_car_number: string | null;
  is_under_24: boolean | null;
  notes: string | null;
  legacy_wp_id: number | null;
  created_at: string;
  updated_at: string;
  broker_id: string | null;
  created_by_admin_id: string | null;
  group_id: string | null;
  road_service_id: string | null;
  clients: {
    id: string;
    full_name: string;
    phone_number: string | null;
    file_number: string | null;
    id_number: string;
    less_than_24: boolean | null;
    signature_url: string | null;
    under24_type?: 'none' | 'client' | 'additional_driver' | null;
    under24_driver_name?: string | null;
    under24_driver_id?: string | null;
  };
  cars: {
    id: string;
    car_number: string;
    manufacturer_name: string | null;
    year: number | null;
    car_type: string | null;
    car_value: number | null;
    model: string | null;
    color: string | null;
  } | null;
  insurance_companies: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
  brokers?: {
    id: string;
    name: string;
  } | null;
  road_services?: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
}

interface RelatedPolicy {
  id: string;
  policy_type_parent: string;
  policy_type_child: string | null;
  insurance_price: number;
  profit: number | null;
  road_service_id: string | null;
  insurance_companies: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
  road_services: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
}

interface PaymentImage {
  id: string;
  image_url: string;
  image_type: string;
}

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  payment_date: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  cheque_status: string | null;
  refused: boolean | null;
  notes: string | null;
  images?: PaymentImage[];
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: "إلزامي",
  THIRD_FULL: "ثالث/شامل",
  ROAD_SERVICE: "خدمات الطريق",
  ACCIDENT_FEE_EXEMPTION: "إعفاء رسوم حادث",
};

const policyChildLabels: Record<string, string> = {
  THIRD: "طرف ثالث",
  FULL: "شامل",
};

const policyTypeColors: Record<string, string> = {
  ELZAMI: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  THIRD_FULL: "bg-purple-500/10 text-purple-700 border-purple-500/20",
  ROAD_SERVICE: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  ACCIDENT_FEE_EXEMPTION: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  HEALTH: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  LIFE: "bg-teal-500/10 text-teal-700 border-teal-500/20",
  PROPERTY: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  TRAVEL: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
  BUSINESS: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
  OTHER: "bg-slate-500/10 text-slate-700 border-slate-500/20",
};

const carTypeLabels: Record<string, string> = {
  car: "خصوصي",
  cargo: "شحن",
  small: "صغير",
  taxi: "تاكسي",
  tjeradown4: "تجاري (أقل من 4 طن)",
  tjeraup4: "تجاري (أكثر من 4 طن)",
};

export function PolicyDetailsDrawer({ open, onOpenChange, policyId, onUpdated, onViewRelatedPolicy }: PolicyDetailsDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<PolicyDetails | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("insurance");
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [sendingSignatureSms, setSendingSignatureSms] = useState(false);
  const [relatedPolicies, setRelatedPolicies] = useState<RelatedPolicy[]>([]);

  const handleSendSignatureSms = async () => {
    if (!policy || !policy.clients.phone_number) {
      toast({ title: "خطأ", description: "رقم هاتف العميل مطلوب", variant: "destructive" });
      return;
    }

    setSendingSignatureSms(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-signature-sms", {
        body: { 
          client_id: policy.clients.id,
          policy_id: policy.id 
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({ 
        title: "تم الإرسال", 
        description: "تم إرسال رابط التوقيع للعميل بنجاح" 
      });
    } catch (error: any) {
      console.error("Error sending signature SMS:", error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في إرسال طلب التوقيع", 
        variant: "destructive" 
      });
    } finally {
      setSendingSignatureSms(false);
    }
  };

  const fetchPolicyDetails = async () => {
    if (!policyId) return;

    setLoading(true);
    setCreatorName(null);
    try {
      const { data: policyData, error: policyError } = await supabase
        .from("policies")
        .select(
          `
          *,
          clients!inner(id, full_name, phone_number, file_number, id_number, less_than_24, signature_url, under24_type, under24_driver_name, under24_driver_id),
          cars(id, car_number, manufacturer_name, year, car_type, car_value, model, color),
          insurance_companies(id, name, name_ar),
          brokers(id, name),
          road_services(id, name, name_ar)
        `,
        )
        .eq("id", policyId)
        .single();

      if (policyError) throw policyError;
      setPolicy(policyData as PolicyDetails);

      // Fetch related policies if part of a group
      if (policyData.group_id) {
        const { data: relatedData } = await supabase
          .from("policies")
          .select("id, policy_type_parent, policy_type_child, insurance_price, profit, road_service_id, insurance_companies(id, name, name_ar), road_services(id, name, name_ar)")
          .eq("group_id", policyData.group_id)
          .neq("id", policyId)
          .is("deleted_at", null);
        
        if (relatedData) {
          setRelatedPolicies(relatedData as RelatedPolicy[]);
        }
      } else {
        setRelatedPolicies([]);
      }

      // Fetch creator name via safe directory function
      if (policyData.created_by_admin_id) {
        const { data: creatorData } = await supabase.rpc("user_directory_get_by_ids", {
          p_ids: [policyData.created_by_admin_id],
        });
        if (creatorData && creatorData.length > 0) {
          setCreatorName(creatorData[0].display_name);
        }
      }

      const { data: paymentsData, error: paymentsError } = await supabase
        .from("policy_payments")
        .select("*")
        .eq("policy_id", policyId)
        .order("payment_date", { ascending: false });

      if (paymentsError) throw paymentsError;
      
      // Fetch payment images for all payments
      if (paymentsData && paymentsData.length > 0) {
        const paymentIds = paymentsData.map(p => p.id);
        const { data: imagesData } = await supabase
          .from("payment_images")
          .select("*")
          .in("payment_id", paymentIds)
          .order("sort_order", { ascending: true });

        // Attach images to payments
        const paymentsWithImages = paymentsData.map(payment => ({
          ...payment,
          images: imagesData?.filter(img => img.payment_id === payment.id) || []
        }));
        
        setPayments(paymentsWithImages);
      } else {
        setPayments([]);
      }
    } catch (error) {
      console.error("Error fetching policy details:", error);
      toast({ title: "خطأ", description: "فشل في تحميل تفاصيل الوثيقة", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && policyId) {
      fetchPolicyDetails();
      setActiveTab("insurance");
      setShowQuickPayment(false);
    }
  }, [open, policyId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "₪0";
    return `₪${amount.toLocaleString("ar-EG")}`;
  };

  const getStatus = () => {
    if (!policy) return { label: "-", variant: "secondary" as const, icon: Clock };
    if (policy.cancelled) return { label: "ملغاة", variant: "destructive" as const, icon: XCircle };
    if (policy.transferred) return { label: "محوّلة", variant: "warning" as const, icon: Clock };
    const today = new Date();
    const endDate = new Date(policy.end_date);
    if (endDate < today) return { label: "منتهية", variant: "destructive" as const, icon: XCircle };
    return { label: "نشطة", variant: "success" as const, icon: CheckCircle2 };
  };

  const getRemainingDays = () => {
    if (!policy) return 0;
    const today = new Date();
    const endDate = new Date(policy.end_date);
    const diff = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Payment calculations
  const totalPaid = payments.filter((p) => !p.refused && p.cheque_status !== 'returned').reduce((sum, p) => sum + p.amount, 0);
  const remaining = policy ? policy.insurance_price - totalPaid : 0;
  const percentagePaid = policy ? Math.min(100, Math.round((totalPaid / policy.insurance_price) * 100)) : 0;
  const paymentStatus = remaining <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

  // Returned cheques calculation
  const returnedCheques = payments.filter((p) => p.payment_type === 'cheque' && (p.refused || p.cheque_status === 'returned'));
  const returnedChequesTotal = returnedCheques.reduce((sum, p) => sum + p.amount, 0);
  const hasReturnedCheques = returnedCheques.length > 0;

  // Check if ELZAMI (no profit)
  const isElzami = policy?.policy_type_parent === "ELZAMI";

  // Calculate package totals
  const hasPackage = relatedPolicies.length > 0;
  const packageTotalPrice = hasPackage 
    ? (policy?.insurance_price || 0) + relatedPolicies.reduce((sum, rp) => sum + rp.insurance_price, 0)
    : 0;
  const packageTotalProfit = hasPackage 
    ? (policy?.profit || 0) + relatedPolicies.reduce((sum, rp) => sum + (rp.profit || 0), 0)
    : 0;

  const handleEditComplete = () => {
    fetchPolicyDetails();
    onUpdated?.();
  };

  const handlePaymentsChange = () => {
    fetchPolicyDetails();
  };

  const status = getStatus();
  const remainingDays = getRemainingDays();
  const StatusIcon = status.icon;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] p-0 overflow-hidden"
          dir="rtl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          {loading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : policy ? (
            <div className="flex flex-col h-full max-h-[90vh]">
              {/* Header - Insurance Focus */}
              <div className="p-6 bg-gradient-to-l from-primary/5 to-transparent border-b">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-right">
                    <DialogTitle className="text-xl font-bold mb-2">تفاصيل الوثيقة</DialogTitle>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Badge className={cn("border text-sm", policyTypeColors[policy.policy_type_parent])}>
                        {policyTypeLabels[policy.policy_type_parent]}
                        {policy.policy_type_child && ` - ${policyChildLabels[policy.policy_type_child]}`}
                      </Badge>
                      {/* Show service name for Road Service */}
                      {policy.policy_type_parent === 'ROAD_SERVICE' && policy.road_services && (
                        <Badge variant="outline" className="text-xs">
                          {policy.road_services.name_ar || policy.road_services.name}
                        </Badge>
                      )}
                      <Badge variant={status.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      {(policy.is_under_24 || policy.clients.under24_type !== 'none') && (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          {policy.clients.under24_type === 'additional_driver' ? 'سائق إضافي -24' : 'أقل من 24'}
                        </Badge>
                      )}
                    </div>
                    {/* Signature Warning */}
                    {!policy.clients.signature_url && (
                      <div className="flex items-center gap-2 mt-2 text-amber-600 bg-amber-500/10 rounded-md px-3 py-1.5 text-xs">
                        <AlertTriangle className="h-4 w-4" />
                        <span>العميل لم يوقّع بعد</span>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 px-2 text-amber-700 hover:text-amber-800 hover:bg-amber-500/20"
                          onClick={handleSendSignatureSms}
                          disabled={sendingSignatureSms || !policy.clients.phone_number}
                        >
                          {sendingSignatureSms ? (
                            <Loader2 className="h-3 w-3 animate-spin ml-1" />
                          ) : (
                            <Send className="h-3 w-3 ml-1" />
                          )}
                          إرسال طلب توقيع
                        </Button>
                      </div>
                    )}
                    {creatorName && <p className="text-xs text-muted-foreground mt-1">أنشئ بواسطة: {creatorName}</p>}
                  </div>
                  <div className="flex gap-2 ml-[20px]">
                    {remaining > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setActiveTab("payments");
                          setShowQuickPayment(true);
                        }}
                      >
                        <Plus className="h-4 w-4 ml-1" />
                        دفعة جديدة
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-4 w-4 ml-1" />
                      تعديل
                    </Button>
                  </div>
                </div>

                {/* Main Insurance Info - Hero Section */}
                <div
                  className={cn(
                    "grid gap-4 mt-4",
                    isElzami ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-4",
                  )}
                >
                  {/* Price */}
                  <div className="bg-background rounded-xl p-4 text-center border shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">سعر التأمين</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(policy.insurance_price)}</p>
                  </div>

                  {/* Paid */}
                  <div className="bg-background rounded-xl p-4 text-center border shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">المدفوع</p>
                    <p
                      className={cn("text-2xl font-bold", paymentStatus === "paid" ? "text-success" : "text-amber-600")}
                    >
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>

                  {/* Remaining */}
                  <div className="bg-background rounded-xl p-4 text-center border shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">المتبقي</p>
                    <p className={cn("text-2xl font-bold", remaining > 0 ? "text-destructive" : "text-success")}>
                      {formatCurrency(remaining)}
                    </p>
                  </div>

                  {/* Profit - Only show if not ELZAMI */}
                  {!isElzami && (
                    <div className="bg-success/10 rounded-xl p-4 text-center border border-success/20 shadow-sm">
                      <p className="text-xs text-muted-foreground mb-1">
                        {hasPackage ? 'ربح هذه الوثيقة' : 'الربح'}
                      </p>
                      <p className="text-2xl font-bold text-success">{formatCurrency(policy.profit)}</p>
                    </div>
                  )}
                </div>

                {/* Package Total - Only show if part of a package */}
                {hasPackage && !isElzami && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-primary/10 rounded-xl p-4 text-center border border-primary/20 shadow-sm">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Package className="h-3.5 w-3.5 text-primary" />
                        <p className="text-xs text-muted-foreground">مجموع الباقة</p>
                      </div>
                      <p className="text-xl font-bold text-primary">{formatCurrency(packageTotalPrice)}</p>
                    </div>
                    <div className="bg-success/15 rounded-xl p-4 text-center border border-success/30 shadow-sm">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Package className="h-3.5 w-3.5 text-success" />
                        <p className="text-xs text-muted-foreground">ربح الباقة</p>
                      </div>
                      <p className="text-xl font-bold text-success">{formatCurrency(packageTotalProfit)}</p>
                    </div>
                  </div>
                )}

                {/* Payment Progress */}
                <div className="mt-4 bg-background rounded-xl p-4 border shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">حالة الدفع</span>
                    <Badge
                      variant={
                        paymentStatus === "paid" ? "success" : paymentStatus === "partial" ? "warning" : "destructive"
                      }
                    >
                      {paymentStatus === "paid"
                        ? "مدفوع بالكامل"
                        : paymentStatus === "partial"
                          ? `مدفوع ${percentagePaid}%`
                          : "غير مدفوع"}
                    </Badge>
                  </div>
                  <Progress value={percentagePaid} className="h-2" />
                </div>

                {/* Returned Cheques Warning */}
                {hasReturnedCheques && (
                  <div className="mt-4 bg-destructive/10 rounded-xl p-4 border border-destructive/20 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-destructive">شيكات مرتجعة</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-destructive/80">
                        {returnedCheques.length} شيك مرتجع
                      </span>
                      <span className="text-lg font-bold text-destructive">
                        {formatCurrency(returnedChequesTotal)}-
                      </span>
                    </div>
                    <p className="text-xs text-destructive/70 mt-2">
                      هذا المبلغ مخصوم من رصيد العميل ويجب تحصيله
                    </p>
                  </div>
                )}
              </div>

              {/* Tabs Content */}
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 flex flex-col overflow-hidden"
                dir="rtl"
              >
                <TabsList className="mx-6 mt-4 grid grid-cols-5 h-10" dir="rtl">
                  <TabsTrigger value="insurance" className="text-xs gap-1">
                    <Banknote className="h-3 w-3" />
                    التأمين
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="text-xs gap-1">
                    <CreditCard className="h-3 w-3" />
                    الدفعات ({payments.length})
                  </TabsTrigger>
                  <TabsTrigger value="customer" className="text-xs gap-1">
                    <User className="h-3 w-3" />
                    العميل
                  </TabsTrigger>
                  <TabsTrigger value="files" className="text-xs gap-1">
                    <ImageIcon className="h-3 w-3" />
                    الملفات
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="text-xs gap-1">
                    <FileText className="h-3 w-3" />
                    الفواتير
                  </TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1">
                  {/* Insurance Tab */}
                  <TabsContent value="insurance" className="p-6 space-y-4 m-0">
                    {/* Company */}
                    {policy.insurance_companies ? (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                          <Building2 className="h-4 w-4" />
                          <span>شركة التأمين</span>
                        </div>
                        <p className="text-lg font-bold">
                          {policy.insurance_companies.name_ar || policy.insurance_companies.name}
                        </p>
                        {policy.brokers && (
                          <p className="text-sm text-muted-foreground mt-1">الوسيط: {policy.brokers.name}</p>
                        )}
                      </Card>
                    ) : policy.brokers ? (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                          <Building2 className="h-4 w-4" />
                          <span>الوسيط</span>
                        </div>
                        <p className="text-lg font-bold">{policy.brokers.name}</p>
                      </Card>
                    ) : null}

                    {/* Package / Related Policies */}
                    {relatedPolicies.length > 0 && (
                      <Card className="p-4 border-primary/30 bg-primary/5">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                          <Package className="h-4 w-4" />
                          <span>الوثائق المرتبطة (باقة)</span>
                        </div>
                        <div className="overflow-hidden rounded-md border border-border/50 bg-background">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-right py-2 px-3 font-medium text-muted-foreground">النوع</th>
                                <th className="text-right py-2 px-3 font-medium text-muted-foreground">الخدمة</th>
                                <th className="text-right py-2 px-3 font-medium text-muted-foreground">الشركة</th>
                                <th className="text-left py-2 px-3 font-medium text-muted-foreground">السعر</th>
                                <th className="text-left py-2 px-3 font-medium text-muted-foreground">الربح</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relatedPolicies.map((rp) => (
                                <tr 
                                  key={rp.id} 
                                  className="border-t border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
                                  onClick={() => {
                                    if (onViewRelatedPolicy) {
                                      onOpenChange(false);
                                      setTimeout(() => {
                                        onViewRelatedPolicy(rp.id);
                                      }, 150);
                                    }
                                  }}
                                >
                                  <td className="py-2 px-3">
                                    <Badge className={cn("text-xs", policyTypeColors[rp.policy_type_parent])}>
                                      {policyTypeLabels[rp.policy_type_parent]}
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-3 text-muted-foreground">
                                    {rp.policy_type_parent === 'ROAD_SERVICE' && rp.road_services
                                      ? (rp.road_services.name_ar || rp.road_services.name)
                                      : rp.policy_type_parent === 'ACCIDENT_FEE_EXEMPTION'
                                        ? 'إعفاء رسوم حادث'
                                        : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-muted-foreground">
                                    {rp.insurance_companies?.name_ar || rp.insurance_companies?.name || '-'}
                                  </td>
                                  <td className="py-2 px-3 text-left font-semibold">
                                    {formatCurrency(rp.insurance_price)}
                                  </td>
                                  <td className="py-2 px-3 text-left text-success font-medium">
                                    {formatCurrency(rp.profit)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-muted/30 border-t border-border/50">
                              <tr>
                                <td colSpan={3} className="py-2 px-3 font-semibold text-right">مجموع الباقة:</td>
                                <td colSpan={2} className="py-2 px-3 text-left font-bold text-primary">
                                  {formatCurrency(policy.insurance_price + relatedPolicies.reduce((sum, rp) => sum + rp.insurance_price, 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 text-center">اضغط على أي صف لعرض تفاصيل الوثيقة</p>
                      </Card>
                    )}

                    {/* Period */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <Calendar className="h-4 w-4" />
                        <span>فترة التأمين</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">من</p>
                          <p className="font-semibold">{formatDate(policy.start_date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">إلى</p>
                          <p className="font-semibold">{formatDate(policy.end_date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">المتبقي</p>
                          <p
                            className={cn(
                              "font-semibold",
                              remainingDays < 0
                                ? "text-destructive"
                                : remainingDays <= 30
                                  ? "text-amber-600"
                                  : "text-success",
                            )}
                          >
                            {remainingDays < 0 ? `منتهية` : `${remainingDays} يوم`}
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Pricing Details */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <Banknote className="h-4 w-4" />
                        <span>تفاصيل الأسعار</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">سعر التأمين</span>
                          <span className="font-bold">{formatCurrency(policy.insurance_price)}</span>
                        </div>
                        {!isElzami && (
                          <>
                            <div className="flex justify-between py-2 border-b">
                              <span className="text-muted-foreground">مدفوع للشركة</span>
                              <span className="font-bold text-orange-600">
                                {formatCurrency(policy.payed_for_company)}
                              </span>
                            </div>
                            <div className="flex justify-between py-2">
                              <span className="text-muted-foreground">الربح</span>
                              <span className="font-bold text-success">{formatCurrency(policy.profit)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </Card>

                    {/* Notes */}
                    {policy.notes && (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                          <FileText className="h-4 w-4" />
                          <span>ملاحظات</span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{policy.notes}</p>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Payments Tab */}
                  <TabsContent value="payments" className="p-6 m-0">
                    <PolicyPaymentsSection
                      policyId={policy.id}
                      payments={payments}
                      insurancePrice={policy.insurance_price}
                      onPaymentsChange={handlePaymentsChange}
                      autoOpenAdd={showQuickPayment}
                      onAutoOpenHandled={() => setShowQuickPayment(false)}
                    />
                  </TabsContent>

                  {/* Customer Tab */}
                  <TabsContent value="customer" className="p-6 space-y-4 m-0">
                    {/* Client */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <User className="h-4 w-4" />
                        <span>بيانات العميل</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">الاسم</span>
                          <p className="font-semibold text-base">{policy.clients.full_name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">رقم الهوية</span>
                          <p className="font-mono font-semibold" dir="ltr">
                            {policy.clients.id_number}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">رقم الملف</span>
                          <p>{policy.clients.file_number || "-"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono" dir="ltr">
                            {policy.clients.phone_number || "-"}
                          </span>
                        </div>
                      </div>
                    </Card>

                    {/* Car */}
                    {policy.cars ? (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                          <Car className="h-4 w-4" />
                          <span>بيانات السيارة</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs">رقم السيارة</span>
                            <p className="font-mono font-semibold text-base" dir="ltr">
                              {policy.cars.car_number}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">الشركة المصنعة</span>
                            <p className="font-semibold">{policy.cars.manufacturer_name || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">سنة الصنع</span>
                            <p>{policy.cars.year || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">النوع</span>
                            <p>
                              {policy.cars.car_type ? carTypeLabels[policy.cars.car_type] || policy.cars.car_type : "-"}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">قيمة السيارة</span>
                            <p className="font-semibold">
                              {policy.cars.car_value ? formatCurrency(policy.cars.car_value) : "-"}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">اللون</span>
                            <p>{policy.cars.color || "-"}</p>
                          </div>
                        </div>
                      </Card>
                    ) : (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground font-semibold mb-3">
                          <Car className="h-4 w-4" />
                          <span>بدون سيارة</span>
                        </div>
                        <p className="text-sm text-muted-foreground">هذه وثيقة تأمين غير مرتبطة بسيارة</p>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Files Tab */}
                  <TabsContent value="files" className="p-6 m-0">
                    <PolicyFilesSection 
                      policyId={policy.id} 
                      policyNumber={policy.policy_number}
                      clientId={policy.clients.id}
                      clientPhoneNumber={policy.clients.phone_number}
                      clientName={policy.clients.full_name}
                      onPolicyNumberSaved={() => fetchPolicyDetails()}
                    />
                  </TabsContent>

                  {/* Invoices Tab */}
                  <TabsContent value="invoices" className="p-6 m-0">
                    <PolicyInvoicesSection policyId={policy.id} />
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">لم يتم العثور على الوثيقة</div>
          )}
        </DialogContent>
      </Dialog>

      {policy && (
        <PolicyEditDrawer open={editOpen} onOpenChange={setEditOpen} policy={policy} onSaved={handleEditComplete} />
      )}
    </>
  );
}
