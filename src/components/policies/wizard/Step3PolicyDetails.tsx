import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Package, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingCard } from "./PricingCard";
import { PackageAddonsSection } from "./PackageAddonsSection";
import type {
  InsuranceCategory,
  Company,
  Broker,
  CarRecord,
  RoadService,
  AccidentFeeService,
  PolicyForm,
  PackageAddon,
  PricingBreakdown,
  ValidationErrors,
  NewCarForm,
} from "./types";
import { CAR_POLICY_TYPES } from "./types";

interface Step3Props {
  // Category
  selectedCategory: InsuranceCategory | null;
  isLightMode: boolean;
  
  // Policy form
  policy: PolicyForm;
  setPolicy: (policy: PolicyForm) => void;
  
  // Companies & Brokers
  companies: Company[];
  setCompanies: (companies: Company[]) => void;
  loadingCompanies: boolean;
  setLoadingCompanies: (loading: boolean) => void;
  brokers: Broker[];
  policyBrokerId: string;
  setPolicyBrokerId: (id: string) => void;
  brokerDirection: 'from_broker' | 'to_broker' | '';
  setBrokerDirection: (direction: 'from_broker' | 'to_broker' | '') => void;
  
  // Road Services
  roadServices: RoadService[];
  setRoadServices: (services: RoadService[]) => void;
  accidentFeeServices: AccidentFeeService[];
  setAccidentFeeServices: (services: AccidentFeeService[]) => void;
  
  // Package mode
  packageMode: boolean;
  setPackageMode: (mode: boolean) => void;
  packageAddons: PackageAddon[];
  setPackageAddons: (addons: PackageAddon[]) => void;
  packageRoadServices: RoadService[];
  setPackageRoadServices: (services: RoadService[]) => void;
  packageRoadServiceCompanies: Company[];
  setPackageRoadServiceCompanies: (companies: Company[]) => void;
  packageAccidentCompanies: Company[];
  setPackageAccidentCompanies: (companies: Company[]) => void;
  packageAccidentFeeServices: AccidentFeeService[];
  setPackageAccidentFeeServices: (services: AccidentFeeService[]) => void;
  
  // Pricing
  pricing: PricingBreakdown;
  
  // Car info (for filtering services)
  selectedCar: CarRecord | null;
  existingCar: CarRecord | null;
  newCar: NewCarForm;
  createNewCar: boolean;
  
  // Errors
  errors: ValidationErrors;
}

export function Step3PolicyDetails({
  selectedCategory,
  isLightMode,
  policy,
  setPolicy,
  companies,
  setCompanies,
  loadingCompanies,
  setLoadingCompanies,
  brokers,
  policyBrokerId,
  setPolicyBrokerId,
  brokerDirection,
  setBrokerDirection,
  roadServices,
  setRoadServices,
  accidentFeeServices,
  setAccidentFeeServices,
  packageMode,
  setPackageMode,
  packageAddons,
  setPackageAddons,
  packageRoadServices,
  setPackageRoadServices,
  packageRoadServiceCompanies,
  setPackageRoadServiceCompanies,
  packageAccidentCompanies,
  setPackageAccidentCompanies,
  packageAccidentFeeServices,
  setPackageAccidentFeeServices,
  pricing,
  selectedCar,
  existingCar,
  newCar,
  createNewCar,
  errors,
}: Step3Props) {
  
  const getCarType = () => {
    if (createNewCar) return newCar.car_type;
    return selectedCar?.car_type || existingCar?.car_type || null;
  };

  // Fetch companies when policy type changes
  useEffect(() => {
    if (policy.policy_type_parent) {
      fetchCompanies(policy.policy_type_parent);
    }
  }, [policy.policy_type_parent]);

  // Fetch road services when ROAD_SERVICE is selected
  useEffect(() => {
    if (policy.policy_type_parent === 'ROAD_SERVICE') {
      fetchRoadServices(getCarType() || undefined);
    }
  }, [policy.policy_type_parent, getCarType()]);

  // Fetch accident fee services when ACCIDENT_FEE_EXEMPTION is selected
  useEffect(() => {
    if (policy.policy_type_parent === 'ACCIDENT_FEE_EXEMPTION') {
      fetchAccidentFeeServices();
    }
  }, [policy.policy_type_parent]);

  // Fetch package companies when THIRD_FULL + package mode
  useEffect(() => {
    if (policy.policy_type_parent === 'THIRD_FULL' && packageMode) {
      fetchPackageCompanies();
    }
  }, [policy.policy_type_parent, packageMode]);

  const fetchCompanies = async (policyType: string) => {
    setLoadingCompanies(true);
    let query = supabase
      .from('insurance_companies')
      .select('id, name, name_ar, category_parent, elzami_commission')
      .eq('active', true)
      .order('name');
    
    if (policyType !== 'ACCIDENT_FEE_EXEMPTION') {
      query = query.contains('category_parent', [policyType]);
    }
    
    const { data } = await query;
    setLoadingCompanies(false);
    if (data) {
      setCompanies(data as Company[]);
      if (data.length === 1) {
        setPolicy({ ...policy, company_id: data[0].id });
      }
    }
  };

  const fetchRoadServices = async (carType?: string) => {
    const { data } = await supabase
      .from('road_services')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    
    if (data) {
      const filtered = carType 
        ? data.filter((rs: any) => rs.allowed_car_types?.includes(carType))
        : data;
      setRoadServices(filtered as RoadService[]);
    }
  };

  const fetchAccidentFeeServices = async () => {
    const { data } = await supabase
      .from('accident_fee_services')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    
    if (data) {
      setAccidentFeeServices(data as AccidentFeeService[]);
    }
  };

  const fetchPackageCompanies = async () => {
    const { data: rsCompanies } = await supabase
      .from('insurance_companies')
      .select('id, name, name_ar, category_parent, elzami_commission')
      .eq('active', true)
      .contains('category_parent', ['ROAD_SERVICE'])
      .order('name');
    
    if (rsCompanies) {
      setPackageRoadServiceCompanies(rsCompanies as Company[]);
    }

    const { data: afeCompanies } = await supabase
      .from('insurance_companies')
      .select('id, name, name_ar, category_parent, elzami_commission')
      .eq('active', true)
      .order('name');
    
    if (afeCompanies) {
      setPackageAccidentCompanies(afeCompanies as Company[]);
    }

    const { data: services } = await supabase
      .from('road_services')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    
    if (services) {
      setPackageRoadServices(services as RoadService[]);
    }

    const { data: afeServices } = await supabase
      .from('accident_fee_services')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    
    if (afeServices) {
      setPackageAccidentFeeServices(afeServices as AccidentFeeService[]);
    }
  };

  // Calculate end date range (±3 days from auto-calculated)
  const getEndDateRange = () => {
    if (!policy.start_date) return { min: '', max: '' };
    const startDate = new Date(policy.start_date);
    const baseEndDate = new Date(startDate);
    baseEndDate.setFullYear(baseEndDate.getFullYear() + 1);
    baseEndDate.setDate(baseEndDate.getDate() - 1);
    
    const minDate = new Date(baseEndDate);
    minDate.setDate(minDate.getDate() - 3);
    const maxDate = new Date(baseEndDate);
    maxDate.setDate(maxDate.getDate() + 3);
    
    return {
      min: minDate.toISOString().split('T')[0],
      max: maxDate.toISOString().split('T')[0],
    };
  };

  // Auto-update end date when start date changes
  useEffect(() => {
    if (policy.start_date) {
      const startDate = new Date(policy.start_date);
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(endDate.getDate() - 1);
      setPolicy({ ...policy, end_date: endDate.toISOString().split('T')[0] });
    }
  }, [policy.start_date]);

  const FieldError = ({ error }: { error?: string }) => {
    if (!error) return null;
    return (
      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {error}
      </p>
    );
  };

  // Check if broker is required for this policy type
  const requiresBroker = CAR_POLICY_TYPES.find(t => t.value === policy.policy_type_parent)?.requiresBroker || false;

  return (
    <div className="space-y-6">
      {/* LIGHT mode: Show category info */}
      {isLightMode && selectedCategory && (
        <Card className="p-3 bg-muted/50">
          <p className="text-sm text-muted-foreground">نوع التأمين</p>
          <p className="font-medium">{selectedCategory.name_ar || selectedCategory.name}</p>
        </Card>
      )}

      {/* FULL mode: Policy Type Selection */}
      {!isLightMode && (
        <div>
          <Label>نوع الوثيقة *</Label>
          <Select 
            value={policy.policy_type_parent} 
            onValueChange={(v) => setPolicy({ ...policy, policy_type_parent: v, policy_type_child: "", company_id: "" })}
          >
            <SelectTrigger className={cn(errors.policy_type_parent ? "border-destructive" : "")}>
              <SelectValue placeholder="اختر نوع الوثيقة" />
            </SelectTrigger>
            <SelectContent>
              {CAR_POLICY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError error={errors.policy_type_parent} />
        </div>
      )}

      {/* THIRD/FULL child type */}
      {policy.policy_type_parent === 'THIRD_FULL' && (
        <div>
          <Label>النوع الفرعي *</Label>
          <Select 
            value={policy.policy_type_child} 
            onValueChange={(v) => setPolicy({ ...policy, policy_type_child: v })}
          >
            <SelectTrigger className={cn(errors.policy_type_child ? "border-destructive" : "")}>
              <SelectValue placeholder="اختر النوع الفرعي" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="THIRD">ثالث</SelectItem>
              <SelectItem value="FULL">شامل</SelectItem>
            </SelectContent>
          </Select>
          <FieldError error={errors.policy_type_child} />
        </div>
      )}

      {/* Road Service Selection */}
      {policy.policy_type_parent === 'ROAD_SERVICE' && (
        <div>
          <Label>خدمة الطريق *</Label>
          <Select 
            value={policy.road_service_id} 
            onValueChange={(v) => setPolicy({ ...policy, road_service_id: v })}
          >
            <SelectTrigger className={cn(errors.road_service_id ? "border-destructive" : "")}>
              <SelectValue placeholder="اختر خدمة الطريق" />
            </SelectTrigger>
            <SelectContent>
              {roadServices.map((rs) => (
                <SelectItem key={rs.id} value={rs.id}>
                  {rs.name_ar || rs.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError error={errors.road_service_id} />
        </div>
      )}

      {/* Accident Fee Service Selection */}
      {policy.policy_type_parent === 'ACCIDENT_FEE_EXEMPTION' && (
        <div>
          <Label>نوع الإعفاء *</Label>
          <Select 
            value={policy.accident_fee_service_id} 
            onValueChange={(v) => setPolicy({ ...policy, accident_fee_service_id: v })}
          >
            <SelectTrigger className={cn(errors.accident_fee_service_id ? "border-destructive" : "")}>
              <SelectValue placeholder="اختر نوع الإعفاء" />
            </SelectTrigger>
            <SelectContent>
              {accidentFeeServices.map((afs) => (
                <SelectItem key={afs.id} value={afs.id}>
                  {afs.name_ar || afs.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError error={errors.accident_fee_service_id} />
        </div>
      )}

      {/* Company Selection */}
      {!isLightMode && (
        <div>
          <Label>شركة التأمين *</Label>
          <Select 
            value={policy.company_id} 
            onValueChange={(v) => setPolicy({ ...policy, company_id: v })}
            disabled={!policy.policy_type_parent}
          >
            <SelectTrigger className={cn(
              errors.company_id ? "border-destructive" : "",
              !policy.policy_type_parent && "opacity-50"
            )}>
              <SelectValue placeholder={policy.policy_type_parent ? "اختر الشركة" : "اختر نوع الوثيقة أولاً"} />
            </SelectTrigger>
            <SelectContent>
              {loadingCompanies ? (
                <div className="p-2 text-center text-sm text-muted-foreground">جاري التحميل...</div>
              ) : companies.length === 0 ? (
                <div className="p-2 text-center text-sm text-muted-foreground">لا توجد شركات لهذا النوع</div>
              ) : (
                companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <FieldError error={errors.company_id} />
        </div>
      )}

      {/* Broker Section - Only for types that require broker */}
      {requiresBroker && (
        <Card className="p-4 space-y-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            <Label className="font-medium">الوسيط</Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">اختيار الوسيط</Label>
              <Select value={policyBrokerId || 'none'} onValueChange={(v) => setPolicyBrokerId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون وسيط" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون وسيط</SelectItem>
                  {brokers.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {policyBrokerId && policyBrokerId !== 'none' && (
              <div>
                <Label className="text-sm">نوع التعامل *</Label>
                <Select value={brokerDirection} onValueChange={(v) => setBrokerDirection(v as any)}>
                  <SelectTrigger className={cn(errors.broker_direction ? "border-destructive" : "")}>
                    <SelectValue placeholder="اختر نوع التعامل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="from_broker">من الوسيط</SelectItem>
                    <SelectItem value="to_broker">إلى الوسيط</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError error={errors.broker_direction} />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Package Mode - Only for THIRD_FULL */}
      {policy.policy_type_parent === 'THIRD_FULL' && (
        <Card className={cn(
          "p-4 transition-colors",
          packageMode ? "border-primary bg-primary/5" : "bg-secondary/30"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-base font-medium">وضع الباقة</Label>
                <p className="text-sm text-muted-foreground">إضافة خدمات إضافية (خدمات الطريق، إعفاء رسوم حادث)</p>
              </div>
            </div>
            <Switch
              checked={packageMode}
              onCheckedChange={setPackageMode}
            />
          </div>

          {packageMode && (
            <PackageAddonsSection
              addons={packageAddons}
              onAddonsChange={setPackageAddons}
              roadServices={packageRoadServices}
              accidentFeeServices={packageAccidentFeeServices}
              roadServiceCompanies={packageRoadServiceCompanies}
              accidentFeeCompanies={packageAccidentCompanies}
              carType={getCarType() || undefined}
            />
          )}
        </Card>
      )}

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>تاريخ البداية *</Label>
          <ArabicDatePicker
            value={policy.start_date}
            onChange={(date) => setPolicy({ ...policy, start_date: date })}
            placeholder="اختر تاريخ البداية"
            className={errors.start_date ? "border-destructive" : ""}
          />
          <FieldError error={errors.start_date} />
        </div>
        <div>
          <Label>تاريخ النهاية *</Label>
          <ArabicDatePicker
            value={policy.end_date}
            onChange={(date) => setPolicy({ ...policy, end_date: date })}
            min={getEndDateRange().min}
            max={getEndDateRange().max}
            placeholder="اختر تاريخ النهاية"
            className={errors.end_date ? "border-destructive" : ""}
          />
          <p className="text-xs text-muted-foreground mt-1">
            يمكن تعديل ±3 أيام من التاريخ التلقائي
          </p>
          <FieldError error={errors.end_date} />
        </div>
      </div>

      {/* Price Input */}
      <div>
        <Label>السعر (₪) *</Label>
        <Input
          type="number"
          value={policy.insurance_price}
          onChange={(e) => setPolicy({ ...policy, insurance_price: e.target.value })}
          placeholder="أدخل السعر"
          className={cn("text-lg", errors.insurance_price ? "border-destructive" : "")}
        />
        <FieldError error={errors.insurance_price} />
      </div>

      {/* ELZAMI Commission Display */}
      {policy.policy_type_parent === 'ELZAMI' && policy.company_id && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-blue-700 dark:text-blue-300">العمولة (الربح)</Label>
            <span className={`text-lg font-bold ${
              (companies.find(c => c.id === policy.company_id)?.elzami_commission || 0) >= 0 
                ? 'text-green-600' 
                : 'text-red-600'
            }`}>
              ₪{(companies.find(c => c.id === policy.company_id)?.elzami_commission || 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Pricing Breakdown Card */}
      {(pricing.basePrice > 0 || packageMode) && (
        <PricingCard
          pricing={pricing}
          showAddons={packageMode}
        />
      )}

      {/* Notes */}
      <div>
        <Label>ملاحظات</Label>
        <Textarea
          value={policy.notes}
          onChange={(e) => setPolicy({ ...policy, notes: e.target.value })}
          placeholder="ملاحظات إضافية..."
          rows={3}
        />
      </div>
    </div>
  );
}
