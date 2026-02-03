import { useMemo } from 'react';
import { Check, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CarRecord {
  id: string;
  car_number: string;
  manufacturer_name: string | null;
  model: string | null;
  year: number | null;
  car_type: string | null;
}

interface PolicyData {
  car: { id: string } | null;
  end_date: string;
  cancelled: boolean | null;
  transferred: boolean | null;
}

interface CarWithPolicyCount extends CarRecord {
  policyCount: number;
  activePolicyCount: number;
}

interface CarFilterChipsProps {
  cars: CarRecord[];
  policies: PolicyData[];
  selectedCarId: string;
  onSelect: (carId: string) => void;
}

// Removed - no longer using car type labels

export function CarFilterChips({ cars, policies, selectedCarId, onSelect }: CarFilterChipsProps) {
  const carsWithPolicyCounts = useMemo((): CarWithPolicyCount[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return cars.map(car => {
      const carPolicies = policies.filter(p => p.car?.id === car.id);
      const activePolicies = carPolicies.filter(p => 
        !p.cancelled && 
        !p.transferred && 
        new Date(p.end_date) >= today
      );
      return {
        ...car,
        policyCount: carPolicies.length,
        activePolicyCount: activePolicies.length,
      };
    });
  }, [cars, policies]);

  const { totalPolicies, totalActivePolicies } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const active = policies.filter(p => 
      !p.cancelled && 
      !p.transferred && 
      new Date(p.end_date) >= today
    ).length;
    
    return {
      totalPolicies: policies.length,
      totalActivePolicies: active,
    };
  }, [policies]);

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
    <div className="w-full overflow-x-auto pb-2" dir="rtl">
      <div className="flex items-center gap-3 min-w-max">
        {/* All Cars Card - First in RTL */}
        <button
          onClick={() => onSelect('all')}
          className={cn(
            "group relative flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 transition-all duration-300",
            selectedCarId === 'all'
              ? "border-primary bg-primary/10 shadow-md"
              : "border-border/50 bg-card/50 hover:border-primary/40 hover:bg-primary/5"
          )}
        >
          {selectedCarId === 'all' && (
            <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-200">
              <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
            </div>
          )}
          
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center transition-all",
            selectedCarId === 'all' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted text-muted-foreground"
          )}>
            <Car className="h-4 w-4" />
          </div>
          
          <div className="flex flex-col items-start">
            <span className={cn(
              "text-sm font-bold",
              selectedCarId === 'all' ? "text-primary" : "text-foreground"
            )}>
              كل السيارات
            </span>
            <span className="text-xs text-muted-foreground">
              <span className="text-success font-bold ltr-nums">{totalActivePolicies}</span>
              <span className="mx-1">سارية من</span>
              <span className="ltr-nums">{totalPolicies}</span>
            </span>
          </div>
        </button>

        {/* Divider */}
        <div className="h-16 w-px bg-gradient-to-b from-transparent via-border to-transparent mx-1" />

        {/* Car License Plates */}
        {carsWithPolicyCounts.map((car) => (
          <button
            key={car.id}
            onClick={() => onSelect(car.id)}
            className="group relative transition-all duration-300"
          >
            {/* Policy Count Badges - Top Left */}
            <div className="absolute -top-2 -left-2 z-20 flex items-center gap-0.5">
              {/* Active policies (green) */}
              {car.activePolicyCount > 0 && (
                <div className="h-5 w-5 rounded-full bg-success text-white text-[10px] font-bold flex items-center justify-center shadow-md border border-background">
                  <span className="ltr-nums">{car.activePolicyCount}</span>
                </div>
              )}
              {/* Total policies if different (grey, smaller) */}
              {car.policyCount > car.activePolicyCount && (
                <div className="h-4 w-4 rounded-full bg-muted text-muted-foreground text-[9px] font-bold flex items-center justify-center shadow border border-background -ml-1">
                  <span className="ltr-nums">{car.policyCount}</span>
                </div>
              )}
            </div>
            
            {/* Selection Check - Top Right */}
            {selectedCarId === car.id && (
              <div className="absolute -top-2 -right-2 z-20 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-200">
                <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
              </div>
            )}
            
            {/* License Plate Container */}
            <div className={cn(
              "relative rounded-lg overflow-hidden transition-all duration-300",
              selectedCarId === car.id 
                ? "ring-2 ring-primary ring-offset-1 ring-offset-background shadow-xl shadow-primary/20 scale-105" 
                : "shadow-md hover:shadow-lg hover:scale-102 ring-1 ring-black/10"
            )}>
              {/* Plate Body - Compact height */}
              <div className="relative flex items-stretch h-[54px]">
                {/* Yellow Section (Number) - Main part */}
                <div className="bg-gradient-to-b from-[#FFD700] via-[#F5C400] to-[#E6B800] px-4 flex flex-col items-center justify-center min-w-[130px] border-2 border-black/15 border-l-0 rounded-l-md">
                  {/* Car Number - Centered */}
                  <span 
                    className="text-black text-base font-black tracking-wide whitespace-nowrap"
                    dir="ltr"
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                  >
                    {formatPlateNumber(car.car_number)}
                  </span>
                  
                  {/* Manufacturer + Year - smaller */}
                  <div className="flex items-center gap-1 text-[9px] text-black/60 font-medium">
                    {car.manufacturer_name && (
                      <span className="bg-black/10 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                        {car.manufacturer_name}
                      </span>
                    )}
                    {car.year && (
                      <span className="ltr-nums">{car.year}</span>
                    )}
                  </div>
                </div>
                
                {/* Blue Section (IL) - Right side, compact */}
                <div className="bg-gradient-to-b from-[#0052CC] to-[#003D99] w-7 flex flex-col items-center justify-center gap-0 rounded-r-md border-2 border-black/15 border-r-0">
                  <span className="text-white text-[8px] leading-none">🇮🇱</span>
                  <span className="text-white text-[10px] font-bold leading-none">IL</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
