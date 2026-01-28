import { useState } from "react";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Click2CallDialog } from "./Click2CallDialog";

interface ClickablePhoneProps {
  phone: string | null | undefined;
  className?: string;
  showIcon?: boolean;
}

export function ClickablePhone({
  phone,
  className,
  showIcon = true,
}: ClickablePhoneProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!phone) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer group",
          className
        )}
      >
        {showIcon && (
          <Phone className="h-3 w-3 group-hover:text-primary transition-colors" />
        )}
        <bdi className="group-hover:underline">{phone}</bdi>
      </button>

      <Click2CallDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        phoneNumber={phone}
      />
    </>
  );
}
