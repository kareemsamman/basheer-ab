import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Route, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PackageAddon, Company, RoadService, AccidentFeeService } from "./types";

interface PackageAddonsSectionProps {
  addons: PackageAddon[];
  onAddonsChange: (addons: PackageAddon[]) => void;
  roadServices: RoadService[];
  accidentFeeServices: AccidentFeeService[];
  roadServiceCompanies: Company[];
  accidentFeeCompanies: Company[];
  carType?: string;
  disabled?: boolean;
  errors?: Record<string, string>;
}

export function PackageAddonsSection({
  addons,
  onAddonsChange,
  roadServices,
  accidentFeeServices,
  roadServiceCompanies,
  accidentFeeCompanies,
  carType,
  disabled,
  errors = {},
}: PackageAddonsSectionProps) {
  const roadServiceAddon = addons[0];
  const accidentFeeAddon = addons[1];

  const updateAddon = (index: number, updates: Partial<PackageAddon>) => {
    const newAddons = [...addons];
    newAddons[index] = { ...newAddons[index], ...updates };
    onAddonsChange(newAddons);
  };

  // Filter road services by car type
  const filteredRoadServices = carType
    ? roadServices.filter(rs => rs.allowed_car_types?.includes(carType))
    : roadServices;

  return (
    <Card className="p-4 border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex items-center gap-2 mb-4">
        <Package className="h-5 w-5 text-primary" />
        <h4 className="font-semibold">إضافات الباقة</h4>
      </div>

      <div className="space-y-4">
        {/* Road Service Addon */}
        <div className={cn(
          "p-3 rounded-lg border transition-all",
          roadServiceAddon.enabled ? "bg-orange-500/5 border-orange-500/30" : "bg-muted/30"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-orange-600" />
              <span className="font-medium text-sm">خدمات الطريق</span>
            </div>
            <Switch
              checked={roadServiceAddon.enabled}
              onCheckedChange={(checked) => updateAddon(0, { enabled: checked })}
              disabled={disabled}
            />
          </div>

          {roadServiceAddon.enabled && (
            <div className="grid gap-3 sm:grid-cols-3 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نوع الخدمة</Label>
                <Select
                  value={roadServiceAddon.road_service_id}
                  onValueChange={(v) => updateAddon(0, { road_service_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_road_service && "border-destructive")}>
                    <SelectValue placeholder="اختر الخدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRoadServices.map(rs => (
                      <SelectItem key={rs.id} value={rs.id}>
                        {rs.name_ar || rs.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_road_service && (
                  <p className="text-xs text-destructive">{errors.addon_road_service}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">الشركة</Label>
                <Select
                  value={roadServiceAddon.company_id}
                  onValueChange={(v) => updateAddon(0, { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_road_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {roadServiceCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_ar || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_road_company && (
                  <p className="text-xs text-destructive">{errors.addon_road_company}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">السعر</Label>
                <Input
                  type="number"
                  value={roadServiceAddon.insurance_price}
                  onChange={(e) => updateAddon(0, { insurance_price: e.target.value })}
                  placeholder="₪"
                  className={cn("h-9", errors.addon_road_price && "border-destructive")}
                  disabled={disabled}
                />
                {errors.addon_road_price && (
                  <p className="text-xs text-destructive">{errors.addon_road_price}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Accident Fee Addon */}
        <div className={cn(
          "p-3 rounded-lg border transition-all",
          accidentFeeAddon.enabled ? "bg-emerald-500/5 border-emerald-500/30" : "bg-muted/30"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-600" />
              <span className="font-medium text-sm">إعفاء رسوم حادث</span>
            </div>
            <Switch
              checked={accidentFeeAddon.enabled}
              onCheckedChange={(checked) => updateAddon(1, { enabled: checked })}
              disabled={disabled}
            />
          </div>

          {accidentFeeAddon.enabled && (
            <div className="grid gap-3 sm:grid-cols-3 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نوع الخدمة</Label>
                <Select
                  value={accidentFeeAddon.accident_fee_service_id}
                  onValueChange={(v) => updateAddon(1, { accident_fee_service_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_accident_service && "border-destructive")}>
                    <SelectValue placeholder="اختر الخدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {accidentFeeServices.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name_ar || s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_accident_service && (
                  <p className="text-xs text-destructive">{errors.addon_accident_service}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">الشركة</Label>
                <Select
                  value={accidentFeeAddon.company_id}
                  onValueChange={(v) => updateAddon(1, { company_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger className={cn("h-9", errors.addon_accident_company && "border-destructive")}>
                    <SelectValue placeholder="اختر الشركة" />
                  </SelectTrigger>
                  <SelectContent>
                    {accidentFeeCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_ar || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.addon_accident_company && (
                  <p className="text-xs text-destructive">{errors.addon_accident_company}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">السعر</Label>
                <Input
                  type="number"
                  value={accidentFeeAddon.insurance_price}
                  onChange={(e) => updateAddon(1, { insurance_price: e.target.value })}
                  placeholder="₪"
                  className={cn("h-9", errors.addon_accident_price && "border-destructive")}
                  disabled={disabled}
                />
                {errors.addon_accident_price && (
                  <p className="text-xs text-destructive">{errors.addon_accident_price}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
