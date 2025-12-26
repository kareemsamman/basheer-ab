import { useState, useEffect, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Company = Tables<'insurance_companies'>;

interface AccidentFeeService {
  id: string;
  name: string;
  name_ar: string | null;
  active: boolean;
}

interface AccidentFeePrice {
  id?: string;
  accident_fee_service_id: string;
  company_id: string;
  company_cost: number;
}

interface AccidentFeePricingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
}

export function AccidentFeePricingDrawer({ open, onOpenChange, company }: AccidentFeePricingDrawerProps) {
  const [services, setServices] = useState<AccidentFeeService[]>([]);
  const [prices, setPrices] = useState<Map<string, AccidentFeePrice>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedPrices, setEditedPrices] = useState<Map<string, number>>(new Map());

  const fetchData = useCallback(async () => {
    if (!company) return;
    
    setLoading(true);
    try {
      // Fetch all active accident fee services
      const { data: servicesData, error: servicesError } = await supabase
        .from('accident_fee_services')
        .select('id, name, name_ar, active')
        .eq('active', true)
        .order('sort_order');

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      // Fetch existing prices for this company
      const { data: pricesData, error: pricesError } = await supabase
        .from('company_accident_fee_prices')
        .select('*')
        .eq('company_id', company.id);

      if (pricesError) throw pricesError;

      // Create a map of service_id -> price
      const priceMap = new Map<string, AccidentFeePrice>();
      const editedMap = new Map<string, number>();
      
      pricesData?.forEach((price: any) => {
        priceMap.set(price.accident_fee_service_id, price);
        editedMap.set(price.accident_fee_service_id, price.company_cost);
      });

      // Initialize prices for services without existing prices
      servicesData?.forEach((service: AccidentFeeService) => {
        if (!priceMap.has(service.id)) {
          editedMap.set(service.id, 0);
        }
      });

      setPrices(priceMap);
      setEditedPrices(editedMap);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    if (open && company) {
      fetchData();
    }
  }, [open, company, fetchData]);

  const handlePriceChange = (serviceId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditedPrices(prev => new Map(prev).set(serviceId, numValue));
  };

  const handleSave = async () => {
    if (!company) return;

    setSaving(true);
    try {
      // Prepare upsert data
      const upsertData: any[] = [];
      
      editedPrices.forEach((cost, serviceId) => {
        upsertData.push({
          company_id: company.id,
          accident_fee_service_id: serviceId,
          company_cost: cost,
        });
      });

      // Use upsert with conflict resolution
      for (const data of upsertData) {
        const existingPrice = prices.get(data.accident_fee_service_id);
        
        if (existingPrice?.id) {
          // Update existing
          const { error } = await supabase
            .from('company_accident_fee_prices')
            .update({ company_cost: data.company_cost })
            .eq('id', existingPrice.id);
          
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('company_accident_fee_prices')
            .insert(data);
          
          if (error) throw error;
        }
      }

      toast.success('تم حفظ الأسعار بنجاح');
      fetchData(); // Refresh data
    } catch (error: any) {
      console.error('Error saving prices:', error);
      toast.error(error.message || 'فشل في حفظ الأسعار');
    } finally {
      setSaving(false);
    }
  };

  if (!company) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>
            أسعار إعفاء رسوم الحادث - {company.name_ar || company.name}
          </DrawerTitle>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ الأسعار
          </Button>
        </DrawerHeader>

        <div className="p-4 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد خدمات إعفاء رسوم حادث مضافة
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الخدمة</TableHead>
                  <TableHead className="text-right w-40">تكلفة الشركة (₪)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">
                      {service.name_ar || service.name}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editedPrices.get(service.id) || 0}
                        onChange={(e) => handlePriceChange(service.id, e.target.value)}
                        className="w-32 text-left"
                        dir="ltr"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}