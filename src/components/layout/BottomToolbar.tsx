import { useState } from "react";
import { Plus, FileText, Search, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { PolicyWizard } from "@/components/policies/PolicyWizard";
import { GlobalPolicySearch } from "./GlobalPolicySearch";
import { cn } from "@/lib/utils";

interface BottomToolbarProps {
  onPolicyComplete?: () => void;
}

export function BottomToolbar({ onPolicyComplete }: BottomToolbarProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCollapsed, setWizardCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleWizardOpenChange = (open: boolean) => {
    setWizardOpen(open);
    if (!open) {
      setWizardCollapsed(false);
    }
  };

  return (
    <>
      {/* Sticky bottom toolbar with glassy style */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border/50 bg-background/80 backdrop-blur-xl shadow-lg">
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
            className={cn(
              "rounded-full gap-2",
              wizardOpen && wizardCollapsed && "hidden"
            )}
            size="sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">وثيقة جديدة</span>
            <FileText className="h-4 w-4 sm:hidden" />
          </Button>

          {/* Separator */}
          <div className="h-6 w-px bg-border/50" />

          {/* Search Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full h-9 w-9"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>

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

      {/* Global Search Dialog */}
      <GlobalPolicySearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
