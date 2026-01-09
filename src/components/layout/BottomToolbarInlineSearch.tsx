import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, X, User, Car, Phone } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ClientResult {
  id: string;
  full_name: string;
  id_number: string;
  phone_number: string | null;
  cars: string[];
}

interface BottomToolbarInlineSearchProps {
  className?: string;
}

export function BottomToolbarInlineSearch({ className }: BottomToolbarInlineSearchProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ClientResult[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const latestRequestRef = useRef(0);

  const canShow = location.pathname !== "/login" && location.pathname !== "/no-access";

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setLoading(false);
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const requestId = Date.now();
    latestRequestRef.current = requestId;

    setLoading(true);
    try {
      const searchTerm = term.trim();

      const [clientsRes, carsRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, full_name, id_number, phone_number")
          .is("deleted_at", null)
          .or(
            `full_name.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%,id_number.ilike.%${searchTerm}%,file_number.ilike.%${searchTerm}%`,
          )
          .limit(10),
        supabase
          .from("cars")
          .select("client_id, car_number, clients(id, full_name, id_number, phone_number)")
          .is("deleted_at", null)
          .ilike("car_number", `%${searchTerm}%`)
          .limit(10),
      ]);

      if (latestRequestRef.current !== requestId) return;

      if (clientsRes.error) throw clientsRes.error;
      if (carsRes.error) throw carsRes.error;

      const map = new Map<string, ClientResult>();

      for (const c of clientsRes.data || []) {
        map.set(c.id, {
          id: c.id,
          full_name: c.full_name,
          id_number: c.id_number,
          phone_number: c.phone_number,
          cars: [],
        });
      }

      for (const row of carsRes.data || []) {
        const client = (row as any).clients as {
          id: string;
          full_name: string;
          id_number: string;
          phone_number: string | null;
        } | null;
        if (!client) continue;

        if (!map.has(client.id)) {
          map.set(client.id, {
            id: client.id,
            full_name: client.full_name,
            id_number: client.id_number,
            phone_number: client.phone_number,
            cars: [],
          });
        }
      }

      const clientIds = Array.from(map.keys());

      if (clientIds.length) {
        const { data: allCars, error: allCarsError } = await supabase
          .from("cars")
          .select("client_id, car_number")
          .is("deleted_at", null)
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
          .limit(60);

        if (allCarsError) throw allCarsError;

        for (const car of allCars || []) {
          const entry = map.get(car.client_id);
          if (!entry) continue;
          if (entry.cars.length >= 3) continue;
          if (!entry.cars.includes(car.car_number)) entry.cars.push(car.car_number);
        }
      }

      setResults(Array.from(map.values()).slice(0, 10));
    } catch (e) {
      console.error("Inline search error:", e);
      setResults([]);
    } finally {
      if (latestRequestRef.current === requestId) setLoading(false);
    }
  }, []);

  // Debounce
  useEffect(() => {
    if (!open) return;

    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const t = setTimeout(() => runSearch(term), 250);
    return () => clearTimeout(t);
  }, [open, query, runSearch]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const popoverOpen = useMemo(() => open && (loading || results.length > 0 || query.trim().length >= 2), [open, loading, results.length, query]);

  const handleSelect = (clientId: string) => {
    close();
    navigate(`/clients?open=${clientId}`);
  };

  if (!canShow) return null;

  return (
    <Popover open={popoverOpen} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <div className={cn("flex items-center", className)}>
        {!open ? (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-9 w-9"
            onClick={() => setOpen(true)}
            aria-label="بحث"
          >
            <Search className="h-4 w-4" />
          </Button>
        ) : (
          <PopoverTrigger asChild>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="بحث سريع..."
                  className={cn(
                    "h-9 w-[180px] sm:w-[240px] rounded-full pr-10",
                    "bg-background/70"
                  )}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full"
                  onClick={close}
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </PopoverTrigger>
        )}
      </div>

      <PopoverContent
        side="top"
        align="center"
        sideOffset={12}
        className="w-[min(92vw,420px)] p-2"
      >
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border/60 p-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-56" />
              </div>
            ))}
          </div>
        ) : results.length ? (
          <div className="max-h-[320px] overflow-y-auto space-y-1">
            {results.map((r) => (
              <button
                key={r.id}
                className={cn(
                  "w-full text-right rounded-md border border-border/60 p-2 transition-colors",
                  "hover:bg-accent/40 focus:bg-accent/40 focus:outline-none"
                )}
                onClick={() => handleSelect(r.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium truncate">{r.full_name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {r.phone_number ? (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          <bdi className="ltr-nums">{r.phone_number}</bdi>
                        </span>
                      ) : null}
                      {r.cars.length ? (
                        <span className="flex items-center gap-1">
                          <Car className="h-3.5 w-3.5" />
                          <bdi className="ltr-nums">{r.cars.join(", ")}</bdi>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground ltr-nums">{r.id_number}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            اكتب حرفين على الأقل للبحث
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
