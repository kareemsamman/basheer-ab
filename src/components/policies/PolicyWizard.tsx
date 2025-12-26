import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, ArrowRight, ArrowLeft } from "lucide-react";
import { calculatePolicyProfit } from "@/lib/pricingCalculator";
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
}

export function PolicyWizard({ 
  open, 
  onOpenChange, 
  onComplete, 
  onSaved, 
  defaultBrokerId, 
  defaultBrokerDirection, 
  preselectedClientId 
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
    payments,
    setPayments,
    insuranceFiles,
    setInsuranceFiles,
    crmFiles,
    setCrmFiles,
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
    goToStep(nextStep);
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    }
  };

  // Upload files to Bunny CDN
  const uploadFiles = async (policyId: string): Promise<void> => {
    const allFiles = [...insuranceFiles, ...crmFiles];
    if (allFiles.length === 0) return;

    for (const file of allFiles) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'policy');
      formData.append('entity_id', policyId);
      if (effectiveBranchId) {
        formData.append('branch_id', effectiveBranchId);
      }

      const { error } = await supabase.functions.invoke('upload-media', {
        body: formData,
      });

      if (error) {
        console.error('File upload error:', error);
      }
    }
  };

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

    setSaving(true);

    try {
      let clientId = selectedClient?.id;
      let carId = selectedCar?.id;

      // Create new client if needed
      if (createNewClient && !clientId) {
        const { data: newClientData, error: clientError } = await supabase
          .from('clients')
          .insert({
            full_name: newClient.full_name.trim(),
            id_number: newClient.id_number.trim(),
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

        // Send signature SMS to new client
        if (newClient.phone_number) {
          const { data: existingSig } = await supabase
            .from('customer_signatures')
            .select('id')
            .eq('client_id', clientId)
            .limit(1);

          if (!existingSig || existingSig.length === 0) {
            await supabase.functions.invoke('send-signature-sms', {
              body: { clientId, phoneNumber: newClient.phone_number },
            });
          }
        }
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
      });

      // Create policy
      const policyTypeParent = (selectedCategory?.slug || policy.policy_type_parent) as PolicyTypeParent;
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
          insurance_price: pricing.totalPrice,
          profit: profitData.profit,
          payed_for_company: profitData.companyPayment,
          company_cost_snapshot: profitData.companyPayment,
          is_under_24: isUnder24,
          broker_id: policyBrokerId || null,
          broker_direction: brokerDir,
          road_service_id: policy.road_service_id || null,
          notes: policy.notes || null,
          branch_id: effectiveBranchId || null,
          created_by_admin_id: user?.id || null,
          group_id: groupId,
        })
        .select()
        .single();

      if (policyError) throw policyError;

      // Create add-on policies if in package mode
      if (packageMode && groupId) {
        for (const addon of packageAddons) {
          if (!addon.enabled) continue;

          const addonTypeParent = (addon.type === 'road_service' ? 'ROAD_SERVICE' : 'ACCIDENT_FEE_EXEMPTION') as PolicyTypeParent;

          await supabase.from('policies').insert({
            client_id: clientId,
            car_id: carId || null,
            category_id: null,
            policy_type_parent: addonTypeParent,
            policy_type_child: null,
            company_id: addon.company_id || null,
            start_date: policy.start_date,
            end_date: policy.end_date,
            insurance_price: parseFloat(addon.insurance_price) || 0,
            road_service_id: addon.road_service_id || null,
            group_id: groupId,
            notes: 'إضافة ضمن باقة',
            branch_id: effectiveBranchId || null,
            created_by_admin_id: user?.id || null,
          });
        }
      }

      // Create payments
      if (payments.length > 0) {
        const paymentInserts = payments.map(p => ({
          policy_id: newPolicy.id,
          payment_type: p.payment_type as PaymentType,
          amount: p.amount,
          payment_date: p.payment_date,
          cheque_number: p.cheque_number || null,
          refused: p.refused || false,
          branch_id: effectiveBranchId || null,
          created_by_admin_id: user?.id || null,
        }));

        const { error: paymentsError } = await supabase
          .from('policy_payments')
          .insert(paymentInserts);

        if (paymentsError) throw paymentsError;
      }

      // Upload files
      await uploadFiles(newPolicy.id);

      clearDraft();

      toast({
        title: "تم الحفظ بنجاح",
        description: "تم إنشاء الوثيقة بنجاح",
      });

      onComplete?.(newPolicy.id);
      onSaved?.();
      onOpenChange(false);
      resetForm();
    } catch (error: unknown) {
      console.error('Save error:', error);
      toast({
        title: "خطأ في الحفظ",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء حفظ البيانات",
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

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              إضافة وثيقة جديدة
              {selectedCategory && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({selectedCategory.name_ar || selectedCategory.name})
                </span>
              )}
            </DialogTitle>
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
                pricing={pricing}
                selectedCar={selectedCar}
                existingCar={existingCar}
                newCar={newCar}
                createNewCar={createNewCar}
                errors={errors}
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
                policyId={tempPolicyId || undefined}
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
                    disabled={saving || paymentsExceedPrice}
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
