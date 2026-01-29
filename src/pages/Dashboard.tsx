import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { ExpiringPolicies } from "@/components/dashboard/ExpiringPolicies";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, Car, TrendingUp, AlertCircle, Building2, Clock, Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfitSummary } from "@/hooks/useProfitSummary";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { isAdmin, profile } = useAuth();
  const { summary: profitSummary, loading: profitLoading, refetch: refetchProfit } = useProfitSummary();
  const [stats, setStats] = useState({
    totalClients: 0,
    activePolicies: 0,
    totalCars: 0,
    outstandingBalance: 0,
    expiringThisWeek: 0,
    expiringThisMonth: 0,
    newPoliciesThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch clients count
      const { count: clientsCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      // Fetch active policies count
      const today = new Date().toISOString().split('T')[0];
      const { count: policiesCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('cancelled', false)
        .gte('end_date', today);

      // Fetch cars count
      const { count: carsCount } = await supabase
        .from('cars')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      // Fetch expiring this week
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const { count: expiringCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('cancelled', false)
        .gte('end_date', today)
        .lte('end_date', nextWeek.toISOString().split('T')[0]);

      // Fetch expiring this month
      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);
      const { count: expiringMonthCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('cancelled', false)
        .gte('end_date', today)
        .lte('end_date', nextMonth.toISOString().split('T')[0]);

      // Fetch new policies this month
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      const { count: newPoliciesCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .gte('created_at', firstDayOfMonth.toISOString());

      setStats({
        totalClients: clientsCount || 0,
        activePolicies: policiesCount || 0,
        totalCars: carsCount || 0,
        outstandingBalance: 0,
        expiringThisWeek: expiringCount || 0,
        expiringThisMonth: expiringMonthCount || 0,
        newPoliciesThisMonth: newPoliciesCount || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePolicyComplete = () => {
    fetchStats();
    refetchProfit();
  };

  return (
    <MainLayout onPolicyComplete={handlePolicyComplete}>
      <Header
        title="لوحة التحكم"
        subtitle={`مرحباً بك، ${profile?.full_name || 'مستخدم'}`}
      />

      <div className="p-6 space-y-6">

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : (
            <>
              <StatCard
                title="إجمالي العملاء"
                value={stats.totalClients.toLocaleString('en-US')}
                icon={Users}
                variant="primary"
              />
              <StatCard
                title="الوثائق النشطة"
                value={stats.activePolicies.toLocaleString('en-US')}
                icon={FileText}
                variant="default"
              />
              <StatCard
                title="السيارات المؤمنة"
                value={stats.totalCars.toLocaleString('en-US')}
                icon={Car}
                variant="default"
              />
              {/* Admin sees profit, Workers see expiring this month */}
              {isAdmin ? (
                <StatCard
                  title="أرباح الشهر"
                  value={profitLoading ? '...' : `₪${profitSummary.monthProfit.toLocaleString('en-US')}`}
                  icon={TrendingUp}
                  variant="success"
                />
              ) : (
                <StatCard
                  title="تنتهي هذا الشهر"
                  value={stats.expiringThisMonth.toLocaleString('en-US')}
                  icon={Clock}
                  variant="warning"
                />
              )}
            </>
          )}
        </div>

        {/* Second Row Stats - Different for Admin vs Worker */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isAdmin ? (
            <>
              {/* Admin Financial Stats */}
              <Card className="p-6 border shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">أرباح اليوم</p>
                    <p className="text-2xl font-bold text-success ltr-nums">
                      {profitLoading ? '...' : `₪${profitSummary.todayProfit.toLocaleString('en-US')}`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-success/10 p-3">
                    <TrendingUp className="h-6 w-6 text-success" />
                  </div>
                </div>
              </Card>
              <Card className="p-6 border shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">المستحق للشركات</p>
                    <p className="text-2xl font-bold text-destructive ltr-nums">
                      {profitLoading ? '...' : `₪${profitSummary.totalCompanyPaymentDue.toLocaleString('en-US')}`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-destructive/10 p-3">
                    <Building2 className="h-6 w-6 text-destructive" />
                  </div>
                </div>
              </Card>
              <Card className="p-6 border shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">المستحق للوسطاء</p>
                    <p className="text-2xl font-bold text-orange-500 ltr-nums">
                      {profitLoading ? '...' : `₪${profitSummary.totalBrokerDebtOwed.toLocaleString('en-US')}`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-orange-500/10 p-3">
                    <Handshake className="h-6 w-6 text-orange-500" />
                  </div>
                </div>
              </Card>
              <Card className="p-6 border shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">تنتهي هذا الأسبوع</p>
                    <p className="text-2xl font-bold text-warning ltr-nums">{stats.expiringThisWeek}</p>
                    <p className="text-xs text-muted-foreground">وثيقة تحتاج تجديد</p>
                  </div>
                  <div className="rounded-xl bg-warning/10 p-3">
                    <AlertCircle className="h-6 w-6 text-warning" />
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <>
              {/* Worker Operational Stats */}
              <Card className="p-6 border shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">تنتهي هذا الأسبوع</p>
                    <p className="text-2xl font-bold text-warning">{stats.expiringThisWeek}</p>
                    <p className="text-sm text-muted-foreground mt-1">وثيقة تحتاج تجديد</p>
                  </div>
                  <div className="rounded-xl bg-warning/10 p-3">
                    <AlertCircle className="h-6 w-6 text-warning" />
                  </div>
                </div>
              </Card>
              <Card className="p-6 border shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">وثائق جديدة هذا الشهر</p>
                    <p className="text-2xl font-bold text-primary">{stats.newPoliciesThisMonth}</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-3">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </Card>
              <Card className="p-6 border shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">إجمالي العملاء</p>
                    <p className="text-2xl font-bold">{stats.totalClients}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>
              </Card>
              <Card className="p-6 border shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">الوثائق النشطة</p>
                    <p className="text-2xl font-bold">{stats.activePolicies}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Bottom Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ExpiringPolicies />
          <RecentActivity />
        </div>
      </div>
    </MainLayout>
  );
}