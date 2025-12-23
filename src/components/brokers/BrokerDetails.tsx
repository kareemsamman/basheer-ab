import { useState, useEffect, useCallback, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
  Pencil,
  Phone,
  FileText,
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Printer,
  Download,
  CalendarIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ClientDrawer } from "@/components/clients/ClientDrawer";
import { PolicyWizard } from "@/components/policies/PolicyWizard";
import { PolicyDetailsDrawer } from "@/components/policies/PolicyDetailsDrawer";
import { RowActionsMenu } from "@/components/shared/RowActionsMenu";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Broker {
  id: string;
  name: string;
  phone: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  phone_number: string | null;
}

interface Policy {
  id: string;
  policy_type_parent: string;
  insurance_price: number;
  profit: number;
  start_date: string;
  end_date: string;
  broker_direction: 'from_broker' | 'to_broker' | null;
  client: { full_name: string } | null;
  car: { car_number: string } | null;
}

interface BrokerDetailsProps {
  broker: Broker;
  onBack: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: "إلزامي",
  THIRD_FULL: "طرف ثالث/شامل",
  ROAD_SERVICE: "خدمة الطريق",
  ACCIDENT_FEE_EXEMPTION: "إعفاء حدمات",
};

export function BrokerDetails({ broker, onBack, onEdit, onRefresh }: BrokerDetailsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCollected: 0,
    totalRemaining: 0,
    fromBrokerTotal: 0,
    toBrokerTotal: 0,
  });
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [viewingPolicyId, setViewingPolicyId] = useState<string | null>(null);
  
  // Date filter state
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch clients under this broker
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, full_name, id_number, phone_number")
        .eq("broker_id", broker.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      setClients(clientsData || []);

      // Fetch policies for this broker with date filter
      let query = supabase
        .from("policies")
        .select(`
          id, policy_type_parent, insurance_price, profit, start_date, end_date, broker_direction,
          clients!policies_client_id_fkey(full_name),
          cars!policies_car_id_fkey(car_number)
        `)
        .eq("broker_id", broker.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (startDate) {
        query = query.gte("start_date", format(startDate, "yyyy-MM-dd"));
      }
      if (endDate) {
        query = query.lte("start_date", format(endDate, "yyyy-MM-dd"));
      }

      const { data: policiesData } = await query;

      const formattedPolicies = (policiesData || []).map((p: any) => ({
        ...p,
        client: p.clients,
        car: p.cars,
      }));
      setPolicies(formattedPolicies);

      // Calculate stats
      const policyIds = formattedPolicies.map((p) => p.id);
      let totalCollected = 0;

      if (policyIds.length > 0) {
        const { data: payments } = await supabase
          .from("policy_payments")
          .select("amount, refused")
          .in("policy_id", policyIds);

        totalCollected =
          payments
            ?.filter((p) => !p.refused)
            .reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      }

      const totalPrice = formattedPolicies.reduce(
        (sum, p) => sum + Number(p.insurance_price),
        0
      );

      const fromBrokerPolicies = formattedPolicies.filter(
        (p) => p.broker_direction === 'from_broker'
      );
      const toBrokerPolicies = formattedPolicies.filter(
        (p) => p.broker_direction === 'to_broker' || p.broker_direction === null
      );

      const fromBrokerTotal = fromBrokerPolicies.reduce(
        (sum, p) => sum + Number(p.insurance_price || 0),
        0
      );
      const toBrokerTotal = toBrokerPolicies.reduce(
        (sum, p) => sum + Number(p.insurance_price || 0),
        0
      );

      setStats({
        totalCollected,
        totalRemaining: totalPrice - totalCollected,
        fromBrokerTotal,
        toBrokerTotal,
      });
    } catch (error) {
      console.error("Error fetching broker data:", error);
    } finally {
      setLoading(false);
    }
  }, [broker.id, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  const handlePrint = () => {
    window.print();
  };

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const netBalance = stats.toBrokerTotal - stats.fromBrokerTotal;

  const dateRangeText = startDate || endDate
    ? `${startDate ? format(startDate, "yyyy/MM/dd") : "..."} - ${endDate ? format(endDate, "yyyy/MM/dd") : "..."}`
    : "كل الفترات";

  return (
    <MainLayout>
      <div className="p-6 space-y-6" ref={printRef}>
        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <span className="text-xl font-bold text-primary">
                  {broker.name.charAt(0)}
                </span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{broker.name}</h1>
                {broker.phone && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span dir="ltr">{broker.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="h-4 w-4 ml-2" />
              تعديل
            </Button>
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4 ml-2" />
              إضافة وثيقة
            </Button>
          </div>
        </div>

        {/* Print Header - Only visible when printing */}
        <div className="hidden print:block print:mb-6">
          <div className="text-center border-b-2 border-primary pb-4 mb-4">
            <h1 className="text-3xl font-bold">تقرير الوسيط</h1>
            <h2 className="text-2xl mt-2">{broker.name}</h2>
            {broker.phone && <p className="text-lg text-muted-foreground mt-1" dir="ltr">{broker.phone}</p>}
            <p className="text-sm text-muted-foreground mt-2">
              تاريخ التقرير: {format(new Date(), "yyyy/MM/dd", { locale: ar })}
            </p>
            <p className="text-sm text-muted-foreground">
              الفترة: {dateRangeText}
            </p>
          </div>
        </div>

        {/* Date Filter */}
        <Card className="print:hidden">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[180px] justify-start text-right", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {startDate ? format(startDate, "yyyy/MM/dd") : "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[180px] justify-start text-right", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {endDate ? format(endDate, "yyyy/MM/dd") : "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {(startDate || endDate) && (
                <Button variant="ghost" size="sm" onClick={clearDateFilter}>
                  <X className="h-4 w-4 ml-1" />
                  مسح الفلتر
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards - 5 cards without clients */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 print:grid-cols-5">
          {/* المحصل - Total collected */}
          <Card className="print:border print:shadow-none">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30 print:bg-green-100">
                  <Wallet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">المحصل</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(stats.totalCollected)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* المتبقي - Remaining */}
          <Card className="print:border print:shadow-none">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 print:bg-red-100">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">المتبقي</p>
                  <p className="text-xl font-bold text-destructive print:text-red-600">
                    {formatCurrency(stats.totalRemaining)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* له علي - What broker wants from me (from_broker) */}
          <Card className="border-orange-200 dark:border-orange-800 print:border-orange-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30 print:bg-orange-100">
                  <TrendingDown className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">له علي</p>
                  <p className="text-xl font-bold text-orange-600">
                    {formatCurrency(stats.fromBrokerTotal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* علي له - What I want from broker (to_broker or null) */}
          <Card className="border-green-200 dark:border-green-800 print:border-green-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30 print:bg-green-100">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">علي له</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(stats.toBrokerTotal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Net Balance */}
          <Card className={cn(
            "border-2 print:border-2",
            netBalance >= 0 ? "border-green-300 dark:border-green-700 print:border-green-300" : "border-red-300 dark:border-red-700 print:border-red-300"
          )}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  netBalance >= 0 ? "bg-green-100 dark:bg-green-900/30 print:bg-green-100" : "bg-red-100 dark:bg-red-900/30 print:bg-red-100"
                )}>
                  <Wallet className={cn(
                    "h-5 w-5",
                    netBalance >= 0 ? "text-green-600" : "text-red-600"
                  )} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {netBalance >= 0 ? "لي عليه" : "له علي (صافي)"}
                  </p>
                  <p className={cn(
                    "text-xl font-bold",
                    netBalance >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {formatCurrency(Math.abs(netBalance))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        {broker.notes && (
          <Card className="print:border print:shadow-none">
            <CardHeader>
              <CardTitle className="text-base">ملاحظات</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{broker.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Tabs - Hide tabs on print, show content directly */}
        <Tabs defaultValue="policies" className="space-y-4">
          <TabsList className="print:hidden">
            <TabsTrigger value="policies" className="gap-2">
              <FileText className="h-4 w-4" />
              الوثائق ({policies.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="policies" className="print:mt-0">
            <Card className="print:border print:shadow-none">
              <CardHeader>
                <CardTitle className="text-base">
                  وثائق الوسيط ({policies.length} وثيقة)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : policies.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    لا توجد وثائق تحت هذا الوسيط
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="print:text-xs">#</TableHead>
                          <TableHead className="print:text-xs">الجهة</TableHead>
                          <TableHead className="print:text-xs">العميل</TableHead>
                          <TableHead className="print:text-xs">السيارة</TableHead>
                          <TableHead className="print:text-xs">النوع</TableHead>
                          <TableHead className="print:text-xs">السعر</TableHead>
                          <TableHead className="print:text-xs">الصلاحية</TableHead>
                          <TableHead className="w-[80px] print:hidden">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {policies.map((policy, index) => (
                          <TableRow 
                            key={policy.id}
                            className="cursor-pointer hover:bg-muted/50 print:hover:bg-transparent"
                            onClick={() => setViewingPolicyId(policy.id)}
                          >
                            <TableCell className="font-mono text-sm print:text-xs">
                              {index + 1}
                            </TableCell>
                            <TableCell className="print:text-xs">
                              {policy.broker_direction === 'from_broker' ? (
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 print:bg-orange-50">
                                  عن طريق {broker.name}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 print:bg-green-50">
                                  تم تصديرها عن طريقي
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-medium print:text-xs">
                              {policy.client?.full_name || "-"}
                            </TableCell>
                            <TableCell className="font-mono text-sm print:text-xs" dir="ltr">
                              {policy.car?.car_number || "-"}
                            </TableCell>
                            <TableCell className="print:text-xs">
                              <Badge variant="outline" className="print:border">
                                {policyTypeLabels[policy.policy_type_parent] ||
                                  policy.policy_type_parent}
                              </Badge>
                            </TableCell>
                            <TableCell dir="ltr" className="print:text-xs">
                              {formatCurrency(policy.insurance_price)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground print:text-xs">
                              {formatDate(policy.start_date)} - {formatDate(policy.end_date)}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()} className="print:hidden">
                              <RowActionsMenu
                                onView={() => setViewingPolicyId(policy.id)}
                                onEdit={() => setViewingPolicyId(policy.id)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-muted/50 font-bold print:bg-gray-100">
                          <TableCell colSpan={5} className="text-left print:text-xs">
                            المجموع
                          </TableCell>
                          <TableCell dir="ltr" className="print:text-xs">
                            {formatCurrency(policies.reduce((sum, p) => sum + Number(p.insurance_price), 0))}
                          </TableCell>
                          <TableCell colSpan={2}></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Print Footer */}
        <div className="hidden print:block print:mt-8 print:pt-4 print:border-t">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>تم إنشاء التقرير بواسطة نظام AB Insurance CRM</span>
            <span>{format(new Date(), "yyyy/MM/dd HH:mm")}</span>
          </div>
        </div>
      </div>

      {/* Add Client Drawer - pre-selected broker */}
      <ClientDrawer
        open={clientDrawerOpen}
        onOpenChange={setClientDrawerOpen}
        client={null}
        onSaved={() => {
          fetchData();
          onRefresh();
          setClientDrawerOpen(false);
        }}
        defaultBrokerId={broker.id}
      />

      {/* Policy Wizard - pre-selected broker */}
      <PolicyWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={() => {
          fetchData();
          onRefresh();
        }}
        defaultBrokerId={broker.id}
      />

      {/* Policy Details Drawer */}
      <PolicyDetailsDrawer
        open={!!viewingPolicyId}
        onOpenChange={(open) => !open && setViewingPolicyId(null)}
        policyId={viewingPolicyId}
        onUpdated={() => {
          fetchData();
          onRefresh();
        }}
      />
    </MainLayout>
  );
}
