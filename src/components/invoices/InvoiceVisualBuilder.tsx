import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  Type, Image, Hash, Table2, Minus, QrCode, Stamp, 
  Undo2, Redo2, Grid3X3, Trash2, Copy, Lock, Unlock,
  ChevronUp, ChevronDown, Eye, Layers, AlertCircle
} from "lucide-react";
import { InvoicePropertiesPanel } from "./InvoicePropertiesPanel";
import { InvoiceElementsSidebar } from "./InvoiceElementsSidebar";

// Dynamic import for Fabric.js to handle SSR and loading issues
let FabricCanvas: any = null;
let Rect: any = null;
let Textbox: any = null;
let Line: any = null;
let FabricImage: any = null;

export interface TemplateElement {
  id: string;
  type: 'text' | 'image' | 'field' | 'table' | 'line' | 'logo';
  x: number;
  y: number;
  width: number;
  height: number;
  style: {
    fontSize?: number;
    fontWeight?: string;
    fontFamily?: string;
    textAlign?: string;
    color?: string;
    backgroundColor?: string;
    lineHeight?: number;
    direction?: 'rtl' | 'ltr';
    borderWidth?: number;
    borderColor?: string;
  };
  content?: string; // For text/image URL
  fieldKey?: string; // For dynamic fields
  locked?: boolean;
  tableConfig?: {
    columns: string[];
    showHeader: boolean;
  };
}

interface InvoiceVisualBuilderProps {
  layoutJson: TemplateElement[];
  onChange: (layout: TemplateElement[]) => void;
  language: string;
  previewData?: Record<string, string>;
  logoUrl?: string;
}

// A4 dimensions at 72 DPI (595 x 842 pixels)
const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const GRID_SIZE = 10;

const DYNAMIC_FIELDS = [
  { key: 'invoice_number', labelAr: 'رقم الفاتورة', labelHe: 'מספר חשבונית' },
  { key: 'issue_date', labelAr: 'تاريخ الإصدار', labelHe: 'תאריך הפקה' },
  { key: 'client_name', labelAr: 'اسم العميل', labelHe: 'שם הלקוח' },
  { key: 'client_id_number', labelAr: 'رقم الهوية', labelHe: 'תעודת זהות' },
  { key: 'client_phone', labelAr: 'هاتف العميل', labelHe: 'טלפון' },
  { key: 'car_number', labelAr: 'رقم السيارة', labelHe: 'מספר רכב' },
  { key: 'insurance_type', labelAr: 'نوع التأمين', labelHe: 'סוג ביטוח' },
  { key: 'company_name', labelAr: 'شركة التأمين', labelHe: 'חברת ביטוח' },
  { key: 'start_date', labelAr: 'تاريخ البداية', labelHe: 'תאריך התחלה' },
  { key: 'end_date', labelAr: 'تاريخ الانتهاء', labelHe: 'תאריך סיום' },
  { key: 'total_amount', labelAr: 'المبلغ الإجمالي', labelHe: 'סכום כולל' },
  { key: 'payment_method', labelAr: 'طريقة الدفع', labelHe: 'אמצעי תשלום' },
  { key: 'admin_name', labelAr: 'اسم الموظف', labelHe: 'שם העובד' },
  { key: 'policy_number', labelAr: 'رقم الوثيقة', labelHe: 'מספר פוליסה' },
];

export function InvoiceVisualBuilder({ 
  layoutJson, 
  onChange, 
  language, 
  previewData,
  logoUrl 
}: InvoiceVisualBuilderProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const [selectedElement, setSelectedElement] = useState<TemplateElement | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [history, setHistory] = useState<TemplateElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [elements, setElements] = useState<TemplateElement[]>(layoutJson || []);
  const isUpdatingRef = useRef(false);
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const [fabricError, setFabricError] = useState<string | null>(null);

  // Load Fabric.js dynamically
  useEffect(() => {
    const loadFabric = async () => {
      try {
        const fabric = await import("fabric");
        FabricCanvas = fabric.Canvas;
        Rect = fabric.Rect;
        Textbox = fabric.Textbox;
        Line = fabric.Line;
        FabricImage = fabric.Image;
        setFabricLoaded(true);
      } catch (err) {
        console.error("Failed to load Fabric.js:", err);
        setFabricError("فشل في تحميل محرر التصميم");
      }
    };
    loadFabric();
  }, []);

  // Initialize Fabric canvas after fabric is loaded
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || !FabricCanvas) return;

    try {
      const canvas = new FabricCanvas(canvasRef.current, {
        width: A4_WIDTH,
        height: A4_HEIGHT,
        backgroundColor: '#ffffff',
        selection: true,
        preserveObjectStacking: true,
      });

      fabricCanvasRef.current = canvas;

      // Draw grid
      if (showGrid) {
        drawGrid(canvas);
      }

      // Handle object selection
      canvas.on('selection:created', handleSelection);
      canvas.on('selection:updated', handleSelection);
      canvas.on('selection:cleared', () => setSelectedElement(null));

      // Handle object modifications
      canvas.on('object:modified', handleObjectModified);
      canvas.on('object:moving', handleObjectMoving);

      // Load existing elements
      loadElementsToCanvas(elements, canvas);

      return () => {
        canvas.dispose();
      };
    } catch (err) {
      console.error("Failed to initialize canvas:", err);
      setFabricError("فشل في تهيئة لوحة التصميم");
    }
  }, [fabricLoaded]);

  // Update grid visibility
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove existing grid
    const gridObjects = canvas.getObjects().filter(obj => (obj as any).isGrid);
    gridObjects.forEach(obj => canvas.remove(obj));

    if (showGrid) {
      drawGrid(canvas);
    }
    canvas.renderAll();
  }, [showGrid]);

  // Sync elements with parent
  useEffect(() => {
    if (!isUpdatingRef.current) {
      onChange(elements);
    }
  }, [elements, onChange]);

  const drawGrid = (canvas: any) => {
    // Draw vertical lines
    for (let i = 0; i <= A4_WIDTH; i += GRID_SIZE) {
      const line = new Line([i, 0, i, A4_HEIGHT], {
        stroke: '#e5e7eb',
        strokeWidth: i % 50 === 0 ? 0.5 : 0.2,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    // Draw horizontal lines
    for (let i = 0; i <= A4_HEIGHT; i += GRID_SIZE) {
      const line = new Line([0, i, A4_WIDTH, i], {
        stroke: '#e5e7eb',
        strokeWidth: i % 50 === 0 ? 0.5 : 0.2,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }
  };

  const handleSelection = (e: any) => {
    const obj = e.selected?.[0];
    if (obj && (obj as any).elementId) {
      const element = elements.find(el => el.id === (obj as any).elementId);
      setSelectedElement(element || null);
    }
  };

  const handleObjectModified = (e: any) => {
    const obj = e.target;
    if (!obj || !(obj as any).elementId) return;

    const elementId = (obj as any).elementId;
    
    setElements(prev => {
      const updated = prev.map(el => {
        if (el.id === elementId) {
          return {
            ...el,
            x: Math.round(obj.left || 0),
            y: Math.round(obj.top || 0),
            width: Math.round((obj.width || 100) * (obj.scaleX || 1)),
            height: Math.round((obj.height || 30) * (obj.scaleY || 1)),
          };
        }
        return el;
      });
      saveToHistory(updated);
      return updated;
    });
  };

  const handleObjectMoving = (e: any) => {
    const obj = e.target;
    if (!obj) return;

    // Snap to grid
    if (showGrid) {
      obj.set({
        left: Math.round(obj.left! / GRID_SIZE) * GRID_SIZE,
        top: Math.round(obj.top! / GRID_SIZE) * GRID_SIZE,
      });
    }
  };

  const loadElementsToCanvas = (elements: TemplateElement[], canvas: any) => {
    // Remove non-grid objects
    const objectsToRemove = canvas.getObjects().filter(obj => !(obj as any).isGrid);
    objectsToRemove.forEach(obj => canvas.remove(obj));

    elements.forEach(element => {
      addElementToCanvas(element, canvas);
    });

    canvas.renderAll();
  };

  const addElementToCanvas = (element: TemplateElement, canvas: any) => {
    let fabricObject: any = null;

    const displayText = element.type === 'field' && element.fieldKey
      ? (previewData?.[element.fieldKey] || `{{${element.fieldKey}}}`)
      : element.content || '';

    switch (element.type) {
      case 'text':
      case 'field':
        const textbox = new Textbox(displayText || (language === 'ar' ? 'نص جديد' : 'טקסט חדש'), {
          left: element.x,
          top: element.y,
          width: element.width,
          fontSize: element.style.fontSize || 14,
          fontWeight: element.style.fontWeight || 'normal',
          fontFamily: element.style.fontFamily || 'Arial',
          textAlign: element.style.textAlign as any || (language === 'ar' ? 'right' : 'right'),
          fill: element.style.color || '#000000',
          backgroundColor: element.style.backgroundColor || 'transparent',
          direction: element.style.direction || 'rtl',
          lockMovementX: element.locked,
          lockMovementY: element.locked,
          lockScalingX: element.locked,
          lockScalingY: element.locked,
        });
        fabricObject = textbox;
        break;

      case 'line':
        const line = new Rect({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height || 2,
          fill: element.style.color || '#000000',
          lockMovementX: element.locked,
          lockMovementY: element.locked,
        });
        fabricObject = line;
        break;

      case 'image':
      case 'logo':
        const imgUrl = element.type === 'logo' ? logoUrl : element.content;
        if (imgUrl) {
          FabricImage.fromURL(imgUrl, { crossOrigin: 'anonymous' }).then(img => {
            img.set({
              left: element.x,
              top: element.y,
              scaleX: element.width / (img.width || 100),
              scaleY: element.height / (img.height || 100),
              lockMovementX: element.locked,
              lockMovementY: element.locked,
            });
            (img as any).elementId = element.id;
            canvas.add(img);
            canvas.renderAll();
          });
          return; // Image is loaded async
        } else {
          // Placeholder
          const placeholder = new Rect({
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            fill: '#f3f4f6',
            stroke: '#d1d5db',
            strokeWidth: 1,
          });
          fabricObject = placeholder;
        }
        break;

      case 'table':
        // Simple table representation
        const tableRect = new Rect({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          fill: 'transparent',
          stroke: '#000000',
          strokeWidth: 1,
        });
        fabricObject = tableRect;
        break;
    }

    if (fabricObject) {
      (fabricObject as any).elementId = element.id;
      canvas.add(fabricObject);
    }
  };

  const saveToHistory = (newElements: TemplateElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newElements]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      const prevElements = history[historyIndex - 1];
      isUpdatingRef.current = true;
      setElements(prevElements);
      loadElementsToCanvas(prevElements, fabricCanvasRef.current!);
      isUpdatingRef.current = false;
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      const nextElements = history[historyIndex + 1];
      isUpdatingRef.current = true;
      setElements(nextElements);
      loadElementsToCanvas(nextElements, fabricCanvasRef.current!);
      isUpdatingRef.current = false;
    }
  };

  const addElement = (type: TemplateElement['type'], fieldKey?: string) => {
    const id = `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newElement: TemplateElement = {
      id,
      type,
      x: 50,
      y: 50,
      width: type === 'line' ? 200 : type === 'logo' || type === 'image' ? 100 : 150,
      height: type === 'line' ? 2 : type === 'logo' || type === 'image' ? 80 : 30,
      style: {
        fontSize: 14,
        fontWeight: 'normal',
        fontFamily: 'Arial',
        textAlign: language === 'ar' ? 'right' : 'right',
        color: '#000000',
        direction: 'rtl',
      },
      content: type === 'text' ? (language === 'ar' ? 'نص جديد' : 'טקסט חדש') : '',
      fieldKey: type === 'field' ? fieldKey : undefined,
      locked: false,
    };

    const newElements = [...elements, newElement];
    setElements(newElements);
    saveToHistory(newElements);

    // Add to canvas
    if (fabricCanvasRef.current) {
      addElementToCanvas(newElement, fabricCanvasRef.current);
      fabricCanvasRef.current.renderAll();
    }

    toast({ title: language === 'ar' ? 'تم الإضافة' : 'נוסף', description: `Element added` });
  };

  const deleteElement = (id: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Remove from canvas
    const obj = canvas.getObjects().find(o => (o as any).elementId === id);
    if (obj) {
      canvas.remove(obj);
      canvas.renderAll();
    }

    // Remove from state
    const newElements = elements.filter(el => el.id !== id);
    setElements(newElements);
    saveToHistory(newElements);
    setSelectedElement(null);
  };

  const duplicateElement = (id: string) => {
    const element = elements.find(el => el.id === id);
    if (!element) return;

    const newElement: TemplateElement = {
      ...element,
      id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      x: element.x + 20,
      y: element.y + 20,
    };

    const newElements = [...elements, newElement];
    setElements(newElements);
    saveToHistory(newElements);

    if (fabricCanvasRef.current) {
      addElementToCanvas(newElement, fabricCanvasRef.current);
      fabricCanvasRef.current.renderAll();
    }
  };

  const updateElement = (id: string, updates: Partial<TemplateElement>) => {
    const newElements = elements.map(el => {
      if (el.id === id) {
        return { ...el, ...updates };
      }
      return el;
    });
    setElements(newElements);
    saveToHistory(newElements);

    // Update canvas
    if (fabricCanvasRef.current) {
      loadElementsToCanvas(newElements, fabricCanvasRef.current);
    }

    // Update selected element
    if (selectedElement?.id === id) {
      setSelectedElement({ ...selectedElement, ...updates });
    }
  };

  const toggleLock = (id: string) => {
    const element = elements.find(el => el.id === id);
    if (element) {
      updateElement(id, { locked: !element.locked });
    }
  };

  const bringForward = (id: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const obj = canvas.getObjects().find(o => (o as any).elementId === id);
    if (obj) {
      canvas.bringObjectForward(obj);
      canvas.renderAll();
    }
  };

  const sendBackward = (id: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const obj = canvas.getObjects().find(o => (o as any).elementId === id);
    if (obj) {
      canvas.sendObjectBackwards(obj);
      canvas.renderAll();
    }
  };

  // Loading state
  if (!fabricLoaded && !fabricError) {
    return (
      <div className="flex items-center justify-center h-[700px]" dir="rtl">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground">جاري تحميل محرر التصميم...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (fabricError) {
    return (
      <div className="flex items-center justify-center h-[700px]" dir="rtl">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <p className="text-destructive">{fabricError}</p>
          <Button onClick={() => window.location.reload()}>إعادة تحميل الصفحة</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[700px]" dir="rtl">
      {/* Left Sidebar - Elements */}
      <InvoiceElementsSidebar 
        language={language}
        onAddElement={addElement}
        dynamicFields={DYNAMIC_FIELDS}
      />

      {/* Center - Canvas */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-muted/50 rounded-lg p-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={undo} disabled={historyIndex <= 0} title="تراجع">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={historyIndex >= history.length - 1} title="إعادة">
              <Redo2 className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Switch checked={showGrid} onCheckedChange={setShowGrid} id="grid-toggle" />
              <Label htmlFor="grid-toggle" className="text-xs">
                <Grid3X3 className="h-4 w-4" />
              </Label>
            </div>
          </div>
          
          {selectedElement && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => duplicateElement(selectedElement.id)} title="نسخ">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => toggleLock(selectedElement.id)} title={selectedElement.locked ? 'فك القفل' : 'قفل'}>
                {selectedElement.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => bringForward(selectedElement.id)} title="للأمام">
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => sendBackward(selectedElement.id)} title="للخلف">
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => deleteElement(selectedElement.id)} title="حذف">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>

        {/* Canvas Container */}
        <div className="flex-1 overflow-auto bg-muted/30 rounded-lg p-4 flex items-start justify-center">
          <div className="shadow-lg border bg-white">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>

      {/* Right Sidebar - Properties */}
      <InvoicePropertiesPanel
        element={selectedElement}
        onUpdate={(updates) => selectedElement && updateElement(selectedElement.id, updates)}
        language={language}
        dynamicFields={DYNAMIC_FIELDS}
      />
    </div>
  );
}
