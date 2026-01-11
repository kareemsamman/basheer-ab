import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  AlertTriangle,
  Send,
  Loader2,
  Package,
  ArrowLeftRight,
  History,
  Shield,
  TrendingUp,
  ChevronLeft,
  CircleDollarSign,
  Truck,
  FileCheck,
  MapPin,
  Hash,
  Palette,
  DollarSign,
  Layers,
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

const policyTypeConfig: Record<string, { icon: React.ElementType; gradient: string; bg: string; border: string; text: string }> = {
  ELZAMI: { 
    icon: Shield, 
    gradient: "from-blue-500 to-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700"
  },
  THIRD_FULL: { 
    icon: Car, 
    gradient: "from-purple-500 to-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700"
  },
  ROAD_SERVICE: { 
    icon: Truck, 
    gradient: "from-orange-500 to-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700"
  },
  ACCIDENT_FEE_EXEMPTION: { 
    icon: FileCheck, 
    gradient: "from-emerald-500 to-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700"
  },
};

const carTypeLabels: Record<string, string> = {
  car: "خصوصي",
  cargo: "شحن",
  small: "صغير",
  taxi: "تاكسي",
  tjeradown4: "تجاري (أقل من 4 طن)",
  tjeraup4: "تجاري (أكثر من 4 طن)",
};

// Section component for consistent styling
const Section = ({ title, icon: Icon, children, className }: { 
  title: string; 
  icon: React.ElementType; 
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("space-y-3", className)}>
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="font-bold text-foreground">{title}</h3>
    </div>
    {children}
  </div>
);

export function PolicyDetailsDrawer({ open, onOpenChange, policyId, onUpdated, onViewRelatedPolicy }: PolicyDetailsDrawerProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<PolicyDetails | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'main' | 'payments' | 'files'>('main');
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
      setActiveSection('main');
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
    if (policy.transferred) return { label: "محوّلة", variant: "warning" as const, icon: ArrowLeftRight };
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
  const policyConfig = policyTypeConfig[policy?.policy_type_parent || 'ELZAMI'] || policyTypeConfig.ELZAMI;
  const PolicyIcon = policyConfig.icon;

  // Get display name for policy type with child
  const getPolicyTypeName = () => {
    if (!policy) return "";
    let name = policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent;
    if (policy.policy_type_child) {
      name += ` - ${policyChildLabels[policy.policy_type_child] || policy.policy_type_child}`;
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
          className="max-w-5xl max-h-[95vh] p-0 overflow-hidden gap-0"
          dir="rtl"
        >
          {loading ? (
            <div className="p-8 space-y-6">
              <Skeleton className="h-24 w-full rounded-xl" />
              <div className="grid grid-cols-4 gap-4">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
              <Skeleton className="h-40 w-full" />
            </div>
          ) : policy ? (
            <div className="flex flex-col h-full max-h-[95vh]">
              {/* Hero Header with Gradient */}
              <div className={cn(
                "relative overflow-hidden",
                "bg-gradient-to-l",
                policyConfig.gradient
              )}>
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
                  <div className="absolute bottom-0 right-0 w-48 h-48 bg-white rounded-full translate-x-1/4 translate-y-1/4" />
                </div>
                
                <div className="relative px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Right side - Policy Type & Title */}
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <PolicyIcon className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h1 className="text-xl font-bold text-white">{getPolicyTypeName()}</h1>
                          <Badge className={cn(
                            "border-white/30 font-medium",
                            status.variant === 'success' ? "bg-white/20 text-white" :
                            status.variant === 'destructive' ? "bg-red-100 text-red-700" :
                            status.variant === 'warning' ? "bg-amber-100 text-amber-700" :
                            "bg-white/20 text-white"
                          )}>
                            <StatusIcon className="h-3 w-3 ml-1" />
                            {status.label}
                          </Badge>
                        </div>
                        
                        {/* Service name for Road Service */}
                        {policy.policy_type_parent === 'ROAD_SERVICE' && policy.road_services && (
                          <p className="text-white/80 text-sm">
                            {policy.road_services.name_ar || policy.road_services.name}
                          </p>
                        )}
                        
                        {/* Client & Car Info */}
                        <div className="flex items-center gap-4 mt-2 text-white/80 text-sm">
                          <div className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            <span>{policy.clients.full_name}</span>
                          </div>
                          {policy.cars && (
                            <div className="flex items-center gap-1">
                              <Car className="h-3.5 w-3.5" />
                              <span className="font-mono"><bdi>{policy.cars.car_number}</bdi></span>
                            </div>
                          )}
                          {hasPackage && (
                            <div className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full">
                              <Layers className="h-3 w-3" />
                              <span>باقة ({relatedPolicies.length + 1})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Left side - Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditOpen(true)}
                        className="gap-1.5 bg-white/20 hover:bg-white/30 text-white border-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </Button>
                      {!policy.cancelled && !policy.transferred && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setTransferOpen(true)}
                            className="gap-1.5 bg-white/20 hover:bg-white/30 text-white border-0"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            تحويل
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setCancelOpen(true)}
                            className="gap-1.5 bg-red-500/80 hover:bg-red-500 text-white border-0"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            إلغاء
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Pills */}
              <div className="px-6 py-3 border-b bg-muted/30 flex gap-2">
                <button
                  onClick={() => setActiveSection('main')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeSection === 'main' 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Shield className="h-4 w-4 inline-block ml-1.5" />
                  معلومات الوثيقة
                </button>
                <button
                  onClick={() => setActiveSection('payments')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                    activeSection === 'payments' 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <CreditCard className="h-4 w-4" />
                  الدفعات
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-xs",
                    activeSection === 'payments' ? "bg-white/20" : "bg-muted-foreground/20"
                  )}>
                    {payments.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveSection('files')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeSection === 'files' 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <ImageIcon className="h-4 w-4 inline-block ml-1.5" />
                  الملفات
                </button>
              </div>

              {/* Content Area */}
              <ScrollArea className="flex-1">
                {activeSection === 'main' && (
                  <div className="p-6 space-y-6">
                    {/* Signature Warning */}
                    {!policy.clients.signature_url && (
                      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                        <span className="text-amber-800 text-sm font-medium">العميل لم يوقّع بعد</span>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="mr-auto border-amber-300 text-amber-700 hover:bg-amber-100"
                          onClick={handleSendSignatureSms}
                          disabled={sendingSignatureSms}
                        >
                          {sendingSignatureSms ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />
                          ) : (
                            <Send className="h-3.5 w-3.5 ml-1" />
                          )}
                          إرسال طلب توقيع
                        </Button>
                      </div>
                    )}

                    {/* Financial Cards Grid */}
                    <div className="grid grid-cols-4 gap-3">
                      {/* Insurance Price */}
                      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                            <CircleDollarSign className="h-4 w-4 text-slate-600" />
                          </div>
                          <span className="text-xs font-medium text-slate-600">سعر التأمين</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900 ltr-nums">
                          {formatCurrency(policy.insurance_price)}
                        </p>
                      </div>

                      {/* Paid Amount */}
                      <div className={cn(
                        "rounded-xl p-4 border",
                        paymentStatus === 'paid' 
                          ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200" 
                          : "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200"
                      )}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            paymentStatus === 'paid' ? "bg-emerald-200" : "bg-slate-200"
                          )}>
                            <CreditCard className={cn("h-4 w-4", paymentStatus === 'paid' ? "text-emerald-600" : "text-slate-600")} />
                          </div>
                          <span className={cn("text-xs font-medium", paymentStatus === 'paid' ? "text-emerald-600" : "text-slate-600")}>
                            المدفوع
                          </span>
                        </div>
                        <p className={cn(
                          "text-2xl font-bold ltr-nums",
                          paymentStatus === 'paid' ? "text-emerald-700" : "text-slate-900"
                        )}>
                          {formatCurrency(totalPaid)}
                        </p>
                      </div>

                      {/* Remaining */}
                      <div className={cn(
                        "rounded-xl p-4 border",
                        remaining > 0 ? "bg-gradient-to-br from-red-50 to-red-100 border-red-200" :
                        remaining < 0 ? "bg-gradient-to-br from-red-50 to-red-100 border-red-200" :
                        "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200"
                      )}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            remaining !== 0 ? "bg-red-200" : "bg-emerald-200"
                          )}>
                            <Banknote className={cn("h-4 w-4", remaining !== 0 ? "text-red-600" : "text-emerald-600")} />
                          </div>
                          <span className={cn("text-xs font-medium", remaining !== 0 ? "text-red-600" : "text-emerald-600")}>
                            المتبقي
                          </span>
                        </div>
                        <p className={cn(
                          "text-2xl font-bold ltr-nums",
                          remaining !== 0 ? "text-red-700" : "text-emerald-700"
                        )}>
                          {formatCurrency(remaining)}
                        </p>
                        {remaining < 0 && (
                          <span className="text-xs text-red-600">رصيد زائد</span>
                        )}
                      </div>

                      {/* Profit (Admin only) or Payment Status */}
                      {!isElzami && isAdmin ? (
                        <div className={cn(
                          "rounded-xl p-4 border",
                          (policy.cancelled || isTransferred) 
                            ? "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200" 
                            : "bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20"
                        )}>
                          <div className="flex items-center gap-2 mb-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              (policy.cancelled || isTransferred) ? "bg-slate-200" : "bg-primary/20"
                            )}>
                              <TrendingUp className={cn("h-4 w-4", (policy.cancelled || isTransferred) ? "text-slate-600" : "text-primary")} />
                            </div>
                            <span className={cn("text-xs font-medium", (policy.cancelled || isTransferred) ? "text-slate-600" : "text-primary")}>
                              الربح
                            </span>
                          </div>
                          <p className={cn(
                            "text-2xl font-bold ltr-nums",
                            (policy.cancelled || isTransferred) ? "text-slate-400 line-through" : "text-primary"
                          )}>
                            {(policy.cancelled || isTransferred) ? formatCurrency(0) : formatCurrency(policy.profit)}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl p-4 border bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                              <Clock className="h-4 w-4 text-slate-600" />
                            </div>
                            <span className="text-xs font-medium text-slate-600">المتبقي</span>
                          </div>
                          <p className={cn(
                            "text-2xl font-bold",
                            remainingDays < 0 ? "text-red-600" :
                            remainingDays <= 30 ? "text-amber-600" : "text-slate-900"
                          )}>
                            {remainingDays < 0 ? 'منتهية' : `${remainingDays} يوم`}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Payment Progress */}
                    <div className="bg-muted/30 rounded-xl p-4 border">
                      <div className="flex items-center justify-between mb-3">
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
                      <Progress value={percentagePaid} className="h-3" />
                    </div>

                    {/* Returned Cheques Warning */}
                    {hasReturnedCheques && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-red-800">شيكات مرتجعة ({returnedCheques.length})</p>
                            <p className="text-xs text-red-600">هذا المبلغ مخصوم من رصيد العميل</p>
                          </div>
                          <p className="text-xl font-bold text-red-700 ltr-nums">
                            {formatCurrency(returnedChequesTotal)}-
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Cancellation Info */}
                    {policy.cancelled && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                            <XCircle className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-red-800">وثيقة ملغاة</p>
                            {policy.cancellation_date && (
                              <p className="text-xs text-red-600">{formatDate(policy.cancellation_date)}</p>
                            )}
                            {policy.cancellation_note && (
                              <p className="text-sm text-red-700 mt-1">{policy.cancellation_note}</p>
                            )}
                          </div>
                          {refundAmount > 0 && (
                            <div className="text-left">
                              <p className="text-xs text-red-600">مرتجع للعميل</p>
                              <p className="text-lg font-bold text-red-700 ltr-nums">{formatCurrency(refundAmount)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Transferred Info */}
                    {isTransferred && !policy.cancelled && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                            <ArrowLeftRight className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-amber-800">وثيقة محوّلة</p>
                            <p className="text-xs text-amber-600">الدفعات والملفات تم نقلها للوثيقة الجديدة</p>
                          </div>
                          {policy.transferred_car_number && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                              إلى: {policy.transferred_car_number}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Package / Related Policies */}
                    {relatedPolicies.length > 0 && (
                      <Section title="وثائق الباقة الأخرى" icon={Layers}>
                        <div className="grid grid-cols-2 gap-3">
                          {relatedPolicies.map((rp) => {
                            const rpConfig = policyTypeConfig[rp.policy_type_parent] || policyTypeConfig.ELZAMI;
                            const RpIcon = rpConfig.icon;
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
                                  "hover:shadow-lg hover:scale-[1.02]",
                                  rpConfig.bg, rpConfig.border
                                )}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-start gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
                                      rpConfig.gradient
                                    )}>
                                      <RpIcon className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                      <p className={cn("font-bold", rpConfig.text)}>
                                        {policyTypeLabels[rp.policy_type_parent]}
                                      </p>
                                      {serviceName && (
                                        <p className="text-xs text-muted-foreground">{serviceName}</p>
                                      )}
                                      {rp.insurance_companies && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          {rp.insurance_companies.name_ar || rp.insurance_companies.name}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="text-left flex items-center gap-2">
                                    <div>
                                      <p className="text-lg font-bold text-foreground ltr-nums">{formatCurrency(rp.insurance_price)}</p>
                                      {isAdmin && rp.policy_type_parent !== 'ELZAMI' && (
                                        <p className="text-xs text-emerald-600 font-medium ltr-nums">
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
                        
                        {/* Package Total */}
                        <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-4 mt-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                                <Layers className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <p className="font-bold text-primary">مجموع الباقة</p>
                                <p className="text-xs text-muted-foreground">{relatedPolicies.length + 1} وثائق</p>
                              </div>
                            </div>
                            <div className="text-left">
                              <p className="text-xl font-bold text-primary ltr-nums">{formatCurrency(packageTotalPrice)}</p>
                              {isAdmin && (
                                <p className="text-sm text-emerald-600 font-medium ltr-nums">
                                  إجمالي الربح: {formatCurrency(packageTotalProfit)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </Section>
                    )}

                    {/* Insurance Company & Period Row */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Insurance Company */}
                      {(policy.insurance_companies || policy.brokers) && (
                        <Section title="شركة التأمين" icon={Building2}>
                          <div className="bg-muted/30 rounded-xl p-4 border">
                            <p className="text-lg font-bold">
                              {policy.insurance_companies?.name_ar || policy.insurance_companies?.name || policy.brokers?.name}
                            </p>
                            {policy.insurance_companies && policy.brokers && (
                              <p className="text-sm text-muted-foreground mt-1">الوسيط: {policy.brokers.name}</p>
                            )}
                          </div>
                        </Section>
                      )}

                      {/* Period */}
                      <Section title="فترة التأمين" icon={Calendar}>
                        <div className="bg-muted/30 rounded-xl p-4 border">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">من</p>
                              <p className="font-semibold text-sm">{formatDate(policy.start_date)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">إلى</p>
                              <p className="font-semibold text-sm">{formatDate(policy.end_date)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">المتبقي</p>
                              <p className={cn(
                                "font-semibold text-sm",
                                remainingDays < 0 ? "text-red-600" :
                                remainingDays <= 30 ? "text-amber-600" : "text-emerald-600"
                              )}>
                                {remainingDays < 0 ? 'منتهية' : `${remainingDays} يوم`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Section>
                    </div>

                    {/* Client & Car Info */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Client */}
                      <Section title="بيانات العميل" icon={User}>
                        <div className="bg-muted/30 rounded-xl p-4 border space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">الاسم</span>
                            <span className="font-semibold">{policy.clients.full_name}</span>
                          </div>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">رقم الهوية</span>
                            <span className="font-mono font-semibold"><bdi>{policy.clients.id_number}</bdi></span>
                          </div>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">الهاتف</span>
                            <span className="font-mono"><bdi>{policy.clients.phone_number || '-'}</bdi></span>
                          </div>
                          {policy.clients.file_number && (
                            <>
                              <Separator />
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">رقم الملف</span>
                                <span>{policy.clients.file_number}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </Section>

                      {/* Car */}
                      <Section title="بيانات السيارة" icon={Car}>
                        {policy.cars ? (
                          <div className="bg-muted/30 rounded-xl p-4 border space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">رقم السيارة</span>
                              <span className="font-mono font-bold text-primary"><bdi>{policy.cars.car_number}</bdi></span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">الشركة المصنعة</span>
                              <span className="font-semibold">{policy.cars.manufacturer_name || '-'}</span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">سنة الصنع</span>
                              <span>{policy.cars.year || '-'}</span>
                            </div>
                            {policy.cars.car_type && (
                              <>
                                <Separator />
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">النوع</span>
                                  <span>{carTypeLabels[policy.cars.car_type] || policy.cars.car_type}</span>
                                </div>
                              </>
                            )}
                            {policy.cars.car_value && (
                              <>
                                <Separator />
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">قيمة السيارة</span>
                                  <span className="font-semibold ltr-nums">{formatCurrency(policy.cars.car_value)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="bg-muted/30 rounded-xl p-6 border text-center">
                            <Car className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-muted-foreground">بدون سيارة</p>
                          </div>
                        )}
                      </Section>
                    </div>

                    {/* Pricing Details - Admin only */}
                    {isAdmin && !isElzami && (
                      <Section title="تفاصيل الأسعار" icon={DollarSign}>
                        <div className="bg-muted/30 rounded-xl p-4 border">
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-3 rounded-lg bg-background">
                              <p className="text-xs text-muted-foreground mb-1">سعر التأمين</p>
                              <p className="font-bold text-lg ltr-nums">{formatCurrency(policy.insurance_price)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-orange-50">
                              <p className="text-xs text-orange-600 mb-1">مدفوع للشركة</p>
                              <p className="font-bold text-lg text-orange-700 ltr-nums">{formatCurrency(policy.payed_for_company)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-emerald-50">
                              <p className="text-xs text-emerald-600 mb-1">الربح</p>
                              <p className="font-bold text-lg text-emerald-700 ltr-nums">{formatCurrency(policy.profit)}</p>
                            </div>
                          </div>
                        </div>
                      </Section>
                    )}

                    {/* Notes */}
                    {policy.notes && (
                      <Section title="ملاحظات" icon={FileText}>
                        <div className="bg-muted/30 rounded-xl p-4 border">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{policy.notes}</p>
                        </div>
                      </Section>
                    )}

                    {/* Transfer History */}
                    {transferHistory.length > 0 && (
                      <Section title={`سجل التحويلات (${transferHistory.length})`} icon={History}>
                        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 space-y-3">
                          {transferHistory.map((transfer) => (
                            <div key={transfer.id} className="flex items-center gap-4 pb-3 border-b border-amber-200 last:border-0 last:pb-0">
                              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                <ArrowLeftRight className="h-4 w-4 text-amber-600" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm bg-amber-100 px-2 py-0.5 rounded">
                                    {transfer.from_car?.car_number}
                                  </span>
                                  <ArrowLeftRight className="h-3 w-3 text-amber-600" />
                                  <span className="font-mono text-sm bg-primary/10 text-primary px-2 py-0.5 rounded">
                                    {transfer.to_car?.car_number}
                                  </span>
                                </div>
                                {transfer.note && (
                                  <p className="text-xs text-muted-foreground mt-1">{transfer.note}</p>
                                )}
                              </div>
                              <div className="text-left shrink-0">
                                <p className="text-xs text-muted-foreground">{formatDate(transfer.transfer_date)}</p>
                                {transfer.adjustment_type && transfer.adjustment_type !== 'none' && (
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {transfer.adjustment_type === 'customer_pays' ? 'دفع' : 'مرتجع'}: ₪{transfer.adjustment_amount}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Creator Info */}
                    {creatorName && (
                      <p className="text-xs text-center text-muted-foreground pt-4 border-t">
                        أنشئ بواسطة: {creatorName}
                      </p>
                    )}
                  </div>
                )}

                {activeSection === 'payments' && (
                  <div className="p-6">
                    <PolicyPaymentsSection
                      policyId={policy.id}
                      payments={payments}
                      insurancePrice={policy.insurance_price}
                      onPaymentsChange={handlePaymentsChange}
                      autoOpenAdd={showQuickPayment}
                      onAutoOpenHandled={() => setShowQuickPayment(false)}
                    />
                  </div>
                )}

                {activeSection === 'files' && (
                  <div className="p-6">
                    <PolicyFilesSection 
                      policyId={policy.id} 
                      policyNumber={policy.policy_number}
                      clientId={policy.clients.id}
                      clientPhoneNumber={policy.clients.phone_number}
                      clientName={policy.clients.full_name}
                      onPolicyNumberSaved={() => fetchPolicyDetails()}
                    />
                  </div>
                )}
              </ScrollArea>
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
