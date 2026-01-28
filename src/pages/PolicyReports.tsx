import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  FileText,
  Calendar,
  Phone,
  Download,
  Send,
  MoreVertical,
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  MessageSquare,
  Loader2,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CreditCard,
  Banknote,
  Package,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { ClickablePhone } from '@/components/shared/ClickablePhone';

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
  PACKAGE: 'باقة',
};

const renewalStatusLabels: Record<string, string> = {
  not_contacted: 'لم يتم التواصل',
  sms_sent: 'تم إرسال SMS',
  called: 'تم الاتصال',
  renewed: 'تم التجديد',
  not_interested: 'غير مهتم',
};

const renewalStatusColors: Record<string, string> = {
  not_contacted: 'bg-gray-100 text-gray-700 border-gray-200',
  sms_sent: 'bg-blue-100 text-blue-700 border-blue-200',
  called: 'bg-amber-100 text-amber-700 border-amber-200',
  renewed: 'bg-green-100 text-green-700 border-green-200',
  not_interested: 'bg-red-100 text-red-700 border-red-200',
};

interface PolicyPaymentActivity {
  id: string;
  amount: number;
  payment_date: string;
  payment_type: string;
  created_at: string;
}

interface CreatedPolicy {
  id: string;
  created_at: string;
  created_by_id: string | null;
  created_by_name: string | null;
  created_by_phone: string | null;
  branch_name: string | null;
  client_id: string;
  client_name: string;
  client_file_number: string | null;
  client_phone: string | null;
  car_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  company_name: string | null;
  company_name_ar: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  total_paid: number;
  remaining: number;
  payment_status: string;
  total_rows: number;
  // Package support
  is_package: boolean;
  package_types: string[] | null;
  package_policy_ids: string[] | null;
  package_count: number;
}

interface RenewalPolicy {
  id: string;
  end_date: string;
  days_remaining: number;
  client_id: string;
  client_name: string;
  client_file_number: string | null;
  client_phone: string | null;
  car_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  company_name: string | null;
  company_name_ar: string | null;
  insurance_price: number;
  renewal_status: string;
  renewal_notes: string | null;
  last_contacted_at: string | null;
  reminder_sent_at: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
  group_id?: string | null;
  total_rows: number;
  // Package support
  is_package: boolean;
  package_types: string[] | null;
  package_policy_ids: string[] | null;
  package_count: number;
}

interface RenewalSummary {
  total_expiring: number;
  not_contacted: number;
  sms_sent: number;
  called: number;
  renewed: number;
  not_interested: number;
}

interface Company {
  id: string;
  name: string;
  name_ar: string | null;
}

interface User {
  id: string;
  display_name: string;
}

const PAGE_SIZE = 25;

export default function PolicyReports() {
  const { isAdmin, user } = useAuth();
  const [activeTab, setActiveTab] = useState('created');
  
  // Created Policies State
  const [createdPolicies, setCreatedPolicies] = useState<CreatedPolicy[]>([]);
  const [createdLoading, setCreatedLoading] = useState(true);
  const [createdPage, setCreatedPage] = useState(0);
  const [createdTotalRows, setCreatedTotalRows] = useState(0);
  const [createdDatePreset, setCreatedDatePreset] = useState('today');
  const [createdFromDate, setCreatedFromDate] = useState<string>('');
  const [createdToDate, setCreatedToDate] = useState<string>('');
  const [createdByFilter, setCreatedByFilter] = useState<string>('all');
  const [createdPolicyTypeFilter, setCreatedPolicyTypeFilter] = useState<string>('all');
  const [createdCompanyFilter, setCreatedCompanyFilter] = useState<string>('all');
  const [createdSearch, setCreatedSearch] = useState('');
  
  // Renewals State
  const [renewals, setRenewals] = useState<RenewalPolicy[]>([]);
  const [renewalsLoading, setRenewalsLoading] = useState(true);
  const [renewalsPage, setRenewalsPage] = useState(0);
  const [renewalsTotalRows, setRenewalsTotalRows] = useState(0);
  const [renewalsSummary, setRenewalsSummary] = useState<RenewalSummary | null>(null);
  const [renewalsMonth, setRenewalsMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [renewalsDaysFilter, setRenewalsDaysFilter] = useState<string>('month');
  const [renewalsPolicyTypeFilter, setRenewalsPolicyTypeFilter] = useState<string>('all');
  const [renewalsCreatedByFilter, setRenewalsCreatedByFilter] = useState<string>('all');
  const [renewalsSearch, setRenewalsSearch] = useState('');
  
  // Reference Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // Modals
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false);
  const [selectedRenewal, setSelectedRenewal] = useState<RenewalPolicy | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [sendingSingleSms, setSendingSingleSms] = useState<string | null>(null);
  
  // Expandable row for payment activity
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);
  const [policyPayments, setPolicyPayments] = useState<Record<string, PolicyPaymentActivity[]>>({});
  const [loadingPayments, setLoadingPayments] = useState<string | null>(null);

  // Fetch reference data
  useEffect(() => {
    const fetchReferenceData = async () => {
      const [companiesRes, usersRes] = await Promise.all([
        supabase.from('insurance_companies').select('id, name, name_ar').eq('active', true).order('name_ar'),
        supabase.rpc('user_directory_list_active')
      ]);
      
      if (companiesRes.data) setCompanies(companiesRes.data);
      if (usersRes.data) setUsers(usersRes.data);
    };
    fetchReferenceData();
  }, []);

  // Calculate date range based on preset
  const getDateRange = () => {
    const today = new Date();
    let fromDate: string | null = null;
    let toDate: string | null = null;
    
    switch (createdDatePreset) {
      case 'today':
        fromDate = today.toISOString().split('T')[0];
        toDate = fromDate;
        break;
      case 'this_month':
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        toDate = today.toISOString().split('T')[0];
        break;
      case 'last_month':
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        fromDate = lastMonth.toISOString().split('T')[0];
        toDate = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
        break;
      case 'custom':
        fromDate = createdFromDate || null;
        toDate = createdToDate || null;
        break;
    }
    
    return { fromDate, toDate };
  };

  // Fetch created policies
  const fetchCreatedPolicies = async () => {
    setCreatedLoading(true);
    try {
      const { fromDate, toDate } = getDateRange();
      
      // Workers can filter by created_by but see all policies in their branch (RLS handles access)
      // Admins can filter by specific user or see all
      const effectiveCreatedBy = createdByFilter !== 'all' ? createdByFilter : null;
      
      const { data, error } = await supabase.rpc('report_created_policies', {
        p_from_date: fromDate,
        p_to_date: toDate,
        p_created_by: effectiveCreatedBy,
        p_policy_type: createdPolicyTypeFilter !== 'all' ? createdPolicyTypeFilter : null,
        p_company_id: createdCompanyFilter !== 'all' ? createdCompanyFilter : null,
        p_search: createdSearch || null,
        p_limit: PAGE_SIZE,
        p_offset: createdPage * PAGE_SIZE
      });

      if (error) throw error;
      setCreatedPolicies(data || []);
      setCreatedTotalRows(data?.[0]?.total_rows || 0);
    } catch (error) {
      console.error('Error fetching created policies:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setCreatedLoading(false);
    }
  };

  // Fetch renewals
  const fetchRenewals = async () => {
    setRenewalsLoading(true);
    try {
      const monthDate = renewalsMonth ? `${renewalsMonth}-01` : null;
      const daysRemaining = renewalsDaysFilter !== 'month' ? parseInt(renewalsDaysFilter) : null;
      
      const [renewalsRes, summaryRes] = await Promise.all([
        supabase.rpc('report_renewals', {
          p_end_month: monthDate,
          p_days_remaining: daysRemaining,
          p_policy_type: renewalsPolicyTypeFilter !== 'all' ? renewalsPolicyTypeFilter : null,
          p_created_by: renewalsCreatedByFilter !== 'all' ? renewalsCreatedByFilter : null,
          p_search: renewalsSearch || null,
          p_limit: PAGE_SIZE,
          p_offset: renewalsPage * PAGE_SIZE
        }),
        supabase.rpc('report_renewals_summary', {
          p_end_month: monthDate
        })
      ]);

      if (renewalsRes.error) throw renewalsRes.error;
      setRenewals(renewalsRes.data || []);
      setRenewalsTotalRows(renewalsRes.data?.[0]?.total_rows || 0);
      
      if (summaryRes.data && summaryRes.data.length > 0) {
        setRenewalsSummary(summaryRes.data[0]);
      }
    } catch (error) {
      console.error('Error fetching renewals:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setRenewalsLoading(false);
    }
  };

  // Fetch payment activity for a policy or package
  const fetchPolicyPayments = async (policyId: string, policyIds?: string[] | null) => {
    const cacheKey = policyId;
    if (policyPayments[cacheKey]) {
      // Already loaded
      setExpandedPolicyId(expandedPolicyId === cacheKey ? null : cacheKey);
      return;
    }
    
    setLoadingPayments(policyId);
    try {
      // For packages, fetch payments for all policies in the package
      const idsToQuery = policyIds && policyIds.length > 0 ? policyIds : [policyId];
      
      const { data, error } = await supabase
        .from('policy_payments')
        .select('id, amount, payment_date, payment_type, created_at')
        .in('policy_id', idsToQuery)
        .order('payment_date', { ascending: false });
      
      if (error) throw error;
      
      setPolicyPayments(prev => ({ ...prev, [cacheKey]: data || [] }));
      setExpandedPolicyId(cacheKey);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('فشل في تحميل الدفعات');
    } finally {
      setLoadingPayments(null);
    }
  };

  const paymentTypeLabels: Record<string, string> = {
    cash: 'نقداً',
    cheque: 'شيك',
    credit: 'بطاقة',
    bank_transfer: 'تحويل بنكي',
    tranzila: 'ترانزيلا',
    customer_cheque: 'شيك عميل',
  };

  // Refresh data based on active tab
  useEffect(() => {
    if (activeTab === 'created') {
      fetchCreatedPolicies();
    }
  }, [activeTab, createdPage, createdDatePreset, createdFromDate, createdToDate, createdByFilter, createdPolicyTypeFilter, createdCompanyFilter, createdSearch]);

  useEffect(() => {
    if (activeTab === 'renewals') {
      fetchRenewals();
    }
  }, [activeTab, renewalsPage, renewalsMonth, renewalsDaysFilter, renewalsPolicyTypeFilter, renewalsCreatedByFilter, renewalsSearch]);

  // Update renewal status
  const handleUpdateStatus = async () => {
    if (!selectedRenewal || !newStatus) return;
    
    setUpdatingStatus(true);
    try {
      // Upsert renewal tracking record
      const { error } = await supabase
        .from('policy_renewal_tracking')
        .upsert({
          policy_id: selectedRenewal.id,
          renewal_status: newStatus,
          notes: statusNotes || null,
          last_contacted_at: ['called', 'renewed', 'not_interested'].includes(newStatus) ? new Date().toISOString() : selectedRenewal.last_contacted_at,
          contacted_by: (await supabase.auth.getUser()).data.user?.id
        }, { onConflict: 'policy_id' });

      if (error) throw error;
      
      toast.success('تم تحديث الحالة');
      setUpdateStatusOpen(false);
      setSelectedRenewal(null);
      setNewStatus('');
      setStatusNotes('');
      fetchRenewals();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('فشل في تحديث الحالة');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Generate PDF
  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-renewals-report', {
        body: { 
          month: renewalsMonth,
          days_filter: renewalsDaysFilter !== 'month' ? parseInt(renewalsDaysFilter) : null,
          policy_type: renewalsPolicyTypeFilter !== 'all' ? renewalsPolicyTypeFilter : null
        }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, '_blank');
        toast.success('تم إنشاء التقرير');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('فشل في إنشاء التقرير');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Send bulk SMS reminders
  const handleSendReminders = async () => {
    if (!isAdmin) {
      toast.error('هذه الميزة للمسؤولين فقط');
      return;
    }
    
    setSendingReminders(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-renewal-reminders', {
        body: { 
          month: renewalsMonth,
          days_remaining: renewalsDaysFilter !== 'month' ? parseInt(renewalsDaysFilter) : 30
        }
      });

      if (error) throw error;
      
      toast.success(`تم إرسال ${data?.sent_count || 0} رسالة تذكير`);
      fetchRenewals();
    } catch (error: any) {
      console.error('Error sending reminders:', error);
      toast.error(error.message || 'فشل في إرسال التذكيرات');
    } finally {
      setSendingReminders(false);
    }
  };

  // Send single renewal reminder SMS with package details
  const handleSendSingleSms = async (policy: RenewalPolicy) => {
    if (!policy.client_phone) {
      toast.error('رقم هاتف العميل مطلوب');
      return;
    }

    setSendingSingleSms(policy.id);
    try {
      // Fetch package policies if exists
      let packageTypes: string[] = [policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent];
      
      if (policy.group_id) {
        const { data: groupPolicies } = await supabase
          .from('policies')
          .select('policy_type_parent')
          .eq('group_id', policy.group_id)
          .is('deleted_at', null)
          .eq('cancelled', false);
        
        if (groupPolicies && groupPolicies.length > 1) {
          packageTypes = [...new Set(groupPolicies.map(p => policyTypeLabels[p.policy_type_parent] || p.policy_type_parent))];
        }
      }

      const typesText = packageTypes.join(' و ');
      const endDate = formatDate(policy.end_date);
      
      // Build message
      const message = `مرحباً ${policy.client_name}، نذكرك بأن تأمين (${typesText}) لسيارتك رقم ${policy.car_number || '-'} سينتهي بتاريخ ${endDate}. يرجى التواصل معنا أو زيارة المكتب للتجديد.`;

      const { error } = await supabase.functions.invoke('send-sms', {
        body: { phone: policy.client_phone, message }
      });

      if (error) throw error;

      // Update renewal tracking
      await supabase.from('policy_renewal_tracking').upsert({
        policy_id: policy.id,
        renewal_status: 'sms_sent',
        reminder_sent_at: new Date().toISOString()
      }, { onConflict: 'policy_id' });

      toast.success('تم إرسال التذكير');
      fetchRenewals();
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      toast.error(error.message || 'فشل في إرسال الرسالة');
    } finally {
      setSendingSingleSms(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const createdTotalPages = Math.ceil(createdTotalRows / PAGE_SIZE);
  const renewalsTotalPages = Math.ceil(renewalsTotalRows / PAGE_SIZE);

  return (
    <MainLayout>
      <Helmet>
        <title>تقارير الوثائق | AB Insurance CRM</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">تقارير الوثائق</h1>
            <p className="text-muted-foreground">متابعة الوثائق المنشأة والتجديدات</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="created" className="gap-2">
              <FileText className="h-4 w-4" />
              الوثائق المنشأة
            </TabsTrigger>
            <TabsTrigger value="renewals" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              التجديدات
            </TabsTrigger>
          </TabsList>

          {/* Created Policies Tab */}
          <TabsContent value="created" className="space-y-4 mt-6">
            {/* Filters */}
            <Card className="p-4">
              <div className="flex flex-wrap gap-3">
                <Select value={createdDatePreset} onValueChange={(v) => { setCreatedDatePreset(v); setCreatedPage(0); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">اليوم</SelectItem>
                    <SelectItem value="this_month">هذا الشهر</SelectItem>
                    <SelectItem value="last_month">الشهر الماضي</SelectItem>
                    <SelectItem value="custom">مخصص</SelectItem>
                  </SelectContent>
                </Select>

                {createdDatePreset === 'custom' && (
                  <>
                    <Input
                      type="date"
                      value={createdFromDate}
                      onChange={(e) => setCreatedFromDate(e.target.value)}
                      className="w-[150px]"
                      placeholder="من"
                    />
                    <Input
                      type="date"
                      value={createdToDate}
                      onChange={(e) => setCreatedToDate(e.target.value)}
                      className="w-[150px]"
                      placeholder="إلى"
                    />
                  </>
                )}

                {/* Created By filter - Admin only */}
                {isAdmin && (
                  <Select value={createdByFilter} onValueChange={(v) => { setCreatedByFilter(v); setCreatedPage(0); }}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="أنشأه" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل المستخدمين</SelectItem>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select value={createdPolicyTypeFilter} onValueChange={(v) => { setCreatedPolicyTypeFilter(v); setCreatedPage(0); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    {Object.entries(policyTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={createdCompanyFilter} onValueChange={(v) => { setCreatedCompanyFilter(v); setCreatedPage(0); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الشركات</SelectItem>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالاسم، الهاتف، الهوية، رقم الملف، رقم السيارة..."
                    value={createdSearch}
                    onChange={(e) => { setCreatedSearch(e.target.value); setCreatedPage(0); }}
                    className="pr-10"
                  />
                </div>
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              {createdLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : createdPolicies.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">لا توجد وثائق</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                        <TableHead className="text-right">أنشأه</TableHead>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-right">الهاتف</TableHead>
                        <TableHead className="text-right">السيارة</TableHead>
                        <TableHead className="text-right">النوع</TableHead>
                        <TableHead className="text-right">الشركة</TableHead>
                        <TableHead className="text-right">الفترة</TableHead>
                        <TableHead className="text-right">السعر</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {createdPolicies.map(policy => (
                        <React.Fragment key={policy.id}>
                          <TableRow 
                            className={cn(
                              "hover:bg-muted/30 cursor-pointer",
                              expandedPolicyId === policy.id && "bg-muted/40"
                            )}
                            onClick={() => fetchPolicyPayments(policy.id, policy.package_policy_ids)}
                          >
                            <TableCell className="w-10">
                              {loadingPayments === policy.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : (
                                <ChevronDown 
                                  className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    expandedPolicyId === policy.id && "rotate-180"
                                  )} 
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{formatDateTime(policy.created_at)}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{policy.created_by_name || '-'}</p>
                                {policy.branch_name && (
                                  <p className="text-xs text-muted-foreground">{policy.branch_name}</p>
                                )}
                                {policy.created_by_phone && (
                                  <p dir="ltr" className="text-xs text-muted-foreground text-right">{policy.created_by_phone}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{policy.client_name}</p>
                                {policy.client_file_number && (
                                  <p className="text-xs text-muted-foreground">{policy.client_file_number}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <ClickablePhone phone={policy.client_phone} />
                            </TableCell>
                            <TableCell className="font-mono">{policy.car_number || '-'}</TableCell>
                            <TableCell>
                              {policy.is_package ? (
                                <div className="flex flex-col gap-1">
                                  <Badge variant="default" className="text-xs gap-1 bg-primary">
                                    <Package className="h-3 w-3" />
                                    باقة ({policy.package_count})
                                  </Badge>
                                  <div className="flex flex-wrap gap-0.5">
                                    {policy.package_types?.map(type => (
                                      <span key={type} className="text-[10px] text-muted-foreground">
                                        {policyTypeLabels[type] || type}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  {policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{policy.company_name_ar || policy.company_name || '-'}</TableCell>
                            <TableCell className="text-xs">
                              {formatDate(policy.start_date)} - {formatDate(policy.end_date)}
                            </TableCell>
                            <TableCell className="font-bold">₪{policy.insurance_price.toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={policy.payment_status === 'paid' ? 'success' : policy.payment_status === 'partial' ? 'warning' : 'destructive'}
                                className="gap-1"
                              >
                                {policy.payment_status === 'paid' && <CheckCircle className="h-3 w-3" />}
                                {policy.payment_status === 'partial' && <Clock className="h-3 w-3" />}
                                {policy.payment_status === 'unpaid' && <AlertCircle className="h-3 w-3" />}
                                {policy.payment_status === 'paid' ? 'مدفوع' : policy.payment_status === 'partial' ? `باقي ₪${policy.remaining.toLocaleString()}` : 'غير مدفوع'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          
                          {/* Expanded Payment Activity Row */}
                          {expandedPolicyId === policy.id && policyPayments[policy.id] && (
                            <TableRow key={`${policy.id}-payments`} className="bg-muted/20">
                              <TableCell colSpan={11} className="p-0">
                                <div className="px-6 py-4 border-t border-dashed">
                                  <div className="flex items-center gap-2 mb-3">
                                    <CreditCard className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-sm">سجل الدفعات</span>
                                    <Badge variant="outline" className="text-xs">
                                      {policyPayments[policy.id].length} دفعة
                                    </Badge>
                                  </div>
                                  
                                  {policyPayments[policy.id].length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">لا توجد دفعات مسجلة</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {policyPayments[policy.id].map((payment, idx) => (
                                        <div 
                                          key={payment.id} 
                                          className="flex items-center gap-4 p-3 rounded-lg bg-background border text-sm"
                                        >
                                          <div className={cn(
                                            "rounded-full p-2",
                                            payment.payment_type === 'cash' ? "bg-success/10 text-success" :
                                            payment.payment_type === 'cheque' || payment.payment_type === 'customer_cheque' ? "bg-warning/10 text-warning" :
                                            "bg-primary/10 text-primary"
                                          )}>
                                            {payment.payment_type === 'cash' ? (
                                              <Banknote className="h-4 w-4" />
                                            ) : (
                                              <CreditCard className="h-4 w-4" />
                                            )}
                                          </div>
                                          <div className="flex-1">
                                            <p className="font-medium">
                                              ₪{payment.amount.toLocaleString()}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {paymentTypeLabels[payment.payment_type] || payment.payment_type}
                                            </p>
                                          </div>
                                          <div className="text-left">
                                            <p className="font-mono text-xs">{formatDate(payment.payment_date)}</p>
                                            <p className="text-xs text-muted-foreground">
                                              أنشئت: {formatDateTime(payment.created_at)}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                      
                                      {/* Summary */}
                                      <div className="flex items-center justify-between pt-2 border-t mt-2">
                                        <span className="text-sm font-medium">المجموع المدفوع:</span>
                                        <span className="font-bold text-success">
                                          ₪{policyPayments[policy.id].reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between p-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      إجمالي: {createdTotalRows} وثيقة/باقة
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreatedPage(p => Math.max(0, p - 1))}
                        disabled={createdPage === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        {createdPage + 1} / {createdTotalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreatedPage(p => p + 1)}
                        disabled={createdPage >= createdTotalPages - 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          {/* Renewals Tab */}
          <TabsContent value="renewals" className="space-y-4 mt-6">
            {/* Summary Cards */}
            {renewalsSummary && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">إجمالي المنتهية</p>
                  <p className="text-2xl font-bold text-primary">{renewalsSummary.total_expiring}</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">لم يتم التواصل</p>
                  <p className="text-2xl font-bold text-gray-600">{renewalsSummary.not_contacted}</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">تم إرسال SMS</p>
                  <p className="text-2xl font-bold text-blue-600">{renewalsSummary.sms_sent}</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">تم الاتصال</p>
                  <p className="text-2xl font-bold text-amber-600">{renewalsSummary.called}</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">تم التجديد</p>
                  <p className="text-2xl font-bold text-green-600">{renewalsSummary.renewed}</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">غير مهتم</p>
                  <p className="text-2xl font-bold text-red-600">{renewalsSummary.not_interested}</p>
                </Card>
              </div>
            )}

            {/* Filters */}
            <Card className="p-4">
              <div className="flex flex-wrap gap-3">
                <Input
                  type="month"
                  value={renewalsMonth}
                  onChange={(e) => { setRenewalsMonth(e.target.value); setRenewalsPage(0); }}
                  className="w-[160px]"
                />

                <Select value={renewalsDaysFilter} onValueChange={(v) => { setRenewalsDaysFilter(v); setRenewalsPage(0); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">كل الشهر</SelectItem>
                    <SelectItem value="7">خلال 7 أيام</SelectItem>
                    <SelectItem value="14">خلال 14 يوم</SelectItem>
                    <SelectItem value="30">خلال 30 يوم</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={renewalsPolicyTypeFilter} onValueChange={(v) => { setRenewalsPolicyTypeFilter(v); setRenewalsPage(0); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    {Object.entries(policyTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={renewalsCreatedByFilter} onValueChange={(v) => { setRenewalsCreatedByFilter(v); setRenewalsPage(0); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="أنشأه" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المستخدمين</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث..."
                    value={renewalsSearch}
                    onChange={(e) => { setRenewalsSearch(e.target.value); setRenewalsPage(0); }}
                    className="pr-10"
                  />
                </div>

                <div className="flex gap-2 mr-auto">
                  <Button variant="outline" onClick={handleGeneratePdf} disabled={generatingPdf}>
                    {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Download className="h-4 w-4 ml-2" />}
                    تصدير PDF
                  </Button>
                  {isAdmin && (
                    <Button onClick={handleSendReminders} disabled={sendingReminders}>
                      {sendingReminders ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
                      إرسال تذكيرات SMS
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              {renewalsLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : renewals.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">لا توجد وثائق منتهية في هذه الفترة</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                        <TableHead className="text-right">الأيام المتبقية</TableHead>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-right">الهاتف</TableHead>
                        <TableHead className="text-right">السيارة</TableHead>
                        <TableHead className="text-right">النوع</TableHead>
                        <TableHead className="text-right">الشركة</TableHead>
                        <TableHead className="text-right">السعر</TableHead>
                        <TableHead className="text-right">أنشأها</TableHead>
                        <TableHead className="text-right">حالة التجديد</TableHead>
                        <TableHead className="text-right">ملاحظات</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {renewals.map(policy => (
                        <TableRow key={policy.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono">{formatDate(policy.end_date)}</TableCell>
                          <TableCell>
                            <Badge variant={policy.days_remaining <= 7 ? 'destructive' : policy.days_remaining <= 14 ? 'warning' : 'secondary'}>
                              {policy.days_remaining} يوم
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{policy.client_name}</p>
                              {policy.client_file_number && (
                                <p className="text-xs text-muted-foreground">{policy.client_file_number}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ClickablePhone phone={policy.client_phone} />
                          </TableCell>
                          <TableCell className="font-mono">{policy.car_number || '-'}</TableCell>
                          <TableCell>
                            {policy.is_package ? (
                              <div className="flex flex-col gap-1">
                                <Badge variant="default" className="text-xs gap-1 bg-primary">
                                  <Package className="h-3 w-3" />
                                  باقة ({policy.package_count})
                                </Badge>
                                <div className="flex flex-wrap gap-0.5">
                                  {policy.package_types?.map(type => (
                                    <span key={type} className="text-[10px] text-muted-foreground">
                                      {policyTypeLabels[type] || type}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                {policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{policy.company_name_ar || policy.company_name || '-'}</TableCell>
                          <TableCell className="font-bold">₪{policy.insurance_price.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{policy.created_by_name || '-'}</TableCell>
                          <TableCell>
                            <Badge className={cn('border', renewalStatusColors[policy.renewal_status])}>
                              {renewalStatusLabels[policy.renewal_status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                            {policy.renewal_notes || '-'}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedRenewal(policy);
                                  setNewStatus(policy.renewal_status);
                                  setStatusNotes(policy.renewal_notes || '');
                                  setUpdateStatusOpen(true);
                                }}>
                                  <MessageSquare className="h-4 w-4 ml-2" />
                                  تحديث الحالة
                                </DropdownMenuItem>
                                {policy.client_phone && (
                                  <>
                                    <DropdownMenuItem 
                                      onClick={() => handleSendSingleSms(policy)}
                                      disabled={sendingSingleSms === policy.id}
                                    >
                                      {sendingSingleSms === policy.id ? (
                                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                                      ) : (
                                        <Send className="h-4 w-4 ml-2" />
                                      )}
                                      إرسال تذكير SMS
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                      <a href={`tel:${policy.client_phone}`}>
                                        <Phone className="h-4 w-4 ml-2" />
                                        اتصال
                                      </a>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between p-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      إجمالي: {renewalsTotalRows} وثيقة/باقة
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRenewalsPage(p => Math.max(0, p - 1))}
                        disabled={renewalsPage === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        {renewalsPage + 1} / {renewalsTotalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRenewalsPage(p => p + 1)}
                        disabled={renewalsPage >= renewalsTotalPages - 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Update Status Dialog */}
      <Dialog open={updateStatusOpen} onOpenChange={setUpdateStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحديث حالة التجديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">العميل: {selectedRenewal?.client_name}</p>
              <p className="text-sm text-muted-foreground">السيارة: {selectedRenewal?.car_number}</p>
            </div>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الحالة" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(renewalStatusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="ملاحظات..."
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateStatusOpen(false)}>إلغاء</Button>
            <Button onClick={handleUpdateStatus} disabled={updatingStatus || !newStatus}>
              {updatingStatus && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
