import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { MainLayout } from '@/components/layout/MainLayout';
import { useRecentClient } from '@/hooks/useRecentClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowRight,
  Edit,
  User,
  Phone,
  Car,
  FileText,
  Plus,
  Calendar,
  Hash,
  Banknote,
  Users,
  Save,
  X,
  Search,
  Eye,
  Wallet,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  CreditCard,
  Download,
  BarChart3,
  Building2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CarDrawer } from '@/components/cars/CarDrawer';
import { PolicyDetailsDrawer } from '@/components/policies/PolicyDetailsDrawer';
import { PolicyWizard } from '@/components/policies/PolicyWizard';
import { ClientDrawer } from '@/components/clients/ClientDrawer';
import { ClientSignatureSection } from '@/components/clients/ClientSignatureSection';
import { PolicyYearTimeline } from '@/components/clients/PolicyYearTimeline';
import { ClientReportModal } from '@/components/clients/ClientReportModal';
import { CarFilterChips } from '@/components/clients/CarFilterChips';
import { ExpiryBadge } from '@/components/shared/ExpiryBadge';
import { DebtIndicator } from '@/components/shared/DebtIndicator';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useBranches } from '@/hooks/useBranches';
import { useAuth } from '@/hooks/useAuth';

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  file_number: string | null;
  phone_number: string | null;
  phone_number_2: string | null;
  birth_date: string | null;
  date_joined: string | null;
  less_than_24: boolean | null;
  under24_type: 'none' | 'client' | 'additional_driver' | null;
  under24_driver_name: string | null;
  under24_driver_id: string | null;
  notes: string | null;
  image_url: string | null;
  signature_url: string | null;
  created_at: string;
  broker_id: string | null;
  branch_id: string | null;
}

interface Broker {
  id: string;
  name: string;
  phone: string | null;
}

interface CarRecord {
  id: string;
  car_number: string;
  manufacturer_name: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  car_type: string | null;
}

interface PolicyRecord {
  id: string;
  policy_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  profit: number | null;
  cancelled: boolean | null;
  transferred: boolean | null;
  transferred_car_number: string | null;
  transferred_to_car_number: string | null;
  transferred_from_policy_id: string | null;
  group_id: string | null;
  company: { name: string; name_ar: string | null } | null;
  car: { id: string; car_number: string } | null;
  creator: { full_name: string | null; email: string } | null;
}

interface PaymentSummary {
  total_paid: number;
  total_remaining: number;
  total_profit: number;
}

interface WalletBalance {
  total_refunds: number;
  transaction_count: number;
}

interface PaymentRecord {
  id: string;
  amount: number;
  payment_date: string;
  payment_type: string;
  cheque_number: string | null;
  refused: boolean | null;
  notes: string | null;
  policy: {
    id: string;
    policy_type_parent: string;
    insurance_price: number;
  } | null;
}

interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onRefresh: () => void;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
  HEALTH: 'تأمين صحي',
  LIFE: 'تأمين حياة',
  PROPERTY: 'تأمين ممتلكات',
  TRAVEL: 'تأمين سفر',
  BUSINESS: 'تأمين أعمال',
  OTHER: 'أخرى',
};

const policyTypeColors: Record<string, string> = {
  ELZAMI: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  THIRD_FULL: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  ROAD_SERVICE: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  ACCIDENT_FEE_EXEMPTION: 'bg-green-500/10 text-green-600 border-green-500/20',
  HEALTH: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  LIFE: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  PROPERTY: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  TRAVEL: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  BUSINESS: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  OTHER: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

const carTypeLabels: Record<string, string> = {
  car: 'خصوصي',
  cargo: 'شحن',
  small: 'صغير',
  taxi: 'تاكسي',
  tjeradown4: 'تجاري (أقل من 4 طن)',
  tjeraup4: 'تجاري (أكثر من 4 طن)',
};

export function ClientDetails({ client, onBack, onRefresh }: ClientDetailsProps) {
  const { getBranchName } = useBranches();
  const { isAdmin } = useAuth();
  const { setRecentClient } = useRecentClient();
  const [cars, setCars] = useState<CarRecord[]>([]);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [broker, setBroker] = useState<Broker | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ total_paid: 0, total_remaining: 0, total_profit: 0 });
  const [walletBalance, setWalletBalance] = useState<WalletBalance>({ total_refunds: 0, transaction_count: 0 });
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [carDrawerOpen, setCarDrawerOpen] = useState(false);
  const [policyDetailsOpen, setPolicyDetailsOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [policyWizardOpen, setPolicyWizardOpen] = useState(false);
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  
  // Notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(client.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  
  // Policy filters
  const [policySearch, setPolicySearch] = useState('');
  const [policyTypeFilter, setPolicyTypeFilter] = useState<string>('all');
  const [policyStatusFilter, setPolicyStatusFilter] = useState<string>('all');
  const [policyCarFilter, setPolicyCarFilter] = useState<string>('all');

  // Payment filters
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('all');

  const fetchBroker = async () => {
    if (!client.broker_id) {
      setBroker(null);
      return;
    }
    try {
      const { data } = await supabase
        .from('brokers')
        .select('id, name, phone')
        .eq('id', client.broker_id)
        .single();
      if (data) setBroker(data);
      else setBroker(null);
    } catch (error) {
      console.error('Error fetching broker:', error);
      setBroker(null);
    }
  };

  const fetchCars = async () => {
    setLoadingCars(true);
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('id, car_number, manufacturer_name, model, year, color, car_type')
        .eq('client_id', client.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCars(data || []);
    } catch (error) {
      console.error('Error fetching cars:', error);
    } finally {
      setLoadingCars(false);
    }
  };

  const fetchPolicies = async () => {
    setLoadingPolicies(true);
    try {
      const { data, error } = await supabase
        .from('policies')
        .select(`
          id, policy_number, policy_type_parent, policy_type_child, start_date, end_date, 
          insurance_price, profit, cancelled, transferred, group_id,
          transferred_car_number, transferred_to_car_number, transferred_from_policy_id,
          company:insurance_companies(name, name_ar),
          car:cars(id, car_number),
          creator:profiles!policies_created_by_admin_id_fkey(full_name, email)
        `)
        .eq('client_id', client.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false });

      if (error) throw error;
      setPolicies(data || []);
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoadingPolicies(false);
    }
  };

  const fetchPaymentSummary = async () => {
    try {
      // Get all policies for this client
      const { data: policiesData } = await supabase
        .from('policies')
        .select('id, insurance_price, profit')
        .eq('client_id', client.id)
        .is('deleted_at', null);

      if (!policiesData || policiesData.length === 0) {
        setPaymentSummary({ total_paid: 0, total_remaining: 0, total_profit: 0 });
        return;
      }

      const policyIds = policiesData.map(p => p.id);
      const totalInsurance = policiesData.reduce((sum, p) => sum + (p.insurance_price || 0), 0);
      const totalProfit = policiesData.reduce((sum, p) => sum + (p.profit || 0), 0);

      // Get payments for these policies
      const { data: paymentsData } = await supabase
        .from('policy_payments')
        .select('amount, refused')
        .in('policy_id', policyIds);

      const totalPaid = (paymentsData || [])
        .filter(p => !p.refused)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      setPaymentSummary({
        total_paid: totalPaid,
        total_remaining: totalInsurance - totalPaid,
        total_profit: totalProfit,
      });
    } catch (error) {
      console.error('Error fetching payment summary:', error);
    }
  };

  const fetchWalletBalance = async () => {
    try {
      const { data, error } = await supabase
        .from('customer_wallet_transactions')
        .select('amount, transaction_type')
        .eq('client_id', client.id);

      if (error) throw error;

      // "refund" and "transfer_refund_owed" = We owe customer
      // "transfer_adjustment_due" = Customer owes us
      const weOweCustomer = (data || [])
        .filter(t => t.transaction_type === 'refund' || t.transaction_type === 'transfer_refund_owed')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const customerOwesUs = (data || [])
        .filter(t => t.transaction_type === 'transfer_adjustment_due')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      setWalletBalance({
        total_refunds: weOweCustomer - customerOwesUs, // Net amount we owe
        transaction_count: data?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
    }
  };

  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      // Get all policies for this client first
      const { data: policiesData } = await supabase
        .from('policies')
        .select('id, policy_type_parent, insurance_price')
        .eq('client_id', client.id)
        .is('deleted_at', null);

      if (!policiesData || policiesData.length === 0) {
        setPayments([]);
        return;
      }

      const policyIds = policiesData.map(p => p.id);

      // Get all payments for these policies
      const { data: paymentsData, error } = await supabase
        .from('policy_payments')
        .select('id, amount, payment_date, payment_type, cheque_number, refused, notes, policy_id')
        .in('policy_id', policyIds)
        .order('payment_date', { ascending: false });

      if (error) throw error;

      // Map payments with policy info
      const paymentsWithPolicy = (paymentsData || []).map(payment => ({
        ...payment,
        policy: policiesData.find(p => p.id === payment.policy_id) || null,
      }));

      setPayments(paymentsWithPolicy);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Set this client as the recent client for quick navigation
  useEffect(() => {
    setRecentClient({
      id: client.id,
      name: client.full_name,
      initial: client.full_name.charAt(0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  useEffect(() => {
    fetchCars();
    fetchPolicies();
    fetchBroker();
    fetchPaymentSummary();
    fetchPayments();
    fetchWalletBalance();
    setNotesValue(client.notes || '');
  }, [client.id]);

  // Watch for broker_id changes and refetch broker
  useEffect(() => {
    fetchBroker();
  }, [client.broker_id]);

  // Charts data
  const policyTypeChartData = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    policies.forEach(p => {
      const type = policyTypeLabels[p.policy_type_parent] || p.policy_type_parent;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    return Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
  }, [policies]);

  const monthlyPaymentsData = useMemo(() => {
    const monthlyData: Record<string, number> = {};
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    
    payments.filter(p => !p.refused).forEach(p => {
      const date = new Date(p.payment_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = months[date.getMonth()];
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + p.amount;
    });

    // Sort by date and take last 6 months
    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, amount]) => {
        const [year, month] = key.split('-');
        return { name: months[parseInt(month) - 1], amount };
      });
  }, [payments]);

  const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#f97316', '#22c55e', '#ef4444', '#06b6d4', '#f59e0b', '#ec4899'];

  // Export functionality
  const exportToCSV = () => {
    const csvRows: string[] = [];
    
    // Client info
    csvRows.push('بيانات العميل');
    csvRows.push(`الاسم,${client.full_name}`);
    csvRows.push(`رقم الهوية,${client.id_number}`);
    csvRows.push(`رقم الهاتف,${client.phone_number || ''}`);
    csvRows.push(`رقم الملف,${client.file_number || ''}`);
    csvRows.push(`الوسيط,${broker?.name || 'لا يوجد'}`);
    csvRows.push('');
    
    // Policies
    csvRows.push('الوثائق');
    csvRows.push('نوع التأمين,الشركة,السيارة,تاريخ البداية,تاريخ الانتهاء,السعر,الحالة');
    policies.forEach(p => {
      const status = getPolicyStatus(p);
      csvRows.push(`${policyTypeLabels[p.policy_type_parent] || p.policy_type_parent},${p.company?.name_ar || p.company?.name || ''},${p.car?.car_number || ''},${p.start_date},${p.end_date},${p.insurance_price},${status.label}`);
    });
    csvRows.push('');
    
    // Cars
    csvRows.push('السيارات');
    csvRows.push('رقم السيارة,الشركة المصنعة,الموديل,السنة,اللون,النوع');
    cars.forEach(c => {
      csvRows.push(`${c.car_number},${c.manufacturer_name || ''},${c.model || ''},${c.year || ''},${c.color || ''},${carTypeLabels[c.car_type || ''] || c.car_type || ''}`);
    });
    csvRows.push('');
    
    // Payments
    csvRows.push('الدفعات');
    csvRows.push('المبلغ,التاريخ,طريقة الدفع,الحالة');
    payments.forEach(p => {
      const paymentTypeLabel = p.payment_type === 'cash' ? 'نقدي' : p.payment_type === 'cheque' ? 'شيك' : p.payment_type === 'visa' ? 'بطاقة' : 'تحويل';
      csvRows.push(`${p.amount},${p.payment_date},${paymentTypeLabel},${p.refused ? 'راجع' : 'مقبول'}`);
    });

    const csvContent = '\ufeff' + csvRows.join('\n'); // BOM for Arabic support
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `client_${client.id_number}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('تم تصدير البيانات بنجاح');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const handleCarSaved = () => {
    setCarDrawerOpen(false);
    fetchCars();
    onRefresh();
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ notes: notesValue || null, updated_at: new Date().toISOString() })
        .eq('id', client.id);

      if (error) throw error;
      toast.success('تم حفظ الملاحظات');
      setEditingNotes(false);
      onRefresh();
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('فشل في حفظ الملاحظات');
    } finally {
      setSavingNotes(false);
    }
  };

  const handlePolicyClick = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setPolicyDetailsOpen(true);
  };

  const getPolicyStatus = (policy: PolicyRecord) => {
    if (policy.cancelled) return { label: 'ملغاة', variant: 'destructive' as const, color: 'text-destructive' };
    if (policy.transferred) return { label: 'محولة', variant: 'warning' as const, color: 'text-amber-600' };
    const endDate = new Date(policy.end_date);
    const today = new Date();
    if (endDate < today) return { label: 'منتهية', variant: 'secondary' as const, color: 'text-muted-foreground' };
    return { label: 'سارية', variant: 'success' as const, color: 'text-success' };
  };

  // Filtered policies
  const filteredPolicies = useMemo(() => {
    return policies.filter(policy => {
      // Search filter
      if (policySearch) {
        const search = policySearch.toLowerCase();
        const matchesSearch = 
          (policy.policy_number?.toLowerCase().includes(search)) ||
          (policy.company?.name?.toLowerCase().includes(search)) ||
          (policy.company?.name_ar?.toLowerCase().includes(search)) ||
          (policy.car?.car_number?.toLowerCase().includes(search)) ||
          (policyTypeLabels[policy.policy_type_parent]?.toLowerCase().includes(search));
        if (!matchesSearch) return false;
      }
      
      // Type filter
      if (policyTypeFilter !== 'all' && policy.policy_type_parent !== policyTypeFilter) {
        return false;
      }
      
      // Car filter
      if (policyCarFilter !== 'all' && policy.car?.id !== policyCarFilter) {
        return false;
      }
      
      // Status filter
      if (policyStatusFilter !== 'all') {
        const status = getPolicyStatus(policy);
        if (policyStatusFilter === 'active' && status.label !== 'سارية') return false;
        if (policyStatusFilter === 'expired' && status.label !== 'منتهية') return false;
        if (policyStatusFilter === 'cancelled' && status.label !== 'ملغاة') return false;
        if (policyStatusFilter === 'transferred' && status.label !== 'محولة') return false;
      }
      
      return true;
    });
  }, [policies, policySearch, policyTypeFilter, policyStatusFilter, policyCarFilter]);

  // Get unique policy types for filter
  const uniquePolicyTypes = useMemo(() => {
    const types = new Set(policies.map(p => p.policy_type_parent));
    return Array.from(types);
  }, [policies]);

  return (
    <MainLayout>
      <Helmet>
        <title>{client.full_name} | AB Insurance CRM</title>
      </Helmet>

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Professional Header Card */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-6">
            <div className="flex items-start gap-4">
              <Button variant="ghost" size="icon" onClick={onBack} className="mt-1">
                <ArrowRight className="h-5 w-5" />
              </Button>
              
              {/* Avatar */}
              <div className="relative">
                {client.image_url ? (
                  <img
                    src={client.image_url}
                    alt={client.full_name}
                    className="h-20 w-20 rounded-2xl object-cover border-4 border-background shadow-lg"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-primary/10 border-4 border-background shadow-lg flex items-center justify-center">
                    <User className="h-10 w-10 text-primary" />
                  </div>
                )}
                {(client.under24_type !== 'none' && client.under24_type) && (
                  <Badge className="absolute -bottom-2 -right-2 bg-amber-500 text-white text-[10px] px-1.5">-24</Badge>
                )}
              </div>
              
              {/* Client Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold truncate">{client.full_name}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                  <span className="flex items-center gap-1.5 font-mono">
                    <Hash className="h-3.5 w-3.5" />
                    {client.id_number}
                  </span>
                  {client.phone_number && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <bdi>{client.phone_number}</bdi>
                    </span>
                  )}
                  {client.phone_number_2 && (
                    <span className="flex items-center gap-1.5 text-muted-foreground/70">
                      <Phone className="h-3.5 w-3.5" />
                      <bdi>{client.phone_number_2}</bdi>
                    </span>
                  )}
                  {client.file_number && (
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      ملف: {client.file_number}
                    </span>
                  )}
                  {client.birth_date && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(client.birth_date)}
                    </span>
                  )}
                </div>
                
                {/* Badges row */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* Branch Badge */}
                  {client.branch_id && (
                    <Badge variant="secondary" className="gap-1.5 bg-primary/10 text-primary border-primary/20">
                      <Building2 className="h-3 w-3" />
                      {getBranchName(client.branch_id)}
                    </Badge>
                  )}
                  
                  {/* Broker Badge */}
                  {broker && (
                    <Badge variant="outline" className="gap-1.5 bg-background">
                      <Users className="h-3 w-3" />
                      الوسيط: {broker.name}
                      {broker.phone && <span className="text-muted-foreground mr-1"><bdi>({broker.phone})</bdi></span>}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => setReportModalOpen(true)}>
                  <FileText className="h-4 w-4 ml-2" />
                  تقرير
                </Button>
                <Button variant="outline" onClick={exportToCSV}>
                  <Download className="h-4 w-4 ml-2" />
                  تصدير
                </Button>
                <Button onClick={() => setClientDrawerOpen(true)}>
                  <Edit className="h-4 w-4 ml-2" />
                  تعديل
                </Button>
              </div>
            </div>
          </div>
          
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-border border-t">
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">رقم الملف</p>
              <p className="text-lg font-bold">{client.file_number || '-'}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">تاريخ الانضمام</p>
              <p className="text-lg font-bold">{formatDate(client.date_joined)}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">السيارات</p>
              <p className="text-lg font-bold text-blue-600">{cars.length}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">الوثائق</p>
              <p className="text-lg font-bold text-purple-600">{policies.length}</p>
            </div>
            <div className="p-4 text-center col-span-2 md:col-span-1">
              <p className="text-xs text-muted-foreground mb-1">العمر</p>
              {client.under24_type === 'additional_driver' ? (
                <div className="space-y-1">
                  <Badge variant="warning" className="text-xs">سائق إضافي -24</Badge>
                  {client.under24_driver_name && (
                    <p className="text-xs text-muted-foreground">
                      {client.under24_driver_name}
                      {client.under24_driver_id && <span className="font-mono mr-1">({client.under24_driver_id})</span>}
                    </p>
                  )}
                </div>
              ) : client.under24_type === 'client' || client.less_than_24 ? (
                <Badge variant="warning" className="mt-1">أقل من 24</Badge>
              ) : (
                <Badge variant="outline" className="mt-1">24+</Badge>
              )}
            </div>
          </div>
        </Card>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <Wallet className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
              <p className="text-xl font-bold text-success">₪{paymentSummary.total_paid.toLocaleString()}</p>
            </div>
          </Card>
          
          <Card className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">إجمالي المتبقي</p>
              <p className={cn("text-xl font-bold", paymentSummary.total_remaining > 0 ? "text-destructive" : "text-success")}>
                ₪{paymentSummary.total_remaining.toLocaleString()}
              </p>
            </div>
            <DebtIndicator 
              totalOwed={paymentSummary.total_paid + paymentSummary.total_remaining} 
              totalPaid={paymentSummary.total_paid} 
              showAmount={false}
            />
          </Card>
          
          <Card className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الأرباح</p>
              <p className="text-xl font-bold text-primary">₪{paymentSummary.total_profit.toLocaleString()}</p>
            </div>
          </Card>

          {/* Wallet Balance - Show refunds owed to customer */}
          {walletBalance.total_refunds > 0 && (
            <Card className="p-4 flex items-center gap-4 border-amber-500/30 bg-amber-500/5">
              <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Banknote className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-amber-700">مرتجع للعميل</p>
                <p className="text-xl font-bold text-amber-600">₪{walletBalance.total_refunds.toLocaleString()}</p>
                <p className="text-[10px] text-amber-600/70">نحن مدينون للعميل بهذا المبلغ</p>
              </div>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="policies" className="w-full" dir="rtl">
          <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto flex-wrap">
            <TabsTrigger value="overview" className="gap-1.5">
              <User className="h-4 w-4" />
              نظرة عامة
            </TabsTrigger>
            <TabsTrigger value="policies" className="gap-1.5">
              <FileText className="h-4 w-4" />
              الوثائق ({policies.length})
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="h-4 w-4" />
              سجل الدفعات ({payments.length})
            </TabsTrigger>
            <TabsTrigger value="cars" className="gap-1.5">
              <Car className="h-4 w-4" />
              السيارات ({cars.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5">
              <Edit className="h-4 w-4" />
              الملاحظات
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  بيانات العميل
                </h3>
                <dl className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-muted-foreground">الاسم الكامل</dt>
                    <dd className="font-semibold">{client.full_name}</dd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-muted-foreground">رقم الهوية</dt>
                    <dd className="font-mono font-semibold ltr-nums">{client.id_number}</dd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-muted-foreground">رقم الهاتف</dt>
                    <dd className="font-mono ltr-nums">{client.phone_number || '-'}</dd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-muted-foreground">رقم الملف</dt>
                    <dd className="font-semibold">{client.file_number || '-'}</dd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-muted-foreground">تاريخ الانضمام</dt>
                    <dd>{formatDate(client.date_joined)}</dd>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <dt className="text-muted-foreground">الفئة العمرية</dt>
                    <dd>
                      {client.under24_type === 'additional_driver' ? (
                        <div className="text-left">
                          <Badge variant="warning">سائق إضافي أقل من 24</Badge>
                          {client.under24_driver_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {client.under24_driver_name}
                              {client.under24_driver_id && <span className="font-mono mr-1"> ({client.under24_driver_id})</span>}
                            </p>
                          )}
                        </div>
                      ) : client.under24_type === 'client' ? (
                        <Badge variant="warning">العميل أقل من 24 سنة</Badge>
                      ) : (
                        <Badge variant="outline">24 سنة فأكثر</Badge>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
              
              <Card className="p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  الوسيط
                </h3>
                {broker ? (
                  <dl className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b">
                      <dt className="text-muted-foreground">اسم الوسيط</dt>
                      <dd className="font-semibold">{broker.name}</dd>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <dt className="text-muted-foreground">هاتف الوسيط</dt>
                      <dd className="font-mono ltr-nums">{broker.phone || '-'}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>لا يوجد وسيط مرتبط بهذا العميل</p>
                  </div>
                )}
              </Card>
              
              {/* Signature Section */}
              <ClientSignatureSection
                clientId={client.id}
                clientName={client.full_name}
                phoneNumber={client.phone_number}
                signatureUrl={client.signature_url}
                onSignatureSent={onRefresh}
              />
            </div>

            {/* Charts Row */}
            {(policyTypeChartData.length > 0 || monthlyPaymentsData.length > 0) && (
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                {/* Policy Breakdown Chart */}
                {policyTypeChartData.length > 0 && (
                  <Card className="p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      توزيع الوثائق حسب النوع
                    </h3>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={policyTypeChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {policyTypeChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {/* Monthly Payments Chart */}
                {monthlyPaymentsData.length > 0 && (
                  <Card className="p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      الدفعات الشهرية
                    </h3>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyPaymentsData}>
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip 
                            formatter={(value: number) => [`₪${value.toLocaleString()}`, 'المبلغ']}
                          />
                          <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Policies Tab */}
          <TabsContent value="policies" className="mt-6 space-y-4">
            {/* Header with Add Button */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-lg">وثائق التأمين</h3>
                <p className="text-sm text-muted-foreground">{policies.length} وثيقة مسجلة</p>
              </div>
              <Button onClick={() => setPolicyWizardOpen(true)}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة وثيقة جديدة
              </Button>
            </div>
            
            {/* Car Filter Chips - Visual car selector */}
            {cars.length > 0 && (
              <Card className="p-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Car className="h-4 w-4 text-primary" />
                  فلترة حسب السيارة
                </p>
                <CarFilterChips
                  cars={cars}
                  policies={policies}
                  selectedCarId={policyCarFilter}
                  onSelect={setPolicyCarFilter}
                />
              </Card>
            )}
            
            {/* Additional Filters */}
            <Card className="p-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث برقم الوثيقة، الشركة..."
                    value={policySearch}
                    onChange={(e) => setPolicySearch(e.target.value)}
                    className="pr-10"
                  />
                </div>
                <Select value={policyTypeFilter} onValueChange={setPolicyTypeFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="نوع التأمين" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    {uniquePolicyTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {policyTypeLabels[type] || type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={policyStatusFilter} onValueChange={setPolicyStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="active">سارية</SelectItem>
                    <SelectItem value="expired">منتهية</SelectItem>
                    <SelectItem value="transferred">محولة</SelectItem>
                    <SelectItem value="cancelled">ملغاة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {loadingPolicies ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredPolicies.length === 0 ? (
              <Card className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {policies.length > 0 ? 'لا توجد وثائق تطابق معايير البحث' : 'لا توجد وثائق تأمين'}
                </p>
                {policyCarFilter !== 'all' && (
                  <Button 
                    variant="link" 
                    onClick={() => setPolicyCarFilter('all')}
                    className="mt-2"
                  >
                    إظهار كل السيارات
                  </Button>
                )}
              </Card>
            ) : (
              <PolicyYearTimeline 
                policies={filteredPolicies} 
                onPolicyClick={handlePolicyClick}
                onPaymentAdded={() => {
                  fetchPaymentSummary();
                  fetchPayments();
                }}
                onTransferPolicy={(policyId) => {
                  setSelectedPolicyId(policyId);
                  setPolicyDetailsOpen(true);
                }}
                onCancelPolicy={(policyId) => {
                  setSelectedPolicyId(policyId);
                  setPolicyDetailsOpen(true);
                }}
                onTransferPackage={(policyIds) => {
                  if (policyIds.length > 0) {
                    setSelectedPolicyId(policyIds[0]);
                    setTransferOpen(true);
                  }
                }}
                onCancelPackage={(policyIds) => {
                  if (policyIds.length > 0) {
                    setSelectedPolicyId(policyIds[0]);
                    setPolicyDetailsOpen(true);
                  }
                }}
              />
            )}
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="mt-6 space-y-4">
            <h3 className="font-semibold text-lg">سجل الدفعات</h3>
            
            {/* Payment Filters */}
            <Card className="p-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث في الدفعات..."
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    className="pr-10"
                  />
                </div>
                <Select value={paymentTypeFilter} onValueChange={setPaymentTypeFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="طريقة الدفع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الطرق</SelectItem>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="cheque">شيك</SelectItem>
                    <SelectItem value="visa">بطاقة</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {loadingPayments ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <Card className="text-center py-12">
                <CreditCard className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">لا توجد دفعات مسجلة</p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">طريقة الدفع</TableHead>
                      <TableHead className="text-right">نوع التأمين</TableHead>
                      <TableHead className="text-right">رقم الشيك</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments
                      .filter(payment => {
                        if (paymentSearch) {
                          const search = paymentSearch.toLowerCase();
                          if (!payment.cheque_number?.toLowerCase().includes(search) && 
                              !payment.notes?.toLowerCase().includes(search)) {
                            return false;
                          }
                        }
                        if (paymentTypeFilter !== 'all' && payment.payment_type !== paymentTypeFilter) {
                          return false;
                        }
                        return true;
                      })
                      .map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-semibold">₪{payment.amount.toLocaleString()}</TableCell>
                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {payment.payment_type === 'cash' ? 'نقدي' :
                               payment.payment_type === 'cheque' ? 'شيك' :
                               payment.payment_type === 'visa' ? 'بطاقة' :
                               payment.payment_type === 'transfer' ? 'تحويل' : payment.payment_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {payment.policy && (
                              <Badge className={cn("border", policyTypeColors[payment.policy.policy_type_parent])}>
                                {policyTypeLabels[payment.policy.policy_type_parent] || payment.policy.policy_type_parent}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono">{payment.cheque_number || '-'}</TableCell>
                          <TableCell>
                            {payment.refused ? (
                              <Badge variant="destructive">راجع</Badge>
                            ) : (
                              <Badge variant="success">مقبول</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">{payment.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Cars Tab */}
          <TabsContent value="cars" className="mt-6 space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCarDrawerOpen(true)}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة سيارة
              </Button>
            </div>

            {loadingCars ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : cars.length === 0 ? (
              <Card className="text-center py-12">
                <Car className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">لا توجد سيارات مسجلة</p>
                <Button variant="link" onClick={() => setCarDrawerOpen(true)}>
                  إضافة سيارة جديدة
                </Button>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">رقم السيارة</TableHead>
                      <TableHead className="text-right">الشركة المصنعة</TableHead>
                      <TableHead className="text-right">الموديل</TableHead>
                      <TableHead className="text-right">السنة</TableHead>
                      <TableHead className="text-right">اللون</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cars.map((car) => (
                      <TableRow key={car.id}>
                        <TableCell className="font-mono font-semibold"><bdi>{car.car_number}</bdi></TableCell>
                        <TableCell>{car.manufacturer_name || '-'}</TableCell>
                        <TableCell>{car.model || '-'}</TableCell>
                        <TableCell>{car.year || '-'}</TableCell>
                        <TableCell>{car.color || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{carTypeLabels[car.car_type || ''] || car.car_type || 'خصوصي'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="mt-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Edit className="h-5 w-5 text-primary" />
                  ملاحظات العميل
                </h3>
                {!editingNotes ? (
                  <Button variant="outline" size="sm" onClick={() => setEditingNotes(true)}>
                    <Edit className="h-4 w-4 ml-2" />
                    تعديل
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                    >
                      <Save className="h-4 w-4 ml-2" />
                      {savingNotes ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setEditingNotes(false);
                        setNotesValue(client.notes || '');
                      }}
                    >
                      <X className="h-4 w-4 ml-2" />
                      إلغاء
                    </Button>
                  </div>
                )}
              </div>
              
              {editingNotes ? (
                <Textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="أضف ملاحظات عن العميل هنا..."
                  className="min-h-[200px] resize-none"
                  autoFocus
                />
              ) : (
                <div className="min-h-[200px] p-4 bg-muted/30 rounded-lg">
                  {client.notes ? (
                    <p className="whitespace-pre-wrap">{client.notes}</p>
                  ) : (
                    <p className="text-muted-foreground text-center py-12">
                      لا توجد ملاحظات. اضغط "تعديل" لإضافة ملاحظات.
                    </p>
                  )}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Car Drawer */}
      <CarDrawer
        open={carDrawerOpen}
        onOpenChange={setCarDrawerOpen}
        clientId={client.id}
        onSaved={handleCarSaved}
      />

      {/* Policy Details Drawer */}
      <PolicyDetailsDrawer
        open={policyDetailsOpen}
        onOpenChange={setPolicyDetailsOpen}
        policyId={selectedPolicyId}
        onUpdated={() => {
          fetchPolicies();
          fetchPaymentSummary();
          fetchPayments();
        }}
      />

      {/* Policy Wizard for creating new policy */}
      <PolicyWizard
        open={policyWizardOpen}
        onOpenChange={setPolicyWizardOpen}
        preselectedClientId={client.id}
        onSaved={() => {
          setPolicyWizardOpen(false);
          fetchPolicies();
          fetchPaymentSummary();
          fetchPayments();
          onRefresh();
        }}
      />

      {/* Client Edit Drawer */}
      <ClientDrawer
        open={clientDrawerOpen}
        onOpenChange={setClientDrawerOpen}
        client={client}
        onSaved={() => {
          setClientDrawerOpen(false);
          onRefresh();
          fetchBroker();
        }}
      />

      {/* Client Report Modal */}
      <ClientReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        client={client}
        cars={cars}
        policies={policies}
        paymentSummary={paymentSummary}
        walletBalance={walletBalance}
        broker={broker}
        branchName={client.branch_id ? getBranchName(client.branch_id) : null}
      />
    </MainLayout>
  );
}
