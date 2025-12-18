import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TemplateElement } from "./InvoiceVisualBuilder";

interface DynamicField {
  key: string;
  labelAr: string;
  labelHe: string;
}

interface InvoicePropertiesPanelProps {
  element: TemplateElement | null;
  onUpdate: (updates: Partial<TemplateElement>) => void;
  language: string;
  dynamicFields: DynamicField[];
}

export function InvoicePropertiesPanel({ 
  element, 
  onUpdate, 
  language, 
  dynamicFields 
}: InvoicePropertiesPanelProps) {
  const isAr = language === 'ar';

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

  return (
    <Card className="w-64 flex flex-col">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">{isAr ? 'الخصائص' : 'מאפיינים'}</h3>
        <p className="text-xs text-muted-foreground">
          {element.type === 'field' ? (isAr ? 'حقل ديناميكي' : 'שדה דינמי') : 
           element.type === 'text' ? (isAr ? 'نص' : 'טקסט') :
           element.type === 'image' ? (isAr ? 'صورة' : 'תמונה') :
           element.type === 'logo' ? (isAr ? 'شعار' : 'לוגו') :
           element.type === 'line' ? (isAr ? 'خط' : 'קו') :
           element.type}
        </p>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
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

          <Separator />

          {/* Text/Field specific properties */}
          {(element.type === 'text' || element.type === 'field') && (
            <>
              {element.type === 'field' && (
                <div>
                  <Label className="text-xs">{isAr ? 'الحقل' : 'שדה'}</Label>
                  <Select
                    value={element.fieldKey}
                    onValueChange={(v) => onUpdate({ fieldKey: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
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

              {element.type === 'text' && (
                <div>
                  <Label className="text-xs">{isAr ? 'النص' : 'טקסט'}</Label>
                  <Input
                    value={element.content || ''}
                    onChange={(e) => onUpdate({ content: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs">{isAr ? 'حجم الخط' : 'גודל פונט'}</Label>
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
                  onValueChange={(v) => updateStyle('direction', v)}
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
            </>
          )}

          {/* Color */}
          <div>
            <Label className="text-xs">{isAr ? 'اللون' : 'צבע'}</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={element.style.color || '#000000'}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="h-8 w-12 p-1"
              />
              <Input
                value={element.style.color || '#000000'}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="h-8 text-xs flex-1"
                dir="ltr"
              />
            </div>
          </div>

          {/* Image URL */}
          {(element.type === 'image') && (
            <div>
              <Label className="text-xs">{isAr ? 'رابط الصورة' : 'קישור לתמונה'}</Label>
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
