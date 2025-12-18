import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Edit, Trash2, Eye, Copy, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceTemplate {
  id: string;
  name: string;
  language: string;
  direction: string;
  logo_url: string | null;
  header_html: string | null;
  body_html: string | null;
  footer_html: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

const PLACEHOLDERS = [
  { token: '{{invoice_number}}', label: 'رقم الفاتورة', labelHe: 'מספר חשבונית' },
  { token: '{{issue_date}}', label: 'تاريخ الإصدار', labelHe: 'תאריך הפקה' },
  { token: '{{admin_name}}', label: 'اسم الموظف', labelHe: 'שם העובד' },
  { token: '{{admin_email}}', label: 'بريد الموظف', labelHe: 'אימייל העובד' },
  { token: '{{client_name}}', label: 'اسم العميل', labelHe: 'שם הלקוח' },
  { token: '{{client_id_number}}', label: 'رقم هوية العميل', labelHe: 'תעודת זהות' },
  { token: '{{client_phone}}', label: 'هاتف العميل', labelHe: 'טלפון הלקוח' },
  { token: '{{policy_number}}', label: 'رقم الوثيقة', labelHe: 'מספר פוליסה' },
  { token: '{{insurance_type}}', label: 'نوع التأمين', labelHe: 'סוג ביטוח' },
  { token: '{{company_name}}', label: 'شركة التأمين', labelHe: 'חברת ביטוח' },
  { token: '{{start_date}}', label: 'تاريخ البداية', labelHe: 'תאריך התחלה' },
  { token: '{{end_date}}', label: 'تاريخ الانتهاء', labelHe: 'תאריך סיום' },
  { token: '{{car_number}}', label: 'رقم السيارة', labelHe: 'מספר רכב' },
  { token: '{{total_amount}}', label: 'المبلغ الإجمالي', labelHe: 'סכום כולל' },
  { token: '{{payment_method}}', label: 'طريقة الدفع', labelHe: 'אמצעי תשלום' },
];

export default function InvoiceTemplates() {
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    language: 'ar',
    direction: 'rtl',
    logo_url: '',
    header_html: '',
    body_html: '',
    footer_html: '',
    is_active: false,
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoice_templates')
      .select('*')
      .order('language', { ascending: true })
      .order('is_active', { ascending: false });

    setLoading(false);
    if (error) {
      toast({ title: "خطأ", description: "فشل في تحميل القوالب", variant: "destructive" });
      return;
    }
    setTemplates(data || []);
  };

  const handleEdit = (template: InvoiceTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      language: template.language,
      direction: template.direction,
      logo_url: template.logo_url || '',
      header_html: template.header_html || '',
      body_html: template.body_html || '',
      footer_html: template.footer_html || '',
      is_active: template.is_active,
    });
    setShowEditor(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      language: 'ar',
      direction: 'rtl',
      logo_url: '',
      header_html: '',
      body_html: '',
      footer_html: '',
      is_active: false,
    });
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال اسم القالب", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingTemplate) {
        // Update - increment version
        const { error } = await supabase
          .from('invoice_templates')
          .update({
            name: formData.name.trim(),
            language: formData.language as any,
            direction: formData.direction as any,
            logo_url: formData.logo_url.trim() || null,
            header_html: formData.header_html,
            body_html: formData.body_html,
            footer_html: formData.footer_html,
            is_active: formData.is_active,
            version: editingTemplate.version + 1,
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast({ title: "تم الحفظ", description: `تم تحديث القالب (النسخة ${editingTemplate.version + 1})` });
      } else {
        // Create new
        const { error } = await supabase
          .from('invoice_templates')
          .insert({
            name: formData.name.trim(),
            language: formData.language as any,
            direction: formData.direction as any,
            logo_url: formData.logo_url.trim() || null,
            header_html: formData.header_html,
            body_html: formData.body_html,
            footer_html: formData.footer_html,
            is_active: formData.is_active,
            created_by_admin_id: user?.id,
          });

        if (error) throw error;
        toast({ title: "تم الحفظ", description: "تم إنشاء القالب بنجاح" });
      }

      setShowEditor(false);
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "فشل في حفظ القالب", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: InvoiceTemplate) => {
    if (!confirm('هل أنت متأكد من حذف هذا القالب؟')) return;

    const { error } = await supabase
      .from('invoice_templates')
      .delete()
      .eq('id', template.id);

    if (error) {
      toast({ title: "خطأ", description: "فشل في حذف القالب", variant: "destructive" });
      return;
    }

    toast({ title: "تم الحذف", description: "تم حذف القالب بنجاح" });
    fetchTemplates();
  };

  const handleToggleActive = async (template: InvoiceTemplate) => {
    const { error } = await supabase
      .from('invoice_templates')
      .update({ is_active: !template.is_active })
      .eq('id', template.id);

    if (error) {
      toast({ title: "خطأ", description: "فشل في تحديث الحالة", variant: "destructive" });
      return;
    }

    fetchTemplates();
  };

  const insertPlaceholder = (token: string, field: 'header_html' | 'body_html' | 'footer_html') => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field] + token,
    }));
  };

  const buildPreviewHtml = () => {
    const sampleData: Record<string, string> = {
      '{{invoice_number}}': '2024-000001',
      '{{issue_date}}': new Date().toLocaleDateString('ar-SA'),
      '{{admin_name}}': 'أحمد محمد',
      '{{admin_email}}': 'admin@example.com',
      '{{client_name}}': 'خالد العلي',
      '{{client_id_number}}': '123456789',
      '{{client_phone}}': '0501234567',
      '{{policy_number}}': 'ELZAMI 2024 1234567',
      '{{insurance_type}}': 'إلزامي',
      '{{company_name}}': 'شركة التأمين',
      '{{start_date}}': '01/01/2024',
      '{{end_date}}': '31/12/2024',
      '{{car_number}}': '1234567',
      '{{total_amount}}': '1,500',
      '{{payment_method}}': 'نقدي',
    };

    let html = formData.header_html + formData.body_html + formData.footer_html;
    Object.entries(sampleData).forEach(([token, value]) => {
      html = html.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    const logoHtml = formData.logo_url 
      ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${formData.logo_url}" alt="Logo" style="max-height: 80px;" /></div>`
      : '';

    return `
<!DOCTYPE html>
<html dir="${formData.direction}" lang="${formData.language}">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Arial', 'Tahoma', sans-serif;
      margin: 0;
      padding: 40px;
      direction: ${formData.direction};
      text-align: ${formData.direction === 'rtl' ? 'right' : 'left'};
    }
  </style>
</head>
<body>
  ${logoHtml}
  ${html}
</body>
</html>
    `.trim();
  };

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">فقط المديرين يمكنهم الوصول لهذه الصفحة</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">قوالب الفواتير</h1>
            <p className="text-muted-foreground">إدارة قوالب سندات القبض</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 ml-2" />
            قالب جديد
          </Button>
        </div>

        {/* Templates Table */}
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">اللغة</TableHead>
                  <TableHead className="text-right">الاتجاه</TableHead>
                  <TableHead className="text-right">النسخة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">آخر تحديث</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      لا توجد قوالب. أنشئ قالبك الأول.
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {template.language === 'ar' ? 'عربي' : template.language === 'he' ? 'עברית' : 'كلاهما'}
                        </Badge>
                      </TableCell>
                      <TableCell>{template.direction === 'rtl' ? 'RTL' : 'LTR'}</TableCell>
                      <TableCell>v{template.version}</TableCell>
                      <TableCell>
                        <Switch
                          checked={template.is_active}
                          onCheckedChange={() => handleToggleActive(template)}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(template.updated_at).toLocaleDateString('ar-SA')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(template)} title="تعديل">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              setEditingTemplate(template);
                              setFormData({
                                name: template.name,
                                language: template.language,
                                direction: template.direction,
                                logo_url: template.logo_url || '',
                                header_html: template.header_html || '',
                                body_html: template.body_html || '',
                                footer_html: template.footer_html || '',
                                is_active: template.is_active,
                              });
                              setPreviewHtml(buildPreviewHtml());
                            }} 
                            title="معاينة"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(template)} title="حذف">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editingTemplate ? `تعديل: ${editingTemplate.name}` : 'قالب جديد'}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="settings" dir="rtl">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="settings">الإعدادات</TabsTrigger>
              <TabsTrigger value="header">الرأس</TabsTrigger>
              <TabsTrigger value="body">المحتوى</TabsTrigger>
              <TabsTrigger value="footer">التذييل</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>اسم القالب *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: سند قبض عربي"
                  />
                </div>
                <div>
                  <Label>اللغة</Label>
                  <Select value={formData.language} onValueChange={(v) => setFormData({ ...formData, language: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">عربي</SelectItem>
                      <SelectItem value="he">עברית</SelectItem>
                      <SelectItem value="both">كلاهما</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الاتجاه</Label>
                  <Select value={formData.direction} onValueChange={(v) => setFormData({ ...formData, direction: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtl">من اليمين لليسار (RTL)</SelectItem>
                      <SelectItem value="ltr">من اليسار لليمين (LTR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>رابط الشعار (اختياري)</Label>
                  <Input
                    value={formData.logo_url}
                    onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                    placeholder="https://..."
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
                />
                <Label>نشط (سيتم استخدامه للفواتير الجديدة)</Label>
              </div>
            </TabsContent>

            <TabsContent value="header" className="space-y-4 mt-4">
              <div>
                <Label>رمز التضمين</Label>
                <div className="flex flex-wrap gap-1 mt-2 mb-3">
                  {PLACEHOLDERS.slice(0, 5).map((p) => (
                    <Button
                      key={p.token}
                      variant="outline"
                      size="sm"
                      onClick={() => insertPlaceholder(p.token, 'header_html')}
                    >
                      <Copy className="h-3 w-3 ml-1" />
                      {formData.language === 'he' ? p.labelHe : p.label}
                    </Button>
                  ))}
                </div>
                <Textarea
                  value={formData.header_html}
                  onChange={(e) => setFormData({ ...formData, header_html: e.target.value })}
                  placeholder="<div>...</div>"
                  rows={8}
                  dir="ltr"
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="body" className="space-y-4 mt-4">
              <div>
                <Label>رمز التضمين</Label>
                <div className="flex flex-wrap gap-1 mt-2 mb-3">
                  {PLACEHOLDERS.map((p) => (
                    <Button
                      key={p.token}
                      variant="outline"
                      size="sm"
                      onClick={() => insertPlaceholder(p.token, 'body_html')}
                    >
                      <Copy className="h-3 w-3 ml-1" />
                      {formData.language === 'he' ? p.labelHe : p.label}
                    </Button>
                  ))}
                </div>
                <Textarea
                  value={formData.body_html}
                  onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                  placeholder="<div>...</div>"
                  rows={12}
                  dir="ltr"
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="footer" className="space-y-4 mt-4">
              <div>
                <Label>رمز التضمين</Label>
                <div className="flex flex-wrap gap-1 mt-2 mb-3">
                  {PLACEHOLDERS.slice(0, 3).map((p) => (
                    <Button
                      key={p.token}
                      variant="outline"
                      size="sm"
                      onClick={() => insertPlaceholder(p.token, 'footer_html')}
                    >
                      <Copy className="h-3 w-3 ml-1" />
                      {formData.language === 'he' ? p.labelHe : p.label}
                    </Button>
                  ))}
                </div>
                <Textarea
                  value={formData.footer_html}
                  onChange={(e) => setFormData({ ...formData, footer_html: e.target.value })}
                  placeholder="<div>...</div>"
                  rows={6}
                  dir="ltr"
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setPreviewHtml(buildPreviewHtml())}>
              <Eye className="h-4 w-4 ml-2" />
              معاينة
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditor(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                حفظ
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewHtml} onOpenChange={() => setPreviewHtml(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>معاينة القالب</DialogTitle>
          </DialogHeader>
          <div 
            className="border rounded-lg p-4 bg-white"
            dangerouslySetInnerHTML={{ __html: previewHtml || '' }}
          />
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setPreviewHtml(null)}>
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
