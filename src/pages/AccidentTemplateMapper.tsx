import { useState, useEffect, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Save,
  Loader2,
  MousePointer,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Trash2,
  FileText,
  CheckCircle,
} from "lucide-react";

// All canonical fields from accident_reports
const CANONICAL_FIELDS = [
  { id: "policy_number", label: "رقم الوثيقة", group: "الوثيقة" },
  { id: "policy_type", label: "نوع الوثيقة", group: "الوثيقة" },
  { id: "policy_start_date", label: "تاريخ بداية الوثيقة", group: "الوثيقة" },
  { id: "policy_end_date", label: "تاريخ نهاية الوثيقة", group: "الوثيقة" },
  { id: "company_name", label: "اسم شركة التأمين", group: "الوثيقة" },
  
  { id: "client_name", label: "اسم المؤمن له", group: "المؤمن له" },
  { id: "client_id_number", label: "رقم هوية المؤمن له", group: "المؤمن له" },
  { id: "client_phone", label: "هاتف المؤمن له", group: "المؤمن له" },
  
  { id: "car_number", label: "رقم السيارة", group: "المركبة" },
  { id: "car_manufacturer", label: "الشركة المصنعة", group: "المركبة" },
  { id: "car_model", label: "موديل السيارة", group: "المركبة" },
  { id: "car_year", label: "سنة الصنع", group: "المركبة" },
  { id: "car_color", label: "لون السيارة", group: "المركبة" },
  
  { id: "accident_date", label: "تاريخ الحادث", group: "الحادث" },
  { id: "accident_time", label: "وقت الحادث", group: "الحادث" },
  { id: "accident_location", label: "موقع الحادث", group: "الحادث" },
  { id: "accident_description", label: "وصف الحادث", group: "الحادث" },
  
  { id: "driver_name", label: "اسم السائق", group: "السائق" },
  { id: "driver_id_number", label: "رقم هوية السائق", group: "السائق" },
  { id: "driver_phone", label: "هاتف السائق", group: "السائق" },
  { id: "driver_license_number", label: "رقم رخصة السائق", group: "السائق" },
  
  { id: "police_reported", label: "تم التبليغ للشرطة", group: "الشرطة" },
  { id: "police_station", label: "مخفر الشرطة", group: "الشرطة" },
  { id: "police_report_number", label: "رقم المحضر", group: "الشرطة" },
  
  { id: "third_party_1_name", label: "اسم الطرف الثالث 1", group: "الطرف الثالث" },
  { id: "third_party_1_id", label: "هوية الطرف الثالث 1", group: "الطرف الثالث" },
  { id: "third_party_1_phone", label: "هاتف الطرف الثالث 1", group: "الطرف الثالث" },
  { id: "third_party_1_car_number", label: "رقم سيارة الطرف الثالث 1", group: "الطرف الثالث" },
  { id: "third_party_1_insurance", label: "تأمين الطرف الثالث 1", group: "الطرف الثالث" },
];

interface FieldMapping {
  page: number;
  x: number;
  y: number;
  size: number;
  type: "text" | "checkbox" | "image";
}

interface MappingJson {
  [fieldId: string]: FieldMapping;
}

export default function AccidentTemplateMapper() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<{ name: string; name_ar: string | null } | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [mappingJson, setMappingJson] = useState<MappingJson>({});

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [pdfImages, setPdfImages] = useState<string[]>([]);

  // Fetch company and template
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;

      setLoading(true);
      try {
        // Fetch company
        const { data: companyData } = await supabase
          .from("insurance_companies")
          .select("name, name_ar")
          .eq("id", companyId)
          .single();

        if (companyData) setCompany(companyData);

        // Fetch template
        const { data: templateData } = await supabase
          .from("company_accident_templates")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .maybeSingle();

        if (templateData) {
          setTemplateId(templateData.id);
          setTemplateUrl(templateData.template_pdf_url);
          const jsonData = templateData.mapping_json;
          if (jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
            setMappingJson(jsonData as unknown as MappingJson);
          }
        }
      } catch (error) {
        console.error("Error fetching template:", error);
        toast({ title: "خطأ", description: "فشل في تحميل القالب", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, toast]);

  // Handle canvas click for field placement
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedField) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    setMappingJson(prev => ({
      ...prev,
      [selectedField]: {
        page: currentPage,
        x: Math.round(x),
        y: Math.round(y),
        size: 11,
        type: "text",
      },
    }));

    toast({
      title: "تم تعيين الحقل",
      description: `تم تحديد موقع "${CANONICAL_FIELDS.find(f => f.id === selectedField)?.label}"`,
    });

    setSelectedField(null);
  }, [selectedField, currentPage, zoom, toast]);

  const removeFieldMapping = (fieldId: string) => {
    setMappingJson(prev => {
      const newMapping = { ...prev };
      delete newMapping[fieldId];
      return newMapping;
    });
  };

  const handleSave = async () => {
    if (!templateId) {
      toast({ title: "خطأ", description: "لا يوجد قالب للحفظ", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("company_accident_templates")
        .update({ mapping_json: JSON.parse(JSON.stringify(mappingJson)) })
        .eq("id", templateId);

      if (error) throw error;

      toast({ title: "تم الحفظ", description: "تم حفظ تعيين الحقول بنجاح" });
    } catch (error: any) {
      console.error("Error saving mapping:", error);
      toast({ title: "خطأ", description: "فشل في حفظ التعيين", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Group fields by category
  const fieldsByGroup = CANONICAL_FIELDS.reduce((acc, field) => {
    if (!acc[field.group]) acc[field.group] = [];
    acc[field.group].push(field);
    return acc;
  }, {} as Record<string, typeof CANONICAL_FIELDS>);

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 space-y-6" dir="rtl">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-[600px]" />
            <Skeleton className="h-[600px] col-span-2" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!templateUrl) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4" dir="rtl">
          <FileText className="h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold">لا يوجد قالب PDF</h2>
          <p className="text-muted-foreground">يرجى رفع قالب PDF أولاً من صفحة الشركة</p>
          <Button onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="h-[calc(100vh-80px)] flex flex-col" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">تعيين حقول القالب</h1>
              <p className="text-sm text-muted-foreground">
                {company?.name_ar || company?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="secondary">
              {Object.keys(mappingJson).length} حقل معيّن
            </Badge>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Save className="h-4 w-4 ml-2" />
              )}
              حفظ التعيين
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Fields Panel */}
          <div className="w-80 border-l bg-muted/30 flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-medium mb-2">الحقول المتاحة</h3>
              <p className="text-xs text-muted-foreground">
                اختر حقلاً ثم انقر على موقعه في PDF
              </p>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {Object.entries(fieldsByGroup).map(([group, fields]) => (
                  <div key={group}>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      {group}
                    </h4>
                    <div className="space-y-1">
                      {fields.map((field) => {
                        const isMapped = !!mappingJson[field.id];
                        const isSelected = selectedField === field.id;

                        return (
                          <div
                            key={field.id}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : isMapped
                                ? "bg-green-500/10 hover:bg-green-500/20"
                                : "bg-background hover:bg-muted"
                            }`}
                            onClick={() => setSelectedField(isSelected ? null : field.id)}
                          >
                            <div className="flex items-center gap-2">
                              {isMapped && !isSelected && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                              {isSelected && (
                                <MousePointer className="h-4 w-4" />
                              )}
                              <span className="text-sm">{field.label}</span>
                            </div>
                            {isMapped && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFieldMapping(field.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* PDF Preview */}
          <div className="flex-1 flex flex-col bg-muted/50">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-3 border-b bg-background">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[80px] text-center">
                  صفحة {currentPage + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[50px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setZoom(z => Math.min(2, z + 0.25))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Canvas Area */}
            <div
              ref={containerRef}
              className="flex-1 overflow-auto p-4 flex items-start justify-center"
            >
              <div
                className="relative bg-white shadow-lg"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                }}
              >
                {/* PDF Preview - iframe for now */}
                <iframe
                  src={templateUrl}
                  className="w-[800px] h-[1100px] border-0"
                  title="PDF Preview"
                />

                {/* Overlay for field markers */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ cursor: selectedField ? "crosshair" : "default" }}
                >
                  {Object.entries(mappingJson)
                    .filter(([_, mapping]) => mapping.page === currentPage)
                    .map(([fieldId, mapping]) => {
                      const field = CANONICAL_FIELDS.find(f => f.id === fieldId);
                      return (
                        <div
                          key={fieldId}
                          className="absolute bg-primary/80 text-primary-foreground text-xs px-1 rounded shadow"
                          style={{
                            left: mapping.x,
                            top: mapping.y,
                            fontSize: mapping.size,
                          }}
                        >
                          {field?.label || fieldId}
                        </div>
                      );
                    })}
                </div>

                {/* Click overlay when selecting field */}
                {selectedField && (
                  <div
                    className="absolute inset-0 cursor-crosshair"
                    onClick={handleCanvasClick}
                  />
                )}
              </div>
            </div>

            {/* Status Bar */}
            {selectedField && (
              <div className="p-3 border-t bg-primary/10 text-sm text-center">
                <MousePointer className="h-4 w-4 inline ml-2" />
                انقر على PDF لتحديد موقع:{" "}
                <strong>
                  {CANONICAL_FIELDS.find(f => f.id === selectedField)?.label}
                </strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
