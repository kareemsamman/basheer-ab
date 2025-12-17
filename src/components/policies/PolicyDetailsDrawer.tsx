import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  User, Car, Building2, Pencil, CreditCard, 
  Phone, Banknote, ImageIcon, FileText
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
  const [activeTab, setActiveTab] = useState("details");

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
      setActiveTab("details");
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
    if (!policy) return { label: "-", variant: "secondary" as const };
    if (policy.cancelled) return { label: "ملغاة", variant: "destructive" as const };
    if (policy.transferred) return { label: "محوّلة", variant: "warning" as const };
    const today = new Date();
    const endDate = new Date(policy.end_date);
    if (endDate < today) return { label: "منتهية", variant: "destructive" as const };
    return { label: "نشطة", variant: "success" as const };
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
  const percentagePaid = policy ? Math.round((totalPaid / policy.insurance_price) * 100) : 0;
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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="right" 
          className="w-full sm:max-w-2xl p-0 overflow-hidden"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="p-4 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg font-bold">تفاصيل الوثيقة</SheetTitle>
                {policy && (
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4 ml-1" />
                    تعديل
                  </Button>
                )}
              </div>
              {policy && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge className={cn("border", policyTypeColors[policy.policy_type_parent])}>
                    {policyTypeLabels[policy.policy_type_parent]}
                    {policy.policy_type_child && ` - ${policyChildLabels[policy.policy_type_child]}`}
                  </Badge>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {policy.is_under_24 && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">أقل من 24</Badge>
                  )}
                </div>
              )}
            </SheetHeader>

            {/* Content with Tabs */}
            {loading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : policy ? (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="mx-4 mt-4 grid grid-cols-4">
                  <TabsTrigger value="details" className="text-xs">المعلومات</TabsTrigger>
                  <TabsTrigger value="pricing" className="text-xs">الأسعار</TabsTrigger>
                  <TabsTrigger value="payments" className="text-xs">الدفعات</TabsTrigger>
                  <TabsTrigger value="files" className="text-xs">الملفات</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1">
                  {/* Details Tab */}
                  <TabsContent value="details" className="p-4 space-y-4 m-0">
                    {/* Client */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <User className="h-4 w-4" />
                        <span>العميل</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">الاسم</span>
                          <p className="font-medium">{policy.clients.full_name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">رقم الهوية</span>
                          <p className="font-mono" dir="ltr">{policy.clients.id_number}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">رقم الملف</span>
                          <p>{policy.clients.file_number || "-"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono" dir="ltr">{policy.clients.phone_number || "-"}</span>
                        </div>
                      </div>
                    </Card>

                    {/* Car */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <Car className="h-4 w-4" />
                        <span>السيارة</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">رقم السيارة</span>
                          <p className="font-mono font-medium" dir="ltr">{policy.cars.car_number}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">الشركة المصنعة</span>
                          <p>{policy.cars.manufacturer_name || "-"}</p>
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
                          <p>{policy.cars.car_value ? formatCurrency(policy.cars.car_value) : "-"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">اللون</span>
                          <p>{policy.cars.color || "-"}</p>
                        </div>
                      </div>
                    </Card>

                    {/* Company & Period */}
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                        <Building2 className="h-4 w-4" />
                        <span>الشركة والفترة</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">شركة التأمين</span>
                          <p className="font-medium">{policy.insurance_companies.name_ar || policy.insurance_companies.name}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">الوسيط</span>
                          <p>{policy.brokers?.name || "-"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">تاريخ البدء</span>
                          <p>{formatDate(policy.start_date)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">تاريخ الانتهاء</span>
                          <p>{formatDate(policy.end_date)}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs">المتبقي</span>
                          <p className={cn(
                            "font-medium",
                            remainingDays < 0 ? "text-destructive" : remainingDays <= 30 ? "text-amber-600" : "text-success"
                          )}>
                            {remainingDays < 0 ? `منتهية منذ ${Math.abs(remainingDays)} يوم` : `${remainingDays} يوم`}
                          </p>
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

                  {/* Pricing Tab */}
                  <TabsContent value="pricing" className="p-4 space-y-4 m-0">
                    <Card className="p-4">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
                        <Banknote className="h-4 w-4" />
                        <span>السعر والربح</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">سعر التأمين</p>
                          <p className="text-xl font-bold">{formatCurrency(policy.insurance_price)}</p>
                        </div>
                        <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">مدفوع للشركة</p>
                          <p className="text-xl font-bold text-orange-600">{formatCurrency(policy.payed_for_company)}</p>
                        </div>
                        <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">الربح</p>
                          <p className="text-xl font-bold text-success">{formatCurrency(policy.profit)}</p>
                        </div>
                      </div>
                    </Card>

                    {/* Payment Status */}
                    <Card className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-primary font-semibold">
                          <CreditCard className="h-4 w-4" />
                          <span>حالة الدفع</span>
                        </div>
                        <Badge variant={paymentStatus === "paid" ? "success" : paymentStatus === "partial" ? "warning" : "destructive"}>
                          {paymentStatus === "paid" ? "مدفوع بالكامل" : paymentStatus === "partial" ? "مدفوع جزئياً" : "غير مدفوع"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">المدفوع</p>
                          <p className="font-bold text-success">{formatCurrency(totalPaid)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">المتبقي</p>
                          <p className={cn("font-bold", remaining > 0 ? "text-destructive" : "text-success")}>
                            {formatCurrency(remaining)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">النسبة</p>
                          <p className="font-bold">{Math.min(percentagePaid, 100)}%</p>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all",
                            paymentStatus === "paid" ? "bg-success" : paymentStatus === "partial" ? "bg-amber-500" : "bg-destructive"
                          )}
                          style={{ width: `${Math.min(percentagePaid, 100)}%` }}
                        />
                      </div>
                    </Card>
                  </TabsContent>

                  {/* Payments Tab */}
                  <TabsContent value="payments" className="p-4 m-0">
                    <PolicyPaymentsSection
                      policyId={policy.id}
                      payments={payments}
                      onPaymentsChange={handlePaymentsChange}
                    />
                  </TabsContent>

                  {/* Files Tab */}
                  <TabsContent value="files" className="p-4 m-0">
                    <PolicyImagesSection policyId={policy.id} />
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                لم يتم العثور على الوثيقة
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Drawer */}
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
