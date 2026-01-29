import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ChevronLeft, 
  Eye, 
  Calendar,
  Building2,
  Car,
  Banknote,
  FileText,
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowRightLeft,
  MoreVertical,
  Send,
  Loader2,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  transferred_car_number: string | null;
  transferred_to_car_number: string | null;
  transferred_from_policy_id: string | null;
  group_id: string | null;
  company: { name: string; name_ar: string | null } | null;
  car: { id: string; car_number: string } | null;
  creator: { full_name: string | null; email: string } | null;
  branch_id?: string | null;
}

interface PolicyYearTimelineProps {
  policies: PolicyRecord[];
  onPolicyClick: (policyId: string) => void;
  onPaymentAdded?: () => void;
  onTransferPolicy?: (policyId: string) => void;
  onCancelPolicy?: (policyId: string) => void;
  onTransferPackage?: (policyIds: string[]) => void;
  onCancelPackage?: (policyIds: string[]) => void;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات طريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم',
  HEALTH: 'صحي',
  LIFE: 'حياة',
  PROPERTY: 'ممتلكات',
  TRAVEL: 'سفر',
  BUSINESS: 'أعمال',
  OTHER: 'أخرى',
};

const policyTypeColors: Record<string, string> = {
  ELZAMI: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  THIRD_FULL: 'bg-purple-500/10 text-purple-700 border-purple-500/30',
  ROAD_SERVICE: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  ACCIDENT_FEE_EXEMPTION: 'bg-green-500/10 text-green-700 border-green-500/30',
  HEALTH: 'bg-pink-500/10 text-pink-700 border-pink-500/30',
  LIFE: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30',
  PROPERTY: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  TRAVEL: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/30',
  BUSINESS: 'bg-slate-500/10 text-slate-700 border-slate-500/30',
  OTHER: 'bg-gray-500/10 text-gray-700 border-gray-500/30',
};

// Main policy types vs add-ons
const MAIN_POLICY_TYPES = ['ELZAMI', 'THIRD_FULL', 'HEALTH', 'LIFE', 'PROPERTY', 'TRAVEL', 'BUSINESS', 'OTHER'];
const ADDON_POLICY_TYPES = ['ROAD_SERVICE', 'ACCIDENT_FEE_EXEMPTION'];

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-GB');
};

type PolicyStatus = 'active' | 'ended' | 'transferred' | 'cancelled';

const getPolicyStatus = (policy: PolicyRecord): PolicyStatus => {
  if (policy.cancelled) return 'cancelled';
  if (policy.transferred) return 'transferred';
  const endDate = new Date(policy.end_date);
  const today = new Date();
  if (endDate < today) return 'ended';
  return 'active';
};

const getStatusPriority = (status: PolicyStatus): number => {
  switch (status) {
    case 'active': return 1;
    case 'ended': return 2;
    case 'transferred': return 3;
    case 'cancelled': return 4;
  }
};

// Get insurance year label (e.g., "2025 – 2026")
const getInsuranceYear = (startDate: string): string => {
  const date = new Date(startDate);
  const year = date.getFullYear();
  return `${year} – ${year + 1}`;
};

// Get sort key for insurance year (higher = newer)
const getYearSortKey = (startDate: string): number => {
  return new Date(startDate).getFullYear();
};

// Check if this is the current insurance year
const isCurrentYear = (startDate: string): boolean => {
  const policyYear = new Date(startDate).getFullYear();
  const currentYear = new Date().getFullYear();
  return policyYear === currentYear || policyYear === currentYear - 1;
};

interface PaymentInfo {
  [policyId: string]: { paid: number; remaining: number };
}

interface PolicyPackage {
  mainPolicy: PolicyRecord | null;
  addons: PolicyRecord[];
  allPolicyIds: string[];
  status: PolicyStatus;
  totalPrice: number;
  debtPrice: number; // Excludes ELZAMI for debt calculations
}

interface YearGroup {
  yearLabel: string;
  yearSortKey: number;
  isCurrent: boolean;
  packages: PolicyPackage[];
}

export function PolicyYearTimeline({ 
  policies, 
  onPolicyClick, 
  onPaymentAdded,
  onTransferPolicy,
  onCancelPolicy,
  onTransferPackage,
  onCancelPackage
}: PolicyYearTimelineProps) {
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({});
  const [accidentInfo, setAccidentInfo] = useState<Record<string, number>>({});
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [packagePaymentOpen, setPackagePaymentOpen] = useState(false);
  const [selectedPackagePolicyIds, setSelectedPackagePolicyIds] = useState<string[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [sendingPolicy, setSendingPolicy] = useState<string | null>(null);

  // Fetch payment info
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

  // Fetch accident reports count per policy
  useEffect(() => {
    const fetchAccidentInfo = async () => {
      if (policies.length === 0) {
        setAccidentInfo({});
        return;
      }

      const policyIds = policies.map(p => p.id);
      
      try {
        const { data } = await supabase
          .from('accident_reports')
          .select('policy_id')
          .in('policy_id', policyIds);

        const counts: Record<string, number> = {};
        (data || []).forEach(row => {
          counts[row.policy_id] = (counts[row.policy_id] || 0) + 1;
        });

        setAccidentInfo(counts);
      } catch (error) {
        console.error('Error fetching accident info:', error);
      }
    };

    fetchAccidentInfo();
  }, [policies]);

  // Group policies by year, then by package
  const yearGroups = useMemo((): YearGroup[] => {
    const yearMap = new Map<string, PolicyRecord[]>();
    
    // Group by insurance year
    policies.forEach(policy => {
      const yearLabel = getInsuranceYear(policy.start_date);
      if (!yearMap.has(yearLabel)) {
        yearMap.set(yearLabel, []);
      }
      yearMap.get(yearLabel)!.push(policy);
    });

    // Convert to year groups with packages
    const groups: YearGroup[] = [];
    
    yearMap.forEach((yearPolicies, yearLabel) => {
      const packages: PolicyPackage[] = [];
      const groupedByGroupId = new Map<string, PolicyRecord[]>();
      const standalone: PolicyRecord[] = [];

      // Separate by group_id
      yearPolicies.forEach(policy => {
        if (policy.group_id) {
          if (!groupedByGroupId.has(policy.group_id)) {
            groupedByGroupId.set(policy.group_id, []);
          }
          groupedByGroupId.get(policy.group_id)!.push(policy);
        } else {
          standalone.push(policy);
        }
      });

      // Create packages from grouped policies
      groupedByGroupId.forEach((groupPolicies) => {
        // Find main policies - prioritize THIRD_FULL over ELZAMI
        const mainPolicies = groupPolicies.filter(p => MAIN_POLICY_TYPES.includes(p.policy_type_parent));
        let mainPolicy: PolicyRecord | null = null;
        const members: PolicyRecord[] = [];
        
        if (mainPolicies.length > 0) {
          // Prioritize THIRD_FULL as main, then ELZAMI, then others
          mainPolicy = mainPolicies.find(p => p.policy_type_parent === 'THIRD_FULL') 
            || mainPolicies.find(p => p.policy_type_parent === 'ELZAMI')
            || mainPolicies[0];
          
          // Other main policies become "members" (like addons but they're main types)
          mainPolicies.forEach(p => {
            if (p.id !== mainPolicy!.id) {
              members.push(p);
            }
          });
        }
        
        // Real addons (ROAD_SERVICE, ACCIDENT_FEE_EXEMPTION)
        const realAddons = groupPolicies.filter(p => ADDON_POLICY_TYPES.includes(p.policy_type_parent));
        
        // Combine members + real addons
        const addons = [...members, ...realAddons];
        const allIds = groupPolicies.map(p => p.id);
        
        // Package status is determined by main policy, or first addon
        const statusPolicy = mainPolicy || groupPolicies[0];
        const status = getPolicyStatus(statusPolicy);
        const totalPrice = groupPolicies.reduce((sum, p) => sum + p.insurance_price, 0);
        // For debt calculation, exclude ELZAMI (it's paid by company/system)
        const debtPrice = groupPolicies
          .filter(p => p.policy_type_parent !== 'ELZAMI')
          .reduce((sum, p) => sum + p.insurance_price, 0);

        packages.push({
          mainPolicy,
          addons,
          allPolicyIds: allIds,
          status,
          totalPrice,
          debtPrice
        });
      });

      // Create standalone entries
      standalone.forEach(policy => {
        const isElzami = policy.policy_type_parent === 'ELZAMI';
        packages.push({
          mainPolicy: MAIN_POLICY_TYPES.includes(policy.policy_type_parent) ? policy : null,
          addons: ADDON_POLICY_TYPES.includes(policy.policy_type_parent) ? [policy] : [],
          allPolicyIds: [policy.id],
          status: getPolicyStatus(policy),
          totalPrice: policy.insurance_price,
          debtPrice: isElzami ? 0 : policy.insurance_price
        });
      });

      // Sort packages within year: active → ended → transferred → cancelled
      packages.sort((a, b) => {
        const priorityA = getStatusPriority(a.status);
        const priorityB = getStatusPriority(b.status);
        if (priorityA !== priorityB) return priorityA - priorityB;
        // Then by newest start date
        const dateA = a.mainPolicy?.start_date || a.addons[0]?.start_date || '';
        const dateB = b.mainPolicy?.start_date || b.addons[0]?.start_date || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      const sampleStartDate = yearPolicies[0]?.start_date || '';
      groups.push({
        yearLabel,
        yearSortKey: getYearSortKey(sampleStartDate),
        isCurrent: isCurrentYear(sampleStartDate),
        packages
      });
    });

    // Sort years newest → oldest
    groups.sort((a, b) => b.yearSortKey - a.yearSortKey);

    return groups;
  }, [policies]);

  // Track expanded years - current year is expanded by default
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    yearGroups.forEach(group => {
      if (group.isCurrent) {
        expanded.add(group.yearLabel);
      }
    });
    // If no current year, expand the first (newest)
    if (expanded.size === 0 && yearGroups.length > 0) {
      expanded.add(yearGroups[0].yearLabel);
    }
    return expanded;
  });

  // Update expanded when yearGroups changes
  useEffect(() => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      let hasExpanded = false;
      yearGroups.forEach(group => {
        if (group.isCurrent) {
          newSet.add(group.yearLabel);
          hasExpanded = true;
        }
      });
      if (!hasExpanded && yearGroups.length > 0 && newSet.size === 0) {
        newSet.add(yearGroups[0].yearLabel);
      }
      return newSet;
    });
  }, [yearGroups]);

  const toggleYear = (yearLabel: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(yearLabel)) {
        next.delete(yearLabel);
      } else {
        next.add(yearLabel);
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

  const handleSendInvoice = async (e: React.MouseEvent, policyIds: string[]) => {
    e.stopPropagation();
    setSendingPolicy(policyIds[0]);
    try {
      const functionName = policyIds.length > 1 ? 'send-package-invoice-sms' : 'send-invoice-sms';
      const body = policyIds.length > 1 
        ? { policy_ids: policyIds }
        : { policy_id: policyIds[0], force_resend: true };

      const { data, error } = await supabase.functions.invoke(functionName, { body });
      
      if (error) {
        // Try to parse the context for the actual error message
        let errorMsg = 'فشل في الإرسال';
        try {
          // The error context might contain the JSON response
          if (error.context && typeof error.context === 'object') {
            const ctx = error.context as any;
            if (ctx.body) {
              const parsed = JSON.parse(ctx.body);
              if (parsed.error) errorMsg = parsed.error;
            }
          }
        } catch {
          // If parsing fails, use default
        }
        throw new Error(errorMsg);
      }
      if (data?.error) throw new Error(data.error);
      
      toast.success(policyIds.length > 1 ? 'تم إرسال الفواتير' : 'تم إرسال الفاتورة');
    } catch (err: any) {
      toast.error(err.message || 'فشل في الإرسال');
    } finally {
      setSendingPolicy(null);
    }
  };

  const refreshPaymentInfo = async () => {
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

  const getPackagePaymentStatus = (pkg: PolicyPackage) => {
    // Sum ALL payments including those on ELZAMI policies
    let totalPaid = 0;
    pkg.allPolicyIds.forEach(id => {
      totalPaid += paymentInfo[id]?.paid || 0;
    });
    // For remaining calculation, use debtPrice (excludes ELZAMI) 
    // This ensures payments on ELZAMI count toward the package debt
    const remaining = Math.max(0, pkg.debtPrice - totalPaid);
    const isPaid = remaining <= 0;
    return { totalPaid, remaining, isPaid };
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
    <div className="space-y-4">
      {yearGroups.map(yearGroup => {
        const isExpanded = expandedYears.has(yearGroup.yearLabel);
        const activeCount = yearGroup.packages.filter(p => p.status === 'active').length;
        const totalCount = yearGroup.packages.length;

        return (
          <Collapsible
            key={yearGroup.yearLabel}
            open={isExpanded}
            onOpenChange={() => toggleYear(yearGroup.yearLabel)}
          >
            {/* Year Header */}
            <CollapsibleTrigger asChild>
              <div 
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all",
                  yearGroup.isCurrent 
                    ? "bg-primary/10 border-2 border-primary/30 hover:bg-primary/15" 
                    : "bg-muted/50 border border-border hover:bg-muted"
                )}
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                )}
                
                <Calendar className={cn("h-5 w-5", yearGroup.isCurrent ? "text-primary" : "text-muted-foreground")} />
                
                <span className={cn(
                  "text-lg font-bold ltr-nums",
                  yearGroup.isCurrent ? "text-primary" : "text-foreground"
                )}>
                  {yearGroup.yearLabel}
                </span>

                {yearGroup.isCurrent && (
                  <Badge variant="default" className="bg-primary/20 text-primary border-0">
                    السنة الحالية
                  </Badge>
                )}

                <div className="flex-1" />

                {activeCount > 0 && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {activeCount} سارية
                  </Badge>
                )}
                
                <Badge variant="outline" className="ltr-nums">
                  {totalCount} وثيقة
                </Badge>
              </div>
            </CollapsibleTrigger>

            {/* Year Content */}
            <CollapsibleContent>
              <div className="mt-2 space-y-2 pr-4">
                {yearGroup.packages.map((pkg, pkgIndex) => {
                  const accidentCount = pkg.allPolicyIds.reduce((sum, id) => sum + (accidentInfo[id] || 0), 0);
                  return (
                    <PolicyPackageCard
                      key={pkgIndex}
                      pkg={pkg}
                      paymentStatus={getPackagePaymentStatus(pkg)}
                      accidentCount={accidentCount}
                      onPolicyClick={onPolicyClick}
                      onPaymentClick={(e) => handlePackagePayment(e, pkg.allPolicyIds, pkg.mainPolicy?.branch_id || pkg.addons[0]?.branch_id || null)}
                      onSendInvoice={(e) => handleSendInvoice(e, pkg.allPolicyIds)}
                      isSending={sendingPolicy === pkg.allPolicyIds[0]}
                      onTransfer={onTransferPolicy}
                      onCancel={onCancelPolicy}
                      onTransferPackage={onTransferPackage}
                      onCancelPackage={onCancelPackage}
                    />
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <PackagePaymentModal
        open={packagePaymentOpen}
        onOpenChange={setPackagePaymentOpen}
        policyIds={selectedPackagePolicyIds}
        branchId={selectedBranchId}
        onSuccess={() => {
          if (onPaymentAdded) onPaymentAdded();
          refreshPaymentInfo();
        }}
      />
    </div>
  );
}

// Simplified Policy Card Component
function PolicyPackageCard({
  pkg,
  paymentStatus,
  accidentCount = 0,
  onPolicyClick,
  onPaymentClick,
  onSendInvoice,
  isSending,
  onTransfer,
  onCancel,
  onTransferPackage,
  onCancelPackage
}: {
  pkg: PolicyPackage;
  paymentStatus: { totalPaid: number; remaining: number; isPaid: boolean };
  accidentCount?: number;
  onPolicyClick: (id: string) => void;
  onPaymentClick: (e: React.MouseEvent) => void;
  onSendInvoice: (e: React.MouseEvent) => void;
  isSending: boolean;
  onTransfer?: (id: string) => void;
  onCancel?: (id: string) => void;
  onTransferPackage?: (ids: string[]) => void;
  onCancelPackage?: (ids: string[]) => void;
}) {
  const policy = pkg.mainPolicy || pkg.addons[0];
  if (!policy) return null;

  const isActive = pkg.status === 'active';
  const isTransferred = pkg.status === 'transferred';
  const isCancelled = pkg.status === 'cancelled';
  const isPackage = pkg.addons.length > 0 && pkg.mainPolicy !== null;
  const hasUnpaid = !paymentStatus.isPaid;

  // Check if this policy was created from a transfer (has transferred_car_number = FROM which car)
  const wasTransferredFrom = policy.transferred_car_number;
  // Check if this policy was transferred TO another car (has transferred_to_car_number)
  const wasTransferredTo = policy.transferred_to_car_number;

  // Build combined type label for packages
  const getTypeLabel = () => {
    if (isPackage && pkg.mainPolicy) {
      const mainLabel = policyTypeLabels[pkg.mainPolicy.policy_type_parent] || pkg.mainPolicy.policy_type_parent;
      const addonLabels = pkg.addons.map(a => policyTypeLabels[a.policy_type_parent] || a.policy_type_parent);
      return `${mainLabel} + ${addonLabels.join(' + ')}`;
    }
    return policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent;
  };

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all duration-200",
        // Active: Highlight and strong border
        isActive && "bg-card border-2 border-primary/40 shadow-md shadow-primary/5",
        // Ended: Neutral
        pkg.status === 'ended' && "bg-muted/20 border-border",
        // Transferred/Cancelled: Muted
        (isTransferred || isCancelled) && "bg-muted/10 border-dashed border-muted-foreground/30 opacity-70",
        // Unpaid indicator
        hasUnpaid && isActive && "border-r-4 border-r-destructive"
      )}
    >
      <div className="p-4">
        {/* Top Row: Status + Type + Actions */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {/* Status Badge */}
          {isActive && (
            <Badge variant="success" className="gap-1 font-bold">
              <CheckCircle className="h-3.5 w-3.5" />
              سارية
            </Badge>
          )}
          {pkg.status === 'ended' && (
            <Badge variant="secondary" className="gap-1">
              منتهية
            </Badge>
          )}
          {isTransferred && (
            <Badge variant="warning" className="gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              محولة {wasTransferredTo && <span className="font-mono ltr-nums">← {wasTransferredTo}</span>}
            </Badge>
          )}
          {isCancelled && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              ملغاة
            </Badge>
          )}

          {/* Transfer FROM indicator - for policies created via transfer */}
          {wasTransferredFrom && !isTransferred && (
            <Badge variant="outline" className="gap-1 text-xs bg-blue-500/10 border-blue-500/30 text-blue-600">
              <ArrowRightLeft className="h-3 w-3" />
              محول من <span className="font-mono ltr-nums">{wasTransferredFrom}</span>
            </Badge>
          )}

          {/* Policy Type - show as separate badges for packages */}
          {isPackage && pkg.mainPolicy ? (
            <div className="flex flex-wrap items-center gap-1">
              <Badge className={cn("border text-xs font-semibold", policyTypeColors[pkg.mainPolicy.policy_type_parent])}>
                {policyTypeLabels[pkg.mainPolicy.policy_type_parent] || pkg.mainPolicy.policy_type_parent}
              </Badge>
              {pkg.addons.map((addon, idx) => (
                <span key={addon.id} className="flex items-center gap-1">
                  <span className="text-muted-foreground text-xs">+</span>
                  <Badge className={cn("border text-xs", policyTypeColors[addon.policy_type_parent])}>
                    {policyTypeLabels[addon.policy_type_parent] || addon.policy_type_parent}
                  </Badge>
                </span>
              ))}
              <Badge variant="outline" className="gap-1 text-xs bg-primary/5 border-primary/20 text-primary mr-1">
                <Zap className="h-3 w-3" />
                باقة
              </Badge>
            </div>
          ) : (
            <Badge className={cn("border text-xs font-semibold", policyTypeColors[policy.policy_type_parent])}>
              {getTypeLabel()}
            </Badge>
          )}

          {/* Accident indicator */}
          {accidentCount > 0 && (
            <Badge variant="outline" className="gap-1 text-xs bg-orange-500/10 border-orange-500/30 text-orange-600">
              <AlertTriangle className="h-3 w-3" />
              {accidentCount} حادث
            </Badge>
          )}

          {/* Payment Status */}
          {hasUnpaid && isActive && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              متبقي ₪{paymentStatus.remaining.toLocaleString()}
            </Badge>
          )}
          {paymentStatus.isPaid && (
            <Badge variant="outline" className="gap-1 text-success border-success/30 bg-success/5">
              <CheckCircle className="h-3 w-3" />
              مدفوع
            </Badge>
          )}

          <div className="flex-1" />

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            {hasUnpaid && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-8 border-primary text-primary hover:bg-primary hover:text-white"
                onClick={onPaymentClick}
              >
                <Banknote className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">دفع</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-8"
              onClick={onSendInvoice}
              disabled={isSending}
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onPolicyClick(policy.id)}>
                  <Eye className="h-4 w-4 ml-2" />
                  عرض التفاصيل
                </DropdownMenuItem>
                
                {isActive && (
                  <>
                    <DropdownMenuSeparator />
                    {isPackage && onTransferPackage && (
                      <DropdownMenuItem onClick={() => onTransferPackage(pkg.allPolicyIds)}>
                        <ArrowRightLeft className="h-4 w-4 ml-2" />
                        تحويل الباقة
                      </DropdownMenuItem>
                    )}
                    {!isPackage && onTransfer && (
                      <DropdownMenuItem onClick={() => onTransfer(policy.id)}>
                        <ArrowRightLeft className="h-4 w-4 ml-2" />
                        تحويل الوثيقة
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {isPackage && onCancelPackage && (
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => onCancelPackage(pkg.allPolicyIds)}
                      >
                        <XCircle className="h-4 w-4 ml-2" />
                        إلغاء الباقة
                      </DropdownMenuItem>
                    )}
                    {!isPackage && onCancel && (
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => onCancel(policy.id)}
                      >
                        <XCircle className="h-4 w-4 ml-2" />
                        إلغاء الوثيقة
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main Content: Key Info Grid */}
        <div 
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm cursor-pointer"
          onClick={() => onPolicyClick(policy.id)}
        >
          {/* Company */}
          <div className="flex items-start gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">الشركة</p>
              <p className={cn("font-medium truncate", !isActive && "text-muted-foreground")}>
                {policy.company?.name_ar || policy.company?.name || '-'}
              </p>
            </div>
          </div>

          {/* Car */}
          <div className="flex items-start gap-2">
            <Car className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">السيارة</p>
              <p className={cn("font-mono font-medium ltr-nums", !isActive && "text-muted-foreground")}>
                {policy.car?.car_number || '-'}
              </p>
            </div>
          </div>

          {/* Coverage Period */}
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">الفترة</p>
              <p className={cn("font-medium text-xs", !isActive && "text-muted-foreground")}>
                <span className="ltr-nums">{formatDate(policy.start_date)}</span>
                <span className="mx-1 text-muted-foreground">←</span>
                <span className="ltr-nums">{formatDate(policy.end_date)}</span>
              </p>
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-start gap-2 justify-end">
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">المبلغ</p>
              <p className={cn(
                "text-lg font-bold ltr-nums",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                ₪{pkg.totalPrice.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
