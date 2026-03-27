import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle, XCircle, SkipForward, Clock, Loader2, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClickablePhone } from '@/components/shared/ClickablePhone';
import { getInsuranceTypeLabel } from '@/lib/insuranceTypes';

interface AssistantClient {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  policy_ids: string[];
}

interface AssistantPolicy {
  id: string;
  car_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  company_name: string | null;
  company_name_ar: string | null;
  end_date: string;
  insurance_price: number;
}

interface RenewalAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: AssistantClient[];
  startDate: string;
  endDate: string;
  onComplete: () => void;
}

export function RenewalAssistantDialog({
  open,
  onOpenChange,
  clients,
  startDate,
  endDate,
  onComplete,
}: RenewalAssistantDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [policies, setPolicies] = useState<AssistantPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const currentClient = clients[currentIndex];
  const total = clients.length;
  const progress = total > 0 ? ((currentIndex) / total) * 100 : 0;

  // Fetch policies when client changes
  useEffect(() => {
    if (!open || !currentClient) return;
    setShowDeclineReason(false);
    setDeclineReason('');
    fetchPolicies();
  }, [currentIndex, open, currentClient?.client_id]);

  const fetchPolicies = async () => {
    if (!currentClient) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_client_renewal_policies', {
        p_client_id: currentClient.client_id,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      setPolicies((data as AssistantPolicy[]) || []);
    } catch (err) {
      console.error('Error fetching policies:', err);
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: string, notes?: string) => {
    if (!currentClient) return;
    setSaving(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const policyIds = currentClient.policy_ids || [];

      for (const policyId of policyIds) {
        const { error } = await supabase
          .from('policy_renewal_tracking')
          .upsert({
            policy_id: policyId,
            renewal_status: status,
            notes: notes || null,
            last_contacted_at: new Date().toISOString(),
            contacted_by: userId,
          }, { onConflict: 'policy_id' });
        if (error) throw error;
      }

      toast.success(
        status === 'renewed'
          ? `تم تحديد ${currentClient.client_name} كمُجدد`
          : status === 'declined_renewal'
            ? `تم تسجيل رفض التجديد لـ ${currentClient.client_name}`
            : undefined
      );
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('فشل في تحديث الحالة');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      // Done
      onOpenChange(false);
      onComplete();
    }
  };

  const handleRenewed = async () => {
    await updateStatus('renewed');
    goNext();
  };

  const handleNotYet = () => {
    // No status change, just move on
    goNext();
  };

  const handleDeclineSubmit = async () => {
    if (!declineReason.trim()) {
      toast.error('يجب إدخال سبب الرفض');
      return;
    }
    await updateStatus('declined_renewal', declineReason.trim());
    setShowDeclineReason(false);
    setDeclineReason('');
    goNext();
  };

  const handleSkip = () => {
    goNext();
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB');

  if (!currentClient) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>مساعد التجديد</span>
            <Badge variant="outline" className="font-mono text-xs">
              عميل {currentIndex + 1} من {total}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Progress value={progress} className="h-2" />

        {/* Client Info */}
        <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{currentClient.client_name}</h3>
            {currentClient.client_phone && (
              <div onClick={(e) => e.stopPropagation()}>
                <ClickablePhone phone={currentClient.client_phone} />
              </div>
            )}
          </div>
        </div>

        {/* Policies Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right text-xs">رقم السيارة</TableHead>
                  <TableHead className="text-right text-xs">رقم السيارة</TableHead>
                  <TableHead className="text-right text-xs">النوع</TableHead>
                  <TableHead className="text-right text-xs">الشركة</TableHead>
                  <TableHead className="text-right text-xs">تاريخ الانتهاء</TableHead>
                  <TableHead className="text-right text-xs">السعر</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.policy_number || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{p.car_number || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {getInsuranceTypeLabel(p.policy_type_parent as any, p.policy_type_child as any)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{p.company_name_ar || p.company_name || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{formatDate(p.end_date)}</TableCell>
                    <TableCell className="font-bold">₪{p.insurance_price.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Decline reason input */}
        {showDeclineReason && (
          <div className="space-y-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <p className="text-sm font-medium">سبب عدم الرغبة بالتجديد:</p>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="أدخل السبب..."
              rows={3}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={handleDeclineSubmit}
                disabled={saving || !declineReason.trim()}
                variant="destructive"
                size="sm"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                تأكيد
              </Button>
              <Button
                onClick={() => { setShowDeclineReason(false); setDeclineReason(''); }}
                variant="outline"
                size="sm"
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!showDeclineReason && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Button
              onClick={handleRenewed}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              نعم، تم التجديد
            </Button>
            <Button
              onClick={handleNotYet}
              disabled={saving}
              variant="outline"
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              لا، ليس بعد
            </Button>
            <Button
              onClick={() => setShowDeclineReason(true)}
              disabled={saving}
              variant="outline"
              className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <XCircle className="h-4 w-4" />
              لا يرغب بالتجديد
            </Button>
            <Button
              onClick={handleSkip}
              disabled={saving}
              variant="ghost"
              className="gap-2"
            >
              <SkipForward className="h-4 w-4" />
              تخطي
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
