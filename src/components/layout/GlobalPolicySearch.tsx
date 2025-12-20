import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Search, Hash, User, Car, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  policy_number: string | null;
  policy_type_parent: string;
  insurance_price: number;
  start_date: string;
  end_date: string;
  clients: {
    id: string;
    full_name: string;
  };
  cars: {
    car_number: string;
  } | null;
}

const policyTypeLabels: Record<string, string> = {
  ELZAMI: "إلزامي",
  THIRD_FULL: "ثالث/شامل",
  ROAD_SERVICE: "خدمات الطريق",
  ACCIDENT_FEE_EXEMPTION: "إعفاء رسوم حادث",
  HEALTH: "صحي",
  LIFE: "حياة",
  PROPERTY: "ممتلكات",
  TRAVEL: "سفر",
  BUSINESS: "أعمال",
  OTHER: "أخرى",
};

interface GlobalPolicySearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPolicy?: (policyId: string) => void;
}

export function GlobalPolicySearch({ open, onOpenChange, onSelectPolicy }: GlobalPolicySearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  }, [open]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      // Search by policy_number, client name, or car number
      const { data, error } = await supabase
        .from("policies")
        .select(`
          id,
          policy_number,
          policy_type_parent,
          insurance_price,
          start_date,
          end_date,
          clients(id, full_name),
          cars(car_number)
        `)
        .is("deleted_at", null)
        .or(`policy_number.ilike.%${query}%,clients.full_name.ilike.%${query}%,cars.car_number.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Debounced search
  useEffect(() => {
    if (query.length >= 2) {
      const timer = setTimeout(handleSearch, 300);
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setSearched(false);
    }
  }, [query, handleSearch]);

  const handleSelectPolicy = (policyId: string) => {
    onOpenChange(false);
    if (onSelectPolicy) {
      onSelectPolicy(policyId);
    } else {
      // Navigate to policies page with the selected policy
      navigate(`/policies?open=${policyId}`);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            بحث سريع عن وثيقة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="رقم البوليصة، اسم العميل، أو رقم السيارة..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="pr-10"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))
            ) : results.length > 0 ? (
              results.map((result) => (
                <button
                  key={result.id}
                  className={cn(
                    "w-full text-right p-3 border rounded-lg transition-colors",
                    "hover:bg-secondary/50 focus:bg-secondary/50 focus:outline-none"
                  )}
                  onClick={() => handleSelectPolicy(result.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">
                          {result.clients?.full_name || "—"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {result.policy_number && (
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            <span dir="ltr" className="font-mono">{result.policy_number}</span>
                          </span>
                        )}
                        {result.cars?.car_number && (
                          <span className="flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            <span dir="ltr" className="font-mono">{result.cars.car_number}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDate(result.start_date)} - {formatDate(result.end_date)}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {policyTypeLabels[result.policy_type_parent] || result.policy_type_parent}
                    </Badge>
                  </div>
                </button>
              ))
            ) : searched ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>لا توجد نتائج</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>ابدأ بالكتابة للبحث...</p>
              </div>
            )}
          </div>

          {/* Hint */}
          <p className="text-xs text-muted-foreground text-center">
            يمكنك البحث برقم البوليصة، اسم العميل، أو رقم السيارة
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
