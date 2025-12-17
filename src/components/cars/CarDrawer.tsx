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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Save, Search, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const carSchema = z.object({
  car_number: z.string().min(1, 'رقم السيارة مطلوب'),
  client_id: z.string().min(1, 'العميل مطلوب'),
  manufacturer_name: z.string().optional(),
  model: z.string().optional(),
  model_number: z.string().optional(),
  year: z.coerce.number().optional(),
  color: z.string().optional(),
  license_type: z.string().optional(),
  license_expiry: z.string().optional(),
  last_license: z.string().optional(),
  car_value: z.coerce.number().optional(),
  car_type: z.string().optional(),
});

type CarFormData = z.infer<typeof carSchema>;

interface Client {
  id: string;
  full_name: string;
}

interface CarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  onSaved: () => void;
}

const CAR_TYPES = [
  { value: 'car', label: 'خصوصي' },
  { value: 'cargo', label: 'تجاري' },
  { value: 'taxi', label: 'مونيت' },
  { value: 'small', label: 'دراجة نارية' },
  { value: 'tjeradown4', label: 'تجارة أقل من 4 طن' },
  { value: 'tjeraup4', label: 'تجارة أكثر من 4 طن' },
];

export function CarDrawer({ open, onOpenChange, clientId, onSaved }: CarDrawerProps) {
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchedFromGov, setFetchedFromGov] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const form = useForm<CarFormData>({
    resolver: zodResolver(carSchema),
    defaultValues: {
      car_number: '',
      client_id: clientId || '',
      manufacturer_name: '',
      model: '',
      model_number: '',
      year: undefined,
      color: '',
      license_type: '',
      license_expiry: '',
      last_license: '',
      car_value: undefined,
      car_type: 'car',
    },
  });

  // Fetch clients if no clientId provided
  useEffect(() => {
    if (open && !clientId) {
      setLoadingClients(true);
      supabase
        .from('clients')
        .select('id, full_name')
        .order('full_name')
        .limit(100)
        .then(({ data, error }) => {
          if (!error && data) {
            setClients(data);
          }
          setLoadingClients(false);
        });
    }
  }, [open, clientId]);

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      form.reset({
        car_number: '',
        client_id: clientId || '',
        manufacturer_name: '',
        model: '',
        model_number: '',
        year: undefined,
        color: '',
        license_type: '',
        license_expiry: '',
        last_license: '',
        car_value: undefined,
        car_type: 'car',
      });
      setFetchedFromGov(false);
    }
  }, [open, clientId]);

  const fetchVehicleData = async () => {
    const carNumber = form.getValues('car_number');
    if (!carNumber) {
      toast.error('الرجاء إدخال رقم السيارة');
      return;
    }

    setFetching(true);
    setFetchedFromGov(false);

    try {
      const response = await supabase.functions.invoke('fetch-vehicle', {
        body: { car_number: carNumber },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data.found) {
        toast.error(response.data.error || 'لم يتم العثور على مركبة بهذا الرقم');
        return;
      }

      const vehicleData = response.data.data;
      
      // Auto-fill form with fetched data
      form.setValue('manufacturer_name', vehicleData.manufacturer_name || '');
      form.setValue('model', vehicleData.model || '');
      form.setValue('model_number', vehicleData.model_number || '');
      form.setValue('year', vehicleData.year || undefined);
      form.setValue('color', vehicleData.color || '');
      form.setValue('license_type', vehicleData.license_type || '');
      form.setValue('license_expiry', vehicleData.license_expiry || '');
      form.setValue('last_license', vehicleData.last_license || '');
      form.setValue('car_type', vehicleData.car_type || 'car');
      
      setFetchedFromGov(true);
      toast.success('تم جلب بيانات السيارة بنجاح');

    } catch (error: any) {
      console.error('Fetch vehicle error:', error);
      toast.error(error.message || 'فشل جلب بيانات السيارة');
    } finally {
      setFetching(false);
    }
  };

  const onSubmit = async (data: CarFormData) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('cars')
        .insert({
          car_number: data.car_number.replace(/[-\s]/g, '').trim(),
          client_id: data.client_id,
          manufacturer_name: data.manufacturer_name || null,
          model: data.model || null,
          model_number: data.model_number || null,
          year: data.year || null,
          color: data.color || null,
          license_type: data.license_type || null,
          license_expiry: data.license_expiry || null,
          last_license: data.last_license || null,
          car_value: data.car_value || null,
          car_type: (data.car_type as any) || 'car',
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('رقم السيارة موجود مسبقاً في النظام');
          return;
        }
        throw error;
      }

      toast.success('تمت إضافة السيارة بنجاح');
      form.reset();
      onSaved();
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('فشل حفظ السيارة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>إضافة سيارة جديدة</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">
            {/* Car Number with Fetch Button */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="car_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم السيارة *</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          placeholder="أدخل رقم السيارة" 
                          {...field} 
                          className="flex-1"
                        />
                      </FormControl>
                      <Button 
                        type="button" 
                        variant="secondary"
                        onClick={fetchVehicleData}
                        disabled={fetching}
                      >
                        {fetching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        <span className="mr-2">جلب البيانات</span>
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {fetchedFromGov && (
                <Badge className="bg-green-500 gap-1">
                  <CheckCircle className="h-3 w-3" />
                  تم جلب البيانات تلقائياً
                </Badge>
              )}
            </div>

            {/* Client Selection (if not from client page) */}
            {!clientId && (
              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>العميل *</FormLabel>
                    {loadingClients ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر العميل" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Auto-filled fields (editable) */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="manufacturer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الشركة المصنعة</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: تويوتا" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الموديل</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: كامري" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>سنة الصنع</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="2024" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اللون</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: أبيض" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="car_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نوع المركبة</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CAR_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="car_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>قيمة السيارة (₪)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="قيمة السيارة بالشيكل" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="license_expiry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>انتهاء الرخصة</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_license"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>آخر فحص</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

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
