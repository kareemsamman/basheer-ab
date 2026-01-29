import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Car,
  FileText,
  Building2,
  UserCog,
  Bell,
  BarChart3,
  Settings,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Wallet,
  CreditCard,
  Loader2,
  Image,
  Menu,
  X,
  MessageSquare,
  FileSignature,
  Upload,
  DollarSign,
  History,
  Truck,
  Shield,
  Megaphone,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNotificationBadge } from "./SidebarNotificationBadge";

// Navigation items - some are admin-only
const getNavigation = (isAdmin: boolean) => {
  const baseNav = [
    { name: "لوحة التحكم", href: "/", icon: LayoutDashboard },
    { name: "العملاء", href: "/clients", icon: Users },
    { name: "السيارات", href: "/cars", icon: Car },
    { name: "الوثائق", href: "/policies", icon: FileText },
    { name: "الشيكات", href: "/cheques", icon: CreditCard },
    { name: "بلاغات الحوادث", href: "/accidents", icon: AlertTriangle },
    { name: "متابعة الديون", href: "/debt-tracking", icon: DollarSign },
    { name: "الوسائط", href: "/media", icon: Image },
    { name: "التنبيهات", href: "/notifications", icon: Bell },
    { name: "تقارير الوثائق", href: "/reports/policies", icon: BarChart3 },
  ];

  // Admin-only items in main navigation
  if (isAdmin) {
    baseNav.splice(4, 0, { name: "شركات التأمين", href: "/companies", icon: Building2 });
    baseNav.splice(6, 0, { name: "الوسطاء", href: "/brokers", icon: Wallet });
    baseNav.push(
      { name: "تقرير الشركات", href: "/reports/company-settlement", icon: BarChart3 },
      { name: "التقارير المالية", href: "/reports/financial", icon: Wallet },
      { name: "المصاريف", href: "/expenses", icon: DollarSign }
    );
  }

  return baseNav;
};

// Admin-only navigation section
const adminNav = [
  { name: "المستخدمون", href: "/admin/users", icon: UserCog },
  { name: "SMS تسويقية", href: "/admin/marketing-sms", icon: Megaphone },
  { name: "أنواع التأمين", href: "/admin/insurance-categories", icon: FileText },
  { name: "خدمات الطريق", href: "/admin/road-services", icon: Truck },
  { name: "إعفاء رسوم الحادث", href: "/admin/accident-fee-services", icon: Shield },
  { name: "قوالب الفواتير", href: "/admin/invoice-templates", icon: FileText },
  { name: "توقيعات العملاء", href: "/admin/customer-signatures", icon: FileSignature },
  { name: "إعدادات الدفع", href: "/admin/payment-settings", icon: CreditCard },
  { name: "إعدادات SMS", href: "/admin/sms-settings", icon: MessageSquare },
  { name: "إعدادات المصادقة", href: "/admin/auth-settings", icon: Settings },
  { name: "سجل الرسائل", href: "/sms-history", icon: History },
  { name: "استيراد WordPress", href: "/admin/wordpress-import", icon: Upload },
];

const SUPER_ADMIN_EMAIL = "morshed500@gmail.com";

function SidebarContent({ collapsed, onCollapse, onNavigate }: { 
  collapsed: boolean; 
  onCollapse?: (val: boolean) => void;
  onNavigate?: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, isAdmin, branchName } = useAuth();

  const isSuperAdmin = profile?.email === SUPER_ADMIN_EMAIL;

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleNavClick = () => {
    onNavigate?.();
  };

  const userName = profile?.full_name || profile?.email?.split('@')[0] || 'مستخدم';
  const userInitial = userName.charAt(0);
  const userRole = isAdmin ? 'مدير' : 'موظف';
  const userBranch = branchName;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">AB</span>
            </div>
            <span className="text-base font-semibold text-sidebar-foreground">
              AB تأمين
            </span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">AB</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
        <div className="mb-2">
          {!collapsed && (
            <span className="px-3 text-xs font-medium text-muted-foreground">
              القائمة الرئيسية
            </span>
          )}
        </div>
        {getNavigation(isAdmin).map((item) => {
          const isActiveRoute = location.pathname === item.href;
          const isNotifications = item.href === '/notifications';
          return (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={handleNavClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 relative",
                isActiveRoute
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className={cn("h-5 w-5 flex-shrink-0", isActiveRoute && "text-primary")} />
              {!collapsed && <span>{item.name}</span>}
              {isNotifications && <SidebarNotificationBadge collapsed={collapsed} />}
            </NavLink>
          );
        })}

        {/* Admin section - only visible to admins */}
        {isAdmin && (
          <>
            <div className="my-4 border-t border-sidebar-border" />

            <div className="mb-2">
              {!collapsed && (
                <span className="px-3 text-xs font-medium text-muted-foreground">
                  الإدارة
                </span>
              )}
            </div>
            {adminNav.map((item) => {
              const isActiveRoute = location.pathname === item.href;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActiveRoute
                      ? "bg-primary/10 text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 flex-shrink-0", isActiveRoute && "text-primary")} />
                  {!collapsed && <span>{item.name}</span>}
                </NavLink>
              );
            })}

            {/* Super admin only - Announcements */}
            {isSuperAdmin && (
              <NavLink
                to="/admin/announcements"
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  location.pathname === "/admin/announcements"
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <Megaphone className={cn("h-5 w-5 flex-shrink-0", location.pathname === "/admin/announcements" && "text-primary")} />
                {!collapsed && <span>إعلانات النظام</span>}
              </NavLink>
            )}
          </>
        )}
      </nav>

      {/* Collapse toggle - only on desktop */}
      {onCollapse && (
        <div className="px-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapse(!collapsed)}
            className={cn(
              "w-full justify-center text-muted-foreground hover:text-foreground",
              collapsed && "px-2"
            )}
          >
            {collapsed ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="mr-2">تصغير</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <span className="text-sm font-medium text-primary">{userInitial}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {userName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {userRole}{userBranch ? ` • ${userBranch}` : ''}
              </p>
            </div>
          )}
          {!collapsed && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      {/* Mobile hamburger button - fixed top right */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 right-4 z-50 md:hidden bg-background shadow-md"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent 
          side="right" 
          className="w-64 p-0 bg-sidebar border-l border-sidebar-border"
        >
          <SidebarContent 
            collapsed={false} 
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar - hidden on mobile */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-40 h-screen border-l border-sidebar-border bg-sidebar transition-all duration-300 shadow-sm hidden md:block",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent 
          collapsed={collapsed} 
          onCollapse={setCollapsed}
        />
      </aside>
    </>
  );
}

// Export for MainLayout to know sidebar width
export function useSidebarWidth() {
  // This is a simple hook - could be enhanced with context for collapsed state
  return { desktop: 256, collapsed: 64 }; // 64 = w-64 = 16rem = 256px, w-16 = 64px
}