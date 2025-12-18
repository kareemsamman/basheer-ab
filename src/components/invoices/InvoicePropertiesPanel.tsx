import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Upload, ImageIcon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { TemplateElement } from "./InvoiceVisualBuilder";

interface DynamicField {
  key: string;
  labelAr: string;
  labelHe: string;
}

interface InvoicePropertiesPanelProps {
  element: TemplateElement | null;
  onUpdate: (updates: Partial<TemplateElement>) => void;
  onDelete: () => void;
  language: string;
  dynamicFields: DynamicField[];
}

export function InvoicePropertiesPanel({ 
  element, 
  onUpdate, 
  onDelete,
  language, 
  dynamicFields 
}: InvoicePropertiesPanelProps) {
  const { toast } = useToast();
  const isAr = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!element) {
    return (
      <Card className="w-64 p-4 flex items-center justify-center text-muted-foreground text-sm">
        {isAr ? 'اختر عنصراً لتعديل خصائصه' : 'בחר אלמנט לעריכה'}
      </Card>
    );
  }

  const updateStyle = (key: string, value: any) => {
    onUpdate({
      style: {
        ...element.style,
        [key]: value,
      },
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: "خطأ", description: "يرجى اختيار ملف صورة", variant: "destructive" });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "خطأ", description: "حجم الصورة كبير جداً (الحد الأقصى 5MB)", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Read file as base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        const response = await supabase.functions.invoke('upload-media', {
          body: {
            file_name: file.name,
            file_type: file.type,
            file_data: base64,
            entity_type: 'invoice_template',
          },
        });

        if (response.error) throw response.error;
        
        const cdnUrl = response.data?.cdn_url;
        if (cdnUrl) {
          onUpdate({ content: cdnUrl });
          toast({ title: "تم الرفع", description: "تم رفع الصورة بنجاح" });
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "خطأ", description: "فشل في رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="w-72 flex flex-col max-h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{isAr ? 'الخصائص' : 'מאפיינים'}</h3>
          <p className="text-xs text-muted-foreground">
            {element.type === 'field' ? (isAr ? 'حقل ديناميكي' : 'שדה דינמי') : 
             element.type === 'text' ? (isAr ? 'نص' : 'טקסט') :
             element.type === 'image' ? (isAr ? 'صورة' : 'תמונה') :
             element.type === 'logo' ? (isAr ? 'شعار' : 'לוגו') :
             element.type === 'line' ? (isAr ? 'خط' : 'קו') :
             element.type === 'table' ? (isAr ? 'جدول' : 'טבלה') :
             element.type}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* Text Content - For text elements */}
          {element.type === 'text' && (
            <div>
              <Label className="text-xs mb-1.5 block">{isAr ? 'النص' : 'טקסט'}</Label>
              <Textarea
                value={element.content || ''}
                onChange={(e) => onUpdate({ content: e.target.value })}
                className="text-sm min-h-[80px] resize-none"
                placeholder={isAr ? 'أدخل النص هنا...' : 'הכנס טקסט כאן...'}
                dir={element.style.direction || 'rtl'}
              />
            </div>
          )}

          {/* Field selector - For dynamic fields */}
          {element.type === 'field' && (
            <div>
              <Label className="text-xs mb-1.5 block">{isAr ? 'اختر الحقل' : 'בחר שדה'}</Label>
              <Select
                value={element.fieldKey}
                onValueChange={(v) => onUpdate({ fieldKey: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={isAr ? 'اختر حقلاً' : 'בחר שדה'} />
                </SelectTrigger>
                <SelectContent>
                  {dynamicFields.map((field) => (
                    <SelectItem key={field.key} value={field.key}>
                      {isAr ? field.labelAr : field.labelHe}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Image Upload - For image elements */}
          {element.type === 'image' && (
            <div className="space-y-3">
              <Label className="text-xs mb-1.5 block">{isAr ? 'الصورة' : 'תמונה'}</Label>
              
              {/* Preview */}
              {element.content ? (
                <div className="relative rounded-lg border overflow-hidden bg-muted/30">
                  <img 
                    src={element.content} 
                    alt="Preview" 
                    className="w-full h-24 object-contain"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 left-1 h-6 w-6"
                    onClick={() => onUpdate({ content: '' })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed p-4 text-center bg-muted/30">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {isAr ? 'لا توجد صورة' : 'אין תמונה'}
                  </p>
                </div>
              )}

              {/* Upload Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 ml-2" />
                )}
                {isAr ? 'رفع صورة' : 'העלה תמונה'}
              </Button>

              {/* Or URL */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">
                    {isAr ? 'أو رابط مباشر' : 'או קישור'}
                  </span>
                </div>
              </div>
              <Input
                value={element.content || ''}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder="https://..."
                className="h-8 text-xs"
                dir="ltr"
              />
            </div>
          )}

          <Separator />

          {/* Position & Size */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {isAr ? 'الموقع والحجم' : 'מיקום וגודל'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">X</Label>
                <Input
                  type="number"
                  value={element.x}
                  onChange={(e) => onUpdate({ x: parseInt(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Y</Label>
                <Input
                  type="number"
                  value={element.y}
                  onChange={(e) => onUpdate({ y: parseInt(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">{isAr ? 'عرض' : 'רוחב'}</Label>
                <Input
                  type="number"
                  value={element.width}
                  onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 100 })}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">{isAr ? 'ارتفاع' : 'גובה'}</Label>
                <Input
                  type="number"
                  value={element.height}
                  onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 30 })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Text/Field styling */}
          {(element.type === 'text' || element.type === 'field') && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {isAr ? 'تنسيق النص' : 'עיצוב טקסט'}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{isAr ? 'حجم الخط' : 'גודל'}</Label>
                    <Input
                      type="number"
                      value={element.style.fontSize || 14}
                      onChange={(e) => updateStyle('fontSize', parseInt(e.target.value) || 14)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{isAr ? 'السُمك' : 'עובי'}</Label>
                    <Select
                      value={element.style.fontWeight || 'normal'}
                      onValueChange={(v) => updateStyle('fontWeight', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">{isAr ? 'عادي' : 'רגיל'}</SelectItem>
                        <SelectItem value="bold">{isAr ? 'عريض' : 'מודגש'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{isAr ? 'المحاذاة' : 'יישור'}</Label>
                    <Select
                      value={element.style.textAlign || 'right'}
                      onValueChange={(v) => updateStyle('textAlign', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="right">{isAr ? 'يمين' : 'ימין'}</SelectItem>
                        <SelectItem value="center">{isAr ? 'وسط' : 'מרכז'}</SelectItem>
                        <SelectItem value="left">{isAr ? 'يسار' : 'שמאל'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{isAr ? 'الاتجاه' : 'כיוון'}</Label>
                    <Select
                      value={element.style.direction || 'rtl'}
                      onValueChange={(v) => updateStyle('direction', v as 'rtl' | 'ltr')}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rtl">RTL</SelectItem>
                        <SelectItem value="ltr">LTR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Color */}
          <div>
            <Label className="text-xs mb-1.5 block">{isAr ? 'اللون' : 'צבע'}</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={element.style.color || '#000000'}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="h-8 w-12 p-1 cursor-pointer"
              />
              <Input
                value={element.style.color || '#000000'}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="h-8 text-xs flex-1"
                dir="ltr"
              />
            </div>
          </div>

          {/* Background Color for text */}
          {(element.type === 'text' || element.type === 'field') && (
            <div>
              <Label className="text-xs mb-1.5 block">{isAr ? 'لون الخلفية' : 'צבע רקע'}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={element.style.backgroundColor || '#ffffff'}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="h-8 w-12 p-1 cursor-pointer"
                />
                <Input
                  value={element.style.backgroundColor || 'transparent'}
                  onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                  className="h-8 text-xs flex-1"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          <Separator />

          {/* Lock */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">{isAr ? 'قفل العنصر' : 'נעל אלמנט'}</Label>
            <Switch
              checked={element.locked}
              onCheckedChange={(c) => onUpdate({ locked: c })}
            />
          </div>
        </div>
      </ScrollArea>
    </Card>
  );
}
