import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Search, Loader2, Phone, User, X, Wallet } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
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
        .limit(500);

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

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleSearch = () => fetchPayments(searchTerm.trim());

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

  const successResults = results.filter((r) => !r.refused);
  const totalAmount = successResults.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">دفعات البطاقات</h1>
              <p className="text-xs text-muted-foreground">بحث بآخر 4 أرقام من بطاقة الائتمان</p>
            </div>
          </div>

          {/* Stats pills */}
          <div className="flex gap-2 text-xs">
            <div className="inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5">
              <span className="text-muted-foreground">الدفعات</span>
              <span className="font-bold ltr-nums">{results.length}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 border border-primary/20 bg-primary/5 rounded-full px-3 py-1.5">
              <Wallet className="h-3 w-3 text-primary" />
              <span className="font-bold text-primary ltr-nums">₪{totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="ابحث بآخر 4 أرقام..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pr-8 h-9 text-sm ltr-nums tracking-widest"
              maxLength={4}
              dir="ltr"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading} size="sm" className="h-9 px-4">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "بحث"}
          </Button>
          {searchTerm && (
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={handleClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden shadow-sm">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">لا توجد دفعات فيزا</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">العميل</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">الهاتف</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">رقم الهوية</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">المبلغ</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">آخر 4 أرقام</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">تاريخ الدفع</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">النوع</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap text-center">تقسيط</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap">رقم التأكيد</TableHead>
                    <TableHead className="text-xs font-semibold text-foreground/70 whitespace-nowrap text-center">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => {
                    const client = (r.policy as any)?.client;
                    const policy = r.policy as any;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer transition-colors hover:bg-accent/30 group border-b border-border/30 last:border-0"
                        onClick={() => client?.id && navigate(`/clients/${client.id}`)}
                      >
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                              <User className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <span className="font-medium text-sm whitespace-nowrap">{client?.full_name || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="flex items-center gap-1 ltr-nums text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            {client?.phone_number || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 ltr-nums text-xs text-muted-foreground font-mono">
                          {client?.id_number || "—"}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="font-bold text-sm text-primary ltr-nums">
                            ₪{Number(r.amount).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          {r.card_last_four ? (
                            <code className="inline-flex items-center gap-0.5 text-[11px] font-mono bg-muted/80 rounded px-1.5 py-0.5 ltr-nums tracking-wider">
                              <span className="text-muted-foreground/50">••••</span>
                              <span className="font-semibold">{r.card_last_four}</span>
                            </code>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 ltr-nums text-xs text-muted-foreground">
                          {r.payment_date ? format(new Date(r.payment_date), "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell className="py-3">
                          {policy ? (
                            <span className="inline-block text-[11px] bg-secondary/80 text-secondary-foreground rounded px-2 py-0.5">
                              {getTypeLabel(policy.policy_type_parent, policy.policy_type_child)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          {r.installments_count && r.installments_count > 1 ? (
                            <span className="text-[11px] ltr-nums font-medium bg-muted rounded px-1.5 py-0.5">{r.installments_count}x</span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 ltr-nums text-[11px] font-mono text-muted-foreground">
                          {r.tranzila_approval_code || "—"}
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          {r.refused ? (
                            <span className="inline-flex items-center text-[11px] font-medium text-destructive bg-destructive/10 rounded-full px-2 py-0.5">مرفوض</span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">ناجح</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
