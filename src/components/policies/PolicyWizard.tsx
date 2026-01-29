import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, ArrowRight, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculatePolicyProfit } from "@/lib/pricingCalculator";
import { digitsOnly } from "@/lib/validation";
import { TranzilaPaymentModal } from "@/components/payments/TranzilaPaymentModal";
import {
  WizardStepper,
  ResetWarningDialog,
  usePolicyWizardState,
  Step1BranchTypeClient,
  Step2Car,
  Step3PolicyDetails,
  Step4Payments,
} from "./wizard";
import type { Database } from "@/integrations/supabase/types";

type PolicyTypeParent = Database["public"]["Enums"]["policy_type_parent"];
type PolicyTypeChild = Database["public"]["Enums"]["policy_type_child"];
type CarType = Database["public"]["Enums"]["car_type"];
type PaymentType = Database["public"]["Enums"]["payment_type"];

interface PolicyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (policyId: string) => void;
  onSaved?: () => void;
  defaultBrokerId?: string;
  defaultBrokerDirection?: 'from_broker' | 'to_broker';
  preselectedClientId?: string;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function PolicyWizard({ 
  open, 
  onOpenChange, 
  onComplete, 
  onSaved, 
  defaultBrokerId, 
  defaultBrokerDirection, 
  preselectedClientId,
  isCollapsed: controlledCollapsed,
  onCollapsedChange,
}: PolicyWizardProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Use the centralized wizard state hook
  const wizardState = usePolicyWizardState({
    defaultBrokerId,
    defaultBrokerDirection,
    preselectedClientId,
    open,
  });

  const {
    currentStep,
    setCurrentStep,
    saving,
    setSaving,
    errors,
    setErrors,
    selectedBranchId,
    setSelectedBranchId,
    categories,
    setCategories,
    selectedCategory,
    setSelectedCategory,
    selectedClient,
    setSelectedClient,
    clientSearch,
    setClientSearch,
    clients,
    setClients,
    loadingClients,
    setLoadingClients,
    createNewClient,
    setCreateNewClient,
    newClient,
    setNewClient,
    checkingDuplicate,
    setCheckingDuplicate,
    selectedCar,
    setSelectedCar,
    clientCars,
    setClientCars,
    loadingCars,
    setLoadingCars,
    createNewCar,
    setCreateNewCar,
    newCar,
    setNewCar,
    fetchingCarData,
    setFetchingCarData,
    carDataFetched,
    setCarDataFetched,
    existingCar,
    setExistingCar,
    carConflict,
    setCarConflict,
    policy,
    setPolicy,
    companies,
    setCompanies,
    loadingCompanies,
    setLoadingCompanies,
    policyBrokerId,
    setPolicyBrokerId,
    brokerDirection,
    setBrokerDirection,
    brokers,
    setBrokers,
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
    packageElzamiCompanies,
    setPackageElzamiCompanies,
    packageThirdFullCompanies,
    setPackageThirdFullCompanies,
    payments,
    setPayments,
    insuranceFiles,
    setInsuranceFiles,
    crmFiles,
    setCrmFiles,
    // Children / Additional Drivers
    clientChildren,
    setClientChildren,
    selectedChildIds,
    setSelectedChildIds,
    newChildren,
    setNewChildren,
    steps,
    currentStepData,
    effectiveBranchId,
    isLightMode,
    pricing,
    totalPaidPayments,
    remainingToPay,
    paymentsExceedPrice,
    resetCarData,
    resetPolicyData,
    resetPayments,
    resetChildren,
    resetForm,
    validateStep,
    goToStep,
    clearDraft,
    user,
    isAdmin,
    userBranchId,
    branches,
  } = wizardState;

  // Reset warning dialog state
  const [resetWarning, setResetWarning] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  // Tranzila state
  const [tranzilaEnabled, setTranzilaEnabled] = useState(false);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  const [activeTranzilaPaymentId, setActiveTranzilaPaymentId] = useState<string | null>(null);
  const [tempPolicyId, setTempPolicyId] = useState<string | null>(null);
  
  // Collapse state for minimizing dialog - controlled or internal
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const setIsCollapsed = onCollapsedChange ?? setInternalCollapsed;

  // Fetch categories and brokers on open
  useEffect(() => {
    if (!open) return;

    const fetchCategories = async () => {
      const { data } = await supabase
        .from('insurance_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (data) {
        const typedCategories = data.map(c => ({
          ...c,
          mode: c.mode as 'FULL' | 'LIGHT',
        }));
        setCategories(typedCategories);
        
        const defaultCat = typedCategories.find(c => c.is_default);
        if (defaultCat && !selectedCategory) {
          setSelectedCategory(defaultCat);
        }
      }
    };

    const fetchBrokers = async () => {
      const { data } = await supabase
        .from('brokers')
        .select('id, name')
        .order('name');
      if (data) setBrokers(data);
    };

    fetchCategories();
    fetchBrokers();
    checkTranzilaEnabled();
  }, [open, selectedCategory, setCategories, setSelectedCategory, setBrokers]);

  // Check if Tranzila is enabled
  const checkTranzilaEnabled = useCallback(async () => {
    const { data } = await supabase
      .from('payment_settings')
      .select('is_enabled')
      .eq('provider', 'tranzila')
      .single();
    setTranzilaEnabled(data?.is_enabled || false);
  }, []);

  // Handle step navigation with reset warnings
  const handleStepClick = (stepId: number) => {
    if (stepId === currentStep) return;
    
    const step = steps.find(s => s.id === stepId);
    if (!step?.isUnlocked) return;

    if (stepId < currentStep) {
      goToStep(stepId);
    } else {
      if (validateStep(currentStep)) {
        goToStep(stepId);
      }
    }
  };

  // Handle category change with reset warning
  const handleCategoryChange = (category: typeof selectedCategory) => {
    if (!category) return;
    
    if (selectedCategory && category.id !== selectedCategory.id) {
      if (selectedCar || policy.company_id || payments.length > 0) {
        setResetWarning({
          open: true,
          title: 'تغيير نوع التأمين',
          description: 'سيؤدي تغيير نوع التأمين إلى إعادة تعيين بيانات السيارة والوثيقة والدفعات. هل تريد المتابعة؟',
          onConfirm: () => {
            setSelectedCategory(category);
            resetCarData();
            resetPolicyData();
            resetPayments();
            setResetWarning({ open: false, title: '', description: '', onConfirm: () => {} });
          },
        });
        return;
      }
    }
    setSelectedCategory(category);
  };

  // Handle branch change (admin only)
  const handleBranchChange = (branchId: string) => {
    if (selectedBranchId && branchId !== selectedBranchId) {
      setResetWarning({
        open: true,
        title: 'تغيير الفرع',
        description: 'سيؤدي تغيير الفرع إلى إعادة تعيين جميع البيانات. هل تريد المتابعة؟',
        onConfirm: () => {
          setSelectedBranchId(branchId);
          resetForm();
          setResetWarning({ open: false, title: '', description: '', onConfirm: () => {} });
        },
      });
      return;
    }
    setSelectedBranchId(branchId);
  };

  // Navigation
  const canGoNext = currentStepData?.isValid;
  const canGoPrev = currentStep > 1;

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    const nextStep = Math.min(currentStep + 1, steps.length);
    
    // Auto-fill LOCKED payment for ELZAMI when entering Step 4
    // ELZAMI payments are system-generated and immutable
    if (nextStep === 4 && policy.policy_type_parent === 'ELZAMI') {
      // Only auto-fill if payments are empty or have no locked ELZAMI payment
      const hasLockedElzamiPayment = payments.some(p => p.locked && p.source === 'system');
      if (!hasLockedElzamiPayment) {
        const totalPrice = parseFloat(policy.insurance_price) || pricing.totalPrice;
        if (totalPrice > 0) {
          setPayments([{
            id: crypto.randomUUID(),
            payment_type: 'cash',
            amount: totalPrice,
            payment_date: new Date().toISOString().split('T')[0],
            refused: false,
            locked: true,
            source: 'system',
            locked_label: 'دفعة إلزامي – تلقائية',
          }]);
        }
      }
    }
    
    goToStep(nextStep);
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    }
  };

  // Upload files to Bunny CDN - PARALLEL for speed
  const uploadFiles = async (policyId: string): Promise<void> => {
    const allFiles = [...insuranceFiles, ...crmFiles];
    if (allFiles.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    // Upload all files in parallel for speed
    const uploadPromises = allFiles.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', insuranceFiles.includes(file) ? 'policy_insurance' : 'policy_crm');
      formData.append('entity_id', policyId);
      if (effectiveBranchId) {
        formData.append('branch_id', effectiveBranchId);
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-media`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          console.error('File upload error for:', file.name);
        }
      } catch (error) {
        console.error('File upload failed for:', file.name, error);
      }
    });

    await Promise.all(uploadPromises);
  };

  // Create a temporary policy for Tranzila payment (returns UUID)
  const handleCreateTempPolicy = useCallback(async (): Promise<string | null> => {
    try {
      // Validate first
      for (let i = 1; i <= steps.length - 1; i++) {
        if (!validateStep(i)) {
          goToStep(i);
          toast({
            title: "خطأ في البيانات",
            description: "يرجى التحقق من جميع الحقول المطلوبة",
            variant: "destructive",
          });
          return null;
        }
      }

      let clientId = selectedClient?.id;
      let carId = selectedCar?.id;

      // Create new client if needed
      if (createNewClient && !clientId) {
        // Generate file_number
        const { data: fileNumData } = await supabase.rpc('generate_file_number');
        const generatedFileNumber = fileNumData || null;

        const { data: newClientData, error: clientError } = await supabase
          .from('clients')
          .insert({
            full_name: newClient.full_name.trim(),
            id_number: newClient.id_number.trim(),
            file_number: generatedFileNumber,
            phone_number: newClient.phone_number || null,
            phone_number_2: newClient.phone_number_2 || null,
            birth_date: newClient.birth_date || null,
            under24_type: newClient.under24_type || 'none',
            under24_driver_name: newClient.under24_driver_name || null,
            under24_driver_id: newClient.under24_driver_id || null,
            notes: newClient.notes || null,
            branch_id: effectiveBranchId || null,
            created_by_admin_id: user?.id || null,
          })
          .select()
          .single();

        if (clientError) throw clientError;
        clientId = newClientData.id;
      }

      if (!clientId) throw new Error('Client ID is required');

      // Create new car if needed
      if (!isLightMode && createNewCar && !carId) {
        const carType = (newCar.car_type || 'car') as CarType;
        
        const { data: newCarData, error: carError } = await supabase
          .from('cars')
          .insert({
            car_number: newCar.car_number.trim(),
            manufacturer_name: newCar.manufacturer_name || null,
            model: newCar.model || null,
            year: newCar.year ? parseInt(newCar.year) : null,
            color: newCar.color || null,
            car_type: carType,
            car_value: newCar.car_value ? parseFloat(newCar.car_value) : null,
            license_expiry: newCar.license_expiry || null,
            client_id: clientId,
            branch_id: effectiveBranchId || null,
            created_by_admin_id: user?.id || null,
          })
          .select()
          .single();

        if (carError) throw carError;
        carId = newCarData.id;
      }

      // Calculate profit
      const isUnder24 = selectedClient?.under24_type === 'client' || 
                        selectedClient?.under24_type === 'additional_driver' ||
                        newClient.under24_type === 'client' ||
                        newClient.under24_type === 'additional_driver';

      const policyTypeParentValue = (selectedCategory?.slug || policy.policy_type_parent) as PolicyTypeParent;
      const policyTypeChildValue = (policy.policy_type_child || null) as PolicyTypeChild | null;
      const carTypeValue = (selectedCar?.car_type || newCar.car_type || 'car') as CarType;
      const ageBandValue = isUnder24 ? 'UNDER_24' as const : 'UP_24' as const;

      const profitData = await calculatePolicyProfit({
        policyTypeParent: policyTypeParentValue,
        policyTypeChild: policyTypeChildValue,
        companyId: policy.company_id,
        carType: carTypeValue,
        ageBand: ageBandValue,
        carValue: selectedCar?.car_value || (newCar.car_value ? parseFloat(newCar.car_value) : null),
        carYear: selectedCar?.year || (newCar.year ? parseInt(newCar.year) : null),
        insurancePrice: pricing.totalPrice,
        roadServiceId: policy.road_service_id || null,
        accidentFeeServiceId: policy.accident_fee_service_id || null,
      });

      const policyTypeParent = (selectedCategory?.slug || policy.policy_type_parent) as PolicyTypeParent;
      const policyTypeChild = policy.policy_type_child ? policy.policy_type_child as PolicyTypeChild : null;
      const brokerDir = brokerDirection ? brokerDirection as "from_broker" | "to_broker" : null;

      // Create policy
      const { data: newPolicy, error: policyError } = await supabase
        .from('policies')
        .insert({
          client_id: clientId,
          car_id: carId || null,
          category_id: selectedCategory?.id || null,
          policy_type_parent: policyTypeParent,
          policy_type_child: policyTypeChild,
          company_id: policy.company_id || null,
          start_date: policy.start_date,
          end_date: policy.end_date,
          insurance_price: pricing.totalPrice,
          profit: profitData.profit,
          payed_for_company: profitData.companyPayment,
          company_cost_snapshot: profitData.companyPayment,
          is_under_24: isUnder24,
          broker_id: policyBrokerId || null,
          broker_direction: brokerDir,
          road_service_id: policy.road_service_id || null,
          accident_fee_service_id: policy.accident_fee_service_id || null,
          notes: policy.notes || null,
          branch_id: effectiveBranchId || null,
          created_by_admin_id: user?.id || null,
        })
        .select()
        .single();

      if (policyError) throw policyError;

      setTempPolicyId(newPolicy.id);
      return newPolicy.id;
    } catch (error) {
      console.error('Error creating temp policy:', error);
      toast({
        title: "خطأ",
        description: "فشل في إنشاء الوثيقة المؤقتة",
        variant: "destructive",
      });
      return null;
    }
  }, [
    steps, validateStep, goToStep, toast, selectedClient, selectedCar, createNewClient,
    newClient, effectiveBranchId, user, isLightMode, createNewCar, newCar, selectedCategory,
    policy, pricing, policyBrokerId, brokerDirection,
  ]);

  // Delete temporary policy on payment failure
  const handleDeleteTempPolicy = useCallback(async (policyId: string): Promise<void> => {
    try {
      // Soft delete the policy
      await supabase
        .from('policies')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', policyId);
      
      setTempPolicyId(null);
    } catch (error) {
      console.error('Error deleting temp policy:', error);
    }
  }, []);

  // Save policy
  const handleSave = async () => {
    for (let i = 1; i <= steps.length; i++) {
      if (!validateStep(i)) {
        goToStep(i);
        toast({
          title: "خطأ في البيانات",
          description: "يرجى التحقق من جميع الحقول المطلوبة",
          variant: "destructive",
        });
        return;
      }
    }

    if (paymentsExceedPrice) {
      toast({
        title: "خطأ في الدفعات",
        description: "مجموع الدفعات يتجاوز سعر التأمين",
        variant: "destructive",
      });
      return;
    }

    // Check for unpaid visa payments
    const hasUnpaidVisa = payments.some(p => p.payment_type === 'visa' && !p.tranzila_paid && (p.amount || 0) > 0);
    if (hasUnpaidVisa) {
      toast({
        title: "دفعات فيزا غير مكتملة",
        description: "يجب الدفع بالفيزا قبل حفظ الوثيقة",
        variant: "destructive",
      });
      return;
    }

    // If tempPolicyId exists (policy was created for Tranzila), use it instead of creating new
    const useTempPolicy = !!tempPolicyId;

    setSaving(true);

    try {
      let policyIdToUse = tempPolicyId;
      let newlyCreatedClientId: string | null = null; // Track if we created a new client

      if (!useTempPolicy) {
        // Create new policy (normal flow without Tranzila)
        let clientId = selectedClient?.id;
        let carId = selectedCar?.id;
        
        if (createNewClient && !clientId) {
          // Generate file_number for new client
          const { data: fileNumData } = await supabase.rpc('generate_file_number');
          const generatedFileNumber = fileNumData || null;

          const { data: newClientData, error: clientError } = await supabase
            .from('clients')
            .insert({
              full_name: newClient.full_name.trim(),
              id_number: newClient.id_number.trim(),
              file_number: generatedFileNumber,
              phone_number: newClient.phone_number || null,
              phone_number_2: newClient.phone_number_2 || null,
              birth_date: newClient.birth_date || null,
              under24_type: newClient.under24_type || 'none',
              under24_driver_name: newClient.under24_driver_name || null,
              under24_driver_id: newClient.under24_driver_id || null,
              notes: newClient.notes || null,
              branch_id: effectiveBranchId || null,
              created_by_admin_id: user?.id || null,
            })
            .select()
            .single();

          if (clientError) throw clientError;
          clientId = newClientData.id;
          newlyCreatedClientId = newClientData.id; // Store the new client ID
        }

        if (!clientId) throw new Error('Client ID is required');

        // Create new car if needed (for FULL mode)
        if (!isLightMode && createNewCar && !carId) {
          const carType = (newCar.car_type || 'car') as CarType;
          
          const { data: newCarData, error: carError } = await supabase
            .from('cars')
            .insert({
              car_number: newCar.car_number.trim(),
              manufacturer_name: newCar.manufacturer_name || null,
              model: newCar.model || null,
              year: newCar.year ? parseInt(newCar.year) : null,
              color: newCar.color || null,
              car_type: carType,
              car_value: newCar.car_value ? parseFloat(newCar.car_value) : null,
              license_expiry: newCar.license_expiry || null,
              client_id: clientId,
              branch_id: effectiveBranchId || null,
              created_by_admin_id: user?.id || null,
            })
            .select()
            .single();

          if (carError) throw carError;
          carId = newCarData.id;
        }

        // Calculate profit based on category
        const isUnder24 = selectedClient?.under24_type === 'client' || 
                          selectedClient?.under24_type === 'additional_driver' ||
                          newClient.under24_type === 'client' ||
                          newClient.under24_type === 'additional_driver';

        const policyTypeParentValue = policy.policy_type_parent as PolicyTypeParent;
        const policyTypeChildValue = (policy.policy_type_child || null) as PolicyTypeChild | null;
        const carTypeValue = (selectedCar?.car_type || newCar.car_type || 'car') as CarType;
        const ageBandValue = isUnder24 ? 'UNDER_24' as const : 'UP_24' as const;

        // Check if company is linked to a broker and broker_buy_price is provided
        const selectedCompany = companies.find(c => c.id === policy.company_id);
        const isCompanyLinkedToBroker = !!selectedCompany?.broker_id;
        const brokerBuyPriceValue = isCompanyLinkedToBroker && policy.broker_buy_price 
          ? parseFloat(policy.broker_buy_price) 
          : null;

        const profitData = await calculatePolicyProfit({
          policyTypeParent: policyTypeParentValue,
          policyTypeChild: policyTypeChildValue,
          companyId: policy.company_id,
          carType: carTypeValue,
          ageBand: ageBandValue,
          carValue: selectedCar?.car_value || (newCar.car_value ? parseFloat(newCar.car_value) : null),
          carYear: selectedCar?.year || (newCar.year ? parseInt(newCar.year) : null),
          insurancePrice: parseFloat(policy.insurance_price) || pricing.totalPrice,
          brokerBuyPrice: brokerBuyPriceValue,
          roadServiceId: policy.road_service_id || null,
          accidentFeeServiceId: policy.accident_fee_service_id || null,
        });

        // Create policy
        const policyTypeParent = policy.policy_type_parent as PolicyTypeParent;
        const policyTypeChild = policy.policy_type_child ? policy.policy_type_child as PolicyTypeChild : null;
        const brokerDir = brokerDirection || null;

        let groupId: string | null = null;

        // Create policy group if package mode is enabled
        if (packageMode && (packageAddons[0].enabled || packageAddons[1].enabled)) {
          const { data: groupData, error: groupError } = await supabase
            .from('policy_groups')
            .insert({
              client_id: clientId,
              car_id: carId || null,
              name: `باقة - ${new Date().toLocaleDateString('ar-EG')}`,
            })
            .select()
            .single();

          if (groupError) throw groupError;
          groupId = groupData.id;
        }

        const { data: newPolicy, error: policyError } = await supabase
          .from('policies')
          .insert({
            client_id: clientId,
            car_id: carId || null,
            category_id: selectedCategory?.id || null,
            policy_type_parent: policyTypeParent,
            policy_type_child: policyTypeChild,
            company_id: policy.company_id || null,
            start_date: policy.start_date,
            end_date: policy.end_date,
            insurance_price: parseFloat(policy.insurance_price) || pricing.totalPrice,
            profit: profitData.profit,
            payed_for_company: profitData.companyPayment,
            company_cost_snapshot: profitData.companyPayment,
            broker_buy_price: brokerBuyPriceValue || 0,
            is_under_24: isUnder24,
            broker_id: policyBrokerId || null,
            broker_direction: brokerDir,
            road_service_id: policy.road_service_id || null,
            accident_fee_service_id: policy.accident_fee_service_id || null,
            notes: policy.notes || null,
            branch_id: effectiveBranchId || null,
            created_by_admin_id: user?.id || null,
            group_id: groupId,
          })
          .select()
          .single();

        if (policyError) throw policyError;
        policyIdToUse = newPolicy.id;

        // Create add-on policies if in package mode
        if (packageMode && groupId) {
          for (const addon of packageAddons) {
            if (!addon.enabled) continue;

            // Map addon type to proper policy_type_parent
            const addonTypeMap: Record<string, PolicyTypeParent> = {
              'elzami': 'ELZAMI',
              'third_full': 'THIRD_FULL',
              'road_service': 'ROAD_SERVICE',
              'accident_fee_exemption': 'ACCIDENT_FEE_EXEMPTION',
            };
            const addonTypeParent = addonTypeMap[addon.type] as PolicyTypeParent;
            const addonInsurancePrice = parseFloat(addon.insurance_price) || 0;
            
            // Get policy_type_child for THIRD_FULL addons
            const addonTypeChild = addon.type === 'third_full' && addon.policy_type_child 
              ? addon.policy_type_child as PolicyTypeChild 
              : null;
            
            // Calculate profit for addon policies
            const addonProfitData = await calculatePolicyProfit({
              policyTypeParent: addonTypeParent,
              policyTypeChild: addonTypeChild,
              companyId: addon.company_id || '',
              carType: (selectedCar?.car_type || newCar.car_type || 'car') as CarType,
              ageBand: isUnder24 ? 'UNDER_24' as const : 'UP_24' as const,
              carValue: selectedCar?.car_value || (newCar.car_value ? parseFloat(newCar.car_value) : null),
              carYear: selectedCar?.year || (newCar.year ? parseInt(newCar.year) : null),
              insurancePrice: addonInsurancePrice,
              roadServiceId: addon.road_service_id || null,
              accidentFeeServiceId: addon.accident_fee_service_id || null,
            });

            await supabase.from('policies').insert({
              client_id: clientId,
              car_id: carId || null,
              category_id: null,
              policy_type_parent: addonTypeParent,
              policy_type_child: addonTypeChild,
              company_id: addon.company_id || null,
              start_date: policy.start_date,
              end_date: policy.end_date,
              insurance_price: addonInsurancePrice,
              profit: addonProfitData.profit,
              payed_for_company: addonProfitData.companyPayment,
              company_cost_snapshot: addonProfitData.companyPayment,
              road_service_id: addon.road_service_id || null,
              accident_fee_service_id: addon.accident_fee_service_id || null,
              group_id: groupId,
              notes: 'إضافة ضمن باقة',
              branch_id: effectiveBranchId || null,
              created_by_admin_id: user?.id || null,
            });
          }
        }
      }

      if (!policyIdToUse) throw new Error('Policy ID is required');

      // Create payments (skip visa payments that were already created by Tranzila)
      const nonVisaPayments = payments.filter(p => p.payment_type !== 'visa' || !p.tranzila_paid);
      if (nonVisaPayments.length > 0) {
        const paymentInserts = nonVisaPayments
          .filter(p => p.payment_type !== 'visa') // Skip visa - already handled by Tranzila
          .map(p => ({
            policy_id: policyIdToUse,
            payment_type: p.payment_type as PaymentType,
            amount: p.amount,
            payment_date: p.payment_date,
            cheque_number: p.cheque_number || null,
            cheque_status: p.payment_type === 'cheque' ? 'pending' : null,
            refused: p.refused || false,
            branch_id: effectiveBranchId || null,
            created_by_admin_id: user?.id || null,
            // Pass locked and source flags for ELZAMI system-generated payments
            locked: p.locked || false,
            source: p.source || 'user',
          }));

        if (paymentInserts.length > 0) {
          const { data: insertedPayments, error: paymentsError } = await supabase
            .from('policy_payments')
            .insert(paymentInserts)
            .select('id');

          if (paymentsError) throw paymentsError;

          // Upload payment images
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token && insertedPayments) {
            for (let i = 0; i < nonVisaPayments.filter(p => p.payment_type !== 'visa').length; i++) {
              const payment = nonVisaPayments.filter(p => p.payment_type !== 'visa')[i];
              const insertedPayment = insertedPayments[i];
              
              if (payment.pendingImages && payment.pendingImages.length > 0 && insertedPayment) {
                // Upload images in parallel
                const uploadPromises = payment.pendingImages.map(async (file, imgIndex) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('entity_type', 'payment');
                  formData.append('entity_id', insertedPayment.id);
                  if (effectiveBranchId) formData.append('branch_id', effectiveBranchId);

                  try {
                    const response = await fetch(
                      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-media`,
                      { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }, body: formData }
                    );
                    if (response.ok) {
                      const data = await response.json();
                      await supabase.from('payment_images').insert({
                        payment_id: insertedPayment.id,
                        image_url: data.file?.cdn_url || data.url,
                        image_type: imgIndex === 0 ? 'front' : imgIndex === 1 ? 'back' : 'receipt',
                        sort_order: imgIndex,
                      });
                    }
                  } catch (e) {
                    console.error('Payment image upload failed:', e);
                  }
                });
                await Promise.all(uploadPromises);
              }
            }
          }
        }
      }

      // Upload files
      await uploadFiles(policyIdToUse);

      // Save new children and link selected children to policy
      let clientIdForChildren = selectedClient?.id || newlyCreatedClientId;
      // If we used a temp policy (Tranzila flow), we might not have clientId in state
      if (!clientIdForChildren && policyIdToUse) {
        const { data: policyClient, error: policyClientError } = await supabase
          .from('policies')
          .select('client_id')
          .eq('id', policyIdToUse)
          .single();

        if (policyClientError) throw policyClientError;
        clientIdForChildren = policyClient?.client_id || null;
      }

      if (clientIdForChildren) {
        // Validate for duplicate IDs among new children BEFORE inserting
        const newChildIdNumbers = newChildren
          .map(c => digitsOnly(c.id_number).trim())
          .filter(Boolean);
        const duplicateIdNumbers = newChildIdNumbers.filter((id, idx) => newChildIdNumbers.indexOf(id) !== idx);
        if (duplicateIdNumbers.length > 0) {
          throw new Error(`رقم الهوية مكرر: ${duplicateIdNumbers[0]}`);
        }

        // Also block duplicates between new children and existing children for this client
        if (newChildIdNumbers.length > 0) {
          const { data: existing, error: existingErr } = await supabase
            .from('client_children')
            .select('id_number')
            .eq('client_id', clientIdForChildren);
          if (existingErr) throw existingErr;

          const existingSet = new Set((existing || []).map(r => digitsOnly(r.id_number).trim()));
          const dupAgainstExisting = newChildIdNumbers.find(id => existingSet.has(id));
          if (dupAgainstExisting) {
            throw new Error(`رقم الهوية "${dupAgainstExisting}" موجود مسبقاً لهذا العميل`);
          }
        }

        // Insert new children into client_children
        const insertedChildIds: string[] = [];
        if (newChildren.length > 0) {
          for (const child of newChildren) {
            if (!child.full_name.trim() || !child.id_number.trim()) continue;
            
            const { data: newChild, error: childError } = await supabase
              .from('client_children')
              .insert({
                client_id: clientIdForChildren,
                full_name: child.full_name.trim(),
                id_number: digitsOnly(child.id_number).trim(),
                birth_date: child.birth_date || null,
                phone: child.phone || null,
                relation: child.relation || null,
                notes: child.notes || null,
              })
              .select('id')
              .single();

            if (childError) {
              console.error('[PolicyWizard] Failed to insert child', {
                payload: {
                  client_id: clientIdForChildren,
                  full_name: child.full_name,
                  id_number: child.id_number,
                  birth_date: child.birth_date,
                  phone: child.phone,
                  relation: child.relation,
                },
                error: childError,
              });
              // Handle duplicate key error
              if (childError.code === '23505') {
                throw new Error(`رقم الهوية "${child.id_number}" موجود مسبقاً لهذا العميل`);
              }
              throw new Error(`فشل إضافة السائق "${child.full_name}": ${childError.message}`);
            }
            
            if (newChild) {
              insertedChildIds.push(newChild.id);
            }
          }
        }

        // All child IDs to link to policy (selected existing + newly inserted)
        const allChildIdsToLink = Array.from(new Set([...selectedChildIds, ...insertedChildIds]));

        // REPLACE strategy: Delete existing policy_children for this policy, then insert new set
        // This prevents duplicates on edit/re-save
        if (policyIdToUse) {
          const { error: deleteError } = await supabase
            .from('policy_children')
            .delete()
            .eq('policy_id', policyIdToUse);

          if (deleteError) {
            console.error('[PolicyWizard] Failed to clear existing policy_children', {
              policy_id: policyIdToUse,
              error: deleteError,
            });
            // This is required for correctness (replace-links); surface it.
            throw deleteError;
          }
        }

        // Insert into policy_children (link children to policy)
        if (allChildIdsToLink.length > 0) {
          const policyChildrenInserts = allChildIdsToLink.map(childId => ({
            policy_id: policyIdToUse,
            child_id: childId,
          }));

          const { error: linkError } = await supabase
            .from('policy_children')
            .insert(policyChildrenInserts);

          if (linkError) {
            console.error('[PolicyWizard] Failed to link policy children', {
              payload: policyChildrenInserts,
              error: linkError,
            });
            // Show specific RLS or constraint errors
            throw new Error(`فشل ربط السائقين بالوثيقة: ${linkError.message}`);
          }
        }
      }
      // Send signature and invoice SMS to client
      const clientPhone = selectedClient?.phone_number || newClient.phone_number;
      
      // Get the actual client ID (could be from temp policy creation or normal flow)
      let finalClientId = selectedClient?.id;
      if (!finalClientId && policyIdToUse) {
        // Fetch client_id from the policy we just created
        const { data: policyData } = await supabase
          .from('policies')
          .select('client_id')
          .eq('id', policyIdToUse)
          .single();
        finalClientId = policyData?.client_id;
      }
      
      if (clientPhone && policyIdToUse && finalClientId) {
        // Fire-and-forget SMS sending (don't await - for speed)
        // Signature SMS
        supabase
          .from('clients')
          .select('signature_url')
          .eq('id', finalClientId)
          .single()
          .then(({ data: clientData }) => {
            if (!clientData?.signature_url) {
              console.log('[PolicyWizard] Sending signature SMS...');
              supabase.functions.invoke('send-signature-sms', {
                body: { 
                  client_id: finalClientId,
                  policy_id: policyIdToUse
                },
              }).then(({ error }) => {
                if (error) console.error('[PolicyWizard] Signature SMS error:', error);
                else console.log('[PolicyWizard] Signature SMS sent');
              });
            }
          });

        // Invoice SMS (fire-and-forget)
        supabase.functions.invoke('send-invoice-sms', {
          body: { 
            policyId: policyIdToUse,
            phoneNumber: clientPhone 
          },
        }).then(({ error }) => {
          if (error) console.error('[PolicyWizard] Invoice SMS error:', error);
          else console.log('[PolicyWizard] Invoice SMS sent');
        });
      }

      clearDraft();
      setTempPolicyId(null);

      toast({
        title: "تم الحفظ بنجاح",
        description: clientPhone ? "تم إنشاء الوثيقة وإرسال SMS للعميل" : "تم إنشاء الوثيقة بنجاح",
      });

      onComplete?.(policyIdToUse);
      
      // Close dialog first
      onOpenChange(false);
      resetForm();
      
      // Always reload page after creating policy to show fresh data (new cards, etc.)
      // This ensures the client view shows the new policy card immediately
      setTimeout(() => {
        if (newlyCreatedClientId) {
          // Navigate to clients page with the new client open
          window.location.href = `/clients?open=${newlyCreatedClientId}`;
        } else if (selectedClient?.id) {
          // Navigate back to the specific client profile (not just reload)
          window.location.href = `/clients?open=${selectedClient.id}`;
        } else {
          // Fallback - just call onSaved
          onSaved?.();
        }
      }, 150);
    } catch (error: unknown) {
      console.error('Save error:', error);

      const formatSaveError = (err: unknown): string => {
        // Our own thrown errors should always be user-friendly.
        if (err instanceof Error) return err.message;
        if (typeof err === 'string') return err;
        if (!err || typeof err !== 'object') return "حدث خطأ أثناء حفظ البيانات";

        const anyErr = err as any;
        const msg = typeof anyErr.message === 'string' ? anyErr.message : "حدث خطأ أثناء حفظ البيانات";

        // Only admins should see low-level details.
        if (!isAdmin) return "حدث خطأ أثناء حفظ البيانات";

        const code = typeof anyErr.code === 'string' ? ` (${anyErr.code})` : '';
        const details = typeof anyErr.details === 'string' && anyErr.details ? ` — ${anyErr.details}` : '';
        const hint = typeof anyErr.hint === 'string' && anyErr.hint ? ` — ${anyErr.hint}` : '';
        return `${msg}${code}${details}${hint}`;
      };

      toast({
        title: "خطأ في الحفظ",
        description: formatSaveError(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle dialog close
  const handleClose = () => {
    if (saving) return;
    onOpenChange(false);
  };

  // Don't render dialog when collapsed (the expand button is in the BottomToolbar)
  if (isCollapsed && open) {
    return null;
  }

  return (
    <>
      <Dialog open={open && !isCollapsed} onOpenChange={handleClose}>
        <DialogContent 
          className="max-w-5xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col" 
          dir="rtl"
        >
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                إضافة وثيقة جديدة
                {selectedCategory && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({selectedCategory.name_ar || selectedCategory.name})
                  </span>
                )}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCollapsed(true)}
                className="h-8 w-8 p-0 rounded-full"
                title="إخفاء"
              >
                <ChevronDown className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>

          {/* Wizard Stepper */}
          <div className="flex-shrink-0 py-4">
            <WizardStepper
              steps={steps}
              currentStep={currentStep}
              onStepClick={handleStepClick}
            />
          </div>

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto px-1 min-h-0">
            {currentStep === 1 && (
              <Step1BranchTypeClient
                isAdmin={isAdmin}
                branches={branches}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={handleBranchChange}
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={handleCategoryChange}
                clientSearch={clientSearch}
                setClientSearch={setClientSearch}
                clients={clients}
                setClients={setClients}
                loadingClients={loadingClients}
                setLoadingClients={setLoadingClients}
                selectedClient={selectedClient}
                setSelectedClient={setSelectedClient}
                createNewClient={createNewClient}
                setCreateNewClient={setCreateNewClient}
                newClient={newClient}
                setNewClient={setNewClient}
                checkingDuplicate={checkingDuplicate}
                setCheckingDuplicate={setCheckingDuplicate}
                selectedChildIds={selectedChildIds}
                setSelectedChildIds={setSelectedChildIds}
                newChildren={newChildren}
                setNewChildren={setNewChildren}
                errors={errors}
                setErrors={setErrors}
              />
            )}

            {currentStep === 2 && !isLightMode && (
              <Step2Car
                selectedClient={selectedClient}
                clientCars={clientCars}
                setClientCars={setClientCars}
                loadingCars={loadingCars}
                setLoadingCars={setLoadingCars}
                selectedCar={selectedCar}
                setSelectedCar={setSelectedCar}
                createNewCar={createNewCar}
                setCreateNewCar={setCreateNewCar}
                newCar={newCar}
                setNewCar={setNewCar}
                existingCar={existingCar}
                setExistingCar={setExistingCar}
                carConflict={carConflict}
                setCarConflict={setCarConflict}
                fetchingCarData={fetchingCarData}
                setFetchingCarData={setFetchingCarData}
                carDataFetched={carDataFetched}
                setCarDataFetched={setCarDataFetched}
                errors={errors}
              />
            )}

            {((currentStep === 3 && !isLightMode) || (currentStep === 2 && isLightMode)) && (
              <Step3PolicyDetails
                selectedCategory={selectedCategory}
                isLightMode={isLightMode}
                policy={policy}
                setPolicy={setPolicy}
                companies={companies}
                setCompanies={setCompanies}
                loadingCompanies={loadingCompanies}
                setLoadingCompanies={setLoadingCompanies}
                brokers={brokers}
                policyBrokerId={policyBrokerId}
                setPolicyBrokerId={setPolicyBrokerId}
                brokerDirection={brokerDirection}
                setBrokerDirection={setBrokerDirection}
                roadServices={roadServices}
                setRoadServices={setRoadServices}
                accidentFeeServices={accidentFeeServices}
                setAccidentFeeServices={setAccidentFeeServices}
                packageMode={packageMode}
                setPackageMode={setPackageMode}
                packageAddons={packageAddons}
                setPackageAddons={setPackageAddons}
                packageRoadServices={packageRoadServices}
                setPackageRoadServices={setPackageRoadServices}
                packageRoadServiceCompanies={packageRoadServiceCompanies}
                setPackageRoadServiceCompanies={setPackageRoadServiceCompanies}
                packageAccidentCompanies={packageAccidentCompanies}
                setPackageAccidentCompanies={setPackageAccidentCompanies}
                packageAccidentFeeServices={packageAccidentFeeServices}
                setPackageAccidentFeeServices={setPackageAccidentFeeServices}
                packageElzamiCompanies={packageElzamiCompanies}
                setPackageElzamiCompanies={setPackageElzamiCompanies}
                packageThirdFullCompanies={packageThirdFullCompanies}
                setPackageThirdFullCompanies={setPackageThirdFullCompanies}
                pricing={pricing}
                selectedCar={selectedCar}
                existingCar={existingCar}
                newCar={newCar}
                createNewCar={createNewCar}
                insuranceFiles={insuranceFiles}
                setInsuranceFiles={setInsuranceFiles}
                crmFiles={crmFiles}
                setCrmFiles={setCrmFiles}
                errors={errors}
                clientLessThan24={selectedClient?.less_than_24 ?? newClient?.under24_type !== 'none'}
              />
            )}

            {((currentStep === 4 && !isLightMode) || (currentStep === 3 && isLightMode)) && (
              <Step4Payments
                payments={payments}
                setPayments={setPayments}
                pricing={pricing}
                totalPaidPayments={totalPaidPayments}
                remainingToPay={remainingToPay}
                paymentsExceedPrice={paymentsExceedPrice}
                errors={errors}
                onCreateTempPolicy={handleCreateTempPolicy}
                onDeleteTempPolicy={handleDeleteTempPolicy}
                tempPolicyId={tempPolicyId}
                isElzami={policy.policy_type_parent === 'ELZAMI'}
              />
            )}
          </div>

          {/* Footer with navigation */}
          <div className="flex-shrink-0 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {canGoPrev && (
                  <Button
                    variant="outline"
                    onClick={handlePrev}
                    disabled={saving}
                  >
                    <ArrowRight className="h-4 w-4 ml-2" />
                    السابق
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                {currentStep < steps.length ? (
                  <Button
                    onClick={handleNext}
                    disabled={!canGoNext || saving}
                  >
                    التالي
                    <ArrowLeft className="h-4 w-4 mr-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSave}
                    disabled={saving || paymentsExceedPrice || payments.some(p => p.payment_type === 'visa' && !p.tranzila_paid && (p.amount || 0) > 0)}
                    className="min-w-32"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        جاري الحفظ...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 ml-2" />
                        حفظ الوثيقة
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Warning Dialog */}
      <ResetWarningDialog
        open={resetWarning.open}
        onOpenChange={(open) => setResetWarning(prev => ({ ...prev, open }))}
        title={resetWarning.title}
        description={resetWarning.description}
        onConfirm={resetWarning.onConfirm}
      />

      {/* Tranzila Payment Modal */}
      {tranzilaModalOpen && tempPolicyId && activeTranzilaPaymentId && (
        <TranzilaPaymentModal
          open={tranzilaModalOpen}
          onOpenChange={(open) => {
            setTranzilaModalOpen(open);
            if (!open) setActiveTranzilaPaymentId(null);
          }}
          policyId={tempPolicyId}
          amount={payments.find(p => p.id === activeTranzilaPaymentId)?.amount || 0}
          paymentDate={payments.find(p => p.id === activeTranzilaPaymentId)?.payment_date || new Date().toISOString().split('T')[0]}
          onSuccess={() => {
            setPayments(prev => prev.map(p => 
              p.id === activeTranzilaPaymentId 
                ? { ...p, tranzila_paid: true }
                : p
            ));
            setTranzilaModalOpen(false);
            setActiveTranzilaPaymentId(null);
          }}
          onFailure={() => {
            setTranzilaModalOpen(false);
            setActiveTranzilaPaymentId(null);
          }}
        />
      )}
    </>
  );
}
