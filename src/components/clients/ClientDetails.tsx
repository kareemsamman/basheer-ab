import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { MainLayout } from '@/components/layout/MainLayout';
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
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CarDrawer } from '@/components/cars/CarDrawer';
import { PolicyDetailsDrawer } from '@/components/policies/PolicyDetailsDrawer';
import { cn } from '@/lib/utils';

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  file_number: string | null;
  phone_number: string | null;
  date_joined: string | null;
  less_than_24: boolean | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  broker_id: string | null;
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
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  profit: number | null;
  cancelled: boolean | null;
  company: { name: string; name_ar: string | null } | null;
  car: { car_number: string } | null;
}

interface PaymentSummary {
  total_paid: number;
  total_remaining: number;
  total_profit: number;
}

interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onEdit: () => void;
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

export function ClientDetails({ client, onBack, onEdit, onRefresh }: ClientDetailsProps) {
  const [cars, setCars] = useState<CarRecord[]>([]);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [broker, setBroker] = useState<Broker | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>({ total_paid: 0, total_remaining: 0, total_profit: 0 });
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [carDrawerOpen, setCarDrawerOpen] = useState(false);
  const [policyDetailsOpen, setPolicyDetailsOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  
  // Notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(client.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  
  // Policy filters
  const [policySearch, setPolicySearch] = useState('');
  const [policyTypeFilter, setPolicyTypeFilter] = useState<string>('all');
  const [policyStatusFilter, setPolicyStatusFilter] = useState<string>('all');

  const fetchBroker = async () => {
    if (!client.broker_id) return;
    try {
      const { data } = await supabase
        .from('brokers')
        .select('id, name, phone')
        .eq('id', client.broker_id)
        .single();
      if (data) setBroker(data);
    } catch (error) {
      console.error('Error fetching broker:', error);
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
          id, policy_type_parent, policy_type_child, start_date, end_date, 
          insurance_price, profit, cancelled,
          company:insurance_companies(name, name_ar),
          car:cars(car_number)
        `)
        .eq('client_id', client.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

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

  useEffect(() => {
    fetchCars();
    fetchPolicies();
    fetchBroker();
    fetchPaymentSummary();
    setNotesValue(client.notes || '');
  }, [client.id]);

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
      
      // Status filter
      if (policyStatusFilter !== 'all') {
        const status = getPolicyStatus(policy);
        if (policyStatusFilter === 'active' && status.label !== 'سارية') return false;
        if (policyStatusFilter === 'expired' && status.label !== 'منتهية') return false;
        if (policyStatusFilter === 'cancelled' && status.label !== 'ملغاة') return false;
      }
      
      return true;
    });
  }, [policies, policySearch, policyTypeFilter, policyStatusFilter]);

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
                {client.less_than_24 && (
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
                      <span dir="ltr">{client.phone_number}</span>
                    </span>
                  )}
                  {client.file_number && (
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      ملف: {client.file_number}
                    </span>
                  )}
                </div>
                
                {/* Broker Badge */}
                {broker && (
                  <div className="mt-3">
                    <Badge variant="outline" className="gap-1.5 bg-background">
                      <Users className="h-3 w-3" />
                      الوسيط: {broker.name}
                      {broker.phone && <span className="text-muted-foreground mr-1" dir="ltr">({broker.phone})</span>}
                    </Badge>
                  </div>
                )}
              </div>
              
              <Button onClick={onEdit} className="shrink-0">
                <Edit className="h-4 w-4 ml-2" />
                تعديل
              </Button>
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
              <Badge variant={client.less_than_24 ? "warning" : "outline"} className="mt-1">
                {client.less_than_24 ? 'أقل من 24' : '24+'}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المتبقي</p>
              <p className={cn("text-xl font-bold", paymentSummary.total_remaining > 0 ? "text-destructive" : "text-success")}>
                ₪{paymentSummary.total_remaining.toLocaleString()}
              </p>
            </div>
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
                    <dd className="font-mono font-semibold" dir="ltr">{client.id_number}</dd>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <dt className="text-muted-foreground">رقم الهاتف</dt>
                    <dd className="font-mono" dir="ltr">{client.phone_number || '-'}</dd>
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
                      <Badge variant={client.less_than_24 ? "warning" : "outline"}>
                        {client.less_than_24 ? 'أقل من 24 سنة' : '24 سنة فأكثر'}
                      </Badge>
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
                      <dd className="font-mono" dir="ltr">{broker.phone || '-'}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>لا يوجد وسيط مرتبط بهذا العميل</p>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* Policies Tab */}
          <TabsContent value="policies" className="mt-6 space-y-4">
            {/* Filters */}
            <Card className="p-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث في الوثائق..."
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
                    <SelectItem value="cancelled">ملغاة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {loadingPolicies ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredPolicies.length === 0 ? (
              <Card className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {policies.length === 0 ? 'لا توجد وثائق تأمين' : 'لا توجد نتائج مطابقة للبحث'}
                </p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">نوع التأمين</TableHead>
                      <TableHead className="text-right">الشركة</TableHead>
                      <TableHead className="text-right">السيارة</TableHead>
                      <TableHead className="text-right">تاريخ البداية</TableHead>
                      <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                      <TableHead className="text-right">السعر</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-center w-[60px]">عرض</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPolicies.map((policy) => {
                      const status = getPolicyStatus(policy);
                      return (
                        <TableRow 
                          key={policy.id} 
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handlePolicyClick(policy.id)}
                        >
                          <TableCell>
                            <Badge className={cn("border", policyTypeColors[policy.policy_type_parent])}>
                              {policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent}
                            </Badge>
                          </TableCell>
                          <TableCell>{policy.company?.name_ar || policy.company?.name || '-'}</TableCell>
                          <TableCell className="font-mono">{policy.car?.car_number || '-'}</TableCell>
                          <TableCell>{formatDate(policy.start_date)}</TableCell>
                          <TableCell>{formatDate(policy.end_date)}</TableCell>
                          <TableCell className="font-semibold">₪{policy.insurance_price.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                        <TableCell className="font-mono font-semibold" dir="ltr">{car.car_number}</TableCell>
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
        }}
      />
    </MainLayout>
  );
}
