import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Route, Shield, FileCheck, Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { PackageAddon, Company, RoadService, AccidentFeeService } from "./types";

// Company X ID - default for road service and accident fee
const COMPANY_X_ID = "0014273c-78fc-4945-920c-6c8ce653f64a";

interface PackageBuilderSectionProps {
  addons: PackageAddon[];
  onAddonsChange: (addons: PackageAddon[]) => void;
  mainPolicyType: string;
  roadServices: RoadService[];
  accidentFeeServices: AccidentFeeService[];
  roadServiceCompanies: Company[];
  accidentFeeCompanies: Company[];
  elzamiCompanies: Company[];
  carType?: string;
  disabled?: boolean;
  errors?: Record<string, string>;
  ageBand?: 'UNDER_24' | 'UP_24' | 'ANY';
}

export function PackageBuilderSection({
  addons,
  onAddonsChange,
  mainPolicyType,
  roadServices,
  accidentFeeServices,
  roadServiceCompanies,
  accidentFeeCompanies,
  elzamiCompanies,
  carType,
  disabled,
  errors = {},
  ageBand = 'ANY',
}: PackageBuilderSectionProps) {
  const [loadingRoadPrice, setLoadingRoadPrice] = useState(false);
  const [loadingAccidentPrice, setLoadingAccidentPrice] = useState(false);
  const [loadingElzamiCommission, setLoadingElzamiCommission] = useState(false);

  // Find addons by type
  const elzamiAddon = addons.find(a => a.type === 'elzami') || addons[0];
  const roadServiceAddon = addons.find(a => a.type === 'road_service') || addons[1];
  const accidentFeeAddon = addons.find(a => a.type === 'accident_fee_exemption') || addons[2];

  const updateAddon = (type: 'elzami' | 'road_service' | 'accident_fee_exemption', updates: Partial<PackageAddon>) => {
    const newAddons = addons.map(addon => 
      addon.type === type ? { ...addon, ...updates } : addon
    );
    onAddonsChange(newAddons);
  };

  // Filter road services by car type
  const filteredRoadServices = carType
    ? roadServices.filter(rs => rs.allowed_car_types?.includes(carType))
    : roadServices;

  // Determine which addons can be shown based on main policy type
  const showElzamiAddon = mainPolicyType === 'THIRD_FULL';
  const showRoadServiceAddon = true;
  const showAccidentFeeAddon = true;

  // Auto-fetch ELZAMI commission when company is selected
  useEffect(() => {
    if (!elzamiAddon.enabled || !elzamiAddon.company_id) return;

    const fetchElzamiCommission = async () => {
      setLoadingElzamiCommission(true);
      try {
        const { data } = await supabase
          .from('insurance_companies')
          .select('elzami_commission')
          .eq('id', elzamiAddon.company_id)
          .single();

        if (data?.elzami_commission) {
          updateAddon('elzami', { 
            elzami_commission: data.elzami_commission,
            insurance_price: data.elzami_commission.toString()
          });
        }
      } catch (error) {
        console.error('Error fetching ELZAMI commission:', error);
      } finally {
        setLoadingElzamiCommission(false);
      }
    };

    fetchElzamiCommission();
  }, [elzamiAddon.enabled, elzamiAddon.company_id]);

  // Auto-fetch road service price
  useEffect(() => {
    const fetchRoadServicePrice = async () => {
      if (!roadServiceAddon.enabled || !roadServiceAddon.company_id || !roadServiceAddon.road_service_id) {
        return;
      }

      setLoadingRoadPrice(true);
      try {
        let query = supabase
          .from('company_road_service_prices')
          .select('selling_price, company_cost')
          .eq('company_id', roadServiceAddon.company_id)
          .eq('road_service_id', roadServiceAddon.road_service_id);

        // Try specific age band first, then fallback to ANY
        const { data: specificData } = await query.eq('age_band', ageBand).limit(1);
        
        if (specificData && specificData.length > 0) {
          updateAddon('road_service', { insurance_price: specificData[0].selling_price.toString() });
        } else {
          const { data: anyData } = await supabase
            .from('company_road_service_prices')
            .select('selling_price, company_cost')
            .eq('company_id', roadServiceAddon.company_id)
            .eq('road_service_id', roadServiceAddon.road_service_id)
            .eq('age_band', 'ANY')
            .limit(1);

          if (anyData && anyData.length > 0) {
            updateAddon('road_service', { insurance_price: anyData[0].selling_price.toString() });
          }
        }
      } catch (error) {
        console.error('Error fetching road service price:', error);
      } finally {
        setLoadingRoadPrice(false);
      }
    };

    fetchRoadServicePrice();
  }, [roadServiceAddon.enabled, roadServiceAddon.company_id, roadServiceAddon.road_service_id, ageBand]);

  // Auto-fetch accident fee price
  useEffect(() => {
    const fetchAccidentFeePrice = async () => {
      if (!accidentFeeAddon.enabled || !accidentFeeAddon.company_id || !accidentFeeAddon.accident_fee_service_id) {
        return;
      }

      setLoadingAccidentPrice(true);
      try {
        const { data } = await supabase
          .from('company_accident_fee_prices')
          .select('selling_price, company_cost')
          .eq('company_id', accidentFeeAddon.company_id)
          .eq('accident_fee_service_id', accidentFeeAddon.accident_fee_service_id)
          .limit(1);

        if (data && data.length > 0) {
          updateAddon('accident_fee_exemption', { insurance_price: data[0].selling_price.toString() });
        }
      } catch (error) {
        console.error('Error fetching accident fee price:', error);
      } finally {
        setLoadingAccidentPrice(false);
      }
    };

    fetchAccidentFeePrice();
  }, [accidentFeeAddon.enabled, accidentFeeAddon.company_id, accidentFeeAddon.accident_fee_service_id]);

  // Auto-select Company X as default
  useEffect(() => {
    const defaultCompany = roadServiceCompanies.find(c => c.id === COMPANY_X_ID) 
      || roadServiceCompanies.find(c => c.name === 'شركة اكس' || c.name_ar === 'شركة اكس')
      || (roadServiceCompanies.length > 0 ? roadServiceCompanies[0] : null);

    if (defaultCompany && roadServiceAddon.enabled && !roadServiceAddon.company_id) {
      updateAddon('road_service', { company_id: defaultCompany.id });
    }
  }, [roadServiceCompanies, roadServiceAddon.enabled]);

  useEffect(() => {
    const defaultCompany = accidentFeeCompanies.find(c => c.id === COMPANY_X_ID)
      || accidentFeeCompanies.find(c => c.name === 'شركة اكس' || c.name_ar === 'شركة اكس')
      || (accidentFeeCompanies.length > 0 ? accidentFeeCompanies[0] : null);

    if (defaultCompany && accidentFeeAddon.enabled && !accidentFeeAddon.company_id) {
      updateAddon('accident_fee_exemption', { company_id: defaultCompany.id });
    }
  }, [accidentFeeCompanies, accidentFeeAddon.enabled]);

  // Addon Card Component
  const AddonCard = ({ 
    type, 
    title, 
    icon: Icon, 
    iconColor, 
    bgColor, 
    borderColor,
    addon,
    children 
  }: {
    type: 'elzami' | 'road_service' | 'accident_fee_exemption';
    title: string;
    icon: typeof FileCheck;
    iconColor: string;
    bgColor: string;
    borderColor: string;
    addon: PackageAddon;
    children: React.ReactNode;
  }) => {
    const isElzami = type === 'elzami';
    
    return (
      <Card 
        className={cn(
          "relative p-4 cursor-pointer transition-all duration-200 border-2",
          addon.enabled 
            ? `${bgColor} ${borderColor} shadow-sm` 
            : "bg-muted/30 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
        )}
        onClick={() => !disabled && updateAddon(type, { enabled: !addon.enabled })}
      >
        {/* Selection Indicator */}
        <div className={cn(
          "absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center transition-all",
          addon.enabled 
            ? `${isElzami ? 'bg-red-500' : 'bg-primary'} text-white` 
            : "bg-muted border-2 border-muted-foreground/30"
        )}>
          {addon.enabled && <Check className="h-3 w-3" />}
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Icon className={cn("h-5 w-5", iconColor)} />
          <span className="font-semibold text-sm">{title}</span>
          {isElzami && addon.enabled && (
            <span className="text-xs text-red-500 font-medium">(تكلفة)</span>
          )}
        </div>

        {/* Content */}
        <div onClick={(e) => e.stopPropagation()}>
          {addon.enabled ? children : (
            <p className="text-xs text-muted-foreground">اضغط لإضافة</p>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Package className="h-5 w-5 text-primary" />
        <h4 className="font-semibold">إضافات الباقة</h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ELZAMI Addon - Only show when main policy is THIRD_FULL */}
        {showElzamiAddon && (
          <AddonCard
            type="elzami"
            title="إلزامي"
            icon={FileCheck}
            iconColor="text-red-600"
            bgColor="bg-red-50 dark:bg-red-950/30"
            borderColor="border-red-300 dark:border-red-800"
            addon={elzamiAddon}
          >
            <div className="space-y-3">
              <div>
                <Label className="text-xs">الشركة</Label>
                <Select
                  value={elzamiAddon.company_id}
                  onValueChange={(v) => updateAddon('elzami', { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_elzami_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {elzamiCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_ar || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_elzami_company && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_elzami_company}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">السعر (₪)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={elzamiAddon.insurance_price}
                    onChange={(e) => updateAddon('elzami', { insurance_price: e.target.value })}
                    placeholder="0"
                    className={cn("h-9 text-red-600 font-bold", errors.addon_elzami_price && "border-destructive")}
                    disabled={disabled || loadingElzamiCommission}
                  />
                  {loadingElzamiCommission && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {elzamiAddon.elzami_commission && (
                  <p className="text-xs text-red-500 mt-1">العمولة: ₪{elzamiAddon.elzami_commission}</p>
                )}
                {errors.addon_elzami_price && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_elzami_price}
                  </p>
                )}
              </div>
            </div>
          </AddonCard>
        )}

        {/* Road Service Addon */}
        {showRoadServiceAddon && (
          <AddonCard
            type="road_service"
            title="خدمات الطريق"
            icon={Route}
            iconColor="text-orange-600"
            bgColor="bg-orange-50 dark:bg-orange-950/30"
            borderColor="border-orange-300 dark:border-orange-800"
            addon={roadServiceAddon}
          >
            <div className="space-y-3">
              <div>
                <Label className="text-xs">نوع الخدمة</Label>
                <Select
                  value={roadServiceAddon.road_service_id}
                  onValueChange={(v) => updateAddon('road_service', { road_service_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_road_service && "border-destructive")}>
                    <SelectValue placeholder="اختر الخدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRoadServices.map(rs => (
                      <SelectItem key={rs.id} value={rs.id}>
                        {rs.name_ar || rs.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_road_service && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_road_service}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">الشركة</Label>
                <Select
                  value={roadServiceAddon.company_id}
                  onValueChange={(v) => updateAddon('road_service', { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_road_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {roadServiceCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_ar || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_road_company && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_road_company}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">السعر (₪)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={roadServiceAddon.insurance_price}
                    onChange={(e) => updateAddon('road_service', { insurance_price: e.target.value })}
                    placeholder="0"
                    className={cn("h-9", errors.addon_road_price && "border-destructive")}
                    disabled={disabled || loadingRoadPrice}
                  />
                  {loadingRoadPrice && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {errors.addon_road_price && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_road_price}
                  </p>
                )}
              </div>
            </div>
          </AddonCard>
        )}

        {/* Accident Fee Addon */}
        {showAccidentFeeAddon && (
          <AddonCard
            type="accident_fee_exemption"
            title="إعفاء رسوم حادث"
            icon={Shield}
            iconColor="text-emerald-600"
            bgColor="bg-emerald-50 dark:bg-emerald-950/30"
            borderColor="border-emerald-300 dark:border-emerald-800"
            addon={accidentFeeAddon}
          >
            <div className="space-y-3">
              <div>
                <Label className="text-xs">نوع الخدمة</Label>
                <Select
                  value={accidentFeeAddon.accident_fee_service_id}
                  onValueChange={(v) => updateAddon('accident_fee_exemption', { accident_fee_service_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_accident_service && "border-destructive")}>
                    <SelectValue placeholder="اختر الخدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {accidentFeeServices.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name_ar || s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_accident_service && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_accident_service}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">الشركة</Label>
                <Select
                  value={accidentFeeAddon.company_id}
                  onValueChange={(v) => updateAddon('accident_fee_exemption', { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_accident_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {accidentFeeCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_ar || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_accident_company && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_accident_company}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">السعر (₪)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={accidentFeeAddon.insurance_price}
                    onChange={(e) => updateAddon('accident_fee_exemption', { insurance_price: e.target.value })}
                    placeholder="0"
                    className={cn("h-9", errors.addon_accident_price && "border-destructive")}
                    disabled={disabled || loadingAccidentPrice}
                  />
                  {loadingAccidentPrice && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {errors.addon_accident_price && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_accident_price}
                  </p>
                )}
              </div>
            </div>
          </AddonCard>
        )}
      </div>
    </div>
  );
}
