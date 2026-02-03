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
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, X, Shield, Car, Truck, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculatePolicyProfit } from "@/lib/pricingCalculator";
import type { Enums } from "@/integrations/supabase/types";

interface PackagePolicyEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: {
    id: string;
    policy_type_parent: string;
    policy_type_child: string | null;
    start_date: string;
    end_date: string;
    insurance_price: number;
    is_under_24?: boolean | null;
    insurance_companies?: {
      id: string;
      name: string;
      name_ar: string | null;
    } | null;
    road_services?: {
      id: string;
      name: string;
      name_ar: string | null;
    } | null;
    accident_fee_services?: {
      id: string;
      name: string;
      name_ar: string | null;
    } | null;
    cars?: {
      car_type: string | null;
      car_value: number | null;
      year: number | null;
    } | null;
  } | null;
  onSaved?: () => void;
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

const policyTypeConfig: Record<string, { icon: React.ElementType; bg: string; text: string }> = {
  ELZAMI: { icon: Shield, bg: "bg-teal-50", text: "text-teal-700" },
  THIRD_FULL: { icon: Car, bg: "bg-cyan-50", text: "text-cyan-700" },
  ROAD_SERVICE: { icon: Truck, bg: "bg-emerald-50", text: "text-emerald-700" },
  ACCIDENT_FEE_EXEMPTION: { icon: FileCheck, bg: "bg-emerald-50", text: "text-emerald-700" },
};

export function PackagePolicyEditModal({
  open,
  onOpenChange,
  policy,
  onSaved,
}: PackagePolicyEditModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [insurancePrice, setInsurancePrice] = useState("");

  // Reset form when policy changes
  useEffect(() => {
    if (policy && open) {
      setStartDate(policy.start_date || "");
      setEndDate(policy.end_date || "");
      setInsurancePrice(policy.insurance_price?.toString() || "0");
    }
  }, [policy, open]);

  const getTypeName = () => {
    if (!policy) return "";
    if (policy.policy_type_parent === "THIRD_FULL" && policy.policy_type_child) {
      return policyChildLabels[policy.policy_type_child] || policy.policy_type_child;
    }
    return policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent;
  };

  const getCompanyName = () => {
    if (!policy) return "-";
    if (policy.policy_type_parent === "ROAD_SERVICE" && policy.road_services) {
      return policy.road_services.name_ar || policy.road_services.name;
    }
    if (policy.policy_type_parent === "ACCIDENT_FEE_EXEMPTION" && policy.accident_fee_services) {
      return policy.accident_fee_services.name_ar || policy.accident_fee_services.name;
    }
    if (policy.insurance_companies) {
      return policy.insurance_companies.name_ar || policy.insurance_companies.name;
    }
    return "-";
  };

  const handleSave = async () => {
    if (!policy) return;

    setSaving(true);
    try {
      const price = parseFloat(insurancePrice) || 0;
      let companyPayment = price;
      let profit = 0;

      // Recalculate profit based on policy type
      if (policy.policy_type_parent === "ELZAMI") {
        // For ELZAMI: Get commission from company
        const { data: companyData } = await supabase
          .from("insurance_companies")
          .select("elzami_commission")
          .eq("id", policy.insurance_companies?.id || "")
          .single();
        profit = companyData?.elzami_commission || 0;
        companyPayment = price;
      } else if (["ROAD_SERVICE", "ACCIDENT_FEE_EXEMPTION"].includes(policy.policy_type_parent)) {
        // For services: Get company cost from pricing tables
        if (policy.policy_type_parent === "ROAD_SERVICE" && policy.road_services?.id) {
          const { data: priceData } = await supabase
            .from("company_road_service_prices")
            .select("company_cost")
            .eq("road_service_id", policy.road_services.id)
            .limit(1)
            .single();
          companyPayment = priceData?.company_cost || price;
        } else if (policy.policy_type_parent === "ACCIDENT_FEE_EXEMPTION" && policy.accident_fee_services?.id) {
          const { data: priceData } = await supabase
            .from("company_accident_fee_prices")
            .select("company_cost")
            .eq("accident_fee_service_id", policy.accident_fee_services.id)
            .limit(1)
            .single();
          companyPayment = priceData?.company_cost || price;
        }
        profit = price - companyPayment;
      } else if (policy.policy_type_parent === "THIRD_FULL" && policy.insurance_companies?.id) {
        // For THIRD/FULL: Use pricing calculator
        const ageBand: Enums<"age_band"> = policy.is_under_24 ? "UNDER_24" : "UP_24";
        const result = await calculatePolicyProfit({
          policyTypeParent: policy.policy_type_parent as Enums<"policy_type_parent">,
          policyTypeChild: (policy.policy_type_child || null) as Enums<"policy_type_child"> | null,
          companyId: policy.insurance_companies.id,
          carType: (policy.cars?.car_type || "car") as Enums<"car_type">,
          ageBand,
          carValue: policy.cars?.car_value || null,
          carYear: policy.cars?.year || null,
          insurancePrice: price,
        });
        companyPayment = result.companyPayment;
        profit = result.profit;
      }

      // Update the policy
      const { error } = await supabase
        .from("policies")
        .update({
          start_date: startDate,
          end_date: endDate,
          insurance_price: price,
          payed_for_company: companyPayment,
          profit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", policy.id);

      if (error) throw error;

      toast({ title: "تم الحفظ", description: "تم تحديث الوثيقة بنجاح" });
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error("Error saving policy:", error);
      toast({
        title: "خطأ",
        description: "فشل في حفظ التغييرات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!policy) return null;

  const config = policyTypeConfig[policy.policy_type_parent] || policyTypeConfig.ELZAMI;
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bg)}>
              <Icon className={cn("h-4 w-4", config.text)} />
            </div>
            تعديل الوثيقة - {getTypeName()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">نوع التأمين</Label>
              <div className="h-9 px-3 py-2 rounded-md bg-muted text-sm font-medium">
                {getTypeName()}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">الشركة</Label>
              <div className="h-9 px-3 py-2 rounded-md bg-muted text-sm font-medium">
                {getCompanyName()}
              </div>
            </div>
          </div>

          {/* Editable dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">تاريخ البدء</Label>
              <ArabicDatePicker
                value={startDate}
                onChange={(v) => setStartDate(v)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">تاريخ الانتهاء</Label>
              <ArabicDatePicker
                value={endDate}
                onChange={(v) => setEndDate(v)}
              />
            </div>
          </div>

          {/* Editable price */}
          <div className="space-y-1.5">
            <Label className="text-sm">سعر التأمين (₪)</Label>
            <Input
              type="number"
              value={insurancePrice}
              onChange={(e) => setInsurancePrice(e.target.value)}
              className="h-9 text-left ltr-nums"
              min="0"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            <X className="h-4 w-4 ml-1" />
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 ml-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 ml-1" />
            )}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
