import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  TableFooter 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Shield, Car, Truck, FileCheck } from "lucide-react";

interface PackagePolicy {
  id: string;
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  profit: number | null;
  insurance_companies?: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
  road_services?: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
  accident_fee_services?: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
}

interface PackageComponentsTableProps {
  policies: PackagePolicy[];
  isAdmin: boolean;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: "إلزامي",
  THIRD_FULL: "ثالث/شامل",
  ROAD_SERVICE: "خدمات الطريق",
  ACCIDENT_FEE_EXEMPTION: "إعفاء رسوم حادث",
};

const policyChildLabels: Record<string, string> = {
  THIRD: "طرف ثالث",
  FULL: "شامل",
};

const policyTypeConfig: Record<string, { icon: React.ElementType; bg: string; text: string }> = {
  ELZAMI: { icon: Shield, bg: "bg-teal-50", text: "text-teal-700" },
  THIRD_FULL: { icon: Car, bg: "bg-cyan-50", text: "text-cyan-700" },
  ROAD_SERVICE: { icon: Truck, bg: "bg-emerald-50", text: "text-emerald-700" },
  ACCIDENT_FEE_EXEMPTION: { icon: FileCheck, bg: "bg-emerald-50", text: "text-emerald-700" },
};

export function PackageComponentsTable({ policies, isAdmin }: PackageComponentsTableProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-GB");
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "₪0";
    return `₪${Math.abs(amount).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

const getTypeName = (p: PackagePolicy) => {
    // For THIRD_FULL with a child type, show only the child type (ثالث or شامل)
    if (p.policy_type_parent === 'THIRD_FULL' && p.policy_type_child) {
      return policyChildLabels[p.policy_type_child] || p.policy_type_child;
    }
    // For other types, use the parent label
    return policyTypeLabels[p.policy_type_parent] || p.policy_type_parent;
  };

  const getServiceName = (p: PackagePolicy) => {
    if (p.policy_type_parent === 'ROAD_SERVICE' && p.road_services) {
      return p.road_services.name_ar || p.road_services.name;
    }
    if (p.policy_type_parent === 'ACCIDENT_FEE_EXEMPTION' && p.accident_fee_services) {
      return p.accident_fee_services.name_ar || p.accident_fee_services.name;
    }
    return null;
  };

  const getCompanyName = (p: PackagePolicy) => {
    if (p.policy_type_parent === 'ROAD_SERVICE' && p.road_services) {
      return p.road_services.name_ar || p.road_services.name;
    }
    if (p.policy_type_parent === 'ACCIDENT_FEE_EXEMPTION' && p.accident_fee_services) {
      return p.accident_fee_services.name_ar || p.accident_fee_services.name;
    }
    if (p.insurance_companies) {
      return p.insurance_companies.name_ar || p.insurance_companies.name;
    }
    return '-';
  };

  const totalPrice = policies.reduce((sum, p) => sum + p.insurance_price, 0);
  const totalProfit = policies.reduce((sum, p) => sum + (p.profit || 0), 0);

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="bg-gradient-to-l from-primary/5 to-primary/10 px-4 py-3 border-b">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          مكونات الباقة
        </h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-bold">نوع التأمين</TableHead>
            <TableHead className="font-bold">الشركة</TableHead>
            <TableHead className="font-bold">الفترة</TableHead>
            <TableHead className="font-bold text-left">السعر</TableHead>
            {isAdmin && <TableHead className="font-bold text-left">الربح</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => {
            const config = policyTypeConfig[policy.policy_type_parent] || policyTypeConfig.ELZAMI;
            const Icon = config.icon;
            const serviceName = getServiceName(policy);
            const isElzami = policy.policy_type_parent === 'ELZAMI';
            
            return (
              <TableRow key={policy.id} className="hover:bg-muted/20">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bg)}>
                      <Icon className={cn("h-4 w-4", config.text)} />
                    </div>
                    <div>
                      <p className="font-semibold">{getTypeName(policy)}</p>
                      {serviceName && (
                        <p className="text-xs text-muted-foreground">{serviceName}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">{getCompanyName(policy)}</span>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <span>{formatDate(policy.start_date)}</span>
                    <span className="mx-2 text-muted-foreground">←</span>
                    <span>{formatDate(policy.end_date)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-left">
                  <span className="font-bold text-lg ltr-nums">{formatCurrency(policy.insurance_price)}</span>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-left">
                    {isElzami ? (
                      <span className="text-muted-foreground text-sm">-</span>
                    ) : (
                      <span className={cn(
                        "font-semibold ltr-nums",
                        (policy.profit || 0) < 0 ? "text-red-600" : "text-emerald-600"
                      )}>
                        {formatCurrency(policy.profit)}
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="bg-gradient-to-l from-primary/5 to-primary/10 font-bold">
            <TableCell colSpan={3} className="text-left">
              <span className="text-lg">المجموع</span>
            </TableCell>
            <TableCell className="text-left">
              <span className="text-xl font-bold text-primary ltr-nums">{formatCurrency(totalPrice)}</span>
            </TableCell>
            {isAdmin && (
              <TableCell className="text-left">
                <span className={cn(
                  "text-lg font-bold ltr-nums",
                  totalProfit < 0 ? "text-red-600" : "text-emerald-600"
                )}>
                  {formatCurrency(totalProfit)}
                </span>
              </TableCell>
            )}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
