import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Type, Image, Hash, Table2, Minus, Stamp, FileImage
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  { type: 'logo' as const, icon: FileImage, labelAr: 'الشعار', labelHe: 'לוגו' },
  { type: 'text' as const, icon: Type, labelAr: 'نص', labelHe: 'טקסט' },
  { type: 'image' as const, icon: Image, labelAr: 'صورة', labelHe: 'תמונה' },
  { type: 'line' as const, icon: Minus, labelAr: 'خط فاصل', labelHe: 'קו' },
  { type: 'table' as const, icon: Table2, labelAr: 'جدول', labelHe: 'טבלה' },
];

export function InvoiceElementsSidebar({ language, onAddElement, dynamicFields }: InvoiceElementsSidebarProps) {
  const isAr = language === 'ar';

  return (
    <Card className="w-56 flex flex-col">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">{isAr ? 'العناصر' : 'אלמנטים'}</h3>
      </div>
      
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* Basic Elements */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {isAr ? 'العناصر الأساسية' : 'אלמנטים בסיסיים'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ELEMENT_TYPES.map((el) => (
                <Button
                  key={el.type}
                  variant="outline"
                  size="sm"
                  className="flex flex-col gap-1 h-auto py-2 px-2"
                  onClick={() => onAddElement(el.type)}
                >
                  <el.icon className="h-4 w-4" />
                  <span className="text-xs">{isAr ? el.labelAr : el.labelHe}</span>
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Dynamic Fields */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {isAr ? 'حقول ديناميكية' : 'שדות דינמיים'}
            </p>
            <div className="space-y-1">
              {dynamicFields.map((field) => (
                <Button
                  key={field.key}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-8 px-2"
                  onClick={() => onAddElement('field', field.key)}
                >
                  <Hash className="h-3 w-3 ml-2 text-primary" />
                  {isAr ? field.labelAr : field.labelHe}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </Card>
  );
}
