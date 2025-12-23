import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBranches } from "@/hooks/useBranches";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Check, Car, User, FileText, CreditCard, Loader2, X, AlertCircle, CheckCircle, Building2, Users, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { digitsOnly, isValidIsraeliId, isValidPhoneNumber10 } from "@/lib/validation";
import { calculatePolicyProfit } from "@/lib/pricingCalculator";
import { TranzilaPaymentModal } from "@/components/payments/TranzilaPaymentModal";

interface PolicyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (policyId: string) => void;
  onSaved?: () => void;
  defaultBrokerId?: string;
  defaultBrokerDirection?: 'from_broker' | 'to_broker';
  preselectedClientId?: string;
}

interface InsuranceCategory {
  id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  mode: 'FULL' | 'LIGHT';
  is_active: boolean;
  is_default: boolean;
}

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  file_number: string | null;
  phone_number: string | null;
  less_than_24: boolean | null;
  broker_id: string | null;
}

interface CarRecord {
  id: string;
  car_number: string;
  manufacturer_name: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  car_type: string | null;
  car_value: number | null;
  client_id: string;
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

interface PaymentLine {
  id: string;
  payment_type: string;
  amount: number;
  payment_date: string;
  cheque_number?: string;
  refused: boolean;
  tranzila_paid?: boolean; // Track if paid via Tranzila
  tranzila_transaction_id?: string;
}

interface ValidationErrors {
  [key: string]: string;
}

const STEPS_FULL = [
  { id: 1, title: "العميل", icon: User },
  { id: 2, title: "السيارة", icon: Car },
  { id: 3, title: "الوثيقة", icon: FileText },
  { id: 4, title: "الدفعات", icon: CreditCard },
];

const STEPS_LIGHT = [
  { id: 1, title: "العميل", icon: User },
  { id: 2, title: "الوثيقة", icon: FileText },
  { id: 3, title: "الدفعات", icon: CreditCard },
];

// Legacy policy types for car insurance categories
const CAR_POLICY_TYPES = [
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

const POLICY_WIZARD_DRAFT_KEY = "abcrm:policyWizardDraft:v2";

export function PolicyWizard({ open, onOpenChange, onComplete, onSaved, defaultBrokerId, defaultBrokerDirection, preselectedClientId }: PolicyWizardProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, isAdmin, branchId: userBranchId } = useAuth();
  const { branches } = useBranches();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Branch selection (admin only, workers use their branch)
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  
  // Broker selection for policy
  const [policyBrokerId, setPolicyBrokerId] = useState<string>(defaultBrokerId || '');
  const [brokerDirection, setBrokerDirection] = useState<'from_broker' | 'to_broker' | ''>(defaultBrokerDirection || '');

  // Insurance Categories
  const [categories, setCategories] = useState<InsuranceCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<InsuranceCategory | null>(null);
  
  // Computed: STEPS based on category mode
  const isLightMode = selectedCategory?.mode === 'LIGHT';
  const STEPS = isLightMode ? STEPS_LIGHT : STEPS_FULL;

  // Get the effective branch ID (admin selected or worker's branch)
  const effectiveBranchId = isAdmin ? selectedBranchId : userBranchId;

  // Step 1: Client
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [createNewClient, setCreateNewClient] = useState(false);
  const [newClient, setNewClient] = useState({
    full_name: "",
    id_number: "",
    phone_number: "",
    less_than_24: false,
    notes: "",
    broker_id: defaultBrokerId || "",
  });
  const [loadingClients, setLoadingClients] = useState(false);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Step 2: Car
  const [clientCars, setClientCars] = useState<CarRecord[]>([]);
  const [selectedCar, setSelectedCar] = useState<CarRecord | null>(null);
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
  const [existingCar, setExistingCar] = useState<CarRecord | null>(null);
  const [carConflict, setCarConflict] = useState<string | null>(null);

  // Step 3: Policy - Calculate initial end date
  const getInitialEndDate = () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(endDate.getDate() - 1);
    return endDate.toISOString().split('T')[0];
  };

  const [companies, setCompanies] = useState<Company[]>([]);
  const [policy, setPolicy] = useState({
    policy_type_parent: "",
    policy_type_child: "",
    company_id: "",
    start_date: new Date().toISOString().split('T')[0],
    end_date: getInitialEndDate(),
    insurance_price: "",
    cancelled: false,
    transferred: false,
    notes: "",
  });
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Step 4: Payments
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [fetchingCarPrice, setFetchingCarPrice] = useState(false);
  const [paymentValidationError, setPaymentValidationError] = useState<string | null>(null);
  
  // Tranzila state
  const [tranzilaEnabled, setTranzilaEnabled] = useState(false);
  const [tranzilaModalOpen, setTranzilaModalOpen] = useState(false);
  const [activeTranzilaPaymentId, setActiveTranzilaPaymentId] = useState<string | null>(null);
  const [tempPolicyId, setTempPolicyId] = useState<string | null>(null);

  // Files to upload - Two categories
  const [insuranceFiles, setInsuranceFiles] = useState<File[]>([]); // ملفات التأمين - للعميل
  const [crmFiles, setCrmFiles] = useState<File[]>([]); // ملفات النظام - هوية، صور سيارة
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Payment validation computed values
  const insurancePrice = parseFloat(policy.insurance_price) || 0;
  const totalPaidPayments = payments.filter(p => !p.refused).reduce((sum, p) => sum + (p.amount || 0), 0);
  const remainingToPay = insurancePrice - totalPaidPayments;
  const paymentsExceedPrice = totalPaidPayments > insurancePrice && insurancePrice > 0;
  // Check if there are any visa payments that haven't been paid via Tranzila
  const hasUnpaidVisaPayment = payments.some(p => p.payment_type === 'visa' && !p.tranzila_paid && !p.refused);

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(POLICY_WIZARD_DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const writeDraftNow = (overrides: Partial<Record<string, unknown>>) => {
    if (!open) return;
    const draft = {
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
      ...overrides,
    };
    try {
      sessionStorage.setItem(POLICY_WIZARD_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setSelectedClient(null);
    setSelectedCar(null);
    setSelectedCategory(null);
    setCreateNewClient(false);
    setCreateNewCar(false);
    setNewClient({ full_name: "", id_number: "", phone_number: "", less_than_24: false, notes: "", broker_id: defaultBrokerId || "" });
    setNewCar({ car_number: "", manufacturer_name: "", model: "", year: "", color: "", car_type: "car", car_value: "", license_expiry: "" });
    setPolicy({ policy_type_parent: "", policy_type_child: "", company_id: "", start_date: new Date().toISOString().split('T')[0], end_date: getInitialEndDate(), insurance_price: "", cancelled: false, transferred: false, notes: "" });
    setPayments([]);
    setInsuranceFiles([]);
    setCrmFiles([]);
    setCarDataFetched(false);
    setExistingCar(null);
    setCarConflict(null);
    setErrors({});
    setPolicyBrokerId(defaultBrokerId || '');
    setBrokerDirection(defaultBrokerDirection || '');
  };

  // Fetch insurance categories
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
      
      // Set default category
      const defaultCat = typedCategories.find(c => c.is_default);
      if (defaultCat && !selectedCategory) {
        setSelectedCategory(defaultCat);
        // If FULL mode, set policy_type_parent to slug
        if (defaultCat.mode === 'FULL') {
          setPolicy(p => ({ ...p, policy_type_parent: defaultCat.slug }));
          fetchCompanies(defaultCat.slug);
        }
      }
    }
  };

  // Load data on open
  useEffect(() => {
    if (!open) return;
    
    // Set default branch (first branch for admin, or user's branch for worker)
    if (isAdmin && branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    } else if (!isAdmin && userBranchId) {
      setSelectedBranchId(userBranchId);
    }
    
    // Try to restore draft
    try {
      const draft = sessionStorage.getItem(POLICY_WIZARD_DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        setCurrentStep(parsed.currentStep || 1);
        setClientSearch(parsed.clientSearch || "");
        setSelectedClient(parsed.selectedClient || null);
        setCreateNewClient(parsed.createNewClient || false);
        setNewClient(parsed.newClient || { full_name: "", id_number: "", phone_number: "", less_than_24: false, notes: "", broker_id: defaultBrokerId || "" });
        setSelectedCar(parsed.selectedCar || null);
        setCreateNewCar(parsed.createNewCar || false);
        setNewCar(parsed.newCar || { car_number: "", manufacturer_name: "", model: "", year: "", color: "", car_type: "car", car_value: "", license_expiry: "" });
        setCarDataFetched(parsed.carDataFetched || false);
        setPolicy(parsed.policy || { policy_type_parent: "", policy_type_child: "", company_id: "", start_date: new Date().toISOString().split('T')[0], end_date: "", insurance_price: "", cancelled: false, transferred: false, notes: "" });
        setPayments(parsed.payments || []);
      } else {
        resetForm();
      }
    } catch {
      resetForm();
    }

    // Fetch companies based on restored policy type if available
    const draft = sessionStorage.getItem(POLICY_WIZARD_DRAFT_KEY);
    if (draft) {
      const parsed = JSON.parse(draft);
      if (parsed.policy?.policy_type_parent) {
        fetchCompanies(parsed.policy.policy_type_parent);
      }
    }
    fetchBrokers();
    fetchCategories();
    checkTranzilaEnabled();
  }, [open, defaultBrokerId, branches, isAdmin, userBranchId]);

  // Re-fetch categories when opening
  useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open]);

  // Handle preselected client
  useEffect(() => {
    if (open && preselectedClientId && !selectedClient) {
      const fetchPreselectedClient = async () => {
        const { data } = await supabase
          .from('clients')
          .select('id, full_name, id_number, file_number, phone_number, less_than_24, broker_id')
          .eq('id', preselectedClientId)
          .single();
        if (data) {
          setSelectedClient(data);
          setCreateNewClient(false);
        }
      };
      fetchPreselectedClient();
    }
  }, [open, preselectedClientId]);

  // Check if Tranzila is enabled
  const checkTranzilaEnabled = async () => {
    try {
      const { data } = await supabase
        .from('payment_settings')
        .select('is_enabled')
        .eq('provider', 'tranzila')
        .single();
      setTranzilaEnabled(data?.is_enabled || false);
    } catch {
      setTranzilaEnabled(false);
    }
  };

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

  // Auto-set end date based on start date (1 year - 1 day)
  useEffect(() => {
    if (policy.start_date) {
      const startDate = new Date(policy.start_date);
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(endDate.getDate() - 1); // 1 year minus 1 day
      setPolicy(p => ({ ...p, end_date: endDate.toISOString().split('T')[0] }));
    }
  }, [policy.start_date]);

  // Calculate the allowed end date range (±3 days from auto-calculated)
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

  // Persist draft
  useEffect(() => {
    if (!open) return;
    const draft = {
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
      } catch {}
    }, 250);
    return () => window.clearTimeout(t);
  }, [open, currentStep, clientSearch, selectedClient, createNewClient, newClient, selectedCar, createNewCar, newCar, carDataFetched, policy, payments]);

  // Check for duplicate client by id_number
  useEffect(() => {
    if (!createNewClient) return;

    const id = digitsOnly(newClient.id_number);
    if (id.length !== 9 || !isValidIsraeliId(id)) return;

    const checkDuplicate = async () => {
      setCheckingDuplicate(true);
      const { data } = await supabase
        .from('clients')
        .select('id, full_name, id_number, file_number, phone_number, less_than_24, broker_id')
        .eq('id_number', id)
        .is('deleted_at', null)
        .maybeSingle();

      setCheckingDuplicate(false);

      if (data) {
        // Found existing client - auto-select it
        setSelectedClient(data);
        setCreateNewClient(false);
        // Clear the form fields since we found the client
        setNewClient(prev => ({
          ...prev,
          full_name: "",
          id_number: "",
          phone_number: "",
        }));
        setErrors({});
        writeDraftNow({ selectedClient: data, createNewClient: false, newClient: { full_name: "", id_number: "", phone_number: "", less_than_24: false, notes: "", broker_id: defaultBrokerId || "" } });
        toast({
          title: "تم العثور على عميل موجود",
          description: `${data.full_name} - ${data.id_number}`,
        });
      }
    };

    const timer = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timer);
  }, [newClient.id_number, createNewClient]);

  // Check for existing car by car_number
  useEffect(() => {
    if (!createNewCar || !newCar.car_number || newCar.car_number.length < 5) {
      setExistingCar(null);
      setCarConflict(null);
      return;
    }
    
    const checkExistingCar = async () => {
      const { data } = await supabase
        .from('cars')
        .select('*, clients(full_name)')
        .eq('car_number', newCar.car_number)
        .is('deleted_at', null)
        .maybeSingle();
      
      if (data) {
        const clientId = selectedClient?.id || (createNewClient ? null : null);
        
        if (data.client_id === clientId) {
          // Car belongs to this client - use it
          setExistingCar(data);
          setCarConflict(null);
        } else {
          // Car belongs to another client
          setExistingCar(null);
          setCarConflict(`هذه السيارة مسجلة على عميل آخر: ${(data as any).clients?.full_name || 'غير معروف'}`);
        }
      } else {
        setExistingCar(null);
        setCarConflict(null);
      }
    };
    
    const timer = setTimeout(checkExistingCar, 500);
    return () => clearTimeout(timer);
  }, [newCar.car_number, createNewCar, selectedClient]);

  const searchClients = async (query: string) => {
    setLoadingClients(true);
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, id_number, file_number, phone_number, less_than_24, broker_id')
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

  const fetchCompanies = async (policyType?: string) => {
    setLoadingCompanies(true);
    let query = supabase
      .from('insurance_companies')
      .select('*')
      .eq('active', true)
      .order('name');
    
    // Filter by category_parent if policy type is selected
    if (policyType) {
      query = query.eq('category_parent', policyType as any);
    }
    
    const { data, error } = await query;
    
    setLoadingCompanies(false);
    if (!error && data) {
      setCompanies(data);
      // Auto-select if only one company matches
      if (data.length === 1 && policyType) {
        setPolicy(p => ({ ...p, company_id: data[0].id }));
      }
    }
  };

  const fetchBrokers = async () => {
    const { data } = await supabase
      .from('brokers')
      .select('id, name')
      .order('name');
    
    if (data) {
      setBrokers(data);
    }
  };

  const fetchCarData = async () => {
    if (!newCar.car_number) {
      setErrors(e => ({ ...e, car_number: "الرجاء إدخال رقم السيارة" }));
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
      toast({ title: "تم جلب البيانات تلقائياً" });
    } catch {
      toast({ title: "خطأ", description: "لم يتم العثور على مركبة بهذا الرقم", variant: "destructive" });
    } finally {
      setFetchingCarData(false);
    }
  };

  const fetchCarPrice = async () => {
    if (!newCar.manufacturer_name || !newCar.year) {
      toast({ title: "خطأ", description: "الرجاء إدخال بيانات السيارة أولاً", variant: "destructive" });
      return;
    }

    setFetchingCarPrice(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-car-price', {
        body: { 
          manufacturer: newCar.manufacturer_name,
          model: newCar.model || '',
          year: parseInt(newCar.year)
        }
      });

      if (error) throw error;

      const priceData = data?.data || data;
      
      if (priceData?.price && priceData.price > 0) {
        setNewCar(prev => ({ ...prev, car_value: priceData.price.toString() }));
        toast({ title: "تم جلب سعر السيارة", description: `₪ ${priceData.price.toLocaleString()}` });
      } else {
        toast({ title: "تنبيه", description: "لم يتم العثور على سعر لهذه السيارة" });
      }
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب سعر السيارة", variant: "destructive" });
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
    const updatedPayments = payments.map(p => p.id === id ? { ...p, [field]: value } : p);
    setPayments(updatedPayments);
    
    // Validate total payments don't exceed insurance price
    const totalPaid = updatedPayments.filter(p => !p.refused).reduce((sum, p) => sum + (p.amount || 0), 0);
    const price = parseFloat(policy.insurance_price) || 0;
    if (totalPaid > price && price > 0) {
      setPaymentValidationError(`مجموع الدفعات (₪${totalPaid.toLocaleString()}) يتجاوز سعر التأمين (₪${price.toLocaleString()})`);
    } else {
      setPaymentValidationError(null);
    }
  };

  // Handle Visa payment - creates policy first if needed, then opens Tranzila
  const handleVisaPayment = async (payment: PaymentLine) => {
    if (!payment.amount || payment.amount <= 0) {
      toast({ title: "خطأ", description: "الرجاء إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }

    // We need to save everything first to get a policy ID
    if (!tempPolicyId) {
      // Validate before creating
      if (!validateStep(currentStep)) return;
      
      setSaving(true);
      try {
        let clientId = selectedClient?.id;
        let carId = selectedCar?.id || existingCar?.id;

        // Create client if new
        if (createNewClient && !clientId) {
          const { data: fileNumData } = await supabase.rpc('generate_file_number');
          const { data: newClientData, error: clientError } = await supabase
            .from('clients')
            .insert({
              full_name: newClient.full_name.trim(),
              id_number: newClient.id_number.trim(),
              file_number: fileNumData || null,
              phone_number: newClient.phone_number.trim() || null,
              less_than_24: newClient.less_than_24,
              notes: newClient.notes.trim() || null,
              broker_id: newClient.broker_id || defaultBrokerId || null,
              branch_id: effectiveBranchId || null,
            })
            .select()
            .single();

          if (clientError) throw clientError;
          clientId = newClientData.id;
        }

        // Create car if new
        if (createNewCar && !carId && clientId) {
          const { data: newCarData, error: carError } = await supabase
            .from('cars')
            .insert({
              car_number: newCar.car_number.trim(),
              client_id: clientId,
              manufacturer_name: newCar.manufacturer_name.trim() || null,
              model: newCar.model.trim() || null,
              year: newCar.year ? parseInt(newCar.year) : null,
              color: newCar.color.trim() || null,
              car_type: newCar.car_type as any,
              car_value: newCar.car_value ? parseFloat(newCar.car_value) : null,
              license_expiry: newCar.license_expiry || null,
              branch_id: effectiveBranchId || null,
            })
            .select()
            .single();

          if (carError) throw carError;
          carId = newCarData.id;
        }

        if (!clientId || !carId) {
          toast({ title: "خطأ", description: "الرجاء اختيار العميل والسيارة", variant: "destructive" });
          return;
        }

        // Calculate profit
        const carForCalc = selectedCar || existingCar || {
          car_type: newCar.car_type,
          car_value: newCar.car_value ? parseFloat(newCar.car_value) : null,
          year: newCar.year ? parseInt(newCar.year) : null,
        };
        const clientForCalc = selectedClient || { less_than_24: newClient.less_than_24 };
        const ageBand: 'UNDER_24' | 'UP_24' = clientForCalc.less_than_24 ? 'UNDER_24' : 'UP_24';
        
        const profitResult = await calculatePolicyProfit({
          policyTypeParent: policy.policy_type_parent as any,
          policyTypeChild: policy.policy_type_child as any || null,
          companyId: policy.company_id,
          carType: (carForCalc.car_type || 'car') as any,
          ageBand,
          carValue: carForCalc.car_value,
          carYear: carForCalc.year,
          insurancePrice: parseFloat(policy.insurance_price),
        });

        // Create policy
        const { data: policyData, error: policyError } = await supabase
          .from('policies')
.insert({
            created_by_admin_id: user?.id || null,
            client_id: clientId,
            car_id: carId,
            company_id: policy.company_id,
            policy_type_parent: policy.policy_type_parent as any,
            policy_type_child: policy.policy_type_child as any || null,
            start_date: policy.start_date,
            end_date: policy.end_date,
            insurance_price: parseFloat(policy.insurance_price),
            cancelled: policy.cancelled,
            transferred: policy.transferred,
            notes: policy.notes.trim() || null,
            is_under_24: clientForCalc.less_than_24 || false,
            payed_for_company: profitResult.companyPayment,
            profit: profitResult.profit,
            branch_id: effectiveBranchId || null,
            broker_id: policyBrokerId && policyBrokerId !== 'none' ? policyBrokerId : null,
            broker_direction: brokerDirection && policyBrokerId && policyBrokerId !== 'none' ? brokerDirection as any : null,
          })
          .select()
          .single();

        if (policyError) throw policyError;
        
        setTempPolicyId(policyData.id);
        toast({ title: "تم الحفظ", description: "تم حفظ الوثيقة، جاري فتح الدفع..." });
        
        // Now open Tranzila modal
        setActiveTranzilaPaymentId(payment.id);
        setTranzilaModalOpen(true);
        
      } catch (error) {
        console.error('Error creating policy for visa payment:', error);
        toast({ title: "خطأ", description: "فشل في حفظ الوثيقة", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    } else {
      // Policy already created, just open modal
      setActiveTranzilaPaymentId(payment.id);
      setTranzilaModalOpen(true);
    }
  };

  const handleTranzilaSuccess = () => {
    if (activeTranzilaPaymentId) {
      setPayments(payments.map(p => 
        p.id === activeTranzilaPaymentId 
          ? { ...p, tranzila_paid: true } 
          : p
      ));
    }
    setActiveTranzilaPaymentId(null);
    toast({ title: "تم الدفع", description: "تم الدفع بنجاح عبر البطاقة" });
  };

  const handleTranzilaFailure = () => {
    setActiveTranzilaPaymentId(null);
  };

  const getActiveTranzilaPayment = () => {
    return payments.find(p => p.id === activeTranzilaPaymentId);
  };

  const validateStep = (step: number): boolean => {
    const newErrors: ValidationErrors = {};
    
    // For LIGHT mode, step mapping is different
    // LIGHT: step 1 = client, step 2 = policy, step 3 = payments
    // FULL: step 1 = client, step 2 = car, step 3 = policy, step 4 = payments
    
    if (isLightMode) {
      switch (step) {
        case 1:
          if (!selectedClient && createNewClient) {
            if (!newClient.full_name.trim()) newErrors.full_name = "الاسم مطلوب";
            const id = digitsOnly(newClient.id_number);
            if (!id) newErrors.id_number = "رقم الهوية مطلوب";
            else if (id.length !== 9) newErrors.id_number = "رقم الهوية يجب أن يكون 9 أرقام";
            else if (!isValidIsraeliId(id)) newErrors.id_number = "رقم الهوية غير صحيح";
            const phone = digitsOnly(newClient.phone_number);
            if (phone.length > 0 && !isValidPhoneNumber10(phone)) {
              newErrors.phone_number = "رقم الهاتف يجب أن يكون 10 أرقام";
            }
          }
          if (!selectedClient && !createNewClient) {
            newErrors.client = "الرجاء اختيار عميل أو إنشاء عميل جديد";
          }
          break;
        case 2: // Policy step for LIGHT mode
          if (!policy.start_date) newErrors.start_date = "تاريخ البداية مطلوب";
          if (!policy.end_date) newErrors.end_date = "تاريخ النهاية مطلوب";
          if (!policy.insurance_price) newErrors.insurance_price = "السعر مطلوب";
          if (policy.insurance_price && parseFloat(policy.insurance_price) <= 0) {
            newErrors.insurance_price = "السعر يجب أن يكون أكبر من صفر";
          }
          break;
      }
    } else {
      // FULL mode (original logic)
      switch (step) {
        case 1:
          if (!selectedClient && createNewClient) {
            if (!newClient.full_name.trim()) newErrors.full_name = "الاسم مطلوب";
            const id = digitsOnly(newClient.id_number);
            if (!id) newErrors.id_number = "رقم الهوية مطلوب";
            else if (id.length !== 9) newErrors.id_number = "رقم الهوية يجب أن يكون 9 أرقام";
            else if (!isValidIsraeliId(id)) newErrors.id_number = "رقم الهوية غير صحيح";
            const phone = digitsOnly(newClient.phone_number);
            if (phone.length > 0 && !isValidPhoneNumber10(phone)) {
              newErrors.phone_number = "رقم الهاتف يجب أن يكون 10 أرقام";
            }
          }
          if (!selectedClient && !createNewClient) {
            newErrors.client = "الرجاء اختيار عميل أو إنشاء عميل جديد";
          }
          break;
        case 2:
          if (!selectedCar && createNewCar) {
            if (!newCar.car_number.trim()) newErrors.car_number = "رقم السيارة مطلوب";
            if (carConflict) newErrors.car_number = carConflict;
          }
          if (!selectedCar && !createNewCar && !existingCar) {
            newErrors.car = "الرجاء اختيار سيارة أو إضافة سيارة جديدة";
          }
          break;
        case 3:
          if (!policy.policy_type_parent) newErrors.policy_type_parent = "نوع الوثيقة مطلوب";
          if (!policy.company_id) newErrors.company_id = "شركة التأمين مطلوبة";
          if (!policy.start_date) newErrors.start_date = "تاريخ البداية مطلوب";
          if (!policy.end_date) newErrors.end_date = "تاريخ النهاية مطلوب";
          if (!policy.insurance_price) newErrors.insurance_price = "السعر مطلوب";
          if (policy.insurance_price && parseFloat(policy.insurance_price) <= 0) {
            newErrors.insurance_price = "السعر يجب أن يكون أكبر من صفر";
          }
          if (policy.policy_type_parent === 'THIRD_FULL' && !policy.policy_type_child) {
            newErrors.policy_type_child = "النوع الفرعي مطلوب";
          }
          // Broker direction required when broker is selected
          if (policyBrokerId && policyBrokerId !== 'none' && !brokerDirection) {
            newErrors.broker_direction = "الرجاء اختيار نوع التعامل مع الوسيط";
          }
          break;
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const canProceed = (): boolean => {
    if (isLightMode) {
      // LIGHT mode: step 1 = client, step 2 = policy, step 3 = payments
      switch (currentStep) {
        case 1: {
          const id = digitsOnly(newClient.id_number);
          const phone = digitsOnly(newClient.phone_number);
          const phoneOk = phone.length === 0 || isValidPhoneNumber10(phone);
          return !!(
            selectedClient ||
            (createNewClient && newClient.full_name.trim() && id.length === 9 && isValidIsraeliId(id) && phoneOk)
          );
        }
        case 2:
          return !!(policy.start_date && policy.end_date && policy.insurance_price);
        case 3:
          // Block if payments exceed insurance price or has unpaid visa payments
          return !paymentsExceedPrice && !hasUnpaidVisaPayment;
        default:
          return false;
      }
    } else {
      // FULL mode (original)
      switch (currentStep) {
        case 1: {
          const id = digitsOnly(newClient.id_number);
          const phone = digitsOnly(newClient.phone_number);
          const phoneOk = phone.length === 0 || isValidPhoneNumber10(phone);
          return !!(
            selectedClient ||
            (createNewClient && newClient.full_name.trim() && id.length === 9 && isValidIsraeliId(id) && phoneOk)
          );
        }
        case 2:
          return !!(selectedCar || existingCar || (createNewCar && newCar.car_number && !carConflict));
        case 3: {
          const brokerDirectionOk = !policyBrokerId || policyBrokerId === 'none' || !!brokerDirection;
          return !!(policy.policy_type_parent && policy.company_id && policy.start_date && policy.end_date && policy.insurance_price && brokerDirectionOk);
        }
        case 4:
          // Block if payments exceed insurance price or has unpaid visa payments
          return !paymentsExceedPrice && !hasUnpaidVisaPayment;
        default:
          return false;
      }
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    
    setSaving(true);
    try {
      let policyId = tempPolicyId; // Use existing policy if created via Visa payment
      let clientId = selectedClient?.id;
      let carId = selectedCar?.id || existingCar?.id;

      // If policy was already created via Visa payment, skip creation
      if (!policyId) {
        // Create client if new
        if (createNewClient && !clientId) {
          // Generate file number using DB function
          const { data: fileNumData } = await supabase.rpc('generate_file_number');
          
          const { data: newClientData, error: clientError } = await supabase
            .from('clients')
            .insert({
              full_name: newClient.full_name.trim(),
              id_number: newClient.id_number.trim(),
              file_number: fileNumData || null,
              phone_number: newClient.phone_number.trim() || null,
              less_than_24: newClient.less_than_24,
              notes: newClient.notes.trim() || null,
              broker_id: newClient.broker_id || defaultBrokerId || null,
              branch_id: effectiveBranchId || null,
            })
            .select()
            .single();

          if (clientError) {
            if (clientError.code === '23505') {
              toast({ title: "خطأ", description: "رقم الهوية موجود مسبقاً", variant: "destructive" });
            } else {
              throw clientError;
            }
            return;
          }
          clientId = newClientData.id;
        }

        // Create car if new (only for FULL mode)
        if (!isLightMode && createNewCar && !carId && clientId) {
          const { data: newCarData, error: carError } = await supabase
            .from('cars')
            .insert({
              car_number: newCar.car_number.trim(),
              client_id: clientId,
              manufacturer_name: newCar.manufacturer_name.trim() || null,
              model: newCar.model.trim() || null,
              year: newCar.year ? parseInt(newCar.year) : null,
              color: newCar.color.trim() || null,
              car_type: newCar.car_type as any,
              car_value: newCar.car_value ? parseFloat(newCar.car_value) : null,
              license_expiry: newCar.license_expiry || null,
              branch_id: effectiveBranchId || null,
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

        // Validation: FULL mode requires car, LIGHT mode doesn't
        if (!clientId) {
          toast({ title: "خطأ", description: "الرجاء اختيار العميل", variant: "destructive" });
          return;
        }
        if (!isLightMode && !carId) {
          toast({ title: "خطأ", description: "الرجاء اختيار السيارة", variant: "destructive" });
          return;
        }

        // Determine is_under_24
        const isUnder24 = createNewClient ? newClient.less_than_24 : selectedClient?.less_than_24;
        const ageBand = isUnder24 ? 'UNDER_24' : 'UP_24';

        let profitCalc = { profit: 0, companyPayment: 0 };
        
        if (isLightMode) {
          // LIGHT mode: no profit calculation, profit = insurance_price
          profitCalc = {
            profit: parseFloat(policy.insurance_price),
            companyPayment: 0,
          };
        } else {
          // FULL mode: calculate profit based on pricing rules
          const carType = (createNewCar ? newCar.car_type : (selectedCar?.car_type || existingCar?.car_type)) || 'car';
          const carValue = createNewCar 
            ? (newCar.car_value ? parseFloat(newCar.car_value) : null)
            : (selectedCar?.car_value || existingCar?.car_value);
          const carYear = createNewCar 
            ? (newCar.year ? parseInt(newCar.year) : null)
            : (selectedCar?.year || existingCar?.year);

          profitCalc = await calculatePolicyProfit({
            policyTypeParent: policy.policy_type_parent as any,
            policyTypeChild: policy.policy_type_child as any,
            companyId: policy.company_id,
            carType: carType as any,
            ageBand: ageBand as any,
            carValue,
            carYear,
            insurancePrice: parseFloat(policy.insurance_price),
          });
        }

        // Determine policy_type_parent: use category slug for LIGHT mode
        const policyTypeParent = isLightMode 
          ? (selectedCategory?.slug || 'OTHER') 
          : policy.policy_type_parent;

        // Create policy
        const { data: policyData, error: policyError } = await supabase
          .from('policies')
.insert({
            created_by_admin_id: user?.id || null,
            client_id: clientId,
            car_id: isLightMode ? null : carId,
            company_id: isLightMode ? null : policy.company_id,
            policy_type_parent: policyTypeParent as any,
            policy_type_child: policy.policy_type_child ? policy.policy_type_child as any : null,
            start_date: policy.start_date,
            end_date: policy.end_date,
            insurance_price: parseFloat(policy.insurance_price),
            is_under_24: isUnder24 || false,
            cancelled: policy.cancelled,
            transferred: policy.transferred,
            notes: policy.notes.trim() || null,
            profit: profitCalc.profit,
            payed_for_company: profitCalc.companyPayment,
            broker_id: policyBrokerId && policyBrokerId !== 'none' ? policyBrokerId : null,
            broker_direction: brokerDirection && policyBrokerId && policyBrokerId !== 'none' ? brokerDirection as any : null,
            category_id: selectedCategory?.id || null,
            branch_id: effectiveBranchId || null,
          })
          .select()
          .single();

        if (policyError) throw policyError;
        policyId = policyData.id;
      }

      // Create payments that haven't been paid via Tranzila
      const unpaidPayments = payments.filter(p => p.amount > 0 && !p.tranzila_paid);
      if (unpaidPayments.length > 0) {
        const { error: paymentsError } = await supabase
          .from('policy_payments')
          .insert(
            unpaidPayments.map(p => ({
              policy_id: policyId,
              payment_type: p.payment_type as any,
              amount: p.amount,
              payment_date: p.payment_date,
              cheque_number: p.cheque_number || null,
              refused: p.refused,
            }))
          );

        if (paymentsError) throw paymentsError;
      }

      // Upload files in background (non-blocking)
      const allFiles = [
        ...insuranceFiles.map(f => ({ file: f, type: 'policy_insurance' })),
        ...crmFiles.map(f => ({ file: f, type: 'policy_crm' })),
      ];
      
      // Close dialog immediately - don't wait for file uploads
      toast({ title: "تم الحفظ بنجاح", description: "تم إنشاء الوثيقة بنجاح" });
      clearDraft();
      onOpenChange(false);
      setSaving(false);
      onComplete?.(policyId!);
      onSaved?.();
      
      // Navigate to policies only if no custom handler
      if (!onSaved) {
        navigate(`/policies`);
      }

      // Generate invoices in background (non-blocking)
      (async () => {
        try {
          await supabase.functions.invoke('generate-invoices', {
            body: { policy_id: policyId, languages: ['ar', 'he'] },
          });
          console.log('[PolicyWizard] Invoices generated successfully');
        } catch (e) {
          console.error('[PolicyWizard] Invoice generation error:', e);
        }
      })();
      if (allFiles.length > 0) {
        // Run uploads in background without blocking UI
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            
            // Upload all files in parallel for speed
            await Promise.allSettled(
              allFiles.map(async ({ file, type }) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('entity_type', type);
                formData.append('entity_id', policyId!);

                return fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-media`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: formData,
                  }
                );
              })
            );
          } catch (e) {
            console.error('Background file upload error:', e);
          }
        })();
      }
    } catch (error: any) {
      console.error('Error creating policy:', error);
      // Check if it's a payment validation error
      const errorMessage = error.message || '';
      if (errorMessage.includes('Payment total exceeds')) {
        toast({ 
          title: "خطأ في الدفعات", 
          description: "مجموع الدفعات يتجاوز سعر التأمين. الرجاء تعديل المبالغ.", 
          variant: "destructive" 
        });
      } else {
        toast({ title: "خطأ", description: errorMessage || "حدث خطأ أثناء الحفظ", variant: "destructive" });
      }
      setSaving(false);
    }
  };

  const handleClose = () => {
    clearDraft();
    resetForm();
    onOpenChange(false);
  };

  // Field error component
  const FieldError = ({ error }: { error?: string }) => {
    if (!error) return null;
    return (
      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {error}
      </p>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      // Prevent closing on focus loss
      if (!nextOpen && (document.visibilityState === "hidden" || !document.hasFocus())) {
        return;
      }
      if (!nextOpen) handleClose();
      else onOpenChange(nextOpen);
    }}>
      <DialogContent 
        className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto p-0"
        dir="rtl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-semibold flex items-center gap-3">
                <FileText className="h-5 w-5" />
                إضافة وثيقة جديدة
              </DialogTitle>
              {/* Branch selector - Admin only - styled as badge/chip */}
              {isAdmin && branches.length > 0 && (
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="h-8 w-auto gap-2 px-3 bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary font-medium rounded-full">
                    <Building2 className="h-3.5 w-3.5" />
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name_ar || branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Steps indicator - Clickable tabs */}
          <div className="flex justify-center gap-2 mt-4">
            {STEPS.map((step, index) => {
              // Allow clicking on completed steps or the current step
              const canClick = step.id <= currentStep;
              return (
                <div key={step.id} className="flex items-center">
                  <button
                    type="button"
                    className="flex flex-col items-center focus:outline-none"
                    onClick={() => canClick && setCurrentStep(step.id)}
                    disabled={!canClick}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                        currentStep === step.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : currentStep > step.id
                          ? "border-primary bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                          : "border-muted-foreground/30 text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      {currentStep > step.id ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <step.icon className="h-5 w-5" />
                      )}
                    </div>
                    <span className={cn(
                      "text-xs mt-1",
                      currentStep === step.id ? "text-primary font-medium" : "text-muted-foreground",
                      canClick && currentStep > step.id && "cursor-pointer hover:text-primary"
                    )}>
                      {step.title}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div className={cn(
                      "h-0.5 w-8 mx-2 mt-[-12px]",
                      currentStep > step.id ? "bg-primary" : "bg-muted-foreground/30"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="px-6 py-6 min-h-[400px]">
          {/* Step 1: Client */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Broker Selection Row */}
              <div className="p-4 bg-secondary/30 rounded-lg border">
                {/* Broker Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    الوسيط (اختياري)
                  </Label>
                  <Select 
                    value={policyBrokerId} 
                    onValueChange={(val) => {
                      setPolicyBrokerId(val);
                      // Clear direction if broker is cleared
                      if (val === 'none') {
                        setBrokerDirection('');
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="بدون وسيط" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون وسيط</SelectItem>
                      {brokers.map((broker) => (
                        <SelectItem key={broker.id} value={broker.id}>
                          {broker.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Category Selector */}
              <div className="mb-4">
                <Label className="text-base font-semibold">نوع التأمين</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {categories.map(cat => (
                    <Button
                      key={cat.id}
                      type="button"
                      variant={selectedCategory?.id === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedCategory(cat);
                        if (cat.mode === 'FULL') {
                          setPolicy(p => ({ ...p, policy_type_parent: cat.slug }));
                          fetchCompanies(cat.slug);
                        }
                      }}
                    >
                      {cat.name_ar || cat.name}
                      {cat.mode === 'FULL' && <Car className="h-3 w-3 mr-1" />}
                    </Button>
                  ))}
                </div>
              </div>

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
                        onClick={() => {
                          setSelectedClient(client);
                          setCreateNewClient(false);
                          setErrors({});
                          writeDraftNow({ selectedClient: client, createNewClient: false });
                        }}
                      >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{client.full_name}</p>
                              <p className="text-sm text-muted-foreground">{client.id_number} • {client.phone_number || 'بدون هاتف'}</p>
                            </div>
                            {selectedClient?.id === client.id && (
                              <Check className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {selectedClient && (
                    <Card className="p-4 border-primary bg-primary/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <Badge className="mb-2">العميل المختار</Badge>
                          <p className="font-medium">{selectedClient.full_name}</p>
                          <p className="text-sm text-muted-foreground">{selectedClient.id_number}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedClient(null);
                            setSelectedCar(null);
                            setCreateNewCar(false);
                            setExistingCar(null);
                            setCarConflict(null);
                            setErrors({});
                            writeDraftNow({
                              selectedClient: null,
                              selectedCar: null,
                              createNewCar: false,
                              existingCar: null,
                              carConflict: null,
                            });
                          }}
                        >
                          تغيير
                        </Button>
                      </div>
                    </Card>
                  )}

                   <Button
                     type="button"
                     variant="outline"
                     className="w-full"
                     onClick={() => {
                       setSelectedClient(null);
                       setCreateNewClient(true);
                       // Clear cars from previous client selection
                       setClientCars([]);
                       setSelectedCar(null);
                       setCreateNewCar(false);
                       setExistingCar(null);
                       setCarConflict(null);
                       setErrors({});
                       writeDraftNow({ 
                         selectedClient: null, 
                         createNewClient: true,
                         selectedCar: null,
                         createNewCar: false,
                       });
                     }}
                   >
                     <Plus className="h-4 w-4 ml-2" />
                     إنشاء عميل جديد
                   </Button>
                  
                  <FieldError error={errors.client} />
                </>
              ) : (
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCreateNewClient(false);
                      setErrors({});
                      writeDraftNow({ createNewClient: false });
                    }}
                  >
                    ← العودة للبحث
                  </Button>
                  
                  {checkingDuplicate && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري التحقق من وجود العميل...
                    </div>
                  )}
                  
                  <Card className="p-4 border">
                    <div className="grid gap-4">
                    <div>
                      <Label>الاسم الكامل *</Label>
                      <Input
                        value={newClient.full_name}
                        onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
                        placeholder="أدخل اسم العميل"
                        className={errors.full_name ? "border-destructive" : ""}
                      />
                      <FieldError error={errors.full_name} />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>رقم الهوية *</Label>
                        <Input
                          value={newClient.id_number}
                          onChange={(e) =>
                            setNewClient({
                              ...newClient,
                              id_number: digitsOnly(e.target.value).slice(0, 9),
                            })
                          }
                          placeholder="رقم الهوية"
                          inputMode="numeric"
                          maxLength={9}
                          dir="ltr"
                          className={errors.id_number ? "border-destructive" : ""}
                        />
                        <FieldError error={errors.id_number} />
                      </div>
                      <div>
                        <Label>رقم الملف</Label>
                        <Input
                          value="سيتم توليده تلقائياً"
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>الهاتف</Label>
                        <Input
                          value={newClient.phone_number}
                          onChange={(e) =>
                            setNewClient({
                              ...newClient,
                              phone_number: digitsOnly(e.target.value).slice(0, 10),
                            })
                          }
                          placeholder="رقم الهاتف"
                          inputMode="numeric"
                          maxLength={10}
                          dir="ltr"
                          className={errors.phone_number ? "border-destructive" : ""}
                        />
                        <FieldError error={errors.phone_number} />
                      </div>
                      <div>
                        <Label>الوسيط</Label>
                        <Select 
                          value={newClient.broker_id || "__none__"} 
                          onValueChange={(v) => setNewClient({ ...newClient, broker_id: v === "__none__" ? "" : v })}
                          disabled={!!defaultBrokerId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="اختر الوسيط (اختياري)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">بدون وسيط</SelectItem>
                            {brokers.map(b => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Car (only for FULL mode) */}
          {currentStep === 2 && !isLightMode && (
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
                  
                  <FieldError error={errors.car} />
                </>
              ) : (
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" onClick={() => { setCreateNewCar(false); setExistingCar(null); setCarConflict(null); }}>
                    ← العودة لاختيار سيارة
                  </Button>

                  <div className="flex gap-2">
                    <Input
                      value={newCar.car_number}
                      onChange={(e) => {
                        setNewCar({ ...newCar, car_number: e.target.value });
                        setCarDataFetched(false);
                      }}
                      placeholder="رقم السيارة *"
                      className={cn("flex-1", (errors.car_number || carConflict) ? "border-destructive" : "")}
                    />
                    <Button onClick={fetchCarData} disabled={fetchingCarData}>
                      {fetchingCarData ? <Loader2 className="h-4 w-4 animate-spin" /> : "جلب البيانات"}
                    </Button>
                  </div>
                  <FieldError error={errors.car_number || carConflict || undefined} />

                  {carDataFetched && !carConflict && (
                    <Badge className="bg-success/10 text-success border-success/20">
                      تم جلب البيانات تلقائياً
                    </Badge>
                  )}

                  {existingCar && (
                    <Card className="p-4 border-primary bg-primary/5">
                      <Badge className="mb-2">سيارة موجودة - سيتم استخدامها</Badge>
                      <p className="font-mono font-medium" dir="ltr">{existingCar.car_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {existingCar.manufacturer_name} {existingCar.model} {existingCar.year}
                      </p>
                    </Card>
                  )}

                  <div className="grid gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* Step 3 (FULL) / Step 2 (LIGHT): Policy */}
          {((currentStep === 3 && !isLightMode) || (currentStep === 2 && isLightMode)) && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">تفاصيل الوثيقة</h3>

              <div className="grid gap-4">
                  {/* Show policy type selector only for FULL mode */}
                  {!isLightMode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>نوع الوثيقة *</Label>
                        <Select
                          value={policy.policy_type_parent}
                          onValueChange={(v) => {
                            setPolicy({ ...policy, policy_type_parent: v, policy_type_child: "", company_id: "" });
                            fetchCompanies(v);
                          }}
                        >
                          <SelectTrigger className={errors.policy_type_parent ? "border-destructive" : ""}>
                            <SelectValue placeholder="اختر النوع" />
                          </SelectTrigger>
                          <SelectContent>
                            {CAR_POLICY_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError error={errors.policy_type_parent} />
                      </div>
                      {CAR_POLICY_TYPES.find(t => t.value === policy.policy_type_parent)?.hasChild && (
                        <div>
                          <Label>النوع الفرعي *</Label>
                          <Select
                            value={policy.policy_type_child}
                            onValueChange={(v) => setPolicy({ ...policy, policy_type_child: v })}
                          >
                            <SelectTrigger className={errors.policy_type_child ? "border-destructive" : ""}>
                              <SelectValue placeholder="اختر" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="THIRD">طرف ثالث</SelectItem>
                              <SelectItem value="FULL">شامل</SelectItem>
                            </SelectContent>
                          </Select>
                          <FieldError error={errors.policy_type_child} />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Show selected category for LIGHT mode */}
                  {isLightMode && selectedCategory && (
                    <Card className="p-3 bg-muted/50">
                      <p className="text-sm text-muted-foreground">نوع التأمين</p>
                      <p className="font-medium">{selectedCategory.name_ar || selectedCategory.name}</p>
                    </Card>
                  )}

                  {/* Company selector only for FULL mode */}
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

                  <div>
                    <Label>السعر (₪) *</Label>
                    <Input
                      type="number"
                      value={policy.insurance_price}
                      onChange={(e) => setPolicy({ ...policy, insurance_price: e.target.value })}
                      placeholder="أدخل السعر"
                      className={errors.insurance_price ? "border-destructive" : ""}
                    />
                    <FieldError error={errors.insurance_price} />
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

                  {/* Broker Direction - Only show when broker is selected */}
                  {policyBrokerId && policyBrokerId !== 'none' && (
                    <div className={cn(
                      "p-4 rounded-lg border",
                      errors.broker_direction ? "border-destructive bg-destructive/5" : "bg-primary/5 border-primary/20"
                    )}>
                      <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                        <ArrowLeftRight className="h-4 w-4" />
                        نوع التعامل مع الوسيط *
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Card 
                          className={cn(
                            "p-3 cursor-pointer transition-all",
                            brokerDirection === 'from_broker' 
                              ? "border-primary bg-primary/10 ring-2 ring-primary/30" 
                              : "hover:bg-secondary/50"
                          )}
                          onClick={() => setBrokerDirection('from_broker')}
                        >
                          <div className="text-center">
                            <p className="font-medium text-sm">عميلي عن طريقه</p>
                            <p className="text-xs text-muted-foreground mt-1">الوسيط جلب لي هذا العميل - لي عليه</p>
                            {brokerDirection === 'from_broker' && (
                              <Check className="h-4 w-4 text-primary mx-auto mt-2" />
                            )}
                          </div>
                        </Card>
                        <Card 
                          className={cn(
                            "p-3 cursor-pointer transition-all",
                            brokerDirection === 'to_broker' 
                              ? "border-primary bg-primary/10 ring-2 ring-primary/30" 
                              : "hover:bg-secondary/50"
                          )}
                          onClick={() => setBrokerDirection('to_broker')}
                        >
                          <div className="text-center">
                            <p className="font-medium text-sm">عملت للوسيط</p>
                            <p className="text-xs text-muted-foreground mt-1">أنا عملت للوسيط - عليه لي</p>
                            {brokerDirection === 'to_broker' && (
                              <Check className="h-4 w-4 text-primary mx-auto mt-2" />
                            )}
                          </div>
                        </Card>
                      </div>
                      <FieldError error={errors.broker_direction} />
                    </div>
                  )}

                  {/* File Upload Section - Insurance Files */}
                  <div className="space-y-3">
                    <Label>ملفات التأمين (للعميل - فاتورة، إيصال دفع)</Label>
                    <div 
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                        "hover:border-primary hover:bg-primary/5"
                      )}
                      onClick={() => document.getElementById('insurance-file-input')?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const files = Array.from(e.dataTransfer.files);
                        setInsuranceFiles(prev => [...prev, ...files]);
                      }}
                    >
                      <input
                        id="insurance-file-input"
                        type="file"
                        multiple
                        accept="image/*,video/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            const files = Array.from(e.target.files);
                            setInsuranceFiles(prev => [...prev, ...files]);
                          }
                          e.target.value = '';
                        }}
                      />
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Plus className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium">اضغط أو اسحب الملفات هنا</p>
                        <p className="text-xs text-muted-foreground">فواتير، إيصالات، وثائق للعميل</p>
                      </div>
                    </div>

                    {/* Selected Insurance Files Preview */}
                    {insuranceFiles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">{insuranceFiles.length} ملف تأمين</p>
                        <div className="flex flex-wrap gap-2">
                          {insuranceFiles.map((file, index) => (
                            <div 
                              key={index}
                              className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm"
                            >
                              {file.type.startsWith('image/') ? (
                                <img 
                                  src={URL.createObjectURL(file)} 
                                  alt={file.name}
                                  className="w-8 h-8 object-cover rounded"
                                />
                              ) : (
                                <FileText className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className="max-w-[100px] truncate">{file.name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInsuranceFiles(prev => prev.filter((_, i) => i !== index));
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* File Upload Section - CRM Files */}
                  <div className="space-y-3">
                    <Label>ملفات النظام (هوية، صور سيارة، مستندات داخلية)</Label>
                    <div 
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                        "hover:border-secondary hover:bg-secondary/5"
                      )}
                      onClick={() => document.getElementById('crm-file-input')?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const files = Array.from(e.dataTransfer.files);
                        setCrmFiles(prev => [...prev, ...files]);
                      }}
                    >
                      <input
                        id="crm-file-input"
                        type="file"
                        multiple
                        accept="image/*,video/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            const files = Array.from(e.target.files);
                            setCrmFiles(prev => [...prev, ...files]);
                          }
                          e.target.value = '';
                        }}
                      />
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                          <Plus className="h-5 w-5 text-secondary-foreground" />
                        </div>
                        <p className="text-sm font-medium">اضغط أو اسحب الملفات هنا</p>
                        <p className="text-xs text-muted-foreground">هوية، رخصة، صور سيارة</p>
                      </div>
                    </div>

                    {/* Selected CRM Files Preview */}
                    {crmFiles.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">{crmFiles.length} ملف نظام</p>
                        <div className="flex flex-wrap gap-2">
                          {crmFiles.map((file, index) => (
                            <div 
                              key={index}
                              className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm"
                            >
                              {file.type.startsWith('image/') ? (
                                <img 
                                  src={URL.createObjectURL(file)} 
                                  alt={file.name}
                                  className="w-8 h-8 object-cover rounded"
                                />
                              ) : (
                                <FileText className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className="max-w-[100px] truncate">{file.name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCrmFiles(prev => prev.filter((_, i) => i !== index));
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            </div>
          )}

          {/* Step 4 (FULL) / Step 3 (LIGHT): Payments */}
          {((currentStep === 4 && !isLightMode) || (currentStep === 3 && isLightMode)) && (
            <div className="space-y-4">
              {/* Policy Summary Card */}
              <Card className="p-4 bg-primary/5 border-primary/20">
                <h4 className="font-semibold text-sm mb-3">ملخص الوثيقة</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">العميل:</span>
                    <p className="font-medium">{selectedClient?.full_name || newClient.full_name || '-'}</p>
                  </div>
                  {!isLightMode && (
                    <div>
                      <span className="text-muted-foreground">السيارة:</span>
                      <p className="font-medium font-mono" dir="ltr">{selectedCar?.car_number || existingCar?.car_number || newCar.car_number || '-'}</p>
                    </div>
                  )}
                  {!isLightMode && (
                    <div>
                      <span className="text-muted-foreground">الشركة:</span>
                      <p className="font-medium">{companies.find(c => c.id === policy.company_id)?.name_ar || companies.find(c => c.id === policy.company_id)?.name || '-'}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">سعر التأمين:</span>
                    <p className="font-bold text-primary text-lg">₪ {policy.insurance_price ? parseFloat(policy.insurance_price).toLocaleString() : '0'}</p>
                  </div>
                </div>
              </Card>

              {/* Payment Summary - shows when there are payments */}
              {payments.length > 0 && (
                <Card className={cn("p-4", paymentsExceedPrice ? "border-destructive bg-destructive/5" : "bg-muted/30")}>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">سعر التأمين</span>
                      <p className="font-bold">₪{insurancePrice.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">مجموع الدفعات</span>
                      <p className={cn("font-bold", paymentsExceedPrice ? "text-destructive" : "text-success")}>
                        ₪{totalPaidPayments.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">المتبقي</span>
                      <p className={cn("font-bold", remainingToPay < 0 ? "text-destructive" : remainingToPay === 0 ? "text-success" : "text-amber-600")}>
                        ₪{remainingToPay.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {paymentsExceedPrice && (
                    <div className="flex items-center gap-2 mt-3 text-destructive text-sm justify-center">
                      <AlertCircle className="h-4 w-4" />
                      <span>مجموع الدفعات يتجاوز سعر التأمين! الحد الأقصى: ₪{insurancePrice.toLocaleString()}</span>
                    </div>
                  )}
                  {hasUnpaidVisaPayment && !paymentsExceedPrice && (
                    <div className="flex items-center gap-2 mt-3 text-amber-600 text-sm justify-center">
                      <AlertCircle className="h-4 w-4" />
                      <span>يوجد دفعة فيزا لم يتم إتمامها. الرجاء إتمام الدفع أو حذف الدفعة للمتابعة.</span>
                    </div>
                  )}
                </Card>
              )}

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
                    <Card key={payment.id} className={cn("p-4", payment.tranzila_paid && "border-success/50 bg-success/5")}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">دفعة {index + 1}</span>
                          {payment.tranzila_paid && (
                            <Badge variant="outline" className="border-success text-success gap-1">
                              <CheckCircle className="h-3 w-3" />
                              تم الدفع
                            </Badge>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removePayment(payment.id)}
                          disabled={payment.tranzila_paid}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label>نوع الدفع</Label>
                            <Select
                              value={payment.payment_type}
                              onValueChange={(v) => updatePayment(payment.id, 'payment_type', v)}
                              disabled={payment.tranzila_paid}
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
                          <div className="space-y-1">
                            <Label>المبلغ</Label>
                            <Input
                              type="number"
                              value={payment.amount || ""}
                              onChange={(e) => updatePayment(payment.id, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="₪"
                              disabled={payment.tranzila_paid}
                              className={cn(
                                payment.amount && !payment.refused && 
                                (payment.amount > (insurancePrice - payments.filter(p => !p.refused && p.id !== payment.id).reduce((s, p) => s + (p.amount || 0), 0)))
                                  ? "border-destructive" : ""
                              )}
                            />
                            {!payment.tranzila_paid && !payment.refused && insurancePrice > 0 && (
                              <p className="text-xs text-muted-foreground">
                                الحد الأقصى: ₪{Math.max(0, insurancePrice - payments.filter(p => !p.refused && p.id !== payment.id).reduce((s, p) => s + (p.amount || 0), 0)).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label>التاريخ</Label>
                            <Input
                              type="date"
                              value={payment.payment_date}
                              onChange={(e) => updatePayment(payment.id, 'payment_date', e.target.value)}
                              disabled={payment.tranzila_paid}
                            />
                          </div>
                          {payment.payment_type === 'cheque' && (
                            <div>
                              <Label>رقم الشيك</Label>
                              <Input
                                value={payment.cheque_number || ""}
                                onChange={(e) => updatePayment(payment.id, 'cheque_number', e.target.value)}
                                disabled={payment.tranzila_paid}
                              />
                            </div>
                          )}
                        </div>
                        
                        {/* Visa Pay Button */}
                        {payment.payment_type === 'visa' && tranzilaEnabled && !payment.tranzila_paid && (
                          <Button
                            type="button"
                            variant="default"
                            className="w-full"
                            disabled={!payment.amount || payment.amount <= 0}
                            onClick={() => handleVisaPayment(payment)}
                          >
                            <CreditCard className="h-4 w-4 ml-2" />
                            ادفع الآن ₪{payment.amount?.toLocaleString() || 0}
                          </Button>
                        )}
                        
                        {/* Visa disabled message */}
                        {payment.payment_type === 'visa' && !tranzilaEnabled && !payment.tranzila_paid && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            الدفع بالبطاقة غير مفعل. تواصل مع المدير لتفعيله.
                          </p>
                        )}

                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`refused-${payment.id}`}
                            checked={payment.refused}
                            onCheckedChange={(c) => updatePayment(payment.id, 'refused', c)}
                            disabled={payment.tranzila_paid}
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

        {/* Footer Navigation */}
        <div className="sticky bottom-0 bg-background border-t px-6 py-4 flex justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep > 1) {
                setCurrentStep(currentStep - 1);
                return;
              }
              handleClose();
            }}
          >
            {currentStep === 1 ? "إلغاء" : "السابق"}
          </Button>
          
          {currentStep < STEPS.length ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              التالي
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={saving || !canProceed()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حفظ الكل
            </Button>
          )}
        </div>
      </DialogContent>

      {/* Tranzila Payment Modal */}
      {tempPolicyId && activeTranzilaPaymentId && (
        <TranzilaPaymentModal
          open={tranzilaModalOpen}
          onOpenChange={setTranzilaModalOpen}
          policyId={tempPolicyId}
          amount={getActiveTranzilaPayment()?.amount || 0}
          paymentDate={getActiveTranzilaPayment()?.payment_date || new Date().toISOString().split('T')[0]}
          notes=""
          onSuccess={handleTranzilaSuccess}
          onFailure={handleTranzilaFailure}
        />
      )}
    </Dialog>
  );
}