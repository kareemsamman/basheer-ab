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
  User, Car, Building2, Pencil, CreditCard, 
  Phone, Banknote, ImageIcon, FileText, Calendar, CheckCircle2, Clock, XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PolicyEditDrawer } from "./PolicyEditDrawer";
import { PolicyPaymentsSection } from "./PolicyPaymentsSection";
import { PolicyImagesSection } from "./PolicyImagesSection";

interface PolicyDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string | null;
  onUpdated?: () => void;
}

interface PolicyDetails {
  id: string;
  policy_type_parent: string;
  policy_type_child: string | null;
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
  clients: {
    id: string;
    full_name: string;
    phone_number: string | null;
    file_number: string | null;
    id_number: string;
    less_than_24: boolean | null;
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
  };
  insurance_companies: {
    id: string;
    name: string;
    name_ar: string | null;
  };
  brokers?: {
    id: string;
    name: string;
  } | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  payment_date: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  refused: boolean | null;
  notes: string | null;
}

const policyTypeLabels: Record<string, string> = {
  "ELZAMI": "إلزامي",
  "THIRD_FULL": "ثالث/شامل",
  "ROAD_SERVICE": "خدمات الطريق",
  "ACCIDENT_FEE_EXEMPTION": "إعفاء رسوم حادث",
};

const policyChildLabels: Record<string, string> = {
  "THIRD": "طرف ثالث",
  "FULL": "شامل",
};

const policyTypeColors: Record<string, string> = {
  "ELZAMI": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "THIRD_FULL": "bg-purple-500/10 text-purple-600 border-purple-500/20",
  "ROAD_SERVICE": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  "ACCIDENT_FEE_EXEMPTION": "bg-green-500/10 text-green-600 border-green-500/20",
};

const carTypeLabels: Record<string, string> = {
  "car": "خصوصي",
  "cargo": "شحن",
  "small": "صغير",
  "taxi": "تاكسي",
  "tjeradown4": "تجاري (أقل من 4 طن)",
  "tjeraup4": "تجاري (أكثر من 4 طن)",
};

export function PolicyDetailsDrawer({ open, onOpenChange, policyId, onUpdated }: PolicyDetailsDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<PolicyDetails | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("insurance");

  const fetchPolicyDetails = async () => {
    if (!policyId) return;
    
    setLoading(true);
    try {
      const { data: policyData, error: policyError } = await supabase
        .from('policies')
        .select(`
          *,
          clients!inner(id, full_name, phone_number, file_number, id_number, less_than_24),
          cars!inner(id, car_number, manufacturer_name, year, car_type, car_value, model, color),
          insurance_companies!inner(id, name, name_ar),
          brokers(id, name)
        `)
        .eq('id', policyId)
        .single();

      if (policyError) throw policyError;
      setPolicy(policyData as PolicyDetails);

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('policy_payments')
        .select('*')
        .eq('policy_id', policyId)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);

    } catch (error) {
      console.error('Error fetching policy details:', error);
      toast({ title: "خطأ", description: "فشل في تحميل تفاصيل الوثيقة", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && policyId) {
      fetchPolicyDetails();
      setActiveTab("insurance");
    }
  }, [open, policyId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG');
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "₪0";
    return `₪${amount.toLocaleString('ar-EG')}`;
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
  const totalPaid = payments.filter(p => !p.refused).reduce((sum, p) => sum + p.amount, 0);
  const remaining = policy ? policy.insurance_price - totalPaid : 0;
  const percentagePaid = policy ? Math.min(100, Math.round((totalPaid / policy.insurance_price) * 100)) : 0;
  const paymentStatus = remaining <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

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
                  <div>
                    <DialogTitle className="text-xl font-bold mb-2">تفاصيل الوثيقة</DialogTitle>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={cn("border text-sm", policyTypeColors[policy.policy_type_parent])}>
                        {policyTypeLabels[policy.policy_type_parent]}
                        {policy.policy_type_child && ` - ${policyChildLabels[policy.policy_type_child]}`}
                      </Badge>
                      <Badge variant={status.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      {policy.is_under_24 && (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">أقل من 24</Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 ml-1" />
                    تعديل
                  </Button>
                </div>

                {/* Main Insurance Info - Hero Section */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  {/* Price */}
                  <div className="bg-background rounded-xl p-4 text-center border shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">سعر التأمين</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(policy.insurance_price)}</p>
                  </div>
                  
                  {/* Paid */}
                  <div className="bg-background rounded-xl p-4 text-center border shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">المدفوع</p>
                    <p className={cn("text-2xl font-bold", paymentStatus === "paid" ? "text-success" : "text-amber-600")}>
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

                  {/* Profit */}
                  <div className="bg-success/10 rounded-xl p-4 text-center border border-success/20 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">الربح</p>
                    <p className="text-2xl font-bold text-success">{formatCurrency(policy.profit)}</p>
                  </div>
                </div>

                {/* Payment Progress */}
                <div className="mt-4 bg-background rounded-xl p-4 border shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">حالة الدفع</span>
                    <Badge variant={paymentStatus === "paid" ? "success" : paymentStatus === "partial" ? "warning" : "destructive"}>
                      {paymentStatus === "paid" ? "مدفوع بالكامل" : paymentStatus === "partial" ? `مدفوع ${percentagePaid}%` : "غير مدفوع"}
                    </Badge>
                  </div>
                  <Progress value={percentagePaid} className="h-2" />
                </div>
              </div>

              {/* Tabs Content */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="mx-6 mt-4 grid grid-cols-4 h-10">
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
                </TabsList>

                <ScrollArea className="flex-1">
                  {/* Insurance Tab */}
                  <TabsContent value="insurance" className="p-6 space-y-4 m-0">
                    {/* Company */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <Building2 className="h-4 w-4" />
                        <span>شركة التأمين</span>
                      </div>
                      <p className="text-lg font-bold">{policy.insurance_companies.name_ar || policy.insurance_companies.name}</p>
                      {policy.brokers && (
                        <p className="text-sm text-muted-foreground mt-1">الوسيط: {policy.brokers.name}</p>
                      )}
                    </Card>

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
                          <p className={cn(
                            "font-semibold",
                            remainingDays < 0 ? "text-destructive" : remainingDays <= 30 ? "text-amber-600" : "text-success"
                          )}>
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
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">مدفوع للشركة</span>
                          <span className="font-bold text-orange-600">{formatCurrency(policy.payed_for_company)}</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-muted-foreground">الربح</span>
                          <span className="font-bold text-success">{formatCurrency(policy.profit)}</span>
                        </div>
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
                      onPaymentsChange={handlePaymentsChange}
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
                          <p className="font-mono font-semibold" dir="ltr">{policy.clients.id_number}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">رقم الملف</span>
                          <p>{policy.clients.file_number || "-"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono" dir="ltr">{policy.clients.phone_number || "-"}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Car */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <Car className="h-4 w-4" />
                        <span>بيانات السيارة</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">رقم السيارة</span>
                          <p className="font-mono font-semibold text-base" dir="ltr">{policy.cars.car_number}</p>
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
                          <p>{policy.cars.car_type ? carTypeLabels[policy.cars.car_type] || policy.cars.car_type : "-"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">قيمة السيارة</span>
                          <p className="font-semibold">{policy.cars.car_value ? formatCurrency(policy.cars.car_value) : "-"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">اللون</span>
                          <p>{policy.cars.color || "-"}</p>
                        </div>
                      </div>
                    </Card>
                  </TabsContent>

                  {/* Files Tab */}
                  <TabsContent value="files" className="p-6 m-0">
                    <PolicyImagesSection policyId={policy.id} />
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              لم يتم العثور على الوثيقة
            </div>
          )}
        </DialogContent>
      </Dialog>

      {policy && (
        <PolicyEditDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          policy={policy}
          onSaved={handleEditComplete}
        />
      )}
    </>
  );
}
