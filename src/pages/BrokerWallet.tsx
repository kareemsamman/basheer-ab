import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileUploader } from "@/components/media/FileUploader";
import { 
  ArrowLeft, 
  Plus, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Banknote,
  Building2,
  Receipt,
  XCircle,
  Image
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Broker {
  id: string;
  name: string;
  phone: string | null;
}

interface Settlement {
  id: string;
  direction: 'we_owe' | 'broker_owes';
  total_amount: number;
  settlement_number: string | null;
  settlement_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  payment_type: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  bank_reference: string | null;
  refused: boolean;
  card_last_four: string | null;
}

interface Policy {
  id: string;
  policy_number: string | null;
  insurance_price: number;
  start_date: string;
  client: { full_name: string } | null;
  broker_direction: string | null;
}

type PaymentType = 'cash' | 'cheque' | 'bank_transfer' | 'visa';

const paymentTypeLabels: Record<PaymentType, string> = {
  cash: 'نقداً',
  cheque: 'شيك',
  bank_transfer: 'تحويل بنكي',
  visa: 'بطاقة ائتمان',
};

const PaymentTypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'cash': return <Banknote className="h-4 w-4" />;
    case 'cheque': return <Receipt className="h-4 w-4" />;
    case 'bank_transfer': return <Building2 className="h-4 w-4" />;
    case 'visa': return <CreditCard className="h-4 w-4" />;
    default: return <Wallet className="h-4 w-4" />;
  }
};

export default function BrokerWallet() {
  const { brokerId } = useParams<{ brokerId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [broker, setBroker] = useState<Broker | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewSettlement, setShowNewSettlement] = useState(false);
  
  // Wallet summary
  const [weOweTotal, setWeOweTotal] = useState(0);
  const [brokerOwesTotal, setBrokerOwesTotal] = useState(0);

  // New settlement form
  const [direction, setDirection] = useState<'we_owe' | 'broker_owes'>('broker_owes');
  const [totalAmount, setTotalAmount] = useState('');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [brokerPolicies, setBrokerPolicies] = useState<Policy[]>([]);
  const [saving, setSaving] = useState(false);

  // Payment method fields
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeImageUrl, setChequeImageUrl] = useState('');
  const [bankReference, setBankReference] = useState('');

  useEffect(() => {
    if (brokerId) {
      fetchBrokerData();
    }
  }, [brokerId]);

  const fetchBrokerData = async () => {
    setLoading(true);
    try {
      // Fetch broker
      const { data: brokerData, error: brokerError } = await supabase
        .from('brokers')
        .select('id, name, phone')
        .eq('id', brokerId)
        .single();

      if (brokerError) throw brokerError;
      setBroker(brokerData);

      // Fetch settlements
      const { data: settlementsData } = await supabase
        .from('broker_settlements')
        .select('*')
        .eq('broker_id', brokerId)
        .order('settlement_date', { ascending: false });

      if (settlementsData) {
        setSettlements(settlementsData as Settlement[]);
        
        // Calculate totals (exclude refused)
        const weOwe = settlementsData
          .filter((s: any) => s.direction === 'we_owe' && !s.refused)
          .reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
        const brokerOwes = settlementsData
          .filter((s: any) => s.direction === 'broker_owes' && !s.refused)
          .reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
        
        setWeOweTotal(weOwe);
        setBrokerOwesTotal(brokerOwes);
      }

      // Fetch policies linked to this broker
      const { data: policiesData } = await supabase
        .from('policies')
        .select('id, policy_number, insurance_price, start_date, broker_direction, client:clients(full_name)')
        .eq('broker_id', brokerId)
        .is('deleted_at', null)
        .order('start_date', { ascending: false });

      if (policiesData) {
        setBrokerPolicies(policiesData as unknown as Policy[]);
      }
    } catch (error) {
      console.error('Error fetching broker data:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات الوسيط",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePolicySelect = (policyId: string, checked: boolean) => {
    if (checked) {
      setSelectedPolicies([...selectedPolicies, policyId]);
    } else {
      setSelectedPolicies(selectedPolicies.filter(id => id !== policyId));
      const newAllocations = { ...allocations };
      delete newAllocations[policyId];
      setAllocations(newAllocations);
    }
  };

  const handleAllocationChange = (policyId: string, amount: number) => {
    setAllocations({ ...allocations, [policyId]: amount });
  };

  const handleEqualSplit = () => {
    if (selectedPolicies.length === 0 || !totalAmount) return;
    const total = parseFloat(totalAmount);
    const perPolicy = Math.floor(total / selectedPolicies.length);
    const remainder = total - (perPolicy * selectedPolicies.length);
    
    const newAllocations: Record<string, number> = {};
    selectedPolicies.forEach((id, index) => {
      newAllocations[id] = index === 0 ? perPolicy + remainder : perPolicy;
    });
    setAllocations(newAllocations);
  };

  const handleProportionalSplit = () => {
    if (selectedPolicies.length === 0 || !totalAmount) return;
    const total = parseFloat(totalAmount);
    const selectedPolicyData = brokerPolicies.filter(p => selectedPolicies.includes(p.id));
    const totalPremium = selectedPolicyData.reduce((sum, p) => sum + (p.insurance_price || 0), 0);
    
    if (totalPremium === 0) {
      handleEqualSplit();
      return;
    }

    const newAllocations: Record<string, number> = {};
    let allocated = 0;
    selectedPolicyData.forEach((p, index) => {
      if (index === selectedPolicyData.length - 1) {
        newAllocations[p.id] = total - allocated;
      } else {
        const amount = Math.round((p.insurance_price / totalPremium) * total);
        newAllocations[p.id] = amount;
        allocated += amount;
      }
    });
    setAllocations(newAllocations);
  };

  const validateChequeNumber = (num: string) => {
    return /^\d{8}$/.test(num);
  };

  const handleSaveSettlement = async () => {
    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      toast({ title: "خطأ", description: "يرجى إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    if (paymentType === 'cheque' && !validateChequeNumber(chequeNumber)) {
      toast({ title: "خطأ", description: "رقم الشيك يجب أن يكون 8 أرقام", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Create settlement
      const { data: settlement, error: settlementError } = await supabase
        .from('broker_settlements')
        .insert({
          broker_id: brokerId,
          direction,
          total_amount: parseFloat(totalAmount),
          settlement_date: settlementDate,
          notes,
          status: 'completed',
          created_by_admin_id: user?.id,
          payment_type: paymentType,
          cheque_number: paymentType === 'cheque' ? chequeNumber : null,
          cheque_image_url: paymentType === 'cheque' ? chequeImageUrl : null,
          bank_reference: paymentType === 'bank_transfer' ? bankReference : null,
          refused: false,
        })
        .select()
        .single();

      if (settlementError) throw settlementError;

      // Create settlement items for selected policies
      if (selectedPolicies.length > 0 && settlement) {
        const items = selectedPolicies.map(policyId => ({
          settlement_id: settlement.id,
          policy_id: policyId,
          amount: allocations[policyId] || 0,
        }));

        const { error: itemsError } = await supabase
          .from('broker_settlement_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      toast({ title: "تم الحفظ", description: "تم إنشاء التسوية بنجاح" });
      setShowNewSettlement(false);
      resetForm();
      fetchBrokerData();
    } catch (error) {
      console.error('Error saving settlement:', error);
      toast({ title: "خطأ", description: "فشل في حفظ التسوية", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRefused = async (settlement: Settlement) => {
    try {
      const { error } = await supabase
        .from('broker_settlements')
        .update({ refused: !settlement.refused })
        .eq('id', settlement.id);

      if (error) throw error;
      
      toast({ 
        title: settlement.refused ? "تم استعادة التسوية" : "تم إلغاء التسوية",
        description: settlement.refused ? "التسوية فعّالة الآن" : "تم تحديد التسوية كمرفوضة"
      });
      
      fetchBrokerData();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث التسوية", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setDirection('broker_owes');
    setTotalAmount('');
    setSettlementDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setSelectedPolicies([]);
    setAllocations({});
    setPaymentType('cash');
    setChequeNumber('');
    setChequeImageUrl('');
    setBankReference('');
  };

  const netBalance = brokerOwesTotal - weOweTotal;

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 space-y-6" dir="rtl">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/brokers')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6" />
                محفظة الوسيط
              </h1>
              <p className="text-muted-foreground">{broker?.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowNewSettlement(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            معاملة جديدة
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
                <ArrowUpRight className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">دفعت للوسيط</p>
                <p className="text-2xl font-bold text-red-600">₪{weOweTotal.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                <ArrowDownLeft className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">استلمت من الوسيط</p>
                <p className="text-2xl font-bold text-green-600">₪{brokerOwesTotal.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          <Card className={cn(
            "p-6",
            netBalance >= 0 ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-3 rounded-xl",
                netBalance >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
              )}>
                <Wallet className={cn(
                  "h-6 w-6",
                  netBalance >= 0 ? 'text-green-600' : 'text-red-600'
                )} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {netBalance >= 0 ? 'لي عنده' : 'له عندي'}
                </p>
                <p className={cn(
                  "text-2xl font-bold",
                  netBalance >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  ₪{Math.abs(netBalance).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Settlements Table */}
        <Card>
          <div className="p-4 border-b">
            <h2 className="font-semibold">سجل المعاملات</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الاتجاه</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead className="w-20">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      لا توجد معاملات بعد
                    </TableCell>
                  </TableRow>
                ) : (
                  settlements.map((settlement) => (
                    <TableRow key={settlement.id} className={cn(settlement.refused && "opacity-50")}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(settlement.settlement_date).toLocaleDateString('ar-EG')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {settlement.direction === 'we_owe' ? (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            <ArrowUpRight className="h-3 w-3 ml-1" />
                            دفعت للوسيط
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            <ArrowDownLeft className="h-3 w-3 ml-1" />
                            استلمت من الوسيط
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PaymentTypeIcon type={settlement.payment_type || 'cash'} />
                          <span>{paymentTypeLabels[(settlement.payment_type || 'cash') as PaymentType]}</span>
                          {settlement.cheque_number && (
                            <Badge variant="secondary" className="text-xs">
                              #{settlement.cheque_number}
                            </Badge>
                          )}
                          {settlement.cheque_image_url && (
                            <a href={settlement.cheque_image_url} target="_blank" rel="noopener noreferrer">
                              <Image className="h-4 w-4 text-blue-500 cursor-pointer" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        ₪{settlement.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {settlement.refused ? (
                          <Badge className="bg-red-100 text-red-700">
                            <XCircle className="h-3 w-3 ml-1" />
                            مرفوض
                          </Badge>
                        ) : settlement.status === 'completed' ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            مكتمل
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700">
                            <Clock className="h-3 w-3 ml-1" />
                            معلق
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {settlement.notes || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleRefused(settlement)}
                          className={cn(
                            "text-xs",
                            settlement.refused ? "text-green-600 hover:text-green-700" : "text-red-600 hover:text-red-700"
                          )}
                        >
                          {settlement.refused ? "استعادة" : "رفض"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* New Settlement Dialog */}
        <Dialog open={showNewSettlement} onOpenChange={setShowNewSettlement}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                معاملة جديدة - {broker?.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Direction & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>الاتجاه</Label>
                  <Select value={direction} onValueChange={(v: 'we_owe' | 'broker_owes') => setDirection(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="broker_owes">استلمت من الوسيط</SelectItem>
                      <SelectItem value="we_owe">دفعت للوسيط</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المبلغ (₪)</Label>
                  <Input
                    type="number"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>تاريخ المعاملة</Label>
                  <ArabicDatePicker
                    value={settlementDate}
                    onChange={(date) => setSettlementDate(date)}
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-4">
                <Label>طريقة الدفع</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['cash', 'cheque', 'bank_transfer', 'visa'] as PaymentType[]).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={paymentType === type ? 'default' : 'outline'}
                      className={cn("gap-2", paymentType === type && "bg-primary")}
                      onClick={() => setPaymentType(type)}
                    >
                      <PaymentTypeIcon type={type} />
                      {paymentTypeLabels[type]}
                    </Button>
                  ))}
                </div>

                {/* Cheque Fields */}
                {paymentType === 'cheque' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                    <div>
                      <Label>رقم الشيك (8 أرقام)</Label>
                      <Input
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="12345678"
                        maxLength={8}
                        className={cn(
                          chequeNumber && !validateChequeNumber(chequeNumber) && "border-red-500"
                        )}
                      />
                    </div>
                    <div>
                      <Label>صورة الشيك</Label>
                      <FileUploader
                        entityType="cheque"
                        onUploadComplete={(files) => {
                          if (files.length > 0 && files[0].cdn_url) {
                            setChequeImageUrl(files[0].cdn_url);
                          }
                        }}
                        accept="image/*"
                        maxFiles={1}
                      />
                      {chequeImageUrl && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          تم رفع الصورة
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bank Transfer Fields */}
                {paymentType === 'bank_transfer' && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Label>رقم المرجع / الحوالة</Label>
                    <Input
                      value={bankReference}
                      onChange={(e) => setBankReference(e.target.value)}
                      placeholder="رقم التحويل البنكي"
                    />
                  </div>
                )}

                {/* Visa Note */}
                {paymentType === 'visa' && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                    سيتم تسجيل الدفع يدوياً. لاستخدام Tranzila، يرجى استخدام نظام الدفع في الوثائق.
                  </div>
                )}
              </div>

              {/* Policies Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>ربط بالوثائق (اختياري)</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleEqualSplit}
                      disabled={selectedPolicies.length === 0 || !totalAmount}
                    >
                      تقسيم متساوي
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleProportionalSplit}
                      disabled={selectedPolicies.length === 0 || !totalAmount}
                    >
                      تقسيم نسبي
                    </Button>
                  </div>
                </div>

                <Card className="max-h-60 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>العميل</TableHead>
                        <TableHead>السعر</TableHead>
                        <TableHead>المبلغ المخصص</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brokerPolicies.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedPolicies.includes(policy.id)}
                              onCheckedChange={(checked) => handlePolicySelect(policy.id, !!checked)}
                            />
                          </TableCell>
                          <TableCell>{policy.client?.full_name || '-'}</TableCell>
                          <TableCell>₪{policy.insurance_price?.toLocaleString()}</TableCell>
                          <TableCell>
                            {selectedPolicies.includes(policy.id) && (
                              <Input
                                type="number"
                                value={allocations[policy.id] || ''}
                                onChange={(e) => handleAllocationChange(policy.id, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-24 h-8"
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>

              {/* Notes */}
              <div>
                <Label>ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  className="resize-none"
                  rows={2}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowNewSettlement(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleSaveSettlement} disabled={saving}>
                  {saving ? 'جاري الحفظ...' : 'حفظ المعاملة'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
