import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Type, Image, Hash, Table2, Minus, FileImage, GripVertical
} from "lucide-react";

interface DynamicField {
  key: string;
  labelAr: string;
  labelHe: string;
}

interface InvoiceElementsSidebarProps {
  language: string;
  onAddElement: (type: 'text' | 'image' | 'field' | 'table' | 'line' | 'logo', fieldKey?: string) => void;
  dynamicFields: DynamicField[];
}

const ELEMENT_TYPES = [
  { type: 'text' as const, icon: Type, labelAr: 'نص', labelHe: 'טקסט', color: 'bg-blue-500' },
  { type: 'logo' as const, icon: FileImage, labelAr: 'الشعار', labelHe: 'לוגו', color: 'bg-purple-500' },
  { type: 'image' as const, icon: Image, labelAr: 'صورة', labelHe: 'תמונה', color: 'bg-green-500' },
  { type: 'line' as const, icon: Minus, labelAr: 'خط فاصل', labelHe: 'קו', color: 'bg-gray-500' },
  { type: 'table' as const, icon: Table2, labelAr: 'جدول', labelHe: 'טבלה', color: 'bg-orange-500' },
];

export function InvoiceElementsSidebar({ language, onAddElement, dynamicFields }: InvoiceElementsSidebarProps) {
  const isAr = language === 'ar';

  const handleDragStart = (e: React.DragEvent, type: string, fieldKey?: string) => {
    e.dataTransfer.setData('elementType', type);
    if (fieldKey) {
      e.dataTransfer.setData('fieldKey', fieldKey);
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <Card className="w-60 flex flex-col">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">{isAr ? 'العناصر' : 'אלמנטים'}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isAr ? 'اسحب أو انقر للإضافة' : 'גרור או לחץ להוספה'}
        </p>
      </div>
      
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* Basic Elements */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {isAr ? 'العناصر الأساسية' : 'אלמנטים בסיסיים'}
            </p>
            <div className="space-y-1.5">
              {ELEMENT_TYPES.map((el) => (
                <div
                  key={el.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, el.type)}
                  onClick={() => onAddElement(el.type)}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors group"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className={`p-1.5 rounded ${el.color} text-white`}>
                    <el.icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm flex-1">{isAr ? el.labelAr : el.labelHe}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Dynamic Fields */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {isAr ? 'حقول ديناميكية' : 'שדות דינמיים'}
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              {isAr ? 'تُستبدل تلقائياً ببيانات الوثيقة' : 'יוחלפו אוטומטית בנתוני המסמך'}
            </p>
            <div className="space-y-1">
              {dynamicFields.map((field) => (
                <div
                  key={field.key}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'field', field.key)}
                  onClick={() => onAddElement('field', field.key)}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors group"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Hash className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm flex-1">{isAr ? field.labelAr : field.labelHe}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {`{{${field.key.split('_')[0]}}}`}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </Card>
  );
}
