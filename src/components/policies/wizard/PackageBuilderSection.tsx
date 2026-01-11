import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Route, Shield, FileCheck, Loader2, Check, AlertCircle, Car } from "lucide-react";
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
  thirdFullCompanies: Company[];
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
  thirdFullCompanies,
  carType,
  disabled,
  errors = {},
  ageBand = 'ANY',
}: PackageBuilderSectionProps) {
  const [loadingRoadPrice, setLoadingRoadPrice] = useState(false);
  const [loadingAccidentPrice, setLoadingAccidentPrice] = useState(false);
  const [loadingElzamiCommission, setLoadingElzamiCommission] = useState(false);

  // Find addons by type
  const elzamiAddon = addons.find(a => a.type === 'elzami') || { type: 'elzami' as const, enabled: false, company_id: '', insurance_price: '', elzami_commission: 0 };
  const thirdFullAddon = addons.find(a => a.type === 'third_full') || { type: 'third_full' as const, enabled: false, company_id: '', insurance_price: '', policy_type_child: 'THIRD' as const, broker_buy_price: '' };
  const roadServiceAddon = addons.find(a => a.type === 'road_service') || { type: 'road_service' as const, enabled: false, road_service_id: '', company_id: '', insurance_price: '' };
  const accidentFeeAddon = addons.find(a => a.type === 'accident_fee_exemption') || { type: 'accident_fee_exemption' as const, enabled: false, accident_fee_service_id: '', company_id: '', insurance_price: '' };

  const updateAddon = (type: 'elzami' | 'third_full' | 'road_service' | 'accident_fee_exemption', updates: Partial<PackageAddon>) => {
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
  const showThirdFullAddon = mainPolicyType === 'ELZAMI';
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

  // Auto-select Company X as default for road service
  useEffect(() => {
    const defaultCompany = roadServiceCompanies.find(c => c.id === COMPANY_X_ID) 
      || roadServiceCompanies.find(c => c.name === 'شركة اكس' || c.name_ar === 'شركة اكس')
      || (roadServiceCompanies.length > 0 ? roadServiceCompanies[0] : null);

    if (defaultCompany && roadServiceAddon.enabled && !roadServiceAddon.company_id) {
      updateAddon('road_service', { company_id: defaultCompany.id });
    }
  }, [roadServiceCompanies, roadServiceAddon.enabled]);

  // Auto-select Company X as default for accident fee
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
    isCost = false,
    children 
  }: {
    type: 'elzami' | 'third_full' | 'road_service' | 'accident_fee_exemption';
    title: string;
    icon: typeof FileCheck;
    iconColor: string;
    bgColor: string;
    borderColor: string;
    addon: PackageAddon;
    isCost?: boolean;
    children: React.ReactNode;
  }) => {
    return (
      <Card 
        className={cn(
          "relative p-4 cursor-pointer transition-all duration-200 border-2 min-h-[180px]",
          addon.enabled 
            ? `${bgColor} ${borderColor} shadow-md` 
            : "bg-muted/20 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30"
        )}
        onClick={() => !disabled && updateAddon(type, { enabled: !addon.enabled })}
      >
        {/* Selection Indicator */}
        <div className={cn(
          "absolute top-3 left-3 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm",
          addon.enabled 
            ? `${isCost ? 'bg-destructive' : 'bg-primary'} text-white` 
            : "bg-background border-2 border-muted-foreground/30"
        )}>
          {addon.enabled && <Check className="h-3.5 w-3.5" />}
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 mb-3 pr-2">
          <div className={cn("p-1.5 rounded-md", addon.enabled ? bgColor : "bg-muted/50")}>
            <Icon className={cn("h-4 w-4", addon.enabled ? iconColor : "text-muted-foreground")} />
          </div>
          <span className={cn("font-semibold text-sm", addon.enabled ? "text-foreground" : "text-muted-foreground")}>{title}</span>
          {isCost && addon.enabled && (
            <span className="text-xs text-destructive font-bold mr-auto">(تكلفة)</span>
          )}
        </div>

        {/* Content */}
        <div onClick={(e) => e.stopPropagation()}>
          {addon.enabled ? children : (
            <p className="text-xs text-muted-foreground text-center py-6">اضغط لإضافة</p>
          )}
        </div>
      </Card>
    );
  };

  // Count enabled addons to show which ones to display
  const activeAddonCount = addons.filter(a => a.enabled).length;
  const gridCols = showThirdFullAddon ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-3";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Package className="h-5 w-5 text-primary" />
        <h4 className="font-semibold">إضافات الباقة</h4>
        {activeAddonCount > 0 && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            {activeAddonCount} مفعّلة
          </span>
        )}
      </div>

      <div className={cn("grid gap-3", gridCols)}>
        {/* ELZAMI Addon - Only show when main policy is THIRD_FULL */}
        {showElzamiAddon && (
          <AddonCard
            type="elzami"
            title="إلزامي"
            icon={FileCheck}
            iconColor="text-destructive"
            bgColor="bg-destructive/5"
            borderColor="border-destructive/40"
            addon={elzamiAddon}
            isCost={true}
          >
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs mb-1 block">الشركة</Label>
                <Select
                  value={elzamiAddon.company_id || ""}
                  onValueChange={(v) => updateAddon('elzami', { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-8 text-xs", errors.addon_elzami_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {elzamiCompanies.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">لا توجد شركات</div>
                    ) : (
                      elzamiCompanies.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name_ar || c.name}
                        </SelectItem>
                      ))
                    )}
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
                <Label className="text-xs mb-1 block">السعر (₪)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={elzamiAddon.insurance_price}
                    onChange={(e) => updateAddon('elzami', { insurance_price: e.target.value })}
                    placeholder="0"
                    className={cn("h-8 text-xs text-destructive font-bold", errors.addon_elzami_price && "border-destructive")}
                    disabled={disabled || loadingElzamiCommission}
                  />
                  {loadingElzamiCommission && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          </AddonCard>
        )}

        {/* THIRD_FULL Addon - Only show when main policy is ELZAMI */}
        {showThirdFullAddon && (
          <AddonCard
            type="third_full"
            title="ثالث/شامل"
            icon={Car}
            iconColor="text-blue-600"
            bgColor="bg-blue-50 dark:bg-blue-950/30"
            borderColor="border-blue-300 dark:border-blue-800"
            addon={thirdFullAddon}
          >
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs mb-1 block">النوع</Label>
                <Select
                  value={thirdFullAddon.policy_type_child || "THIRD"}
                  onValueChange={(v) => updateAddon('third_full', { policy_type_child: v as 'THIRD' | 'FULL' })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-8 text-xs", errors.addon_thirdfull_child && "border-destructive")}>
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="THIRD">ثالث</SelectItem>
                    <SelectItem value="FULL">شامل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">الشركة</Label>
                <Select
                  value={thirdFullAddon.company_id || ""}
                  onValueChange={(v) => updateAddon('third_full', { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-8 text-xs", errors.addon_thirdfull_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {thirdFullCompanies.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">لا توجد شركات</div>
                    ) : (
                      thirdFullCompanies.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name_ar || c.name}
                          {c.broker_id && <span className="text-muted-foreground text-xs mr-1">(وسيط)</span>}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.addon_thirdfull_company && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_thirdfull_company}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs mb-1 block">السعر (₪)</Label>
                <Input
                  type="number"
                  value={thirdFullAddon.insurance_price}
                  onChange={(e) => updateAddon('third_full', { insurance_price: e.target.value })}
                  placeholder="0"
                  className={cn("h-8 text-xs font-bold", errors.addon_thirdfull_price && "border-destructive")}
                  disabled={disabled}
                />
                {errors.addon_thirdfull_price && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.addon_thirdfull_price}
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
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs mb-1 block">نوع الخدمة</Label>
                <Select
                  value={roadServiceAddon.road_service_id || ""}
                  onValueChange={(v) => updateAddon('road_service', { road_service_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-8 text-xs", errors.addon_road_service && "border-destructive")}>
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
                <Label className="text-xs mb-1 block">الشركة</Label>
                <Select
                  value={roadServiceAddon.company_id || ""}
                  onValueChange={(v) => updateAddon('road_service', { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-8 text-xs", errors.addon_road_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {roadServiceCompanies.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">لا توجد شركات</div>
                    ) : (
                      roadServiceCompanies.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name_ar || c.name}
                        </SelectItem>
                      ))
                    )}
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
                <Label className="text-xs mb-1 block">السعر (₪)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={roadServiceAddon.insurance_price}
                    onChange={(e) => updateAddon('road_service', { insurance_price: e.target.value })}
                    placeholder="0"
                    className={cn("h-8 text-xs font-bold", errors.addon_road_price && "border-destructive")}
                    disabled={disabled || loadingRoadPrice}
                  />
                  {loadingRoadPrice && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
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
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs mb-1 block">نوع الخدمة</Label>
                <Select
                  value={accidentFeeAddon.accident_fee_service_id || ""}
                  onValueChange={(v) => updateAddon('accident_fee_exemption', { accident_fee_service_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-8 text-xs", errors.addon_accident_service && "border-destructive")}>
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
                <Label className="text-xs mb-1 block">الشركة</Label>
                <Select
                  value={accidentFeeAddon.company_id || ""}
                  onValueChange={(v) => updateAddon('accident_fee_exemption', { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-8 text-xs", errors.addon_accident_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {accidentFeeCompanies.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">لا توجد شركات</div>
                    ) : (
                      accidentFeeCompanies.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name_ar || c.name}
                        </SelectItem>
                      ))
                    )}
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
                <Label className="text-xs mb-1 block">السعر (₪)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={accidentFeeAddon.insurance_price}
                    onChange={(e) => updateAddon('accident_fee_exemption', { insurance_price: e.target.value })}
                    placeholder="0"
                    className={cn("h-8 text-xs font-bold", errors.addon_accident_price && "border-destructive")}
                    disabled={disabled || loadingAccidentPrice}
                  />
                  {loadingAccidentPrice && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
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