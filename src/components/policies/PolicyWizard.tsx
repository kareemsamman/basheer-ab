import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Check, Car, User, FileText, CreditCard, Loader2, X, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface PolicyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (policyId: string) => void;
}

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  file_number: string | null;
  phone_number: string | null;
  less_than_24: boolean | null;
}

interface Car {
  id: string;
  car_number: string;
  manufacturer_name: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  car_type: string | null;
  car_value: number | null;
}

interface Company {
  id: string;
  name: string;
  name_ar: string | null;
}

interface PaymentLine {
  id: string;
  payment_type: string;
  amount: number;
  payment_date: string;
  cheque_number?: string;
  refused: boolean;
}

const STEPS = [
  { id: 1, title: "العميل", icon: User },
  { id: 2, title: "السيارة", icon: Car },
  { id: 3, title: "الوثيقة", icon: FileText },
  { id: 4, title: "الدفعات", icon: CreditCard },
];

const POLICY_TYPES = [
  { value: "ELZAMI", label: "إلزامي" },
  { value: "THIRD_FULL", label: "ثالث/شامل", hasChild: true },
  { value: "ROAD_SERVICE", label: "خدمات الطريق" },
  { value: "ACCIDENT_FEE_EXEMPTION", label: "إعفاء رسوم حادث" },
];

const CAR_TYPES = [
  { value: "car", label: "خصوصي" },
  { value: "cargo", label: "شحن" },
  { value: "small", label: "صغير" },
  { value: "taxi", label: "تاكسي" },
  { value: "tjeradown4", label: "تجاري (أقل من 4 طن)" },
  { value: "tjeraup4", label: "تجاري (أكثر من 4 طن)" },
];

const PAYMENT_TYPES = [
  { value: "cash", label: "نقدي" },
  { value: "cheque", label: "شيك" },
  { value: "visa", label: "فيزا" },
  { value: "transfer", label: "تحويل" },
];

const POLICY_WIZARD_DRAFT_KEY = "abcrm:policyWizardDraft:v1";

type PolicyWizardDraft = {
  currentStep: number;
  clientSearch: string;
  selectedClient: Client | null;
  createNewClient: boolean;
  newClient: {
    full_name: string;
    id_number: string;
    file_number: string;
    phone_number: string;
    less_than_24: boolean;
    notes: string;
  };
  selectedCar: Car | null;
  createNewCar: boolean;
  newCar: {
    car_number: string;
    manufacturer_name: string;
    model: string;
    year: string;
    color: string;
    car_type: string;
    car_value: string;
    license_expiry: string;
  };
  carDataFetched: boolean;
  policy: {
    policy_type_parent: string;
    policy_type_child: string;
    company_id: string;
    start_date: string;
    end_date: string;
    insurance_price: string;
    cancelled: boolean;
    transferred: boolean;
    notes: string;
  };
  payments: PaymentLine[];
};

export function PolicyWizard({ open, onOpenChange, onComplete }: PolicyWizardProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Client
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [createNewClient, setCreateNewClient] = useState(false);
  const [newClient, setNewClient] = useState({
    full_name: "",
    id_number: "",
    file_number: "",
    phone_number: "",
    less_than_24: false,
    notes: "",
  });
  const [loadingClients, setLoadingClients] = useState(false);

  // Step 2: Car
  const [clientCars, setClientCars] = useState<Car[]>([]);
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [createNewCar, setCreateNewCar] = useState(false);
  const [newCar, setNewCar] = useState({
    car_number: "",
    manufacturer_name: "",
    model: "",
    year: "",
    color: "",
    car_type: "car",
    car_value: "",
    license_expiry: "",
  });
  const [fetchingCarData, setFetchingCarData] = useState(false);
  const [carDataFetched, setCarDataFetched] = useState(false);
  const [loadingCars, setLoadingCars] = useState(false);

  // Step 3: Policy
  const [companies, setCompanies] = useState<Company[]>([]);
  const [policy, setPolicy] = useState({
    policy_type_parent: "",
    policy_type_child: "",
    company_id: "",
    start_date: new Date().toISOString().split('T')[0],
    end_date: "",
    insurance_price: "",
    cancelled: false,
    transferred: false,
    notes: "",
  });
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Step 4: Payments
  const [payments, setPayments] = useState<PaymentLine[]>([]);

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(POLICY_WIZARD_DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const loadDraft = (): PolicyWizardDraft | null => {
    try {
      const raw = sessionStorage.getItem(POLICY_WIZARD_DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PolicyWizardDraft;
    } catch {
      return null;
    }
  };

  // Reset / restore on open

  useEffect(() => {
    if (!open) return;

    const draft = loadDraft();

    if (draft) {
      setCurrentStep(draft.currentStep ?? 1);
      setClientSearch(draft.clientSearch ?? "");
      setSelectedClient(draft.selectedClient ?? null);
      setCreateNewClient(!!draft.createNewClient);
      setNewClient(
        draft.newClient ?? {
          full_name: "",
          id_number: "",
          file_number: "",
          phone_number: "",
          less_than_24: false,
          notes: "",
        },
      );
      setSelectedCar(draft.selectedCar ?? null);
      setCreateNewCar(!!draft.createNewCar);
      setNewCar(
        draft.newCar ?? {
          car_number: "",
          manufacturer_name: "",
          model: "",
          year: "",
          color: "",
          car_type: "car",
          car_value: "",
          license_expiry: "",
        },
      );
      setCarDataFetched(!!draft.carDataFetched);
      setPolicy(
        draft.policy ?? {
          policy_type_parent: "",
          policy_type_child: "",
          company_id: "",
          start_date: new Date().toISOString().split("T")[0],
          end_date: "",
          insurance_price: "",
          cancelled: false,
          transferred: false,
          notes: "",
        },
      );
      setPayments(draft.payments ?? []);
    } else {
      setCurrentStep(1);
      setSelectedClient(null);
      setSelectedCar(null);
      setCreateNewClient(false);
      setCreateNewCar(false);
      setNewClient({ full_name: "", id_number: "", file_number: "", phone_number: "", less_than_24: false, notes: "" });
      setNewCar({ car_number: "", manufacturer_name: "", model: "", year: "", color: "", car_type: "car", car_value: "", license_expiry: "" });
      setPolicy({ policy_type_parent: "", policy_type_child: "", company_id: "", start_date: new Date().toISOString().split('T')[0], end_date: "", insurance_price: "", cancelled: false, transferred: false, notes: "" });
      setPayments([]);
      setCarDataFetched(false);
    }

    fetchCompanies();
  }, [open]);

  // Search clients
  useEffect(() => {
    if (clientSearch.length >= 2) {
      searchClients(clientSearch);
    } else {
      setClients([]);
    }
  }, [clientSearch]);

  // Load client cars when client selected
  useEffect(() => {
    if (selectedClient) {
      fetchClientCars(selectedClient.id);
    }
  }, [selectedClient]);

  // Auto-set end date based on start date
  useEffect(() => {
    if (policy.start_date) {
      const startDate = new Date(policy.start_date);
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      setPolicy(p => ({ ...p, end_date: endDate.toISOString().split('T')[0] }));
    }
  }, [policy.start_date]);

  // Persist draft while the wizard is open (so tab switching never loses progress)
  useEffect(() => {
    if (!open) return;

    const draft: PolicyWizardDraft = {
      currentStep,
      clientSearch,
      selectedClient,
      createNewClient,
      newClient,
      selectedCar,
      createNewCar,
      newCar,
      carDataFetched,
      policy,
      payments,
    };

    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(POLICY_WIZARD_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // ignore
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [
    open,
    currentStep,
    clientSearch,
    selectedClient,
    createNewClient,
    newClient,
    selectedCar,
    createNewCar,
    newCar,
    carDataFetched,
    policy,
    payments,
  ]);

  const searchClients = async (query: string) => {
    setLoadingClients(true);
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, id_number, file_number, phone_number, less_than_24')
      .is('deleted_at', null)
      .or(`full_name.ilike.%${query}%,id_number.ilike.%${query}%,file_number.ilike.%${query}%,phone_number.ilike.%${query}%`)
      .limit(10);
    
    setLoadingClients(false);
    if (!error && data) {
      setClients(data);
    }
  };

  const fetchClientCars = async (clientId: string) => {
    setLoadingCars(true);
    const { data, error } = await supabase
      .from('cars')
      .select('*')
      .eq('client_id', clientId)
      .is('deleted_at', null);
    
    setLoadingCars(false);
    if (!error && data) {
      setClientCars(data);
    }
  };

  const fetchCompanies = async () => {
    setLoadingCompanies(true);
    const { data, error } = await supabase
      .from('insurance_companies')
      .select('*')
      .eq('active', true)
      .order('name');
    
    setLoadingCompanies(false);
    if (!error && data) {
      setCompanies(data);
    }
  };

  const fetchCarData = async () => {
    if (!newCar.car_number) {
      toast({ title: "خطأ", description: "الرجاء إدخال رقم السيارة", variant: "destructive" });
      return;
    }

    setFetchingCarData(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-vehicle', {
        body: { car_number: newCar.car_number }
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: "خطأ", description: data.error, variant: "destructive" });
        return;
      }

      // Access nested data from response { success: true, data: vehicleData }
      const vehicleData = data.data || data;

      setNewCar({
        ...newCar,
        manufacturer_name: vehicleData.manufacturer_name || "",
        model: vehicleData.model || "",
        year: vehicleData.year?.toString() || "",
        color: vehicleData.color || "",
        license_expiry: vehicleData.license_expiry || "",
        car_type: vehicleData.car_type || "car",
      });
      setCarDataFetched(true);
      toast({ title: "تم جلب البيانات تلقائياً", variant: "default" });
    } catch (error) {
      toast({ title: "خطأ", description: "لم يتم العثور على مركبة بهذا الرقم", variant: "destructive" });
    } finally {
      setFetchingCarData(false);
    }
  };

  const [fetchingCarPrice, setFetchingCarPrice] = useState(false);

  const fetchCarPrice = async () => {
    if (!newCar.manufacturer_name || !newCar.year) {
      toast({ title: "خطأ", description: "الرجاء إدخال بيانات السيارة أولاً (الشركة، السنة)", variant: "destructive" });
      return;
    }

    setFetchingCarPrice(true);
    try {
      console.log('Fetching car price for:', newCar.manufacturer_name, newCar.model, newCar.year);
      
      const { data, error } = await supabase.functions.invoke('fetch-car-price', {
        body: { 
          manufacturer: newCar.manufacturer_name,
          model: newCar.model || '',
          year: parseInt(newCar.year)
        }
      });

      console.log('Car price response:', data, error);

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data?.error) {
        toast({ title: "خطأ", description: data.error, variant: "destructive" });
        return;
      }

      // Handle both response formats
      const priceData = data?.data || data;
      console.log('Price data extracted:', priceData);
      
      if (priceData?.price && priceData.price > 0) {
        setNewCar(prev => ({ ...prev, car_value: priceData.price.toString() }));
        toast({ title: "تم جلب سعر السيارة", description: `₪ ${priceData.price.toLocaleString()}` });
      } else if (data?.found === false) {
        toast({ title: "تنبيه", description: "لم يتم العثور على سعر لهذه السيارة في قاعدة البيانات", variant: "default" });
      } else {
        toast({ title: "تنبيه", description: "لم يتم العثور على سعر لهذه السيارة", variant: "default" });
      }
    } catch (error: any) {
      console.error('Fetch car price error:', error);
      toast({ title: "خطأ", description: error?.message || "فشل في جلب سعر السيارة", variant: "destructive" });
    } finally {
      setFetchingCarPrice(false);
    }
  };

  const addPayment = () => {
    setPayments([
      ...payments,
      {
        id: crypto.randomUUID(),
        payment_type: "cash",
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
        refused: false,
      },
    ]);
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter(p => p.id !== id));
  };

  const updatePayment = (id: string, field: string, value: any) => {
    setPayments(payments.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedClient || (createNewClient && newClient.full_name && newClient.id_number);
      case 2:
        return selectedCar || (createNewCar && newCar.car_number);
      case 3:
        return policy.policy_type_parent && policy.company_id && policy.start_date && policy.end_date && policy.insurance_price;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      let clientId = selectedClient?.id;
      let carId = selectedCar?.id;

      // Create client if new
      if (createNewClient && !clientId) {
        const { data: newClientData, error: clientError } = await supabase
          .from('clients')
          .insert({
            full_name: newClient.full_name,
            id_number: newClient.id_number,
            file_number: newClient.file_number || null,
            phone_number: newClient.phone_number || null,
            less_than_24: newClient.less_than_24,
            notes: newClient.notes || null,
          })
          .select()
          .single();

        if (clientError) {
          if (clientError.code === '23505') {
            toast({ title: "خطأ", description: "رقم الهوية أو رقم الملف موجود مسبقاً", variant: "destructive" });
          } else {
            throw clientError;
          }
          return;
        }
        clientId = newClientData.id;
      }

      // Create car if new
      if (createNewCar && !carId && clientId) {
        const { data: newCarData, error: carError } = await supabase
          .from('cars')
          .insert({
            car_number: newCar.car_number,
            client_id: clientId,
            manufacturer_name: newCar.manufacturer_name || null,
            model: newCar.model || null,
            year: newCar.year ? parseInt(newCar.year) : null,
            color: newCar.color || null,
            car_type: newCar.car_type as any,
            car_value: newCar.car_value ? parseFloat(newCar.car_value) : null,
            license_expiry: newCar.license_expiry || null,
          })
          .select()
          .single();

        if (carError) {
          if (carError.code === '23505') {
            toast({ title: "خطأ", description: "رقم السيارة موجود مسبقاً", variant: "destructive" });
          } else {
            throw carError;
          }
          return;
        }
        carId = newCarData.id;
      }

      if (!clientId || !carId) {
        toast({ title: "خطأ", description: "الرجاء اختيار العميل والسيارة", variant: "destructive" });
        return;
      }

      // Determine is_under_24
      const isUnder24 = createNewClient ? newClient.less_than_24 : selectedClient?.less_than_24;

      // Create policy
      const { data: policyData, error: policyError } = await supabase
        .from('policies')
        .insert({
          client_id: clientId,
          car_id: carId,
          company_id: policy.company_id,
          policy_type_parent: policy.policy_type_parent as any,
          policy_type_child: policy.policy_type_child ? policy.policy_type_child as any : null,
          start_date: policy.start_date,
          end_date: policy.end_date,
          insurance_price: parseFloat(policy.insurance_price),
          is_under_24: isUnder24 || false,
          cancelled: policy.cancelled,
          transferred: policy.transferred,
          notes: policy.notes || null,
          profit: 0,
          payed_for_company: policy.policy_type_parent === 'ELZAMI' ? parseFloat(policy.insurance_price) : 0,
        })
        .select()
        .single();

      if (policyError) throw policyError;

      // Create payments
      if (payments.length > 0) {
        const { error: paymentsError } = await supabase
          .from('policy_payments')
          .insert(
            payments.map(p => ({
              policy_id: policyData.id,
              payment_type: p.payment_type as any,
              amount: p.amount,
              payment_date: p.payment_date,
              cheque_number: p.cheque_number || null,
              refused: p.refused,
            }))
          );

        if (paymentsError) throw paymentsError;
      }

      toast({ title: "تم الحفظ بنجاح", description: "تم إنشاء الوثيقة بنجاح" });
      clearDraft();
      onOpenChange(false);
      onComplete?.(policyData.id);
    } catch (error: any) {
      console.error('Error creating policy:', error);
      toast({ title: "خطأ", description: error.message || "حدث خطأ أثناء الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    // Prevent losing the wizard when switching browser tabs (focus/visibility loss)
    if (!nextOpen && (document.visibilityState === "hidden" || !document.hasFocus())) {
      return;
    }

    // Explicit user close → clear draft
    if (!nextOpen) {
      clearDraft();
    }

    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-2xl overflow-y-auto"
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>إضافة وثيقة جديدة</SheetTitle>
        </SheetHeader>

        {/* Steps indicator */}
        <div className="flex justify-between mt-6 mb-8">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                  currentStep === step.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : currentStep > step.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {currentStep > step.id ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <step.icon className="h-5 w-5" />
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  "h-0.5 w-12 mx-2",
                  currentStep > step.id ? "bg-primary" : "bg-muted-foreground/30"
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {/* Step 1: Client */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">اختر أو أنشئ عميل</h3>
              
              {!createNewClient ? (
                <>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالاسم، رقم الهوية، الهاتف..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="pr-9"
                    />
                  </div>

                  {loadingClients && (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  )}

                  {clients.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {clients.map(client => (
                        <Card
                          key={client.id}
                          className={cn(
                            "p-3 cursor-pointer transition-colors",
                            selectedClient?.id === client.id ? "border-primary bg-primary/5" : "hover:bg-secondary/50"
                          )}
                          onClick={() => setSelectedClient(client)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{client.full_name}</p>
                              <p className="text-sm text-muted-foreground">{client.id_number} • {client.phone_number}</p>
                            </div>
                            {selectedClient?.id === client.id && (
                              <Check className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setCreateNewClient(true)}
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    إنشاء عميل جديد
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" onClick={() => setCreateNewClient(false)}>
                    ← العودة للبحث
                  </Button>
                  
                  <div className="grid gap-4">
                    <div>
                      <Label>الاسم الكامل *</Label>
                      <Input
                        value={newClient.full_name}
                        onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
                        placeholder="أدخل اسم العميل"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>رقم الهوية *</Label>
                        <Input
                          value={newClient.id_number}
                          onChange={(e) => setNewClient({ ...newClient, id_number: e.target.value })}
                          placeholder="رقم الهوية"
                        />
                      </div>
                      <div>
                        <Label>رقم الملف</Label>
                        <Input
                          value={newClient.file_number}
                          onChange={(e) => setNewClient({ ...newClient, file_number: e.target.value })}
                          placeholder="رقم الملف"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>الهاتف</Label>
                      <Input
                        value={newClient.phone_number}
                        onChange={(e) => setNewClient({ ...newClient, phone_number: e.target.value })}
                        placeholder="رقم الهاتف"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="less_than_24"
                        checked={newClient.less_than_24}
                        onCheckedChange={(checked) => setNewClient({ ...newClient, less_than_24: checked as boolean })}
                      />
                      <Label htmlFor="less_than_24">أقل من 24 سنة</Label>
                    </div>
                    <div>
                      <Label>ملاحظات</Label>
                      <Textarea
                        value={newClient.notes}
                        onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                        placeholder="ملاحظات إضافية"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Car */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">اختر أو أضف سيارة</h3>

              {loadingCars ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : !createNewCar ? (
                <>
                  {clientCars.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {clientCars.map(car => (
                        <Card
                          key={car.id}
                          className={cn(
                            "p-3 cursor-pointer transition-colors",
                            selectedCar?.id === car.id ? "border-primary bg-primary/5" : "hover:bg-secondary/50"
                          )}
                          onClick={() => setSelectedCar(car)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-mono font-medium" dir="ltr">{car.car_number}</p>
                              <p className="text-sm text-muted-foreground">
                                {car.manufacturer_name} {car.model} {car.year}
                              </p>
                            </div>
                            {selectedCar?.id === car.id && (
                              <Check className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {clientCars.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      لا توجد سيارات مسجلة لهذا العميل
                    </p>
                  )}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setCreateNewCar(true)}
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة سيارة جديدة
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" onClick={() => setCreateNewCar(false)}>
                    ← العودة لاختيار سيارة
                  </Button>

                  <div className="flex gap-2">
                    <Input
                      value={newCar.car_number}
                      onChange={(e) => {
                        setNewCar({ ...newCar, car_number: e.target.value });
                        setCarDataFetched(false);
                      }}
                      placeholder="رقم السيارة"
                      className="flex-1"
                    />
                    <Button onClick={fetchCarData} disabled={fetchingCarData}>
                      {fetchingCarData ? <Loader2 className="h-4 w-4 animate-spin" /> : "جلب البيانات"}
                    </Button>
                  </div>

                  {carDataFetched && (
                    <Badge className="bg-success/10 text-success border-success/20">
                      تم جلب البيانات تلقائياً
                    </Badge>
                  )}

                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>الشركة المصنعة</Label>
                        <Input
                          value={newCar.manufacturer_name}
                          onChange={(e) => setNewCar({ ...newCar, manufacturer_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>الموديل</Label>
                        <Input
                          value={newCar.model}
                          onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>سنة الصنع</Label>
                        <Input
                          type="number"
                          value={newCar.year}
                          onChange={(e) => setNewCar({ ...newCar, year: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>اللون</Label>
                        <Input
                          value={newCar.color}
                          onChange={(e) => setNewCar({ ...newCar, color: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>قيمة السيارة</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={newCar.car_value}
                            onChange={(e) => setNewCar({ ...newCar, car_value: e.target.value })}
                            placeholder="₪"
                            className="flex-1"
                          />
                          <Button 
                            type="button"
                            variant="outline" 
                            size="icon"
                            onClick={fetchCarPrice} 
                            disabled={fetchingCarPrice || !newCar.manufacturer_name || !newCar.year}
                            title="جلب السعر"
                          >
                            {fetchingCarPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : "₪"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>نوع السيارة</Label>
                        <Select value={newCar.car_type} onValueChange={(v) => setNewCar({ ...newCar, car_type: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CAR_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>انتهاء الرخصة</Label>
                        <Input
                          type="date"
                          value={newCar.license_expiry}
                          onChange={(e) => setNewCar({ ...newCar, license_expiry: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Policy */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">تفاصيل الوثيقة</h3>

              {companies.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-destructive mb-4">لا توجد شركات تأمين. الرجاء إضافة شركة أولاً</p>
                  <Button variant="outline" onClick={() => window.location.href = '/companies'}>
                    إضافة شركة تأمين
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>نوع الوثيقة *</Label>
                      <Select
                        value={policy.policy_type_parent}
                        onValueChange={(v) => setPolicy({ ...policy, policy_type_parent: v, policy_type_child: "" })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="اختر النوع" />
                        </SelectTrigger>
                        <SelectContent>
                          {POLICY_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {POLICY_TYPES.find(t => t.value === policy.policy_type_parent)?.hasChild && (
                      <div>
                        <Label>النوع الفرعي</Label>
                        <Select
                          value={policy.policy_type_child}
                          onValueChange={(v) => setPolicy({ ...policy, policy_type_child: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="اختر" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="THIRD">طرف ثالث</SelectItem>
                            <SelectItem value="FULL">شامل</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>شركة التأمين *</Label>
                    <Select value={policy.company_id} onValueChange={(v) => setPolicy({ ...policy, company_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الشركة" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>تاريخ البداية *</Label>
                      <Input
                        type="date"
                        value={policy.start_date}
                        onChange={(e) => setPolicy({ ...policy, start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>تاريخ النهاية *</Label>
                      <Input
                        type="date"
                        value={policy.end_date}
                        onChange={(e) => setPolicy({ ...policy, end_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>السعر (₪) *</Label>
                    <Input
                      type="number"
                      value={policy.insurance_price}
                      onChange={(e) => setPolicy({ ...policy, insurance_price: e.target.value })}
                      placeholder="أدخل السعر"
                    />
                  </div>

                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="cancelled"
                        checked={policy.cancelled}
                        onCheckedChange={(c) => setPolicy({ ...policy, cancelled: c as boolean })}
                      />
                      <Label htmlFor="cancelled">ملغاة</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="transferred"
                        checked={policy.transferred}
                        onCheckedChange={(c) => setPolicy({ ...policy, transferred: c as boolean })}
                      />
                      <Label htmlFor="transferred">محوّلة</Label>
                    </div>
                  </div>

                  <div>
                    <Label>ملاحظات</Label>
                    <Textarea
                      value={policy.notes}
                      onChange={(e) => setPolicy({ ...policy, notes: e.target.value })}
                      placeholder="ملاحظات إضافية"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Payments */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">الدفعات (اختياري)</h3>
                <Button variant="outline" size="sm" onClick={addPayment}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة دفعة
                </Button>
              </div>

              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  لم تتم إضافة دفعات. يمكنك إضافتها لاحقاً.
                </p>
              ) : (
                <div className="space-y-4">
                  {payments.map((payment, index) => (
                    <Card key={payment.id} className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-sm font-medium">دفعة {index + 1}</span>
                        <Button variant="ghost" size="icon" onClick={() => removePayment(payment.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>نوع الدفع</Label>
                            <Select
                              value={payment.payment_type}
                              onValueChange={(v) => updatePayment(payment.id, 'payment_type', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_TYPES.map(t => (
                                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>المبلغ</Label>
                            <Input
                              type="number"
                              value={payment.amount || ""}
                              onChange={(e) => updatePayment(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="₪"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>التاريخ</Label>
                            <Input
                              type="date"
                              value={payment.payment_date}
                              onChange={(e) => updatePayment(payment.id, 'payment_date', e.target.value)}
                            />
                          </div>
                          {payment.payment_type === 'cheque' && (
                            <div>
                              <Label>رقم الشيك</Label>
                              <Input
                                value={payment.cheque_number || ""}
                                onChange={(e) => updatePayment(payment.id, 'cheque_number', e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`refused-${payment.id}`}
                            checked={payment.refused}
                            onCheckedChange={(c) => updatePayment(payment.id, 'refused', c)}
                          />
                          <Label htmlFor={`refused-${payment.id}`}>راجع / مرفوض</Label>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep > 1) {
                setCurrentStep(currentStep - 1);
                return;
              }
              clearDraft();
              onOpenChange(false);
            }}
          >
            {currentStep === 1 ? "إلغاء" : "السابق"}
          </Button>
          
          {currentStep < 4 ? (
            <Button onClick={() => setCurrentStep(currentStep + 1)} disabled={!canProceed()}>
              التالي
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={saving || !canProceed()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              حفظ الكل
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}