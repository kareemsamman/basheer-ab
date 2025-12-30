import { useMemo } from 'react';
import { Car as CarIcon, Check, FileText } from 'lucide-react';
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

  // Format car number with dashes for display (XX-XXX-XX format)
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
    <div className="w-full overflow-x-auto pb-3">
      <div className="flex items-center gap-4 min-w-max px-1 justify-end">
        {/* All Cars - Special Card */}
        <button
          onClick={() => onSelect('all')}
          className={cn(
            "group relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all duration-300 min-w-[100px]",
            selectedCarId === 'all'
              ? "border-primary bg-gradient-to-br from-primary/15 to-primary/5 shadow-lg shadow-primary/20 scale-105"
              : "border-border bg-card hover:border-primary/50 hover:shadow-md"
          )}
        >
          {selectedCarId === 'all' && (
            <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-md">
              <Check className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
          )}
          
          <div className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center transition-all",
            selectedCarId === 'all' 
              ? "bg-primary text-primary-foreground shadow-md" 
              : "bg-muted text-muted-foreground"
          )}>
            <FileText className="h-6 w-6" />
          </div>
          
          <span className={cn(
            "text-sm font-bold",
            selectedCarId === 'all' ? "text-primary" : "text-foreground"
          )}>
            الكل
          </span>
          
          <div className={cn(
            "px-3 py-1 rounded-full text-sm font-bold",
            selectedCarId === 'all' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted text-muted-foreground"
          )}>
            {totalPolicies}
          </div>
        </button>

        {/* Divider */}
        <div className="h-20 w-px bg-gradient-to-b from-transparent via-border to-transparent" />

        {/* Car License Plates */}
        {carsWithPolicyCounts.map((car) => (
          <button
            key={car.id}
            onClick={() => onSelect(car.id)}
            className={cn(
              "group relative transition-all duration-300",
              selectedCarId === car.id ? "scale-105" : "hover:scale-102"
            )}
          >
            {/* Selection Check */}
            {selectedCarId === car.id && (
              <div className="absolute -top-2 -right-2 z-20 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                <Check className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
            )}
            
            {/* License Plate Design */}
            <div className={cn(
              "relative rounded-lg overflow-hidden shadow-lg transition-all",
              selectedCarId === car.id 
                ? "shadow-xl shadow-primary/30 ring-2 ring-primary ring-offset-2" 
                : "hover:shadow-xl"
            )}>
              {/* Plate Body */}
              <div className="relative flex items-stretch">
                {/* Blue Section (IL) */}
                <div className="bg-[#0038b8] px-2 py-3 flex flex-col items-center justify-center gap-0.5 min-w-[32px]">
                  <span className="text-white text-[8px] font-bold leading-none">🇮🇱</span>
                  <span className="text-white text-[10px] font-bold leading-none">IL</span>
                </div>
                
                {/* Yellow Section (Number) */}
                <div className="bg-gradient-to-b from-[#FFD700] to-[#E6C200] px-4 py-3 min-w-[140px] flex flex-col items-center justify-center border-2 border-black/20 border-l-0">
                  {/* Car Number */}
                  <span className="text-black text-lg font-black font-mono tracking-wider ltr-nums whitespace-nowrap">
                    {formatPlateNumber(car.car_number)}
                  </span>
                  
                  {/* Model & Year */}
                  {(car.model || car.year) && (
                    <span className="text-black/60 text-[9px] font-medium mt-0.5 truncate max-w-[120px]">
                      {[car.model, car.year].filter(Boolean).join(' • ')}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Policy Count Badge */}
              <div className={cn(
                "absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold shadow-md whitespace-nowrap",
                car.policyCount > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {car.policyCount} وثيقة
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
