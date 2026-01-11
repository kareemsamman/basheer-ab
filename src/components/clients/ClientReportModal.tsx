import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Printer, 
  MessageSquare, 
  User, 
  Car, 
  FileText, 
  Phone, 
  Calendar,
  Building2,
  Wallet,
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  ArrowRightLeft,
  Loader2,
  Image,
  File,
  CreditCard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PolicyFile {
  id: string;
  cdn_url: string;
  original_name: string;
  mime_type: string;
}

interface PolicyPayment {
  id: string;
  amount: number;
  payment_type: string;
  payment_date: string;
  refused: boolean | null;
}

interface ClientReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: {
    id: string;
    full_name: string;
    id_number: string;
    file_number: string | null;
    phone_number: string | null;
    phone_number_2: string | null;
    birth_date: string | null;
    date_joined: string | null;
    branch_id: string | null;
    broker_id: string | null;
    signature_url: string | null;
  };
  cars: Array<{
    id: string;
    car_number: string;
    manufacturer_name: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    car_type: string | null;
  }>;
  policies: Array<{
    id: string;
    policy_number: string | null;
    policy_type_parent: string;
    policy_type_child: string | null;
    start_date: string;
    end_date: string;
    insurance_price: number;
    profit: number | null;
    cancelled: boolean | null;
    transferred: boolean | null;
    group_id: string | null;
    company: { name: string; name_ar: string | null } | null;
    car: { id: string; car_number: string } | null;
  }>;
  paymentSummary: {
    total_paid: number;
    total_remaining: number;
    total_profit: number;
  };
  walletBalance: {
    total_refunds: number;
    transaction_count: number;
  };
  broker: { id: string; name: string; phone: string | null } | null;
  branchName: string | null;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات طريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم',
  HEALTH: 'صحي',
  LIFE: 'حياة',
  PROPERTY: 'ممتلكات',
  TRAVEL: 'سفر',
  BUSINESS: 'أعمال',
  OTHER: 'أخرى',
};

const carTypeLabels: Record<string, string> = {
  car: 'خصوصي',
  cargo: 'شحن',
  small: 'صغير',
  taxi: 'تاكسي',
  tjeradown4: 'تجاري (<4 طن)',
  tjeraup4: 'تجاري (>4 طن)',
};

const paymentTypeLabels: Record<string, string> = {
  cash: 'نقدي',
  cheque: 'شيك',
  credit_card: 'بطاقة',
  bank_transfer: 'تحويل',
};

export function ClientReportModal({
  open,
  onOpenChange,
  client,
  cars,
  policies,
  paymentSummary,
  walletBalance,
  broker,
  branchName,
}: ClientReportModalProps) {
  const [sendingSms, setSendingSms] = useState(false);
  const [expandedCars, setExpandedCars] = useState<Set<string>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      calendar: 'gregory',
    });
  };

  const formatDateShort = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const getPolicyStatus = (policy: { cancelled: boolean | null; transferred: boolean | null; end_date: string }) => {
    if (policy.cancelled) return { label: 'ملغاة', icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' };
    if (policy.transferred) return { label: 'محولة', icon: ArrowRightLeft, color: 'text-amber-600', bg: 'bg-amber-100' };
    const endDate = new Date(policy.end_date);
    const today = new Date();
    if (endDate < today) return { label: 'منتهية', icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' };
    return { label: 'سارية', icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' };
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول');
        return;
      }

      const reportResponse = await supabase.functions.invoke('generate-client-report', {
        body: { client_id: client.id },
      });

      if (reportResponse.error) throw reportResponse.error;
      
      const reportUrl = reportResponse.data?.url;
      if (!reportUrl) throw new Error('Failed to generate report URL');

      // Open the HTML report in a new tab for printing
      const printWindow = window.open(reportUrl, '_blank');
      if (printWindow) {
        // Wait for page to load then trigger print
        printWindow.addEventListener('load', () => {
          setTimeout(() => printWindow.print(), 500);
        });
      }
    } catch (error) {
      console.error('Error generating print report:', error);
      toast.error('فشل في تحضير التقرير للطباعة');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSendSms = async () => {
    if (!client.phone_number) {
      toast.error('لا يوجد رقم هاتف للعميل');
      return;
    }

    setSendingSms(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول');
        return;
      }

      const reportResponse = await supabase.functions.invoke('generate-client-report', {
        body: { client_id: client.id },
      });

      if (reportResponse.error) throw reportResponse.error;
      
      const reportUrl = reportResponse.data?.url;
      if (!reportUrl) throw new Error('Failed to generate report URL');

      const message = `${client.full_name} عزيزنا/ي\n` +
        `يمكنك مشاهدة تقرير تأميناتك الكامل عبر الرابط:\n${reportUrl}\n\n` +
        `بشير للتأمينات 🚗`;

      const smsResponse = await supabase.functions.invoke('send-sms', {
        body: {
          phone: client.phone_number,
          message,
        },
      });

      if (smsResponse.error) throw smsResponse.error;

      await supabase.from('sms_logs').insert([{
        phone_number: client.phone_number,
        message,
        client_id: client.id,
        sms_type: 'manual' as const,
        status: 'sent',
        sent_at: new Date().toISOString(),
      }]);

      toast.success('تم إرسال رابط التقرير عبر SMS بنجاح');
    } catch (error) {
      console.error('Error sending SMS:', error);
      toast.error('فشل في إرسال الرسالة');
    } finally {
      setSendingSms(false);
    }
  };

  const totalInsurance = policies.reduce((sum, p) => sum + p.insurance_price, 0);
  const activePolicies = policies.filter(p => {
    const endDate = new Date(p.end_date);
    return !p.cancelled && !p.transferred && endDate >= new Date();
  });

  // Group policies by car
  const policiesByCar = cars.map(car => ({
    car,
    policies: policies.filter(p => p.car?.id === car.id),
  }));

  // Policies without car
  const policiesNoCar = policies.filter(p => !p.car);

  const toggleCarExpand = (carId: string) => {
    setExpandedCars(prev => {
      const next = new Set(prev);
      if (next.has(carId)) next.delete(carId);
      else next.add(carId);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-l from-primary to-primary/80 text-primary-foreground p-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-lg">تقرير العميل الشامل</h2>
                <p className="text-xs opacity-80">{formatDate(new Date().toISOString())}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleSendSms} 
                disabled={sendingSms || !client.phone_number}
                className="gap-1.5"
              >
                {sendingSms ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">SMS</span>
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handlePrint} 
                disabled={isPrinting}
                className="gap-1.5"
              >
                {isPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">طباعة</span>
              </Button>
            </div>
          </div>
        </div>

        <div ref={printRef} className="p-4 space-y-4">
          {/* Client Info Card */}
          <div className="bg-muted/30 rounded-xl p-4 border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{client.full_name}</h3>
                <p className="text-sm text-muted-foreground ltr-nums">{client.id_number}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="bg-background rounded-lg p-2 border">
                <p className="text-[10px] text-muted-foreground">الهاتف</p>
                <p className="font-semibold ltr-nums">{client.phone_number || '-'}</p>
              </div>
              <div className="bg-background rounded-lg p-2 border">
                <p className="text-[10px] text-muted-foreground">رقم الملف</p>
                <p className="font-semibold">{client.file_number || '-'}</p>
              </div>
              <div className="bg-background rounded-lg p-2 border">
                <p className="text-[10px] text-muted-foreground">تاريخ الانضمام</p>
                <p className="font-semibold">{formatDate(client.date_joined)}</p>
              </div>
              {branchName && (
                <div className="bg-background rounded-lg p-2 border">
                  <p className="text-[10px] text-muted-foreground">الفرع</p>
                  <p className="font-semibold">{branchName}</p>
                </div>
              )}
            </div>
          </div>

          {/* Financial Summary - Compact */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-primary/5 rounded-xl p-3 border border-primary/20 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي التأمينات</p>
              <p className="text-lg font-bold text-primary ltr-nums">₪{totalInsurance.toLocaleString()}</p>
            </div>
            <div className="bg-success/5 rounded-xl p-3 border border-success/20 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">المدفوع</p>
              <p className="text-lg font-bold text-success ltr-nums">₪{paymentSummary.total_paid.toLocaleString()}</p>
            </div>
            <div className={cn(
              "rounded-xl p-3 border text-center",
              paymentSummary.total_remaining > 0 
                ? "bg-destructive/5 border-destructive/20" 
                : "bg-success/5 border-success/20"
            )}>
              <p className="text-[10px] text-muted-foreground mb-0.5">المتبقي</p>
              <p className={cn(
                "text-lg font-bold ltr-nums",
                paymentSummary.total_remaining > 0 ? "text-destructive" : "text-success"
              )}>
                ₪{paymentSummary.total_remaining.toLocaleString()}
              </p>
            </div>
          </div>

          {walletBalance.total_refunds > 0 && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-center">
              <div className="flex items-center justify-center gap-2">
                <Wallet className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-700">رصيد للعميل:</span>
                <span className="font-bold text-amber-600 ltr-nums">₪{walletBalance.total_refunds.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Active Policies Count */}
          <div className="flex items-center justify-center gap-4 py-3 bg-gradient-to-l from-success/10 to-success/5 rounded-xl border border-success/20">
            <div className="text-center">
              <p className="text-3xl font-bold text-success">{activePolicies.length}</p>
              <p className="text-xs text-success/80">وثائق سارية</p>
            </div>
            <div className="w-px h-10 bg-success/20" />
            <div className="text-center">
              <p className="text-3xl font-bold text-muted-foreground">{cars.length}</p>
              <p className="text-xs text-muted-foreground">سيارات</p>
            </div>
          </div>

          {/* Policies by Car */}
          <div className="space-y-3">
            <h3 className="font-bold text-base flex items-center gap-2 text-primary">
              <Car className="h-4 w-4" />
              السيارات والوثائق
            </h3>

            {policiesByCar.map(({ car, policies: carPolicies }) => {
              const isExpanded = expandedCars.has(car.id);
              const carTotalPrice = carPolicies.reduce((s, p) => s + p.insurance_price, 0);
              const activeCount = carPolicies.filter(p => !p.cancelled && !p.transferred && new Date(p.end_date) >= new Date()).length;
              
              return (
                <div key={car.id} className="border rounded-xl overflow-hidden">
                  {/* Car Header */}
                  <div 
                    className="bg-muted/30 p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleCarExpand(car.id)}
                  >
                    <div className="bg-yellow-200 border-2 border-foreground rounded px-2 py-0.5">
                      <span className="font-mono font-bold text-sm">{car.car_number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {car.manufacturer_name} {car.model} {car.year}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{carPolicies.length} وثائق</span>
                        {activeCount > 0 && (
                          <Badge variant="success" className="h-5 text-[10px]">{activeCount} سارية</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-primary ltr-nums">₪{carTotalPrice.toLocaleString()}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Policies */}
                  {isExpanded && carPolicies.length > 0 && (
                    <div className="divide-y">
                      {carPolicies.map(policy => {
                        const status = getPolicyStatus(policy);
                        const StatusIcon = status.icon;
                        return (
                          <div key={policy.id} className="p-3 bg-background">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {policyTypeLabels[policy.policy_type_parent]}
                                </Badge>
                                <Badge className={cn("gap-1 text-[10px]", status.bg, status.color, "border-0")}>
                                  <StatusIcon className="h-3 w-3" />
                                  {status.label}
                                </Badge>
                              </div>
                              <p className="font-bold text-primary ltr-nums">₪{policy.insurance_price.toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{policy.company?.name_ar || policy.company?.name || '-'}</span>
                              <span className="ltr-nums">{formatDateShort(policy.start_date)} - {formatDateShort(policy.end_date)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isExpanded && carPolicies.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      لا توجد وثائق لهذه السيارة
                    </div>
                  )}
                </div>
              );
            })}

            {/* Policies without car */}
            {policiesNoCar.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-muted/30 p-3">
                  <p className="font-medium text-sm text-muted-foreground">وثائق أخرى (بدون سيارة)</p>
                </div>
                <div className="divide-y">
                  {policiesNoCar.map(policy => {
                    const status = getPolicyStatus(policy);
                    const StatusIcon = status.icon;
                    return (
                      <div key={policy.id} className="p-3 bg-background">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {policyTypeLabels[policy.policy_type_parent]}
                            </Badge>
                            <Badge className={cn("gap-1 text-[10px]", status.bg, status.color, "border-0")}>
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </Badge>
                          </div>
                          <p className="font-bold text-primary ltr-nums">₪{policy.insurance_price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{policy.company?.name_ar || policy.company?.name || '-'}</span>
                          <span className="ltr-nums">{formatDateShort(policy.start_date)} - {formatDateShort(policy.end_date)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t text-xs text-muted-foreground">
            <div className="text-center">
              <p className="font-bold text-primary text-sm">بشير للتأمينات</p>
              <p className="text-[10px]">BASHEER INSURANCE</p>
            </div>
            <p className="ltr-nums">{new Date().toLocaleDateString('ar-EG', { calendar: 'gregory' })}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
