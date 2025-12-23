import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Sidebar />
      
      {/* Main content - responsive margins */}
      {/* Mobile: full width with top padding for hamburger */}
      {/* Desktop: margin on right side for fixed sidebar */}
      <main className="min-h-screen transition-all duration-300 p-4 pt-16 md:pt-6 md:p-6 md:mr-64">
        <div className="max-w-full">
          {children}
        </div>
      </main>
    </div>
  );
}