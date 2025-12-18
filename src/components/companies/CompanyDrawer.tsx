import { useState, useEffect } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2 } from 'lucide-react';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Company = Tables<'insurance_companies'>;

const POLICY_TYPES = [
  { value: "ELZAMI", label: "إلزامي" },
  { value: "THIRD_FULL", label: "ثالث/شامل" },
  { value: "ROAD_SERVICE", label: "خدمات الطريق" },
  { value: "ACCIDENT_FEE_EXEMPTION", label: "إعفاء رسوم حادث" },
];

interface CompanyDrawerProps {
  open: boolean;
  onClose: () => void;
  company: Company | null;
  onSuccess: () => void;
}

export function CompanyDrawer({ open, onClose, company, onSuccess }: CompanyDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    name_ar: '',
    category_parent: '' as string,
    active: true,
  });

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name,
        name_ar: company.name_ar || '',
        category_parent: company.category_parent || '',
        active: company.active ?? true,
      });
    } else {
      setFormData({
        name: '',
        name_ar: '',
        category_parent: '',
        active: true,
      });
    }
  }, [company, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: 'خطأ',
        description: 'الرجاء إدخال اسم الشركة بالإنجليزية',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.category_parent) {
      toast({
        title: 'خطأ',
        description: 'الرجاء اختيار نوع التأمين',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      if (company) {
        const { error } = await supabase
          .from('insurance_companies')
          .update({
            name: formData.name.trim(),
            name_ar: formData.name_ar.trim() || null,
            category_parent: formData.category_parent as Enums<'policy_type_parent'>,
            active: formData.active,
          })
          .eq('id', company.id);

        if (error) throw error;

        toast({
          title: 'تم التحديث',
          description: 'تم تحديث بيانات الشركة بنجاح',
        });
      } else {
        const { error } = await supabase
          .from('insurance_companies')
          .insert({
            name: formData.name.trim(),
            name_ar: formData.name_ar.trim() || null,
            category_parent: formData.category_parent as Enums<'policy_type_parent'>,
            active: formData.active,
          });

        if (error) throw error;

        toast({
          title: 'تمت الإضافة',
          description: 'تمت إضافة الشركة بنجاح',
        });
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving company:', error);
      toast({
        title: 'خطأ',
        description: error.message || 'فشل في حفظ بيانات الشركة',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!company) return;
    
    setDeleting(true);
    try {
      // First delete all pricing rules for this company
      const { error: rulesError } = await supabase
        .from('pricing_rules')
        .delete()
        .eq('company_id', company.id);

      if (rulesError) throw rulesError;

      // Then delete the company
      const { error: companyError } = await supabase
        .from('insurance_companies')
        .delete()
        .eq('id', company.id);

      if (companyError) throw companyError;

      toast({
        title: 'تم الحذف',
        description: 'تم حذف الشركة وجميع قواعد التسعير المرتبطة بها',
      });

      setDeleteDialogOpen(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error deleting company:', error);
      toast({
        title: 'خطأ',
        description: error.message || 'فشل في حذف الشركة',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="flex flex-row items-center justify-between">
            <DrawerTitle>
              {company ? 'تعديل شركة التأمين' : 'إضافة شركة تأمين جديدة'}
            </DrawerTitle>
            {company && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 ml-1" />
                حذف
              </Button>
            )}
          </DrawerHeader>

          <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-right block">الاسم بالإنجليزية *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Company Name"
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name_ar" className="text-right block">الاسم بالعربية</Label>
              <Input
                id="name_ar"
                value={formData.name_ar}
                onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                placeholder="اسم الشركة"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-right block">نوع التأمين *</Label>
              <Select
                value={formData.category_parent}
                onValueChange={(v) => setFormData({ ...formData, category_parent: v })}
              >
                <SelectTrigger className="text-right">
                  <SelectValue placeholder="اختر نوع التأمين" />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value} className="text-right">{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="active">الشركة نشطة</Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>
          </form>

          <DrawerFooter>
            <div className="flex gap-2 w-full">
              <Button
                type="submit"
                className="flex-1"
                disabled={loading}
                onClick={handleSubmit}
              >
                {loading ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                إلغاء
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد أنك تريد حذف الشركة "{company?.name_ar || company?.name}"؟
              <br />
              <span className="text-destructive font-medium">
                سيتم حذف جميع قواعد التسعير المرتبطة بها نهائياً.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                  جاري الحذف...
                </>
              ) : (
                'حذف'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
