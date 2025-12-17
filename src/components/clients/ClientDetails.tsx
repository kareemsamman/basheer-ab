import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowRight,
  Edit,
  User,
  Phone,
  Car,
  FileText,
  Plus,
  Calendar,
  Hash,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CarDrawer } from '@/components/cars/CarDrawer';

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
}

interface CarRecord {
  id: string;
  car_number: string;
  manufacturer_name: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  car_type: string | null;
}

interface PolicyRecord {
  id: string;
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  insurance_price: number;
  cancelled: boolean | null;
  company: { name: string; name_ar: string | null } | null;
  car: { car_number: string } | null;
}

interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: 'إلزامي',
  THIRD_FULL: 'ثالث/شامل',
  ROAD_SERVICE: 'خدمات الطريق',
  ACCIDENT_FEE_EXEMPTION: 'إعفاء رسوم حادث',
};

export function ClientDetails({ client, onBack, onEdit, onRefresh }: ClientDetailsProps) {
  const [cars, setCars] = useState<CarRecord[]>([]);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [carDrawerOpen, setCarDrawerOpen] = useState(false);

  const fetchCars = async () => {
    setLoadingCars(true);
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('id, car_number, manufacturer_name, model, year, color, car_type')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCars(data || []);
    } catch (error) {
      console.error('Error fetching cars:', error);
    } finally {
      setLoadingCars(false);
    }
  };

  const fetchPolicies = async () => {
    setLoadingPolicies(true);
    try {
      const { data, error } = await supabase
        .from('policies')
        .select(`
          id, policy_type_parent, policy_type_child, start_date, end_date, 
          insurance_price, cancelled,
          company:insurance_companies(name, name_ar),
          car:cars(car_number)
        `)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPolicies(data || []);
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoadingPolicies(false);
    }
  };

  useEffect(() => {
    fetchCars();
    fetchPolicies();
  }, [client.id]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB');
  };

  const handleCarSaved = () => {
    setCarDrawerOpen(false);
    fetchCars();
    onRefresh();
  };

  return (
    <MainLayout>
      <Helmet>
        <title>{client.full_name} | AB Insurance CRM</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {client.image_url ? (
                <img
                  src={client.image_url}
                  alt={client.full_name}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-7 w-7 text-primary" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold">{client.full_name}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5" />
                    {client.id_number}
                  </span>
                  {client.phone_number && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {client.phone_number}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={onEdit}>
            <Edit className="h-4 w-4 ml-2" />
            تعديل
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="text-sm text-muted-foreground">رقم الملف</div>
            <div className="text-lg font-semibold mt-1">{client.file_number || '-'}</div>
          </div>
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="text-sm text-muted-foreground">تاريخ الانضمام</div>
            <div className="text-lg font-semibold mt-1">{formatDate(client.date_joined)}</div>
          </div>
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="text-sm text-muted-foreground">السيارات</div>
            <div className="text-lg font-semibold mt-1">{cars.length}</div>
          </div>
          <div className="p-4 bg-card border border-border rounded-xl">
            <div className="text-sm text-muted-foreground">العمر</div>
            <div className="mt-1">
              {client.less_than_24 ? (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">أقل من 24</Badge>
              ) : (
                <Badge variant="outline">24+</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="cars" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="cars">السيارات ({cars.length})</TabsTrigger>
            <TabsTrigger value="policies">الوثائق ({policies.length})</TabsTrigger>
            <TabsTrigger value="notes">الملاحظات</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 bg-card border border-border rounded-xl">
                <h3 className="font-semibold mb-4">بيانات العميل</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">الاسم</dt>
                    <dd className="font-medium">{client.full_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">رقم الهوية</dt>
                    <dd className="font-mono">{client.id_number}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">الهاتف</dt>
                    <dd>{client.phone_number || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">رقم الملف</dt>
                    <dd>{client.file_number || '-'}</dd>
                  </div>
                </dl>
              </div>
              
              <div className="p-6 bg-card border border-border rounded-xl">
                <h3 className="font-semibold mb-4">ملخص</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Car className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="font-semibold">{cars.length} سيارات</div>
                      <div className="text-sm text-muted-foreground">مسجلة باسم العميل</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <div className="font-semibold">{policies.length} وثائق تأمين</div>
                      <div className="text-sm text-muted-foreground">إجمالي الوثائق</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cars">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setCarDrawerOpen(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة سيارة
                </Button>
              </div>

              {loadingCars ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : cars.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                  <Car className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد سيارات مسجلة</p>
                  <Button variant="link" onClick={() => setCarDrawerOpen(true)}>
                    إضافة سيارة جديدة
                  </Button>
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم السيارة</TableHead>
                        <TableHead>الشركة المصنعة</TableHead>
                        <TableHead>الموديل</TableHead>
                        <TableHead>السنة</TableHead>
                        <TableHead>اللون</TableHead>
                        <TableHead>النوع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cars.map((car) => (
                        <TableRow key={car.id}>
                          <TableCell className="font-mono font-medium">{car.car_number}</TableCell>
                          <TableCell>{car.manufacturer_name || '-'}</TableCell>
                          <TableCell>{car.model || '-'}</TableCell>
                          <TableCell>{car.year || '-'}</TableCell>
                          <TableCell>{car.color || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{car.car_type || 'خصوصي'}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="policies">
            {loadingPolicies ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : policies.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>لا توجد وثائق تأمين</p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>نوع التأمين</TableHead>
                      <TableHead>الشركة</TableHead>
                      <TableHead>السيارة</TableHead>
                      <TableHead>تاريخ البداية</TableHead>
                      <TableHead>تاريخ الانتهاء</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-medium">
                          {policyTypeLabels[policy.policy_type_parent] || policy.policy_type_parent}
                        </TableCell>
                        <TableCell>{policy.company?.name_ar || policy.company?.name || '-'}</TableCell>
                        <TableCell className="font-mono">{policy.car?.car_number || '-'}</TableCell>
                        <TableCell>{formatDate(policy.start_date)}</TableCell>
                        <TableCell>{formatDate(policy.end_date)}</TableCell>
                        <TableCell>₪{policy.insurance_price.toLocaleString()}</TableCell>
                        <TableCell>
                          {policy.cancelled ? (
                            <Badge variant="destructive">ملغاة</Badge>
                          ) : new Date(policy.end_date) < new Date() ? (
                            <Badge variant="secondary">منتهية</Badge>
                          ) : (
                            <Badge className="bg-green-500">سارية</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes">
            <div className="p-6 bg-card border border-border rounded-xl min-h-[200px]">
              {client.notes ? (
                <p className="whitespace-pre-wrap">{client.notes}</p>
              ) : (
                <p className="text-muted-foreground text-center py-8">لا توجد ملاحظات</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Car Drawer */}
      <CarDrawer
        open={carDrawerOpen}
        onOpenChange={setCarDrawerOpen}
        clientId={client.id}
        onSaved={handleCarSaved}
      />
    </MainLayout>
  );
}
