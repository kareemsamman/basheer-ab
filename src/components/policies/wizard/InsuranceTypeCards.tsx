import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, Car, AlertCircle, Route, Heart, Plane, Building, Briefcase, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsuranceCategory } from "./types";

interface InsuranceTypeCardsProps {
  categories: InsuranceCategory[];
  selectedCategory: InsuranceCategory | null;
  onSelect: (category: InsuranceCategory) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  'ELZAMI': <Shield className="h-7 w-7" />,
  'THIRD_FULL': <Car className="h-7 w-7" />,
  'ROAD_SERVICE': <Route className="h-7 w-7" />,
  'ACCIDENT_FEE_EXEMPTION': <AlertCircle className="h-7 w-7" />,
  'HEALTH': <Heart className="h-7 w-7" />,
  'TRAVEL': <Plane className="h-7 w-7" />,
  'PROPERTY': <Building className="h-7 w-7" />,
  'BUSINESS': <Briefcase className="h-7 w-7" />,
  'OTHER': <MoreHorizontal className="h-7 w-7" />,
};

// Enhanced color scheme with better visual hierarchy
const categoryStyles: Record<string, { bg: string; border: string; icon: string; selectedBorder: string }> = {
  'ELZAMI': { 
    bg: "bg-blue-50 dark:bg-blue-950/30", 
    border: "border-blue-200 dark:border-blue-800/50", 
    icon: "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400",
    selectedBorder: "border-blue-500"
  },
  'THIRD_FULL': { 
    bg: "bg-emerald-50 dark:bg-emerald-950/30", 
    border: "border-emerald-200 dark:border-emerald-800/50", 
    icon: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
    selectedBorder: "border-emerald-500"
  },
  'ROAD_SERVICE': { 
    bg: "bg-orange-50 dark:bg-orange-950/30", 
    border: "border-orange-200 dark:border-orange-800/50", 
    icon: "bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400",
    selectedBorder: "border-orange-500"
  },
  'ACCIDENT_FEE_EXEMPTION': { 
    bg: "bg-purple-50 dark:bg-purple-950/30", 
    border: "border-purple-200 dark:border-purple-800/50", 
    icon: "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400",
    selectedBorder: "border-purple-500"
  },
  'HEALTH': { 
    bg: "bg-rose-50 dark:bg-rose-950/30", 
    border: "border-rose-200 dark:border-rose-800/50", 
    icon: "bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400",
    selectedBorder: "border-rose-500"
  },
  'TRAVEL': { 
    bg: "bg-cyan-50 dark:bg-cyan-950/30", 
    border: "border-cyan-200 dark:border-cyan-800/50", 
    icon: "bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400",
    selectedBorder: "border-cyan-500"
  },
  'PROPERTY': { 
    bg: "bg-amber-50 dark:bg-amber-950/30", 
    border: "border-amber-200 dark:border-amber-800/50", 
    icon: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400",
    selectedBorder: "border-amber-500"
  },
  'BUSINESS': { 
    bg: "bg-indigo-50 dark:bg-indigo-950/30", 
    border: "border-indigo-200 dark:border-indigo-800/50", 
    icon: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400",
    selectedBorder: "border-indigo-500"
  },
  'LIFE': { 
    bg: "bg-slate-50 dark:bg-slate-950/30", 
    border: "border-slate-200 dark:border-slate-800/50", 
    icon: "bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400",
    selectedBorder: "border-slate-500"
  },
};

const defaultStyle = { 
  bg: "bg-muted/50", 
  border: "border-border", 
  icon: "bg-muted text-muted-foreground",
  selectedBorder: "border-primary"
};

export function InsuranceTypeCards({ categories, selectedCategory, onSelect }: InsuranceTypeCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {categories.map((category) => {
        const isSelected = selectedCategory?.id === category.id;
        const style = categoryStyles[category.slug] || defaultStyle;
        
        return (
          <Card
            key={category.id}
            onClick={() => onSelect(category)}
            className={cn(
              "relative p-5 cursor-pointer transition-all duration-200 border-2",
              "hover:shadow-lg hover:-translate-y-0.5",
              style.bg,
              isSelected ? style.selectedBorder : style.border,
              isSelected && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg -translate-y-0.5"
            )}
          >
            {isSelected && (
              <div className="absolute top-3 left-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md">
                <Check className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
            )}
            
            <div className="flex flex-col items-center text-center gap-3">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                isSelected ? "bg-primary/20 text-primary" : style.icon
              )}>
                {categoryIcons[category.slug] || <MoreHorizontal className="h-7 w-7" />}
              </div>
              
              <span className="font-semibold text-sm leading-tight">
                {category.name_ar || category.name}
              </span>
              
              {category.is_default && (
                <Badge variant="secondary" className="text-[10px] py-0.5 px-2">
                  افتراضي
                </Badge>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
