import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Worker } from './WorkerDrawer';

interface Salary {
  id: string;
  worker_id: string;
  amount: number;
  month: number;
  year: number;
  notes: string | null;
  payment_method: string;
  expense_id: string | null;
  created_at: string;
}

interface SalaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker: Worker;
  salary: Salary | null;
  onSaved: () => void;
}

const MONTHS = [
  { value: 1, label: 'يناير' },
  { value: 2, label: 'فبراير' },
  { value: 3, label: 'مارس' },
  { value: 4, label: 'أبريل' },
  { value: 5, label: 'مايو' },
  { value: 6, label: 'يونيو' },
  { value: 7, label: 'يوليو' },
  { value: 8, label: 'أغسطس' },
  { value: 9, label: 'سبتمبر' },
  { value: 10, label: 'أكتوبر' },
  { value: 11, label: 'نوفمبر' },
  { value: 12, label: 'ديسمبر' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'cheque', label: 'شيك' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'visa', label: 'فيزا' },
];

export function SalaryDialog({ open, onOpenChange, worker, salary, onSaved }: SalaryDialogProps) {
  const isEditing = !!salary;
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      if (salary) {
        setAmount(String(salary.amount));
        setMonth(String(salary.month));
        setYear(String(salary.year));
        setPaymentMethod(salary.payment_method || 'cash');
        setNotes(salary.notes || '');
      } else {
        setAmount('');
        setMonth(String(new Date().getMonth() + 1));
        setYear(String(new Date().getFullYear()));
        setPaymentMethod('cash');
        setNotes('');
      }
    }
  }, [open, salary]);

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('يرجى إدخال المبلغ');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const workerName = `${worker.first_name} ${worker.last_name}`;
      const monthLabel = MONTHS.find(m => m.value === parseInt(month))?.label || month;
      const expenseDesc = `راتب ${workerName} - ${monthLabel} ${year}`;
      const expenseDate = `${year}-${month.padStart(2, '0')}-01`;

      if (isEditing) {
        // Update expense if linked
        if (salary.expense_id) {
          await supabase.from('expenses').update({
            amount: numAmount,
            description: expenseDesc,
            expense_date: expenseDate,
            payment_method: paymentMethod,
            notes: notes || null,
            contact_name: workerName,
          }).eq('id', salary.expense_id);
        }

        const { error } = await supabase.from('worker_salaries').update({
          amount: numAmount,
          month: parseInt(month),
          year: parseInt(year),
          payment_method: paymentMethod,
          notes: notes || null,
        }).eq('id', salary.id);

        if (error) {
          if (error.code === '23505') {
            toast.error('تم إدخال راتب لهذا الشهر مسبقاً');
            return;
          }
          throw error;
        }
        toast.success('تم تحديث الراتب');
      } else {
        // Create expense (سند صرف) first
        const { data: expense, error: expError } = await supabase
          .from('expenses')
          .insert({
            category: 'salaries',
            description: expenseDesc,
            amount: numAmount,
            expense_date: expenseDate,
            voucher_type: 'payment',
            payment_method: paymentMethod,
            contact_name: workerName,
            entity_type: 'worker',
            entity_id: worker.id,
            notes: notes || null,
            created_by_admin_id: user?.id,
          })
          .select('id')
          .single();

        if (expError) throw expError;

        // Create salary record linked to expense
        const { error: salError } = await supabase.from('worker_salaries').insert({
          worker_id: worker.id,
          amount: numAmount,
          month: parseInt(month),
          year: parseInt(year),
          payment_method: paymentMethod,
          notes: notes || null,
          expense_id: expense.id,
          created_by: user?.id,
        });

        if (salError) {
          // Cleanup expense if salary fails
          await supabase.from('expenses').delete().eq('id', expense.id);
          if (salError.code === '23505') {
            toast.error('تم إدخال راتب لهذا الشهر مسبقاً');
            return;
          }
          throw salError;
        }

        toast.success('تم إضافة الراتب وإنشاء سند الصرف');
      }

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('فشل الحفظ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'تعديل الراتب' : 'إضافة راتب'} - {worker.first_name} {worker.last_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>الشهر *</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>السنة *</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>المبلغ (₪) *</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" />
          </div>

          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات..." rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : null}
            {saving ? 'جاري الحفظ...' : isEditing ? 'تحديث' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { Salary };
