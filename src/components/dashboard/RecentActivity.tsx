import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, Car, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const activities = [
  { id: 1, type: "policy", action: "وثيقة جديدة", detail: "تأمين شامل - أحمد محمد", time: "قبل دقيقتين", icon: FileText },
  { id: 2, type: "payment", action: "دفعة مستلمة", detail: "₪2,500 من سارة أبو حسين", time: "قبل 15 دقيقة", icon: CreditCard },
  { id: 3, type: "client", action: "عميل جديد", detail: "خالد يوسف - ملف #1245", time: "قبل ساعة", icon: Users },
  { id: 4, type: "car", action: "تحديث سيارة", detail: "تجديد رخصة 12-345-67", time: "قبل ساعتين", icon: Car },
  { id: 5, type: "policy", action: "تجديد وثيقة", detail: "إلزامي - محمد خالد", time: "قبل 3 ساعات", icon: FileText },
];

const typeColors = { policy: "text-primary bg-primary/10", payment: "text-success bg-success/10", client: "text-accent bg-accent/10", car: "text-warning bg-warning/10" };

export function RecentActivity() {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-4"><CardTitle className="text-base">النشاط الأخير</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {activities.map((activity, index) => (
          <div key={activity.id} className={cn("flex items-start gap-3 animate-fade-in", `stagger-${index + 1}`)} style={{ animationFillMode: "backwards" }}>
            <div className={cn("rounded-lg p-2", typeColors[activity.type as keyof typeof typeColors])}><activity.icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{activity.action}</p>
              <p className="text-sm text-muted-foreground truncate">{activity.detail}</p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.time}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
