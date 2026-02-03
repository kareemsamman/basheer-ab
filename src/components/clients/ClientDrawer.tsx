import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { digitsOnly, isValidIsraeliId } from '@/lib/validation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Save, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';
import { cn } from '@/lib/utils';
import { ClientChildrenManager } from './ClientChildrenManager';
import type { ClientChild, NewChildForm } from '@/types/clientChildren';
import { createEmptyChildForm } from '@/types/clientChildren';

const UNDER24_OPTIONS = [
  { value: 'none', label: 'لا' },
  { value: 'client', label: 'نعم – العميل أقل من 24' },
] as const;

const clientSchema = z.object({
  full_name: z.string().trim().min(2, 'الاسم مطلوب').max(120, 'الاسم طويل جداً'),
  id_number: z
    .string()
    .transform((v) => v.trim())
    .transform((v) => digitsOnly(v))
    .refine((v) => v.length === 9, 'رقم الهوية يجب أن يكون 9 أرقام')
    .refine((v) => isValidIsraeliId(v), 'رقم الهوية غير صحيح'),
  file_number: z.string().optional(),
  phone_number: z
    .string()
    .optional()
    .transform((v) => digitsOnly((v ?? '').trim()))
    .refine((v) => v.length === 0 || v.length === 10, 'رقم الهاتف يجب أن يكون 10 أرقام'),
  phone_number_2: z
    .string()
    .optional()
    .transform((v) => digitsOnly((v ?? '').trim()))
    .refine((v) => v.length === 0 || v.length === 10, 'رقم الهاتف يجب أن يكون 10 أرقام'),
  birth_date: z.string().optional(),
  notes: z.string().optional(),
  under24_type: z.enum(['none', 'client', 'additional_driver']).default('none'),
  under24_driver_name: z.string().optional(),
  under24_driver_id: z
    .string()
    .optional()
    .transform((v) => digitsOnly((v ?? '').trim())),
  broker_id: z.string().optional(),
  branch_id: z.string().optional(),
}).superRefine((data, ctx) => {
  // If additional_driver is selected, require driver name and ID
  if (data.under24_type === 'additional_driver') {
    if (!data.under24_driver_name || data.under24_driver_name.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'اسم السائق مطلوب',
        path: ['under24_driver_name'],
      });
    }
    const driverId = data.under24_driver_id || '';
    if (driverId.length !== 9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'رقم هوية السائق يجب أن يكون 9 أرقام',
        path: ['under24_driver_id'],
      });
    } else if (!isValidIsraeliId(driverId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'رقم هوية السائق غير صحيح',
        path: ['under24_driver_id'],
      });
    }
  }
});

type ClientFormData = z.infer<typeof clientSchema>;

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  file_number: string | null;
  phone_number: string | null;
  phone_number_2: string | null;
  birth_date: string | null;
  date_joined: string | null;
  less_than_24: boolean | null;
  under24_type: 'none' | 'client' | 'additional_driver' | null;
  under24_driver_name: string | null;
  under24_driver_id: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  broker_id?: string | null;
  branch_id?: string | null;
}

interface Broker {
  id: string;
  name: string;
}

interface ClientDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onSaved: () => void;
  defaultBrokerId?: string;
}

export function ClientDrawer({ open, onOpenChange, client, onSaved, defaultBrokerId }: ClientDrawerProps) {
  const [saving, setSaving] = useState(false);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const { isAdmin, branchId: userBranchId } = useAuth();
  const { branches } = useBranches();
  const isEditing = !!client;
  
  // Children state
  const [existingChildren, setExistingChildren] = useState<ClientChild[]>([]);
  const [newChildren, setNewChildren] = useState<NewChildForm[]>([]);
  const [childrenToDelete, setChildrenToDelete] = useState<string[]>([]);
  const [linkedChildIds, setLinkedChildIds] = useState<string[]>([]);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      full_name: '',
      id_number: '',
      file_number: '',
      phone_number: '',
      phone_number_2: '',
      birth_date: null,
      notes: '',
      under24_type: 'none',
      under24_driver_name: '',
      under24_driver_id: '',
      broker_id: '',
      branch_id: '',
    },
  });

  // Watch under24_type to conditionally show driver fields
  const under24Type = useWatch({ control: form.control, name: 'under24_type' });

  // Fetch brokers
  useEffect(() => {
    const fetchBrokers = async () => {
      const { data } = await supabase
        .from('brokers')
        .select('id, name')
        .order('name');
      setBrokers(data || []);
    };
    fetchBrokers();
  }, []);

  // Fetch children when editing a client
  useEffect(() => {
    if (!open || !client?.id) {
      setExistingChildren([]);
      setNewChildren([]);
      setChildrenToDelete([]);
      setLinkedChildIds([]);
      return;
    }

    const fetchChildren = async () => {
      // Fetch existing children
      const { data: childrenData, error } = await supabase
        .from('client_children')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: true });

      if (!error && childrenData) {
        setExistingChildren(childrenData as ClientChild[]);
      }

      // Fetch linked children (those linked to policies)
      const { data: linkedData } = await supabase
        .from('policy_children')
        .select('child_id')
        .in('child_id', (childrenData || []).map(c => c.id));

      if (linkedData) {
        setLinkedChildIds(linkedData.map(l => l.child_id));
      }
    };

    fetchChildren();
  }, [open, client?.id]);

  // Reset form when client changes or drawer opens
  useEffect(() => {
    if (open) {
      // For new clients, use the worker's branch; for editing, use the client's branch
      const defaultBranch = isEditing 
        ? (client?.branch_id || '') 
        : (userBranchId || (branches.length > 0 ? branches[0].id : ''));
      
      form.reset({
        full_name: client?.full_name || '',
        id_number: client?.id_number || '',
        file_number: client?.file_number || '',
        phone_number: client?.phone_number || '',
        phone_number_2: client?.phone_number_2 || '',
        birth_date: client?.birth_date || '',
        notes: client?.notes || '',
        under24_type: client?.under24_type || (client?.less_than_24 ? 'client' : 'none'),
        under24_driver_name: client?.under24_driver_name || '',
        under24_driver_id: client?.under24_driver_id || '',
        broker_id: client?.broker_id || defaultBrokerId || '',
        branch_id: defaultBranch,
      });
    }
  }, [open, client, defaultBrokerId, form, isEditing, userBranchId, branches]);

  const onSubmit = async (data: ClientFormData) => {
    setSaving(true);
    try {
      const oldBranchId = client?.branch_id;
      const newBranchId = data.branch_id || null;
      const branchChanged = isEditing && oldBranchId !== newBranchId && newBranchId;

      let createdByAdminId: string | null = null;
      if (!isEditing) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          throw authError || new Error('Not authenticated');
        }
        createdByAdminId = authData.user.id;
      }

      const clientData = {
        full_name: data.full_name,
        id_number: data.id_number,
        file_number: data.file_number || null,
        phone_number: data.phone_number || null,
        phone_number_2: data.phone_number_2 || null,
        birth_date: data.birth_date || null,
        notes: data.notes || null,
        under24_type: data.under24_type,
        under24_driver_name: data.under24_type === 'additional_driver' ? (data.under24_driver_name || null) : null,
        under24_driver_id: data.under24_type === 'additional_driver' ? (data.under24_driver_id || null) : null,
        less_than_24: data.under24_type !== 'none', // Keep legacy field in sync
        broker_id: data.broker_id || null,
        branch_id: newBranchId,
        ...(!isEditing ? { created_by_admin_id: createdByAdminId } : {}),
      };

      let savedClientId = client?.id;
      
      if (isEditing) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', client.id);

        if (error) throw error;

        // If branch changed, update all client's policies, cars, and related data
        if (branchChanged) {
          // Update policies
          await supabase
            .from('policies')
            .update({ branch_id: newBranchId })
            .eq('client_id', client.id)
            .is('deleted_at', null);

          // Update cars
          await supabase
            .from('cars')
            .update({ branch_id: newBranchId })
            .eq('client_id', client.id)
            .is('deleted_at', null);
        }
      } else {
        const { data: newClientData, error } = await supabase
          .from('clients')
          .insert(clientData)
          .select('id')
          .single();

        if (error) {
          if (error.code === '23505') {
            toast.error('رقم الهوية موجود مسبقاً');
            return;
          }
          throw error;
        }
        savedClientId = newClientData.id;
      }

      // Save children
      if (savedClientId) {
        // Delete removed children (that are not linked to policies)
        for (const childId of childrenToDelete) {
          if (!linkedChildIds.includes(childId)) {
            await supabase
              .from('client_children')
              .delete()
              .eq('id', childId);
          }
        }

        // Insert new children
        for (const child of newChildren) {
          if (child.full_name.trim() && child.id_number.trim()) {
            await supabase
              .from('client_children')
              .insert({
                client_id: savedClientId,
                full_name: child.full_name.trim(),
                id_number: child.id_number.trim(),
                birth_date: child.birth_date || null,
                phone: child.phone || null,
                relation: child.relation || null,
                notes: child.notes || null,
              });
          }
        }
      }

      if (isEditing) {
        if (branchChanged) {
          toast.success('تم تحديث بيانات العميل ونقل جميع وثائقه للفرع الجديد');
        } else {
          toast.success('تم تحديث بيانات العميل');
        }
      } else {
        toast.success('تمت إضافة العميل بنجاح');
      }

      form.reset();
      onSaved();
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('فشل حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-xl lg:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم الكامل *</FormLabel>
                  <FormControl>
                    <Input placeholder="أدخل اسم العميل" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الهوية *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="أدخل رقم الهوية"
                      inputMode="numeric"
                      maxLength={9}
                      className="ltr-input"
                      value={field.value}
                      onChange={(e) => field.onChange(digitsOnly(e.target.value).slice(0, 9))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="file_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الملف</FormLabel>
                  <FormControl>
                    <Input placeholder="أدخل رقم الملف" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الهاتف</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="أدخل رقم الهاتف"
                      inputMode="numeric"
                      maxLength={10}
                      className="ltr-input"
                      value={field.value}
                      onChange={(e) => field.onChange(digitsOnly(e.target.value).slice(0, 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="broker_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الوسيط</FormLabel>
                  <Select
                    value={(field.value && field.value.length > 0) ? field.value : "__none__"}
                    onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                    disabled={!!defaultBrokerId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الوسيط (اختياري)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">بدون وسيط</SelectItem>
                      {brokers.map((broker) => (
                        <SelectItem key={broker.id} value={broker.id}>
                          {broker.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Branch field - Admin only */}
            {isAdmin && branches.length > 0 && (
              <FormField
                control={form.control}
                name="branch_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      الفرع
                    </FormLabel>
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الفرع" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name_ar || branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isEditing && (
                      <p className="text-xs text-muted-foreground">
                        تغيير الفرع سينقل جميع وثائق وسيارات العميل للفرع الجديد
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Birth Date */}
            <FormField
              control={form.control}
              name="birth_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ الميلاد</FormLabel>
                  <FormControl>
                    <ArabicDatePicker
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="اختر تاريخ الميلاد"
                      isBirthDate
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Additional Phone */}
            <FormField
              control={form.control}
              name="phone_number_2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>هاتف إضافي (اختياري)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="أدخل رقم الهاتف الإضافي"
                      inputMode="numeric"
                      maxLength={10}
                      className="ltr-input"
                      value={field.value}
                      onChange={(e) => field.onChange(digitsOnly(e.target.value).slice(0, 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Under 24 Type */}
            <FormField
              control={form.control}
              name="under24_type"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>أقل من 24 سنة</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-2"
                    >
                      {UNDER24_OPTIONS.map((option) => (
                        <div key={option.value} className="flex items-center gap-2">
                          <RadioGroupItem value={option.value} id={option.value} />
                          <label
                            htmlFor={option.value}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {option.label}
                          </label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Children / Additional Drivers Manager - Always shown when editing */}
            {isEditing && (
              <div className="border-t pt-4">
                <ClientChildrenManager
                  existingChildren={existingChildren}
                  newChildren={newChildren}
                  onNewChildrenChange={setNewChildren}
                  onRemoveExisting={(childId) => {
                    if (!linkedChildIds.includes(childId)) {
                      setChildrenToDelete([...childrenToDelete, childId]);
                      setExistingChildren(existingChildren.filter(c => c.id !== childId));
                    }
                  }}
                  linkedChildIds={linkedChildIds}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ملاحظات</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="أضف ملاحظات عن العميل..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 ml-2" />
                )}
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                إلغاء
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}