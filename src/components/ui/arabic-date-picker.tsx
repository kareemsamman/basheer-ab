import * as React from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const ARABIC_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

interface ArabicDatePickerProps {
  value?: string;
  onChange?: (date: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  /** For birthday fields - extends year range back to 1920 */
  isBirthDate?: boolean;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

// Parse DD/MM/YYYY or D/M/YYYY to Date object
function parseDateInput(input: string): Date | null {
  const cleaned = input.trim();
  // Support both DD/MM/YYYY and D/M/YYYY
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
  const year = parseInt(match[3], 10);
  
  // Validate ranges
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  
  const date = new Date(year, month, day);
  // Verify the date is valid (e.g., not Feb 30)
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    return null;
  }
  
  return date;
}

// Format Date to DD/MM/YYYY
function formatDateForInput(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function ArabicDatePicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  min,
  max,
  className,
  disabled,
  isBirthDate = false,
  compact = false,
}: ArabicDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(() => {
    if (value) return new Date(value);
    return new Date();
  });
  const [inputValue, setInputValue] = React.useState(() => formatDateForInput(value || ""));
  const [inputError, setInputError] = React.useState(false);

  // Sync viewDate and inputValue when value changes
  React.useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
      setInputValue(formatDateForInput(value));
      setInputError(false);
    } else {
      setInputValue("");
    }
  }, [value]);

  // When popover opens, ensure viewDate matches value
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && value) {
      setViewDate(new Date(value));
    }
    setOpen(isOpen);
  };

  const selectedDate = value ? new Date(value) : null;

  const minDate = min ? new Date(min) : null;
  const maxDate = max ? new Date(max) : null;

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  // Generate years range - for birth dates go back to 1920, otherwise ± 10 years
  const years = React.useMemo(() => {
    const current = new Date().getFullYear();
    const result: number[] = [];
    const startYear = isBirthDate ? 1920 : current - 10;
    const endYear = isBirthDate ? current : current + 10;
    for (let y = startYear; y <= endYear; y++) {
      result.push(y);
    }
    return result;
  }, [isBirthDate]);

  // Get days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday)
  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentYear, currentMonth);

  const handlePrevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleYearChange = (year: string) => {
    setViewDate(new Date(parseInt(year), currentMonth, 1));
  };

  const handleMonthChange = (month: string) => {
    setViewDate(new Date(currentYear, parseInt(month), 1));
  };

  const handleDayClick = (day: number) => {
    const newDate = new Date(currentYear, currentMonth, day);
    const dateStr = newDate.toISOString().split("T")[0];
    onChange?.(dateStr);
    setOpen(false);
  };

  const isDateDisabled = (day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  const isSelectedDay = (day: number) => {
    if (!selectedDate) return false;
    return (
      selectedDate.getFullYear() === currentYear &&
      selectedDate.getMonth() === currentMonth &&
      selectedDate.getDate() === day
    );
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getFullYear() === currentYear &&
      today.getMonth() === currentMonth &&
      today.getDate() === day
    );
  };

  const formatDisplayDate = () => {
    if (!selectedDate) return placeholder;
    const day = selectedDate.getDate();
    const month = ARABIC_MONTHS[selectedDate.getMonth()];
    const year = selectedDate.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Handle manual text input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    
    // Clear error while typing
    if (inputError) setInputError(false);
  };

  const handleInputBlur = () => {
    if (!inputValue.trim()) {
      // Allow clearing the value
      if (value) {
        onChange?.("");
      }
      setInputError(false);
      return;
    }
    
    const parsed = parseDateInput(inputValue);
    if (parsed) {
      // Check min/max constraints
      if (minDate && parsed < minDate) {
        setInputError(true);
        return;
      }
      if (maxDate && parsed > maxDate) {
        setInputError(true);
        return;
      }
      const dateStr = parsed.toISOString().split("T")[0];
      onChange?.(dateStr);
      setInputError(false);
    } else {
      setInputError(true);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputBlur();
    }
  };

  // Build calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  return (
    <div className={cn("flex gap-1 items-center", className)}>
      {/* Text Input for manual entry */}
      <Input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        placeholder="DD/MM/YYYY"
        disabled={disabled}
        dir="ltr"
        className={cn(
          "font-mono text-center ltr-nums",
          compact ? "h-8 text-xs w-[100px]" : "h-9 text-sm flex-1",
          inputError && "border-destructive focus-visible:ring-destructive"
        )}
      />
      
      {/* Calendar Popover */}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className={cn(compact ? "h-8 w-8" : "h-9 w-9", "shrink-0")}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start" dir="rtl">
          <div className="p-3 space-y-3">
            {/* Month/Year Header */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-2 flex-1 justify-center">
                <Select
                  value={currentMonth.toString()}
                  onValueChange={handleMonthChange}
                >
                  <SelectTrigger className="w-[110px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ARABIC_MONTHS.map((month, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={currentYear.toString()}
                  onValueChange={handleYearChange}
                >
                  <SelectTrigger className="w-[80px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1">
              {ARABIC_DAYS.map((day) => (
                <div
                  key={day}
                  className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => (
                <div key={idx} className="h-9 w-9 flex items-center justify-center">
                  {day !== null && (
                    <button
                      type="button"
                      onClick={() => handleDayClick(day)}
                      disabled={isDateDisabled(day)}
                      className={cn(
                        "h-9 w-9 rounded-md text-sm transition-colors",
                        "hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary",
                        isSelectedDay(day) &&
                          "bg-primary text-primary-foreground hover:bg-primary",
                        isToday(day) && !isSelectedDay(day) && "border border-primary",
                        isDateDisabled(day) &&
                          "opacity-30 cursor-not-allowed hover:bg-transparent"
                      )}
                    >
                      {day}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Today button */}
            <div className="border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-sm"
                onClick={() => {
                  const today = new Date();
                  setViewDate(today);
                  const dateStr = today.toISOString().split("T")[0];
                  onChange?.(dateStr);
                  setOpen(false);
                }}
              >
                اليوم
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
