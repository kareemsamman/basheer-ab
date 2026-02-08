import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Loader2, Plus, Trash2, Scan, Search, User, Check, ChevronsUpDown, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ChequeScannerDialog } from '@/components/payments/ChequeScannerDialog';
import { sanitizeChequeNumber, CHEQUE_NUMBER_MAX_LENGTH } from '@/lib/chequeUtils';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';

interface Client {
  id: string;
  full_name: string;
  phone_number: string | null;
}

interface ChequeLine {
  id: string;
  amount: number;
  cheque_number: string;
  payment_date: string;
  cheque_image_url?: string;
  notes?: string;
}

interface AddCustomerChequeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddCustomerChequeModal({
  open,
  onOpenChange,
  onSuccess,
}: AddCustomerChequeModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [chequeLines, setChequeLines] = useState<ChequeLine[]>([]);
  const [chequeScannerOpen, setChequeScannerOpen] = useState(false);

  // Fetch clients
  useEffect(() => {
    if (!open) return;
    
    const fetchClients = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('clients')
          .select('id, full_name, phone_number')
          .is('deleted_at', null)
          .order('full_name');
        
        setClients(data || []);
      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchClients();
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedClient(null);
      setChequeLines([]);
      setClientSearch('');
    }
  }, [open]);

  // Filtered clients based on search
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 50);
    const query = clientSearch.toLowerCase();
    return clients.filter(c => 
      c.full_name.toLowerCase().includes(query) ||
      c.phone_number?.includes(query)
    ).slice(0, 50);
  }, [clients, clientSearch]);

  // Add empty cheque line
  const addChequeLine = () => {
    setChequeLines(prev => [...prev, {
      id: crypto.randomUUID(),
      amount: 0,
      cheque_number: '',
      payment_date: new Date().toISOString().split('T')[0],
    }]);
  };

  // Remove cheque line
  const removeChequeLine = (id: string) => {
    setChequeLines(prev => prev.filter(c => c.id !== id));
  };

  // Update cheque line
  const updateChequeLine = (id: string, updates: Partial<ChequeLine>) => {
    setChequeLines(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  // Handle scanner results
  const handleScannerConfirm = (scannedCheques: any[]) => {
    const newLines: ChequeLine[] = scannedCheques.map(cheque => ({
      id: crypto.randomUUID(),
      amount: cheque.amount || 0,
      cheque_number: cheque.cheque_number || '',
      payment_date: cheque.payment_date || new Date().toISOString().split('T')[0],
      cheque_image_url: cheque.image_url,
    }));
    
    setChequeLines(prev => [...prev, ...newLines]);
    setChequeScannerOpen(false);
    toast.success(`تم إضافة ${newLines.length} شيك`);
  };

  // Calculate totals
  const totalAmount = useMemo(() => {
    return chequeLines.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [chequeLines]);

  // Validation
  const isValid = useMemo(() => {
    if (!selectedClient) return false;
    if (chequeLines.length === 0) return false;
    
    return chequeLines.every(c => 
      c.amount > 0 && 
      c.cheque_number.trim().length > 0 &&
      c.payment_date
    );
  }, [selectedClient, chequeLines]);

  // Save cheques
  const handleSave = async () => {
    if (!selectedClient || !isValid) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get user's branch
      const { data: profile } = await supabase
        .from('profiles')
        .select('branch_id')
        .eq('id', user?.id)
        .single();
      
      const branchId = profile?.branch_id || null;
      
      // Insert cheques as client_payments (wallet payments)
      const paymentsToInsert = chequeLines.map(cheque => ({
        client_id: selectedClient.id,
        amount: cheque.amount,
        payment_type: 'cheque',
        payment_date: cheque.payment_date,
        cheque_number: cheque.cheque_number,
        cheque_image_url: cheque.cheque_image_url || null,
        notes: cheque.notes || null,
        branch_id: branchId,
        created_by_admin_id: user?.id || null,
      }));
      
      const { error } = await supabase
        .from('client_payments')
        .insert(paymentsToInsert);
      
      if (error) throw error;
      
      toast.success(`تم إضافة ${chequeLines.length} شيك للعميل ${selectedClient.full_name}`);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving cheques:', err);
      toast.error('فشل في حفظ الشيكات');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => `₪${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              إضافة شيكات لعميل
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Client Selection */}
            <div className="space-y-2">
              <Label>العميل *</Label>
              <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientSearchOpen}
                    className="w-full justify-between"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : selectedClient ? (
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {selectedClient.full_name}
                        {selectedClient.phone_number && (
                          <span className="text-muted-foreground text-xs">({selectedClient.phone_number})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">اختر العميل...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="ابحث بالاسم أو رقم الهاتف..." 
                      value={clientSearch}
                      onValueChange={setClientSearch}
                    />
                    <CommandList>
                      <CommandEmpty>لا يوجد عملاء</CommandEmpty>
                      <CommandGroup>
                        {filteredClients.map((client) => (
                          <CommandItem
                            key={client.id}
                            value={client.id}
                            onSelect={() => {
                              setSelectedClient(client);
                              setClientSearchOpen(false);
                              setClientSearch('');
                            }}
                          >
                            <Check
                              className={cn(
                                "ml-2 h-4 w-4",
                                selectedClient?.id === client.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{client.full_name}</span>
                              {client.phone_number && (
                                <span className="text-xs text-muted-foreground">{client.phone_number}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Cheque Lines Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>الشيكات</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setChequeScannerOpen(true)}
                    className="gap-1"
                  >
                    <Scan className="h-4 w-4" />
                    مسح شيكات
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addChequeLine}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة يدوي
                  </Button>
                </div>
              </div>

              {chequeLines.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">
                    لا توجد شيكات. استخدم "مسح شيكات" أو "إضافة يدوي" لإضافة شيكات.
                  </p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {chequeLines.map((cheque, index) => (
                    <Card key={cheque.id} className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {/* Amount */}
                          <div className="space-y-1">
                            <Label className="text-xs">المبلغ *</Label>
                            <Input
                              type="number"
                              value={cheque.amount || ''}
                              onChange={(e) => updateChequeLine(cheque.id, { amount: parseFloat(e.target.value) || 0 })}
                              placeholder="0"
                              className="h-9"
                            />
                          </div>
                          
                          {/* Cheque Number */}
                          <div className="space-y-1">
                            <Label className="text-xs">رقم الشيك *</Label>
                            <Input
                              value={cheque.cheque_number}
                              onChange={(e) => updateChequeLine(cheque.id, { 
                                cheque_number: sanitizeChequeNumber(e.target.value) 
                              })}
                              placeholder="رقم الشيك"
                              maxLength={CHEQUE_NUMBER_MAX_LENGTH}
                              className="h-9 font-mono"
                            />
                          </div>
                          
                          {/* Date */}
                          <div className="space-y-1">
                            <Label className="text-xs">تاريخ الشيك *</Label>
                            <ArabicDatePicker
                              value={cheque.payment_date}
                              onChange={(date) => updateChequeLine(cheque.id, { 
                                payment_date: date 
                              })}
                              compact
                            />
                          </div>
                        </div>

                        {/* Cheque image preview */}
                        {cheque.cheque_image_url && (
                          <div className="w-16 h-12 rounded border overflow-hidden shrink-0">
                            <img 
                              src={cheque.cheque_image_url} 
                              alt="صورة الشيك"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {/* Delete button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeChequeLine(cheque.id)}
                          className="shrink-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Total Summary */}
            {chequeLines.length > 0 && (
              <Card className="p-4 bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="font-medium">إجمالي الشيكات:</span>
                  <span className="text-xl font-bold ltr-nums">{formatCurrency(totalAmount)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  سيتم خصم هذا المبلغ من محفظة العميل
                </p>
              </Card>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!isValid || saving}
              className="gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  حفظ الشيكات ({chequeLines.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cheque Scanner Dialog */}
      <ChequeScannerDialog
        open={chequeScannerOpen}
        onOpenChange={setChequeScannerOpen}
        onConfirm={handleScannerConfirm}
        title="مسح شيكات العميل"
      />
    </>
  );
}
