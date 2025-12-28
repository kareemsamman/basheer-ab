import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { ar } from "date-fns/locale";
import { 
  DollarSign, Search, AlertTriangle, Clock, Send, 
  Phone, Eye, Filter, Users, TrendingDown, Calendar,
  MessageSquare, RefreshCw, ChevronDown, ChevronUp
} from "lucide-react";
import { PolicyDetailsDrawer } from "@/components/policies/PolicyDetailsDrawer";

interface ClientDebt {
  client_id: string;
  client_name: string;
  phone_number: string | null;
  total_owed: number;
  policies: PolicyDebt[];
  policies_count: number;
  earliest_expiry: string | null;
  days_until_expiry: number | null;
}

interface PolicyDebt {
  id: string;
  policy_number: string | null;
  insurance_price: number;
  paid: number;
  remaining: number;
  end_date: string;
  days_until_expiry: number;
  status: 'active' | 'expiring_soon' | 'expired';
}

export default function DebtTracking() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientDebt[]>([]);
  const [search, setSearch] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [sendingSmsTo, setSendingSmsTo] = useState<string | null>(null);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientDebt | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [policyDrawerOpen, setPolicyDrawerOpen] = useState(false);
  const [filterDays, setFilterDays] = useState<number | null>(null);

  useEffect(() => {
    fetchDebtData();
  }, []);

  const fetchDebtData = async () => {
    setLoading(true);
    try {
      // Fetch all active policies with payments
      const { data: policies, error } = await supabase
        .from("policies")
        .select(`
          id,
          policy_number,
          insurance_price,
          end_date,
          client_id,
          clients!inner(id, full_name, phone_number),
          policy_payments(amount, refused)
        `)
        .eq("cancelled", false)
        .is("deleted_at", null);

      if (error) throw error;

      const today = new Date();
      const clientMap = new Map<string, ClientDebt>();

      for (const policy of policies || []) {
        const client = policy.clients as any;
        if (!client) continue;

        // Calculate paid and remaining - only count non-refused payments
        const payments = policy.policy_payments || [];
        const paid = payments
          .filter((p: any) => p.refused !== true) // Include null and false
          .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
        const remaining = Number(policy.insurance_price) - paid;

        // Skip fully paid policies
        if (remaining <= 0) continue;

        const endDate = new Date(policy.end_date);
        const daysUntilExpiry = differenceInDays(endDate, today);

        let status: 'active' | 'expiring_soon' | 'expired' = 'active';
        if (daysUntilExpiry < 0) status = 'expired';
        else if (daysUntilExpiry <= 30) status = 'expiring_soon';

        const policyDebt: PolicyDebt = {
          id: policy.id,
          policy_number: policy.policy_number,
          insurance_price: policy.insurance_price,
          paid,
          remaining,
          end_date: policy.end_date,
          days_until_expiry: daysUntilExpiry,
          status,
        };

        if (!clientMap.has(client.id)) {
          clientMap.set(client.id, {
            client_id: client.id,
            client_name: client.full_name,
            phone_number: client.phone_number,
            total_owed: 0,
            policies: [],
            policies_count: 0,
            earliest_expiry: null,
            days_until_expiry: null,
          });
        }

        const clientDebt = clientMap.get(client.id)!;
        clientDebt.total_owed += remaining;
        clientDebt.policies.push(policyDebt);
        clientDebt.policies_count++;

        // Track earliest expiry
        if (!clientDebt.earliest_expiry || policy.end_date < clientDebt.earliest_expiry) {
          clientDebt.earliest_expiry = policy.end_date;
          clientDebt.days_until_expiry = daysUntilExpiry;
        }
      }

      // Sort by total owed descending
      const sortedClients = Array.from(clientMap.values())
        .sort((a, b) => b.total_owed - a.total_owed);

      setClients(sortedClients);
    } catch (error: any) {
      console.error("Error fetching debt data:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات الديون",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = useMemo(() => {
    let result = clients;

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter((c) =>
        c.client_name.toLowerCase().includes(searchLower) ||
        c.phone_number?.includes(search)
      );
    }

    // Days filter
    if (filterDays !== null) {
      result = result.filter((c) =>
        c.days_until_expiry !== null && c.days_until_expiry <= filterDays
      );
    }

    return result;
  }, [clients, search, filterDays]);

  const totals = useMemo(() => {
    return {
      totalClients: filteredClients.length,
      totalOwed: filteredClients.reduce((sum, c) => sum + c.total_owed, 0),
      expiringSoon: filteredClients.filter((c) => c.days_until_expiry !== null && c.days_until_expiry <= 30 && c.days_until_expiry >= 0).length,
      expired: filteredClients.filter((c) => c.days_until_expiry !== null && c.days_until_expiry < 0).length,
    };
  }, [filteredClients]);

  const toggleExpanded = (clientId: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  const handleSendReminder = async () => {
    if (!selectedClient) return;
    setSendingSmsTo(selectedClient.client_id);

    try {
      const { data, error } = await supabase.functions.invoke("send-manual-reminder", {
        body: {
          client_id: selectedClient.client_id,
          message: customMessage || undefined,
          sms_type: "payment_request",
        },
      });

      if (error) throw error;

      toast({
        title: "تم الإرسال",
        description: `تم إرسال التذكير إلى ${selectedClient.client_name}`,
      });
      setSmsDialogOpen(false);
      setCustomMessage("");
    } catch (error: any) {
      console.error("Error sending reminder:", error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال التذكير",
        variant: "destructive",
      });
    } finally {
      setSendingSmsTo(null);
    }
  };

  const openSmsDialog = (client: ClientDebt) => {
    setSelectedClient(client);
    setSmsDialogOpen(true);
  };

  const openPolicyDetails = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setPolicyDrawerOpen(true);
  };

  const formatCurrency = (amount: number) => `₪${amount.toLocaleString("he-IL")}`;

  const getExpiryBadge = (days: number | null) => {
    if (days === null) return null;
    if (days < 0) {
      return <Badge variant="destructive">منتهي منذ {Math.abs(days)} يوم</Badge>;
    }
    if (days === 0) {
      return <Badge variant="destructive">ينتهي اليوم</Badge>;
    }
    if (days <= 7) {
      return <Badge variant="destructive">ينتهي خلال {days} أيام</Badge>;
    }
    if (days <= 30) {
      return <Badge className="bg-amber-500 hover:bg-amber-600">ينتهي خلال {days} يوم</Badge>;
    }
    return <Badge variant="secondary">{days} يوم متبقي</Badge>;
  };

  return (
    <MainLayout>
      <Header title="متابعة الديون" subtitle="إدارة المبالغ المستحقة وإرسال التذكيرات" />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <DollarSign className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي الديون</p>
                  <p className="text-2xl font-bold">{formatCurrency(totals.totalOwed)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">عدد العملاء</p>
                  <p className="text-2xl font-bold">{totals.totalClients}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">تنتهي قريباً</p>
                  <p className="text-2xl font-bold">{totals.expiringSoon}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-destructive/10 border-destructive/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-destructive/10">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">منتهية</p>
                  <p className="text-2xl font-bold">{totals.expired}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[200px] max-w-md">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالاسم أو الهاتف..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={filterDays === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterDays(null)}
                >
                  الكل
                </Button>
                <Button
                  variant={filterDays === 7 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterDays(7)}
                >
                  أسبوع
                </Button>
                <Button
                  variant={filterDays === 30 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterDays(30)}
                >
                  شهر
                </Button>
                <Button
                  variant={filterDays === 0 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterDays(0)}
                  className="text-destructive"
                >
                  منتهية
                </Button>
              </div>

              <Button variant="outline" onClick={fetchDebtData}>
                <RefreshCw className="h-4 w-4 ml-2" />
                تحديث
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Debt Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              قائمة الديون
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لا توجد ديون مستحقة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredClients.map((client) => (
                  <div key={client.client_id} className="border rounded-lg overflow-hidden">
                    {/* Client Row */}
                    <div
                      className="flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => toggleExpanded(client.client_id)}
                    >
                      <div className="flex items-center gap-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          {expandedClients.has(client.client_id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                        <div>
                          <p className="font-medium">{client.client_name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            {client.phone_number || "لا يوجد رقم"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {getExpiryBadge(client.days_until_expiry)}
                        <Badge variant="outline">{client.policies_count} وثيقة</Badge>
                        <div className="text-left min-w-[100px]">
                          <p className="font-bold text-lg text-destructive">
                            {formatCurrency(client.total_owed)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSmsDialog(client);
                          }}
                          disabled={!client.phone_number}
                        >
                          <Send className="h-4 w-4 ml-2" />
                          تذكير
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Policies */}
                    {expandedClients.has(client.client_id) && (
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">رقم الوثيقة</TableHead>
                              <TableHead className="text-right">سعر التأمين</TableHead>
                              <TableHead className="text-right">المدفوع</TableHead>
                              <TableHead className="text-right">المتبقي</TableHead>
                              <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                              <TableHead className="text-right">الحالة</TableHead>
                              <TableHead className="text-right">إجراءات</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {client.policies.map((policy) => (
                              <TableRow key={policy.id}>
                                <TableCell className="font-medium">
                                  {policy.policy_number || policy.id.substring(0, 8)}
                                </TableCell>
                                <TableCell>{formatCurrency(policy.insurance_price)}</TableCell>
                                <TableCell className="text-green-600">
                                  {formatCurrency(policy.paid)}
                                </TableCell>
                                <TableCell className="text-destructive font-medium">
                                  {formatCurrency(policy.remaining)}
                                </TableCell>
                                <TableCell>
                                  {format(new Date(policy.end_date), "dd/MM/yyyy")}
                                </TableCell>
                                <TableCell>
                                  {getExpiryBadge(policy.days_until_expiry)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openPolicyDetails(policy.id)}
                                  >
                                    <Eye className="h-4 w-4 ml-1" />
                                    عرض
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SMS Dialog */}
      <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال تذكير دفع</DialogTitle>
            <DialogDescription>
              إرسال رسالة تذكير إلى {selectedClient?.client_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">رقم الهاتف</p>
              <p className="font-medium"><bdi>{selectedClient?.phone_number}</bdi></p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">المبلغ المستحق</p>
              <p className="font-bold text-lg text-destructive">
                {formatCurrency(selectedClient?.total_owed || 0)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                رسالة مخصصة (اختياري - اتركها فارغة لاستخدام القالب الافتراضي)
              </p>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="اكتب رسالة مخصصة أو اترك الحقل فارغاً..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSendReminder}
              disabled={sendingSmsTo === selectedClient?.client_id}
            >
              {sendingSmsTo === selectedClient?.client_id ? (
                <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 ml-2" />
              )}
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy Details Drawer */}
      <PolicyDetailsDrawer
        policyId={selectedPolicyId}
        open={policyDrawerOpen}
        onOpenChange={setPolicyDrawerOpen}
        onUpdated={fetchDebtData}
      />
    </MainLayout>
  );
}
