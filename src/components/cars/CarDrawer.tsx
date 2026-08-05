import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Save, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';
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

interface CarRecord {
  id: string;
  car_number: string;
  client_id: string;
  manufacturer_name: string | null;
  model: string | null;
  model_number: string | null;
  year: number | null;
  color: string | null;
  license_type: string | null;
  license_expiry: string | null;
  last_license: string | null;
  car_value: number | null;
  car_type: string | null;
  clients?: {
    full_name: string;
  };
}

interface CarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  car?: CarRecord | null;
  onSaved: () => void;
}

const normalizeCarNumber = (value: string) => (value || '').replace(/[-\s]/g, '').trim();

interface CarNumberMatch {
  id: string;
  clientId: string;
  ownerName: string | null;
}

/**
 * Finds active cars already using this number, ignoring `excludeId` (the car being edited).
 * Returns `'error'` when the lookup itself failed, so callers can tell "no duplicate" from "unknown".
 *
 * Note: the DB no longer enforces uniqueness on car_number (dropped so the same plate can exist
 * for more than one client), so this check is the only guard — a same-client duplicate is blocked,
 * a different-client duplicate is only warned about.
 */
async function lookupCarNumber(
  carNumber: string,
  excludeId?: string
): Promise<CarNumberMatch[] | 'error'> {
  let query = supabase
    .from('cars')
    .select('id, client_id, clients(full_name)')
    .eq('car_number', carNumber)
    .is('deleted_at', null)
    .limit(10);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Car number lookup error:', error);
    return 'error';
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    clientId: row.client_id,
    ownerName: row.clients?.full_name ?? null,
  }));
}

type CarNumberCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  /** Same client already has this number — a real duplicate, blocked. */
  | { status: 'duplicate' }
  /** Another client has this number — allowed, but confirmed first. */
  | { status: 'other-client'; ownerNames: string[] };

const CAR_TYPES = [
  { value: 'car', label: 'خصوصي' },
  { value: 'cargo', label: 'تجاري' },
  { value: 'taxi', label: 'مونيت' },
  { value: 'small', label: 'اوتوبس زعير' },
  { value: 'tjeradown4', label: 'تجارة أقل من 4 طن' },
  { value: 'tjeraup4', label: 'تجارة أكثر من 4 طن' },
];

export function CarDrawer({ open, onOpenChange, clientId, car, onSaved }: CarDrawerProps) {
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchedFromGov, setFetchedFromGov] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [numberCheck, setNumberCheck] = useState<CarNumberCheck>({ status: 'idle' });
  const [pendingConfirm, setPendingConfirm] = useState<{
    data: CarFormData;
    isRename: boolean;
    policyCount: number;
    otherOwners: string[];
  } | null>(null);

  const isEditMode = !!car;
  const originalCarNumber = normalizeCarNumber(car?.car_number || '');

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
        .is('deleted_at', null)
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

  // Reset/populate form when drawer opens
  useEffect(() => {
    if (open) {
      if (car) {
        // Edit mode - populate with existing car data
        form.reset({
          car_number: car.car_number || '',
          client_id: car.client_id || '',
          manufacturer_name: car.manufacturer_name || '',
          model: car.model || '',
          model_number: car.model_number || '',
          year: car.year || undefined,
          color: car.color || '',
          license_type: car.license_type || '',
          license_expiry: car.license_expiry || '',
          last_license: car.last_license || '',
          car_value: car.car_value || undefined,
          car_type: car.car_type || 'car',
        });
      } else {
        // Add mode - reset to empty
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
      }
      setFetchedFromGov(false);
      setNumberCheck({ status: 'idle' });
      setPendingConfirm(null);
    }
  }, [open, clientId, car]);

  const watchedCarNumber = form.watch('car_number');
  const watchedClientId = form.watch('client_id');
  const isRenamingNumber =
    isEditMode &&
    !!normalizeCarNumber(watchedCarNumber) &&
    normalizeCarNumber(watchedCarNumber) !== originalCarNumber;

  const classifyMatches = (matches: CarNumberMatch[], ownerClientId: string): CarNumberCheck => {
    if (matches.length === 0) return { status: 'available' };
    if (matches.some((m) => m.clientId === ownerClientId)) return { status: 'duplicate' };
    return {
      status: 'other-client',
      ownerNames: Array.from(new Set(matches.map((m) => m.ownerName).filter(Boolean) as string[])),
    };
  };

  // Live duplicate check on the car number (debounced)
  useEffect(() => {
    if (!open) return;

    const normalized = normalizeCarNumber(watchedCarNumber);

    // Nothing to check: empty, too short, or unchanged in edit mode
    if (!normalized || normalized.length < 5 || normalized === originalCarNumber) {
      setNumberCheck({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setNumberCheck({ status: 'checking' });

    const timer = setTimeout(async () => {
      const matches = await lookupCarNumber(normalized, car?.id);
      if (cancelled) return;

      if (matches === 'error') {
        setNumberCheck({ status: 'idle' });
        return;
      }
      setNumberCheck(classifyMatches(matches, watchedClientId));
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, watchedCarNumber, watchedClientId, originalCarNumber, car?.id]);

  const fetchVehicleData = async () => {
    const carNumber = form.getValues('car_number');
    if (!carNumber || carNumber.length < 7) {
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
        return;
      }

      const vehicleData = response.data.data;
      
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
      // Silent fail - user can manually enter data
      console.error('Fetch vehicle error:', error);
    } finally {
      setFetching(false);
    }
  };

  const handleCarNumberBlur = () => {
    const carNumber = form.getValues('car_number');
    if (carNumber && carNumber.length >= 7 && !fetchedFromGov && !fetching && !isEditMode) {
      fetchVehicleData();
    }
  };

  // Fetch on Enter key press
  const handleCarNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const carNumber = form.getValues('car_number');
      if (carNumber && carNumber.length >= 7 && !fetching && !isEditMode) {
        fetchVehicleData();
      }
    }
  };

  const onSubmit = async (data: CarFormData) => {
    const normalized = normalizeCarNumber(data.car_number);

    if (!normalized) {
      form.setError('car_number', { message: 'رقم السيارة مطلوب' });
      return;
    }

    const isRename = isEditMode && normalized !== originalCarNumber;
    let otherOwners: string[] = [];

    // Authoritative duplicate check right before writing (the debounced one can be stale)
    if (!isEditMode || isRename) {
      setSaving(true);
      const matches = await lookupCarNumber(normalized, car?.id);
      setSaving(false);

      if (matches === 'error') {
        toast.error('تعذر التحقق من رقم السيارة، حاول مرة أخرى');
        return;
      }

      const check = classifyMatches(matches, data.client_id);
      setNumberCheck(check);

      if (check.status === 'duplicate') {
        form.setError('car_number', { message: 'رقم السيارة مسجل مسبقاً لدى هذا العميل' });
        return;
      }
      if (check.status === 'other-client') {
        otherOwners = check.ownerNames;
      }
    }

    // Renaming affects every policy linked to this car, and reusing another client's
    // number is allowed but unusual — both deserve an explicit confirmation.
    if (isRename || otherOwners.length > 0) {
      let policyCount = 0;
      if (isRename) {
        const { count } = await supabase
          .from('policies')
          .select('id', { count: 'exact', head: true })
          .eq('car_id', car!.id)
          .is('deleted_at', null);
        policyCount = count || 0;
      }

      setPendingConfirm({ data, isRename, policyCount, otherOwners });
      return;
    }

    await saveCar(data);
  };

  const saveCar = async (data: CarFormData) => {
    setSaving(true);
    try {
      const carData = {
        car_number: normalizeCarNumber(data.car_number),
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
      };

      if (isEditMode && car) {
        // Update existing car
        const { error } = await supabase
          .from('cars')
          .update(carData)
          .eq('id', car.id);

        if (error) {
          if (error.code === '23505') {
            toast.error('رقم السيارة موجود مسبقاً في النظام');
            form.setError('car_number', { message: 'رقم السيارة موجود مسبقاً في النظام' });
            setNumberCheck({ status: 'duplicate' });
            return;
          }
          throw error;
        }
        toast.success('تم تحديث السيارة بنجاح');
      } else {
        // Insert new car
        const { error } = await supabase
          .from('cars')
          .insert(carData);

        if (error) {
          if (error.code === '23505') {
            toast.error('رقم السيارة موجود مسبقاً في النظام');
            form.setError('car_number', { message: 'رقم السيارة موجود مسبقاً في النظام' });
            setNumberCheck({ status: 'duplicate' });
            return;
          }
          throw error;
        }
        toast.success('تمت إضافة السيارة بنجاح');
      }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-right">
            {isEditMode ? 'تعديل السيارة' : 'إضافة سيارة جديدة'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Car Number - Auto-fetch on blur */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="car_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">رقم السيارة *</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          placeholder="أدخل رقم السيارة (7-8 أرقام)"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e.target.value.replace(/[^\d-]/g, ''));
                            form.clearErrors('car_number');
                          }}
                          onBlur={(e) => {
                            field.onBlur();
                            handleCarNumberBlur();
                          }}
                          onKeyDown={handleCarNumberKeyDown}
                          className="text-right"
                          maxLength={8}
                          inputMode="numeric"
                        />
                      </FormControl>
                      {(fetching || numberCheck.status === 'checking') && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!fetching && numberCheck.status === 'available' && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                      )}
                      {!fetching && numberCheck.status === 'duplicate' && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <XCircle className="h-4 w-4 text-destructive" />
                        </div>
                      )}
                      {!fetching && numberCheck.status === 'other-client' && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        </div>
                      )}
                    </div>
                    <FormMessage className="text-right" />
                    {numberCheck.status === 'duplicate' && !form.formState.errors.car_number && (
                      <p className="text-right text-sm font-medium text-destructive">
                        رقم السيارة مسجل مسبقاً لدى هذا العميل
                      </p>
                    )}
                    {numberCheck.status === 'other-client' && (
                      <p className="text-right text-sm text-amber-600 flex items-center justify-end gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {numberCheck.ownerNames.length > 0
                          ? `هذا الرقم مسجل أيضاً لدى: ${numberCheck.ownerNames.join('، ')}`
                          : 'هذا الرقم مسجل أيضاً لدى عميل آخر'}
                      </p>
                    )}
                    {isRenamingNumber && numberCheck.status !== 'duplicate' && (
                      <p className="text-right text-sm text-muted-foreground flex items-center justify-end gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        سيتم تغيير الرقم من {originalCarNumber} — وسيظهر الرقم الجديد في كل الوثائق المرتبطة
                      </p>
                    )}
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

            {/* Client Selection */}
            {!clientId && (
              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">العميل *</FormLabel>
                    {loadingClients ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value} disabled={isEditMode}>
                        <FormControl>
                          <SelectTrigger className="text-right">
                            <SelectValue placeholder="اختر العميل" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent align="end">
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id} className="text-right">
                              {client.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage className="text-right" />
                  </FormItem>
                )}
              />
            )}

            {/* Auto-filled fields (editable) - 2 columns */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="manufacturer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">الشركة المصنعة</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: تويوتا" {...field} className="text-right" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">الموديل</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: كامري" {...field} className="text-right" />
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
                    <FormLabel className="text-right block">سنة الصنع</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="2024" {...field} className="text-right ltr-input" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">اللون</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: أبيض" {...field} className="text-right" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="car_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">نوع المركبة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر النوع" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent align="end">
                        {CAR_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-right">
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
                    <FormLabel className="text-right block">قيمة السيارة (₪)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="قيمة السيارة" {...field} className="ltr-input" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="license_expiry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">انتهاء الرخصة</FormLabel>
                    <FormControl>
                      <ArabicDatePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_license"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-right block">آخر فحص</FormLabel>
                    <FormControl>
                      <ArabicDatePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-3 pt-4 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={saving || numberCheck.status === 'checking' || numberCheck.status === 'duplicate'}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 ml-2" />
                )}
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      <AlertDialog
        open={!!pendingConfirm}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {pendingConfirm?.isRename ? 'تأكيد تغيير رقم السيارة' : 'تأكيد رقم السيارة'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              {pendingConfirm?.isRename && (
                <span className="block">
                  سيتم تغيير رقم السيارة من{' '}
                  <span className="font-bold ltr-nums">{originalCarNumber}</span> إلى{' '}
                  <span className="font-bold ltr-nums">
                    {normalizeCarNumber(pendingConfirm.data.car_number)}
                  </span>
                  .
                </span>
              )}
              {!!pendingConfirm?.policyCount && (
                <span className="block">
                  هذه السيارة مرتبطة بـ{' '}
                  <span className="font-bold">{pendingConfirm.policyCount}</span> وثيقة، وسيظهر فيها
                  الرقم الجديد.
                </span>
              )}
              {!!pendingConfirm?.otherOwners.length && (
                <span className="block text-amber-600">
                  تنبيه: هذا الرقم مسجل أيضاً لدى{' '}
                  <span className="font-bold">{pendingConfirm.otherOwners.join('، ')}</span>. النظام
                  يسمح بذلك، تأكد أنه ليس خطأ.
                </span>
              )}
              {pendingConfirm?.isRename && (
                <span className="block text-muted-foreground">
                  ملاحظة: السجلات التي حُفظ فيها الرقم كنص (مثل الإيصالات وعمليات نقل الوثائق) ستبقى
                  بالرقم القديم.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                const data = pendingConfirm?.data;
                if (!data) return;
                setPendingConfirm(null);
                saveCar(data);
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}