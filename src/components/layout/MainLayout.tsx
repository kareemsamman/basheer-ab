import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      
      {/* Main content - RTL: margin on right side */}
      <main className="mr-64 min-h-screen transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
