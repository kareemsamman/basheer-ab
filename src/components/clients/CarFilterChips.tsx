import { useState, useMemo } from 'react';
import { Car as CarIcon, Check } from 'lucide-react';
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
  activePolicyCount: number;
}

interface CarFilterChipsProps {
  cars: CarRecord[];
  policies: { car: { id: string } | null }[];
  selectedCarId: string;
  onSelect: (carId: string) => void;
}

export function CarFilterChips({ cars, policies, selectedCarId, onSelect }: CarFilterChipsProps) {
  // Calculate policy count for each car
  const carsWithPolicyCounts = useMemo((): CarWithPolicyCount[] => {
    return cars.map(car => {
      const carPolicies = policies.filter(p => p.car?.id === car.id);
      const activePolicies = carPolicies.filter(p => {
        // This is a simplified check - you may need to enhance this
        return true; // Count all for now
      });
      return {
        ...car,
        policyCount: carPolicies.length,
        activePolicyCount: carPolicies.length,
      };
    });
  }, [cars, policies]);

  // Total policies (including those without cars)
  const totalPolicies = policies.length;
  const policiesWithCars = policies.filter(p => p.car?.id).length;
  const policiesWithoutCars = totalPolicies - policiesWithCars;

  if (cars.length === 0) {
    return null;
  }

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex items-center gap-3 min-w-max px-1">
        {/* All Cars Chip */}
        <button
          onClick={() => onSelect('all')}
          className={cn(
            "group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 min-w-[100px]",
            selectedCarId === 'all'
              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
              : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
          )}
        >
          {/* Selection Indicator */}
          {selectedCarId === 'all' && (
            <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
          
          {/* Icon */}
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
            selectedCarId === 'all' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            <CarIcon className="h-5 w-5" />
          </div>
          
          {/* Label */}
          <span className={cn(
            "text-xs font-medium transition-colors",
            selectedCarId === 'all' ? "text-primary" : "text-muted-foreground"
          )}>
            الكل
          </span>
          
          {/* Count Badge */}
          <div className={cn(
            "px-2 py-0.5 rounded-full text-xs font-bold",
            selectedCarId === 'all' 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted text-muted-foreground"
          )}>
            {totalPolicies}
          </div>
        </button>

        {/* Divider */}
        <div className="h-16 w-px bg-border" />

        {/* Car Chips */}
        {carsWithPolicyCounts.map((car) => (
          <button
            key={car.id}
            onClick={() => onSelect(car.id)}
            className={cn(
              "group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 min-w-[100px]",
              selectedCarId === car.id
                ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            {/* Selection Indicator */}
            {selectedCarId === car.id && (
              <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            
            {/* Car Icon with Number */}
            <div className={cn(
              "relative h-10 w-10 rounded-lg flex items-center justify-center transition-colors overflow-hidden",
              selectedCarId === car.id ? "bg-primary" : "bg-muted"
            )}>
              <CarIcon className={cn(
                "h-5 w-5 transition-colors",
                selectedCarId === car.id ? "text-primary-foreground" : "text-muted-foreground"
              )} />
            </div>
            
            {/* Car Number - Main Focus */}
            <span className={cn(
              "text-sm font-bold font-mono ltr-nums transition-colors",
              selectedCarId === car.id ? "text-primary" : "text-foreground"
            )}>
              {car.car_number}
            </span>
            
            {/* Model & Year */}
            {(car.model || car.year) && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">
                {car.model && car.year ? `${car.model} ${car.year}` : car.model || car.year}
              </span>
            )}
            
            {/* Policy Count Badge */}
            <div className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold",
              car.policyCount > 0
                ? selectedCarId === car.id 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-success/20 text-success"
                : "bg-muted text-muted-foreground"
            )}>
              {car.policyCount} وثيقة
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
