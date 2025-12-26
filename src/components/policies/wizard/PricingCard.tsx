import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PricingBreakdown } from "./types";

interface PricingCardProps {
  pricing: PricingBreakdown;
  showAddons?: boolean;
  className?: string;
}

export function PricingCard({ pricing, showAddons = true, className }: PricingCardProps) {
  const hasAddons = pricing.roadServicePrice > 0 || pricing.accidentFeePrice > 0;
  
  return (
    <Card className={cn(
      "p-4 border-2",
      hasAddons ? "border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" : "bg-muted/30",
      className
    )}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          {hasAddons && <Package className="h-4 w-4 text-primary" />}
          تفاصيل السعر
        </h4>
        {hasAddons && (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            باقة
          </Badge>
        )}
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">السعر الأساسي:</span>
          <span className="font-medium">₪{pricing.basePrice.toLocaleString()}</span>
        </div>
        
        {showAddons && pricing.roadServicePrice > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>+ خدمات الطريق:</span>
            <span>₪{pricing.roadServicePrice.toLocaleString()}</span>
          </div>
        )}
        
        {showAddons && pricing.accidentFeePrice > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>+ إعفاء رسوم حادث:</span>
            <span>₪{pricing.accidentFeePrice.toLocaleString()}</span>
          </div>
        )}
        
        <div className="flex justify-between pt-2 border-t font-semibold text-lg">
          <span>الإجمالي:</span>
          <span className="text-primary">₪{pricing.totalPrice.toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}
