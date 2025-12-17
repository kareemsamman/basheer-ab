import { Bell, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 md:h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-3 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg md:text-xl font-semibold text-foreground truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Search - desktop only */}
        <div className="relative hidden lg:block">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث عن عميل أو وثيقة..."
            className="w-64 pr-9"
          />
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10">
          <Bell className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
          <Badge className="absolute -left-1 -top-1 h-4 w-4 md:h-5 md:w-5 rounded-full p-0 text-[9px] md:text-[10px]" variant="destructive">
            3
          </Badge>
        </Button>

        {/* Action button */}
        {action && (
          <Button onClick={action.onClick} size="sm" className="text-xs md:text-sm">
            <Plus className="h-3 w-3 md:h-4 md:w-4 ml-1 md:ml-2" />
            <span className="hidden sm:inline">{action.label}</span>
            <span className="sm:hidden">جديد</span>
          </Button>
        )}
      </div>
    </header>
  );
}
