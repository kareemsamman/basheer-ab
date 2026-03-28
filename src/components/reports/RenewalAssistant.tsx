import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle,
  Clock,
  XCircle,
  SkipForward,
  Phone,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClickablePhone } from '@/components/shared/ClickablePhone';
import { getInsuranceTypeLabel } from '@/lib/insuranceTypes';
import { ExpiryBadge } from '@/components/shared/ExpiryBadge';

interface RenewalPolicy {
  id: string;
  car_number: string | null;
  policy_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  company_name: string | null;
  company_name_ar: string | null;
  end_date: string;
  insurance_price: number;
}

interface AssistantClient {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  policies: RenewalPolicy[];
}

interface RenewalAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string; // YYYY-MM
  onActionComplete: () => void;
}

export function RenewalAssistant({ open, onOpenChange, month, onActionComplete }: RenewalAssistantProps) {
  const [clients, setClients] = useState<AssistantClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [fetchError, setFetchError] = useState(false);

  const followUpMonth = `${month}-01`;
  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const fetchPendingClients = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [year, mo] = month.split('-').map(Number);
      const startDate = formatLocalDate(new Date(year, mo - 1, 1));
      const endDate = formatLocalDate(new Date(year, mo, 0));

      // Get clients with expiring policies
      const { data: policies, error } = await (supabase as any)
        .from('policies')
        .select(`
          id,
          policy_number,
          policy_type_parent,
          policy_type_child,
          end_date,
          insurance_price,
          client_id,
          clients!inner(id, full_name, phone_number),
          cars(car_number),
          insurance_companies(name, name_ar)
        `)
        .gte('end_date', startDate)
        .lte('end_date', endDate)
        .is('deleted_at', null)
        .eq('cancelled', false)
        .eq('transferred', false)
        .order('client_id');

      if (error) throw error;

      // Get existing followups for this month to exclude renewed/declined
      const { data: followups } = await supabase
        .from('renewal_followups')
        .select('client_id, status')
        .eq('follow_up_month', followUpMonth)
        .in('status', ['renewed', 'declined_renewal']);

      const excludedClientIds = new Set((followups || []).map(f => f.client_id));

      // Group by client
      const clientMap = new Map<string, AssistantClient>();
      for (const p of (policies || [])) {
        const clientData = p.clients as any;
        if (!clientData || excludedClientIds.has(clientData.id)) continue;

        if (!clientMap.has(clientData.id)) {
          clientMap.set(clientData.id, {
            client_id: clientData.id,
            client_name: clientData.full_name,
            client_phone: clientData.phone_number,
            policies: [],
          });
        }

        clientMap.get(clientData.id)!.policies.push({
          id: p.id,
          car_number: (p.cars as any)?.car_number || null,
          policy_number: p.policy_number,
          policy_type_parent: p.policy_type_parent,
          policy_type_child: p.policy_type_child,
          company_name: (p.insurance_companies as any)?.name || null,
          company_name_ar: (p.insurance_companies as any)?.name_ar || null,
          end_date: p.end_date,
          insurance_price: p.insurance_price || 0,
        });
      }

      setClients(Array.from(clientMap.values()));
      setCurrentIndex(0);
    } catch (err) {
      console.error('Error fetching assistant clients:', err);
      toast.error('فشل في تحميل بيانات المتابعة');
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [month, followUpMonth]);

  useEffect(() => {
    if (open) {
      fetchPendingClients();
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  }, [open, fetchPendingClients]);

  const currentClient = clients[currentIndex];

  const handleAction = async (action: 'renewed' | 'pending' | 'declined_renewal' | 'skip') => {
    if (action === 'declined_renewal' && !showDeclineReason) {
      setShowDeclineReason(true);
      return;
    }

    if (action === 'declined_renewal' && !declineReason.trim()) {
      toast.error('يرجى إدخال سبب الرفض');
      return;
    }

    if (action === 'skip') {
      goNext();
      return;
    }

    if (!currentClient) return;

    setSaving(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;

      const { error } = await supabase
        .from('renewal_followups')
        .upsert({
          client_id: currentClient.client_id,
          follow_up_month: followUpMonth,
          status: action,
          decline_reason: action === 'declined_renewal' ? declineReason.trim() : null,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id,follow_up_month' });

      if (error) throw error;

      const labels: Record<string, string> = {
        renewed: 'تم تسجيل التجديد',
        pending: 'تم الحفظ كمعلق',
        declined_renewal: 'تم تسجيل رفض التجديد',
      };
      toast.success(labels[action]);

      // Remove from list if renewed or declined
      if (action === 'renewed' || action === 'declined_renewal') {
        setClients(prev => prev.filter(c => c.client_id !== currentClient.client_id));
        // Don't increment index since array shrunk
        if (currentIndex >= clients.length - 1) {
          setCurrentIndex(Math.max(0, clients.length - 2));
        }
      } else {
        goNext();
      }

      setShowDeclineReason(false);
      setDeclineReason('');
      onActionComplete();
    } catch (err) {
      console.error('Error saving followup:', err);
      toast.error('فشل في حفظ المتابعة');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (currentIndex < clients.length - 1) {
      setCurrentIndex(i => i + 1);
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            مساعد التجديد — {month}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : fetchError ? (
          <div className="text-center py-8 space-y-3">
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <p className="text-lg font-medium">فشل في تحميل البيانات</p>
            <p className="text-muted-foreground">حدث خطأ أثناء جلب بيانات المتابعة</p>
            <Button variant="outline" onClick={fetchPendingClients}>إعادة المحاولة</Button>
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
            <p className="text-lg font-medium">تم الانتهاء!</p>
            <p className="text-muted-foreground">لا يوجد عملاء بحاجة لمتابعة في هذا الشهر</p>
          </div>
        ) : currentClient ? (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>العميل {currentIndex + 1} من {clients.length}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={currentIndex === 0}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={currentIndex >= clients.length - 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${((currentIndex + 1) / clients.length) * 100}%` }}
              />
            </div>

            {/* Client Info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{currentClient.client_name}</h3>
                <Badge variant="outline">{currentClient.policies.length} وثيقة</Badge>
              </div>
              {currentClient.client_phone && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <ClickablePhone phone={currentClient.client_phone} />
                </div>
              )}
            </div>

            {/* Policies Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-right p-2 font-medium">رقم الوثيقة</th>
                    <th className="text-right p-2 font-medium">رقم السيارة</th>
                    <th className="text-right p-2 font-medium">النوع</th>
                    <th className="text-right p-2 font-medium">الشركة</th>
                    <th className="text-right p-2 font-medium">تاريخ الانتهاء</th>
                    <th className="text-right p-2 font-medium">السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {currentClient.policies.map(policy => (
                    <tr key={policy.id} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{policy.policy_number || '-'}</td>
                      <td className="p-2 font-mono">{policy.car_number || '-'}</td>
                      <td className="p-2">
                        <Badge variant="secondary" className="text-xs">
                          {getInsuranceTypeLabel(policy.policy_type_parent as any, policy.policy_type_child as any)}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">{policy.company_name_ar || policy.company_name || '-'}</td>
                      <td className="p-2">
                        <ExpiryBadge endDate={policy.end_date} showDays />
                      </td>
                      <td className="p-2 font-bold">₪{policy.insurance_price.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t">
                    <td colSpan={5} className="p-2 font-medium text-right">المجموع</td>
                    <td className="p-2 font-bold text-primary">
                      ₪{currentClient.policies.reduce((s, p) => s + p.insurance_price, 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Decline Reason */}
            {showDeclineReason && (
              <div className="space-y-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                <p className="text-sm font-medium text-destructive">سبب رفض التجديد (مطلوب)</p>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="اكتب سبب رفض العميل للتجديد..."
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleAction('declined_renewal')}
                    disabled={saving || !declineReason.trim()}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                    تأكيد الرفض
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowDeclineReason(false); setDeclineReason(''); }}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!showDeclineReason && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700 gap-2"
                  onClick={() => handleAction('renewed')}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  نعم، تم التجديد
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => handleAction('pending')}
                  disabled={saving}
                >
                  <Clock className="h-4 w-4" />
                  لا، لم يجدد بعد
                </Button>
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={() => handleAction('declined_renewal')}
                  disabled={saving}
                >
                  <XCircle className="h-4 w-4" />
                  لا يريد التجديد
                </Button>
                <Button
                  variant="ghost"
                  className="gap-2"
                  onClick={() => handleAction('skip')}
                  disabled={saving}
                >
                  <SkipForward className="h-4 w-4" />
                  تخطي
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
