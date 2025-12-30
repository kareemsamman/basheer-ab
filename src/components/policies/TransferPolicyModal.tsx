import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  ArrowLeftRight, 
  Plus, 
  Car, 
  Send,
  AlertTriangle,
} from "lucide-react";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";

interface TransferPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  policyNumber: string | null;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  branchId: string | null;
  currentCar: {
    id: string;
    car_number: string;
    model: string | null;
    year: number | null;
    manufacturer_name: string | null;
  } | null;
  onTransferred: () => void;
}

interface CarOption {
  id: string;
  car_number: string;
  model: string | null;
  year: number | null;
  manufacturer_name: string | null;
}

type AdjustmentType = "none" | "customer_pays" | "refund";

export function TransferPolicyModal({
  open,
  onOpenChange,
  policyId,
  policyNumber,
  clientId,
  clientName,
  clientPhone,
  branchId,
  currentCar,
  onTransferred,
}: TransferPolicyModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [saving, setSaving] = useState(false);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [loadingCars, setLoadingCars] = useState(false);
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const [showNewCarForm, setShowNewCarForm] = useState(false);
  
  // Transfer details
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  
  // Money adjustment
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("none");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  
  // SMS
  const [sendSms, setSendSms] = useState(true);
  const [smsMessage, setSmsMessage] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  
  // New car form
  const [newCarNumber, setNewCarNumber] = useState("");
  const [newCarModel, setNewCarModel] = useState("");
  const [newCarYear, setNewCarYear] = useState("");
  const [newCarManufacturer, setNewCarManufacturer] = useState("");
  const [savingNewCar, setSavingNewCar] = useState(false);

  // Fetch client's cars
  useEffect(() => {
    if (open && clientId) {
      fetchCars();
      loadSmsTemplate();
    }
  }, [open, clientId]);

  const fetchCars = async () => {
    setLoadingCars(true);
    try {
      const { data, error } = await supabase
        .from("cars")
        .select("id, car_number, model, year, manufacturer_name")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Filter out current car
      const filtered = (data || []).filter(c => c.id !== currentCar?.id);
      setCars(filtered);
    } catch (error) {
      console.error("Error fetching cars:", error);
    } finally {
      setLoadingCars(false);
    }
  };

  const loadSmsTemplate = async () => {
    setLoadingTemplate(true);
    try {
      const { data: settings } = await supabase
        .from("sms_settings")
        .select("*")
        .single();

      // Use a generic transfer template
      let template = `مرحباً ${clientName}، تم تحويل وثيقة التأمين رقم ${policyNumber || "غير محدد"} إلى مركبة جديدة. للاستفسار يرجى التواصل معنا.`;
      setSmsMessage(template);
    } catch (error) {
      console.error("Error loading SMS template:", error);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleAddNewCar = async () => {
    if (!newCarNumber || !newCarModel || !newCarYear) {
      toast({ title: "خطأ", description: "رقم السيارة والموديل والسنة مطلوبة", variant: "destructive" });
      return;
    }

    if (newCarNumber.length > 8) {
      toast({ title: "خطأ", description: "رقم السيارة يجب أن لا يتجاوز 8 أرقام", variant: "destructive" });
      return;
    }

    setSavingNewCar(true);
    try {
      const { data, error } = await supabase
        .from("cars")
        .insert({
          client_id: clientId,
          car_number: newCarNumber,
          model: newCarModel,
          year: parseInt(newCarYear),
          manufacturer_name: newCarManufacturer || null,
          branch_id: branchId,
          created_by_admin_id: user?.id,
        })
        .select("id, car_number, model, year, manufacturer_name")
        .single();

      if (error) throw error;

      // Add to cars list and select it
      setCars(prev => [data, ...prev]);
      setSelectedCarId(data.id);
      setShowNewCarForm(false);
      
      // Reset form
      setNewCarNumber("");
      setNewCarModel("");
      setNewCarYear("");
      setNewCarManufacturer("");

      toast({ title: "تم", description: "تم إضافة السيارة بنجاح" });
    } catch (error: any) {
      console.error("Error adding car:", error);
      toast({ title: "خطأ", description: error.message || "فشل في إضافة السيارة", variant: "destructive" });
    } finally {
      setSavingNewCar(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedCarId) {
      toast({ title: "خطأ", description: "يرجى اختيار السيارة المراد التحويل إليها", variant: "destructive" });
      return;
    }

    if (!transferDate) {
      toast({ title: "خطأ", description: "تاريخ التحويل مطلوب", variant: "destructive" });
      return;
    }

    if (adjustmentType !== "none" && (!adjustmentAmount || parseFloat(adjustmentAmount) <= 0)) {
      toast({ title: "خطأ", description: "مبلغ التعديل المالي مطلوب", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const selectedCar = cars.find(c => c.id === selectedCarId);
      
      // 1. Create policy transfer audit record
      const { error: transferError } = await supabase
        .from("policy_transfers")
        .insert({
          policy_id: policyId,
          client_id: clientId,
          from_car_id: currentCar?.id,
          to_car_id: selectedCarId,
          transfer_date: transferDate,
          note: note || null,
          adjustment_type: adjustmentType,
          adjustment_amount: adjustmentType !== "none" ? parseFloat(adjustmentAmount) : null,
          created_by_admin_id: user?.id,
          branch_id: branchId,
        });

      if (transferError) throw transferError;

      // 2. Update OLD policy: set end_date to transfer date and mark as transferred
      // The OLD policy stays attached to the OLD car, just ends at transfer date
      const { error: oldPolicyError } = await supabase
        .from("policies")
        .update({
          end_date: transferDate,
          transferred: true,
          transferred_car_number: currentCar?.car_number || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", policyId);

      if (oldPolicyError) throw oldPolicyError;

      // 3. Create wallet transaction if money adjustment exists
      if (adjustmentType !== "none" && adjustmentAmount) {
        const transactionType = adjustmentType === "customer_pays" 
          ? "transfer_adjustment_due" 
          : "transfer_refund_owed";
        
        const { error: walletError } = await supabase
          .from("customer_wallet_transactions")
          .insert({
            client_id: clientId,
            policy_id: policyId,
            transaction_type: transactionType,
            amount: parseFloat(adjustmentAmount),
            description: adjustmentType === "customer_pays" 
              ? `فرق تحويل وثيقة ${policyNumber || ""} - مستحق علينا`
              : `مرتجع تحويل وثيقة ${policyNumber || ""} - مستحق للعميل`,
            notes: adjustmentNote || null,
            created_by_admin_id: user?.id,
            branch_id: branchId,
          });

        if (walletError) throw walletError;
      }

      // 4. Send SMS if enabled
      if (sendSms && clientPhone && smsMessage) {
        try {
          const { error: smsError } = await supabase.functions.invoke("send-sms", {
            body: {
              phone: clientPhone,
              message: smsMessage,
              client_id: clientId,
              policy_id: policyId,
              sms_type: "manual",
              branch_id: branchId,
            },
          });

          if (smsError) {
            console.error("SMS send error:", smsError);
            toast({ 
              title: "تحذير", 
              description: "تم تحويل الوثيقة لكن فشل إرسال الرسالة"
            });
          } else {
            toast({ title: "تم", description: "تم إرسال رسالة التحويل للعميل" });
          }
        } catch (smsErr) {
          console.error("SMS error:", smsErr);
        }
      }

      toast({ 
        title: "تم", 
        description: "تم تحويل الوثيقة - الوثيقة القديمة انتهت بتاريخ التحويل والسيارة الجديدة تحتاج وثيقة جديدة" 
      });
      onTransferred();
      onOpenChange(false);
      
      // Reset form
      resetForm();
    } catch (error: any) {
      console.error("Error transferring policy:", error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في تحويل الوثيقة", 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedCarId("");
    setTransferDate(new Date().toISOString().split("T")[0]);
    setNote("");
    setAdjustmentType("none");
    setAdjustmentAmount("");
    setAdjustmentNote("");
    setSendSms(true);
    setSmsMessage("");
    setShowNewCarForm(false);
  };

  const formatCarLabel = (car: CarOption) => {
    const parts = [car.car_number];
    if (car.manufacturer_name) parts.push(car.manufacturer_name);
    if (car.model) parts.push(car.model);
    if (car.year) parts.push(car.year.toString());
    return parts.join(" - ");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ArrowLeftRight className="h-5 w-5" />
            تحويل الوثيقة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Car - Read Only */}
          <Card className="p-3 bg-muted/30">
            <Label className="text-xs text-muted-foreground">السيارة الحالية</Label>
            <p className="font-medium flex items-center gap-2 mt-1">
              <Car className="h-4 w-4 text-muted-foreground" />
              {currentCar ? formatCarLabel(currentCar) : "غير محدد"}
            </p>
          </Card>

          {/* Target Car Selection */}
          <div className="space-y-2">
            <Label>تحويل إلى *</Label>
            {loadingCars ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Select value={selectedCarId} onValueChange={setSelectedCarId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر السيارة" />
                  </SelectTrigger>
                  <SelectContent>
                    {cars.map((car) => (
                      <SelectItem key={car.id} value={car.id}>
                        {formatCarLabel(car)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Add New Car Button */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={() => setShowNewCarForm(!showNewCarForm)}
                >
                  <Plus className="h-4 w-4 ml-1" />
                  {showNewCarForm ? "إلغاء الإضافة" : "إضافة سيارة جديدة"}
                </Button>

                {/* New Car Form */}
                {showNewCarForm && (
                  <Card className="p-3 space-y-3 mt-2 border-primary/30 bg-primary/5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">رقم السيارة *</Label>
                        <Input
                          value={newCarNumber}
                          onChange={(e) => setNewCarNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                          placeholder="12345678"
                          maxLength={8}
                          inputMode="numeric"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">سنة الصنع *</Label>
                        <Input
                          type="number"
                          value={newCarYear}
                          onChange={(e) => setNewCarYear(e.target.value)}
                          placeholder="2024"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">الشركة المصنعة</Label>
                        <Input
                          value={newCarManufacturer}
                          onChange={(e) => setNewCarManufacturer(e.target.value)}
                          placeholder="تويوتا"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الموديل *</Label>
                        <Input
                          value={newCarModel}
                          onChange={(e) => setNewCarModel(e.target.value)}
                          placeholder="كورولا"
                        />
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={handleAddNewCar}
                      disabled={savingNewCar}
                      className="w-full"
                    >
                      {savingNewCar ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-1" />
                      ) : (
                        <Plus className="h-4 w-4 ml-1" />
                      )}
                      حفظ وتحديد
                    </Button>
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Transfer Date */}
          <div className="space-y-2">
            <Label>تاريخ التحويل *</Label>
            <ArabicDatePicker
              value={transferDate}
              onChange={(date) => setTransferDate(date)}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label>ملاحظات / سبب التحويل</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="اكتب ملاحظات التحويل هنا..."
              rows={2}
            />
          </div>

          {/* Money Adjustment */}
          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <Label className="font-medium">تعديل مالي (فرق)</Label>
            <RadioGroup 
              value={adjustmentType} 
              onValueChange={(v) => setAdjustmentType(v as AdjustmentType)}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="none" id="adj-none" />
                <Label htmlFor="adj-none" className="cursor-pointer">لا يوجد تعديل</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="customer_pays" id="adj-customer-pays" />
                <Label htmlFor="adj-customer-pays" className="cursor-pointer">العميل يدفع لنا (مستحق علينا)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="refund" id="adj-refund" />
                <Label htmlFor="adj-refund" className="cursor-pointer">نحن ندفع للعميل (مرتجع)</Label>
              </div>
            </RadioGroup>

            {adjustmentType !== "none" && (
              <div className="space-y-3 pt-2 border-t">
                <div className="space-y-2">
                  <Label>المبلغ (₪) *</Label>
                  <Input
                    type="number"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>ملاحظة للتعديل المالي</Label>
                  <Input
                    value={adjustmentNote}
                    onChange={(e) => setAdjustmentNote(e.target.value)}
                    placeholder="سبب الفرق..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* SMS Section */}
          {clientPhone && (
            <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label htmlFor="sendSms" className="font-medium flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  إرسال رسالة SMS للعميل
                </Label>
                <Switch
                  id="sendSms"
                  checked={sendSms}
                  onCheckedChange={setSendSms}
                />
              </div>

              {sendSms && (
                <div className="space-y-2">
                  <Label>نص الرسالة</Label>
                  {loadingTemplate ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Textarea
                      value={smsMessage}
                      onChange={(e) => setSmsMessage(e.target.value)}
                      rows={3}
                      dir="rtl"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    سيتم الإرسال إلى: {clientPhone}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Warning */}
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-700 rounded-lg text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>سيتم تحديث السيارة في الوثيقة وتسجيل التحويل</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button 
            onClick={handleTransfer} 
            disabled={saving || !selectedCarId}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                جاري التحويل...
              </>
            ) : (
              <>
                <ArrowLeftRight className="h-4 w-4 ml-2" />
                تأكيد التحويل
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
