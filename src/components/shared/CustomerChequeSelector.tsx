import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Receipt, User, Calendar, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface SelectableCheque {
  id: string;
  amount: number;
  payment_date: string;
  cheque_number: string | null;
  cheque_image_url: string | null;
  policy_id: string;
  client_name: string;
  client_phone: string | null;
  car_number: string | null;
}

interface CustomerChequeSelectorProps {
  selectedCheques: SelectableCheque[];
  onSelectionChange: (cheques: SelectableCheque[]) => void;
  maxSelectable?: number;
}

export function CustomerChequeSelector({
  selectedCheques,
  onSelectionChange,
  maxSelectable,
}: CustomerChequeSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [availableCheques, setAvailableCheques] = useState<SelectableCheque[]>([]);

  useEffect(() => {
    fetchAvailableCheques();
  }, []);

  const fetchAvailableCheques = async () => {
    setLoading(true);
    try {
      // Fetch only waiting cheques (pending status, not transferred, not refused)
      const { data, error } = await supabase
        .from('policy_payments')
        .select(`
          id, amount, payment_date, cheque_number, cheque_image_url, policy_id, cheque_status, refused, transferred_to_type,
          policies:policy_id (
            id,
            clients:client_id (full_name, phone_number),
            cars:car_id (car_number)
          )
        `)
        .eq('payment_type', 'cheque');

      if (error) {
        console.error('Error fetching cheques query:', error);
        throw error;
      }

      // Filter client-side to ensure correct logic
      const filteredData = (data || []).filter((c: any) => {
        const status = c.cheque_status;
        const isWaiting = status === null || status === 'pending';
        const notTransferred = c.transferred_to_type === null;
        const notRefused = c.refused === null || c.refused === false;
        return isWaiting && notTransferred && notRefused;
      });

      const formattedCheques: SelectableCheque[] = filteredData.map((c: any) => ({
        id: c.id,
        amount: Number(c.amount) || 0,
        payment_date: c.payment_date,
        cheque_number: c.cheque_number,
        cheque_image_url: c.cheque_image_url,
        policy_id: c.policy_id,
        client_name: c.policies?.clients?.full_name || 'غير معروف',
        client_phone: c.policies?.clients?.phone_number || null,
        car_number: c.policies?.cars?.car_number || null,
      }));

      setAvailableCheques(formattedCheques);
    } catch (error) {
      console.error('Error fetching cheques:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCheques = useMemo(() => {
    if (!searchQuery.trim()) return availableCheques;
    
    const query = searchQuery.toLowerCase();
    return availableCheques.filter(c =>
      c.client_name.toLowerCase().includes(query) ||
      c.client_phone?.includes(query) ||
      c.cheque_number?.includes(query) ||
      c.car_number?.toLowerCase().includes(query)
    );
  }, [availableCheques, searchQuery]);

  const isSelected = (chequeId: string) => selectedCheques.some(c => c.id === chequeId);

  const toggleCheque = (cheque: SelectableCheque) => {
    if (isSelected(cheque.id)) {
      onSelectionChange(selectedCheques.filter(c => c.id !== cheque.id));
    } else {
      if (maxSelectable && selectedCheques.length >= maxSelectable) return;
      onSelectionChange([...selectedCheques, cheque]);
    }
  };

  const removeCheque = (chequeId: string) => {
    onSelectionChange(selectedCheques.filter(c => c.id !== chequeId));
  };

  const totalSelected = selectedCheques.reduce((sum, c) => sum + c.amount, 0);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG');
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف أو رقم الشيك..."
          className="pr-10"
        />
      </div>

      {/* Selected Cheques Summary */}
      {selectedCheques.length > 0 && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">الشيكات المختارة ({selectedCheques.length})</span>
            <span className="font-bold text-primary">₪{totalSelected.toLocaleString()}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCheques.map(cheque => (
              <Badge
                key={cheque.id}
                variant="secondary"
                className="gap-1 pr-1"
              >
                <span>{cheque.client_name}</span>
                <span className="text-muted-foreground">₪{cheque.amount}</span>
                <button
                  onClick={() => removeCheque(cheque.id)}
                  className="mr-1 hover:bg-destructive/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Available Cheques */}
      <ScrollArea className="h-[300px] border rounded-lg">
        {filteredCheques.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>لا توجد شيكات متاحة</p>
            <p className="text-xs mt-1">فقط الشيكات بحالة "قيد الانتظار" يمكن اختيارها</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>رقم الشيك</TableHead>
                <TableHead>تاريخ الاستحقاق</TableHead>
                <TableHead>المبلغ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCheques.map(cheque => {
                const selected = isSelected(cheque.id);
                const isOverdue = new Date(cheque.payment_date) < new Date();
                
                return (
                  <TableRow
                    key={cheque.id}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selected && "bg-primary/5",
                      isOverdue && !selected && "bg-destructive/5"
                    )}
                    onClick={() => toggleCheque(cheque)}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleCheque(cheque)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{cheque.client_name}</p>
                          {cheque.client_phone && (
                            <p className="text-xs text-muted-foreground">{cheque.client_phone}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {cheque.cheque_number || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className={cn(isOverdue && "text-destructive")}>
                          {formatDate(cheque.payment_date)}
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-xs mr-1">متأخر</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-bold">
                      ₪{cheque.amount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
    </div>
  );
}
