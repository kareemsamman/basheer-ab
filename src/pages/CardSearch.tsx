import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Search, Loader2, Phone, User, FileText, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface CardPaymentResult {
  id: string;
  amount: number;
  card_last_four: string;
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
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term || term.length < 2) return;

    setLoading(true);
    setSearched(true);

    try {
      const { data, error } = await supabase
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
        .ilike("card_last_four", `%${term}%`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setResults((data as any) || []);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">بحث برقم البطاقة</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ابحث بآخر 4 أرقام من بطاقة الائتمان</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 max-w-md">
              <Input
                placeholder="مثال: 2484"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="ltr-nums text-lg tracking-widest"
                maxLength={4}
                dir="ltr"
              />
              <Button onClick={handleSearch} disabled={loading || searchTerm.trim().length < 2}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                بحث
              </Button>
            </div>
          </CardContent>
        </Card>

        {searched && (
          <Card>
            <CardContent className="pt-6">
              {results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>لم يتم العثور على نتائج</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    تم العثور على {results.length} نتيجة
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>العميل</TableHead>
                          <TableHead>الهاتف</TableHead>
                          <TableHead>رقم الهوية</TableHead>
                          <TableHead>المبلغ</TableHead>
                          <TableHead>آخر 4 أرقام</TableHead>
                          <TableHead>تاريخ الدفع</TableHead>
                          <TableHead>نوع الوثيقة</TableHead>
                          <TableHead>تقسيطات</TableHead>
                          <TableHead>رقم التأكيد</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r) => {
                          const client = (r.policy as any)?.client;
                          const policy = r.policy as any;
                          return (
                            <TableRow
                              key={r.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => client?.id && navigate(`/clients/${client.id}`)}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  {client?.full_name || "—"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 ltr-nums">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  {client?.phone_number || "—"}
                                </div>
                              </TableCell>
                              <TableCell className="ltr-nums font-mono text-xs">
                                {client?.id_number || "—"}
                              </TableCell>
                              <TableCell className="font-semibold text-primary ltr-nums">
                                ₪{Number(r.amount).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="ltr-nums font-mono tracking-widest">
                                  ****{r.card_last_four}
                                </Badge>
                              </TableCell>
                              <TableCell className="ltr-nums">
                                {r.payment_date ? format(new Date(r.payment_date), "dd/MM/yyyy") : "—"}
                              </TableCell>
                              <TableCell>
                                {policy ? getTypeLabel(policy.policy_type_parent, policy.policy_type_child) : "—"}
                              </TableCell>
                              <TableCell className="ltr-nums text-center">
                                {r.installments_count && r.installments_count > 1 ? r.installments_count : "—"}
                              </TableCell>
                              <TableCell className="ltr-nums font-mono text-xs">
                                {r.tranzila_approval_code || "—"}
                              </TableCell>
                              <TableCell>
                                {r.refused ? (
                                  <Badge variant="destructive" className="text-xs">مرفوض</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">ناجح</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
