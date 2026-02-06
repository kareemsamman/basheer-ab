import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ChevronDown, 
  Eye, 
  Package,
  FileText,
  Car,
  Calendar,
  Building2,
  MoreVertical,
  User,
  Banknote,
  Send,
  Loader2
} from 'lucide-react';
import { ExpiryBadge } from '@/components/shared/ExpiryBadge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PolicyRecord {
  id: string;
  client_id: string;
  car_id: string;
  company_id: string;
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  profit: number | null;
  payed_for_company: number | null;
  elzami_cost: number | null;
  cancelled: boolean | null;
  transferred: boolean | null;
  transferred_car_number: string | null;
  is_under_24: boolean | null;
  notes: string | null;
  broker_id: string | null;
  created_by_admin_id: string | null;
  group_id: string | null;
  branch_id: string | null;
  clients?: {
    id: string;
    full_name: string;
    less_than_24: boolean | null;
    phone_number?: string | null;
  };
  cars?: {
    id: string;
    car_number: string;
    car_type: string | null;
    car_value: number | null;
    year: number | null;
    manufacturer_name?: string | null;
  };
  insurance_companies?: {
    id: string;
    name: string;
    name_ar: string | null;
  };
  created_by?: {
    full_name: string | null;
    email: string;
  };
}

interface PolicyCardsViewProps {
  policies: PolicyRecord[];
  loading: boolean;
  onPolicyClick: (policyId: string) => void;
  onEditPolicy: (policy: PolicyRecord) => void;
  onDeletePolicy: (policy: PolicyRecord) => void;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
};

const policyChildLabels: Record<string, string> = {
  THIRD: 'ثالث',
  FULL: 'شامل',
};

const policyTypeColors: Record<string, string> = {
  ELZAMI: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  THIRD_FULL: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  ROAD_SERVICE: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  ACCIDENT_FEE_EXEMPTION: 'bg-green-500/10 text-green-600 border-green-500/20',
};

const policyTypeIcons: Record<string, string> = {
  ELZAMI: '🛡️',
  THIRD_FULL: '🚗',
  ROAD_SERVICE: '🛣️',
  ACCIDENT_FEE_EXEMPTION: '💰',
};

const MAIN_POLICY_TYPES = ['ELZAMI', 'THIRD_FULL'];
const ADDON_POLICY_TYPES = ['ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION'];

const getDisplayLabel = (policy: PolicyRecord) => {
  if (policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child) {
    return policyChildLabels[policy.policy_type_child] || policy.policy_type_child;
  }
  return policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent;
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-GB');
};

const getPolicyStatus = (policy: PolicyRecord) => {
  if (policy.cancelled) return { label: 'ملغاة', variant: 'destructive' as const, isActive: false, priority: 4 };
  if (policy.transferred) return { label: 'محولة', variant: 'warning' as const, isActive: false, priority: 3 };
  const endDate = new Date(policy.end_date);
  const today = new Date();
  if (endDate < today) return { label: 'منتهية', variant: 'secondary' as const, isActive: false, priority: 2 };
  return { label: 'سارية', variant: 'success' as const, isActive: true, priority: 1 };
};

interface PolicyGroup {
  groupId: string | null;
  mainPolicy: PolicyRecord | null;
  addons: PolicyRecord[];
  isActive: boolean;
  newestDate: Date;
  priority: number;
  client: PolicyRecord['clients'];
  car: PolicyRecord['cars'];
}

interface PaymentInfo {
  [policyId: string]: { paid: number; remaining: number };
}

export function PolicyCardsView({ 
  policies, 
  loading,
  onPolicyClick, 
  onEditPolicy,
  onDeletePolicy 
}: PolicyCardsViewProps) {
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({});
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
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
    
    policies.forEach(policy => {
      const isMainType = MAIN_POLICY_TYPES.includes(policy.policy_type_parent);
      const status = getPolicyStatus(policy);
      
      if (policy.group_id) {
        if (!groups.has(policy.group_id)) {
          groups.set(policy.group_id, {
            groupId: policy.group_id,
            mainPolicy: null,
            addons: [],
            isActive: status.isActive,
            newestDate: new Date(policy.start_date),
            priority: status.priority,
            client: policy.clients,
            car: policy.cars,
          });
        }
        
        const group = groups.get(policy.group_id)!;
        
        if (isMainType) {
          if (!group.mainPolicy) {
            group.mainPolicy = policy;
          } else {
            const currentMainType = group.mainPolicy.policy_type_parent;
            if (policy.policy_type_parent === 'THIRD_FULL' && currentMainType !== 'THIRD_FULL') {
              group.addons.push(group.mainPolicy);
              group.mainPolicy = policy;
            } else {
              group.addons.push(policy);
            }
          }
        } else {
          group.addons.push(policy);
        }
        
        if (status.priority < group.priority) {
          group.priority = status.priority;
          group.isActive = status.isActive;
        }
        if (new Date(policy.start_date) > group.newestDate) {
          group.newestDate = new Date(policy.start_date);
        }
      } else {
        groups.set(`standalone-${policy.id}`, {
          groupId: null,
          mainPolicy: policy,
          addons: [],
          isActive: status.isActive,
          newestDate: new Date(policy.start_date),
          priority: status.priority,
          client: policy.clients,
          car: policy.cars,
        });
      }
    });
    
    const groupArray = Array.from(groups.values());
    groupArray.sort((a, b) => b.newestDate.getTime() - a.newestDate.getTime());
    
    return groupArray;
  }, [policies]);

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

  const getPackagePaymentStatus = (group: PolicyGroup) => {
    const allPolicyIds = [
      ...(group.mainPolicy ? [group.mainPolicy.id] : []),
      ...group.addons.map(a => a.id)
    ];
    
    let totalPrice = 0;
    let debtPrice = 0;
    let totalPaid = 0;
    
    allPolicyIds.forEach(id => {
      const policy = policies.find(p => p.id === id);
      if (policy) {
        totalPrice += policy.insurance_price;
        if (policy.policy_type_parent !== 'ELZAMI') {
          debtPrice += policy.insurance_price;
        }
        totalPaid += paymentInfo[id]?.paid || 0;
      }
    });
    
    const remaining = Math.max(0, debtPrice - totalPaid);
    const isPaid = remaining <= 0;
    
    return { totalPrice, totalPaid, remaining, isPaid };
  };

  const handleSendInvoice = async (e: React.MouseEvent, policyId: string) => {
    e.stopPropagation();
    setSendingPolicy(policyId);
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice-sms', {
        body: { policy_id: policyId, force_resend: true }
      });
      
      if (error) throw new Error('فشل في الإرسال');
      if (data?.success) {
        toast.success('تم إرسال الفاتورة للعميل');
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل في الإرسال');
    } finally {
      setSendingPolicy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

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
        
        if (!hasMainPolicy) return null;
        
        const mainPolicy = group.mainPolicy!;
        const status = getPolicyStatus(mainPolicy);
        const paymentStatus = getPackagePaymentStatus(group);
        const allPolicies = [mainPolicy, ...group.addons];

        return (
          <Card 
            key={groupKey}
            className={cn(
              "overflow-hidden transition-all duration-200",
              status.isActive 
                ? "bg-card hover:shadow-lg hover:shadow-primary/10 hover:border-primary/30" 
                : "bg-muted/30 hover:bg-muted/50",
              status.priority === 3 && "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20",
              status.priority === 4 && "border-destructive/30 bg-destructive/5",
              !paymentStatus.isPaid && status.isActive && "border-l-4 border-l-destructive"
            )}
          >
            {/* Card Header */}
            <div 
              className={cn(
                "p-4 cursor-pointer",
                isPackage && "hover:bg-muted/30"
              )}
              onClick={() => isPackage ? toggleGroup(groupKey) : onPolicyClick(mainPolicy.id)}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left Side: Type badges and status */}
                <div className="flex flex-wrap items-center gap-2">
                  {isPackage && (
                    <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary gap-1">
                      <Package className="h-3 w-3" />
                      باقة
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 -rotate-90" />}
                    </Badge>
                  )}
                  
                  {/* Policy type badges */}
                  {allPolicies.slice(0, isPackage ? 3 : 1).map((p, idx) => (
                    <Badge 
                      key={p.id} 
                      className={cn("border text-xs", policyTypeColors[p.policy_type_parent])}
                    >
                      {policyTypeIcons[p.policy_type_parent]} {getDisplayLabel(p)}
                    </Badge>
                  ))}
                  {isPackage && allPolicies.length > 3 && (
                    <Badge variant="outline" className="text-xs">+{allPolicies.length - 3}</Badge>
                  )}
                  
                  {/* Status */}
                  <Badge variant={status.variant}>{status.label}</Badge>
                  
                  {/* Payment status */}
                  {!paymentStatus.isPaid && status.isActive && (
                    <Badge variant="destructive" className="gap-1">
                      <Banknote className="h-3 w-3" />
                      متبقي ₪{paymentStatus.remaining.toLocaleString()}
                    </Badge>
                  )}
                  {paymentStatus.isPaid && status.isActive && (
                    <Badge variant="success" className="gap-1">✓ مدفوع</Badge>
                  )}
                </div>

                {/* Right Side: Price */}
                <div className="text-left shrink-0">
                  <div className="text-lg font-bold">₪{paymentStatus.totalPrice.toLocaleString()}</div>
                  {isPackage && (
                    <div className="text-xs text-muted-foreground">{allPolicies.length} وثائق</div>
                  )}
                </div>
              </div>

              {/* Main Info Row */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {/* Client */}
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{group.client?.full_name || '-'}</span>
                </div>
                
                {/* Car */}
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono">{group.car?.car_number || '-'}</span>
                  {group.car?.manufacturer_name && (
                    <span className="text-muted-foreground text-xs">({group.car.manufacturer_name})</span>
                  )}
                </div>
                
                {/* Company */}
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{mainPolicy.insurance_companies?.name_ar || mainPolicy.insurance_companies?.name || '-'}</span>
                </div>
                
                {/* Dates */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs">
                    {formatDate(mainPolicy.start_date)} ← {formatDate(mainPolicy.end_date)}
                  </span>
                </div>
              </div>

              {/* Notes (if any) */}
              {mainPolicy.notes && (
                <div className="mt-2 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                  📝 {mainPolicy.notes}
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sendingPolicy === mainPolicy.id}
                  onClick={(e) => handleSendInvoice(e, mainPolicy.id)}
                >
                  {sendingPolicy === mainPolicy.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPolicyClick(mainPolicy.id);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onPolicyClick(mainPolicy.id)}>
                      <Eye className="h-4 w-4 ml-2" />
                      عرض التفاصيل
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditPolicy(mainPolicy)}>
                      تعديل
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => onDeletePolicy(mainPolicy)}
                    >
                      حذف
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Expanded Package Content */}
            {isPackage && isExpanded && (
              <div className="border-t">
                <div className="p-2 bg-muted/20 text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  مكونات الباقة ({allPolicies.length} وثائق)
                </div>
                {allPolicies.map((policy, idx) => {
                  const pStatus = getPolicyStatus(policy);
                  const pPayment = paymentInfo[policy.id];
                  const isFirst = idx === 0;
                  
                  return (
                    <div
                      key={policy.id}
                      className={cn(
                        "flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors",
                        idx < allPolicies.length - 1 && "border-b border-dashed"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPolicyClick(policy.id);
                      }}
                    >
                      <div className="w-5 flex justify-center">
                        {isFirst ? (
                          <FileText className="h-4 w-4 text-primary" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                        )}
                      </div>
                      
                      <Badge className={cn("border text-xs shrink-0", policyTypeColors[policy.policy_type_parent])}>
                        {getDisplayLabel(policy)}
                      </Badge>
                      
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <span>{policy.insurance_companies?.name_ar || policy.insurance_companies?.name || '-'}</span>
                        <span>{formatDate(policy.start_date)} ← {formatDate(policy.end_date)}</span>
                        <span className="font-semibold">₪{policy.insurance_price.toLocaleString()}</span>
                        <span className="text-muted-foreground">{policy.created_by?.full_name || '-'}</span>
                      </div>
                      
                      <ExpiryBadge endDate={policy.end_date} />
                      
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}