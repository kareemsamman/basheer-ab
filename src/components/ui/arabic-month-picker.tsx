import * as React from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل",
  "مايو", "يونيو", "يوليو", "أغسطس",
  "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

interface ArabicMonthPickerProps {
  /** Value in YYYY-MM format */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ArabicMonthPicker({
  value,
  onChange,
  placeholder = "اختر الشهر",
  className,
  disabled,
}: ArabicMonthPickerProps) {
  const [open, setOpen] = React.useState(false);

  const currentDate = React.useMemo(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [value]);

  const [viewYear, setViewYear] = React.useState(currentDate.year);

  React.useEffect(() => {
    if (open) setViewYear(currentDate.year);
  }, [open, currentDate.year]);

  const handleSelect = (monthIndex: number) => {
    const m = String(monthIndex + 1).padStart(2, "0");
    onChange?.(`${viewYear}-${m}`);
    setOpen(false);
  };

  const displayText = React.useMemo(() => {
    if (!value) return placeholder;
    const [y, m] = value.split("-").map(Number);
    return `${ARABIC_MONTHS[m - 1]} ${y}`;
  }, [value, placeholder]);

  const now = new Date();
  const isCurrentMonth = (monthIndex: number) =>
    viewYear === now.getFullYear() && monthIndex === now.getMonth();

  const isSelected = (monthIndex: number) =>
    value !== undefined && viewYear === currentDate.year && monthIndex === currentDate.month;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-between gap-2 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" dir="rtl">
        <div className="p-3 space-y-3">
          {/* Year navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewYear(y => y + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold">{viewYear}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewYear(y => y - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-2">
            {ARABIC_MONTHS.map((month, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(idx)}
                className={cn(
                  "rounded-lg px-2 py-2.5 text-sm transition-all",
                  "hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary",
                  isSelected(idx) && "bg-primary text-primary-foreground hover:bg-primary",
                  isCurrentMonth(idx) && !isSelected(idx) && "border border-primary font-medium",
                )}
              >
                {month}
              </button>
            ))}
          </div>

          {/* Quick actions */}
          <div className="border-t pt-2 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                const m = String(now.getMonth() + 1).padStart(2, "0");
                onChange?.(`${now.getFullYear()}-${m}`);
                setOpen(false);
              }}
            >
              الشهر الحالي
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const m = String(prev.getMonth() + 1).padStart(2, "0");
                onChange?.(`${prev.getFullYear()}-${m}`);
                setOpen(false);
              }}
            >
              الشهر السابق
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
