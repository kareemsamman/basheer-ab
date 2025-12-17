import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const clientSchema = z.object({
  full_name: z.string().min(2, 'الاسم مطلوب'),
  id_number: z.string().min(5, 'رقم الهوية مطلوب'),
  file_number: z.string().optional(),
  phone_number: z.string().optional(),
  notes: z.string().optional(),
  less_than_24: z.boolean().default(false),
  image_url: z.string().optional(),
  broker_id: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  file_number: string | null;
  phone_number: string | null;
  date_joined: string | null;
  less_than_24: boolean | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  broker_id?: string | null;
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
  const isEditing = !!client;

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      full_name: '',
      id_number: '',
      file_number: '',
      phone_number: '',
      notes: '',
      less_than_24: false,
      image_url: '',
      broker_id: '',
    },
  });

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

  // Reset form when client changes or drawer opens
  useEffect(() => {
    if (open) {
      form.reset({
        full_name: client?.full_name || '',
        id_number: client?.id_number || '',
        file_number: client?.file_number || '',
        phone_number: client?.phone_number || '',
        notes: client?.notes || '',
        less_than_24: client?.less_than_24 || false,
        image_url: client?.image_url || '',
        broker_id: client?.broker_id || defaultBrokerId || '',
      });
    }
  }, [open, client, defaultBrokerId, form]);

  const onSubmit = async (data: ClientFormData) => {
    setSaving(true);
    try {
      const clientData = {
        full_name: data.full_name,
        id_number: data.id_number,
        file_number: data.file_number || null,
        phone_number: data.phone_number || null,
        notes: data.notes || null,
        less_than_24: data.less_than_24,
        image_url: data.image_url || null,
        broker_id: data.broker_id || null,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', client.id);

        if (error) throw error;
        toast.success('تم تحديث بيانات العميل');
      } else {
        const { error } = await supabase
          .from('clients')
          .insert(clientData);

        if (error) {
          if (error.code === '23505') {
            toast.error('رقم الهوية موجود مسبقاً');
            return;
          }
          throw error;
        }
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
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
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
                    <Input placeholder="أدخل رقم الهوية" {...field} />
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
                    <Input placeholder="أدخل رقم الهاتف" {...field} />
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

            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رابط الصورة</FormLabel>
                  <FormControl>
                    <Input placeholder="رابط صورة العميل من CDN" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="less_than_24"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-x-reverse space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>أقل من 24 سنة</FormLabel>
                  </div>
                </FormItem>
              )}
            />

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