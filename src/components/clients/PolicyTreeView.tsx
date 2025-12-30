import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  Hash
} from 'lucide-react';
import { ExpiryBadge } from '@/components/shared/ExpiryBadge';
import { cn } from '@/lib/utils';

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
}

interface PolicyTreeViewProps {
  policies: PolicyRecord[];
  onPolicyClick: (policyId: string) => void;
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

export function PolicyTreeView({ policies, onPolicyClick }: PolicyTreeViewProps) {
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
        
        // For groups that only have add-ons without a main policy
        if (!hasMainPolicy && hasAddons) {
          // Render add-ons as standalone items
          return group.addons.map(addon => (
            <PolicyRow
              key={addon.id}
              policy={addon}
              isAddon={false}
              onPolicyClick={onPolicyClick}
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
            />
          );
        }
        
        // Package with main policy + add-ons
        return (
          <Card 
            key={groupKey}
            className={cn(
              "overflow-hidden transition-all",
              group.isActive ? "border-primary/30 shadow-sm" : "opacity-80"
            )}
          >
            <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(groupKey)}>
              <CollapsibleTrigger asChild>
                <div className={cn(
                  "flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors",
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
                  
                  {/* Main Policy Info */}
                  <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                    <div>
                      <Badge className={cn("border", policyTypeColors[group.mainPolicy!.policy_type_parent])}>
                        {policyTypeLabels[group.mainPolicy!.policy_type_parent] || group.mainPolicy!.policy_type_parent}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">الشركة: </span>
                      <span className="font-medium">
                        {group.mainPolicy!.company?.name_ar || group.mainPolicy!.company?.name || '-'}
                      </span>
                    </div>
                    <div className="text-sm">
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
                  
                  {/* Status */}
                  <div className="shrink-0">
                    <ExpiryBadge endDate={group.mainPolicy!.end_date} cancelled={group.mainPolicy!.cancelled} />
                  </div>
                  <div className="shrink-0">
                    {getPolicyStatus(group.mainPolicy!).isActive ? (
                      <Badge variant="success">سارية</Badge>
                    ) : group.mainPolicy!.cancelled ? (
                      <Badge variant="destructive">ملغاة</Badge>
                    ) : (
                      <Badge variant="secondary">منتهية</Badge>
                    )}
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
    </div>
  );
}

// Modern card-style row for standalone policies
function PolicyRow({ 
  policy, 
  isAddon,
  onPolicyClick 
}: { 
  policy: PolicyRecord; 
  isAddon: boolean;
  onPolicyClick: (id: string) => void;
}) {
  const status = getPolicyStatus(policy);
  
  return (
    <Card 
      className={cn(
        "group cursor-pointer transition-all duration-200 overflow-hidden",
        isAddon && "mr-6 border-r-4 border-r-orange-400",
        status.isActive 
          ? "bg-card hover:shadow-lg hover:shadow-primary/10 hover:border-primary/30" 
          : "bg-muted/30 hover:bg-muted/50",
        status.priority === 3 && "border-amber-500/30 bg-amber-50/50",
        status.priority === 4 && "border-destructive/30 bg-destructive/5"
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
          
          {/* Spacer */}
          <div className="flex-1" />
          
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
