import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { ExpiringPolicies } from "@/components/dashboard/ExpiringPolicies";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Car, TrendingUp, Wallet, AlertCircle } from "lucide-react";

export default function Dashboard() {
  return (
    <MainLayout>
      <Header
        title="لوحة التحكم"
        subtitle="مرحباً بك، مرشد"
        action={{ label: "عميل جديد", onClick: () => {} }}
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="إجمالي العملاء"
            value="1,248"
            change={{ value: 12, trend: "up" }}
            icon={Users}
            variant="primary"
          />
          <StatCard
            title="الوثائق النشطة"
            value="2,847"
            change={{ value: 8, trend: "up" }}
            icon={FileText}
            variant="default"
          />
          <StatCard
            title="السيارات المؤمنة"
            value="3,124"
            change={{ value: 5, trend: "up" }}
            icon={Car}
            variant="default"
          />
          <StatCard
            title="أرباح الشهر"
            value="₪45,230"
            change={{ value: 15, trend: "up" }}
            icon={TrendingUp}
            variant="success"
          />
        </div>

        {/* Second Row Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6 border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">الرصيد المستحق</p>
                <p className="text-2xl font-bold text-warning">₪127,450</p>
                <p className="text-sm text-muted-foreground mt-1">32 عميل برصيد</p>
              </div>
              <div className="rounded-xl bg-warning/10 p-3">
                <Wallet className="h-6 w-6 text-warning" />
              </div>
            </div>
          </Card>
          <Card className="p-6 border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">تنتهي هذا الأسبوع</p>
                <p className="text-2xl font-bold text-destructive">24</p>
                <p className="text-sm text-muted-foreground mt-1">وثيقة تحتاج تجديد</p>
              </div>
              <div className="rounded-xl bg-destructive/10 p-3">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </Card>
          <Card className="p-6 border shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">أرباح السنة</p>
                <p className="text-2xl font-bold text-success">₪542,780</p>
                <p className="text-sm text-muted-foreground mt-1">+18% مقارنة بالعام الماضي</p>
              </div>
              <div className="rounded-xl bg-success/10 p-3">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </Card>
        </div>

        {/* Bottom Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ExpiringPolicies />
          <RecentActivity />
        </div>

        {/* Quick Stats by Company */}
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">الوثائق حسب الشركة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { name: "مينورا", count: 423, color: "bg-blue-500" },
                { name: "هرئيل", count: 387, color: "bg-green-500" },
                { name: "فينيكس", count: 312, color: "bg-orange-500" },
                { name: "كلال", count: 245, color: "bg-purple-500" },
              ].map((company) => (
                <div key={company.name} className="flex items-center gap-3 rounded-lg bg-secondary/50 p-4">
                  <div className={`h-3 w-3 rounded-full ${company.color}`} />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{company.name}</p>
                    <p className="text-sm text-muted-foreground">{company.count} وثيقة</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
