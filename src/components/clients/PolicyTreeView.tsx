import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { 
  ChevronDown, 
  ChevronLeft, 
  Eye, 
  Package,
  FileText,
  Car,
  Zap,
  Calendar,
  Building2,
  ArrowUpDown,
  Hash,
  AlertCircle,
  CheckCircle,
  Banknote,
  List,
  Send,
  Loader2
} from 'lucide-react';
import { ExpiryBadge } from '@/components/shared/ExpiryBadge';
import { PackagePaymentModal } from './PackagePaymentModal';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  group_id: string | null;
  company: { name: string; name_ar: string | null } | null;
  car: { id: string; car_number: string } | null;
  creator: { full_name: string | null; email: string } | null;
  branch_id?: string | null;
}

interface PolicyTreeViewProps {
  policies: PolicyRecord[];
  onPolicyClick: (policyId: string) => void;
  onPaymentAdded?: () => void;
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

const policyTypeIcons: Record<string, string> = {
  ELZAMI: '🛡️',
  THIRD_FULL: '🚗',
  ROAD_SERVICE: '🛣️',
  ACCIDENT_FEE_EXEMPTION: '💰',
  HEALTH: '🏥',
  LIFE: '❤️',
  PROPERTY: '🏠',
  TRAVEL: '✈️',
  BUSINESS: '💼',
  OTHER: '📄',
};

// Main policy types (parents)
const MAIN_POLICY_TYPES = ['ELZAMI', 'THIRD_FULL', 'HEALTH', 'LIFE', 'PROPERTY', 'TRAVEL', 'BUSINESS', 'OTHER'];
// Add-on types (children)
const ADDON_POLICY_TYPES = ['ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION'];

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-GB');
};

const getPolicyStatus = (policy: PolicyRecord) => {
  if (policy.cancelled) return { label: 'ملغاة', variant: 'destructive' as const, isActive: false, priority: 4, color: 'text-destructive' };
  if (policy.transferred) return { label: 'محولة', variant: 'warning' as const, isActive: false, priority: 3, color: 'text-amber-600' };
  const endDate = new Date(policy.end_date);
  const today = new Date();
  if (endDate < today) return { label: 'منتهية', variant: 'secondary' as const, isActive: false, priority: 2, color: 'text-muted-foreground' };
  return { label: 'سارية', variant: 'success' as const, isActive: true, priority: 1, color: 'text-success' };
};

interface PolicyGroup {
  groupId: string | null;
  mainPolicy: PolicyRecord | null;
  addons: PolicyRecord[];
  isActive: boolean;
  newestDate: Date;
  priority: number; // 1=active, 2=expired, 3=transferred, 4=cancelled
}

interface PaymentInfo {
  [policyId: string]: { paid: number; remaining: number };
}

export function PolicyTreeView({ policies, onPolicyClick, onPaymentAdded }: PolicyTreeViewProps) {
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({});
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [packagePaymentOpen, setPackagePaymentOpen] = useState(false);
  const [selectedPackagePolicyIds, setSelectedPackagePolicyIds] = useState<string[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [sendingPackage, setSendingPackage] = useState<string | null>(null);
  const [sendingPolicy, setSendingPolicy] = useState<string | null>(null);

  // Fetch payment info for all policies
  useEffect(() => {
    const fetchPaymentInfo = async () => {
      if (policies.length === 0) {
        setPaymentInfo({});
        setLoadingPayments(false);
        return;
      }

      setLoadingPayments(true);
      const policyIds = policies.map(p => p.id);
      
      try {
        const { data: paymentsData } = await supabase
          .from('policy_payments')
          .select('policy_id, amount, refused')
          .in('policy_id', policyIds);

        const info: PaymentInfo = {};
        policies.forEach(p => {
          const policyPayments = (paymentsData || [])
            .filter(pay => pay.policy_id === p.id && !pay.refused);
          const paid = policyPayments.reduce((sum, pay) => sum + pay.amount, 0);
          info[p.id] = {
            paid,
            remaining: p.insurance_price - paid,
          };
        });

        setPaymentInfo(info);
      } catch (error) {
        console.error('Error fetching payment info:', error);
      } finally {
        setLoadingPayments(false);
      }
    };

    fetchPaymentInfo();
  }, [policies]);

  // Group policies by group_id
  const groupedPolicies = useMemo(() => {
    const groups: Map<string, PolicyGroup> = new Map();
    const standaloneAddons: PolicyRecord[] = [];
    
    // First pass: identify main policies and create groups
    policies.forEach(policy => {
      const isMainType = MAIN_POLICY_TYPES.includes(policy.policy_type_parent);
      const isAddonType = ADDON_POLICY_TYPES.includes(policy.policy_type_parent);
      const status = getPolicyStatus(policy);
      
      if (isMainType) {
        const groupKey = policy.group_id || `standalone-${policy.id}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            groupId: policy.group_id,
            mainPolicy: policy,
            addons: [],
            isActive: status.isActive,
            newestDate: new Date(policy.start_date),
            priority: status.priority
          });
        } else {
          // If there's already a main policy in this group, compare dates
          const existing = groups.get(groupKey)!;
          const existingDate = new Date(existing.mainPolicy?.start_date || 0);
          const newDate = new Date(policy.start_date);
          if (newDate > existingDate) {
            // Move old main to be handled as standalone
            if (existing.mainPolicy) {
              const oldStatus = getPolicyStatus(existing.mainPolicy);
              groups.set(`standalone-${existing.mainPolicy.id}`, {
                groupId: null,
                mainPolicy: existing.mainPolicy,
                addons: [],
                isActive: oldStatus.isActive,
                newestDate: existingDate,
                priority: oldStatus.priority
              });
            }
            existing.mainPolicy = policy;
            existing.isActive = status.isActive;
            existing.newestDate = newDate;
            existing.priority = status.priority;
          } else {
            // This is an older policy, make it standalone
            groups.set(`standalone-${policy.id}`, {
              groupId: null,
              mainPolicy: policy,
              addons: [],
              isActive: status.isActive,
              newestDate: newDate,
              priority: status.priority
            });
          }
        }
      } else if (isAddonType && policy.group_id) {
        // This is an add-on with a group
        if (!groups.has(policy.group_id)) {
          // Create a placeholder group for the add-on
          groups.set(policy.group_id, {
            groupId: policy.group_id,
            mainPolicy: null,
            addons: [policy],
            isActive: status.isActive,
            newestDate: new Date(policy.start_date),
            priority: status.priority
          });
        } else {
          groups.get(policy.group_id)!.addons.push(policy);
        }
      } else if (isAddonType && !policy.group_id) {
        // Standalone add-on without a group
        standaloneAddons.push(policy);
      }
    });
    
    // Convert to array and sort
    const groupArray = Array.from(groups.values());
    
    // Add standalone add-ons as their own groups
    standaloneAddons.forEach(addon => {
      const status = getPolicyStatus(addon);
      groupArray.push({
        groupId: null,
        mainPolicy: null,
        addons: [addon],
        isActive: status.isActive,
        newestDate: new Date(addon.start_date),
        priority: status.priority
      });
    });
    
    // Sort: by priority first (1=active, 2=expired, 3=transferred, 4=cancelled), then by newest date descending
    groupArray.sort((a, b) => {
      // First sort by priority (lower = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by newest date descending
      return b.newestDate.getTime() - a.newestDate.getTime();
    });
    
    return groupArray;
  }, [policies]);

  // Track which groups are expanded - active ones are open by default
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const activeGroups = new Set<string>();
    groupedPolicies.forEach((group, index) => {
      if (group.isActive) {
        activeGroups.add(`group-${index}`);
      }
    });
    return activeGroups;
  });

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const handlePackagePayment = (e: React.MouseEvent, policyIds: string[], branchId: string | null) => {
    e.stopPropagation();
    setSelectedPackagePolicyIds(policyIds);
    setSelectedBranchId(branchId);
    setPackagePaymentOpen(true);
  };

  const getPackagePaymentStatus = (group: PolicyGroup) => {
    const allPolicyIds = [
      ...(group.mainPolicy ? [group.mainPolicy.id] : []),
      ...group.addons.map(a => a.id)
    ];
    
    let totalPrice = 0;
    let totalPaid = 0;
    
    allPolicyIds.forEach(id => {
      const policy = policies.find(p => p.id === id);
      if (policy) {
        totalPrice += policy.insurance_price;
        totalPaid += paymentInfo[id]?.paid || 0;
      }
    });
    
    const remaining = totalPrice - totalPaid;
    const isPaid = remaining <= 0;
    const percentage = totalPrice > 0 ? Math.round((totalPaid / totalPrice) * 100) : 0;
    
    return { totalPrice, totalPaid, remaining, isPaid, percentage };
  };

  // Send package invoice/files to customer
  const handleSendPackageInvoice = async (e: React.MouseEvent, policyIds: string[], groupKey: string) => {
    e.stopPropagation();
    setSendingPackage(groupKey);
    try {
      const { data, error } = await supabase.functions.invoke('send-package-invoice-sms', {
        body: { policy_ids: policyIds }
      });
      
      if (error) {
        const errorBody = error.context?.body ? 
          (typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body) : null;
        throw new Error(errorBody?.error || 'فشل في الإرسال');
      }
      
      if (data?.success) {
        toast.success('تم إرسال الفواتير للعميل');
      } else {
        toast.info(data?.message || 'تم الإرسال');
      }
    } catch (err: any) {
      console.error('Error sending package invoice:', err);
      toast.error(err.message || 'فشل في الإرسال');
    } finally {
      setSendingPackage(null);
    }
  };

  // Send single policy invoice/files to customer
  const handleSendPolicyInvoice = async (e: React.MouseEvent, policyId: string) => {
    e.stopPropagation();
    setSendingPolicy(policyId);
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice-sms', {
        body: { policy_id: policyId, force_resend: true }
      });
      
      if (error) {
        // Try to parse error message from various formats
        let errorMessage = 'فشل في الإرسال';
        try {
          if (error.context?.body) {
            const body = typeof error.context.body === 'string' 
              ? JSON.parse(error.context.body) 
              : error.context.body;
            errorMessage = body?.error || errorMessage;
          }
        } catch {
          // Keep default error message
        }
        throw new Error(errorMessage);
      }
      
      // Check if the response indicates an error
      if (data?.error) {
        throw new Error(data.error);
      }
      
      if (data?.success) {
        toast.success('تم إرسال الفاتورة للعميل');
      } else {
        toast.info(data?.message || 'تم الإرسال');
      }
    } catch (err: any) {
      console.error('Error sending policy invoice:', err);
      toast.error(err.message || 'فشل في الإرسال');
    } finally {
      setSendingPolicy(null);
    }
  };

  if (policies.length === 0) {
    return (
      <Card className="text-center py-12">
        <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-muted-foreground">لا توجد وثائق تأمين</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groupedPolicies.map((group, groupIndex) => {
        const groupKey = `group-${groupIndex}`;
        const isExpanded = expandedGroups.has(groupKey);
        const hasAddons = group.addons.length > 0;
        const hasMainPolicy = group.mainPolicy !== null;
        const isPackage = hasMainPolicy && hasAddons;
        const totalPrice = (group.mainPolicy?.insurance_price || 0) + 
          group.addons.reduce((sum, a) => sum + a.insurance_price, 0);
        
        // Get payment status for this package/policy
        const paymentStatus = isPackage || hasMainPolicy 
          ? getPackagePaymentStatus(group) 
          : { totalPrice: 0, totalPaid: 0, remaining: 0, isPaid: true, percentage: 100 };
        
        const allPolicyIds = [
          ...(group.mainPolicy ? [group.mainPolicy.id] : []),
          ...group.addons.map(a => a.id)
        ];
        
        // For groups that only have add-ons without a main policy
        if (!hasMainPolicy && hasAddons) {
          // Render add-ons as standalone items
          return group.addons.map(addon => (
            <PolicyRow
              key={addon.id}
              policy={addon}
              isAddon={false}
              onPolicyClick={onPolicyClick}
              paymentInfo={paymentInfo[addon.id]}
              onSendInvoice={handleSendPolicyInvoice}
              isSending={sendingPolicy === addon.id}
            />
          ));
        }
        
        // Single policy without add-ons
        if (!hasAddons && hasMainPolicy) {
          return (
            <PolicyRow
              key={group.mainPolicy!.id}
              policy={group.mainPolicy!}
              isAddon={false}
              onPolicyClick={onPolicyClick}
              paymentInfo={paymentInfo[group.mainPolicy!.id]}
              onSendInvoice={handleSendPolicyInvoice}
              isSending={sendingPolicy === group.mainPolicy!.id}
            />
          );
        }
        
        // Package with main policy + add-ons
        return (
          <Card 
            key={groupKey}
            className={cn(
              "overflow-hidden transition-all",
              group.isActive ? "border-primary/30 shadow-sm" : "opacity-80",
              !paymentStatus.isPaid && group.isActive && "border-l-4 border-l-destructive"
            )}
          >
            <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(groupKey)}>
              <CollapsibleTrigger asChild>
                <div className={cn(
                  "flex flex-wrap items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                  group.isActive && "bg-primary/5"
                )}>
                  {/* Expand/Collapse Icon */}
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  {/* Package Badge */}
                  <div className="shrink-0">
                    <Badge variant="outline" className="gap-1.5 bg-primary/10 text-primary border-primary/20">
                      <Package className="h-3.5 w-3.5" />
                      باقة
                    </Badge>
                  </div>
                  
                  {/* Payment Status Indicator (visible when collapsed) */}
                  {!paymentStatus.isPaid && (
                    <Badge variant="destructive" className="gap-1 shrink-0">
                      <AlertCircle className="h-3 w-3" />
                      غير مدفوع ({paymentStatus.percentage}%)
                    </Badge>
                  )}
                  {paymentStatus.isPaid && (
                    <Badge variant="success" className="gap-1 shrink-0">
                      <CheckCircle className="h-3 w-3" />
                      مدفوع
                    </Badge>
                  )}
                  
                  {/* Quick Preview HoverCard */}
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <List className="h-3.5 w-3.5 ml-1" />
                        معاينة
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80" align="start">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          محتويات الباقة
                        </h4>
                        <div className="space-y-1.5">
                          {/* Main Policy */}
                          <div 
                            className="flex items-center justify-between p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted"
                            onClick={() => onPolicyClick(group.mainPolicy!.id)}
                          >
                            <div className="flex items-center gap-2">
                              <span>{policyTypeIcons[group.mainPolicy!.policy_type_parent]}</span>
                              <span className="text-sm font-medium">
                                {policyTypeLabels[group.mainPolicy!.policy_type_parent]}
                              </span>
                            </div>
                            <span className="text-sm font-bold">₪{group.mainPolicy!.insurance_price.toLocaleString()}</span>
                          </div>
                          {/* Add-ons */}
                          {group.addons.map(addon => (
                            <div 
                              key={addon.id}
                              className="flex items-center justify-between p-2 rounded bg-orange-50 cursor-pointer hover:bg-orange-100 mr-3"
                              onClick={() => onPolicyClick(addon.id)}
                            >
                              <div className="flex items-center gap-2">
                                <Zap className="h-3 w-3 text-orange-500" />
                                <span className="text-sm">
                                  {policyTypeLabels[addon.policy_type_parent]}
                                </span>
                              </div>
                              <span className="text-sm font-medium">₪{addon.insurance_price.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-2 border-t flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">الإجمالي</span>
                          <span className="font-bold">₪{totalPrice.toLocaleString()}</span>
                        </div>
                        {!paymentStatus.isPaid && (
                          <div className="flex justify-between items-center text-destructive">
                            <span className="text-sm">المتبقي</span>
                            <span className="font-bold">₪{paymentStatus.remaining.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                  
                  {/* Main Policy Info */}
                  <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                    <div>
                      <Badge className={cn("border", policyTypeColors[group.mainPolicy!.policy_type_parent])}>
                        {policyTypeLabels[group.mainPolicy!.policy_type_parent] || group.mainPolicy!.policy_type_parent}
                      </Badge>
                    </div>
                    <div className="text-sm hidden sm:block">
                      <span className="text-muted-foreground">السيارة: </span>
                      <span className="font-mono">{group.mainPolicy!.car?.car_number || '-'}</span>
                    </div>
                    <div className="text-sm flex items-center gap-2">
                      <span className="text-muted-foreground">الإجمالي: </span>
                      <span className="font-bold">₪{totalPrice.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {/* Add-ons Count */}
                  <div className="shrink-0">
                    <Badge variant="secondary" className="gap-1">
                      <Zap className="h-3 w-3" />
                      {group.addons.length} إضافات
                    </Badge>
                  </div>
                  
                  {/* Package Pay Button */}
                  {!paymentStatus.isPaid && group.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 shrink-0 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                      onClick={(e) => handlePackagePayment(e, allPolicyIds, group.mainPolicy?.branch_id || null)}
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      دفع للباقة
                    </Button>
                  )}
                  
                  {/* Send Package Invoice Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={(e) => handleSendPackageInvoice(e, allPolicyIds, groupKey)}
                    disabled={sendingPackage === groupKey}
                  >
                    {sendingPackage === groupKey ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    إرسال للعميل
                  </Button>
                  
                  {/* Status */}
                  <div className="shrink-0">
                    <ExpiryBadge endDate={group.mainPolicy!.end_date} cancelled={group.mainPolicy!.cancelled} />
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="border-t">
                  {/* Main Policy Row */}
                  <div 
                    className="flex items-center gap-3 p-4 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors border-b"
                    onClick={() => onPolicyClick(group.mainPolicy!.id)}
                  >
                    <div className="w-5" /> {/* Spacer for alignment */}
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <Badge variant="outline" className="text-xs bg-primary/5">الوثيقة الأساسية</Badge>
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                      <div>
                        <Badge className={cn("border text-xs", policyTypeColors[group.mainPolicy!.policy_type_parent])}>
                          {policyTypeLabels[group.mainPolicy!.policy_type_parent]}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">من: </span>
                        {formatDate(group.mainPolicy!.start_date)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">إلى: </span>
                        {formatDate(group.mainPolicy!.end_date)}
                      </div>
                      <div className="font-semibold">₪{group.mainPolicy!.insurance_price.toLocaleString()}</div>
                      <div className="text-muted-foreground text-xs">
                        {group.mainPolicy!.creator?.full_name || group.mainPolicy!.creator?.email || '-'}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Add-on Rows */}
                  {group.addons.map((addon, addonIndex) => (
                    <div 
                      key={addon.id}
                      className={cn(
                        "flex items-center gap-3 p-4 pr-12 cursor-pointer hover:bg-muted/30 transition-colors",
                        addonIndex < group.addons.length - 1 && "border-b border-dashed"
                      )}
                      onClick={() => onPolicyClick(addon.id)}
                    >
                      <div className="w-5 flex justify-center">
                        <div className="w-px h-full bg-border" />
                      </div>
                      <Zap className="h-4 w-4 text-orange-500 shrink-0" />
                      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">إضافة</Badge>
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                        <div>
                          <Badge className={cn("border text-xs", policyTypeColors[addon.policy_type_parent])}>
                            {policyTypeLabels[addon.policy_type_parent]}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">من: </span>
                          {formatDate(addon.start_date)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">إلى: </span>
                          {formatDate(addon.end_date)}
                        </div>
                        <div className="font-semibold">₪{addon.insurance_price.toLocaleString()}</div>
                        <div className="text-muted-foreground text-xs">
                          {addon.creator?.full_name || addon.creator?.email || '-'}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
      
      {/* Package Payment Modal */}
      <PackagePaymentModal
        open={packagePaymentOpen}
        onOpenChange={setPackagePaymentOpen}
        policyIds={selectedPackagePolicyIds}
        branchId={selectedBranchId}
        onSuccess={() => {
          // Refresh payment info
          if (onPaymentAdded) onPaymentAdded();
          // Refetch payment info
          const fetchPaymentInfo = async () => {
            if (policies.length === 0) return;
            const policyIds = policies.map(p => p.id);
            const { data: paymentsData } = await supabase
              .from('policy_payments')
              .select('policy_id, amount, refused')
              .in('policy_id', policyIds);

            const info: PaymentInfo = {};
            policies.forEach(p => {
              const policyPayments = (paymentsData || [])
                .filter(pay => pay.policy_id === p.id && !pay.refused);
              const paid = policyPayments.reduce((sum, pay) => sum + pay.amount, 0);
              info[p.id] = {
                paid,
                remaining: p.insurance_price - paid,
              };
            });
            setPaymentInfo(info);
          };
          fetchPaymentInfo();
        }}
      />
    </div>
  );
}

// Modern card-style row for standalone policies
function PolicyRow({ 
  policy, 
  isAddon,
  onPolicyClick,
  paymentInfo,
  onSendInvoice,
  isSending
}: { 
  policy: PolicyRecord; 
  isAddon: boolean;
  onPolicyClick: (id: string) => void;
  paymentInfo?: { paid: number; remaining: number };
  onSendInvoice?: (e: React.MouseEvent, policyId: string) => void;
  isSending?: boolean;
}) {
  const status = getPolicyStatus(policy);
  const isPaid = !paymentInfo || paymentInfo.remaining <= 0;
  
  return (
    <Card 
      className={cn(
        "group cursor-pointer transition-all duration-200 overflow-hidden",
        isAddon && "mr-6 border-r-4 border-r-orange-400",
        status.isActive 
          ? "bg-card hover:shadow-lg hover:shadow-primary/10 hover:border-primary/30" 
          : "bg-muted/30 hover:bg-muted/50",
        status.priority === 3 && "border-amber-500/30 bg-amber-50/50",
        status.priority === 4 && "border-destructive/30 bg-destructive/5",
        !isPaid && status.isActive && "border-l-4 border-l-destructive"
      )}
      onClick={() => onPolicyClick(policy.id)}
    >
      <div className="p-4">
        {/* Top Row - Main Info */}
        <div className="flex items-center gap-4 mb-3">
          {/* Policy Type with Icon */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{policyTypeIcons[policy.policy_type_parent] || '📄'}</span>
            <Badge className={cn("border font-semibold", policyTypeColors[policy.policy_type_parent])}>
              {policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent}
            </Badge>
            {policy.transferred && (
              <Badge variant="warning" className="gap-1">
                <ArrowUpDown className="h-3 w-3" />
                محولة
              </Badge>
            )}
          </div>
          
          {/* Payment Status */}
          {!isPaid && status.isActive && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              متبقي ₪{paymentInfo?.remaining.toLocaleString()}
            </Badge>
          )}
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* Send Invoice Button */}
          {onSendInvoice && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 shrink-0"
              onClick={(e) => onSendInvoice(e, policy.id)}
              disabled={isSending}
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              إرسال للعميل
            </Button>
          )}
          
          {/* Status */}
          <ExpiryBadge endDate={policy.end_date} cancelled={policy.cancelled} />
          <Badge variant={status.variant} className="font-medium">
            {status.label}
          </Badge>
          
          {/* View Button */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Eye className="h-4 w-4 ml-1" />
            عرض
          </Button>
        </div>
        
        {/* Bottom Row - Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          {/* Policy Number */}
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">رقم الوثيقة</p>
              <p className="font-mono font-medium ltr-nums">{policy.policy_number || '-'}</p>
            </div>
          </div>
          
          {/* Company */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">الشركة</p>
              <p className="font-medium truncate">{policy.company?.name_ar || policy.company?.name || '-'}</p>
            </div>
          </div>
          
          {/* Car */}
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">السيارة</p>
              <p className="font-mono font-medium ltr-nums">{policy.car?.car_number || '-'}</p>
            </div>
          </div>
          
          {/* Dates */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">الفترة</p>
              <p className="font-medium ltr-nums">{formatDate(policy.start_date)} → {formatDate(policy.end_date)}</p>
            </div>
          </div>
          
          {/* Price */}
          <div className="flex items-center justify-end gap-2">
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">السعر</p>
              <p className={cn(
                "text-lg font-bold ltr-nums",
                status.isActive ? "text-primary" : "text-muted-foreground"
              )}>
                ₪{policy.insurance_price.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
