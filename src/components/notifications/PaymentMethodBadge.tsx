import { Badge } from '@/components/ui/badge';
import { PAYMENT_METHOD_LABELS, NotificationMetadata } from '@/hooks/useNotifications';
import { Banknote, CreditCard, FileText, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentMethodBadgeProps {
  method: NotificationMetadata['payment_method'];
  className?: string;
  showLabel?: boolean;
}

const PAYMENT_METHOD_ICONS = {
  cash: Banknote,
  cheque: FileText,
  visa: CreditCard,
  transfer: Building2,
};

const PAYMENT_METHOD_COLORS = {
  cash: 'bg-green-500/10 text-green-600 border-green-500/20',
  cheque: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  visa: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

export function PaymentMethodBadge({ method, className, showLabel = true }: PaymentMethodBadgeProps) {
  if (!method) return null;

  const Icon = PAYMENT_METHOD_ICONS[method] || Banknote;
  const label = PAYMENT_METHOD_LABELS[method] || method;
  const colorClass = PAYMENT_METHOD_COLORS[method] || 'bg-muted text-muted-foreground';

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-1 font-normal text-xs",
        colorClass,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{label}</span>}
    </Badge>
  );
}
