import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomToolbar } from "./BottomToolbar";
import { RecentClientBubble } from "./RecentClientBubble";

interface MainLayoutProps {
  children: ReactNode;
  onPolicyComplete?: () => void;
}

export function MainLayout({ children, onPolicyComplete }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Sidebar />
      
      {/* Main content - responsive margins */}
      {/* Mobile: full width with top padding for hamburger */}
      {/* Desktop: margin on right side for fixed sidebar */}
      {/* pb-28 to prevent content from being hidden behind sticky bottom toolbar */}
      <main className="min-h-screen transition-all duration-300 p-4 pt-16 md:pt-6 md:p-6 md:mr-64 pb-28">
        <div className="max-w-full">
          {children}
        </div>
      </main>

      {/* Recent client quick-access bubble */}
      <RecentClientBubble />

      {/* Sticky bottom toolbar */}
      <BottomToolbar onPolicyComplete={onPolicyComplete} />
    </div>
  );
}