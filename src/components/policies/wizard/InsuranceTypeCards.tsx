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
  'ELZAMI': <Shield className="h-6 w-6" />,
  'THIRD_FULL': <Car className="h-6 w-6" />,
  'ROAD_SERVICE': <Route className="h-6 w-6" />,
  'ACCIDENT_FEE_EXEMPTION': <AlertCircle className="h-6 w-6" />,
  'HEALTH': <Heart className="h-6 w-6" />,
  'TRAVEL': <Plane className="h-6 w-6" />,
  'PROPERTY': <Building className="h-6 w-6" />,
  'BUSINESS': <Briefcase className="h-6 w-6" />,
  'OTHER': <MoreHorizontal className="h-6 w-6" />,
};

const categoryColors: Record<string, string> = {
  'ELZAMI': "from-blue-500/20 to-blue-500/5 border-blue-500/30 hover:border-blue-500",
  'THIRD_FULL': "from-purple-500/20 to-purple-500/5 border-purple-500/30 hover:border-purple-500",
  'ROAD_SERVICE': "from-orange-500/20 to-orange-500/5 border-orange-500/30 hover:border-orange-500",
  'ACCIDENT_FEE_EXEMPTION': "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 hover:border-emerald-500",
  'HEALTH': "from-rose-500/20 to-rose-500/5 border-rose-500/30 hover:border-rose-500",
  'TRAVEL': "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 hover:border-cyan-500",
  'PROPERTY': "from-amber-500/20 to-amber-500/5 border-amber-500/30 hover:border-amber-500",
  'BUSINESS': "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30 hover:border-indigo-500",
};

export function InsuranceTypeCards({ categories, selectedCategory, onSelect }: InsuranceTypeCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {categories.map((category) => {
        const isSelected = selectedCategory?.id === category.id;
        const colorClass = categoryColors[category.slug] || categoryColors['OTHER'] || "from-slate-500/20 to-slate-500/5 border-slate-500/30";
        
        return (
          <Card
            key={category.id}
            onClick={() => onSelect(category)}
            className={cn(
              "relative p-4 cursor-pointer transition-all duration-200 border-2",
              "bg-gradient-to-br hover:scale-[1.02] hover:shadow-md",
              colorClass,
              isSelected && "ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-lg"
            )}
          >
            {isSelected && (
              <div className="absolute top-2 left-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            
            <div className="flex flex-col items-center text-center gap-2">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {categoryIcons[category.slug] || <MoreHorizontal className="h-6 w-6" />}
              </div>
              
              <span className="font-medium text-sm leading-tight">
                {category.name_ar || category.name}
              </span>
              
              {category.is_default && (
                <Badge variant="secondary" className="text-[10px] py-0">
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
