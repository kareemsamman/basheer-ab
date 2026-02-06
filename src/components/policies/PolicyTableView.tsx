import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  PolicyRecord,
  PolicyGroup,
  PaymentInfo,
  getPolicyStatus,
  policyTypeLabels,
  policyChildLabels,
} from './cards/types';

const MAIN_POLICY_TYPES = ['ELZAMI', 'THIRD_FULL'];

interface PolicyTableViewProps {
  policies: PolicyRecord[];
  loading: boolean;
  onPolicyClick: (policyId: string) => void;
}

export function PolicyTableView({
  policies,
  loading,
  onPolicyClick,
}: PolicyTableViewProps) {
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({});
  const [loadingPayments, setLoadingPayments] = useState(true);

  // Fetch payment info for all policies
  useEffect(() => {
    const fetchPaymentInfo = async () => {
      if (policies.length === 0) {
        setPaymentInfo({});
        setLoadingPayments(false);
        return;
      }

      setLoadingPayments(true);
      const policyIds = policies.map((p) => p.id);

      try {
        const { data: paymentsData } = await supabase
          .from('policy_payments')
          .select('policy_id, amount, refused')
          .in('policy_id', policyIds);

        const info: PaymentInfo = {};
        policies.forEach((p) => {
          const policyPayments = (paymentsData || []).filter(
            (pay) => pay.policy_id === p.id && !pay.refused
          );
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

    policies.forEach((policy) => {
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
            if (
              policy.policy_type_parent === 'THIRD_FULL' &&
              currentMainType !== 'THIRD_FULL'
            ) {
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

  const getPackagePaymentStatus = (group: PolicyGroup) => {
    const allPolicyIds = [
      ...(group.mainPolicy ? [group.mainPolicy.id] : []),
      ...group.addons.map((a) => a.id),
    ];

    let totalPrice = 0;
    let debtPrice = 0;
    let totalPaid = 0;

    allPolicyIds.forEach((id) => {
      const policy = policies.find((p) => p.id === id);
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

  // Get insurance lines with company names for multi-line display
  const getInsuranceLines = (group: PolicyGroup) => {
    const allPolicies = [
      ...(group.mainPolicy ? [group.mainPolicy] : []),
      ...group.addons,
    ];

    return allPolicies.map((policy) => {
      const label =
        policy.policy_type_parent === 'THIRD_FULL' && policy.policy_type_child
          ? policyChildLabels[policy.policy_type_child] || policy.policy_type_child
          : policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent;

      const companyName =
        policy.insurance_companies?.name_ar ||
        policy.insurance_companies?.name ||
        '';

      return { label, companyName, policyId: policy.id };
    });
  };

  // Get the overall status for the group (use main policy or first available)
  const getGroupStatus = (group: PolicyGroup) => {
    const representativePolicy = group.mainPolicy || group.addons[0];
    if (!representativePolicy) return null;
    return getPolicyStatus(representativePolicy);
  };

  // Get file number from client
  const getFileNumber = (group: PolicyGroup) => {
    return group.client?.file_number || '-';
  };

  // Get unique date ranges from the group (for packages with different dates)
  const getDateRanges = (group: PolicyGroup) => {
    const allPolicies = [
      ...(group.mainPolicy ? [group.mainPolicy] : []),
      ...group.addons,
    ];

    // Collect unique date ranges
    const uniqueRanges = new Map<string, { start: string; end: string }>();

    allPolicies.forEach((policy) => {
      const key = `${policy.start_date}-${policy.end_date}`;
      if (!uniqueRanges.has(key)) {
        uniqueRanges.set(key, {
          start: formatDate(policy.start_date),
          end: formatDate(policy.end_date),
        });
      }
    });

    return Array.from(uniqueRanges.values());
  };

  // Get creator name
  const getCreatorName = (group: PolicyGroup) => {
    const representativePolicy = group.mainPolicy || group.addons[0];
    if (!representativePolicy?.created_by) return '-';
    return representativePolicy.created_by.full_name || representativePolicy.created_by.email;
  };

  // Handle row click - navigate to main policy or first addon
  const handleRowClick = (group: PolicyGroup) => {
    const policyId = group.mainPolicy?.id || group.addons[0]?.id;
    if (policyId) {
      onPolicyClick(policyId);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
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
    <TooltipProvider>
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[80px] text-center">رقم الملف</TableHead>
              <TableHead className="min-w-[140px]">العميل</TableHead>
              <TableHead className="min-w-[120px]">التأمينات</TableHead>
              <TableHead className="w-[100px]">السيارة</TableHead>
              <TableHead className="min-w-[180px]">الفترة</TableHead>
              <TableHead className="w-[80px]">الإجمالي</TableHead>
              <TableHead className="w-[100px]">أنشأها</TableHead>
              <TableHead className="w-[80px] text-center">الحالة</TableHead>
              <TableHead className="w-[100px] text-center">الدفع</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedPolicies.map((group, index) => {
              if (!group.mainPolicy && group.addons.length === 0) return null;

              const paymentStatus = getPackagePaymentStatus(group);
              const groupStatus = getGroupStatus(group);
              const fileNumber = getFileNumber(group);
              const dateRanges = getDateRanges(group);
              const insuranceLines = getInsuranceLines(group);
              const creatorName = getCreatorName(group);
              const clientName = group.client?.full_name || '-';
              const clientPhone = group.client?.phone_number || '';
              const carNumber = group.car?.car_number || '-';

              return (
                <TableRow
                  key={group.groupId || `standalone-${index}`}
                  className="cursor-pointer hover:bg-muted/50 transition-colors even:bg-muted/20"
                  onClick={() => handleRowClick(group)}
                >
                  {/* File number */}
                  <TableCell className="text-center font-medium text-xs">
                    {fileNumber}
                  </TableCell>

                  {/* Client */}
                  <TableCell>
                    <div className="flex flex-col">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-medium truncate max-w-[130px] block">
                            {clientName}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{clientName}</p>
                        </TooltipContent>
                      </Tooltip>
                      {clientPhone && (
                        <span className="text-xs text-muted-foreground" dir="ltr">
                          {clientPhone}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Insurance types with company names - multi-line */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5 text-xs">
                      {insuranceLines.map((line) => (
                        <div key={line.policyId} className="whitespace-nowrap">
                          <span className="font-medium">{line.label}</span>
                          {line.companyName && (
                            <span className="text-muted-foreground"> → {line.companyName}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </TableCell>

                  {/* Car number */}
                  <TableCell className="font-mono text-sm" dir="ltr">
                    {carNumber}
                  </TableCell>

                  {/* Date ranges - single or multiple lines */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5 text-xs">
                      {dateRanges.map((range, idx) => (
                        <div key={idx} className="whitespace-nowrap">
                          <span>{range.end}</span>
                          <span className="text-muted-foreground"> ← {range.start}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>

                  {/* Total */}
                  <TableCell className="font-bold">
                    {formatCurrency(paymentStatus.totalPrice)}
                  </TableCell>

                  {/* Created by */}
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate max-w-[90px] block text-sm">
                          {creatorName}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{creatorName}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Policy status */}
                  <TableCell className="text-center">
                    {groupStatus && (
                      <Badge variant={groupStatus.variant} className="text-[10px]">
                        {groupStatus.label}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Payment status */}
                  <TableCell className="text-center">
                    {loadingPayments ? (
                      <Skeleton className="h-5 w-16 mx-auto" />
                    ) : paymentStatus.isPaid ? (
                      <Badge variant="success" className="text-[10px]">
                        مدفوع
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="text-[10px]">
                        متبقي {formatCurrency(paymentStatus.remaining)}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
