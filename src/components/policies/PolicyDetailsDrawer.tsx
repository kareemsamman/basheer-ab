import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
  ArrowLeftRight,
  History,
  Shield,
  TrendingUp,
  Wallet,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PolicyEditDrawer } from "./PolicyEditDrawer";
import { PolicyPaymentsSection } from "./PolicyPaymentsSection";
import { PolicyFilesSection } from "./PolicyFilesSection";

import { CancelPolicyModal } from "./CancelPolicyModal";
import { TransferPolicyModal } from "./TransferPolicyModal";

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
  cancellation_note: string | null;
  cancellation_date: string | null;
  legacy_wp_id: number | null;
  created_at: string;
  updated_at: string;
  broker_id: string | null;
  created_by_admin_id: string | null;
  group_id: string | null;
  road_service_id: string | null;
  branch_id: string | null;
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
  accident_fee_service_id: string | null;
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
  accident_fee_services: {
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
  ELZAMI: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  THIRD_FULL: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  ROAD_SERVICE: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  ACCIDENT_FEE_EXEMPTION: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  HEALTH: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  LIFE: "bg-teal-500/10 text-teal-700 border-teal-500/30",
  PROPERTY: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  TRAVEL: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30",
  BUSINESS: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  OTHER: "bg-slate-500/10 text-slate-700 border-slate-500/30",
};

const policyTypeIcons: Record<string, React.ElementType> = {
  ELZAMI: Shield,
  THIRD_FULL: Car,
  ROAD_SERVICE: Car,
  ACCIDENT_FEE_EXEMPTION: Shield,
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
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<PolicyDetails | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("insurance");
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [sendingSignatureSms, setSendingSignatureSms] = useState(false);
  const [relatedPolicies, setRelatedPolicies] = useState<RelatedPolicy[]>([]);
  const [transferHistory, setTransferHistory] = useState<any[]>([]);
  const [refundAmount, setRefundAmount] = useState<number>(0);

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
          .select("id, policy_type_parent, policy_type_child, insurance_price, profit, road_service_id, accident_fee_service_id, insurance_companies(id, name, name_ar), road_services(id, name, name_ar), accident_fee_services(id, name, name_ar)")
          .eq("group_id", policyData.group_id)
          .neq("id", policyId)
          .is("deleted_at", null);
        
        if (relatedData) {
          setRelatedPolicies(relatedData as RelatedPolicy[]);
        }
      } else {
        setRelatedPolicies([]);
      }

      // Fetch transfer history
      const { data: transfersData } = await supabase
        .from("policy_transfers")
        .select(`
          id,
          from_car_id,
          to_car_id,
          transfer_date,
          note,
          adjustment_type,
          adjustment_amount,
          created_at,
          from_car:cars!policy_transfers_from_car_id_fkey(car_number, model, year),
          to_car:cars!policy_transfers_to_car_id_fkey(car_number, model, year)
        `)
        .eq("policy_id", policyId)
        .order("created_at", { ascending: false });

      setTransferHistory(transfersData || []);

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
      
      // Fetch refund amount for cancelled policies
      if (policyData.cancelled) {
        const { data: refundData } = await supabase
          .from("customer_wallet_transactions")
          .select("amount")
          .eq("policy_id", policyId)
          .eq("transaction_type", "refund")
          .single();
        
        setRefundAmount(refundData?.amount || 0);
      } else {
        setRefundAmount(0);
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
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    return `${isNegative ? '-' : ''}₪${absAmount.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}`;
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

  // Payment calculations - for transferred policies, show 0 paid/remaining (payments moved to new policy)
  const isTransferred = policy?.transferred === true;
  const totalPaid = isTransferred ? 0 : payments.filter((p) => !p.refused && p.cheque_status !== 'returned').reduce((sum, p) => sum + p.amount, 0);
  const remaining = policy ? (isTransferred ? 0 : policy.insurance_price - totalPaid) : 0;
  const percentagePaid = policy ? (isTransferred ? 100 : Math.min(100, Math.round((totalPaid / policy.insurance_price) * 100))) : 0;
  const paymentStatus = isTransferred ? "paid" : remaining <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

  // Returned cheques calculation
  const returnedCheques = isTransferred ? [] : payments.filter((p) => p.payment_type === 'cheque' && (p.refused || p.cheque_status === 'returned'));
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

  // Get display name for policy type with child
  const getPolicyTypeName = () => {
    if (!policy) return "";
    let name = policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent;
    if (policy.policy_type_child) {
      name += ` (${policyChildLabels[policy.policy_type_child] || policy.policy_type_child})`;
    }
    return name;
  };

  // Get service name for display
  const getServiceName = (rp: RelatedPolicy) => {
    if (rp.policy_type_parent === 'ROAD_SERVICE' && rp.road_services) {
      return rp.road_services.name_ar || rp.road_services.name;
    }
    if (rp.policy_type_parent === 'ACCIDENT_FEE_EXEMPTION' && rp.accident_fee_services) {
      return rp.accident_fee_services.name_ar || rp.accident_fee_services.name;
    }
    if (rp.policy_type_parent === 'THIRD_FULL' && rp.policy_type_child) {
      return policyChildLabels[rp.policy_type_child] || rp.policy_type_child;
    }
    return null;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-4xl max-h-[95vh] p-0 overflow-hidden"
          dir="rtl"
        >
          {loading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : policy ? (
            <div className="flex flex-col h-full max-h-[95vh]">
              {/* Header - Premium Redesign */}
              <div className="px-6 py-5 border-b bg-gradient-to-l from-muted/40 via-background to-background">
                <div className="flex items-start justify-between gap-4">
                  {/* Right side - Title and type */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <DialogTitle className="text-xl font-bold">تفاصيل الوثيقة</DialogTitle>
                      <Badge variant={status.variant} className="gap-1.5 px-3 py-1">
                        <StatusIcon className="h-3.5 w-3.5" />
                        {status.label}
                      </Badge>
                    </div>
                    
                    {/* Policy Type Badge - Large and Clear */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("text-sm px-4 py-1.5 font-semibold border-2", policyTypeColors[policy.policy_type_parent])}>
                        {getPolicyTypeName()}
                      </Badge>
                      
                      {/* Service name for Road Service */}
                      {policy.policy_type_parent === 'ROAD_SERVICE' && policy.road_services && (
                        <Badge variant="outline" className="text-sm px-3 py-1">
                          {policy.road_services.name_ar || policy.road_services.name}
                        </Badge>
                      )}
                      
                      {/* Under 24 badge */}
                      {(policy.is_under_24 || policy.clients.under24_type !== 'none') && (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          {policy.clients.under24_type === 'additional_driver' ? 'سائق إضافي -24' : 'أقل من 24'}
                        </Badge>
                      )}
                      
                      {/* Package indicator */}
                      {hasPackage && (
                        <Badge variant="outline" className="gap-1 bg-primary/5 text-primary border-primary/30">
                          <Package className="h-3 w-3" />
                          باقة ({relatedPolicies.length + 1} وثائق)
                        </Badge>
                      )}
                    </div>
                    
                    {/* Creator info */}
                    {creatorName && (
                      <p className="text-xs text-muted-foreground mt-2">
                        أنشئ بواسطة: {creatorName}
                      </p>
                    )}
                  </div>
                  
                  {/* Left side - Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditOpen(true)}
                      className="gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </Button>
                    {!policy.cancelled && !policy.transferred && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTransferOpen(true)}
                          className="gap-1.5"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          تحويل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCancelOpen(true)}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          إلغاء
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Signature Warning */}
                {!policy.clients.signature_url && (
                  <div className="flex items-center gap-2 mt-3 text-amber-600 bg-amber-500/10 rounded-lg px-3 py-2 text-xs">
                    <AlertTriangle className="h-4 w-4" />
                    <span>العميل لم يوقّع بعد</span>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-500/20 mr-auto"
                      onClick={handleSendSignatureSms}
                      disabled={sendingSignatureSms}
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
              </div>

              {/* Financial Summary Cards - Clean Grid */}
              <div className="px-6 py-5 bg-muted/20">
                <div className="grid grid-cols-3 gap-4">
                  {/* Insurance Price */}
                  <div className="bg-background rounded-xl p-4 border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Wallet className="h-4 w-4" />
                      <span className="text-xs font-medium">سعر التأمين</span>
                    </div>
                    <p className="text-2xl font-bold text-primary ltr-nums">
                      {formatCurrency(policy.insurance_price)}
                    </p>
                  </div>

                  {/* Paid Amount */}
                  <div className={cn(
                    "rounded-xl p-4 border shadow-sm",
                    paymentStatus === 'paid' ? "bg-success/5 border-success/30" : "bg-background"
                  )}>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-xs font-medium">المدفوع</span>
                    </div>
                    <p className={cn(
                      "text-2xl font-bold ltr-nums",
                      paymentStatus === 'paid' ? "text-success" : "text-foreground"
                    )}>
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>

                  {/* Remaining */}
                  <div className={cn(
                    "rounded-xl p-4 border shadow-sm",
                    remaining > 0 ? "bg-destructive/5 border-destructive/30" : 
                    remaining < 0 ? "bg-destructive/10 border-destructive/40" : 
                    "bg-success/5 border-success/30"
                  )}>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Banknote className="h-4 w-4" />
                      <span className="text-xs font-medium">المتبقي</span>
                    </div>
                    <p className={cn(
                      "text-2xl font-bold ltr-nums",
                      remaining > 0 ? "text-destructive" : 
                      remaining < 0 ? "text-destructive" : 
                      "text-success"
                    )}>
                      {formatCurrency(remaining)}
                    </p>
                    {remaining < 0 && (
                      <p className="text-xs text-destructive mt-1">رصيد زائد</p>
                    )}
                  </div>
                </div>

                {/* Profit Row - Admin Only */}
                {!isElzami && isAdmin && (
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className={cn(
                      "rounded-xl p-4 border shadow-sm",
                      (policy.cancelled || isTransferred) 
                        ? "bg-muted border-muted-foreground/20" 
                        : "bg-success/5 border-success/30"
                    )}>
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs font-medium">
                          {hasPackage ? 'ربح هذه الوثيقة' : 'الربح'}
                        </span>
                      </div>
                      <p className={cn(
                        "text-2xl font-bold ltr-nums",
                        (policy.cancelled || isTransferred) ? "text-muted-foreground line-through" : "text-success"
                      )}>
                        {(policy.cancelled || isTransferred) ? formatCurrency(0) : formatCurrency(policy.profit)}
                      </p>
                    </div>
                    
                    {hasPackage && (
                      <div className="rounded-xl p-4 border shadow-sm bg-primary/5 border-primary/30">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                          <Package className="h-4 w-4" />
                          <span className="text-xs font-medium">ربح الباقة الكامل</span>
                        </div>
                        <p className="text-2xl font-bold text-primary ltr-nums">
                          {formatCurrency(packageTotalProfit)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment Progress Bar */}
                <div className="mt-4 bg-background rounded-xl p-4 border shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">حالة الدفع</span>
                    <Badge
                      variant={
                        paymentStatus === "paid" ? "success" : paymentStatus === "partial" ? "warning" : "destructive"
                      }
                      className="px-3"
                    >
                      {paymentStatus === "paid"
                        ? "مدفوع بالكامل"
                        : paymentStatus === "partial"
                          ? `مدفوع ${percentagePaid}%`
                          : "غير مدفوع"}
                    </Badge>
                  </div>
                  <Progress value={percentagePaid} className="h-2.5" />
                </div>

                {/* Returned Cheques Warning */}
                {hasReturnedCheques && (
                  <div className="mt-4 bg-destructive/10 rounded-xl p-4 border border-destructive/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-destructive">
                        شيكات مرتجعة ({returnedCheques.length})
                      </span>
                      <span className="text-lg font-bold text-destructive mr-auto ltr-nums">
                        {formatCurrency(returnedChequesTotal)}-
                      </span>
                    </div>
                    <p className="text-xs text-destructive/70">
                      هذا المبلغ مخصوم من رصيد العميل ويجب تحصيله
                    </p>
                  </div>
                )}

                {/* Cancellation Info */}
                {policy.cancelled && (
                  <div className="mt-4 bg-destructive/10 rounded-xl p-4 border border-destructive/20">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-destructive">وثيقة ملغاة</span>
                      {policy.cancellation_date && (
                        <Badge variant="outline" className="text-xs mr-auto">
                          {formatDate(policy.cancellation_date)}
                        </Badge>
                      )}
                    </div>
                    {policy.cancellation_note && (
                      <p className="text-sm text-destructive/80 whitespace-pre-wrap">{policy.cancellation_note}</p>
                    )}
                    {refundAmount > 0 && (
                      <div className="mt-3 pt-3 border-t border-destructive/20 flex justify-between">
                        <span className="text-sm text-destructive/80">مرتجع للعميل</span>
                        <span className="text-lg font-bold text-destructive ltr-nums">{formatCurrency(refundAmount)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Transferred Info */}
                {isTransferred && !policy.cancelled && (
                  <div className="mt-4 bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowLeftRight className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-700">وثيقة محوّلة</span>
                      {policy.transferred_car_number && (
                        <Badge variant="outline" className="text-xs mr-auto bg-amber-500/10 border-amber-500/30">
                          إلى: {policy.transferred_car_number}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-amber-700/80">
                      الدفعات والملفات تم نقلها للوثيقة الجديدة
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
                <TabsList className="mx-6 mt-4 grid grid-cols-4 h-11 p-1" dir="rtl">
                  <TabsTrigger value="insurance" className="text-sm gap-2 font-medium">
                    <Shield className="h-4 w-4" />
                    التأمين
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="text-sm gap-2 font-medium">
                    <CreditCard className="h-4 w-4" />
                    الدفعات ({payments.length})
                  </TabsTrigger>
                  <TabsTrigger value="customer" className="text-sm gap-2 font-medium">
                    <User className="h-4 w-4" />
                    العميل
                  </TabsTrigger>
                  <TabsTrigger value="files" className="text-sm gap-2 font-medium">
                    <ImageIcon className="h-4 w-4" />
                    الملفات
                  </TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1">
                  {/* Insurance Tab */}
                  <TabsContent value="insurance" className="px-6 py-5 space-y-4 m-0">
                    {/* Company Card */}
                    {policy.insurance_companies ? (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-2">
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
                        <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                          <Building2 className="h-4 w-4" />
                          <span>الوسيط</span>
                        </div>
                        <p className="text-lg font-bold">{policy.brokers.name}</p>
                      </Card>
                    ) : null}

                    {/* Package / Related Policies - REDESIGNED AS CARDS */}
                    {relatedPolicies.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-primary font-semibold">
                          <Package className="h-5 w-5" />
                          <span className="text-base">وثائق الباقة الأخرى</span>
                          <Badge variant="outline" className="mr-auto bg-primary/5">
                            {relatedPolicies.length} وثائق إضافية
                          </Badge>
                        </div>
                        
                        <div className="grid gap-3">
                          {relatedPolicies.map((rp) => {
                            const TypeIcon = policyTypeIcons[rp.policy_type_parent] || Shield;
                            const serviceName = getServiceName(rp);
                            
                            return (
                              <div
                                key={rp.id}
                                onClick={() => {
                                  if (onViewRelatedPolicy) {
                                    onOpenChange(false);
                                    setTimeout(() => {
                                      onViewRelatedPolicy(rp.id);
                                    }, 100);
                                  }
                                }}
                                className={cn(
                                  "rounded-xl border-2 p-4 cursor-pointer transition-all group",
                                  "hover:shadow-md hover:border-primary/40 hover:bg-primary/5",
                                  policyTypeColors[rp.policy_type_parent].replace('text-', 'border-').replace('border-', 'border-')
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-lg flex items-center justify-center",
                                      policyTypeColors[rp.policy_type_parent]
                                    )}>
                                      <TypeIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="font-semibold flex items-center gap-2">
                                        {policyTypeLabels[rp.policy_type_parent]}
                                        {rp.policy_type_child && (
                                          <span className="text-sm font-normal text-muted-foreground">
                                            ({policyChildLabels[rp.policy_type_child]})
                                          </span>
                                        )}
                                      </p>
                                      {serviceName && (
                                        <p className="text-sm text-muted-foreground">{serviceName}</p>
                                      )}
                                      {rp.insurance_companies && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          {rp.insurance_companies.name_ar || rp.insurance_companies.name}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="text-left flex items-center gap-4">
                                    <div>
                                      <p className="text-lg font-bold ltr-nums">{formatCurrency(rp.insurance_price)}</p>
                                      {isAdmin && (
                                        <p className="text-sm text-success font-medium ltr-nums">
                                          ربح: {formatCurrency(rp.profit)}
                                        </p>
                                      )}
                                    </div>
                                    <ChevronLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Package Total Summary */}
                        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 mt-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Package className="h-5 w-5 text-primary" />
                              <span className="font-semibold text-primary">مجموع الباقة الكامل</span>
                            </div>
                            <div className="text-left">
                              <p className="text-xl font-bold text-primary ltr-nums">{formatCurrency(packageTotalPrice)}</p>
                              {isAdmin && (
                                <p className="text-sm text-success font-medium ltr-nums">
                                  إجمالي الربح: {formatCurrency(packageTotalProfit)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
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

                    {/* Pricing Details - Admin only */}
                    {isAdmin && (
                      <Card className="p-4">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                          <Banknote className="h-4 w-4" />
                          <span>تفاصيل الأسعار</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between py-2 border-b">
                            <span className="text-muted-foreground">سعر التأمين</span>
                            <span className="font-bold ltr-nums">{formatCurrency(policy.insurance_price)}</span>
                          </div>
                          {!isElzami && (
                            <>
                              <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">مدفوع للشركة</span>
                                <span className="font-bold text-orange-600 ltr-nums">
                                  {formatCurrency(policy.payed_for_company)}
                                </span>
                              </div>
                              <div className="flex justify-between py-2">
                                <span className="text-muted-foreground">الربح</span>
                                <span className="font-bold text-success ltr-nums">{formatCurrency(policy.profit)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </Card>
                    )}

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

                    {/* Transfer History */}
                    {transferHistory.length > 0 && (
                      <Card className="p-4 border-amber-500/30 bg-amber-500/5">
                        <div className="flex items-center gap-2 text-amber-700 font-semibold mb-3">
                          <History className="h-4 w-4" />
                          <span>سجل التحويلات ({transferHistory.length})</span>
                        </div>
                        <div className="space-y-3">
                          {transferHistory.map((transfer) => (
                            <div key={transfer.id} className="text-sm border-b border-amber-500/20 pb-2 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-muted-foreground">
                                  {formatDate(transfer.transfer_date)}
                                </span>
                                {transfer.adjustment_type && transfer.adjustment_type !== 'none' && (
                                  <Badge variant="outline" className="text-xs">
                                    {transfer.adjustment_type === 'customer_pays' ? 'العميل يدفع' : 'مرتجع'}
                                    : ₪{transfer.adjustment_amount}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                                  {transfer.from_car?.car_number}
                                </span>
                                <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                                <span className="font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  {transfer.to_car?.car_number}
                                </span>
                              </div>
                              {transfer.note && (
                                <p className="text-xs text-muted-foreground mt-1">{transfer.note}</p>
                              )}
                            </div>
                          ))}
                        </div>
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
                          <p className="font-mono font-semibold">
                            <bdi>{policy.clients.id_number}</bdi>
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">رقم الملف</span>
                          <p>{policy.clients.file_number || "-"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono">
                            <bdi>{policy.clients.phone_number || "-"}</bdi>
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
                            <p className="font-mono font-semibold text-base">
                              <bdi>{policy.cars.car_number}</bdi>
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
                            <p className="font-semibold ltr-nums">
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
                </ScrollArea>
              </Tabs>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">لم يتم العثور على الوثيقة</div>
          )}
        </DialogContent>
      </Dialog>

      {policy && (
        <>
          <PolicyEditDrawer open={editOpen} onOpenChange={setEditOpen} policy={policy} onSaved={handleEditComplete} />
          <CancelPolicyModal
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            policyId={policy.id}
            policyNumber={policy.policy_number}
            clientId={policy.clients.id}
            clientName={policy.clients.full_name}
            clientPhone={policy.clients.phone_number}
            branchId={policy.branch_id}
            insurancePrice={policy.insurance_price}
            onCancelled={handleEditComplete}
          />
          <TransferPolicyModal
            open={transferOpen}
            onOpenChange={setTransferOpen}
            policyId={policy.id}
            policyNumber={policy.policy_number}
            policyType={policy.policy_type_parent}
            groupId={policy.group_id}
            clientId={policy.clients.id}
            clientName={policy.clients.full_name}
            clientPhone={policy.clients.phone_number}
            branchId={policy.branch_id}
            currentCar={policy.cars}
            onTransferred={handleEditComplete}
          />
        </>
      )}
    </>
  );
}
