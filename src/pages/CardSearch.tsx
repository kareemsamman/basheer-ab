import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Search, Loader2, Phone, User, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface CardPaymentResult {
  id: string;
  amount: number;
  card_last_four: string | null;
  payment_date: string;
  payment_type: string;
  installments_count: number | null;
  tranzila_approval_code: string | null;
  refused: boolean | null;
  created_at: string;
  policy: {
    id: string;
    policy_type_parent: string;
    policy_type_child: string | null;
    policy_number: string | null;
    client: {
      id: string;
      full_name: string;
      phone_number: string | null;
      id_number: string;
    };
  } | null;
}

export default function CardSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<CardPaymentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchPayments = async (filter?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from("policy_payments")
        .select(`
          id, amount, card_last_four, payment_date, payment_type,
          installments_count, tranzila_approval_code, refused, created_at,
          policy:policies!policy_id (
            id, policy_type_parent, policy_type_child, policy_number,
            client:clients!client_id (
              id, full_name, phone_number, id_number
            )
          )
        `)
        .eq("payment_type", "visa")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filter && filter.length >= 2) {
        query = query.ilike("card_last_four", `%${filter}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setResults((data as any) || []);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Load all visa payments on mount
  useEffect(() => {
    fetchPayments();
  }, []);

  const handleSearch = () => {
    fetchPayments(searchTerm.trim());
  };

  const handleClear = () => {
    setSearchTerm("");
    fetchPayments();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const getTypeLabel = (parent: string, child: string | null) => {
    if (parent === "ELZAMI") return "إلزامي";
    if (parent === "THIRD_FULL") return child === "FULL" ? "شامل" : "ثالث";
    if (parent === "ROAD_SERVICE") return "خدمة طريق";
    if (parent === "ACCIDENT_FEE") return "رسوم حوادث";
    return parent;
  };

  const totalAmount = results.reduce((s, r) => s + (r.refused ? 0 : Number(r.amount || 0)), 0);

  return (
    <MainLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">دفعات البطاقات</h1>
              <p className="text-sm text-muted-foreground">جميع دفعات الفيزا مع إمكانية البحث بآخر 4 أرقام</p>
            </div>
          </div>
        </div>

        {/* Search + Stats */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="ابحث بآخر 4 أرقام..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pr-9 ltr-nums text-base tracking-widest w-52"
                maxLength={4}
                dir="ltr"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "بحث"}
            </Button>
            {searchTerm && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
              <span className="text-muted-foreground">عدد الدفعات:</span>
              <span className="font-bold ltr-nums">{results.length}</span>
            </div>
            <div className="flex items-center gap-2 bg-primary/5 rounded-lg px-3 py-2">
              <span className="text-muted-foreground">المجموع:</span>
              <span className="font-bold text-primary ltr-nums">₪{totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden border-border/50">
          <CardContent className="p-0">
            {loading && results.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">لا توجد دفعات فيزا</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="font-semibold">العميل</TableHead>
                      <TableHead className="font-semibold">الهاتف</TableHead>
                      <TableHead className="font-semibold">رقم الهوية</TableHead>
                      <TableHead className="font-semibold">المبلغ</TableHead>
                      <TableHead className="font-semibold">آخر 4 أرقام</TableHead>
                      <TableHead className="font-semibold">تاريخ الدفع</TableHead>
                      <TableHead className="font-semibold">نوع الوثيقة</TableHead>
                      <TableHead className="font-semibold">تقسيطات</TableHead>
                      <TableHead className="font-semibold">رقم التأكيد</TableHead>
                      <TableHead className="font-semibold">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => {
                      const client = (r.policy as any)?.client;
                      const policy = r.policy as any;
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer transition-colors hover:bg-accent/40"
                          onClick={() => client?.id && navigate(`/clients/${client.id}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <span className="font-medium whitespace-nowrap">{client?.full_name || "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 ltr-nums text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              <span>{client?.phone_number || "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="ltr-nums font-mono text-xs text-muted-foreground">
                            {client?.id_number || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-primary ltr-nums">
                              ₪{Number(r.amount).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            {r.card_last_four ? (
                              <Badge variant="outline" className="ltr-nums font-mono tracking-[0.2em] text-xs px-2">
                                •••• {r.card_last_four}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="ltr-nums text-muted-foreground">
                            {r.payment_date ? format(new Date(r.payment_date), "dd/MM/yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs font-normal">
                              {policy ? getTypeLabel(policy.policy_type_parent, policy.policy_type_child) : "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="ltr-nums text-center text-muted-foreground">
                            {r.installments_count && r.installments_count > 1 ? (
                              <Badge variant="outline" className="text-xs ltr-nums">{r.installments_count}x</Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="ltr-nums font-mono text-xs text-muted-foreground">
                            {r.tranzila_approval_code || "—"}
                          </TableCell>
                          <TableCell>
                            {r.refused ? (
                              <Badge variant="destructive" className="text-xs">مرفوض</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs border-primary/30 text-primary">ناجح</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
