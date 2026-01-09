import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, FileText, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { PolicyWizard } from "@/components/policies/PolicyWizard";
import { cn } from "@/lib/utils";
import { useRecentClient } from "@/hooks/useRecentClient";
import { BottomToolbarInlineSearch } from "./BottomToolbarInlineSearch";

interface BottomToolbarProps {
  onPolicyComplete?: () => void;
}

export function BottomToolbar({ onPolicyComplete }: BottomToolbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { recentClient, clearRecentClient } = useRecentClient();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCollapsed, setWizardCollapsed] = useState(false);

  const handleWizardOpenChange = (open: boolean) => {
    setWizardOpen(open);
    if (!open) {
      setWizardCollapsed(false);
    }
  };

  const showRecentClient =
    !!recentClient && location.pathname !== "/clients" && location.pathname !== "/login" && location.pathname !== "/no-access";

  return (
    <>
      {/* Sticky bottom toolbar with glassy style */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border/50 bg-background/80 backdrop-blur-xl shadow-lg">
          {/* Recent client quick access (appears after you open a client profile then go to another page) */}
          {showRecentClient && (
            <div className="flex items-center gap-1">
              <button
                className={cn(
                  "flex items-center gap-2 h-9 px-3 rounded-full border border-border/50",
                  "bg-secondary/40 hover:bg-secondary/60 transition-colors"
                )}
                onClick={() => navigate(`/clients?open=${recentClient.id}`)}
                title={`العودة لملف ${recentClient.name}`}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-xs">
                  {recentClient.initial}
                </div>
                <span className="hidden sm:inline text-sm font-medium max-w-28 truncate">
                  {recentClient.name}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9"
                onClick={clearRecentClient}
                aria-label="إخفاء ملف العميل"
                title="إخفاء"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
              <div className="h-6 w-px bg-border/50" />
            </div>
          )}

          {/* Show expand button when wizard is collapsed */}
          {wizardOpen && wizardCollapsed && (
            <>
              <Button
                onClick={() => setWizardCollapsed(false)}
                className="rounded-full gap-2 bg-primary"
                size="sm"
              >
                <ChevronUp className="h-4 w-4" />
                <span className="hidden sm:inline">إظهار النموذج</span>
              </Button>
              <div className="h-6 w-px bg-border/50" />
            </>
          )}

          {/* Create Insurance Button */}
          <Button
            onClick={() => {
              if (wizardOpen && wizardCollapsed) {
                setWizardCollapsed(false);
              } else {
                setWizardOpen(true);
              }
            }}
            className={cn("rounded-full gap-2", wizardOpen && wizardCollapsed && "hidden")}
            size="sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">وثيقة جديدة</span>
            <FileText className="h-4 w-4 sm:hidden" />
          </Button>

          {/* Separator */}
          <div className="h-6 w-px bg-border/50" />

          {/* Inline search (dropdown above the input) */}
          <BottomToolbarInlineSearch />

          {/* Separator */}
          <div className="h-6 w-px bg-border/50" />

          {/* Notifications */}
          <NotificationsDropdown />
        </div>
      </div>

      {/* Policy Wizard */}
      <PolicyWizard
        open={wizardOpen}
        onOpenChange={handleWizardOpenChange}
        onComplete={() => {
          onPolicyComplete?.();
        }}
        isCollapsed={wizardCollapsed}
        onCollapsedChange={setWizardCollapsed}
      />
    </>
  );
}
