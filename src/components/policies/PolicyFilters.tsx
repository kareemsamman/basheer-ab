import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PolicyFiltersProps {
  onFiltersChange: (filters: PolicyFilterValues) => void;
  filters: PolicyFilterValues;
}

export interface PolicyFilterValues {
  policyType: string;
  companyId: string;
  status: string;
  brokerId: string;
  creatorId: string;
}

const POLICY_TYPES = [
  { value: "ELZAMI", label: "إلزامي" },
  { value: "THIRD_FULL", label: "ثالث/شامل" },
  { value: "ROAD_SERVICE", label: "خدمات الطريق" },
  { value: "ACCIDENT_FEE_EXEMPTION", label: "إعفاء رسوم حادث" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "نشطة" },
  { value: "expired", label: "منتهية" },
  { value: "cancelled", label: "ملغاة" },
  { value: "transferred", label: "محوّلة" },
];

export function PolicyFilters({ onFiltersChange, filters }: PolicyFiltersProps) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string; name_ar: string | null }[]>([]);
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [creators, setCreators] = useState<{ id: string; name: string }[]>([]);
  const [localFilters, setLocalFilters] = useState<PolicyFilterValues>(filters);

  useEffect(() => {
    const fetchData = async () => {
      const [companiesRes, brokersRes, creatorsRes] = await Promise.all([
        supabase.from('insurance_companies').select('id, name, name_ar').eq('active', true).order('name'),
        supabase.from('brokers').select('id, name').order('name'),
        supabase.from('profiles').select('id, full_name, email').eq('status', 'active'),
      ]);
      
      if (companiesRes.data) setCompanies(companiesRes.data);
      if (brokersRes.data) setBrokers(brokersRes.data);
      if (creatorsRes.data) setCreators(creatorsRes.data.map(p => ({ id: p.id, name: p.full_name || p.email })));
    };
    fetchData();
  }, []);

  const activeFiltersCount = Object.values(filters).filter(v => v && v !== 'all').length;

  const handleApply = () => {
    onFiltersChange(localFilters);
    setOpen(false);
  };

  const handleClear = () => {
    const cleared: PolicyFilterValues = {
      policyType: 'all',
      companyId: 'all',
      status: 'all',
      brokerId: 'all',
      creatorId: 'all',
    };
    setLocalFilters(cleared);
    onFiltersChange(cleared);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="h-4 w-4 ml-1" />
          <span className="hidden sm:inline">فلترة متقدمة</span>
          <span className="sm:hidden">فلترة</span>
          {activeFiltersCount > 0 && (
            <Badge className="absolute -top-2 -left-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end" dir="rtl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-right">فلترة متقدمة</h4>
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground h-8">
              <X className="h-3 w-3 ml-1" />
              مسح الكل
            </Button>
          </div>

          {/* Policy Type */}
          <div className="space-y-1.5">
            <Label className="text-right block text-sm">نوع الوثيقة</Label>
            <Select value={localFilters.policyType} onValueChange={v => setLocalFilters(f => ({ ...f, policyType: v }))}>
              <SelectTrigger className="h-9 text-right">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                {POLICY_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value} className="text-right">{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <Label className="text-right block text-sm">شركة التأمين</Label>
            <Select value={localFilters.companyId} onValueChange={v => setLocalFilters(f => ({ ...f, companyId: v }))}>
              <SelectTrigger className="h-9 text-right">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-right">{c.name_ar || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-right block text-sm">الحالة</Label>
            <Select value={localFilters.status} onValueChange={v => setLocalFilters(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9 text-right">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value} className="text-right">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Broker */}
          <div className="space-y-1.5">
            <Label className="text-right block text-sm">الوسيط</Label>
            <Select value={localFilters.brokerId} onValueChange={v => setLocalFilters(f => ({ ...f, brokerId: v }))}>
              <SelectTrigger className="h-9 text-right">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                {brokers.map(b => (
                  <SelectItem key={b.id} value={b.id} className="text-right">{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Creator */}
          <div className="space-y-1.5">
            <Label className="text-right block text-sm">أنشئ بواسطة</Label>
            <Select value={localFilters.creatorId} onValueChange={v => setLocalFilters(f => ({ ...f, creatorId: v }))}>
              <SelectTrigger className="h-9 text-right">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                {creators.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-right">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={handleApply}>
            تطبيق الفلترة
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
