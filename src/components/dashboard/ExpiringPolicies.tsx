import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ExpiryBadge } from "@/components/shared/ExpiryBadge";

interface ExpiringPolicy {
  id: string;
  end_date: string;
  policy_type_parent: string;
  insurance_price: number;
  client: { full_name: string } | null;
  car: { car_number: string } | null;
  company: { name: string; name_ar: string | null } | null;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: "إلزامي",
  THIRD_FULL: "ثالث/شامل",
  ROAD_SERVICE: "طريق",
  ACCIDENT_FEE_EXEMPTION: "إعفاء",
};

export function ExpiringPolicies() {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<ExpiringPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExpiringPolicies();
  }, []);

  const fetchExpiringPolicies = async () => {
    try {
      const today = new Date();
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(today.getDate() + 30);

      const { data, error } = await supabase
        .from("policies")
        .select(`
          id, end_date, policy_type_parent, insurance_price,
          client:clients(full_name),
          car:cars(car_number),
          company:insurance_companies(name, name_ar)
        `)
        .is("deleted_at", null)
        .eq("cancelled", false)
        .gte("end_date", today.toISOString().split("T")[0])
        .lte("end_date", thirtyDaysLater.toISOString().split("T")[0])
        .order("end_date", { ascending: true })
        .limit(6);

      if (error) throw error;
      setPolicies(data || []);
    } catch (error) {
      console.error("Error fetching expiring policies:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <CardTitle className="text-base">وثائق تنتهي قريباً</CardTitle>
          {!loading && policies.length > 0 && (
            <Badge variant="destructive" className="mr-2">{policies.length}</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate("/debt-tracking")}>
          عرض الكل <ChevronLeft className="mr-1 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div>
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="text-left">
                <Skeleton className="h-5 w-16 mb-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))
        ) : policies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد وثائق تنتهي خلال 30 يوم</p>
          </div>
        ) : (
          policies.map((policy) => (
            <div 
              key={policy.id} 
              className="flex items-center justify-between rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary cursor-pointer"
              onClick={() => navigate("/policies")}
            >
              <div className="flex items-center gap-3">
                <ExpiryBadge endDate={policy.end_date} showDays={true} />
                <div>
                  <p className="font-medium text-foreground">{policy.client?.full_name || "غير معروف"}</p>
                  <p className="text-sm text-muted-foreground" dir="ltr">{policy.car?.car_number || "-"}</p>
                </div>
              </div>
              <div className="text-left">
                <Badge variant="outline" className="mb-1">
                  {policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent}
                </Badge>
                <p className="text-xs text-muted-foreground">{policy.company?.name_ar || policy.company?.name || "-"}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
