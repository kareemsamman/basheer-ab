import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, X } from "lucide-react";
import { calculatePolicyProfit } from "@/lib/pricingCalculator";
import type { Enums } from "@/integrations/supabase/types";

interface PolicyEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: {
    id: string;
    policy_type_parent: string;
    policy_type_child: string | null;
    start_date: string;
    end_date: string;
    insurance_price: number;
    cancelled: boolean | null;
    transferred: boolean | null;
    transferred_car_number: string | null;
    is_under_24: boolean | null;
    notes: string | null;
    broker_id: string | null;
    clients: {
      id: string;
      full_name: string;
      less_than_24: boolean | null;
    };
    cars: {
      id: string;
      car_number: string;
      car_type: string | null;
      car_value: number | null;
      year: number | null;
    } | null;
    insurance_companies: {
      id: string;
      name: string;
      name_ar: string | null;
    } | null;
  };
  onSaved?: () => void;
}

interface Company {
  id: string;
  name: string;
  name_ar: string | null;
  category_parent: string | null;
}

interface Broker {
  id: string;
  name: string;
}

const NO_BROKER = "__NO_BROKER__";

const POLICY_TYPES = [
  { value: "ELZAMI", label: "إلزامي" },
  { value: "THIRD_FULL", label: "ثالث/شامل", hasChild: true },
  { value: "ROAD_SERVICE", label: "خدمات الطريق" },
  { value: "ACCIDENT_FEE_EXEMPTION", label: "إعفاء رسوم حادث" },
];

export function PolicyEditDrawer({ open, onOpenChange, policy, onSaved }: PolicyEditDrawerProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [brokers, setBrokers] = useState<Broker[]>([]);

  const [formData, setFormData] = useState({
    policy_type_parent: policy.policy_type_parent,
    policy_type_child: policy.policy_type_child || "",
    company_id: policy.insurance_companies?.id || "",
    start_date: policy.start_date,
    end_date: policy.end_date,
    insurance_price: policy.insurance_price?.toString() || "0",
    cancelled: policy.cancelled || false,
    transferred: policy.transferred || false,
    transferred_car_number: policy.transferred_car_number || "",
    is_under_24: policy.is_under_24 || false,
    notes: policy.notes || "",
    broker_id: policy.broker_id ?? NO_BROKER,
  });

  useEffect(() => {
    if (open) {
      fetchCompanies(policy.policy_type_parent);
      fetchBrokers();
      setFormData({
        policy_type_parent: policy.policy_type_parent,
        policy_type_child: policy.policy_type_child || "",
        company_id: policy.insurance_companies?.id || "",
        start_date: policy.start_date,
        end_date: policy.end_date,
        insurance_price: policy.insurance_price?.toString() || "0",
        cancelled: policy.cancelled || false,
        transferred: policy.transferred || false,
        transferred_car_number: policy.transferred_car_number || "",
        is_under_24: policy.is_under_24 || false,
        notes: policy.notes || "",
        broker_id: policy.broker_id ?? NO_BROKER,
      });
    }
  }, [open, policy]);

  const fetchCompanies = async (policyType?: string) => {
    setLoadingCompanies(true);
    let query = supabase
      .from('insurance_companies')
      .select('id, name, name_ar, category_parent')
      .eq('active', true)
      .order('name');
    
    if (policyType) {
      query = query.eq('category_parent', policyType as any);
    }
    
    const { data } = await query;
    setLoadingCompanies(false);
    if (data) setCompanies(data);
  };

  const fetchBrokers = async () => {
    const { data } = await supabase
      .from('brokers')
      .select('id, name')
      .order('name');
    if (data) setBrokers(data);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const insurancePrice = parseFloat(formData.insurance_price) || 0;
      
      let companyPayment = insurancePrice;
      let profit = 0;

      if (formData.policy_type_parent !== 'ELZAMI') {
        const ageBand: Enums<'age_band'> = (formData.is_under_24 || policy.clients?.less_than_24) ? 'UNDER_24' : 'UP_24';
        const result = await calculatePolicyProfit({
          policyTypeParent: formData.policy_type_parent as Enums<'policy_type_parent'>,
          policyTypeChild: (formData.policy_type_child || null) as Enums<'policy_type_child'> | null,
          companyId: formData.company_id,
          carType: (policy.cars?.car_type || 'car') as Enums<'car_type'>,
          ageBand,
          carValue: policy.cars?.car_value || null,
          carYear: policy.cars?.year || null,
          insurancePrice,
        });
        companyPayment = result.companyPayment;
        profit = result.profit;
      }

      const { error } = await supabase
        .from('policies')
        .update({
          policy_type_parent: formData.policy_type_parent as Enums<'policy_type_parent'>,
          policy_type_child: formData.policy_type_child ? formData.policy_type_child as Enums<'policy_type_child'> : null,
          company_id: formData.company_id || null,
          start_date: formData.start_date,
          end_date: formData.end_date,
          insurance_price: insurancePrice,
          payed_for_company: companyPayment,
          profit,
          cancelled: formData.cancelled,
          transferred: formData.transferred,
          transferred_car_number: formData.transferred ? formData.transferred_car_number : null,
          is_under_24: formData.is_under_24,
          notes: formData.notes || null,
          broker_id: formData.broker_id === NO_BROKER ? null : formData.broker_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', policy.id);

      if (error) throw error;

      toast({ title: "تم الحفظ", description: "تم تحديث الوثيقة بنجاح" });
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error('Error saving policy:', error);
      toast({ title: "خطأ", description: "فشل في حفظ التغييرات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedType = POLICY_TYPES.find(t => t.value === formData.policy_type_parent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-lg p-0 overflow-hidden"
        dir="rtl"
      >
        <DialogHeader className="p-4 border-b bg-muted/30 text-right">
          <DialogTitle className="text-lg font-bold text-right">تعديل الوثيقة</DialogTitle>
          <p className="text-sm text-muted-foreground text-right">
            {policy.clients?.full_name || ''} - {policy.cars?.car_number || ''}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-4">
            {/* Policy Type Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-right block text-sm">نوع الوثيقة</Label>
                <Select
                  value={formData.policy_type_parent}
                  onValueChange={(v) => {
                    setFormData(f => ({ 
                      ...f, 
                      policy_type_parent: v,
                      policy_type_child: POLICY_TYPES.find(t => t.value === v)?.hasChild ? f.policy_type_child : "",
                      company_id: ""
                    }));
                    fetchCompanies(v);
                  }}
                >
                  <SelectTrigger className="h-9 text-right">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value} className="text-right">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType?.hasChild && (
                <div className="space-y-1.5">
                  <Label className="text-right block text-sm">النوع الفرعي</Label>
                  <Select
                    value={formData.policy_type_child}
                    onValueChange={(v) => setFormData(f => ({ ...f, policy_type_child: v }))}
                  >
                    <SelectTrigger className="h-9 text-right">
                      <SelectValue placeholder="اختر" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="THIRD" className="text-right">طرف ثالث</SelectItem>
                      <SelectItem value="FULL" className="text-right">شامل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Company & Broker Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-right block text-sm">شركة التأمين</Label>
                <Select
                  value={formData.company_id}
                  onValueChange={(v) => setFormData(f => ({ ...f, company_id: v }))}
                  disabled={!formData.policy_type_parent}
                >
                  <SelectTrigger className={`h-9 text-right ${!formData.policy_type_parent ? "opacity-50" : ""}`}>
                    <SelectValue placeholder={formData.policy_type_parent ? "اختر" : "اختر النوع أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingCompanies ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">جاري التحميل...</div>
                    ) : companies.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">لا توجد شركات</div>
                    ) : (
                      companies.map(company => (
                        <SelectItem key={company.id} value={company.id} className="text-right">
                          {company.name_ar || company.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-right block text-sm">الوسيط</Label>
                <Select
                  value={formData.broker_id}
                  onValueChange={(v) => setFormData(f => ({ ...f, broker_id: v }))}
                >
                  <SelectTrigger className="h-9 text-right">
                    <SelectValue placeholder="اختياري" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_BROKER} className="text-right">بدون وسيط</SelectItem>
                    {brokers.map(broker => (
                      <SelectItem key={broker.id} value={broker.id} className="text-right">
                        {broker.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-right block text-sm">تاريخ البدء</Label>
                <ArabicDatePicker
                  value={formData.start_date}
                  onChange={(v) => setFormData(f => ({ ...f, start_date: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-right block text-sm">تاريخ الانتهاء</Label>
                <ArabicDatePicker
                  value={formData.end_date}
                  onChange={(v) => setFormData(f => ({ ...f, end_date: v }))}
                />
              </div>
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <Label className="text-right block text-sm">سعر التأمين (₪)</Label>
              <Input
                type="number"
                value={formData.insurance_price}
                onChange={(e) => setFormData(f => ({ ...f, insurance_price: e.target.value }))}
                dir="ltr"
                className="h-9 text-left"
              />
            </div>

            {/* Status Checkboxes - Compact */}
            <div className="flex flex-wrap gap-4 py-2 px-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_under_24"
                  checked={formData.is_under_24}
                  onCheckedChange={(c) => setFormData(f => ({ ...f, is_under_24: !!c }))}
                />
                <Label htmlFor="is_under_24" className="cursor-pointer text-sm">أقل من 24</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cancelled"
                  checked={formData.cancelled}
                  onCheckedChange={(c) => setFormData(f => ({ ...f, cancelled: !!c }))}
                />
                <Label htmlFor="cancelled" className="cursor-pointer text-sm">ملغاة</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="transferred"
                  checked={formData.transferred}
                  onCheckedChange={(c) => setFormData(f => ({ ...f, transferred: !!c }))}
                />
                <Label htmlFor="transferred" className="cursor-pointer text-sm">محوّلة</Label>
              </div>
            </div>

            {formData.transferred && (
              <div className="space-y-1.5">
                <Label className="text-right block text-sm">رقم السيارة السابقة</Label>
                <Input
                  value={formData.transferred_car_number}
                  onChange={(e) => setFormData(f => ({ ...f, transferred_car_number: e.target.value }))}
                  dir="ltr"
                  placeholder="رقم السيارة"
                  className="h-9"
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-right block text-sm">ملاحظات</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="text-right"
              />
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t bg-muted/30 flex gap-2">
          <Button variant="outline" className="flex-1 h-9" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 ml-1" />
            إلغاء
          </Button>
          <Button className="flex-1 h-9" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 ml-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 ml-1" />
            )}
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
