import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Phone,
  Car,
  Calendar,
  DollarSign,
  MessageSquare,
  User,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ClickablePhone } from "@/components/shared/ClickablePhone";

interface Lead {
  id: string;
  phone: string;
  customer_name: string | null;
  car_number: string | null;
  car_manufacturer: string | null;
  car_model: string | null;
  car_year: string | null;
  car_color: string | null;
  insurance_types: string[] | null;
  driver_over_24: boolean | null;
  has_accidents: boolean | null;
  total_price: number | null;
  status: string;
  notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadDetailsDrawerProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusOptions = [
  { value: "new", label: "جديد", color: "bg-blue-500" },
  { value: "contacted", label: "تم التواصل", color: "bg-yellow-500" },
  { value: "converted", label: "تم التحويل", color: "bg-green-500" },
  { value: "rejected", label: "مرفوض", color: "bg-red-500" },
];

export function LeadDetailsDrawer({
  lead,
  open,
  onOpenChange,
}: LeadDetailsDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState(lead?.status || "new");

  // Update status when lead changes
  useState(() => {
    if (lead) {
      setSelectedStatus(lead.status);
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus })
        .eq("id", lead!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "تم تحديث الحالة",
        description: "تم تحديث حالة العميل المحتمل بنجاح",
      });
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: "فشل تحديث الحالة: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    updateStatusMutation.mutate(newStatus);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = statusOptions.find((s) => s.value === status);
    return (
      <Badge
        variant="outline"
        className={`${statusConfig?.color} text-white border-0`}
      >
        {statusConfig?.label || status}
      </Badge>
    );
  };

  if (!lead) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-xl">
                {lead.customer_name || "عميل محتمل"}
              </DrawerTitle>
              <DrawerDescription className="flex items-center gap-2 mt-1">
                <MessageSquare className="h-4 w-4" />
                {lead.source || "whatsapp"}
                <span className="text-muted-foreground">•</span>
                {format(new Date(lead.created_at), "PPP", { locale: ar })}
              </DrawerDescription>
            </div>
            {getStatusBadge(lead.status)}
          </div>
        </DrawerHeader>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Status Selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">تغيير الحالة:</span>
            <Select
              value={selectedStatus}
              onValueChange={handleStatusChange}
              disabled={updateStatusMutation.isPending}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {updateStatusMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </div>

          {/* Customer Info */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <User className="h-4 w-4" />
              بيانات العميل
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">الاسم:</span>
                <p className="font-medium">{lead.customer_name || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">الهاتف:</span>
                <p className="font-medium">
                  <ClickablePhone phone={lead.phone} />
                </p>
              </div>
            </div>
          </div>

          {/* Car Info */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Car className="h-4 w-4" />
              بيانات السيارة
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">رقم السيارة:</span>
                <p className="font-medium">{lead.car_number || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">الشركة المصنعة:</span>
                <p className="font-medium">{lead.car_manufacturer || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">الموديل:</span>
                <p className="font-medium">{lead.car_model || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">سنة الصنع:</span>
                <p className="font-medium">{lead.car_year || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">اللون:</span>
                <p className="font-medium">{lead.car_color || "-"}</p>
              </div>
            </div>
          </div>

          {/* Insurance Info */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" />
              معلومات التأمين
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">أنواع التأمين المطلوبة:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {lead.insurance_types && lead.insurance_types.length > 0 ? (
                    lead.insurance_types.map((type, idx) => (
                      <Badge key={idx} variant="secondary">
                        {type}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">السائق فوق 24:</span>
                  {lead.driver_over_24 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">حوادث سابقة:</span>
                  {lead.has_accidents ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Price */}
          {lead.total_price && (
            <div className="bg-primary/10 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  السعر المقترح
                </span>
                <span className="text-2xl font-bold text-primary">
                  ₪{lead.total_price.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">ملاحظات</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {lead.notes}
              </p>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              تم الإنشاء: {format(new Date(lead.created_at), "Pp", { locale: ar })}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              آخر تحديث: {format(new Date(lead.updated_at), "Pp", { locale: ar })}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
