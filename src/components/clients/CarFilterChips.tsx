import { useMemo } from 'react';
import { Check, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CarRecord {
  id: string;
  car_number: string;
  manufacturer_name: string | null;
  model: string | null;
  year: number | null;
}

interface CarWithPolicyCount extends CarRecord {
  policyCount: number;
}

interface CarFilterChipsProps {
  cars: CarRecord[];
  policies: { car: { id: string } | null }[];
  selectedCarId: string;
  onSelect: (carId: string) => void;
}

export function CarFilterChips({ cars, policies, selectedCarId, onSelect }: CarFilterChipsProps) {
  const carsWithPolicyCounts = useMemo((): CarWithPolicyCount[] => {
    return cars.map(car => ({
      ...car,
      policyCount: policies.filter(p => p.car?.id === car.id).length,
    }));
  }, [cars, policies]);

  const totalPolicies = policies.length;

  if (cars.length === 0) {
    return null;
  }

  // Format car number with dashes for display (XX-XXX-XX or XXX-XX-XXX format)
  const formatPlateNumber = (num: string) => {
    const clean = num.replace(/[^0-9]/g, '');
    if (clean.length === 7) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 7)}`;
    } else if (clean.length === 8) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5, 8)}`;
    }
    return num;
  };

  return (
    <div className="w-full overflow-x-auto pb-4" dir="rtl">
      <div className="flex items-center gap-4 min-w-max">
        {/* All Cars Card - First in RTL */}
        <button
          onClick={() => onSelect('all')}
          className={cn(
            "group relative flex flex-col items-center justify-center gap-3 px-6 py-4 rounded-2xl border-2 transition-all duration-300 min-w-[110px]",
            selectedCarId === 'all'
              ? "border-primary bg-gradient-to-b from-primary/10 to-primary/5 shadow-lg shadow-primary/15"
              : "border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/40 hover:bg-primary/5 hover:shadow-md"
          )}
        >
          {selectedCarId === 'all' && (
            <div className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-200">
              <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
            </div>
          )}
          
          <div className={cn(
            "h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300",
            selectedCarId === 'all' 
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" 
              : "bg-muted/80 text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
          )}>
            <Car className="h-7 w-7" />
          </div>
          
          <span className={cn(
            "text-base font-bold transition-colors",
            selectedCarId === 'all' ? "text-primary" : "text-foreground"
          )}>
            الكل
          </span>
          
          <div className={cn(
            "px-4 py-1.5 rounded-full text-sm font-bold transition-all",
            selectedCarId === 'all' 
              ? "bg-primary text-primary-foreground shadow-sm" 
              : "bg-muted/80 text-muted-foreground"
          )}>
            <span className="ltr-nums">{totalPolicies}</span> وثيقة
          </div>
        </button>

        {/* Divider */}
        <div className="h-24 w-px bg-gradient-to-b from-transparent via-border to-transparent mx-2" />

        {/* Car License Plates */}
        {carsWithPolicyCounts.map((car) => (
          <button
            key={car.id}
            onClick={() => onSelect(car.id)}
            className="group relative transition-all duration-300"
          >
            {/* Selection Check */}
            {selectedCarId === car.id && (
              <div className="absolute -top-2 -left-2 z-20 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-200">
                <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
              </div>
            )}
            
            {/* License Plate Container */}
            <div className={cn(
              "relative rounded-xl overflow-hidden transition-all duration-300",
              selectedCarId === car.id 
                ? "ring-3 ring-primary ring-offset-2 ring-offset-background shadow-xl shadow-primary/25 scale-105" 
                : "shadow-lg hover:shadow-xl hover:scale-102 ring-1 ring-black/10"
            )}>
              {/* Plate Body - Proper Israeli plate layout */}
              <div className="relative flex items-stretch h-[72px]">
                {/* Yellow Section (Number) - Main part */}
                <div className="bg-gradient-to-b from-[#FFD700] via-[#F5C400] to-[#E6B800] px-5 flex flex-col items-center justify-center min-w-[160px] border-2 border-black/20 border-l-0 rounded-l-lg">
                  {/* Car Number - Centered */}
                  <span 
                    className="text-black text-xl font-black tracking-wide whitespace-nowrap"
                    dir="ltr"
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                  >
                    {formatPlateNumber(car.car_number)}
                  </span>
                  
                  {/* Model & Year */}
                  {(car.model || car.year) && (
                    <span className="text-black/50 text-[10px] font-semibold mt-0.5 truncate max-w-[140px]">
                      {[car.model, car.year].filter(Boolean).join(' • ')}
                    </span>
                  )}
                </div>
                
                {/* Blue Section (IL) - Right side */}
                <div className="bg-gradient-to-b from-[#0052CC] to-[#003D99] w-9 flex flex-col items-center justify-center gap-0.5 rounded-r-lg border-2 border-black/20 border-r-0">
                  <span className="text-white text-[10px] leading-none">🇮🇱</span>
                  <span className="text-white text-xs font-bold leading-none tracking-tight">IL</span>
                </div>
              </div>
              
              {/* Policy Count Badge - Floating below */}
              <div className={cn(
                "absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold shadow-lg whitespace-nowrap border-2 border-background",
                car.policyCount > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                <span className="ltr-nums">{car.policyCount}</span> وثيقة
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
