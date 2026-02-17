import { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Sidebar } from "./Sidebar";
import { BottomToolbar } from "./BottomToolbar";
import { AnnouncementPopup } from "./AnnouncementPopup";
import { TaskPopupReminder } from "@/components/tasks/TaskPopupReminder";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface MainLayoutProps {
  children: ReactNode;
  onPolicyComplete?: () => void;
}

export function MainLayout({ children, onPolicyComplete }: MainLayoutProps) {
  const { data: settings } = useSiteSettings();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {settings && (
        <Helmet>
          <title>{settings.site_title}</title>
          <meta name="description" content={settings.site_description} />
          <meta property="og:title" content={settings.site_title} />
          <meta property="og:description" content={settings.site_description} />
          <meta name="twitter:title" content={settings.site_title} />
          <meta name="twitter:description" content={settings.site_description} />
          {settings.og_image_url && (
            <>
              <meta property="og:image" content={settings.og_image_url} />
              <meta name="twitter:image" content={settings.og_image_url} />
            </>
          )}
          {settings.favicon_url && (
            <link rel="icon" href={settings.favicon_url} />
          )}
        </Helmet>
      )}
      <Sidebar />

      {/* Main content - responsive margins */}
      {/* Mobile: full width with top padding for hamburger */}
      {/* Desktop: margin on right side for fixed sidebar */}
      {/* pb-40 to prevent content from being hidden behind sticky bottom toolbar */}
      <main className="min-h-screen transition-all duration-300 p-4 pt-16 md:pt-6 md:p-6 md:mr-64 pb-40">
        <div className="max-w-full">{children}</div>
      </main>

      {/* Sticky bottom toolbar */}
      <BottomToolbar onPolicyComplete={onPolicyComplete} />

      {/* Announcement popup */}
      <AnnouncementPopup />

      {/* Task reminder popup */}
      <TaskPopupReminder />
    </div>
  );
}