import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, Car, CreditCard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Activity {
  id: string;
  type: "policy" | "payment" | "client" | "car";
  action: string;
  detail: string;
  time: string;
  created_at: string;
}

const typeColors = {
  policy: "text-primary bg-primary/10",
  payment: "text-success bg-success/10",
  client: "text-accent bg-accent/10",
  car: "text-warning bg-warning/10",
};

const typeIcons = {
  policy: FileText,
  payment: CreditCard,
  client: Users,
  car: Car,
};

export function RecentActivity() {
  const { profile } = useAuth();
  const branchId = profile?.branch_id;

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["recent-activity", branchId],
    queryFn: async () => {
      const results: Activity[] = [];

      // Build branch filter
      const branchFilter = branchId ? { branch_id: branchId } : {};

      // Fetch recent policies (last 5) - exclude cancelled/deleted
      const { data: policies } = await supabase
        .from("policies")
        .select("id, created_at, policy_type_parent, cancelled, clients(full_name, deleted_at)")
        .order("created_at", { ascending: false })
        .match(branchFilter)
        .eq("cancelled", false)
        .limit(10);

      if (policies) {
        const typeLabels: Record<string, string> = {
          ELZAMI: "إلزامي",
          THIRD_FULL: "شامل طرف ثالث",
          ROAD_SERVICE: "خدمة طريق",
          ACCIDENT_FEE_EXEMPTION: "إعفاء حوادث",
          HEALTH: "صحي",
          LIFE: "حياة",
          TRAVEL: "سفر",
          PROPERTY: "ممتلكات",
          BUSINESS: "أعمال",
          OTHER: "أخرى",
        };
        for (const p of policies) {
          // Skip if client is deleted
          if ((p.clients as any)?.deleted_at) continue;
          
          const clientName = (p.clients as any)?.full_name || "عميل";
          const policyLabel = typeLabels[p.policy_type_parent] || p.policy_type_parent || "وثيقة";
          results.push({
            id: `policy-${p.id}`,
            type: "policy",
            action: "وثيقة جديدة",
            detail: `${policyLabel} - ${clientName}`,
            time: formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: ar }),
            created_at: p.created_at,
          });
        }
      }

      // Fetch recent payments (last 10) - filter out cancelled policies and ELZAMI
      const { data: payments } = await supabase
        .from("policy_payments")
        .select("id, created_at, amount, policies(cancelled, policy_type_parent, clients(full_name, deleted_at))")
        .order("created_at", { ascending: false })
        .match(branchFilter)
        .limit(15); // Fetch more to account for filtered ELZAMI

      if (payments) {
        for (const pay of payments) {
          // Skip if policy is cancelled or client is deleted
          if ((pay.policies as any)?.cancelled) continue;
          if ((pay.policies as any)?.clients?.deleted_at) continue;
          // Skip ELZAMI payments - money goes directly to company, not agent
          if ((pay.policies as any)?.policy_type_parent === 'ELZAMI') continue;
          
          const clientName = (pay.policies as any)?.clients?.full_name || "عميل";
          results.push({
            id: `payment-${pay.id}`,
            type: "payment",
            action: "دفعة مستلمة",
            detail: `₪${pay.amount?.toLocaleString()} من ${clientName}`,
            time: formatDistanceToNow(new Date(pay.created_at), { addSuffix: true, locale: ar }),
            created_at: pay.created_at,
          });
        }
      }

      // Fetch recent clients (last 5)
      const { data: clients } = await supabase
        .from("clients")
        .select("id, created_at, full_name, file_number")
        .order("created_at", { ascending: false })
        .match(branchFilter)
        .is("deleted_at", null)
        .limit(5);

      if (clients) {
        for (const c of clients) {
          results.push({
            id: `client-${c.id}`,
            type: "client",
            action: "عميل جديد",
            detail: `${c.full_name}${c.file_number ? ` - ملف #${c.file_number}` : ""}`,
            time: formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ar }),
            created_at: c.created_at,
          });
        }
      }

      // Fetch recent cars (last 5)
      const { data: cars } = await supabase
        .from("cars")
        .select("id, created_at, updated_at, car_number, clients(full_name)")
        .order("updated_at", { ascending: false })
        .match(branchFilter)
        .is("deleted_at", null)
        .limit(5);

      if (cars) {
        for (const car of cars) {
          const isNew = car.created_at === car.updated_at;
          results.push({
            id: `car-${car.id}`,
            type: "car",
            action: isNew ? "سيارة جديدة" : "تحديث سيارة",
            detail: `${car.car_number} - ${(car.clients as any)?.full_name || ""}`,
            time: formatDistanceToNow(new Date(car.updated_at), { addSuffix: true, locale: ar }),
            created_at: car.updated_at,
          });
        }
      }

      // Sort all by created_at descending and take top 5
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return results.slice(0, 5);
    },
    staleTime: 60 * 1000, // 1 minute cache
  });

  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">النشاط الأخير</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">النشاط الأخير</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground text-sm">
          لا يوجد نشاط حديث
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">النشاط الأخير</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.map((activity, index) => {
          const Icon = typeIcons[activity.type];
          return (
            <div
              key={activity.id}
              className={cn("flex items-start gap-3 animate-fade-in", `stagger-${index + 1}`)}
              style={{ animationFillMode: "backwards" }}
            >
              <div className={cn("rounded-lg p-2", typeColors[activity.type])}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{activity.action}</p>
                <p className="text-sm text-muted-foreground truncate">{activity.detail}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.time}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
