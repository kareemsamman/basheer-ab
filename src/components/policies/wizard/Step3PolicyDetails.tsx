import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Package, ArrowLeftRight, ImageIcon, FolderOpen, Upload, X } from "lucide-react";
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
  
  // Files
  insuranceFiles: File[];
  setInsuranceFiles: (files: File[]) => void;
  crmFiles: File[];
  setCrmFiles: (files: File[]) => void;
  
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
  insuranceFiles,
  setInsuranceFiles,
  crmFiles,
  setCrmFiles,
  errors,
}: Step3Props) {
  
  const insuranceInputRef = useRef<HTMLInputElement>(null);
  const crmInputRef = useRef<HTMLInputElement>(null);
  
  const getCarType = () => {
    if (createNewCar) return newCar.car_type;
    return selectedCar?.car_type || existingCar?.car_type || null;
  };

  // File handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'insurance' | 'crm') => {
    const files = e.target.files;
    if (!files) return;
    
    const fileArray = Array.from(files);
    if (type === 'insurance') {
      setInsuranceFiles([...insuranceFiles, ...fileArray]);
    } else {
      setCrmFiles([...crmFiles, ...fileArray]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number, type: 'insurance' | 'crm') => {
    if (type === 'insurance') {
      setInsuranceFiles(insuranceFiles.filter((_, i) => i !== index));
    } else {
      setCrmFiles(crmFiles.filter((_, i) => i !== index));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      .select('id, name, name_ar, category_parent, elzami_commission, broker_id')
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
        const company = data[0];
        setPolicy({ ...policy, company_id: company.id });
        // Auto-set broker if company has broker_id
        handleCompanyBrokerAutoSet(company);
      }
    }
  };

  // Auto-set broker when company is selected (if company has broker_id)
  const handleCompanyBrokerAutoSet = (company: Company | undefined) => {
    if (company?.broker_id) {
      // Company is linked to a broker - auto-set broker and direction
      setPolicyBrokerId(company.broker_id);
      setBrokerDirection('from_broker');  // Broker created for us
    }
  };

  // Handle company change
  const handleCompanyChange = (companyId: string) => {
    setPolicy({ ...policy, company_id: companyId });
    const company = companies.find(c => c.id === companyId);
    
    if (company?.broker_id) {
      // Company is linked to a broker - auto-set and lock
      setPolicyBrokerId(company.broker_id);
      setBrokerDirection('from_broker');
    } else {
      // Company has no broker - clear auto-set values (user can select manually)
      // If user selects a broker manually, direction will be "to_broker"
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
            onValueChange={handleCompanyChange}
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
                  <SelectItem key={c.id} value={c.id}>
                    {c.name_ar || c.name}
                    {c.broker_id && <span className="text-muted-foreground text-xs mr-2">(وسيط)</span>}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <FieldError error={errors.company_id} />
        </div>
      )}

      {/* Broker Section - Auto-detection or manual selection */}
      {requiresBroker && (() => {
        const selectedCompany = companies.find(c => c.id === policy.company_id);
        const isCompanyLinkedToBroker = !!selectedCompany?.broker_id;
        const linkedBroker = isCompanyLinkedToBroker 
          ? brokers.find(b => b.id === selectedCompany.broker_id) 
          : null;
        
        return (
          <Card className="p-4 space-y-4 bg-muted/30">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              <Label className="font-medium">الوسيط</Label>
              {isCompanyLinkedToBroker && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  تم التحديد تلقائياً
                </span>
              )}
            </div>
            
            {isCompanyLinkedToBroker ? (
              // Company is linked to broker - show locked info
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{linkedBroker?.name || 'وسيط'}</p>
                    <p className="text-xs text-muted-foreground">من الوسيط (تلقائي)</p>
                  </div>
                  <ArrowLeftRight className="h-4 w-4 text-primary" />
                </div>
              </div>
            ) : (
              // No linked broker - show manual selection
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">اختيار الوسيط</Label>
                  <Select 
                    value={policyBrokerId || 'none'} 
                    onValueChange={(v) => {
                      const newBrokerId = v === 'none' ? '' : v;
                      setPolicyBrokerId(newBrokerId);
                      // If user selects a broker manually, set direction to "to_broker"
                      if (newBrokerId) {
                        setBrokerDirection('to_broker');
                      } else {
                        setBrokerDirection('');
                      }
                    }}
                  >
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
                  <div className="flex items-end">
                    <div className="p-3 bg-muted rounded-lg flex-1">
                      <p className="text-sm font-medium">إلى الوسيط</p>
                      <p className="text-xs text-muted-foreground">نحن أنشأنا للوسيط</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })()}

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
            placeholder="اختر تاريخ النهاية"
            className={errors.end_date ? "border-destructive" : ""}
          />
          <FieldError error={errors.end_date} />
        </div>
      </div>

      {/* Price Input - BEFORE extras */}
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

      {/* Package Mode - Only for THIRD_FULL - AFTER price */}
      {policy.policy_type_parent === 'THIRD_FULL' && (
        <Card className={cn(
          "p-4 transition-colors",
          packageMode ? "border-primary bg-primary/5" : "bg-secondary/30"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-base font-medium">إضافات الباقة</Label>
                <p className="text-sm text-muted-foreground">خدمات الطريق، إعفاء رسوم حادث</p>
              </div>
            </div>
            <Switch
              checked={packageMode}
              onCheckedChange={setPackageMode}
            />
          </div>

          {packageMode && (
            <div className="mt-4 pt-4 border-t">
              <PackageAddonsSection
                addons={packageAddons}
                onAddonsChange={setPackageAddons}
                roadServices={packageRoadServices}
                accidentFeeServices={packageAccidentFeeServices}
                roadServiceCompanies={packageRoadServiceCompanies}
                accidentFeeCompanies={packageAccidentCompanies}
                carType={getCarType() || undefined}
                errors={errors}
              />
            </div>
          )}
        </Card>
      )}

      {/* Pricing Breakdown Card - AFTER extras */}
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

      {/* File Uploaders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Insurance Files */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              <Label className="font-semibold">ملفات التأمين</Label>
            </div>
            <div className="relative">
              <input
                ref={insuranceInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,video/*"
                onChange={(e) => handleFileSelect(e, 'insurance')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
              <Button type="button" size="sm" variant="outline" className="gap-1.5">
                <Upload className="h-4 w-4" />
                رفع ملف
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            فواتير وإيصالات ترسل للعميل
          </p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {insuranceFiles.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                لا توجد ملفات
              </div>
            ) : (
              insuranceFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {file.type.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : (
                      <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
                    onClick={() => removeFile(index, 'insurance')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* CRM Files */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <Label className="font-semibold">ملفات النظام</Label>
            </div>
            <div className="relative">
              <input
                ref={crmInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,video/*"
                onChange={(e) => handleFileSelect(e, 'crm')}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
              <Button type="button" size="sm" variant="outline" className="gap-1.5">
                <Upload className="h-4 w-4" />
                رفع ملف
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            هوية، رخصة، صور سيارة - ملفات داخلية
          </p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {crmFiles.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                لا توجد ملفات
              </div>
            ) : (
              crmFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {file.type.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : (
                      <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
                    onClick={() => removeFile(index, 'crm')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
